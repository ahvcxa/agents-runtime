"use strict";
/**
 * src/analyzers/py-dry-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DRY (Don't Repeat Yourself) analyzer for Python
 */

const { finding, stripPython } = require("./py-common");

function analyzeDry(lines, relPath) {
  const findings = [];
  const magicNumbers = new Map();
  const magicStrings = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = stripPython(lines[i]);

    // Magic numbers
    for (const m of line.matchAll(/(?<![.\w])(\d{2,})(?![.\w])/g)) {
      const val = m[1];
      if (["100", "200", "201", "400", "401", "403", "404", "500", "True", "False"].includes(val)) continue;
      if (!magicNumbers.has(val)) magicNumbers.set(val, []);
      magicNumbers.get(val).push(i + 1);
    }

    // Magic strings — not imports/logging
    if (!line.match(/^(?:import|from|print|logging|log\.|logger\.)/)) {
      for (const m of line.matchAll(/["']([A-Za-z][A-Za-z0-9_\-]{4,})["'](?!\s*:)/g)) {
        const val = m[1];
        if (!magicStrings.has(val)) magicStrings.set(val, []);
        magicStrings.get(val).push(i + 1);
      }
    }
  }

  for (const [val, lineNums] of magicNumbers) {
    if (lineNums.length > 2) {
      findings.push(finding({
        principle: "DRY", severity: "MEDIUM", file: relPath,
        line_start: lineNums[0], line_end: lineNums[lineNums.length - 1],
        message: `Magic number '${val}' appears ${lineNums.length} times (lines ${lineNums.join(", ")})`,
        recommendation: `Extract to a named constant: ${val.toUpperCase()}_CONSTANT = ${val}`,
      }));
    }
  }

  for (const [val, lineNums] of magicStrings) {
    if (lineNums.length > 2) {
      findings.push(finding({
        principle: "DRY", severity: "MEDIUM", file: relPath,
        line_start: lineNums[0], line_end: lineNums[lineNums.length - 1],
        message: `Magic string '${val}' appears ${lineNums.length} times`,
        recommendation: `Extract to a named constant or Enum: ${val.toUpperCase()} = "${val}"`,
      }));
    }
  }

  // Duplicate block detection (non-overlapping)
  const BLOCK_SIZE = 6;
  const fingerprints = lines.map(l => stripPython(l).replace(/\s+/g, " "));
  const seen = new Map();
  const reported = new Set();
  let i = 0;
  while (i <= fingerprints.length - BLOCK_SIZE) {
    const blockLines = fingerprints.slice(i, i + BLOCK_SIZE);
    const meaningful = blockLines.filter(l => l.length > 4 && !l.startsWith("#"));
    const blockKey = meaningful.join("\n");
    if (meaningful.length < Math.ceil(BLOCK_SIZE * 0.6) || blockKey.length < 100) { i++; continue; }
    if (seen.has(blockKey) && !reported.has(seen.get(blockKey))) {
      const prev = seen.get(blockKey);
      reported.add(prev);
      findings.push(finding({
        principle: "DRY", severity: "HIGH", file: relPath,
        line_start: prev + 1, line_end: i + BLOCK_SIZE,
        message: `Structural clone: ${BLOCK_SIZE}-line block first at L${prev + 1}–${prev + BLOCK_SIZE}, duplicated at L${i + 1}–${i + BLOCK_SIZE}`,
        recommendation: "Extract duplicated logic into a shared helper function",
      }));
      i += BLOCK_SIZE;
    } else {
      if (!seen.has(blockKey)) seen.set(blockKey, i);
      i++;
    }
  }

  return findings;
}

module.exports = { analyzeDry };
