"use strict";
/**
 * src/analyzers/python-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Barrel export for Python analyzers
 * Aggregates all 5 principle analyzers for code-analysis and security-audit skills
 */

const { analyzeCyclomaticComplexity } = require("./py-cc-analyzer");
const { analyzeDry } = require("./py-dry-analyzer");
const { analyzeSecurity } = require("./py-security-analyzer");
const { analyzeSolid } = require("./py-solid-analyzer");
const { analyzeCognitiveComplexity } = require("./py-cognitive-analyzer");

/**
 * Run full code-analysis on a Python file's lines.
 * @param {string[]} lines
 * @param {string}   relPath
 * @returns {Finding[]}
 */
function analyzeCodePython(lines, relPath) {
  return [
    ...analyzeCyclomaticComplexity(lines, relPath),
    ...analyzeDry(lines, relPath),
    ...analyzeSecurity(lines, relPath),
    ...analyzeSolid(lines, relPath),
    ...analyzeCognitiveComplexity(lines, relPath),
  ];
}

/**
 * Run security-audit on a Python file.
 * @param {string[]} lines
 * @param {string}   relPath
 * @returns {Finding[]}
 */
function auditSecurityPython(lines, relPath) {
  return analyzeSecurity(lines, relPath, "security-audit");
}

module.exports = { analyzeCodePython, auditSecurityPython };
