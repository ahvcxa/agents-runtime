"use strict";

const { ISandbox } = require("../core/contracts/sandbox.contract");
const { createSandboxProvider, normalizeStrategy } = require("./providers");

class SandboxManager extends ISandbox {
  constructor(settings = {}, logger = null) {
    super(settings);
    this.settings = settings;
    this.logger = logger;
    this.providers = new Map();
  }

  async init() {
    const configured = normalizeStrategy(this.settings?.runtime?.sandbox?.strategy ?? "process");
    this.providers.set("process", createSandboxProvider("process", this.settings, this.logger));
    this.providers.set("docker", createSandboxProvider("docker", this.settings, this.logger));
    this.providers.set("e2b", createSandboxProvider("e2b", this.settings, this.logger));

    for (const provider of this.providers.values()) {
      await provider.init();
    }

    this.activeStrategy = configured;
  }

  async execute(payload = {}) {
    const strategy = normalizeStrategy(payload.strategy ?? this.activeStrategy ?? "process");
    const provider = this.providers.get(strategy) || this.providers.get("process");
    return provider.execute(payload);
  }

  async healthCheck() {
    const strategy = this.activeStrategy ?? normalizeStrategy(this.settings?.runtime?.sandbox?.strategy ?? "process");
    const provider = this.providers.get(strategy) || this.providers.get("process");
    const health = await provider.healthCheck();
    return {
      ...health,
      details: {
        strategy,
        ...(health.details || {}),
      },
    };
  }

  async shutdown() {
    for (const provider of this.providers.values()) {
      await provider.shutdown();
    }
    this.providers.clear();
  }
}

module.exports = { SandboxManager };
