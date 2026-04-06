"use strict";
/**
 * .agents/skills/refactor/handler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Refactor skill handler.
 * Consumes findings where auto_fixable: true (or provided directly in input)
 * and generates unified diff patches in standard format.
 *
 * Requires authorization_level >= 2 (Executor).
 *
 * @param {object} ctx
 * @param {string}   ctx.agentId
 * @param {number}   ctx.authLevel
 * @param {object}   ctx.input
 *   @param {Finding[]} [ctx.input.findings]            - Findings to patch (or reads from memory)
 *   @param {string}    [ctx.input.project_root]
 *   @param {boolean}   [ctx.input.dry_run]             - Default: true (safety first)
 * @param {object}   ctx.memory
 * @param {Function} ctx.log
 * @returns {Promise<{ patches: Patch[], summary: object }>}
 */

const fs   = require("fs");
const path = require("path");

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Unified diff generator ───────────────────────────────────────────────────
/**
 * Generate a minimal unified diff string from old/new content arrays.
 * @param {string[]} oldLines
 * @param {string[]} newLines
 * @param {string}   filePath
 * @returns {string}
 */
function generateUnifiedDiff(oldLines, newLines, filePath) {
  const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
  const hunks   = [];
  let i = 0, j = 0;

  while (i < oldLines.length || j < newLines.length) {
    // Find next divergence
    while (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++; j++;
    }
    if (i >= oldLines.length && j >= newLines.length) break;

    // Collect hunk
    const hunkOldStart = i + 1;
    const hunkNewStart = j + 1;
    const hunkLines    = [];

    // Context lines before (up to 3)
    const ctxBefore = Math.min(3, hunkOldStart - 1);
    for (let c = ctxBefore; c > 0; c--) hunkLines.push(` ${oldLines[i - c]}`);

    // Changed lines
    let deletions = 0, additions = 0;
    while (i < oldLines.length && j < newLines.length && oldLines[i] !== newLines[j]) {
      hunkLines.push(`-${oldLines[i++]}`); deletions++;
      hunkLines.push(`+${newLines[j++]}`); additions++;
    }
    while (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
      hunkLines.push(`-${oldLines[i++]}`); deletions++;
    }
    while (j < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[j])) {
      hunkLines.push(`+${newLines[j++]}`); additions++;
    }

    // Context lines after (up to 3)
    for (let c = 0; c < 3 && i < oldLines.length; c++) hunkLines.push(` ${oldLines[i++]}`);

    const hunkHeader = `@@ -${hunkOldStart},${deletions + ctxBefore} +${hunkNewStart},${additions + ctxBefore} @@`;
    hunks.push(`${hunkHeader}\n${hunkLines.join("\n")}`);
  }

  return hunks.length > 0 ? `${header}${hunks.join("\n")}` : "";
}

// ─── Patch generators per principle ─────────────────────────────────────────

/**
 * Generate a patch for a magic-number DRY finding.
 * Extracts the number to a const at the top of the file.
 */
