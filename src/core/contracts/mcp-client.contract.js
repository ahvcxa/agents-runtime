"use strict";

/**
 * IMCPClient contract.
 *
 * Any MCP client implementation (stdio, streamable-http, SSE fallback) must
 * implement this interface so orchestration logic can stay transport-agnostic.
 */
class IMCPClient {
  constructor(config = {}) {
    this.config = config;
  }

  /** Initialize connection/session with remote MCP server. */
  async init() {
    throw new Error("IMCPClient.init() must be implemented");
  }

  /**
   * Discover server tools.
   * @returns {Promise<Array<{name:string, description?:string, input_schema?:object}>>}
   */
  async discoverTools() {
    throw new Error("IMCPClient.discoverTools() must be implemented");
  }

  /**
   * Call a remote MCP tool.
   * @param {string} toolName
   * @param {object} input
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async callTool(toolName, input = {}, options = {}) {
    throw new Error("IMCPClient.callTool() must be implemented");
  }

  /**
   * Probe health of this MCP connection.
   * @returns {Promise<{status:"healthy"|"degraded"|"offline", checked_at:string, last_error?:string}>}
   */
  async healthCheck() {
    throw new Error("IMCPClient.healthCheck() must be implemented");
  }

  /** Graceful close. */
  async shutdown() {
    throw new Error("IMCPClient.shutdown() must be implemented");
  }
}

module.exports = { IMCPClient };
