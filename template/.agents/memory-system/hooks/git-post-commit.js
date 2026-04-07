"use strict";
/**
 * .agents/memory-system/hooks/git-post-commit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Git post-commit hook
 * Automatically updates memory change log after commits
 *
 * Install with: ln -s ../../memory-system/hooks/git-post-commit.js .git/hooks/post-commit && chmod +x
 */

const { ChangeDetector } = require("../core/change-detector");
const path = require("path");

// Get project root - traverse up from this file's directory
// This file is at: {projectRoot}/.agents/memory-system/hooks/git-post-commit.js
// So we go up 3 levels: hooks -> memory-system -> .agents -> (projectRoot)
const projectRoot = path.resolve(path.dirname(__filename), "../../..");

try {
  const changeDetector = new ChangeDetector(projectRoot);

  // Log the change
  changeDetector.appendChangeLog({
    type: "post_commit",
    timestamp: new Date().toISOString(),
  });

  process.exit(0);
} catch (error) {
  // Silently fail - don't block git operations
  process.exit(0);
}
