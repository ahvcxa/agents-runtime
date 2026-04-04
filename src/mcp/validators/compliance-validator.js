"use strict";
/**
 * src/mcp/validators/compliance-validator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ComplianceValidator — extracted from mcp-server.js compliance_check tool.
 * Each validation concern is in its own method (SRP), reducing CC from 12 → ~5.
 */

const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9\-_]*$/;
const VALID_AUTH_LEVELS = new Set([1, 2, 3]);
const ROLES_BY_LEVEL   = ["Observer", "Executor", "Orchestrator"];
const REQUIRED_HOOKS   = ["pre-read", "pre-skill", "post-skill"];

class ComplianceValidator {
  /**
   * Run all compliance checks and return a result object.
   * @param {object} params
   * @param {string}   params.agent_id
   * @param {number}   params.authorization_level
   * @param {string[]} params.skill_set
   * @param {object}   params.runtime  - AgentRuntime instance
   * @returns {{ passed: boolean, lines: string[], agentConfig: object }}
   */
  validate({ agent_id, authorization_level, skill_set, runtime }) {
    const lines  = [`🔍 Compliance check for agent '${agent_id}' (level ${authorization_level})`];
    let   passed = true;

    passed = this._checkAgentId(agent_id, lines)      && passed;
    passed = this._checkAuthLevel(authorization_level, lines) && passed;
    passed = this._checkSkillSet(skill_set, lines)    && passed;

    const role   = ROLES_BY_LEVEL[authorization_level - 1] ?? "Unknown";
    const agentConfig = {
      agent: {
        id:                  agent_id,
        role,
        authorization_level,
        skill_set,
        read_only:           authorization_level === 1,
      },
    };

    passed = this._checkReadOnlyPolicy(agentConfig.agent, authorization_level, lines) && passed;
    passed = this._checkRequiredHooks(runtime, lines) && passed;
    passed = this._checkSkillAccess(skill_set, authorization_level, runtime, lines)  && passed;

    lines.push("");
    lines.push(passed
      ? "✅ **Compliance passed.** Agent is authorized to use requested skills."
      : "❌ **Compliance failed.** Fix the errors above before running skills."
    );

    return { passed, lines, agentConfig };
  }

  // ── Private validator methods ──────────────────────────────────────────────

  _checkAgentId(agent_id, lines) {
    if (!agent_id || !AGENT_ID_PATTERN.test(agent_id)) {
      lines.push("  ❌ Agent id is invalid (must match ^[a-z0-9][a-z0-9\\-_]*$)");
      return false;
    }
    lines.push("  ✅ Agent id format is valid");
    return true;
  }

  _checkAuthLevel(authorization_level, lines) {
    if (!VALID_AUTH_LEVELS.has(authorization_level)) {
      lines.push("  ❌ authorization_level must be one of: 1, 2, 3");
      return false;
    }
    const role = ROLES_BY_LEVEL[authorization_level - 1];
    lines.push(`  ✅ Role resolved: ${role}`);
    return true;
  }

  _checkSkillSet(skill_set, lines) {
    if (!Array.isArray(skill_set) || skill_set.length === 0) {
      lines.push("  ❌ skill_set must include at least one skill id");
      return false;
    }
    return true;
  }

  _checkReadOnlyPolicy(agent, authorization_level, lines) {
    if (authorization_level === 1 && agent.read_only !== true) {
      lines.push("  ❌ Observer (level 1) agents must be read_only=true");
      return false;
    }
    lines.push(`  ✅ read_only policy looks valid (${agent.read_only})`);
    return true;
  }

  _checkRequiredHooks(runtime, lines) {
    const hookSet = new Set(runtime.listHooks());
    let   passed  = true;
    for (const hookId of REQUIRED_HOOKS) {
      if (hookSet.has(hookId)) {
        lines.push(`  ✅ Required hook '${hookId}' is registered`);
      } else {
        lines.push(`  ❌ Required hook '${hookId}' is missing`);
        passed = false;
      }
    }
    return passed;
  }

  _checkSkillAccess(skill_set, authorization_level, runtime, lines) {
    let passed = true;
    for (const skillId of skill_set) {
      try {
        runtime.skillRegistry.load(skillId, authorization_level);
        lines.push(`  ✅ Skill '${skillId}' — registered and authorized`);
      } catch (e) {
        lines.push(`  ❌ Skill '${skillId}' — ${e.message}`);
        passed = false;
      }
    }
    return passed;
  }
}

module.exports = { ComplianceValidator };
