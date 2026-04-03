"use strict";

const path = require("path");

class SecurityViolationError extends Error {
  constructor(agent_id, file_path, matched_pattern) {
    super(
      `[SECURITY_VIOLATION] Agent '${agent_id}' attempted to read forbidden path: ` +
      `'${file_path}' (matched pattern: '${matched_pattern}')`
    );
    this.name = "SecurityViolationError";
    this.event_type = "SECURITY_VIOLATION";
  }
}

function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*\//g, "(.+/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`(^|/)${escaped}(/|$)`, "i");
}

function preReadHook(context) {
  const { agent_id, file_path, settings } = context;
  const normalizedPath = path.normalize(file_path).replace(/\\/g, "/");

  if (normalizedPath.includes("\0")) {
    throw new SecurityViolationError(agent_id, file_path, "null-byte-in-path");
  }

  const forbiddenPatterns = settings?.security?.forbidden_file_patterns ?? [];
  for (const pattern of forbiddenPatterns) {
    if (patternToRegex(pattern).test(normalizedPath)) {
      throw new SecurityViolationError(agent_id, normalizedPath, pattern);
    }
  }

  if (normalizedPath.includes("..")) {
    throw new SecurityViolationError(agent_id, normalizedPath, "path-traversal");
  }

  return { allowed: true };
}

module.exports = { preReadHook };
