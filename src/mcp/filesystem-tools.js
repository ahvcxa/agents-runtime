"use strict";

const fs = require("fs/promises");
const path = require("path");
const { z } = require("zod");
const { toToolResponse } = require("./tool-helpers");

const MCP_AGENT_ID = "mcp-client";
const MCP_AUTH_LEVEL = 1;
const MCP_WRITE_AUTH_LEVEL = 2;
const MAX_WRITE_BYTES = 1024 * 1024; // 1MB safety limit per write

const WRITE_MODES = {
  OFF: "off",
  SAFE: "safe",
  FULL: "full",
};

function getWriteMode() {
  const raw = String(process.env.MCP_WRITE_MODE || WRITE_MODES.OFF).trim().toLowerCase();
  if (raw === WRITE_MODES.SAFE || raw === WRITE_MODES.FULL) return raw;
  return WRITE_MODES.OFF;
}

function resolveProjectPath(projectRoot, requestedPath = ".") {
  const base = path.resolve(projectRoot);
  const candidate = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(base, requestedPath);

  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Path is outside project root: ${requestedPath}`);
  }
  return candidate;
}

function toRelative(projectRoot, absolutePath) {
  const rel = path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
  return rel.length === 0 ? "." : rel;
}

function ensureConfirmed(confirm, operation) {
  if (confirm !== true) {
    throw new Error(`${operation} requires confirm=true`);
  }
}

function assertModeAllows(writeMode, operation) {
  if (writeMode === WRITE_MODES.OFF) {
    throw new Error(`Write tools are disabled (MCP_WRITE_MODE=off). Set MCP_WRITE_MODE=safe or full.`);
  }
  if (operation === "delete" && writeMode !== WRITE_MODES.FULL) {
    throw new Error(`delete_project_path requires MCP_WRITE_MODE=full`);
  }
}

async function canReadPath(runtime, absolutePath) {
  try {
    await runtime.checkFileAccess({
      agent_id: MCP_AGENT_ID,
      file_path: absolutePath,
      auth_level: MCP_AUTH_LEVEL,
    });
    return true;
  } catch {
    return false;
  }
}

async function assertWritePath(runtime, absolutePath) {
  try {
    const checks = await runtime.checkFileAccess({
      agent_id: MCP_AGENT_ID,
      file_path: absolutePath,
      auth_level: MCP_WRITE_AUTH_LEVEL,
    });

    const denied = checks.find((entry) => entry?.error);
    if (denied) {
      throw new Error(`Access denied by pre-read hook: ${absolutePath}`);
    }
  } catch {
    throw new Error(`Access denied by pre-read hook: ${absolutePath}`);
  }
}

async function listProjectFiles(runtime, projectRoot, options = {}) {
  const {
    targetPath = ".",
    recursive = false,
    includeHidden = false,
    maxEntries = 200,
  } = options;

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = resolveProjectPath(resolvedRoot, targetPath);
  const stat = await fs.stat(resolvedTarget);

  if (!(await canReadPath(runtime, resolvedTarget))) {
    throw new Error(`Access denied by pre-read hook: ${targetPath}`);
  }

  const entries = [];
  const skipped = [];
  const queue = [resolvedTarget];

  while (queue.length > 0 && entries.length < maxEntries) {
    const current = queue.shift();
    const currentStat = await fs.stat(current);
    const currentRelative = toRelative(resolvedRoot, current);

    if (current !== resolvedTarget) {
      entries.push({
        path: currentRelative,
        type: currentStat.isDirectory() ? "directory" : "file",
      });
      if (entries.length >= maxEntries) break;
    }

    if (!currentStat.isDirectory()) {
      continue;
    }

    const dirents = await fs.readdir(current, { withFileTypes: true });
    dirents.sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of dirents) {
      if (!includeHidden && dirent.name.startsWith(".")) {
        continue;
      }

      const child = path.join(current, dirent.name);
      if (!(await canReadPath(runtime, child))) {
        skipped.push(toRelative(resolvedRoot, child));
        continue;
      }

      if (recursive && dirent.isDirectory()) {
        queue.push(child);
      } else {
        entries.push({
          path: toRelative(resolvedRoot, child),
          type: dirent.isDirectory() ? "directory" : "file",
        });
      }

      if (entries.length >= maxEntries) break;
    }
  }

  if (!stat.isDirectory() && entries.length === 0) {
    entries.push({
      path: toRelative(resolvedRoot, resolvedTarget),
      type: "file",
    });
  }

  return {
    target: toRelative(resolvedRoot, resolvedTarget),
    entries,
    truncated: entries.length >= maxEntries,
    skipped_count: skipped.length,
  };
}

async function readProjectFile(runtime, projectRoot, options = {}) {
  const {
    targetPath,
    offset = 1,
    limit = 200,
  } = options;

  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("target_path is required");
  }

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = resolveProjectPath(resolvedRoot, targetPath);
  const stat = await fs.stat(resolvedTarget);

  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${targetPath}`);
  }

  if (!(await canReadPath(runtime, resolvedTarget))) {
    throw new Error(`Access denied by pre-read hook: ${targetPath}`);
  }

  const content = await fs.readFile(resolvedTarget, "utf8");
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, offset);
  const end = Math.min(lines.length, start + Math.max(1, limit) - 1);

  const numbered = [];
  for (let i = start; i <= end; i++) {
    numbered.push(`${i}: ${lines[i - 1] ?? ""}`);
  }

  return {
    path: toRelative(resolvedRoot, resolvedTarget),
    total_lines: lines.length,
    offset: start,
    limit: Math.max(1, limit),
    content: numbered.join("\n"),
    truncated: end < lines.length,
  };
}

