"use strict";

const https = require("https");

/**
 * Production-grade E2B Sandbox Provider.
 *
 * E2B (https://e2b.dev) provides managed, secure sandbox environments.
 *
 * Features:
 * - Secure remote code execution via E2B API
 * - Automatic environment provisioning
 * - Built-in security & resource limits
 * - Health checks with API validation
 * - Fallback to process sandbox on errors
 * - Configurable timeout and resource limits
 * - Comprehensive logging
 */
class E2BSandboxProvider {
  constructor(settings = {}, logger = null) {
    this.settings = settings;
    this.logger = logger;
    this.config = {
      apiKey: settings?.e2b_api_key || process.env.E2B_API_KEY,
      apiBase: settings?.e2b_api_base || "https://api.e2b.dev/v1",
      timeout: settings?.e2b_timeout_ms || 120000,
      enabled: Boolean(settings?.e2b_enabled && settings?.e2b_api_key),
    };
    this.initialized = false;
  }

  /**
   * Make HTTPS request to E2B API.
   * @param {string} method
   * @param {string} path
   * @param {any} [body]
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  async makeRequest(method, path, body = null, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const url = new URL(path.startsWith("http") ? path : `${this.config.apiBase}${path}`);

      const options = {
        method,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
          "User-Agent": "agents-runtime/2.1.0",
        },
        timeout: timeoutMs,
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 400) {
              reject(new Error(`E2B API error ${res.statusCode}: ${parsed.message || data}`));
            } else {
              resolve(parsed);
            }
          } catch (err) {
            reject(new Error(`Failed to parse E2B API response: ${err.message}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(new Error(`E2B API request failed: ${err.message}`));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`E2B API request timeout (${timeoutMs}ms)`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Create a new sandbox environment.
   * @param {string} templateID
   * @param {object} [options]
   * @returns {Promise<string>} Sandbox ID
   */
  async createSandbox(templateID = "base", options = {}) {
    const body = {
      template_id: templateID,
      ...(options || {}),
    };

    const response = await this.makeRequest("POST", "/sandboxes", body, this.config.timeout);
    return response.id || response.sandbox_id;
  }

  /**
   * Execute code in an E2B sandbox.
   * @param {string} sandboxId
   * @param {string} code
   * @param {object} [options]
   * @returns {Promise<any>}
   */
  async executeInSandbox(sandboxId, code, options = {}) {
    const body = {
      code,
      ...(options || {}),
    };

    return this.makeRequest(
      "POST",
      `/sandboxes/${sandboxId}/code_executions`,
      body,
      this.config.timeout
    );
  }

  /**
   * Delete/stop a sandbox.
   * @param {string} sandboxId
   * @returns {Promise<void>}
   */
  async deleteSandbox(sandboxId) {
    await this.makeRequest("DELETE", `/sandboxes/${sandboxId}`, null, 10000);
  }

  /**
   * Initialize E2B provider (validate API credentials).
   */
  async init() {
    try {
      if (!this.config.enabled) {
        this.logger?.log?.({
          event_type: "INFO",
          message: "E2B provider disabled (no API key configured)",
        });
        this.initialized = true;
        return;
      }

      // Validate API key by fetching user info
      this.logger?.log?.({
        event_type: "INFO",
        message: "[E2B] Validating API credentials...",
      });

      const response = await this.makeRequest("GET", "/user", null, 10000);

      if (!response.id && !response.user_id) {
        throw new Error("Invalid E2B API response");
      }

      this.logger?.log?.({
        event_type: "INFO",
        message: "[E2B] API credentials validated",
      });

      this.initialized = true;
    } catch (err) {
      this.logger?.log?.({
        event_type: "WARN",
        message: `[E2B] Init failed: ${err.message}; E2B provider disabled`,
      });
      this.config.enabled = false;
      this.initialized = true;
    }
  }

  /**
   * Execute code in E2B sandbox.
   * @param {object} payload
   * @param {string} [payload.code] Code to execute
   * @param {Function} [payload.run] Fallback callback for process sandbox
   * @param {number} [payload.timeoutMs]
   * @param {object} [payload.context] Context data
   * @returns {Promise<any>}
   */
  async execute(payload = {}) {
    if (!this.config.enabled || !this.initialized) {
      this.logger?.log?.({
        event_type: "WARN",
        message: "[E2B] Provider not enabled; falling back to process sandbox",
      });

      // Fallback to process sandbox
      if (payload.run && typeof payload.run === "function") {
        return payload.run();
      }
      throw new Error("[E2BSandboxProvider] E2B not enabled and no fallback provided");
    }

    let sandboxId;

    try {
      const code = payload.code || "console.log('No code provided')";
      const timeoutMs = payload.timeoutMs || this.config.timeout;

      // Create sandbox
      this.logger?.log?.({
        event_type: "INFO",
        message: "[E2B] Creating sandbox environment",
      });

      sandboxId = await this.createSandbox("base", {
        timeout: timeoutMs,
      });

      this.logger?.log?.({
        event_type: "INFO",
        message: `[E2B] Sandbox created: ${sandboxId}`,
      });

      // Execute code
      const result = await this.executeInSandbox(sandboxId, code, {
        context: payload.context,
      });

      this.logger?.log?.({
        event_type: "INFO",
        message: "[E2B] Code execution completed",
      });

      return result.output || result;
    } catch (err) {
      this.logger?.log?.({
        event_type: "WARN",
        message: `[E2B] Execution failed: ${err.message}; falling back to process sandbox`,
      });

      // Cleanup sandbox on error
      if (sandboxId) {
        try {
          await this.deleteSandbox(sandboxId);
        } catch (cleanupErr) {
          this.logger?.log?.({
            event_type: "WARN",
            message: `[E2B] Cleanup failed: ${cleanupErr.message}`,
          });
        }
      }

      // Fallback to process sandbox
      if (payload.run && typeof payload.run === "function") {
        return payload.run();
      }

      throw err;
    }
  }

  /**
   * Health check: verify E2B API connectivity.
   * @returns {Promise<object>}
   */
  async healthCheck() {
    const checkedAt = new Date().toISOString();

    if (!this.config.enabled) {
      return {
        status: "offline",
        checked_at: checkedAt,
        details: {
          reason: "E2B API key not configured",
          provider: "e2b",
        },
      };
    }

    try {
      await this.makeRequest("GET", "/user", null, 10000);

      return {
        status: "healthy",
        checked_at: checkedAt,
        details: {
          provider: "e2b",
          api_base: this.config.apiBase,
        },
      };
    } catch (err) {
      return {
        status: "degraded",
        checked_at: checkedAt,
        details: {
          reason: `Health check failed: ${err.message}`,
          provider: "e2b",
        },
      };
    }
  }

  /**
   * Shutdown provider.
   */
  async shutdown() {
    try {
      this.initialized = false;
    } catch (err) {
      this.logger?.log?.({
        event_type: "WARN",
        message: `[E2B] Shutdown error: ${err.message}`,
      });
    }
  }
}

module.exports = { E2BSandboxProvider };
