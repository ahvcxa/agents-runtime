"use strict";
/**
 * JSDoc parser
 * Extracts JSDoc comments from source files
 */

const fs = require("fs");
const path = require("path");

function extractJsDoc(projectRoot) {
  const docs = [];

  // Find all JS/TS files
  const files = findSourceFiles(projectRoot);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8");
      const parsedDocs = parseJsDocFromContent(content, file);
      docs.push(...parsedDocs);
    } catch (err) {
      // Skip files that can't be read
    }
  }

  return docs;
}

function findSourceFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Skip node_modules and hidden dirs
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }
      findSourceFiles(path.join(dir, entry.name), files);
    } else if (entry.isFile() && /\.(js|ts|jsx|tsx)$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

function parseJsDocFromContent(content, filePath) {
  const docs = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Look for JSDoc block
    if (line.includes("/**")) {
      let jsDocBlock = "";
      let j = i;

      while (j < lines.length) {
        jsDocBlock += lines[j] + "\n";
        if (lines[j].includes("*/")) {
          break;
        }
        j++;
      }

      // Extract function/class name from next line
      const nextLine = lines[j + 1] || "";
      const nameMatch = nextLine.match(/(?:function|class|const|async)\s+(\w+)/);

      if (nameMatch) {
        docs.push({
          name: nameMatch[1],
          jsDoc: jsDocBlock,
          line: i,
          file: filePath,
          type: nextLine.includes("class") ? "class" : "function"
        });
      }

      i = j + 1;
    } else {
      i++;
    }
  }

  return docs;
}

module.exports = { extractJsDoc };
