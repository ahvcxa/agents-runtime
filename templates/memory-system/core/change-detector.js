"use strict";
/**
 * .agents/memory-system/core/change-detector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects changes in the project by comparing current state with last scan
 * Uses git diff for accurate change tracking (if in git repo)
 *
 * Exported: ChangeDetector class
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const crypto = require("crypto");

class ChangeDetector {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.changeLogPath = path.join(projectRoot, ".agents/memory/change-log.json");
  }

  /**
   * Detects what changed since last scan
   * @returns {Promise<Object>} Change summary
   */
  async detectChanges() {
    const currentLog = this.loadChangeLog();
    const lastEntry = currentLog.length > 0 ? currentLog[currentLog.length - 1] : null;

    // If we're in a git repo, use git diff
    if (this.isGitRepo()) {
      return this.detectChangesViaGit(lastEntry);
    }

    // Fallback: use file hashing
    return this.detectChangesViaHashing(lastEntry);
  }

  /**
   * Uses git diff to detect changes (most reliable)
   * @returns {Object} Change summary
   */
  detectChangesViaGit(lastEntry) {
    try {
      let gitCmd;
      let ref = "HEAD";

      if (lastEntry && lastEntry.git_commit_hash) {
        // Compare with last scanned commit
        ref = `${lastEntry.git_commit_hash}..HEAD`;
      }

      const output = execFileSync("git", ["diff", "--name-status", ref], {
        cwd: this.projectRoot,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"], // Suppress errors
      });

      const changes = {};
      const lines = output.trim().split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        const [status, file] = line.split(/\s+/);
        if (!changes[status]) changes[status] = [];
        changes[status].push(file);
      }

      // Get current commit hash
      const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: this.projectRoot,
        encoding: "utf8",
      }).trim();

      return {
        type: "git",
        modified: changes["M"] || [],
        added: changes["A"] || [],
        deleted: changes["D"] || [],
        renamed: changes["R"] || [],
        current_commit: currentCommit,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return { type: "git", error: true };
    }
  }

  /**
   * Fallback: detects changes via file hashing
   * @returns {Object} Change summary
   */
  detectChangesViaHashing(lastEntry) {
    const modified = [];
    const added = [];
    const deleted = [];

    const currentHashes = this.computeFileHashes();
    const lastHashes = lastEntry?.file_hashes || {};

    // Find modified and added files
    for (const [file, hash] of Object.entries(currentHashes)) {
      if (!lastHashes[file]) {
        added.push(file);
      } else if (lastHashes[file] !== hash) {
        modified.push(file);
      }
    }

    // Find deleted files
    for (const file of Object.keys(lastHashes)) {
      if (!currentHashes[file]) {
        deleted.push(file);
      }
    }

    return {
      type: "hash",
      modified,
      added,
      deleted,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Checks if project is a git repository
   * @returns {boolean}
   */
  isGitRepo() {
    try {
      execFileSync("git", ["rev-parse", "--git-dir"], {
        cwd: this.projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Computes file hashes for change detection
   * @returns {Object} File -> hash mapping
   */
  computeFileHashes() {
    const hashes = {};

    function walk(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.name.startsWith(".") ||
            [
              "node_modules",
              "vendor",
              "dist",
              "build",
              "coverage",
              ".agents/memory",
            ].includes(entry.name)
          ) {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.projectRoot, fullPath);

          if (entry.isDirectory()) {
            walk(fullPath);
          } else {
            try {
              const content = fs.readFileSync(fullPath, "utf8");
              const hash = crypto
                .createHash("md5")
                .update(content)
                .digest("hex");
              hashes[relativePath] = hash;
            } catch {
              // Ignore read errors
            }
          }
        }
      } catch {
        // Ignore directory errors
      }
    }

    walk(this.projectRoot);
    return hashes;
  }

  /**
   * Loads change log from disk
   * @returns {Array} Change log entries
   */
  loadChangeLog() {
    try {
      if (fs.existsSync(this.changeLogPath)) {
        const content = fs.readFileSync(this.changeLogPath, "utf8");
        return JSON.parse(content);
      }
    } catch {
      // Ignore load errors
    }
    return [];
  }

  /**
   * Appends change entry to log
   * @param {Object} entry - Change entry to log
   */
  appendChangeLog(entry) {
    try {
      const log = this.loadChangeLog();
      log.push({
        ...entry,
        timestamp: new Date().toISOString(),
      });

      // Keep only last 100 entries for performance
      if (log.length > 100) {
        log.shift();
      }

      fs.mkdirSync(path.dirname(this.changeLogPath), { recursive: true });
      fs.writeFileSync(this.changeLogPath, JSON.stringify(log, null, 2));
    } catch {
      // Silently fail - change log is optional
    }
  }

  /**
   * Gets summary of all changes since last scan
   * @returns {Object} Summary
   */
  async getSummary() {
    const changes = await this.detectChanges();
    const total =
      (changes.modified?.length || 0) +
      (changes.added?.length || 0) +
      (changes.deleted?.length || 0);

    return {
      type: changes.type,
      total_changes: total,
      breakdown: {
        modified: changes.modified?.length || 0,
        added: changes.added?.length || 0,
        deleted: changes.deleted?.length || 0,
        renamed: changes.renamed?.length || 0,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { ChangeDetector };
