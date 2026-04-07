"use strict";
/**
 * .agents/memory-system/scanners/capability-scanner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans and indexes exported functions, classes, and APIs
 * Uses language-specific plugins for accurate detection
 *
 * Exported: CapabilityScanner class
 */

const fs = require("fs");
const path = require("path");

class CapabilityScanner {
  /**
   * Scans capabilities for all languages
   * @param {string} projectRoot
   * @param {string[]} languages - Detected languages
   * @returns {Promise<Object>} Capabilities by language
   */
  async scan(projectRoot, languages) {
    const capabilities = {};

    for (const language of languages) {
      try {
        const plugin = this.getPlugin(language);
        if (plugin) {
          capabilities[language] = await plugin.scanCapabilities(projectRoot);
        }
      } catch (error) {
        console.warn(
          `[CapabilityScanner] Error scanning ${language}: ${error.message}`
        );
        capabilities[language] = { exports: [], functions: [], classes: [] };
      }
    }

    return capabilities;
  }

  /**
   * Gets appropriate plugin for language
   * @private
   */
  getPlugin(language) {
    const pluginsMap = {
      javascript: new JavaScriptCapabilityPlugin(),
      typescript: new JavaScriptCapabilityPlugin(),
      python: new PythonCapabilityPlugin(),
      go: new GoCapabilityPlugin(),
      rust: new RustCapabilityPlugin(),
      java: new JavaCapabilityPlugin(),
    };

    return pluginsMap[language] || null;
  }
}

/**
 * JavaScript/TypeScript capability plugin
 */
class JavaScriptCapabilityPlugin {
  async scanCapabilities(projectRoot) {
    const capabilities = {
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    // Scan main entry point and index files
    const targetFiles = [
      path.join(projectRoot, "index.js"),
      path.join(projectRoot, "index.ts"),
      path.join(projectRoot, "src/index.js"),
      path.join(projectRoot, "src/index.ts"),
    ];

    for (const file of targetFiles) {
      if (!fs.existsSync(file)) continue;

      try {
        const content = fs.readFileSync(file, "utf8");

        // Extract exports
        const exportMatches = content.match(
          /export\s+(default\s+)?(?:const|function|class|async\s+function)\s+(\w+)/g
        );
        if (exportMatches) {
          for (const match of exportMatches) {
            const name = match.replace(/export\s+(?:default\s+)?(?:const|function|class|async\s+function)\s+/, "");
            capabilities.exports.push({
              name,
              file: path.relative(projectRoot, file),
              line: content.substring(0, content.indexOf(match)).split("\n").length,
            });
          }
        }

        // Extract function declarations
        const funcMatches = content.match(/function\s+(\w+)\s*\(/g);
        if (funcMatches) {
          for (const match of funcMatches) {
            const name = match.replace(/function\s+|\s*\(/g, "");
            if (!capabilities.exports.some((e) => e.name === name)) {
              capabilities.functions.push({
                name,
                file: path.relative(projectRoot, file),
                params: [],
              });
            }
          }
        }

        // Extract class declarations
        const classMatches = content.match(/class\s+(\w+)/g);
        if (classMatches) {
          for (const match of classMatches) {
            const name = match.replace(/class\s+/, "");
            capabilities.classes.push({
              name,
              file: path.relative(projectRoot, file),
              methods: [],
            });
          }
        }
      } catch {
        // Ignore file read errors
      }
    }

    return capabilities;
  }
}

/**
 * Python capability plugin
 */
class PythonCapabilityPlugin {
  async scanCapabilities(projectRoot) {
    const capabilities = {
      exports: [],
      functions: [],
      classes: [],
      modules: [],
    };

    // Scan __init__.py and main Python files
    const targetFiles = [
      path.join(projectRoot, "__init__.py"),
      path.join(projectRoot, "main.py"),
      path.join(projectRoot, "src/__init__.py"),
    ];

    for (const file of targetFiles) {
      if (!fs.existsSync(file)) continue;

      try {
        const content = fs.readFileSync(file, "utf8");

        // Extract __all__ exports
        const allMatch = content.match(/__all__\s*=\s*\[(.*?)\]/s);
        if (allMatch) {
          const items = allMatch[1].match(/'([^']+)'|"([^"]+)"/g);
          if (items) {
            for (const item of items) {
              capabilities.exports.push({
                name: item.replace(/['\"]/g, ""),
                file: path.relative(projectRoot, file),
              });
            }
          }
        }

        // Extract function definitions
        const funcMatches = content.match(/def\s+(\w+)\s*\(/g);
        if (funcMatches) {
          for (const match of funcMatches) {
            const name = match.replace(/def\s+|\s*\(/g, "");
            if (!capabilities.exports.some((e) => e.name === name)) {
              capabilities.functions.push({
                name,
                file: path.relative(projectRoot, file),
                params: [],
              });
            }
          }
        }

        // Extract class definitions
        const classMatches = content.match(/class\s+(\w+)/g);
        if (classMatches) {
          for (const match of classMatches) {
            const name = match.replace(/class\s+/, "");
            capabilities.classes.push({
              name,
              file: path.relative(projectRoot, file),
              methods: [],
            });
          }
        }
      } catch {
        // Ignore file read errors
      }
    }

    return capabilities;
  }
}

/**
 * Go capability plugin
 */
class GoCapabilityPlugin {
  async scanCapabilities(projectRoot) {
    const capabilities = {
      exports: [],
      functions: [],
      interfaces: [],
      structs: [],
    };

    // For now, return empty (Go scanning is complex)
    // Phase 2 will implement full Go AST parsing

    return capabilities;
  }
}

/**
 * Rust capability plugin
 */
class RustCapabilityPlugin {
  async scanCapabilities(projectRoot) {
    const capabilities = {
      exports: [],
      functions: [],
      structs: [],
      traits: [],
    };

    // For now, return empty (Rust scanning is complex)
    // Phase 2 will implement full Rust AST parsing

    return capabilities;
  }
}

/**
 * Java capability plugin
 */
class JavaCapabilityPlugin {
  async scanCapabilities(projectRoot) {
    const capabilities = {
      exports: [],
      classes: [],
      interfaces: [],
      methods: [],
    };

    // For now, return empty (Java scanning is complex)
    // Phase 2 will implement full Java AST parsing

    return capabilities;
  }
}

module.exports = { default: CapabilityScanner };
