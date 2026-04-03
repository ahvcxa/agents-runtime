"use strict";
/**
 * src/analyzers/py-cc-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cyclomatic Complexity analyzer for Python
 * CC = 1 + (if / elif / for / while / except / and / or / ternary)
 */

const { finding, stripPython, indentLevel } = require("./py-common");

function analyzeCyclomaticComplexity(lines, relPath) {
  const findings = [];
  const FUNC_PATTERN = /^(\s*)(?:def|async\s+def)\s+(\w+)\s*\(/;
  const DECISION_PATTERN = /\bif\b|\belif\b|\bfor\b|\bwhile\b|\bexcept\b|\band\b|\bor\b/g;
  const TERNARY = /\w+\s+if\s+.+\s+else\s/;

  let inFunc = false;
  let funcName = "";
  let funcStart = 0;
  let funcIndent = 0;
  let cc = 1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = stripPython(raw);

    const funcMatch = raw.match(FUNC_PATTERN);
    if (funcMatch && !inFunc) {
      inFunc = true;
      funcName = funcMatch[2];
      funcStart = i + 1;
      funcIndent = funcMatch[1].length;
      cc = 1;
      continue;
    }

    if (inFunc) {
      if (stripped.length > 0 && indentLevel(raw) <= funcIndent && i > funcStart) {
        if (cc >= 11) {
          findings.push(finding({
            principle: "Cyclomatic Complexity", severity: cc > 20 ? "CRITICAL" : "HIGH",
            file: relPath, line_start: funcStart, line_end: i, symbol: funcName,
            message: `Function '${funcName}' has cyclomatic complexity of ${cc} (threshold: ${cc > 20 ? ">20 unmaintainable" : "11-20 complex"})`,
            recommendation: cc > 20
              ? `Break '${funcName}' into smaller functions. Apply Single Responsibility Principle.`
              : `Document '${funcName}' and plan decomposition.`,
          }));
        }
        inFunc = false;
        const newFunc = raw.match(FUNC_PATTERN);
        if (newFunc) { inFunc = true; funcName = newFunc[2]; funcStart = i + 1; funcIndent = newFunc[1].length; cc = 1; }
        continue;
      }

      const decisions = (stripped.match(DECISION_PATTERN) ?? []).length;
      cc += decisions;
      if (TERNARY.test(stripped)) cc += 1;
    }
  }

  if (inFunc && cc >= 11) {
    findings.push(finding({
      principle: "Cyclomatic Complexity", severity: cc > 20 ? "CRITICAL" : "HIGH",
      file: relPath, line_start: funcStart, line_end: lines.length, symbol: funcName,
      message: `Function '${funcName}' has cyclomatic complexity of ${cc}`,
      recommendation: `Break '${funcName}' into smaller functions.`,
    }));
  }

  return findings;
}

module.exports = { analyzeCyclomaticComplexity };
