"use strict";
/**
 * .agents/memory-system/setup-hooks.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Git hooks installer for memory system
 * Called during setup-agents.sh to install post-commit and post-merge hooks
 *
 * Usage:
 *   const { installGitHooks } = require('./setup-hooks.js');
 *   const result = installGitHooks(projectRoot);
 */

const fs = require("fs");
const path = require("path");

/**
 * Installs git hooks for memory system
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Options object
 * @param {boolean} options.verbose - Verbose logging
 * @returns {Object} Result object with success flag and messages
 */
function installGitHooks(projectRoot, options = {}) {
  const { verbose = false } = options;
  const hooksDir = path.join(projectRoot, ".git/hooks");
  const results = {
    success: true,
    installed: [],
    errors: [],
    warnings: [],
  };

  try {
    // Check if .git/hooks directory exists
    if (!fs.existsSync(hooksDir)) {
      results.errors.push(
        `Git hooks directory not found: ${hooksDir}. Make sure you're in a git repository.`
      );
      results.success = false;
      return results;
    }

    // Create post-commit hook
    const postCommitPath = path.join(hooksDir, "post-commit");
    const postCommitScript = `#!/bin/bash
# Git post-commit hook
# Automatically updates memory change log after commits

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"
node "./.agents/memory-system/hooks/git-post-commit.js" 2>/dev/null
exit 0
`;

    try {
      fs.writeFileSync(postCommitPath, postCommitScript, "utf8");
      fs.chmodSync(postCommitPath, 0o755);
      results.installed.push("post-commit");
      if (verbose) console.log(`  ✓ Created ${postCommitPath}`);
    } catch (err) {
      results.errors.push(
        `Failed to create post-commit hook: ${err.message}`
      );
      results.success = false;
    }

    // Create post-merge hook
    const postMergePath = path.join(hooksDir, "post-merge");
    const postMergeScript = `#!/bin/bash
# Git post-merge hook
# Automatically refreshes memory after merges

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"
node "./.agents/memory-system/hooks/git-post-merge.js" 2>/dev/null
exit 0
`;

    try {
      fs.writeFileSync(postMergePath, postMergeScript, "utf8");
      fs.chmodSync(postMergePath, 0o755);
      results.installed.push("post-merge");
      if (verbose) console.log(`  ✓ Created ${postMergePath}`);
    } catch (err) {
      results.errors.push(`Failed to create post-merge hook: ${err.message}`);
      results.success = false;
    }

    // Verify hooks are executable
    if (fs.existsSync(postCommitPath)) {
      const stats = fs.statSync(postCommitPath);
      if ((stats.mode & 0o100) === 0) {
        results.warnings.push("post-commit hook is not executable");
      }
    }

    if (fs.existsSync(postMergePath)) {
      const stats = fs.statSync(postMergePath);
      if ((stats.mode & 0o100) === 0) {
        results.warnings.push("post-merge hook is not executable");
      }
    }
  } catch (err) {
    results.errors.push(`Unexpected error during hook installation: ${err.message}`);
    results.success = false;
  }

  return results;
}

/**
 * Verifies that git hooks are installed and working
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Verification results
 */
function verifyGitHooks(projectRoot) {
  const hooksDir = path.join(projectRoot, ".git/hooks");
  const verification = {
    postCommitExists: false,
    postMergeExists: false,
    postCommitExecutable: false,
    postMergeExecutable: false,
  };

  const postCommitPath = path.join(hooksDir, "post-commit");
  const postMergePath = path.join(hooksDir, "post-merge");

  if (fs.existsSync(postCommitPath)) {
    verification.postCommitExists = true;
    const stats = fs.statSync(postCommitPath);
    verification.postCommitExecutable = (stats.mode & 0o100) !== 0;
  }

  if (fs.existsSync(postMergePath)) {
    verification.postMergeExists = true;
    const stats = fs.statSync(postMergePath);
    verification.postMergeExecutable = (stats.mode & 0o100) !== 0;
  }

  return verification;
}

module.exports = {
  installGitHooks,
  verifyGitHooks,
};
