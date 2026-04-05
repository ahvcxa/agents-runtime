"use strict";

const HIGH_RISK_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bcurl\b[^\n]*\|[^\n]*\b(sh|bash|zsh)\b/i,
  /\bwget\b[^\n]*\|[^\n]*\b(sh|bash|zsh)\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
];

function hasHighRiskCommand(text) {
  const normalized = String(text || "");
  return HIGH_RISK_COMMAND_PATTERNS.some((re) => re.test(normalized));
}

function evaluateRisk(input = {}) {
  const risky = [];

  const commands = Array.isArray(input.commands) ? input.commands : [];
  for (const cmd of commands) {
    if (hasHighRiskCommand(cmd)) risky.push({ type: "command", value: cmd });
  }

  if (typeof input.command === "string" && hasHighRiskCommand(input.command)) {
    risky.push({ type: "command", value: input.command });
  }

  const networkRequests = Array.isArray(input.network_requests) ? input.network_requests : [];
  for (const req of networkRequests) {
    const url = String(req?.url || "");
    if (/\b(metadata|169\.254\.169\.254|localhost|127\.0\.0\.1)\b/i.test(url)) {
      risky.push({ type: "network", value: url });
    }
  }

  return risky;
}

function enforceHitl({ input, settings, logger, traceId, agentId, skillId }) {
  const hitlEnabled = settings?.runtime?.hitl?.enabled !== false;
  if (!hitlEnabled) return;

  const risky = evaluateRisk(input);
  if (!risky.length) return;

  const requireExplicit = settings?.runtime?.hitl?.require_explicit_approval !== false;
  const approved = input?.approval?.approved === true;

  logger?.log?.({
    event_type: "AUDIT",
    trace_id: traceId,
    message: "HITL guard evaluated high-risk actions",
    agent_id: agentId,
    skill_id: skillId,
    risky_actions: risky,
    approved,
  });

  if (requireExplicit && !approved) {
    throw new Error(
      `[HITL] High-risk action requires explicit approval. ` +
      `Provide input.approval.approved=true after review. Risks: ${risky.map((r) => r.value).join(" | ")}`
    );
  }
}

module.exports = {
  enforceHitl,
  evaluateRisk,
  hasHighRiskCommand,
};
