#!/usr/bin/env node
/**
 * .agents/hooks/pre-read.hook.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lifecycle Hook: pre-read
 * Fires BEFORE any filesystem read operation initiated by an agent.
 *
 * Vendor-neutral — compatible with any agent runtime.
 *
 * @param {object} context
 * @param {string} context.agent_id     - The requesting agent's ID
 * @param {string} context.file_path    - The absolute or relative path being read
 * @param {number} context.auth_level   - The requesting agent's authorization level
 * @param {object} context.settings     - Parsed .agents/settings.json
 * @returns {{ allowed: true }}         or throws SecurityViolationError
 */

const path = require("path");

class SecurityViolationError extends Error {
  constructor(agent_id, file_path, matched_pattern) {
    super(
      `[SECURITY_VIOLATION] Agent '${agent_id}' attempted to read forbidden path: ` +
      `'${file_path}' (matched pattern: '${matched_pattern}')`
    );
    this.name        = "SecurityViolationError";
    this.agent_id    = agent_id;
    this.file_path   = file_path;
    this.pattern     = matched_pattern;
    this.event_type  = "SECURITY_VIOLATION";
    this.timestamp   = new Date().toISOString();
  }
}

/**
 * Convert a glob-style forbidden pattern into a RegExp.
 * @param {string} pattern
 * @returns {RegExp}
 */
function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*\//g, "(.+/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`(^|/)${escaped}(/|$)`, "i");
}

/**
 * Main hook handler.
 * @param {object} context
 * @returns {{ allowed: true }}
 * @throws {SecurityViolationError}
 */
function preReadHook(context) {
  const { agent_id, file_path, settings } = context;

  if (!file_path || typeof file_path !== "string") {
    throw new TypeError(`[pre-read] Invalid file_path received from agent '${agent_id}'`);
  }

  const normalizedPath = path.normalize(file_path).replace(/\\/g, "/");

  if (normalizedPath.includes("\0")) {
    throw new SecurityViolationError(agent_id, file_path, "null-byte-in-path");
  }

  const forbiddenPatterns = settings?.security?.forbidden_file_patterns ?? [];

  for (const pattern of forbiddenPatterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(normalizedPath)) {
      throw new SecurityViolationError(agent_id, normalizedPath, pattern);
    }
  }

  if (normalizedPath.includes("..")) {
    throw new SecurityViolationError(agent_id, normalizedPath, "path-traversal");
  }

  return { allowed: true };
}

module.exports = { preReadHook, SecurityViolationError, patternToRegex };
