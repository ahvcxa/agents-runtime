"use strict";

const { InProcessMemoryProvider } = require("./in-process-memory-provider");

function createMemoryProvider(settings = {}) {
  const cfg = settings?.runtime?.cognitive_memory ?? {};
  const provider = String(cfg.provider || "in-process").toLowerCase();

  if (provider === "in-process") {
    return new InProcessMemoryProvider(cfg);
  }

  throw new Error(`[memory-provider-factory] Unsupported cognitive memory provider: ${provider}`);
}

module.exports = { createMemoryProvider };
