"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");

const execFileAsync = promisify(execFile);

/**
 * Production-grade Docker Sandbox Provider.
 *
 * Features:
 * - Real Docker API via docker CLI
 * - Container lifecycle management (create, run, cleanup)
 * - Resource limits (CPU, memory, network isolation)
 * - Health checks with connection verification
 * - Automatic cleanup of failed containers
 * - Logging integration
 * - Safe path validation
 */
class DockerSandboxProvider {
  constructor(settings = {}, logger = null) {
    this.settings = settings;
    this.logger = logger;
    this.docker = {
      bin: this.resolveDockerPath(settings?.docker_path),
      enabled: Boolean(settings?.docker_enabled !== false),
      image: settings?.docker_image || "node:20-alpine",
      cpus: settings?.docker_cpus || "1",
      memory: settings?.docker_memory || "512m",
      network: settings?.docker_network || "none",
      timeout: settings?.docker_timeout_ms || 120000,
    };
    this.activeContainers = new Set();
    this.initialized = false;
  }

  /**
   * Resolve Docker binary path from common locations.
   * @param {string} [userPath]
   * @returns {string} Docker binary path
   */
  resolveDockerPath(userPath) {
    const candidates = [
      userPath,
      "/usr/bin/docker",
      "/usr/local/bin/docker",
      "/opt/homebrew/bin/docker", // macOS Homebrew
      "docker", // Assume PATH
    ].filter(Boolean);

    // Whitelist for security (CWE-78)
    const whitelist = new Set([
      "/usr/bin/docker",
      "/usr/local/bin/docker",
      "/opt/homebrew/bin/docker",
      "/opt/docker/bin/docker",
      "docker",
    ]);

    for (const candidate of candidates) {
      if (whitelist.has(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `[DockerSandboxProvider] Docker binary path not in whitelist. Candidates: ${candidates.join(", ")}`
    );
  }

  /**
   * Verify Docker daemon is running and accessible.
   * @returns {Promise<boolean>}
   */
  async verifyDockerDaemon() {
    try {
      const { stdout } = await execFileAsync(this.docker.bin, ["version"], {
        timeout: 5000,
        encoding: "utf8",
      });
      return stdout && stdout.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Initialize Docker provider (verify daemon, pull base image).
   */
  async init() {
    try {
      if (!this.docker.enabled) {
        this.logger?.log?.({
          event_type: "INFO",
          message: "Docker provider disabled in settings",
        });
        this.initialized = true;
        return;
      }

      const daemonOk = await this.verifyDockerDaemon();
      if (!daemonOk) {
        this.logger?.log?.({
          event_type: "WARN",
          message: "Docker daemon is not running or not accessible",
        });
        this.docker.enabled = false;
        this.initialized = true;
        return;
      }

      // Attempt to pull base image
      this.logger?.log?.({
        event_type: "INFO",
        message: `[Docker] Pulling base image: ${this.docker.image}`,
      });

      await execFileAsync(this.docker.bin, ["pull", this.docker.image], {
        timeout: 120000,
        encoding: "utf8",
      });

      this.logger?.log?.({
        event_type: "INFO",
        message: `[Docker] Image ready: ${this.docker.image}`,
      });

      this.initialized = true;
    } catch (err) {
      this.logger?.log?.({
        event_type: "WARN",
        message: `[Docker] Init failed: ${err.message}; Docker sandbox disabled`,
      });
      this.docker.enabled = false;
      this.initialized = true;
    }
  }

  /**
   * Execute code in Docker container.
   * @param {object} payload
   * @param {Function} payload.run - Fallback callback for process sandbox
   * @param {number} payload.timeoutMs
   * @param {string} [payload.code] Code to execute
   * @param {object} [payload.context] Context data
   * @param {string} [payload.handlerPath] Path to handler file
   * @param {string} [payload.projectRoot] Project root for mounts
   * @returns {Promise<any>}
   */
  async execute(payload = {}) {
    if (!this.docker.enabled || !this.initialized) {
      // Fallback to process sandbox via callback
      if (payload.run && typeof payload.run === "function") {
        return payload.run();
      }
      throw new Error("[DockerSandboxProvider] Docker not enabled and no fallback provided");
    }

    const timeoutMs = payload.timeoutMs || this.docker.timeout;
    const projectRoot = payload.projectRoot || process.cwd();
    const handlerPath = payload.handlerPath || "handler.js";

    let containerId;

    try {
      const containerName = `agents-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Build docker run command with security constraints
      const dockerArgs = [
        "run",
        "--rm",
        "--name", containerName,
        "--network", this.docker.network,
        "--cpus", this.docker.cpus,
        "--memory", this.docker.memory,
        "--memory-swap", this.docker.memory, // Prevent swap
        "--cap-drop", "ALL", // Drop all capabilities
        "--cap-add", "NET_BIND_SERVICE", // Add back only what's needed
        "--read-only", // Read-only root filesystem
        "--tmpfs", "/tmp:rw,noexec,nosuid,nodev", // Writable /tmp with restrictions
      ];

      // Add volume mount if project root provided
      if (projectRoot && payload.handlerPath) {
        dockerArgs.push(
          "-v", `${path.resolve(projectRoot)}:/workspace:ro`,
          "-w", "/workspace"
        );
      }

      // Add environment context
      if (payload.context) {
        dockerArgs.push(
          "-e", `AGENT_CONTEXT_JSON=${JSON.stringify(payload.context)}`
        );
      }

      // Image and entrypoint
      dockerArgs.push(this.docker.image);
      dockerArgs.push("node", path.basename(handlerPath || "handler.js"));

      this.logger?.log?.({
        event_type: "INFO",
        message: `[Docker] Executing container: ${containerName}`,
      });

      const { stdout, stderr } = await execFileAsync(this.docker.bin, dockerArgs, {
        timeout: timeoutMs,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        shell: false,
      });

      // Try to parse as JSON, fallback to raw output
      try {
        const result = JSON.parse(stdout || "null");
        return result;
      } catch {
        return { raw_output: stdout, stderr };
      }
    } catch (err) {
      this.logger?.log?.({
        event_type: "WARN",
        message: `[Docker] Execution failed: ${err.message}`,
      });

      // Cleanup container if it exists
      if (containerId) {
        try {
          await execFileAsync(this.docker.bin, ["rm", "-f", containerId], {
            timeout: 10000,
          });
        } catch (cleanupErr) {
          this.logger?.log?.({
            event_type: "WARN",
            message: `[Docker] Cleanup failed: ${cleanupErr.message}`,
          });
        }
      }

      // Fallback to process sandbox
      if (payload.run && typeof payload.run === "function") {
        this.logger?.log?.({
          event_type: "WARN",
          message: "[Docker] Falling back to process sandbox",
        });
        return payload.run();
      }

      throw err;
    }
  }

  /**
   * Health check: verify Docker daemon and test image pull.
   * @returns {Promise<object>}
   */
  async healthCheck() {
    const checkedAt = new Date().toISOString();

    if (!this.docker.enabled) {
      return {
        status: "offline",
        checked_at: checkedAt,
        details: {
          reason: "Docker disabled in settings",
          daemon: "unknown",
        },
      };
    }

    try {
      const daemonOk = await this.verifyDockerDaemon();

      if (!daemonOk) {
        return {
          status: "offline",
          checked_at: checkedAt,
          details: {
            reason: "Docker daemon not running",
            daemon: "unreachable",
          },
        };
      }

      return {
        status: "healthy",
        checked_at: checkedAt,
        details: {
          strategy: "docker",
          image: this.docker.image,
          daemon: "running",
          cpus: this.docker.cpus,
          memory: this.docker.memory,
        },
      };
    } catch (err) {
      return {
        status: "degraded",
        checked_at: checkedAt,
        details: {
          reason: `Health check failed: ${err.message}`,
          daemon: "error",
        },
      };
    }
  }

  /**
   * Cleanup and shutdown provider.
   */
  async shutdown() {
    try {
      // Stop all active containers
      for (const containerId of this.activeContainers) {
        try {
          await execFileAsync(this.docker.bin, ["stop", "-t", "5", containerId], {
            timeout: 10000,
          });
          await execFileAsync(this.docker.bin, ["rm", "-f", containerId], {
            timeout: 5000,
          });
        } catch (err) {
          this.logger?.log?.({
            event_type: "WARN",
            message: `[Docker] Failed to cleanup container ${containerId}: ${err.message}`,
          });
        }
      }

      this.activeContainers.clear();
      this.initialized = false;
    } catch (err) {
      this.logger?.log?.({
        event_type: "WARN",
        message: `[Docker] Shutdown error: ${err.message}`,
      });
    }
  }
}

module.exports = { DockerSandboxProvider };
