"use strict";
/**
 * src/analyzers/py-common.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared utilities for Python analyzers
 */

const path = require("path");
const { randomUUID } = require("crypto");

// UUID helper (using secure crypto)
function uuid() {
  return randomUUID();
}

// Finding builder
function finding({ skill = "code-analysis", principle, severity, file, line_start, line_end,
  symbol, message, recommendation, cwe_id, owasp_category, auto_fixable = false }) {
  const key = `${principle.toLowerCase().replace(/[\s—]+/g, "-")}-${path.basename(file)}-L${line_start}`;
  return {
    id: uuid(), skill, principle, severity, file,
    line_start, line_end: line_end ?? line_start,
    symbol: symbol ?? undefined, message, recommendation,
    cwe_id: cwe_id ?? undefined,
    owasp_category: owasp_category ?? undefined,
    auto_fixable, suppression_key: key,
  };
}

// Strip inline comment and string literals from a Python line for analysis
function stripPython(line) {
  return line.replace(/#.*$/, "").trim();
}

// Detect Python indentation level (number of spaces)
function indentLevel(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/**
 * Detect duplicate values in an array.
 * Used to identify magic numbers/strings that appear multiple times.
 * @param {string[]} items - Items to check for duplicates
 * @param {number} threshold - Minimum count to consider a duplicate (default: 2)
 * @returns {Array<[value, lineNumbers]>} Entries where count >= threshold
 */
function detectDuplicateValues(items, threshold = 2) {
  const seen = new Map();
  
  items.forEach((item) => {
    seen.set(item, (seen.get(item) || 0) + 1);
  });
  
  return Array.from(seen.entries())
    .filter(([_, count]) => count >= threshold)
    .map(([item, count]) => [item, count]);
}

module.exports = { uuid, finding, stripPython, indentLevel, detectDuplicateValues };
