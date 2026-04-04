"use strict";
/**
 * src/diff/run-history-store.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists skill run results to .agents/runs/<skillId>/ as timestamped JSON.
 * Enables trend and diff analysis across multiple runs.
 */

const path   = require("path");
const fs     = require("fs");
const fsp    = require("fs/promises");
const { spawnSync } = require("child_process");

// ─── Git helper ───────────────────────────────────────────────────────────────

/**
 * Get the current git commit SHA (short), or "no-git" if unavailable.
 * @param {string} cwd
 * @returns {string}
 */
function currentGitSha(cwd) {
  try {
    const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd, encoding: "utf8", timeout: 2000,
    });
    return result.stdout?.trim() || "no-git";
  } catch {
    return "no-git";
  }
}

// ─── RunHistoryStore ──────────────────────────────────────────────────────────

class RunHistoryStore {
  /**
   * @param {string} projectRoot - Absolute path to the project root
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.baseDir     = path.join(projectRoot, ".agents", "runs");
  }

  /**
   * Directory for a specific skill's run history.
   * @param {string} skillId
   * @returns {string}
   */
  _skillDir(skillId) {
    // Sanitize skillId to prevent path traversal
    const safe = skillId.replace(/[^a-z0-9\-_]/g, "_");
    return path.join(this.baseDir, safe);
  }

  /**
   * Save a run result to disk.
   * @param {string} skillId
   * @param {object} result    - Skill result (findings, etc.)
   * @param {object} [meta]    - Extra metadata (agent_id, input, etc.)
   * @returns {Promise<string>} Absolute path of the written file
   */
  async save(skillId, result, meta = {}) {
    const skillDir = this._skillDir(skillId);
    await fsp.mkdir(skillDir, { recursive: true });

    const sha       = currentGitSha(this.projectRoot);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename  = `${timestamp}__${sha}.json`;
    const filePath  = path.join(skillDir, filename);

    const record = {
      skill_id:  skillId,
      timestamp: new Date().toISOString(),
      git_sha:   sha,
      meta,
      result,
    };

    await fsp.writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
    return filePath;
  }

  /**
   * List recent runs for a skill, newest first.
   * @param {string} skillId
   * @param {number} [limit=50]
   * @returns {Promise<Array<{filename, timestamp, git_sha, filePath}>>}
   */
  async list(skillId, limit = 50) {
    const skillDir = this._skillDir(skillId);
    if (!fs.existsSync(skillDir)) return [];

    const files = (await fsp.readdir(skillDir))
      .filter(f => f.endsWith(".json"))
      .sort()        // ISO timestamps sort lexicographically
      .reverse()     // newest first
      .slice(0, limit);

    return files.map(filename => {
      const [timestamp, gitPart] = filename.replace(".json", "").split("__");
      return {
        filename,
        timestamp: timestamp.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ":$1:$2.$3Z"),
        git_sha:   gitPart ?? "unknown",
        filePath:  path.join(skillDir, filename),
      };
    });
  }

  /**
   * Load a specific run record by index (0 = most recent) or git SHA.
   * @param {string} skillId
   * @param {number|string} [ref=0] - Index (number) or git SHA prefix (string)
   * @returns {Promise<object|null>}
   */
  async load(skillId, ref = 0) {
    const runs = await this.list(skillId);
    if (runs.length === 0) return null;

    let entry;
    if (typeof ref === "number") {
      entry = runs[ref] ?? null;
    } else {
      // Match by git SHA prefix
      entry = runs.find(r => r.git_sha.startsWith(ref)) ?? null;
    }

    if (!entry) return null;

    try {
      const raw = await fsp.readFile(entry.filePath, "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Load two runs for comparison: current (most recent) and baseline.
   * @param {string} skillId
   * @param {object} [options]
   * @param {number|string} [options.baselineRef=1] - ref for the baseline run
   * @returns {Promise<{current: object|null, baseline: object|null}>}
   */
  async loadPair(skillId, options = {}) {
    const baselineRef = options.baselineRef ?? 1;
    const [current, baseline] = await Promise.all([
      this.load(skillId, 0),
      this.load(skillId, baselineRef),
    ]);
    return { current, baseline };
  }
}

module.exports = { RunHistoryStore };
