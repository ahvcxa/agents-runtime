"use strict";
/**
 * Cyclomatic Complexity analyzer — extracted from handler.js
 * CC = 1 + (if / else if / for / while / do / case / catch / && / || / ?? / ternary)
 */

function analyzeCyclomaticComplexity(lines, relPath, findings, finding) {
  const functionPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\(.*\)\s*\{|async\s+(\w+)\s*\()/;
  const decisionPattern = /\bif\b|\belse if\b|\bfor\b|\bwhile\b|\bdo\b|\bcase\b|\bcatch\b|(?<![=!<>])&&(?![&=])|(?<![|=!])\|\|(?![|=])|\?\?(?!=)|\?(?![.?])/g;

  let inFunction = false;
  let functionStart = 0;
  let functionName = "";
  let braceDepth = 0;
  let functionBraceStart = 0;
  let cc = 1;
  let functionLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.replace(/\/\/.*$/, "").replace(/`[^`]*`/g, '""');

    if (!inFunction) {
      const match = stripped.match(functionPattern);
      if (match && stripped.includes("{")) {
        inFunction     = true;
        functionStart  = i + 1;
        functionName   = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "(anonymous)";
        functionBraceStart = braceDepth;
        cc             = 1;
        functionLines  = [];
      }
    }

    if (inFunction) {
      functionLines.push(line);
      const decisions = (stripped.match(decisionPattern) ?? []).length;
      cc += decisions;

      for (const ch of stripped) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      if (braceDepth <= functionBraceStart && functionLines.length > 1) {
        inFunction = false;
        const functionEnd = i + 1;

        if (cc >= 11) {
          const severity = cc > 20 ? "CRITICAL" : "HIGH";
          findings.push(finding({
            principle:      "Cyclomatic Complexity",
            severity,
            file:           relPath,
            line_start:     functionStart,
            line_end:       functionEnd,
            symbol:         functionName,
            message:        `Function '${functionName}' has cyclomatic complexity of ${cc} (threshold: ${cc > 20 ? ">20 unmaintainable" : "11-20 complex"})`,
            recommendation: cc > 20
              ? `Decompose '${functionName}' into smaller functions. Consider Strategy or Command pattern.`
              : `Add @complexity annotation and plan decomposition of '${functionName}'.`,
            auto_fixable:   false,
          }));
        }
      }
    } else {
      for (const ch of stripped) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
    }
  }
}

module.exports = { analyzeCyclomaticComplexity };
