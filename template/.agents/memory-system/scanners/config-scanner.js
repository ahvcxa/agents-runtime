"use strict";
/**
 * .agents/memory-system/scanners/config-scanner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans and catalogs configuration files in the project
 * Detects: build tools, frameworks, testing setup, etc.
 *
 * Exported: ConfigScanner class
 */

const fs = require("fs");
const path = require("path");

class ConfigScanner {
  /**
   * Scans project configuration
   * @param {string} projectRoot
   * @returns {Promise<Object>} Configuration metadata
   */
  async scan(projectRoot) {
    const config = {
      found_configs: [],
      frameworks: [],
      build_tools: [],
      test_runners: [],
      ci_cd: [],
      documentation: [],
    };

    const configFiles = [
      // JavaScript
      { name: "package.json", type: "npm", parser: "json" },
      { name: "tsconfig.json", type: "typescript", parser: "json" },
      { name: "webpack.config.js", type: "webpack", parser: "js" },
      { name: ".eslintrc.json", type: "eslint", parser: "json" },
      { name: "jest.config.js", type: "jest", parser: "js" },
      { name: "vitest.config.js", type: "vitest", parser: "js" },

      // Python
      { name: "setup.py", type: "setuptools", parser: "python" },
      { name: "pyproject.toml", type: "poetry/setuptools", parser: "toml" },
      { name: "tox.ini", type: "tox", parser: "ini" },
      { name: "pytest.ini", type: "pytest", parser: "ini" },

      // Go
      { name: "go.mod", type: "go-modules", parser: "text" },
      { name: "go.sum", type: "go-dependencies", parser: "text" },

      // Rust
      { name: "Cargo.toml", type: "cargo", parser: "toml" },
      { name: "Cargo.lock", type: "cargo-lock", parser: "text" },

      // Java
      { name: "pom.xml", type: "maven", parser: "xml" },
      { name: "build.gradle", type: "gradle", parser: "groovy" },

      // Build/CI
      { name: ".github/workflows", type: "github-actions", parser: "yaml" },
      { name: ".gitlab-ci.yml", type: "gitlab-ci", parser: "yaml" },
      { name: ".travis.yml", type: "travis-ci", parser: "yaml" },
      { name: "Jenkinsfile", type: "jenkins", parser: "groovy" },
      { name: "Makefile", type: "make", parser: "makefile" },

      // Documentation
      { name: "README.md", type: "readme", parser: "markdown" },
      { name: "docs", type: "documentation", parser: "directory" },
      { name: ".env.example", type: "env-template", parser: "text" },
    ];

    for (const configFile of configFiles) {
      const configPath = path.join(projectRoot, configFile.name);

      if (fs.existsSync(configPath)) {
        config.found_configs.push({
          name: configFile.name,
          type: configFile.type,
          path: configFile.name,
          exists: true,
        });

        // Categorize
        if (configFile.type.includes("test")) {
          config.test_runners.push(configFile.type);
        }
        if (
          [
            "webpack",
            "rollup",
            "vite",
            "parcel",
            "setuptools",
            "maven",
            "gradle",
            "cargo",
          ].includes(configFile.type)
        ) {
          config.build_tools.push(configFile.type);
        }
        if (configFile.type.includes("ci")) {
          config.ci_cd.push(configFile.type);
        }
        if (configFile.type.includes("doc")) {
          config.documentation.push(configFile.type);
        }

        // Detect frameworks from package.json
        if (configFile.name === "package.json") {
          try {
            const pkg = JSON.parse(fs.readFileSync(configPath, "utf8"));
            const frameworks = this.detectFrameworks(pkg);
            config.frameworks.push(...frameworks);
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    return config;
  }

  /**
   * Detects frameworks from package.json
   * @private
   */
  detectFrameworks(pkg) {
    const frameworks = [];
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const frameworkMap = {
      express: "Express.js",
      react: "React",
      vue: "Vue.js",
      angular: "Angular",
      next: "Next.js",
      gatsby: "Gatsby",
      nuxt: "Nuxt.js",
      svelte: "Svelte",
      fastapi: "FastAPI",
      django: "Django",
      flask: "Flask",
      rails: "Rails",
      spring: "Spring",
      "spring-boot": "Spring Boot",
    };

    for (const [key, name] of Object.entries(frameworkMap)) {
      if (deps[key]) {
        frameworks.push({
          name,
          package: key,
          version: deps[key],
        });
      }
    }

    return frameworks;
  }
}

module.exports = { default: ConfigScanner };
