"use strict";

const { randomUUID } = require("crypto");

class ApprovalManager {
  constructor(settings = {}, logger = null) {
    this.settings = settings;
    this.logger = logger;
    this.tokens = new Map();
  }

  _ttlMs() {
    const ttlSeconds = Number(this.settings?.runtime?.hitl?.token_ttl_seconds ?? 300);
    return Math.max(30, ttlSeconds) * 1000;
  }

  issue({ agentId, skillId, reason, traceId, metadata = {} }) {
    const token = `hitl_${randomUUID()}`;
    const expiresAt = Date.now() + this._ttlMs();
    const row = {
      token,
      agent_id: agentId,
      skill_id: skillId,
      reason,
      trace_id: traceId,
      metadata,
      created_at: new Date().toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      used: false,
      used_at: null,
    };
    this.tokens.set(token, row);
    this.logger?.log?.({
      event_type: "AUDIT",
      message: "HITL approval token issued",
      trace_id: traceId,
      token,
      agent_id: agentId,
      skill_id: skillId,
    });
    return row;
  }

  validate(token, context = {}) {
    const row = this.tokens.get(token);
    if (!row) return { ok: false, code: "TOKEN_NOT_FOUND" };
    if (row.used) return { ok: false, code: "TOKEN_ALREADY_USED" };
    if (Date.now() > Date.parse(row.expires_at)) return { ok: false, code: "TOKEN_EXPIRED" };

    if (context.agentId && row.agent_id && context.agentId !== row.agent_id) {
      return { ok: false, code: "TOKEN_AGENT_MISMATCH" };
    }
    if (context.skillId && row.skill_id && context.skillId !== row.skill_id) {
      return { ok: false, code: "TOKEN_SKILL_MISMATCH" };
    }

    return { ok: true, token: row };
  }

  consume(token, context = {}) {
    const validated = this.validate(token, context);
    if (!validated.ok) return validated;
    const row = validated.token;
    row.used = true;
    row.used_at = new Date().toISOString();
    this.tokens.set(token, row);
    this.logger?.log?.({
      event_type: "AUDIT",
      message: "HITL approval token consumed",
      trace_id: context.traceId,
      token,
      agent_id: context.agentId,
      skill_id: context.skillId,
    });
    return { ok: true, token: row };
  }
}

module.exports = { ApprovalManager };