async function writeProjectFile(runtime, projectRoot, options = {}) {
  const {
    targetPath,
    content,
    createIfMissing = false,
    overwrite = true,
    createParents = false,
  } = options;

  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("target_path is required");
  }
  if (typeof content !== "string") {
    throw new Error("content must be a string");
  }
  if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
    throw new Error(`content too large (max ${MAX_WRITE_BYTES} bytes)`);
  }

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = resolveProjectPath(resolvedRoot, targetPath);

  await assertWritePath(runtime, resolvedTarget);

  let exists = true;
  let stat;
  try {
    stat = await fs.stat(resolvedTarget);
  } catch {
    exists = false;
  }

  if (exists && stat?.isDirectory()) {
    throw new Error(`Path is a directory: ${targetPath}`);
  }
  if (!exists && !createIfMissing) {
    throw new Error(`File does not exist: ${targetPath}. Set create_if_missing=true to create.`);
  }
  if (exists && !overwrite) {
    throw new Error(`File exists: ${targetPath}. Set overwrite=true to replace.`);
  }

  const parentDir = path.dirname(resolvedTarget);
  if (createParents) {
    await fs.mkdir(parentDir, { recursive: true });
  }

  await fs.writeFile(resolvedTarget, content, "utf8");
  return {
    path: toRelative(resolvedRoot, resolvedTarget),
    bytes_written: Buffer.byteLength(content, "utf8"),
    created: !exists,
  };
}

function parseUnifiedDiff(patchText) {
  const lines = String(patchText || "").split(/\r?\n/);
  const files = [];
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("--- ")) {
      i++;
      continue;
    }

    const oldPathRaw = lines[i].slice(4).trim();
    i++;
    if (i >= lines.length || !lines[i].startsWith("+++ ")) {
      throw new Error("Invalid patch: missing +++ header");
    }
    const newPathRaw = lines[i].slice(4).trim();
    i++;

    const hunks = [];
    while (i < lines.length && !lines[i].startsWith("--- ")) {
      const header = lines[i];
      if (!header.startsWith("@@ ")) {
        i++;
        continue;
      }
      const m = header.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!m) throw new Error(`Invalid hunk header: ${header}`);

      const oldStart = Number(m[1]);
      i++;
      const hunkLines = [];
      while (i < lines.length && !lines[i].startsWith("@@ ") && !lines[i].startsWith("--- ")) {
        const line = lines[i];
        if (line.length === 0) {
          hunkLines.push(" ");
          i++;
          continue;
        }
        if (line.startsWith("\\ No newline at end of file")) {
          i++;
          continue;
        }
        const p = line[0];
        if (p !== " " && p !== "+" && p !== "-") {
          throw new Error(`Invalid patch line: ${line}`);
        }
        hunkLines.push(line);
        i++;
      }
      hunks.push({ oldStart, lines: hunkLines });
    }

    files.push({ oldPathRaw, newPathRaw, hunks });
  }

  if (files.length === 0) {
    throw new Error("Patch did not contain file headers");
  }
  return files;
}

