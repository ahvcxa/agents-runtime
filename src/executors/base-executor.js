"use strict";
/**
 * src/executors/base-executor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Abstract base class for skill executors.
 * All concrete executors must implement `execute()`.
 */

class BaseExecutor {
  /**
   * Execute the skill.
   * @param {object} skillManifest
   * @param {string} agentId
   * @param {number} authLevel
   * @param {object} input
   * @param {object} memory
   * @param {Function} log
   * @param {string} [traceId]
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line no-unused-vars
  async execute(skillManifest, agentId, authLevel, input, memory, log, traceId) {
    throw new Error(`[${this.constructor.name}] execute() must be implemented`);
  }
}

module.exports = { BaseExecutor };
