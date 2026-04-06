"use strict";
/**
 * Cognitive Complexity analyzer — extracted from handler.js
 */

function analyzeCognitiveComplexity(lines, relPath, findings, finding) {
  const funcPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/;
  let inFunction = false;
  let fnName = "";
  let fnStart = 0;
  let braceDepth = 0;
  let fnBraceStart = 0;
  let cogScore = 0;
  let nestLevel = 0;

  const NESTING_TRIGGERS  = /\b(if|for|while|do|switch|catch)\b/g;
  const FLOW_BREAKS       = /\b(break|continue|return|throw)\b/;

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i];
    const stripped = line.replace(/\/\/.*$/, "");

    if (!inFunction) {
      const m = stripped.match(funcPattern);
      if (m && stripped.includes("{")) {
        inFunction    = true;
        fnName        = m[1] ?? m[2] ?? "(anonymous)";
        fnStart       = i + 1;
        fnBraceStart  = braceDepth;
        cogScore      = 0;
        nestLevel     = 0;
      }
    }

    if (inFunction) {
      const nestingMatches = [...stripped.matchAll(NESTING_TRIGGERS)].length;
      cogScore += nestingMatches * Math.max(1, nestLevel);
      if (nestingMatches > 0 && stripped.includes("{")) nestLevel++;

      if (FLOW_BREAKS.test(stripped)) cogScore += 1;

      for (const ch of stripped) {
        if (ch === "{") braceDepth++;
        if (ch === "}") { braceDepth--; nestLevel = Math.max(0, nestLevel - 1); }
      }

      if (braceDepth <= fnBraceStart && i > fnStart) {
        inFunction = false;
        if (cogScore > 15) {
          findings.push(finding({
            principle:      "Cognitive Complexity",
            severity:       cogScore > 30 ? "HIGH" : "MEDIUM",
            file:           relPath,
            line_start:     fnStart,
            line_end:       i + 1,
            symbol:         fnName,
            message:        `Function '${fnName}' has cognitive complexity score of ${cogScore} (threshold: 15)`,
            recommendation: `Simplify '${fnName}' by extracting nested logic into well-named helper functions. Reduce nesting depth.`,
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

module.exports = { analyzeCognitiveComplexity };
