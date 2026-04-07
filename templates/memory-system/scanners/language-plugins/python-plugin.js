"use strict";
/**
 * .agents/memory-system/scanners/language-plugins/python-plugin.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Python language plugin
 * Scans for exports, functions, classes, and dependencies
 *
 * Exported: PythonLanguagePlugin class
 */

const path = require("path");
const { BaseLanguagePlugin } = require("./base-plugin");

class PythonLanguagePlugin extends BaseLanguagePlugin {
  static language = "python";
  static version = "1.0.0";
  static supportedVersions = ["3.8", "3.12"];

  static canHandle(filePath) {
    return /\.py$/.test(filePath);
  }

  /**
   * Scans Python files for exports and APIs
   */
  async scanCapabilities(projectRoot) {
    const capabilities = {
      exports: [],
      functions: [],
      classes: [],
      modules: [],
    };

    // Scan main entry points
    const entryFiles = [
      path.join(projectRoot, "__init__.py"),
      path.join(projectRoot, "main.py"),
      path.join(projectRoot, "src/__init__.py"),
      path.join(projectRoot, "app/__init__.py"),
    ];

    for (const file of entryFiles) {
      const content = this.readFileSafe(file);
      if (!content) continue;

      this.extractExports(content, file, projectRoot, capabilities);
      this.extractFunctions(content, file, projectRoot, capabilities);
      this.extractClasses(content, file, projectRoot, capabilities);
    }

    return capabilities;
  }

  /**
   * Scans for dependencies
   */
  async scanDependencies(projectRoot) {
    const dependencies = { direct: {}, manager: "pip" };

    // Check requirements.txt
    const reqPath = path.join(projectRoot, "requirements.txt");
    const reqContent = this.readFileSafe(reqPath);

    if (reqContent) {
      const lines = reqContent.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        // Parse requirement: package==version or package>=version, etc.
        const match = trimmed.match(/^([a-zA-Z0-9\-_.]+)\s*([=!<>~].+)?/);
        if (match) {
          dependencies.direct[match[1]] = match[2] || "*";
        }
      }
    }

    // Check setup.py
    const setupPath = path.join(projectRoot, "setup.py");
    const setupContent = this.readFileSafe(setupPath);
    if (setupContent) {
      dependencies.has_setup_py = true;
    }

    // Check pyproject.toml
    const pyprojectPath = path.join(projectRoot, "pyproject.toml");
    const pyprojectContent = this.readFileSafe(pyprojectPath);
    if (pyprojectContent) {
      dependencies.has_pyproject_toml = true;
      // Extract dependencies from pyproject.toml
      this.extractPyprojectDeps(pyprojectContent, dependencies);
    }

    // Check Pipfile (pipenv)
    const pipfilePath = path.join(projectRoot, "Pipfile");
    if (this.readFileSafe(pipfilePath)) {
      dependencies.manager_alt = "pipenv";
    }

    return dependencies;
  }

  /**
   * Gets Python framework used
   */
  async getFramework(projectRoot) {
    const packageJsonPath = path.join(projectRoot, "requirements.txt");
    const content = this.readFileSafe(packageJsonPath);

    if (!content) return { name: null, version: null };

    const frameworks = [
      { package: "django", name: "Django" },
      { package: "flask", name: "Flask" },
      { package: "fastapi", name: "FastAPI" },
      { package: "starlette", name: "Starlette" },
      { package: "pyramid", name: "Pyramid" },
      { package: "tornado", name: "Tornado" },
    ];

    for (const fw of frameworks) {
      if (content.includes(fw.package)) {
        // Extract version if available
        const match = content.match(
          new RegExp(`${fw.package}([=!<>~].+)?`, "i")
        );
        const version = match?.[1] || "*";

        return {
          name: fw.name,
          package: fw.package,
          version,
        };
      }
    }

    return { name: null, version: null };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  extractExports(content, file, projectRoot, capabilities) {
    // Python __all__ exports
    const allMatch = content.match(/__all__\s*=\s*\[(.*?)\]/s);

    if (allMatch) {
      const itemsStr = allMatch[1];
      const items = itemsStr.match(/'([^']+)'|"([^"]+)"/g);

      if (items) {
        for (const item of items) {
          const name = item.replace(/['\"]/g, "");
          const line = content.substring(0, content.indexOf(item)).split("\n")
            .length;

          capabilities.exports.push(
            this.buildExport(name, "all", line, path.relative(projectRoot, file))
          );
        }
      }
    }

    // from ... import ... statements
    const importMatches = content.match(/^from .+ import .+$/gm);
    if (importMatches) {
      for (const match of importMatches) {
        const line = content.substring(0, content.indexOf(match)).split("\n")
          .length;
        capabilities.exports.push({
          name: match.trim(),
          type: "import",
          line,
          file: path.relative(projectRoot, file),
        });
      }
    }
  }

  extractFunctions(content, file, projectRoot, capabilities) {
    // Function definitions: def foo(...):
    const funcMatches = content.match(/^def\s+(\w+)\s*\(/gm);

    if (funcMatches) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^def\s+(\w+)\s*\(/);
        if (match) {
          const name = match[1];

          // Skip if already in exports
          if (capabilities.exports.some((e) => e.name === name)) continue;

          capabilities.functions.push(
            this.buildFunction(
              name,
              [],
              i + 1,
              path.relative(projectRoot, file)
            )
          );
        }
      }
    }

    // Async functions: async def foo(...):
    const asyncMatches = content.match(/^async\s+def\s+(\w+)\s*\(/gm);

    if (asyncMatches) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^async\s+def\s+(\w+)\s*\(/);
        if (match) {
          const name = match[1];

          if (capabilities.functions.some((f) => f.name === name)) continue;

          capabilities.functions.push(
            this.buildFunction(
              name,
              [],
              i + 1,
              path.relative(projectRoot, file)
            )
          );
        }
      }
    }
  }

  extractClasses(content, file, projectRoot, capabilities) {
    // Class definitions: class Foo(...):
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^class\s+(\w+)(?:\([^)]*\))?:/);
      if (match) {
        const name = match[1];

        // Extract methods from class body
        const methods = [];
        const baseIndent = lines[i].match(/^(\s*)/)[1].length;

        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];

          // Break if we reach a line with less indentation (class ended)
          const nextIndent = nextLine.match(/^(\s*)/)[1].length;
          if (nextIndent <= baseIndent && nextLine.trim().length > 0) {
            break;
          }

          // Extract methods
          const methodMatch = nextLine.match(/^\s+def\s+(\w+)\s*\(/);
          if (methodMatch) {
            const methodName = methodMatch[1];
            if (methodName !== "__init__") {
              methods.push({ name: methodName });
            }
          }
        }

        capabilities.classes.push(
          this.buildClass(
            name,
            methods,
            i + 1,
            path.relative(projectRoot, file)
          )
        );
      }
    }
  }

  extractPyprojectDeps(content, dependencies) {
    // Extract dependencies from [project] dependencies section
    const match = content.match(/\[project\]([\s\S]*?)\n\[/);
    if (!match) return;

    const depLines = match[1].match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (!depLines) return;

    const items = depLines[1].match(/"([^"]+)"/g);
    if (items) {
      for (const item of items) {
        const name = item.replace(/"/g, "").split(/[=!<>~]/)[0].trim();
        dependencies.direct[name] = "*";
      }
    }
  }
}

module.exports = { default: PythonLanguagePlugin };
