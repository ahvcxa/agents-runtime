"use strict";

/**
 * IMemoryProvider contract.
 *
 * v2.0 cognitive layer providers (short-term session memory, long-term vector
 * stores, hybrid retrieval) should implement this interface so orchestration
 * remains backend-agnostic.
 */
class IMemoryProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /** @returns {Promise<void>} */
  async init() {
    throw new Error("IMemoryProvider.init() must be implemented");
  }

  /**
   * @param {string} key
   * @param {any} value
   * @param {object} [options]
   * @returns {Promise<void>}
   */
  async store(key, value, options = {}) {
    throw new Error("IMemoryProvider.store() must be implemented");
  }

  /**
   * @param {string} key
   * @param {object} [options]
   * @returns {Promise<any>}
   */
  async retrieve(key, options = {}) {
    throw new Error("IMemoryProvider.retrieve() must be implemented");
  }

  /**
   * @param {string} query
   * @param {object} [options]
   * @returns {Promise<any[]>}
   */
  async semanticSearch(query, options = {}) {
    throw new Error("IMemoryProvider.semanticSearch() must be implemented");
  }

  /** @returns {Promise<void>} */
  async shutdown() {
    throw new Error("IMemoryProvider.shutdown() must be implemented");
  }
}

module.exports = { IMemoryProvider };
