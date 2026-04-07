"use strict";
/**
 * .agents/memory-system/scanners/language-plugins/javascript-plugin.js
 * ─────────────────────────────────────────────────────────────────────────────
 * JavaScript/TypeScript language plugin
 * Scans for exports, functions, classes, and dependencies
 *
 * Exported: JavaScriptLanguagePlugin class
 */

const path = require("path");
const { BaseLanguagePlugin } = require("./base-plugin");

class JavaScriptLanguagePlugin extends BaseLanguagePlugin {
  static language = "javascript";
  static version = "1.0.0";
  static supportedVersions = ["14.0.0", "20.0.0"];

  static canHandle(filePath) {
    return /\.(js|mjs|cjs|ts|tsx|jsx)$/.test(filePath);
  }

  /**
   * Scans JavaScript/TypeScript files for exports and APIs
   */
  async scanCapabilities(projectRoot) {
    const capabilities = {
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      types: [],
    };

    // Scan main entry points
    const entryFiles = [
      path.join(projectRoot, "index.js"),
      path.join(projectRoot, "index.ts"),
      path.join(projectRoot, "src/index.js"),
      path.join(projectRoot, "src/index.ts"),
      path.join(projectRoot, "lib/index.js"),
      path.join(projectRoot, "lib/index.ts"),
    ];

    for (const file of entryFiles) {
      const content = this.readFileSafe(file);
      if (!content) continue;

      this.extractExports(content, file, projectRoot, capabilities);
      this.extractFunctions(content, file, projectRoot, capabilities);
      this.extractClasses(content, file, projectRoot, capabilities);
      this.extractInterfaces(content, file, projectRoot, capabilities);
    }

    return capabilities;
  }

  /**
   * Scans for dependencies (package.json)
   */
  async scanDependencies(projectRoot) {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const content = this.readFileSafe(packageJsonPath);

    if (!content) {
      return {
        direct: {},
        dev: {},
        peer: {},
        error: "package.json not found",
      };
    }

    const pkg = this.parseJsonSafe(content);
    if (!pkg) {
      return { direct: {}, error: "Failed to parse package.json" };
    }

    return {
      direct: pkg.dependencies || {},
      dev: pkg.devDependencies || {},
      peer: pkg.peerDependencies || {},
      optional: pkg.optionalDependencies || {},
      manager: "npm",
      lock_file: this.detectLockFile(projectRoot),
      scripts: Object.keys(pkg.scripts || {}),
    };
  }

