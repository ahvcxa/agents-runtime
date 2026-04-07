"use strict";
/**
 * .agents/memory-system/scanners/structure-scanner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans project directory structure and collects file metadata
 * (language detection, line counts, complexity estimates)
 *
 * Exported: StructureScanner class
 */

const fs = require("fs");
const path = require("path");

class StructureScanner {
  constructor() {
    this.stats = {
      total_files: 0,
      total_lines: 0,
      by_language: {},
      by_extension: {},
    };
  }

  /**
   * Scans project structure
   * @param {string} projectRoot - Project root directory
   * @returns {Promise<Object>} Structure data
   */
  async scan(projectRoot) {
    const startTime = Date.now();

    const files = [];
    const directories = [];

    this.walkDirectory(projectRoot, "", files, directories);

    const structure = {
      root: projectRoot,
      total_files: files.length,
      total_lines: this.stats.total_lines,
      total_directories: directories.length,
      by_language: this.groupByLanguage(files),
      by_extension: this.groupByExtension(files),
      files: files.slice(0, 1000), // Limit to 1000 for memory
      scan_duration_ms: Date.now() - startTime,
    };

    return structure;
  }

  /**
   * Recursively walks directory tree
   * @private
   */
  walkDirectory(dir, relativePath, files, directories, depth = 0) {
    // Limit depth to prevent infinite recursion
    if (depth > 20) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files and common unimportant directories
        if (
          entry.name.startsWith(".") ||
          [
            "node_modules",
            "vendor",
            "dist",
            "build",
            "coverage",
            ".git",
            "venv",
            "env",
            "__pycache__",
            "target",
          ].includes(entry.name)
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        const rel = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          directories.push({
            path: rel,
            type: "directory",
          });
          this.walkDirectory(fullPath, rel, files, directories, depth + 1);
        } else {
          const fileData = this.analyzeFile(fullPath, rel);
          if (fileData) {
            files.push(fileData);
          }
        }
      }
    } catch {
      // Ignore directory access errors
    }
  }

  /**
   * Analyzes a single file
   * @private
   */
  analyzeFile(fullPath, relativePath) {
    try {
      const stat = fs.statSync(fullPath);
      const ext = path.extname(relativePath);

      // Only track meaningful files
      if (!ext) return null;

      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n").length;

      this.stats.total_lines += lines;

      // Count by extension
      if (!this.stats.by_extension[ext]) {
        this.stats.by_extension[ext] = 0;
      }
      this.stats.by_extension[ext]++;

      // Detect language
      const language = this.detectLanguage(ext);

      if (language) {
        if (!this.stats.by_language[language]) {
          this.stats.by_language[language] = 0;
        }
        this.stats.by_language[language]++;
      }

      return {
        path: relativePath,
        extension: ext,
        language: language,
        type: "file",
        size_bytes: stat.size,
        loc: lines,
        complexity: this.estimateComplexity(content, language),
        last_modified: stat.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Detects language from file extension
   * @private
   */
  detectLanguage(ext) {
    const langMap = {
      // JavaScript/TypeScript
      ".js": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".ts": "typescript",
      ".tsx": "typescript",
      ".jsx": "javascript",

      // Python
      ".py": "python",
      ".pyw": "python",

      // Go
      ".go": "go",

      // Rust
      ".rs": "rust",

      // Java
      ".java": "java",

      // Other
      ".rb": "ruby",
      ".php": "php",
      ".cs": "csharp",
      ".cpp": "cpp",
      ".c": "c",
      ".h": "header",
    };

    return langMap[ext.toLowerCase()];
  }

  /**
   * Estimates complexity (naive metric)
   * @private
   */
  estimateComplexity(content, language) {
    if (!language) return 0;

    let decisionPoints = 0;

    // Count decision points (language-agnostic)
    const patterns = [
      /\bif\b/gi, // if statements
      /\belse\b/gi, // else
      /\bfor\b/gi, // loops
      /\bwhile\b/gi, // while loops
      /\bswitch\b/gi, // switch
      /\bcatch\b/gi, // catch blocks
      /\?\s*:/g, // ternary operators
      /\|\|/g, // logical OR
      /&&/g, // logical AND
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        decisionPoints += matches.length;
      }
    }

    // Cyclomatic complexity estimate
    return Math.max(1, 1 + decisionPoints / 10);
  }

  /**
   * Groups files by language
   * @private
   */
  groupByLanguage(files) {
    const grouped = {};

    for (const file of files) {
      if (!file.language) continue;
      if (!grouped[file.language]) {
        grouped[file.language] = [];
      }
      grouped[file.language].push(file);
    }

    // Sort each language by LOC
    for (const lang in grouped) {
      grouped[lang].sort((a, b) => (b.loc || 0) - (a.loc || 0));
    }

    return grouped;
  }

  /**
   * Groups files by extension
   * @private
   */
  groupByExtension(files) {
    const grouped = {};

    for (const file of files) {
      const ext = file.extension;
      if (!grouped[ext]) {
        grouped[ext] = [];
      }
      grouped[ext].push(file);
    }

    return grouped;
  }
}

module.exports = { default: StructureScanner };
