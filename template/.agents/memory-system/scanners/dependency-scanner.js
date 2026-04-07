"use strict";
/**
 * .agents/memory-system/scanners/dependency-scanner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans project dependencies for all supported languages
 * Uses language-specific plugin system
 *
 * Exported: DependencyScanner class
 */

const fs = require("fs");
const path = require("path");

class DependencyScanner {
  /**
   * Scans dependencies for detected languages
   * @param {string} projectRoot - Project root directory
   * @param {string[]} languages - Detected languages
   * @returns {Promise<Object>} Dependencies by language
   */
  async scan(projectRoot, languages) {
    const dependencies = {};

    for (const language of languages) {
      try {
        const plugin = this.getPlugin(language);
        if (plugin) {
          dependencies[language] = await plugin.scanDependencies(projectRoot);
        }
      } catch (error) {
        console.warn(`[DependencyScanner] Error scanning ${language}: ${error.message}`);
        dependencies[language] = { direct: {}, error: error.message };
      }
    }

    return dependencies;
  }

  /**
   * Scans partial (for incremental updates)
   * @param {string} projectRoot
   * @param {string[]} changedFiles - Files that changed
   * @returns {Promise<Object>} Updated dependencies
   */
  async scanPartial(projectRoot, changedFiles) {
    // For now, re-scan all dependencies if any config file changed
    const configFiles = [
      "package.json",
      "requirements.txt",
      "go.mod",
      "Cargo.toml",
      "pom.xml",
      "Gemfile",
      "composer.json",
    ];

    const hasConfigChange = changedFiles.some((file) =>
      configFiles.some(
        (cf) =>
          file.endsWith(cf) || file.endsWith(`/${cf}`) || file === cf
      )
    );

    if (hasConfigChange) {
      // Re-scan all dependencies
      const { detectLanguages } = require("../core/language-detector");
      const languages = await detectLanguages(projectRoot);
      return this.scan(projectRoot, languages);
    }

    return null;
  }

  /**
   * Gets appropriate plugin for language
   * @private
   */
  getPlugin(language) {
    const pluginsMap = {
      javascript: new JavaScriptDependencyPlugin(),
      typescript: new JavaScriptDependencyPlugin(),
      python: new PythonDependencyPlugin(),
      go: new GoDependencyPlugin(),
      rust: new RustDependencyPlugin(),
      java: new JavaDependencyPlugin(),
    };

    return pluginsMap[language] || null;
  }
}

/**
 * JavaScript/TypeScript dependency plugin
 */
class JavaScriptDependencyPlugin {
  async scanDependencies(projectRoot) {
    const packageJsonPath = path.join(projectRoot, "package.json");

    try {
      if (!fs.existsSync(packageJsonPath)) {
        return { direct: {}, transitive: {}, error: "package.json not found" };
      }

      const content = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

      return {
        direct: content.dependencies || {},
        dev: content.devDependencies || {},
        peer: content.peerDependencies || {},
        manager: "npm",
        lock_file: fs.existsSync(path.join(projectRoot, "package-lock.json"))
          ? "package-lock.json"
          : fs.existsSync(path.join(projectRoot, "yarn.lock"))
          ? "yarn.lock"
          : null,
      };
    } catch (error) {
      return { direct: {}, error: error.message };
    }
  }
}

/**
 * Python dependency plugin
 */
class PythonDependencyPlugin {
  async scanDependencies(projectRoot) {
    const dependencies = { direct: {}, manager: "pip" };

    // Check requirements.txt
    const reqPath = path.join(projectRoot, "requirements.txt");
    if (fs.existsSync(reqPath)) {
      const content = fs.readFileSync(reqPath, "utf8");
      const lines = content.split("\n");

      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9\-_.]+)\s*([=!<>~].+)?/);
        if (match) {
          dependencies.direct[match[1]] = match[2] || "*";
        }
      }
    }

    // Check setup.py
    const setupPath = path.join(projectRoot, "setup.py");
    if (fs.existsSync(setupPath)) {
      dependencies.has_setup_py = true;
    }

    // Check pyproject.toml
    const pyprojectPath = path.join(projectRoot, "pyproject.toml");
    if (fs.existsSync(pyprojectPath)) {
      dependencies.has_pyproject_toml = true;
    }

    return dependencies;
  }
}

/**
 * Go dependency plugin
 */
class GoDependencyPlugin {
  async scanDependencies(projectRoot) {
    const goModPath = path.join(projectRoot, "go.mod");

    try {
      if (!fs.existsSync(goModPath)) {
        return { direct: {}, error: "go.mod not found" };
      }

      const content = fs.readFileSync(goModPath, "utf8");
      const dependencies = { direct: {}, manager: "go" };

      const lines = content.split("\n");
      let inRequire = false;

      for (const line of lines) {
        if (line.includes("require")) {
          inRequire = true;
          continue;
        }

        if (inRequire && line.startsWith(")")) {
          inRequire = false;
          continue;
        }

        if (inRequire) {
          const match = line.match(/\s+([a-zA-Z0-9\-_.\/]+)\s+([a-zA-Z0-9\-_.]+)/);
          if (match) {
            dependencies.direct[match[1]] = match[2];
          }
        }
      }

      return dependencies;
    } catch (error) {
      return { direct: {}, error: error.message };
    }
  }
}

/**
 * Rust dependency plugin
 */
class RustDependencyPlugin {
  async scanDependencies(projectRoot) {
    const cargoTomlPath = path.join(projectRoot, "Cargo.toml");

    try {
      if (!fs.existsSync(cargoTomlPath)) {
        return { direct: {}, error: "Cargo.toml not found" };
      }

      const content = fs.readFileSync(cargoTomlPath, "utf8");
      const dependencies = { direct: {}, manager: "cargo" };

      const lines = content.split("\n");
      let inDeps = false;

      for (const line of lines) {
        if (line.includes("[dependencies]")) {
          inDeps = true;
          continue;
        }

        if (inDeps && line.startsWith("[")) {
          inDeps = false;
          continue;
        }

        if (inDeps) {
          const match = line.match(/^([a-zA-Z0-9\-_]+)\s*=\s*["\']?([^"\']+)["\']?/);
          if (match) {
            dependencies.direct[match[1]] = match[2];
          }
        }
      }

      return dependencies;
    } catch (error) {
      return { direct: {}, error: error.message };
    }
  }
}

/**
 * Java dependency plugin (Maven/Gradle)
 */
class JavaDependencyPlugin {
  async scanDependencies(projectRoot) {
    const dependencies = { direct: {}, manager: "maven/gradle" };

    // Check for pom.xml (Maven)
    const pomPath = path.join(projectRoot, "pom.xml");
    if (fs.existsSync(pomPath)) {
      dependencies.build_tool = "maven";
      // Basic parsing (simple regex, not full XML parsing)
      const content = fs.readFileSync(pomPath, "utf8");
      const matches = content.match(/<artifactId>([^<]+)<\/artifactId>/g);
      if (matches) {
        matches.forEach((match, i) => {
          const id = match.replace(/<\/?artifactId>/g, "");
          dependencies.direct[id] = "*";
        });
      }
    }

    // Check for build.gradle (Gradle)
    const gradlePath = path.join(projectRoot, "build.gradle");
    if (fs.existsSync(gradlePath)) {
      dependencies.build_tool = "gradle";
    }

    return dependencies;
  }
}

module.exports = { default: DependencyScanner };