function normalizePatchPath(rawPath) {
  if (!rawPath || rawPath === "/dev/null") return null;
  return rawPath.replace(/^a\//, "").replace(/^b\//, "");
}

async function applyProjectPatch(runtime, projectRoot, options = {}) {
  const { patchText } = options;
  if (!patchText || typeof patchText !== "string") {
    throw new Error("patch_text is required");
  }

  const resolvedRoot = path.resolve(projectRoot);
  const parsedFiles = parseUnifiedDiff(patchText);
  const modified = [];

  for (const filePatch of parsedFiles) {
    const oldPath = normalizePatchPath(filePatch.oldPathRaw);
    const newPath = normalizePatchPath(filePatch.newPathRaw);
    if (!oldPath || !newPath || oldPath !== newPath) {
      throw new Error("Only in-place file patches are supported");
    }

    const absPath = resolveProjectPath(resolvedRoot, newPath);
    await assertWritePath(runtime, absPath);

    const original = await fs.readFile(absPath, "utf8");
    const hasTrailingNewline = original.endsWith("\n");
    const lines = original.split(/\r?\n/);
    if (hasTrailingNewline) lines.pop();

    let delta = 0;
    for (const hunk of filePatch.hunks) {
      let cursor = hunk.oldStart - 1 + delta;
      for (const line of hunk.lines) {
        const prefix = line[0];
        const body = line.slice(1);
        if (prefix === " ") {
          if (lines[cursor] !== body) {
            throw new Error(`Patch context mismatch at ${newPath}:${cursor + 1}`);
          }
          cursor++;
          continue;
        }
        if (prefix === "-") {
          if (lines[cursor] !== body) {
            throw new Error(`Patch deletion mismatch at ${newPath}:${cursor + 1}`);
          }
          lines.splice(cursor, 1);
          delta -= 1;
          continue;
        }
        lines.splice(cursor, 0, body);
        cursor++;
        delta += 1;
      }
    }

    const updated = `${lines.join("\n")}${hasTrailingNewline ? "\n" : ""}`;
    await fs.writeFile(absPath, updated, "utf8");
    modified.push(toRelative(resolvedRoot, absPath));
  }

  return { modified_files: modified, file_count: modified.length };
}

async function deleteProjectPath(runtime, projectRoot, options = {}) {
  const {
    targetPath,
    recursive = false,
  } = options;

  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("target_path is required");
  }

  const resolvedRoot = path.resolve(projectRoot);
  const absolute = resolveProjectPath(resolvedRoot, targetPath);

  if (absolute === resolvedRoot) {
    throw new Error("Deleting project root is not allowed");
  }

  await assertWritePath(runtime, absolute);

  const stat = await fs.stat(absolute);
  if (stat.isDirectory() && !recursive) {
    throw new Error(`Directory deletion requires recursive=true: ${targetPath}`);
  }

  if (stat.isDirectory()) {
    await fs.rm(absolute, { recursive: true, force: false });
  } else {
    await fs.unlink(absolute);
  }

  return {
    path: toRelative(resolvedRoot, absolute),
    type: stat.isDirectory() ? "directory" : "file",
    deleted: true,
  };
}

