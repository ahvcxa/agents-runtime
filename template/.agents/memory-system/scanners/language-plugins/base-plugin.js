"use strict";
/**
 * .agents/memory-system/scanners/language-plugins/base-plugin.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Abstract base class for language-specific plugins
 * All language plugins MUST extend this class
 *
 * Exported: BaseLanguagePlugin class
 */

class BaseLanguagePlugin {
  // ───────────────────────────────────────────────────────────────────────────
  // Static properties (must be overridden by subclasses)
  // ───────────────────────────────────────────────────────────────────────────

  /** Language identifier (e.g., 'javascript', 'python') */
  static language = undefined;

  /** Plugin version (semantic versioning) */
  static version = "1.0.0";

  /** Supported language versions range */
  static supportedVersions = [];

  /**
   * Detects if plugin can handle this file
   * @param {string} filePath - File path to check
   * @returns {boolean} True if this plugin handles the file
   */
  static canHandle(filePath) {
    throw new Error("canHandle() not implemented");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Instance methods (must be overridden by subclasses)
  // ───────────────────────────────────────────────────────────────────────────

  constructor(projectRoot) {
    if (!this.constructor.language) {
      throw new Error(
        `Language plugins must define static 'language' property`
      );
    }
    this.projectRoot = projectRoot;
  }

  /**
   * Scans for exported functions, classes, and APIs
   * @param {string} projectRoot - Project root directory
   * @returns {Promise<Object>} Capabilities object
   */
  async scanCapabilities(projectRoot) {
    throw new Error(
      `scanCapabilities() not implemented for ${this.constructor.language}`
    );
  }

  /**
   * Scans for project dependencies
   * @param {string} projectRoot - Project root directory
   * @returns {Promise<Object>} Dependencies object
   */
  async scanDependencies(projectRoot) {
    throw new Error(
      `scanDependencies() not implemented for ${this.constructor.language}`
    );
  }

  /**
   * Scans for complexity metrics
   * @param {string} filePath - File path
   * @param {string} content - File content
   * @returns {Promise<Object>} Metrics object
   */
  async scanMetrics(filePath, content) {
    // Optional: return basic metrics
    return {
      complexity: 0,
      loc: content.split("\n").length,
    };
  }

  /**
   * Detects framework/runtime used in project
   * @param {string} projectRoot - Project root directory
   * @returns {Promise<Object>} Framework info
   */
  async getFramework(projectRoot) {
    return { name: null, version: null };
  }

  /**
   * Gets language runtime version
   * @returns {Promise<string|null>} Version string or null
   */
  async getLanguageVersion() {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helper methods for subclasses
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Builds a function object
   * @protected
   */
  buildFunction(name, params = [], line = 0, file = "") {
    return { name, params, line, file };
  }

  /**
   * Builds a class object
   * @protected
   */
  buildClass(name, methods = [], line = 0, file = "") {
    return { name, methods, line, file };
  }

  /**
   * Builds an export object
   * @protected
   */
  buildExport(name, type = "default", line = 0, file = "") {
    return { name, type, line, file };
  }

  /**
   * Builds a dependency object
   * @protected
   */
  buildDependency(name, version = "*", optional = false) {
    return { name, version, optional };
  }

  /**
   * Helper: find files by extension
   * @protected
   */
  findFilesByExtension(dir, extensions) {
    const fs = require("fs");
    const path = require("path");
    const files = [];

    const extensionSet = new Set(extensions);

    function walk(currentDir) {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.name.startsWith(".") ||
            [
              "node_modules",
              "vendor",
              "dist",
              "build",
              "coverage",
              ".git",
            ].includes(entry.name)
          ) {
            continue;
          }

          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (extensionSet.has(path.extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch {
        // Ignore directory errors
      }
    }

    walk(dir);
    return files;
  }

  /**
   * Helper: read file safely
   * @protected
   */
  readFileSafe(filePath) {
    const fs = require("fs");
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  }

  /**
   * Helper: parse JSON safely
   * @protected
   */
  parseJsonSafe(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  }

  /**
   * Helper: extract lines by pattern
   * @protected
   */
  extractLinesByPattern(content, pattern) {
    const matches = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        matches.push({
          line: i + 1,
          content: lines[i].trim(),
        });
      }
    }

    return matches;
  }
}

module.exports = { BaseLanguagePlugin };
