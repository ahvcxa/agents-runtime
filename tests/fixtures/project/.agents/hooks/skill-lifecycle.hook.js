"use strict";

async function preSkillHook(context) {
  const { agent_id, skill_id, auth_level, skill_manifest, input, memory, settings, log } = context;

  if (!skill_manifest) {
    throw new Error(`[pre-skill] Skill '${skill_id}' not found in registry at '${settings.skills.registry_path}'`);
  }

  const required_level = skill_manifest.authorization_required_level ?? 1;
  if (auth_level < required_level) {
    throw new Error(
      `[pre-skill] Authorization denied: skill '${skill_id}' requires level ${required_level}, ` +
      `agent '${agent_id}' has level ${auth_level}`
    );
  }

  const max_input_length = settings?.security?.input_sanitization?.max_input_length ?? 100000;
  const input_str = JSON.stringify(input);
  if (input_str.length > max_input_length) {
    throw new Error(`[pre-skill] Input payload exceeds maximum allowed size (${max_input_length} chars).`);
  }

  const invocation_key = `skill:${skill_id}:cache:invocation:${agent_id}:${Date.now()}`;
  memory.set(invocation_key, {
    status: "in_progress",
    started_at: new Date().toISOString(),
    agent_id,
    skill_id,
  }, { ttl_seconds: settings.runtime.agent_timeout_seconds ?? 120 });

  log({ event_type: "SKILL_START", agent_id, skill_id, invocation_key });
  return { invocation_key };
}

async function postSkillHook(context) {
  const { agent_id, skill_id, invocation_key, result, success, duration_ms, memory, skill_manifest, log, emit } = context;

  if (invocation_key) {
    memory.set(invocation_key, {
      status: success ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      duration_ms,
    }, { ttl_seconds: 300 });
  }

  log({ event_type: "SKILL_END", agent_id, skill_id, success, duration_ms });

  if (skill_manifest?.output_event && success) {
    emit({
      event_type: skill_manifest.output_event,
      from: agent_id,
      to: "broadcast",
      context_boundary: skill_manifest.bounded_context,
      payload: result,
    });
  }
}

module.exports = { preSkillHook, postSkillHook };