function registerFilesystemTools(server, getRuntime, projectRoot) {
  server.tool(
    "list_project_files",
    [
      "Lists files/directories under the configured project root.",
      "Respects security pre-read hook and forbidden file patterns.",
      "Useful for browsing a local project before running code_analysis/security_audit.",
    ].join(" "),
    {
      target_path: z.string().optional().default(".").describe("Relative or absolute path under project root."),
      recursive: z.boolean().optional().default(false).describe("If true, recursively walks directories."),
      include_hidden: z.boolean().optional().default(false).describe("If true, includes hidden files and directories."),
      max_entries: z.number().int().min(1).max(2000).optional().default(200).describe("Maximum number of results returned."),
      stream: z.boolean().optional().default(false),
    },
    async ({ target_path, recursive, include_hidden, max_entries, stream }) => {
      try {
        const rt = await getRuntime();
        const result = await listProjectFiles(rt, projectRoot, {
          targetPath: target_path,
          recursive,
          includeHidden: include_hidden,
          maxEntries: max_entries,
        });

        const lines = [
          `📁 Target: ${result.target}`,
          `📊 Entries: ${result.entries.length}${result.truncated ? " (truncated)" : ""}`,
          `🛡️ Skipped by security hook: ${result.skipped_count}`,
          "",
          ...result.entries.map((entry) => `${entry.type === "directory" ? "📂" : "📄"} ${entry.path}`),
        ];

        return toToolResponse(lines.join("\n"), stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "read_project_file",
    [
      "Reads a text file under the configured project root.",
      "Respects security pre-read hook and forbidden file patterns.",
      "Supports line-based pagination with offset/limit.",
    ].join(" "),
    {
      target_path: z.string().describe("Relative or absolute file path under project root."),
      offset: z.number().int().min(1).optional().default(1).describe("1-based line offset."),
      limit: z.number().int().min(1).max(2000).optional().default(200).describe("Maximum number of lines to return."),
      stream: z.boolean().optional().default(false),
    },
    async ({ target_path, offset, limit, stream }) => {
      try {
        const rt = await getRuntime();
        const result = await readProjectFile(rt, projectRoot, {
          targetPath: target_path,
          offset,
          limit,
        });

        const text = [
          `📄 File: ${result.path}`,
          `📏 Lines: ${result.total_lines}`,
          `🧭 Window: offset=${result.offset}, limit=${result.limit}${result.truncated ? " (truncated)" : ""}`,
          "",
          result.content,
        ].join("\n");

        return toToolResponse(text, stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "write_project_file",
    [
      "Writes a text file under the configured project root.",
      "Requires confirm=true and MCP_WRITE_MODE=safe|full.",
      "Respects security path checks and forbidden file patterns.",
    ].join(" "),
    {
      target_path: z.string().describe("Relative or absolute file path under project root."),
      content: z.string().describe("Full text content to write."),
      create_if_missing: z.boolean().optional().default(false),
      overwrite: z.boolean().optional().default(true),
      create_parents: z.boolean().optional().default(false),
      confirm: z.boolean().optional().default(false),
      stream: z.boolean().optional().default(false),
    },
    async ({ target_path, content, create_if_missing, overwrite, create_parents, confirm, stream }) => {
      try {
        const mode = getWriteMode();
        assertModeAllows(mode, "write");
        ensureConfirmed(confirm, "write_project_file");

        const rt = await getRuntime();
        const result = await writeProjectFile(rt, projectRoot, {
          targetPath: target_path,
          content,
          createIfMissing: create_if_missing,
          overwrite,
          createParents: create_parents,
        });

        return toToolResponse(
          `✅ File written (${mode} mode)\n📄 ${result.path}\n📦 ${result.bytes_written} bytes\n🆕 created=${result.created}`,
          stream
        );
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "apply_project_patch",
    [
      "Applies a unified diff patch to files under project root.",
      "Requires confirm=true and MCP_WRITE_MODE=safe|full.",
      "Supports in-place file modifications only.",
    ].join(" "),
    {
      patch_text: z.string().describe("Unified diff patch text."),
      confirm: z.boolean().optional().default(false),
      stream: z.boolean().optional().default(false),
    },
    async ({ patch_text, confirm, stream }) => {
      try {
        const mode = getWriteMode();
        assertModeAllows(mode, "patch");
        ensureConfirmed(confirm, "apply_project_patch");

        const rt = await getRuntime();
        const result = await applyProjectPatch(rt, projectRoot, { patchText: patch_text });

        return toToolResponse(
          `✅ Patch applied (${mode} mode)\n📁 files=${result.file_count}\n${result.modified_files.map((f) => `- ${f}`).join("\n")}`,
          stream
        );
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "delete_project_path",
    [
      "Deletes a file or directory under project root.",
      "Requires confirm=true and MCP_WRITE_MODE=full.",
      "Directory deletion requires recursive=true.",
    ].join(" "),
    {
      target_path: z.string().describe("Relative or absolute path under project root."),
      recursive: z.boolean().optional().default(false),
      confirm: z.boolean().optional().default(false),
      stream: z.boolean().optional().default(false),
    },
    async ({ target_path, recursive, confirm, stream }) => {
      try {
        const mode = getWriteMode();
        assertModeAllows(mode, "delete");
        ensureConfirmed(confirm, "delete_project_path");

        const rt = await getRuntime();
        const result = await deleteProjectPath(rt, projectRoot, {
          targetPath: target_path,
          recursive,
        });

        return toToolResponse(
          `✅ Path deleted (${mode} mode)\n🗑️ ${result.path}\n📦 type=${result.type}`,
          stream
        );
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );
}

module.exports = {
  resolveProjectPath,
  getWriteMode,
  listProjectFiles,
  readProjectFile,
  writeProjectFile,
  applyProjectPatch,
  deleteProjectPath,
  registerFilesystemTools,
};
