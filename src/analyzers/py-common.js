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

module.exports = { uuid, finding, stripPython, indentLevel };
