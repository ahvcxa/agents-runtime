"use strict";

const { executeInSandbox } = require("../executor");

class ProcessSandboxProvider {
  constructor(settings = {}, logger = null) {
    this.settings = settings;
    this.logger = logger;
  }

  async init() {}

  async execute(payload = {}) {
    return executeInSandbox({
      ...payload,
      strategy: "process",
      sandboxSettings: payload.sandboxSettings ?? this.settings?.runtime?.sandbox ?? {},
    });
  }

  async healthCheck() {
    return {
      status: "healthy",
      checked_at: new Date().toISOString(),
      details: { strategy: "process" },
    };
  }

  async shutdown() {}
}

module.exports = { ProcessSandboxProvider };
