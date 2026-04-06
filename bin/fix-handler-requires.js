#!/usr/bin/env node
/**
 * bin/fix-handler-requires.js
 * ─────────────────────────────────────────────────────────────────────────────
 * For ESM projects, updates .cjs files to require other .cjs files instead of .js.
 * Fixes both handler.cjs and lib/*.cjs files.
 *
 * Usage:
 *   node bin/fix-handler-requires.js /path/to/handler.cjs
 *   node bin/fix-handler-requires.js /path/to/lib/module.cjs
 */

const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node fix-handler-requires.js <file-path>");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");
const originalContent = content;

// Replace require("./lib/xxx") with require("./lib/xxx.cjs")
// But avoid double .cjs.cjs
content = content.replace(
  /require\("\.\/lib\/([^"]+)(?:\.cjs)?"\)/g,
  'require("./lib/$1.cjs")'
);

// Also replace require("./xxx") (same directory) with require("./xxx.cjs") 
// when the required module is a sibling in the same lib/ directory
const dirName = path.dirname(filePath);
content = content.replace(
  /require\("\.\/([^"./][^"]*?)(?:\.cjs)?"\)/g,
  (match, moduleName) => {
    // Don't replace known builtins or relative paths with ../
    if (moduleName.startsWith(".")) return match;
    
    // Check if this is a sibling module (should have .cjs variant)
    const potentialCjs = path.join(dirName, `${moduleName}.cjs`);
    if (fs.existsSync(potentialCjs)) {
      return `require("./${moduleName}.cjs")`;
    }
    return match;
  }
);

// Avoid triple .cjs
content = content.replace(/\.cjs\.cjs/g, ".cjs");

if (content !== originalContent) {
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Updated: ${filePath}`);
} else {
  // console.log(`No changes needed: ${filePath}`);
}

