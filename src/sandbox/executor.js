"use strict";

function timeoutPromise(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Sandbox timeout exceeded (${ms}ms)`)), ms);
  });
}

async function executeInSandbox({ strategy, timeoutMs, logger, run }) {
  const mode = (strategy ?? "process").toLowerCase();
  const effectiveTimeout = timeoutMs ?? 120000;

  const executeLocal = async () => Promise.race([Promise.resolve(run()), timeoutPromise(effectiveTimeout)]);

  if (mode === "process") return executeLocal();

  if (mode === "docker") {
    logger?.log({
      event_type: "WARN",
      message: "Sandbox strategy 'docker' requested but container launcher is not configured; falling back to in-process execution.",
    });
    return executeLocal();
  }

  if (mode === "wasm") {
    logger?.log({
      event_type: "WARN",
      message: "Sandbox strategy 'wasm' requested but wasm runner is not configured; falling back to in-process execution.",
    });
    return executeLocal();
  }

  throw new Error(`Unknown sandbox strategy: ${strategy}`);
}

module.exports = { executeInSandbox };
