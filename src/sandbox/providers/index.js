"use strict";

const { ProcessSandboxProvider } = require("./process-provider");
const { DockerSandboxProvider } = require("./docker-provider");
const { E2BSandboxProvider } = require("./e2b-provider");

function normalizeStrategy(strategy) {
  return String(strategy || "process").trim().toLowerCase();
}

function createSandboxProvider(strategy, settings, logger) {
  const mode = normalizeStrategy(strategy);
  if (mode === "docker") return new DockerSandboxProvider(settings, logger);
  if (mode === "e2b") return new E2BSandboxProvider(settings, logger);
  return new ProcessSandboxProvider(settings, logger);
}

module.exports = {
  createSandboxProvider,
  normalizeStrategy,
  ProcessSandboxProvider,
  DockerSandboxProvider,
  E2BSandboxProvider,
};
