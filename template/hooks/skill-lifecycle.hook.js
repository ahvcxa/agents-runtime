#!/usr/bin/env node
/**
 * .agents/hooks/skill-lifecycle.hook.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Combined pre-skill and post-skill lifecycle hooks.
 * Vendor-neutral — compatible with any agent runtime.
 */

/**
 * pre-skill hook — fires BEFORE any skill execution.
 *
 * @param {object} context
 * @param {string} context.agent_id
 * @param {string} context.skill_id
 * @param {number} context.auth_level
 * @param {object} context.skill_manifest  - Parsed SKILL.md YAML frontmatter
 * @param {object} context.input           - Skill input payload
 * @param {object} context.memory          - CrossAgentMemoryClient instance
 * @param {object} context.settings        - Parsed settings.json
 * @param {Function} context.log           - Structured logger
 */
async function preSkillHook(context) {
  const { agent_id, skill_id, auth_level, skill_manifest, input, memory, settings, log } = context;

  // 1. Verify skill exists in registry
  if (!skill_manifest) {
    throw new Error(`[pre-skill] Skill '${skill_id}' not found in registry at '${settings.skills.registry_path}'`);
  }

  // 2. Authorization check
  const required_level = skill_manifest.authorization_required_level ?? 1;
  if (auth_level < required_level) {
    throw new Error(
      `[pre-skill] Authorization denied: skill '${skill_id}' requires level ${required_level}, ` +
      `agent '${agent_id}' has level ${auth_level}`
    );
  }

  // 3. Input sanitization
  const max_input_length = settings?.security?.input_sanitization?.max_input_length ?? 100000;
  const input_str = JSON.stringify(input);
  if (input_str.length > max_input_length) {
    throw new Error(
      `[pre-skill] Input payload exceeds maximum allowed size (${max_input_length} chars). ` +
      `Received: ${input_str.length} chars.`
    );
  }

  if (settings?.security?.input_sanitization?.reject_null_bytes && input_str.includes("\0")) {
    throw new Error(`[pre-skill] Input payload from agent '${agent_id}' contains null bytes.`);
  }

  // 4. Record invocation start in memory (distributed lock)
  const invocation_key = `skill:${skill_id}:cache:invocation:${agent_id}:${Date.now()}`;
  await memory.set(invocation_key, {
    status: "in_progress",
    started_at: new Date().toISOString(),
    agent_id,
    skill_id,
  }, { ttl_seconds: settings.runtime.agent_timeout_seconds });

  // 5. Emit SKILL_START log event
  log({
    event_type: "SKILL_START",
    agent_id,
    skill_id,
    skill_version: skill_manifest.version,
    invocation_key,
  });

  return { invocation_key };
}


/**
 * post-skill hook — fires AFTER skill execution completes.
 *
 * @param {object} context
 * @param {string} context.agent_id
 * @param {string} context.skill_id
 * @param {string} context.invocation_key
 * @param {object} context.result
 * @param {boolean} context.success
 * @param {number} context.duration_ms
 * @param {object} context.memory
 * @param {object} context.skill_manifest
 * @param {Function} context.log
 * @param {Function} context.emit  - Domain event emitter
 */
async function postSkillHook(context) {
  const {
    agent_id, skill_id, invocation_key, result, success,
    duration_ms, memory, skill_manifest, log, emit,
  } = context;

  // 1. Release distributed lock
  if (invocation_key) {
    await memory.set(invocation_key, {
      status: success ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      duration_ms,
    }, { ttl_seconds: 300 });
  }

  // 2. Cache result (content-addressed)
  if (success && result) {
    const hash = simpleHash(JSON.stringify(result));
    const cache_key = `skill:${skill_id}:cache:${hash}`;
    await memory.set(cache_key, result, {
      ttl_seconds: 3600,
      tags: ["skill:" + skill_id, "context:analysis", "lifecycle:transient"],
    });
  }

  // 3. Emit SKILL_END log event
  log({
    event_type: "SKILL_END",
    agent_id,
    skill_id,
    success,
    duration_ms,
    findings_count: Array.isArray(result) ? result.length : undefined,
  });

  // 4. Emit output domain event
  const output_event = skill_manifest?.output_event;
  if (output_event && success) {
    emit({
      event_type: output_event,
      from: agent_id,
      to: "broadcast",
      context_boundary: skill_manifest.bounded_context,
      payload: result,
    });
  }
}

/** Minimal content hash for cache key generation. */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

module.exports = { preSkillHook, postSkillHook };
