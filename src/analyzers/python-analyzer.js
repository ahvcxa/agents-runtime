"use strict";
/**
 * src/analyzers/python-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Barrel export for Python analyzers.
 * Aggregates all 5 principle analyzers + optional deep AST pass.
 */

const { analyzeCyclomaticComplexity } = require("./py-cc-analyzer");
const { analyzeDry }                  = require("./py-dry-analyzer");
const { analyzeSecurity }             = require("./py-security-analyzer");
const { analyzeSolid }                = require("./py-solid-analyzer");
const { analyzeCognitiveComplexity }  = require("./py-cognitive-analyzer");
const { analyzePythonAst }            = require("./python-ast-analyzer");

/**
 * Run full code-analysis on a Python file's lines.
 * Includes deep AST pass if Python 3.8+ is available.
 * @param {string[]} lines
 * @param {string}   relPath
 * @returns {Promise<Finding[]>}
 */
async function analyzeCodePython(lines, relPath) {
  const regexFindings = [
    ...analyzeCyclomaticComplexity(lines, relPath),
    ...analyzeDry(lines, relPath),
    ...analyzeSecurity(lines, relPath),
    ...analyzeSolid(lines, relPath),
    ...analyzeCognitiveComplexity(lines, relPath),
  ];

  // Deep AST pass — may detect issues regex misses
  const source = lines.join("\n");
  const { findings: astFindings } = await analyzePythonAst(source, relPath);

  return [...regexFindings, ...astFindings];
}

/**
 * Run security-audit on a Python file.
 * Includes deep AST pass for exec/eval/pickle/subprocess detection.
 * @param {string[]} lines
 * @param {string}   relPath
 * @returns {Promise<Finding[]>}
 */
async function auditSecurityPython(lines, relPath) {
  const regexFindings = analyzeSecurity(lines, relPath, "security-audit");

  // Deep AST pass — catches taint-flow issues that regex cannot
  const source = lines.join("\n");
  const { findings: astFindings } = await analyzePythonAst(source, relPath);

  return [...regexFindings, ...astFindings];
}

module.exports = { analyzeCodePython, auditSecurityPython };

