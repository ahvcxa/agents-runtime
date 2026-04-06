#!/usr/bin/env node
"use strict";
/**
 * bin/detect-project-structure.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatically detects valid source directories in a project.
 * Used during setup to generate agent.yaml with correct read_paths.
 * 
 * Usage:
 *   node bin/detect-project-structure.js /path/to/project
 *   Returns JSON: { paths: ["src/", "lib/"], confidence: "high" }
 */

const fs = require("fs");
const path = require("path");

const SUPPORTED_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"]);
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".agents",
  "dist",
  "build",
  ".next",
  "out",
  ".turbo",
  ".vuepress",
  "coverage",
  ".nyc_output",
  "venv",
  "__pycache__",
  ".env",
  ".env.local",
  ".DS_Store",
  ".idea",
  ".vscode",
]);

function isSourceFile(filePath) {
  return SUPPORTED_EXTS.has(path.extname(filePath).toLowerCase());
}

function dirContainsSourceFiles(dirPath, depth = 2) {
  if (!fs.existsSync(dirPath)) return false;
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isFile() && isSourceFile(fullPath)) {
        return true;
      }
      
      if (entry.isDirectory() && depth > 0) {
        if (dirContainsSourceFiles(fullPath, depth - 1)) {
          return true;
        }
      }
    }
  } catch (e) {
    return false;
  }
  
  return false;
}

function detectSourceDirs(projectRoot) {
  const detected = [];
  
  // Common source directory patterns
  const patterns = [
    "src",
    "lib",
    "source",
    "app",
    "components",
    "pages",
    "scripts",
    "server",
    "client",
    "packages",
  ];
  
  // Check direct patterns
  for (const pattern of patterns) {
    const dirPath = path.join(projectRoot, pattern);
    if (dirContainsSourceFiles(dirPath)) {
      detected.push(pattern + "/");
    }
  }
  
  // Check src/* subdirectories (for fullstack projects)
  const srcPath = path.join(projectRoot, "src");
  if (fs.existsSync(srcPath)) {
    try {
      const entries = fs.readdirSync(srcPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(entry.name)) continue;
        
        if (entry.isDirectory()) {
          const subDirPath = path.join(srcPath, entry.name);
          if (dirContainsSourceFiles(subDirPath)) {
            detected.push(`src/${entry.name}/`);
          }
        } else if (entry.isFile() && isSourceFile(path.join(srcPath, entry.name))) {
          // src/ itself has files
          if (!detected.includes("src/")) {
            detected.push("src/");
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Check root level files
  const rootFiles = ["index.js", "index.ts", "app.js", "app.ts", "main.js", "main.ts"];
  for (const file of rootFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath) && isSourceFile(filePath)) {
      detected.push(file);
      break; // Only include one root file
    }
  }
  
  // Check package.json (always safe to include)
  const pkgPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(pkgPath) && !detected.includes("package.json")) {
    detected.push("package.json");
  }
  
  // Remove duplicates and sort
  const unique = [...new Set(detected)].sort();
  
  return {
    paths: unique,
    count: unique.length,
    confidence: unique.length > 0 ? "high" : "low",
  };
}

// Main
if (require.main === module) {
  const projectRoot = process.argv[2] || process.cwd();
  
  if (!fs.existsSync(projectRoot)) {
    console.error(`Error: Project directory not found: ${projectRoot}`);
    process.exit(1);
  }
  
  const result = detectSourceDirs(projectRoot);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

module.exports = { detectSourceDirs };
