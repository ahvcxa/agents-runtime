"use strict";
/**
 * .agents/doc-generator/handler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Documentation Generator Skill Handler
 * 
 * Generates README, API docs, and architecture documentation
 * 
 * Authorization Level: 2 (write capability)
 * 
 * @param {object} ctx - { agentId, authLevel, input, memory, log }
 * @returns {Promise<{ generated_docs, summary }>}
 */

const fs = require("fs");
const path = require("path");
const { generateReadme } = require("./lib/readme-builder");
const { generateApiDocs } = require("./lib/api-documenter");
const { generateChangelog } = require("./lib/changelog-generator");
const { extractJsDoc } = require("./lib/jsdoc-parser");

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function handler(ctx) {
  const { agentId, authLevel, input, memory, log } = ctx;

  log.info(`[${agentId}] Documentation generation starting`);

  // Authorization check
  if (authLevel < 2) {
    throw new Error("doc-generator requires authorization level >= 2");
  }

  const {
    project_root = process.cwd(),
    include_readme = true,
    include_api_docs = true,
    include_changelog = false,
    package_json = null,
    git_history = [],
    dry_run = true,
    findings = []
  } = input;

  const generated = [];
  const errors = [];
  let totalLines = 0;

  // Generate README
  if (include_readme) {
    try {
      log.debug("Generating README.md");
      const readme = generateReadme({
        project_root,
        package_json,
        findings
      });

      const lines = readme.split("\n").length;
      totalLines += lines;

      if (!dry_run) {
        const readmePath = path.join(project_root, "README.md");
        fs.writeFileSync(readmePath, readme, "utf8");
        log.info("README.md written");
      }

      generated.push({
        file: "README.md",
        type: "readme",
        lines,
        sections: ["Overview", "Installation", "Usage", "Contributing"],
        doc_id: uuid()
      });
    } catch (err) {
      log.error(`Failed to generate README: ${err.message}`);
      errors.push({ file: "README.md", error: err.message });
    }
  }

  // Generate API Docs
  if (include_api_docs) {
    try {
      log.debug("Generating API.md");
      
      // Extract JSDoc from source files
      const jsDocData = extractJsDoc(project_root);
      const apiDocs = generateApiDocs(jsDocData);

      const lines = apiDocs.split("\n").length;
      totalLines += lines;

      if (!dry_run && lines > 0) {
        const apiPath = path.join(project_root, "docs", "API.md");
        const docsDir = path.dirname(apiPath);
        
        if (!fs.existsSync(docsDir)) {
          fs.mkdirSync(docsDir, { recursive: true });
        }

        fs.writeFileSync(apiPath, apiDocs, "utf8");
        log.info("API.md written");
      }

      if (lines > 0) {
        generated.push({
          file: "docs/API.md",
          type: "api",
          lines,
          methods_documented: jsDocData.length,
          doc_id: uuid()
        });
      }
    } catch (err) {
      log.error(`Failed to generate API docs: ${err.message}`);
      errors.push({ file: "API.md", error: err.message });
    }
  }

  // Generate Changelog
  if (include_changelog) {
    try {
      log.debug("Generating CHANGELOG.md");
      const changelog = generateChangelog(git_history);

      const lines = changelog.split("\n").length;
      totalLines += lines;

      if (!dry_run && lines > 0) {
        const changelogPath = path.join(project_root, "CHANGELOG.md");
        fs.writeFileSync(changelogPath, changelog, "utf8");
        log.info("CHANGELOG.md written");
      }

      if (lines > 0) {
        generated.push({
          file: "CHANGELOG.md",
          type: "changelog",
          lines,
          entries: git_history.length,
          doc_id: uuid()
        });
      }
    } catch (err) {
      log.error(`Failed to generate changelog: ${err.message}`);
      errors.push({ file: "CHANGELOG.md", error: err.message });
    }
  }

  const summary = {
    total_generated: generated.length,
    total_lines: totalLines,
    errors_count: errors.length,
    dry_run,
    timestamp: new Date().toISOString()
  };

  log.info(`[${agentId}] Documentation generation complete`, {
    generated: generated.length,
    lines: totalLines
  });

  return {
    generated_docs: generated,
    errors,
    summary
  };
}

module.exports = { handler };
