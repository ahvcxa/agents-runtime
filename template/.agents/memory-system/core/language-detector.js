"use strict";
/**
 * .agents/memory-system/core/language-detector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects programming languages in a project by analyzing file extensions
 * and common configuration files (package.json, requirements.txt, etc.)
 *
 * Exported: detectLanguages(projectRoot) → Promise<string[]>
 */

const fs = require("fs");
const path = require("path");

// Language detection rules
const LANGUAGE_SIGNATURES = {
  javascript: {
    extensions: [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"],
    markers: ["package.json", "tsconfig.json", "webpack.config.js"],
  },
  python: {
    extensions: [".py", ".pyw"],
    markers: ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile"],
  },
  go: {
    extensions: [".go"],
    markers: ["go.mod", "go.sum"],
  },
  rust: {
    extensions: [".rs"],
    markers: ["Cargo.toml", "Cargo.lock"],
  },
  java: {
    extensions: [".java"],
    markers: ["pom.xml", "build.gradle", "build.gradle.kts"],
  },
  ruby: {
    extensions: [".rb"],
    markers: ["Gemfile", "Gemfile.lock"],
  },
  php: {
    extensions: [".php"],
    markers: ["composer.json", "composer.lock"],
  },
  csharp: {
    extensions: [".cs"],
    markers: [".csproj", ".sln"],
  },
};

/**
 * Detects all programming languages present in a project
 * @param {string} projectRoot - Project root directory path
 * @returns {Promise<string[]>} Array of detected languages (sorted)
 */
async function detectLanguages(projectRoot) {
  const detected = new Set();

  // 1. Check for marker files (more reliable)
  for (const [lang, sig] of Object.entries(LANGUAGE_SIGNATURES)) {
    for (const marker of sig.markers) {
      const markerPath = path.join(projectRoot, marker);
      try {
        if (fs.existsSync(markerPath)) {
          detected.add(lang);
          break; // Found one marker, language is present
        }
      } catch {
        // Ignore file access errors
      }
    }
  }

  // 2. If no markers, scan file extensions (fallback)
  if (detected.size === 0) {
    const extensions = await scanFileExtensions(projectRoot);
    for (const [lang, sig] of Object.entries(LANGUAGE_SIGNATURES)) {
      if (extensions.some((ext) => sig.extensions.includes(ext))) {
        detected.add(lang);
      }
    }
  }

  return Array.from(detected).sort();
}

/**
 * Scans project root for file extensions (max 1000 files for performance)
 * @param {string} projectRoot
 * @returns {Promise<Set<string>>} Unique extensions found
 */
async function scanFileExtensions(projectRoot) {
  const extensions = new Set();
  let fileCount = 0;
  const maxFiles = 1000;

  function walkDir(dir) {
    if (fileCount >= maxFiles) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (fileCount >= maxFiles) break;

        // Skip common unimportant directories
        if (
          entry.name.startsWith(".") ||
          ["node_modules", "vendor", "dist", "build", "coverage"].includes(
            entry.name
          )
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else {
          const ext = path.extname(entry.name);
          if (ext) {
            extensions.add(ext);
            fileCount++;
          }
        }
      }
    } catch {
      // Ignore directory access errors
    }
  }

  walkDir(projectRoot);
  return extensions;
}

/**
 * Gets a summary of detected languages with file counts
 * @param {string} projectRoot
 * @returns {Promise<Object>} Language summary with counts
 */
async function getLanguageSummary(projectRoot) {
  const languages = await detectLanguages(projectRoot);
  const summary = {};

  for (const lang of languages) {
    const sig = LANGUAGE_SIGNATURES[lang];
    summary[lang] = {
      extensions: sig.extensions,
      file_count: countFilesByExtensions(projectRoot, sig.extensions),
    };
  }

  return summary;
}

/**
 * Counts files matching given extensions
 * @param {string} dir
 * @param {string[]} extensions
 * @returns {number} File count
 */
function countFilesByExtensions(dir, extensions) {
  let count = 0;
  const extensionSet = new Set(extensions);

  function walk(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name.startsWith(".") ||
          ["node_modules", "vendor", "dist", "build", "coverage"].includes(
            entry.name
          )
        ) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (extensionSet.has(path.extname(entry.name))) {
          count++;
        }
      }
    } catch {
      // Ignore errors
    }
  }

  walk(dir);
  return count;
}

module.exports = {
  detectLanguages,
  getLanguageSummary,
  LANGUAGE_SIGNATURES,
};
