"use strict";

const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// ─── Security: Docker binary whitelist ────────────────────────────────────────
/**
 * Allowed Docker binary paths.
 * Prevents command injection if docker_image / dockerPath is supplied from config.
 * @see CWE-78 (OS Command Injection)
 */
const ALLOWED_DOCKER_PATHS = new Set([
  "/usr/bin/docker",
  "/usr/local/bin/docker",
  "/opt/docker/bin/docker",
  "/opt/homebrew/bin/docker", // macOS Homebrew
]);

/**
 * Validate that the resolved Docker binary path is in the whitelist.
 * @param {string} dockerPath
 * @returns {string} The validated path (unchanged)
 * @throws {Error} If the path is not allowed
 */
function validateDockerPath(dockerPath) {
  const resolved = path.resolve(dockerPath);
  if (!ALLOWED_DOCKER_PATHS.has(resolved)) {
    throw new Error(
      `[sandbox] Docker binary path '${resolved}' is not in the allowed list. ` +
      `Allowed paths: ${[...ALLOWED_DOCKER_PATHS].join(", ")}`
    );
  }
  return resolved;
}


function withTimeout(promiseLike, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Sandbox timeout exceeded (${ms}ms)`)), ms);
  });

  return Promise.race([Promise.resolve(promiseLike), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function executeInSandbox({
  strategy,
  timeoutMs,
  logger,
  run,
  sandboxSettings,
  projectRoot,
  handlerPath,
  context,
}) {
  const mode = (strategy ?? "process").toLowerCase();
  const effectiveTimeout = timeoutMs ?? 120000;

  const executeLocal = async () => withTimeout(run(), effectiveTimeout);

  if (mode === "process") return executeLocal();

  if (mode === "docker") {
    const sandboxCfg = sandboxSettings ?? {};

    const dockerEnabled = Boolean(sandboxCfg.docker_enabled);
    if (!dockerEnabled) {
      logger?.log({
        event_type: "WARN",
        message: "Sandbox strategy 'docker' requested but docker_enabled=false; falling back to in-process execution.",
      });
      return executeLocal();
    }

    const image = sandboxCfg.docker_image ?? "node:20-alpine";
    const dockerCmd = [
      "run", "--rm",
      "--network", "none",
      "--cpus", String(sandboxCfg.docker_cpus ?? "1"),
      "--memory", String(sandboxCfg.docker_memory ?? "256m"),
      "-v", `${projectRoot}:/workspace:ro`,
      "-w", "/workspace",
      image,
      "node",
      path.relative(projectRoot, handlerPath),
    ];

    try {
      const safeDockerBin = validateDockerPath(sandboxCfg.docker_path ?? "/usr/bin/docker");
      const { stdout } = await execFileAsync(safeDockerBin, dockerCmd, {
        timeout: effectiveTimeout,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        env: {
          AGENT_CONTEXT_JSON: JSON.stringify(context ?? {}),
        },
      });
      try {
        return JSON.parse(stdout || "null");
      } catch {
        return { raw_output: stdout };
      }
    } catch (err) {
      logger?.log({ event_type: "WARN", message: `Docker sandbox failed (${err.message}); falling back to in-process execution.` });
      return executeLocal();
    }
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