  /**
   * Gets JavaScript framework used
   */
  async getFramework(projectRoot) {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const content = this.readFileSafe(packageJsonPath);
    const pkg = this.parseJsonSafe(content) || {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const frameworks = [
      { package: "react", name: "React" },
      { package: "vue", name: "Vue.js" },
      { package: "angular", name: "Angular" },
      { package: "next", name: "Next.js" },
      { package: "nuxt", name: "Nuxt.js" },
      { package: "gatsby", name: "Gatsby" },
      { package: "svelte", name: "Svelte" },
      { package: "express", name: "Express.js" },
      { package: "fastify", name: "Fastify" },
      { package: "nest", name: "NestJS" },
    ];

    for (const fw of frameworks) {
      if (deps[fw.package]) {
        return {
          name: fw.name,
          package: fw.package,
          version: deps[fw.package],
        };
      }
    }

    return { name: null, version: null };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  extractExports(content, file, projectRoot, capabilities) {
    // ES6 exports: export const foo, export function bar, export class Baz
    const esExports = content.match(
      /export\s+(default\s+)?(?:const|function|class|async\s+function|interface|type)\s+(\w+)/g
    );

    if (esExports) {
      for (const match of esExports) {
        const name = match
          .replace(/export\s+(default\s+)?(?:const|function|class|async\s+function|interface|type)\s+/, "")
          .trim();

        const line = content.substring(0, content.indexOf(match)).split("\n")
          .length;

        capabilities.exports.push(
          this.buildExport(
            name,
            match.includes("default") ? "default" : "named",
            line,
            path.relative(projectRoot, file)
          )
        );
      }
    }

    // CommonJS exports: module.exports = foo
    const cjsExports = content.match(/module\.exports\s*=\s*(\w+)/g);
    if (cjsExports) {
      for (const match of cjsExports) {
        const name = match.replace(/module\.exports\s*=\s*/, "").trim();
        const line = content.substring(0, content.indexOf(match)).split("\n")
          .length;

        capabilities.exports.push(
          this.buildExport(
            name,
            "commonjs",
            line,
            path.relative(projectRoot, file)
          )
        );
      }
    }
  }

  extractFunctions(content, file, projectRoot, capabilities) {
    // Function declarations: function foo(...) { ... }
    const funcDeclares = content.match(
      /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g
    );

    if (funcDeclares) {
      for (const match of funcDeclares) {
        const name = match.replace(/(?:async\s+)?function\s+/, "").replace(/\s*\([^)]*\)/, "");
        const line = content.substring(0, content.indexOf(match)).split("\n")
          .length;

        // Skip if already in exports
        if (capabilities.exports.some((e) => e.name === name)) continue;

        capabilities.functions.push(
          this.buildFunction(
            name,
            [],
            line,
            path.relative(projectRoot, file)
          )
        );
      }
    }

    // Arrow functions: const foo = (...) => { ... }
    const arrowFuncs = content.match(/const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g);

    if (arrowFuncs) {
      for (const match of arrowFuncs) {
        const name = match.replace(/const\s+/, "").replace(/\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/, "");
        const line = content.substring(0, content.indexOf(match)).split("\n")
          .length;

        if (capabilities.functions.some((f) => f.name === name)) continue;

        capabilities.functions.push(
          this.buildFunction(
            name,
            [],
            line,
            path.relative(projectRoot, file)
          )
        );
      }
    }
  }

  extractClasses(content, file, projectRoot, capabilities) {
    // Class declarations: class Foo { ... }
    const classDecl = content.match(/class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/g);

    if (classDecl) {
      for (const match of classDecl) {
        const parts = match.match(/class\s+(\w+)/);
        if (!parts) continue;

        const name = parts[1];
        const line = content.substring(0, content.indexOf(match)).split("\n")
          .length;

        // Extract methods
        const methodRegex = new RegExp(
          `class ${name}[^{]*\\{[^}]*(?:${name}[^}]*|[^c])*\\}`,
          "s"
        );
        const classBody = content.match(methodRegex)?.[0] || "";
        const methods = this.extractMethods(classBody);

        capabilities.classes.push(
          this.buildClass(
            name,
            methods,
            line,
            path.relative(projectRoot, file)
          )
        );
      }
    }
  }

  extractInterfaces(content, file, projectRoot, capabilities) {
    // TypeScript interfaces: interface Foo { ... }
    const interfaceDecl = content.match(/interface\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/g);

    if (interfaceDecl) {
      for (const match of interfaceDecl) {
        const name = match.replace(/interface\s+/, "").replace(/\s*{/, "").trim();
        const line = content.substring(0, content.indexOf(match)).split("\n")
          .length;

        capabilities.interfaces.push({
          name,
          line,
          file: path.relative(projectRoot, file),
        });
      }
    }

    // TypeScript types: type Foo = ...
    const typeDecl = content.match(/type\s+(\w+)\s*=/g);

    if (typeDecl) {
      for (const match of typeDecl) {
        const name = match.replace(/type\s+/, "").replace(/\s*=/, "");
        const line = content.substring(0, content.indexOf(match)).split("\n")
          .length;

        capabilities.types.push({
          name,
          line,
          file: path.relative(projectRoot, file),
        });
      }
    }
  }

  extractMethods(classBody) {
    // Extract method names from class body
    const methods = [];
    const methodMatches = classBody.match(/(\w+)\s*\([^)]*\)\s*{/g);

    if (methodMatches) {
      for (const match of methodMatches) {
        const name = match.replace(/\s*\([^)]*\)\s*{/, "").trim();
        if (name !== "constructor") {
          methods.push({ name });
        }
      }
    }

    return methods;
  }

  detectLockFile(projectRoot) {
    const fs = require("fs");

    if (fs.existsSync(path.join(projectRoot, "package-lock.json"))) {
      return "package-lock.json";
    }
    if (fs.existsSync(path.join(projectRoot, "yarn.lock"))) {
      return "yarn.lock";
    }
    if (fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml"))) {
      return "pnpm-lock.yaml";
    }

    return null;
  }
}

module.exports = { default: JavaScriptLanguagePlugin };
