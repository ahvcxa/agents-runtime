"use strict";

/**
 * src/security/security-validator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runtime validation for security constraints:
 * • All URLs must use HTTPS (CWE-319)
 * • Rate limiting must be configured (CWE-770)
 * • execFile must be used, never spawn with shell (CWE-78)
 */

/**
 * Validate that all critical URLs use HTTPS.
 * Addresses MED-10, MED-11, MED-12 (CWE-319).
 * @param {object} packageJson - The parsed package.json
 * @throws {Error} if any URL is not HTTPS
 */
function validateUrlsAreHttps(packageJson) {
  const urlFields = [
    { key: "repository.url", desc: "Repository" },
    { key: "homepage", desc: "Homepage" },
    { key: "bugs.url", desc: "Bugs" },
  ];

  for (const { key, desc } of urlFields) {
    const parts = key.split(".");
    let value = packageJson;
    for (const part of parts) {
      value = value?.[part];
    }

    if (value && typeof value === "string" && value.length > 0) {
      // Accept both https:// and git+https:// (for git URLs)
      const isHttpsUrl = /^(https:\/\/|git\+https:\/\/)/i.test(value);
      if (!isHttpsUrl) {
        throw new Error(
          `[SECURITY] ${desc} URL must use HTTPS, got: ${value}`
        );
      }
    }
  }
}

/**
 * Validate that rate limiting is configured on critical paths.
 * Addresses MED-1 through MED-9 (CWE-770).
 * @param {object} settings - The runtime settings from settings-loader
 * @throws {Error} if rate limiting is missing or improperly configured
 */
function validateRateLimitingEnabled(settings) {
  const checks = [
    {
      path: "runtime.sandbox.rate_limit_window_ms",
      minMs: 1000,
      context: "Sandbox rate limit window",
    },
    {
      path: "runtime.sandbox.rate_limit_max_calls",
      minValue: 1,
      context: "Sandbox max calls",
    },
    {
      path: "runtime.sandbox.max_concurrent_executions",
      minValue: 1,
      context: "Sandbox concurrency limit",
    },
    {
      path: "runtime.cognitive_memory.rate_limit_window_ms",
      minMs: 1000,
      context: "Memory rate limit window",
    },
    {
      path: "runtime.cognitive_memory.rate_limit_max_ops",
      minValue: 1,
      context: "Memory max operations",
    },
  ];

  for (const check of checks) {
    const parts = check.path.split(".");
    let value = settings;
    for (const part of parts) {
      value = value?.[part];
    }

    const threshold = check.minMs || check.minValue;
    if (value === undefined || value === null || value < threshold) {
      throw new Error(
        `[SECURITY] Rate limiting not properly configured: ${check.context} ` +
        `(${check.path} = ${value}, expected >= ${threshold})`
      );
    }
  }
}

/**
 * Validate that a child_process call uses execFile (not spawn/exec).
 * This is a documentation helper; actual enforcement happens via code review.
 * Addresses HIGH-1, HIGH-2, HIGH-3, HIGH-4 (CWE-78).
 * @param {string} executionMethod - The method used ('execFile', 'spawn', 'exec', etc.)
 * @throws {Error} if an unsafe method is used
 */
function validateExecMethod(executionMethod) {
  const safeMethods = ["execFile", "execFileSync", "execFileAsync"];
  if (!safeMethods.includes(executionMethod)) {
    throw new Error(
      `[SECURITY] Child process execution must use execFile, not ${executionMethod}. ` +
      `Use: execFile(command, args, { shell: false, ... })`
    );
  }
}

/**
 * Comprehensive security validation on startup.
 * @param {object} packageJson - Parsed package.json
 * @param {object} settings - Runtime settings from settings-loader
 * @throws {Error} if any security check fails
 */
function runSecurityValidation(packageJson, settings) {
  const errors = [];

  // Validate HTTPS URLs
  try {
    validateUrlsAreHttps(packageJson);
  } catch (err) {
    errors.push(err.message);
  }

  // Validate rate limiting
  try {
    validateRateLimitingEnabled(settings);
  } catch (err) {
    errors.push(err.message);
  }

  if (errors.length > 0) {
    throw new Error(
      `[SECURITY] ${errors.length} validation error(s):\n  ` +
      errors.join("\n  ")
    );
  }
}

module.exports = {
  validateUrlsAreHttps,
  validateRateLimitingEnabled,
  validateExecMethod,
  runSecurityValidation,
};
