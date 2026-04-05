"use strict";

const { executeInSandbox } = require("../executor");

class DockerSandboxProvider {
  constructor(settings = {}, logger = null) {
    this.settings = settings;
    this.logger = logger;
  }

  async init() {}

  async execute(payload = {}) {
    return executeInSandbox({
      ...payload,
      strategy: "docker",
      sandboxSettings: payload.sandboxSettings ?? this.settings?.runtime?.sandbox ?? {},
      logger: payload.logger ?? this.logger,
    });
  }

  async healthCheck() {
    const dockerEnabled = Boolean(this.settings?.runtime?.sandbox?.docker_enabled);
    if (!dockerEnabled) {
      return {
        status: "degraded",
        checked_at: new Date().toISOString(),
        details: { reason: "docker_enabled=false; process fallback expected" },
      };
    }
    return {
      status: "healthy",
      checked_at: new Date().toISOString(),
      details: { strategy: "docker" },
    };
  }

  async shutdown() {}
}

module.exports = { DockerSandboxProvider };
