"use strict";
/**
 * src/analyzers/py-cognitive-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cognitive Complexity analyzer for Python
 */

const { finding, stripPython, indentLevel } = require("./py-common");

function analyzeCognitiveComplexity(lines, relPath) {
  const findings = [];
  const FUNC_PATTERN = /^(\s*)(?:def|async\s+def)\s+(\w+)\s*\(/;
  const NESTING = /\b(if|elif|for|while|except|with)\b/g;
  const FLOW = /\b(break|continue|return|raise|yield)\b/;

  let inFunc = false, fnName = "", fnStart = 0, fnBaseIndent = 0;
  let cog = 0, nestLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = stripPython(raw);
    const indent = indentLevel(raw);

    const funcMatch = raw.match(FUNC_PATTERN);
    if (funcMatch && !inFunc) {
      inFunc = true; fnName = funcMatch[2];
      fnStart = i + 1; fnBaseIndent = funcMatch[1].length;
      cog = 0; nestLevel = 0;
      continue;
    }

    if (inFunc) {
      if (stripped.length > 0 && indent <= fnBaseIndent && i > fnStart) {
        if (cog > 15) {
          findings.push(finding({
            principle: "Cognitive Complexity", severity: cog > 30 ? "HIGH" : "MEDIUM",
            file: relPath, line_start: fnStart, line_end: i, symbol: fnName,
            message: `Function '${fnName}' has cognitive complexity ${cog} (threshold: 15)`,
            recommendation: `Extract nested logic in '${fnName}' into well-named helpers. Reduce nesting depth.`,
          }));
        }
        inFunc = false;
        const newF = raw.match(FUNC_PATTERN);
        if (newF) { inFunc = true; fnName = newF[2]; fnStart = i + 1; fnBaseIndent = newF[1].length; cog = 0; nestLevel = 0; }
        continue;
      }

      nestLevel = Math.max(0, Math.floor((indent - fnBaseIndent) / 4));
      const nestHits = (stripped.match(NESTING) ?? []).length;
      cog += nestHits * Math.max(1, nestLevel);
      if (FLOW.test(stripped)) cog += 1;
    }
  }

  // End of file
  if (inFunc && cog > 15) {
    findings.push(finding({
      principle: "Cognitive Complexity", severity: cog > 30 ? "HIGH" : "MEDIUM",
      file: relPath, line_start: fnStart, line_end: lines.length, symbol: fnName,
      message: `Function '${fnName}' has cognitive complexity ${cog}`,
      recommendation: "Extract nested logic into helpers.",
    }));
  }

  return findings;
}

module.exports = { analyzeCognitiveComplexity };
