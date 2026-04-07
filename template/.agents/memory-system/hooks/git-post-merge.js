"use strict";
/**
 * .agents/memory-system/hooks/git-post-merge.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Git post-merge hook
 * Automatically refreshes memory after merges or pulls
 *
 * Install with: ln -s ../../memory-system/hooks/git-post-merge.js .git/hooks/post-merge && chmod +x
 */

const { ProjectMemoryStore } = require("../core/project-memory-store");
const { ChangeDetector } = require("../core/change-detector");
const path = require("path");

// Get project root - traverse up from this file's directory
// This file is at: {projectRoot}/.agents/memory-system/hooks/git-post-merge.js
// So we go up 3 levels: hooks -> memory-system -> .agents -> (projectRoot)
const projectRoot = path.resolve(path.dirname(__filename), "../../..");

try {
  const store = new ProjectMemoryStore(projectRoot);
  const changeDetector = new ChangeDetector(projectRoot);

  // Check if memory exists
  const memory = store.loadMemory();

  if (memory) {
    // Do incremental update
    store.incrementalUpdate().catch(() => {
      // Silently fail
    });
  }

  // Log the merge
  changeDetector.appendChangeLog({
    type: "post_merge",
    timestamp: new Date().toISOString(),
  });

  process.exit(0);
} catch (error) {
  // Silently fail - don't block git operations
  process.exit(0);
}
