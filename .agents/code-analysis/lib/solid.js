"use strict";
/**
 * SOLID analyzer — extracted from handler.js
 */

function analyzeSolid(lines, relPath, findings, finding) {
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length > 500) {
    findings.push(finding({
      principle:      "SOLID — Single Responsibility",
      severity:       "MEDIUM",
      file:           relPath,
      line_start:     1,
      line_end:       lines.length,
      message:        `File has ${nonEmpty.length} non-empty lines (>500). Likely violates Single Responsibility Principle.`,
      recommendation: "Split this module into smaller, focused modules. Each module should have one reason to change.",
      auto_fixable:   false,
    }));
  }

  let consecutiveElseIf = 0;
  let chainStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(else\s+if|case\s)/i.test(lines[i])) {
      if (consecutiveElseIf === 0) chainStart = i + 1;
      consecutiveElseIf++;
    } else if (/^\s*(if\s*\()/i.test(lines[i])) {
      consecutiveElseIf = 0;
    } else if (consecutiveElseIf > 0 && !/^\s*(else|{|})/i.test(lines[i])) {
      if (consecutiveElseIf > 4) {
        findings.push(finding({
          principle:      "SOLID — Open/Closed",
          severity:       "MEDIUM",
          file:           relPath,
          line_start:     chainStart,
          line_end:       i,
          message:        `if-else / case chain with ${consecutiveElseIf + 1} branches. Violates Open/Closed Principle.`,
          recommendation: "Replace type-based dispatch with polymorphism, strategy pattern, or a lookup map.",
          auto_fixable:   false,
        }));
      }
      consecutiveElseIf = 0;
    }
  }

  const dipPattern = /=\s*new\s+([A-Z][A-Za-z0-9_]+)\s*\(/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(class|constructor|\/\/)/.test(line)) continue;
    let match;
    while ((match = dipPattern.exec(line)) !== null) {
      const className = match[1];
      if (/^(Error|Map|Set|Promise|Date|Array|RegExp|URL|Buffer)$/.test(className)) continue;
      findings.push(finding({
        principle:      "SOLID — Dependency Inversion",
        severity:       "LOW",
        file:           relPath,
        line_start:     i + 1,
        line_end:       i + 1,
        message:        `Direct instantiation of '${className}' in business logic. Depends on concrete implementation.`,
        recommendation: `Inject '${className}' as a dependency or use a factory/IoC container.`,
        auto_fixable:   false,
      }));
    }
    dipPattern.lastIndex = 0;
  }
}

module.exports = { analyzeSolid };
