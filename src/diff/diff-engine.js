"use strict";
/**
 * src/diff/diff-engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure function: compares two Finding[] arrays and returns a structured diff.
 *
 * Finding identity is determined by: file + line_start + principle + message[:60]
 * This is stable across minor reformatting but catches real changes.
 */

// ─── Identity key ─────────────────────────────────────────────────────────────

/**
 * Compute a stable identity string for a finding.
 * Used to match the "same" finding across two runs.
 * @param {object} f - Finding object
 * @returns {string}
 */
function findingKey(f) {
  const file      = (f.file      ?? "").replace(/\\/g, "/");
  const line      = f.line_start ?? 0;
  const principle = f.principle  ?? f.skill ?? "";
  const msg       = (f.message   ?? "").slice(0, 60).trim();
  return `${file}::${line}::${principle}::${msg}`;
}

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_ORDER = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };

function severityRank(sev) {
  return SEVERITY_ORDER[(sev ?? "").toUpperCase()] ?? -1;
}

// ─── DiffEngine ───────────────────────────────────────────────────────────────

/**
 * Compare two Finding[] arrays and compute a structured diff.
 *
 * @param {object[]} baseline - Findings from the older/previous run
 * @param {object[]} current  - Findings from the newer/current run
 * @returns {DiffResult}
 *
 * @typedef {object} DiffResult
 * @property {object[]} new_findings     - In current, not in baseline
 * @property {object[]} resolved         - In baseline, not in current
 * @property {object[]} worsened         - Same key, severity increased
 * @property {object[]} improved         - Same key, severity decreased
 * @property {object[]} unchanged        - Same key, same severity
 * @property {object}   summary          - High-level counts and trend
 */
function compare(baseline, current) {
  const baselineArr = Array.isArray(baseline) ? baseline : [];
  const currentArr  = Array.isArray(current)  ? current  : [];

  const baselineMap = new Map();
  for (const f of baselineArr) baselineMap.set(findingKey(f), f);

  const currentMap  = new Map();
  for (const f of currentArr)  currentMap.set(findingKey(f), f);

  const new_findings = [];
  const worsened     = [];
  const improved     = [];
  const unchanged    = [];

  // Walk current → find new and changed
  for (const [key, cf] of currentMap) {
    if (!baselineMap.has(key)) {
      new_findings.push(cf);
    } else {
      const bf      = baselineMap.get(key);
      const bRank   = severityRank(bf.severity);
      const cRank   = severityRank(cf.severity);

      if (cRank > bRank) {
        worsened.push({ before: bf, after: cf });
      } else if (cRank < bRank) {
        improved.push({ before: bf, after: cf });
      } else {
        unchanged.push(cf);
      }
    }
  }

  // Walk baseline → find resolved
  const resolved = [];
  for (const [key, bf] of baselineMap) {
    if (!currentMap.has(key)) resolved.push(bf);
  }

  // Severity breakdown of new findings
  const newBySeverity = {};
  for (const f of new_findings) {
    const sev = (f.severity ?? "UNKNOWN").toUpperCase();
    newBySeverity[sev] = (newBySeverity[sev] ?? 0) + 1;
  }

  const totalBefore = baselineArr.length;
  const totalAfter  = currentArr.length;
  const delta       = totalAfter - totalBefore;
  const trend       = totalBefore === 0
    ? null
    : Math.round((delta / totalBefore) * 100);

  const summary = {
    total_before:     totalBefore,
    total_after:      totalAfter,
    delta,
    trend_pct:        trend,       // null if no baseline
    new_count:        new_findings.length,
    resolved_count:   resolved.length,
    worsened_count:   worsened.length,
    improved_count:   improved.length,
    unchanged_count:  unchanged.length,
    new_by_severity:  newBySeverity,
    regressed:        new_findings.length > 0 || worsened.length > 0,
    improved_overall: resolved.length > improved.length,
  };

  return { new_findings, resolved, worsened, improved, unchanged, summary };
}

module.exports = { compare, findingKey };
