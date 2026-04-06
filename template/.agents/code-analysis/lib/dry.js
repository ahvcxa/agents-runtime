"use strict";
/**
 * DRY (Don't Repeat Yourself) analyzer — extracted from handler.js
 */

function analyzeDry(lines, relPath, findings, finding) {
  const magicNumbers = new Map();
  const magicStrings = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, "");

    const numMatches = line.matchAll(/(?<![.\w])(\d{2,})(?!\s*[:.,]?\s*\w)/g);
    for (const m of numMatches) {
      const val = m[1];
      if (["100", "200", "201", "400", "401", "403", "404", "500"].includes(val)) continue;
      if (!magicNumbers.has(val)) magicNumbers.set(val, []);
      magicNumbers.get(val).push(i + 1);
    }

    if (!line.match(/require\(|import\s|from\s['"]|console\.|logger\./)) {
      const strMatches = line.matchAll(/['"]([A-Za-z][A-Za-z0-9_\-]{4,})['"](?!\s*:)/g);
      for (const m of strMatches) {
        const val = m[1];
        if (!magicStrings.has(val)) magicStrings.set(val, []);
        magicStrings.get(val).push(i + 1);
      }
    }
  }

  for (const [val, lineNums] of magicNumbers) {
    if (lineNums.length > 2) {
      findings.push(finding({
        principle:      "DRY",
        severity:       "MEDIUM",
        file:           relPath,
        line_start:     lineNums[0],
        line_end:       lineNums[lineNums.length - 1],
        message:        `Magic number '${val}' appears ${lineNums.length} times (lines ${lineNums.join(", ")})`,
        recommendation: `Extract '${val}' to a named constant, e.g. const MAX_RETRY_COUNT = ${val}`,
        auto_fixable:   false,
      }));
    }
  }

  for (const [val, lineNums] of magicStrings) {
    if (lineNums.length > 2) {
      findings.push(finding({
        principle:      "DRY",
        severity:       "MEDIUM",
        file:           relPath,
        line_start:     lineNums[0],
        line_end:       lineNums[lineNums.length - 1],
        message:        `Magic string '${val}' appears ${lineNums.length} times (lines ${lineNums.join(", ")})`,
        recommendation: `Extract '${val}' to a named constant or enum`,
        auto_fixable:   false,
      }));
    }
  }

  const BLOCK_SIZE = 6;
  const MIN_BLOCK_CHARS = 120;
  const fingerprints = lines.map(l =>
    l.trim().replace(/\/\/.*$/, "").replace(/\s+/g, " ")
  );

  const seen = new Map();
  const reported = new Set();

  let i = 0;
  while (i <= fingerprints.length - BLOCK_SIZE) {
    const blockLines = fingerprints.slice(i, i + BLOCK_SIZE);
    const meaningful = blockLines.filter(l => l.length > 4 && l !== "{" && l !== "}");
    const blockKey   = meaningful.join("\n");

    if (meaningful.length < Math.ceil(BLOCK_SIZE * 0.6) || blockKey.length < MIN_BLOCK_CHARS) {
      i++;
      continue;
    }

    if (seen.has(blockKey) && !reported.has(seen.get(blockKey))) {
      const prevStart = seen.get(blockKey);
      reported.add(prevStart);
      findings.push(finding({
        principle:      "DRY",
        severity:       "HIGH",
        file:           relPath,
        line_start:     prevStart + 1,
        line_end:       i + BLOCK_SIZE,
        message:        `Structural clone: ${BLOCK_SIZE}-line code block first at L${prevStart + 1}–${prevStart + BLOCK_SIZE}, duplicated at L${i + 1}–${i + BLOCK_SIZE}`,
        recommendation: "Extract the duplicated block into a shared named function",
        auto_fixable:   false,
      }));
      i += BLOCK_SIZE;
    } else {
      if (!seen.has(blockKey)) seen.set(blockKey, i);
      i++;
    }
  }
}

module.exports = { analyzeDry };
