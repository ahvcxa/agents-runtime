"use strict";
/**
 * Unused code remover
 * Identifies and suggests removal of unused variables
 */

function removeUnusedCode(content, filePath) {
  let cleaned = content;

  // Remove unused variables (simple heuristic)
  // Matches: const/let/var name = value; where name is never used
  const unusedVarPattern = /^\s*(const|let|var)\s+(\w+)\s*=\s*[^;]+;\s*$/gm;
  
  cleaned = cleaned.split("\n").filter((line) => {
    const match = line.match(unusedVarPattern);
    if (!match) return true;
    
    const varName = match[2];
    // Simple check: if variable name appears nowhere else, it might be unused
    // In production, use AST analysis
    const occurrences = (cleaned.match(new RegExp(`\\b${varName}\\b`, "g")) || []).length;
    
    return occurrences > 1; // Keep if used more than once (declaration + usage)
  }).join("\n");

  return cleaned;
}

module.exports = { removeUnusedCode };
