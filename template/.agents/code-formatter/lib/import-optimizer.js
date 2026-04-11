"use strict";
/**
 * Import optimizer
 * Organizes and optimizes import statements
 */

function optimizeImports(content, filePath) {
  const lines = content.split("\n");
  const importLines = [];
  const otherLines = [];
  let importEndIndex = 0;

  // Separate imports from other code
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("import ") || line.startsWith("const {") && lines[i + 1]?.includes("require")) {
      importLines.push(lines[i]);
      importEndIndex = i;
    } else if (i <= importEndIndex) {
      if (line === "") {
        importEndIndex = i;
      } else {
        otherLines.push(lines[i]);
      }
    } else {
      otherLines.push(lines[i]);
    }
  }

  if (importLines.length === 0) {
    return content;
  }

  // Sort imports
  importLines.sort((a, b) => {
    // Node modules first, then relative imports
    const aIsNodeModule = !a.includes("./") && !a.includes("../");
    const bIsNodeModule = !b.includes("./") && !b.includes("../");
    
    if (aIsNodeModule !== bIsNodeModule) {
      return aIsNodeModule ? -1 : 1;
    }
    
    return a.localeCompare(b);
  });

  // Reconstruct content
  const result = [...importLines, "", ...otherLines].join("\n");
  return result;
}

module.exports = { optimizeImports };
