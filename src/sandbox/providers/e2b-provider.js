"use strict";

const { executeInSandbox } = require("../executor");

class E2BSandboxProvider {
  constructor(settings = {}, logger = null) {
    this.settings = settings;
    this.logger = logger;
  }

  async init() {}

  async execute(payload = {}) {
    this.logger?.log?.({
      event_type: "WARN",
      message: "E2B provider requested but not configured; falling back to process sandbox.",
    });
    return executeInSandbox({
      ...payload,
      strategy: "process",
      sandboxSettings: payload.sandboxSettings ?? this.settings?.runtime?.sandbox ?? {},
      logger: payload.logger ?? this.logger,
    });
  }

  async healthCheck() {
    return {
      status: "degraded",
      checked_at: new Date().toISOString(),
      details: { reason: "E2B provider not configured; process fallback active" },
    };
  }

  async shutdown() {}
}

module.exports = { E2BSandboxProvider };
