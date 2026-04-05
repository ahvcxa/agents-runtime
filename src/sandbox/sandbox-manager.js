"use strict";

const { ISandbox } = require("../core/contracts/sandbox.contract");
const { executeInSandbox } = require("./executor");

class SandboxManager extends ISandbox {
  constructor(settings = {}, logger = null) {
    super(settings);
    this.settings = settings;
    this.logger = logger;
  }

  async init() {}

  async execute(payload = {}) {
    const strategy = payload.strategy ?? this.settings?.runtime?.sandbox?.strategy ?? "process";
    const sandboxSettings = payload.sandboxSettings ?? this.settings?.runtime?.sandbox ?? {};

    if (String(strategy).toLowerCase() === "e2b") {
      this.logger?.log?.({
        event_type: "WARN",
        message: "Sandbox strategy 'e2b' requested but provider is not configured; falling back to process sandbox.",
      });
      return executeInSandbox({ ...payload, strategy: "process", sandboxSettings });
    }

    return executeInSandbox({
      ...payload,
      strategy,
      sandboxSettings,
    });
  }

  async healthCheck() {
    const strategy = String(this.settings?.runtime?.sandbox?.strategy ?? "process").toLowerCase();
    if (strategy === "docker" && !this.settings?.runtime?.sandbox?.docker_enabled) {
      return {
        status: "degraded",
        checked_at: new Date().toISOString(),
        details: { reason: "docker strategy selected but docker_enabled=false; process fallback active" },
      };
    }

    if (strategy === "e2b") {
      return {
        status: "degraded",
        checked_at: new Date().toISOString(),
        details: { reason: "e2b provider not yet configured; process fallback active" },
      };
    }

    return {
      status: "healthy",
      checked_at: new Date().toISOString(),
      details: { strategy },
    };
  }

  async shutdown() {}
}

module.exports = { SandboxManager };
