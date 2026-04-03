"use strict";

function preNetworkHook(context) {
  const { url, auth_level, settings } = context;
  const allow = settings?.security?.allowed_endpoints ?? [];
  const permitted = allow.some((prefix) => String(url).startsWith(prefix));

  if (!permitted) {
    const err = new Error("[SECURITY_VIOLATION] forbidden network endpoint");
    err.event_type = "SECURITY_VIOLATION";
    throw err;
  }
  if ((auth_level ?? 1) < 2) {
    const err = new Error("[SECURITY_VIOLATION] insufficient authorization for network access");
    err.event_type = "SECURITY_VIOLATION";
    throw err;
  }
  return { allowed: true };
}

module.exports = { preNetworkHook };
