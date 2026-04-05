"use strict";

/**
 * ISandbox contract.
 *
 * Sandbox providers (process, Docker, E2B, WASM) implement this contract so
 * execution policy can be selected via config without changing orchestration.
 */
class ISandbox {
  constructor(config = {}) {
    this.config = config;
  }

  /** @returns {Promise<void>} */
  async init() {
    throw new Error("ISandbox.init() must be implemented");
  }

  /**
   * @param {object} payload
   * @param {Function} payload.run - callback for process sandbox
   * @param {number} payload.timeoutMs
   * @param {object} [payload.context]
   * @returns {Promise<any>}
   */
  async execute(payload) {
    throw new Error("ISandbox.execute() must be implemented");
  }

  /**
   * @returns {Promise<{status:"healthy"|"degraded"|"offline", checked_at:string, details?:object}>}
   */
  async healthCheck() {
    throw new Error("ISandbox.healthCheck() must be implemented");
  }

  /** @returns {Promise<void>} */
  async shutdown() {
    throw new Error("ISandbox.shutdown() must be implemented");
  }
}

module.exports = { ISandbox };
