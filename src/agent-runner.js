"use strict";
/**
 * src/agent-runner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes a single agent skill through the full lifecycle:
 * compliance → pre-skill hook → skill execution → post-skill hook → event emit
 */

const path       = require("path");
const fs         = require("fs");
const fsp        = require("fs/promises");
const { execFile } = require("child_process");
const os         = require("os");
const { promisify } = require("util");
const { executeInSandbox } = require("./sandbox/executor");

const execFileAsync = promisify(execFile);

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
    this._activeTimers = new Set();
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
    if (!agent || typeof agent !== "object") {
      throw new Error("[agent-runner] Invalid agent config: missing 'agent' object");
    }

    const agentId   = agent.id;
    const authLevel = parseInt(agent.authorization_level, 10);
    const skillSet  = Array.isArray(agent.skill_set) ? agent.skill_set : [];

    if (!agentId) {
      throw new Error("[agent-runner] Invalid agent config: 'agent.id' is required");
    }
    if (!Number.isInteger(authLevel) || authLevel < 1 || authLevel > 3) {
      throw new Error("[agent-runner] Invalid agent config: 'authorization_level' must be an integer between 1 and 3");
    }
    if (skillSet.length > 0 && !skillSet.includes(skillId)) {
      throw new Error(`[agent-runner] Agent '${agentId}' is not allowed to execute skill '${skillId}' (not in skill_set)`);
    }

    this.logger.log({ event_type: "INFO", message: `Starting agent '${agentId}' → skill '${skillId}'` });

    // 1. Compliance check
    await this._runComplianceCheck(agentConfig);

    // 2. Resolve skill
    const skillManifest = this.skillRegistry.getSkill(skillId);
    if (!skillManifest) {
      throw new Error(`[agent-runner] Skill '${skillId}' not found in registry`);
    }
    if (!this.skillRegistry.canExecute(skillId, authLevel)) {
      const requiredLevel = skillManifest.authorization_required_level ?? 1;
      throw new Error(`[agent-runner] Authorization denied: skill '${skillId}' requires level ${requiredLevel}, agent has level ${authLevel}`);
    }

    const runTraceId = this.runtime?.tracer?.traceId?.();

    // 3. Create memory client for this agent
    const { createMemoryStore } = require("./memory/memory-store");
    const memory = createMemoryStore(this.settings, authLevel, agentId, this.projectRoot);
    this._trackMemoryTimer(memory);

    // Bind logger and emitter for hooks
    const log  = (entry) => this.logger.log({ trace_id: runTraceId, ...entry });
    const emit = (event) => this.eventBus.dispatch({ trace_id: runTraceId, ...event });

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
      result  = await this._executeSkill(skillManifest, agentId, authLevel, input, memory, log, runTraceId);
      success = true;
    } catch (err) {
      result  = { error: err.message, trace_id: runTraceId };
      success = false;
      this.logger.log({ event_type: "ERROR", agent_id: agentId, skill_id: skillId, message: err.message });
    }

    const duration_ms = Date.now() - startMs;

    // 6. Post-skill hook
    await this.hookRegistry.dispatch("after_skill_execution", {
      agent_id: agentId, skill_id: skillId, invocation_key: invocationKey,
      result, success, duration_ms, memory, skill_manifest: skillManifest, log, emit,
    });

    return {
      success,
      result,
      error: success ? undefined : result.error,
      duration_ms,
    };
  }

  /** Run the compliance-check.js helper as a subprocess */
  async _runComplianceCheck(agentConfig) {
    const checkerPath = path.join(this.projectRoot, ".agents", "helpers", "compliance-check.js");
    if (!fs.existsSync(checkerPath)) {
      this.logger.warn({ event_type: "WARN", message: "compliance-check.js not found, skipping." });
      return;
    }

    // Write agent config to a temp file
    const tmpFile = path.join(os.tmpdir(), `agent-config-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    await fsp.writeFile(tmpFile, JSON.stringify(agentConfig), "utf8");

    try {
      await execFileAsync("node", [checkerPath, "--agent-config", tmpFile], {
        cwd:    this.projectRoot,
        encoding: "utf8",
      });
    } catch (err) {
      const output = err.stdout ?? err.stderr ?? err.message;
      throw new Error(`[compliance] Check failed:\n${output}`);
    } finally {
      try { await fsp.unlink(tmpFile); } catch { /* ignore */ }
    }
  }

  _trackMemoryTimer(memoryClient) {
    const timer = memoryClient?._persistTimer;
    if (timer) this._activeTimers.add(timer);
  }

  clearActiveTimers() {
    for (const timer of this._activeTimers) {
      clearInterval(timer);
    }
    this._activeTimers.clear();
  }

  /**
   * Execute the actual skill. Looks for a JS handler first, then falls back
   * to a no-op echo (useful for analysis skills that are driven by LLM context).
   */
  async _executeSkill(skillManifest, agentId, authLevel, input, memory, log, runTraceId) {
    const tracer = this.runtime?.tracer;
    const traceId = runTraceId ?? tracer?.traceId?.();
    const span = tracer?.startSpan("skill.execute", {
      "agent.id": agentId,
      "skill.id": skillManifest.id,
      "trace.id": traceId,
    });

    if (Array.isArray(input?.network_requests)) {
      for (const req of input.network_requests) {
        await this.hookRegistry.dispatch("before_network_access", {
          agent_id: agentId,
          auth_level: authLevel,
          url: req?.url,
          method: req?.method ?? "GET",
          settings: this.settings,
        });
      }
    }

    // Check if the SKILL.md declares a handler path
    const handlerPath = skillManifest.handler;
    if (handlerPath) {
      const absHandler = path.resolve(this.projectRoot, handlerPath);
      if (fs.existsSync(absHandler)) {
        const handler = require(absHandler);
        const fn = handler.execute ?? handler.run ?? handler.default ?? handler;
        if (typeof fn === "function") {
          try {
            const result = await executeInSandbox({
              strategy: this.settings?.runtime?.sandbox?.strategy ?? "process",
              timeoutMs: (this.settings?.runtime?.agent_timeout_seconds ?? 120) * 1000,
              logger: this.logger,
              sandboxSettings: this.settings?.runtime?.sandbox ?? {},
              projectRoot: this.projectRoot,
              handlerPath: absHandler,
              handlerExport: handler.execute ? "execute" : (handler.run ? "run" : (handler.default ? "default" : null)),
              context: { agentId, authLevel, input, settings: this.settings, projectRoot: this.projectRoot },
              run: () => fn({ agentId, authLevel, input, memory, log }),
            });
            if (result && typeof result === "object" && !Array.isArray(result)) {
              return { ...result, trace_id: traceId };
            }
            return result;
          } catch (err) {
            span?.recordException?.(err);
            throw err;
          } finally {
            span?.end?.();
          }
        }
      }
    }

    // Default: return skill metadata + input echo (useful for LLM-side skills)
    log({ event_type: "INFO", message: `Skill '${skillManifest.id}' has no JS handler — returning echo.` });
    const fallback = {
      skill_id:   skillManifest.id,
      skill_name: skillManifest.name,
      version:    skillManifest.version,
      input_echo: input,
      note:       "No JS handler declared in SKILL.md frontmatter. LLM-driven skill context loaded.",
      skill_description: skillManifest.description ?? skillManifest.content?.slice(0, 300),
      trace_id: traceId,
    };
    span?.end?.();
    return fallback;
  }
}

module.exports = { AgentRunner };
