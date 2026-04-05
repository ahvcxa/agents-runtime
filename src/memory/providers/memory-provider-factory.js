"use strict";

const { InProcessMemoryProvider } = require("./in-process-memory-provider");
const { SqliteMemoryProvider } = require("./sqlite-memory-provider");

function createMemoryProvider(settings = {}) {
  const cfg = {
    ...(settings?.runtime?.cognitive_memory ?? {}),
    project_root: settings?._projectRoot,
  };
  const provider = String(cfg.provider || "in-process").toLowerCase();

  if (provider === "in-process") {
    return new InProcessMemoryProvider(cfg);
  }

  if (provider === "sqlite" || provider === "sqlite-vss") {
    return new SqliteMemoryProvider(cfg);
  }

  throw new Error(`[memory-provider-factory] Unsupported cognitive memory provider: ${provider}`);
}

module.exports = { createMemoryProvider };
