"use strict";

const fs = require("fs/promises");
const path = require("path");
const { z } = require("zod");
const { toToolResponse } = require("./tool-helpers");

const MCP_AGENT_ID = "mcp-client";
const MCP_AUTH_LEVEL = 1;

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
}

module.exports = {
  resolveProjectPath,
  listProjectFiles,
  readProjectFile,
  registerFilesystemTools,
};
