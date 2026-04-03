#!/usr/bin/env node
"use strict";

class SecurityViolationError extends Error {
  constructor(agent_id, url, reason) {
    super(`[SECURITY_VIOLATION] Agent '${agent_id}' attempted forbidden network access: '${url}' (${reason})`);
    this.name = "SecurityViolationError";
    this.event_type = "SECURITY_VIOLATION";
  }
}

function preNetworkHook(context) {
  const { agent_id, url, auth_level, settings } = context;
  if (!url || typeof url !== "string") {
    throw new TypeError("[pre-network] url is required and must be a string");
  }

  const allowed = settings?.security?.allowed_endpoints ?? [];
  const isAllowed = allowed.some((candidate) => url.startsWith(candidate));

  if (!isAllowed) {
    throw new SecurityViolationError(agent_id, url, "endpoint-not-allowlisted");
  }

  if ((auth_level ?? 1) < 2) {
    throw new SecurityViolationError(agent_id, url, "insufficient-authorization-level");
  }

  return { allowed: true };
}

module.exports = { preNetworkHook, SecurityViolationError };
