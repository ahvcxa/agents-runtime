"use strict";
/**
 * src/analyzers/py-solid-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SOLID principles analyzer for Python
 */

const { finding, indentLevel } = require("./py-common");

function analyzeSolid(lines, relPath) {
  const findings = [];

  // SRP: file > 500 non-empty lines
  const nonEmpty = lines.filter(l => l.trim() && !l.trim().startsWith("#"));
  if (nonEmpty.length > 500) {
    findings.push(finding({
      principle: "SOLID — Single Responsibility", severity: "MEDIUM", file: relPath,
      line_start: 1, line_end: lines.length,
      message: `Module has ${nonEmpty.length} non-empty lines (>500). Likely violates SRP.`,
      recommendation: "Split into smaller, focused modules. Each module: one reason to change.",
    }));
  }

  // OCP: long if/elif chains
  let chainLen = 0, chainStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*elif\s/.test(lines[i])) {
      if (chainLen === 0) chainStart = i;
      chainLen++;
    } else if (/^\s*if\s/.test(lines[i])) {
      chainLen = 0;
    } else if (chainLen > 0 && !/^\s*(else\s*:|#)/.test(lines[i]) && lines[i].trim()) {
      if (chainLen > 4) {
        findings.push(finding({
          principle: "SOLID — Open/Closed", severity: "MEDIUM", file: relPath,
          line_start: chainStart + 1, line_end: i,
          message: `elif chain with ${chainLen + 1} branches. Violates Open/Closed Principle.`,
          recommendation: "Replace with a dispatch dict or Strategy pattern",
        }));
      }
      chainLen = 0;
    }
  }

  // Class size: methods > 10 or LoC > 200 per class
  let inClass = false, className = "", classStart = 0, classIndent = 0, methodCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const cls = raw.match(/^(\s*)class\s+(\w+)/);
    if (cls) {
      if (inClass && methodCount > 10) {
        findings.push(finding({
          principle: "SOLID — Single Responsibility", severity: "MEDIUM", file: relPath,
          line_start: classStart, line_end: i, symbol: className,
          message: `Class '${className}' has ${methodCount} methods (>10). May have too many responsibilities.`,
          recommendation: "Extract related methods into smaller focused classes or mixins.",
        }));
      }
      inClass = true; className = cls[2]; classStart = i + 1; classIndent = cls[1].length; methodCount = 0;
      continue;
    }
    if (inClass) {
      if (/^\s*def\s+/.test(raw) && indentLevel(raw) === classIndent + 4) methodCount++;
      if (raw.trim() && indentLevel(raw) <= classIndent && !raw.trim().startsWith("#") && i > classStart) {
        inClass = false;
      }
    }
  }

  return findings;
}

module.exports = { analyzeSolid };