function patchMagicNumber(finding, lines) {
  const numMatch = finding.message.match(/Magic number '(\d+)'/);
  if (!numMatch) return null;

  const val = numMatch[1];
  const constName = `CONSTANT_${val}`;
  const newLines  = [...lines];

  // Insert const after the last "use strict" / require block (or at top)
  let insertAt = 0;
  for (let i = 0; i < Math.min(20, newLines.length); i++) {
    if (/^(?:['"]use strict['"]|const|let|var|\/\/)/.test(newLines[i].trim())) insertAt = i + 1;
  }

  newLines.splice(insertAt, 0, `const ${constName} = ${val}; // Extracted by refactor skill`);

  // Replace all occurrences of the bare number
  for (let i = insertAt + 1; i < newLines.length; i++) {
    newLines[i] = newLines[i].replace(new RegExp(`(?<![.\\w])${val}(?![.\\w])`, "g"), constName);
  }

  return { newLines, constName };
}

/**
 * Generate a patch for empty catch blocks — add a minimal log statement.
 */
function patchEmptyCatch(finding, lines) {
  const lineIdx = finding.line_start - 1;
  const newLines = [...lines];
  const catchLine = newLines[lineIdx];

  // Match `catch (e) {}` pattern — insert a log statement inside
  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(catchLine)) {
    const varMatch = catchLine.match(/catch\s*\(([^)]+)\)/);
    const errVar   = varMatch ? varMatch[1].trim() : "err";
    newLines[lineIdx] = catchLine.replace(
      /\{\s*\}/,
      `{\n  // TODO: Handle or log this error properly\n  console.error('[unhandled]', ${errVar});\n}`
    );
    return { newLines };
  }
  return null;
}

// ─── Finding → patch dispatcher ──────────────────────────────────────────────
function generatePatchForFinding(finding, projectRoot) {
  if (!finding.auto_fixable) return null;

  const absPath = path.isAbsolute(finding.file)
    ? finding.file
    : path.join(projectRoot, finding.file);

  if (!fs.existsSync(absPath)) return null;

  const content  = fs.readFileSync(absPath, "utf8");
  const lines    = content.split("\n");
  let patchResult = null;

  // Dispatch by principle + message pattern
  if (finding.principle === "DRY" && finding.message.includes("Magic number")) {
    patchResult = patchMagicNumber(finding, lines);
  } else if (finding.message.includes("Empty catch block")) {
    patchResult = patchEmptyCatch(finding, lines);
  }

  if (!patchResult) return null;

  const diff = generateUnifiedDiff(lines, patchResult.newLines, finding.file);
  if (!diff) return null;

  return {
    id:               uuid(),
    finding_id:       finding.id,
    skill:            "refactor",
    status:           "proposed",
    diff,
    files_modified:   [finding.file],
    behavior_change:  false,
    created_at:       new Date().toISOString(),
    approved_by:      null,
    _note:            `Patch generated for: ${finding.suppression_key}`,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
async function execute({ agentId, authLevel, input, memory, log }) {
  const rootDir = input?.project_root ?? process.cwd();
  const dryRun  = input?.dry_run !== false; // Default: true — don't auto-apply

  log({ event_type: "INFO", agent_id: agentId, message: `refactor: dry_run=${dryRun}` });

  // Get findings: from input OR from memory (last code-analysis run)
  let findings = input?.findings ?? [];
  if (!findings.length) {
    try {
      const cached = memory.get(`skill:code-analysis:cache:last-run:${agentId}`);
      if (cached?.findings) {
        findings = cached.findings;
        log({ event_type: "INFO", message: `Loaded ${findings.length} finding(s) from memory cache` });
      }
    } catch { /* no cached findings */ }
  }

  if (!findings.length) {
    log({ event_type: "WARN", message: "No findings provided and no cached code-analysis results found." });
    return { patches: [], summary: { total: 0, auto_fixable: 0, patches_generated: 0 } };
  }

  const autoFixable = findings.filter((f) => f.auto_fixable);
  log({ event_type: "INFO", message: `${findings.length} finding(s) total, ${autoFixable.length} auto-fixable` });

  const patches = [];
  for (const f of autoFixable) {
    // Check suppression
    if (f.suppression_key) {
      try {
        const absFile = path.isAbsolute(f.file) ? f.file : path.join(rootDir, f.file);
        if (fs.existsSync(absFile)) {
          const src = fs.readFileSync(absFile, "utf8");
          if (src.includes(`agent-suppress: ${f.suppression_key}`)) {
            log({ event_type: "INFO", message: `Skipping suppressed finding: ${f.suppression_key}` });
            continue;
          }
        }
      } catch { /* ignore */ }
    }

    const patch = generatePatchForFinding(f, rootDir);
    if (patch) {
      patches.push(patch);
      log({ event_type: "INFO", message: `Generated patch for finding ${f.id} (${f.suppression_key})` });
    }
  }

  const summary = {
    total:             findings.length,
    auto_fixable:      autoFixable.length,
    patches_generated: patches.length,
    dry_run:           dryRun,
    note:              dryRun
      ? "Patches are PROPOSED only. Set dry_run: false and have an Orchestrator-level agent apply them after review."
      : "CAUTION: dry_run is false. Patches are ready to apply but still require Orchestrator approval.",
  };

  // Store patches in memory for retrieval
  try {
    memory.set(`skill:refactor:cache:last-run:${agentId}`, {
      patches, summary, generated_at: new Date().toISOString(),
    }, { ttl_seconds: 3600, tags: ["skill:refactor", "context:transformation", "lifecycle:transient"] });
  } catch { /* ignore */ }

  log({ event_type: "INFO", message: `Refactor complete. ${patches.length} patch(es) proposed.`, summary });

  return { patches, summary };
}

module.exports = { execute };
