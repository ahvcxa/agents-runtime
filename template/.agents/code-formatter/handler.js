"use strict";
/**
 * .agents/code-formatter/handler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Code Formatter Skill Handler
 * 
 * Fixes code style, formatting, imports, and unused variables
 * Supports Prettier, ESLint, and custom formatting rules
 * 
 * Authorization Level: 2 (write capability)
 * 
 * @param {object} ctx - { agentId, authLevel, input, memory, log }
 * @returns {Promise<{ fixed_files, summary }>}
 */

const fs = require("fs");
const path = require("path");
const { formatWithPrettier } = require("./lib/prettier-wrapper");
const { fixWithEslint } = require("./lib/eslint-wrapper");
const { optimizeImports } = require("./lib/import-optimizer");
const { removeUnusedCode } = require("./lib/unused-remover");

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function handler(ctx) {
  const { agentId, authLevel, input, memory, log } = ctx;

  log.info(`[${agentId}] Code formatting starting`);

  // Authorization check
  if (authLevel < 2) {
    throw new Error("code-formatter requires authorization level >= 2");
  }

  const {
    files = [],
    project_root = process.cwd(),
    config = "prettier",
    rules = ["format", "imports", "unused"],
    dry_run = true,
    findings = []
  } = input;

  if (!files || files.length === 0) {
    return {
      fixed_files: [],
      summary: {
        total_fixed: 0,
        total_changes: 0,
        message: "No files specified for formatting"
      }
    };
  }

  const fixed = [];
  const errors = [];
  let totalChanges = 0;

  for (const file of files) {
    try {
      const filePath = path.join(project_root, file);

      if (!fs.existsSync(filePath)) {
        log.warn(`File not found: ${filePath}`);
        continue;
      }

      let content = fs.readFileSync(filePath, "utf8");
      const originalContent = content;
      let changeCount = 0;

      // Apply formatting rules
      if (rules.includes("format") && config === "prettier") {
        content = formatWithPrettier(content, file);
        if (content !== originalContent) changeCount++;
      }

      if (rules.includes("imports")) {
        const optimized = optimizeImports(content, file);
        if (optimized !== content) {
          content = optimized;
          changeCount++;
        }
      }

      if (rules.includes("unused")) {
        const cleaned = removeUnusedCode(content, file);
        if (cleaned !== content) {
          content = cleaned;
          changeCount++;
        }
      }

      if (rules.includes("eslint")) {
        content = fixWithEslint(content, file);
        if (content !== originalContent) changeCount++;
      }

      // Calculate diff
      const diff = calculateDiff(originalContent, content);
      totalChanges += diff.length;

      if (!dry_run && content !== originalContent) {
        fs.writeFileSync(filePath, content, "utf8");
        log.info(`File formatted: ${file}`);
      }

      if (changeCount > 0) {
        fixed.push({
          file,
          changes: changeCount,
          lines_affected: diff.length,
          status: dry_run ? "preview" : "applied",
          diff: diff.slice(0, 5) // First 5 changes
        });
      }

    } catch (err) {
      log.error(`Failed to format ${file}: ${err.message}`);
      errors.push({
        file,
        error: err.message
      });
    }
  }

  const summary = {
    total_fixed: fixed.length,
    total_changes: totalChanges,
    errors_count: errors.length,
    dry_run,
    timestamp: new Date().toISOString(),
    rules_applied: rules.join(", ")
  };

  log.info(`[${agentId}] Code formatting complete`, {
    fixed: fixed.length,
    changes: totalChanges
  });

  return {
    fixed_files: fixed,
    errors,
    summary
  };
}

function calculateDiff(original, modified) {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const changes = [];

  for (let i = 0; i < Math.max(origLines.length, modLines.length); i++) {
    if (origLines[i] !== modLines[i]) {
      changes.push({
        line: i + 1,
        before: origLines[i] || "",
        after: modLines[i] || ""
      });
    }
  }

  return changes;
}

module.exports = { handler };
