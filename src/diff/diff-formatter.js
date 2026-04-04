"use strict";
/**
 * src/diff/diff-formatter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Formats a DiffEngine result for terminal output (colored) or JSON.
 */

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
  bgRed:  "\x1b[41m",
};

const SEVERITY_COLOR = {
  CRITICAL: C.red + C.bold,
  HIGH:     C.red,
  MEDIUM:   C.yellow,
  LOW:      C.cyan,
  INFO:     C.dim,
};

function sev(severity) {
  const s   = (severity ?? "?").toUpperCase();
  const col = SEVERITY_COLOR[s] ?? "";
  return `${col}${s}${C.reset}`;
}

function shortPath(filePath, maxLen = 60) {
  if (!filePath) return "(unknown)";
  const parts = filePath.replace(/\\/g, "/").split("/");
  const joined = parts.slice(-3).join("/");
  return joined.length > maxLen ? "..." + joined.slice(-maxLen) : joined;
}

// ─── formatTerminal ───────────────────────────────────────────────────────────

/**
 * Format a DiffEngine result as a human-readable terminal string.
 * @param {object} diff       - Result from DiffEngine.compare()
 * @param {object} [runMeta]  - { current: {git_sha, timestamp}, baseline: {...} }
 * @returns {string}
 */
function formatTerminal(diff, runMeta = {}) {
  const { new_findings, resolved, worsened, improved, summary } = diff;
  const lines = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  const baseRef = runMeta.baseline?.git_sha ?? "previous run";
  const baseTs  = runMeta.baseline?.timestamp
    ? new Date(runMeta.baseline.timestamp).toLocaleString()
    : "";
  lines.push(`\n${C.bold}─── Diff vs. ${baseRef}${baseTs ? ` (${baseTs})` : ""} ───${C.reset}`);

  // ── Summary row ─────────────────────────────────────────────────────────────
  const trendStr = summary.trend_pct === null
    ? "(no baseline)"
    : summary.trend_pct > 0
      ? `${C.red}+${summary.trend_pct}%${C.reset}`
      : summary.trend_pct < 0
        ? `${C.green}${summary.trend_pct}%${C.reset}`
        : `${C.dim}0%${C.reset}`;

  lines.push(
    `${C.bold}📊 Trend${C.reset}   ` +
    `${summary.total_before} → ${summary.total_after} findings  (${trendStr})\n`
  );

  // ── New findings ─────────────────────────────────────────────────────────────
  if (new_findings.length > 0) {
    lines.push(`${C.red}${C.bold}🔴 NEW     +${new_findings.length}${C.reset}`);
    for (const f of new_findings.slice(0, 10)) {
      lines.push(
        `   ${sev(f.severity)}  ${shortPath(f.file)}:${f.line_start ?? "?"}  ` +
        `${C.dim}${(f.message ?? "").slice(0, 80)}${C.reset}`
      );
    }
    if (new_findings.length > 10) {
      lines.push(`   ${C.dim}… and ${new_findings.length - 10} more${C.reset}`);
    }
    lines.push("");
  }

  // ── Resolved ─────────────────────────────────────────────────────────────────
  if (resolved.length > 0) {
    lines.push(`${C.green}${C.bold}✅ FIXED   -${resolved.length}${C.reset}`);
    for (const f of resolved.slice(0, 5)) {
      lines.push(
        `   ${sev(f.severity)}  ${shortPath(f.file)}:${f.line_start ?? "?"}  ` +
        `${C.dim}${(f.message ?? "").slice(0, 80)}${C.reset}`
      );
    }
    if (resolved.length > 5) {
      lines.push(`   ${C.dim}… and ${resolved.length - 5} more${C.reset}`);
    }
    lines.push("");
  }

  // ── Worsened ─────────────────────────────────────────────────────────────────
  if (worsened.length > 0) {
    lines.push(`${C.yellow}${C.bold}⬆️  WORSE   ${worsened.length} severity upgrade(s)${C.reset}`);
    for (const { before: b, after: a } of worsened.slice(0, 5)) {
      lines.push(
        `   ${sev(b.severity)} → ${sev(a.severity)}  ${shortPath(a.file)}:${a.line_start ?? "?"}`
      );
    }
    lines.push("");
  }

  // ── Improved ─────────────────────────────────────────────────────────────────
  if (improved.length > 0) {
    lines.push(`${C.cyan}⬇️  BETTER  ${improved.length} severity downgrade(s)${C.reset}`);
    lines.push("");
  }

  // ── Overall verdict ──────────────────────────────────────────────────────────
  if (!summary.regressed && summary.total_after <= summary.total_before) {
    lines.push(`${C.green}${C.bold}✅ No regressions detected.${C.reset}`);
  } else if (summary.regressed) {
    lines.push(`${C.red}${C.bold}❌ Regressions detected — review new/worsened findings above.${C.reset}`);
  }

  lines.push("");
  return lines.join("\n");
}

// ─── formatJson ───────────────────────────────────────────────────────────────

/**
 * Return the raw diff as a JSON-serializable object (for --export).
 * @param {object} diff
 * @param {object} [runMeta]
 * @returns {object}
 */
function formatJson(diff, runMeta = {}) {
  return { ...diff, meta: runMeta };
}

module.exports = { formatTerminal, formatJson };
