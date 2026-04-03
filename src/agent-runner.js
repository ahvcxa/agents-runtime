"use strict";
/**
 * src/agent-runner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes a single agent skill through the full lifecycle:
 * compliance → pre-skill hook → skill execution → post-skill hook → event emit
 */

const path       = require("path");
const fs         = require("fs");
const { execFileSync } = require("child_process");

class AgentRunner {
  /**
   * @param {object} runtime - AgentRuntime instance
   */
  constructor(runtime) {
    this.runtime      = runtime;
    this.hookRegistry = runtime.hookRegistry;
    this.skillRegistry= runtime.skillRegistry;
    this.eventBus     = runtime.eventBus;
    this.logger       = runtime.logger;
    this.settings     = runtime.settings;
    this.projectRoot  = runtime.projectRoot;
  }

  /**
   * Run a skill for an agent.
   * @param {object} agentConfig - Parsed agent YAML { agent: { id, role, authorization_level, ... } }
   * @param {string} skillId
   * @param {object} input
   * @returns {Promise<{ success: boolean, result?: any, error?: string, duration_ms: number }>}
   */
  async run(agentConfig, skillId, input = {}) {
    const agent     = agentConfig.agent;
    const agentId   = agent.id;
    const authLevel = parseInt(agent.authorization_level, 10);

    this.logger.log({ event_type: "INFO", message: `Starting agent '${agentId}' → skill '${skillId}'` });

    // 1. Compliance check
    await this._runComplianceCheck(agentConfig);

    // 2. Resolve skill
    const skillManifest = this.skillRegistry.getSkill(skillId);
    if (!skillManifest) {
      throw new Error(`[agent-runner] Skill '${skillId}' not found in registry`);
    }

    // 3. Create memory client for this agent
    const { createMemoryStore } = require("./memory/memory-store");
    const memory = createMemoryStore(this.settings, authLevel, agentId, this.projectRoot);

    // Bind logger and emitter for hooks
    const log  = (entry) => this.logger.log(entry);
    const emit = (event) => this.eventBus.dispatch(event);

    // 4. Pre-skill hook
    let invocationKey;
    try {
      const results = await this.hookRegistry.dispatch("before_skill_execution", {
        agent_id: agentId, skill_id: skillId, auth_level: authLevel,
        skill_manifest: skillManifest, input, memory, settings: this.settings, log,
      });
      invocationKey = results.find((r) => r.result?.invocation_key)?.result?.invocation_key;
    } catch (err) {
      this.logger.log({ event_type: "ERROR", agent_id: agentId, message: `pre-skill hook failed: ${err.message}` });
      throw err;
    }

    // 5. Execute skill
    const startMs = Date.now();
    let result, success;

    try {
      result  = await this._executeSkill(skillManifest, agentId, authLevel, input, memory, log);
      success = true;
    } catch (err) {
      result  = { error: err.message };
      success = false;
      this.logger.log({ event_type: "ERROR", agent_id: agentId, skill_id: skillId, message: err.message });
    }

    const duration_ms = Date.now() - startMs;

    // 6. Post-skill hook
    await this.hookRegistry.dispatch("after_skill_execution", {
      agent_id: agentId, skill_id: skillId, invocation_key: invocationKey,
      result, success, duration_ms, memory, skill_manifest: skillManifest, log, emit,
    });

    return { success, result, duration_ms };
  }

  /** Run the compliance-check.js helper as a subprocess */
  async _runComplianceCheck(agentConfig) {
    const checkerPath = path.join(this.projectRoot, ".agents", "helpers", "compliance-check.js");
    if (!fs.existsSync(checkerPath)) {
      this.logger.warn({ event_type: "WARN", message: "compliance-check.js not found, skipping." });
      return;
    }

    // Write agent config to a temp file
    const tmpFile = path.join(require("os").tmpdir(), `agent-config-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(agentConfig), "utf8");

    try {
      execFileSync("node", [checkerPath, "--agent-config", tmpFile], {
        cwd:    this.projectRoot,
        stdio:  "pipe",
        encoding: "utf8",
      });
    } catch (err) {
      const output = err.stdout ?? err.stderr ?? err.message;
      throw new Error(`[compliance] Check failed:\n${output}`);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  /**
   * Execute the actual skill. Looks for a JS handler first, then falls back
   * to a no-op echo (useful for analysis skills that are driven by LLM context).
   */
  async _executeSkill(skillManifest, agentId, authLevel, input, memory, log) {
    // Check if the SKILL.md declares a handler path
    const handlerPath = skillManifest.handler;
    if (handlerPath) {
      const absHandler = path.resolve(this.projectRoot, handlerPath);
      if (fs.existsSync(absHandler)) {
        const handler = require(absHandler);
        const fn = handler.execute ?? handler.run ?? handler.default ?? handler;
        if (typeof fn === "function") {
          return await Promise.resolve(fn({ agentId, authLevel, input, memory, log }));
        }
      }
    }

    // Default: return skill metadata + input echo (useful for LLM-side skills)
    log({ event_type: "INFO", message: `Skill '${skillManifest.id}' has no JS handler — returning echo.` });
    return {
      skill_id:   skillManifest.id,
      skill_name: skillManifest.name,
      version:    skillManifest.version,
      input_echo: input,
      note:       "No JS handler declared in SKILL.md frontmatter. LLM-driven skill context loaded.",
      skill_description: skillManifest.description ?? skillManifest.content?.slice(0, 300),
    };
  }
}

module.exports = { AgentRunner };
