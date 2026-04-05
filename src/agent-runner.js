"use strict";
/**
 * src/agent-runner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes a single agent skill through the full lifecycle:
 * compliance → pre-skill hook → skill execution → post-skill hook → event emit
 */

const path         = require("path");
const fs           = require("fs");
const fsp          = require("fs/promises");
const { spawn }      = require("child_process");
const os           = require("os");
const { randomUUID } = require("crypto");
const { ExecutorFactory } = require("./executors/executor-factory");
const { RunHistoryStore } = require("./diff/run-history-store");
const { ReasoningLoop } = require("./orchestration/reasoning-loop");
const { enforceHitl } = require("./orchestration/hitl-guard");

// ─── Async spawn helper ────────────────────────────────────────────────────────
/**
 * Non-blocking process execution using spawn().
 * Unlike execFile/promisify, this does NOT block the event loop under concurrent load.
 * stdout and stderr are streamed independently, supporting large outputs.
 *
 * @param {string}   command
 * @param {string[]} args
 * @param {object}   [options]
 * @param {string}   [options.cwd]
 * @param {number}   [options.timeoutMs]
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
function spawnAsync(command, args, options = {}) {
  const { cwd, timeoutMs = 30000 } = options;

  return new Promise((resolve, reject) => {
    const child  = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout   = "";
    let stderr   = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`[spawnAsync] Process timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        const err = new Error(`[spawnAsync] Process exited with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        err.code   = code;
        reject(err);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

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
    this.reasoningLoop = new ReasoningLoop(runtime);
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

    // 4. HITL guard (high-risk action approval)
    enforceHitl({
      input,
      settings: this.settings,
      logger: this.logger,
      traceId: runTraceId,
      agentId,
      skillId,
      approvalManager: this.runtime?.approvalManager,
    });

    // 5. Cognitive pre-processing (memory retrieval)
    const preStart = Date.now();
    const enhancedInput = await this.reasoningLoop.preProcess({
      agentId,
      skillId,
      input,
      traceId: runTraceId,
    });
    this.runtime?.trackStep?.({
      trace_id: runTraceId,
      agent_id: agentId,
      skill_id: skillId,
      phase: "pre_process",
      latency_ms: Date.now() - preStart,
    });

    // 6. Pre-skill hook
    let invocationKey;
    try {
      const results = await this.hookRegistry.dispatch("before_skill_execution", {
        agent_id: agentId, skill_id: skillId, auth_level: authLevel,
        skill_manifest: skillManifest, input: enhancedInput, memory, settings: this.settings, log,
      });
      invocationKey = results.find((r) => r.result?.invocation_key)?.result?.invocation_key;
    } catch (err) {
      this.logger.log({ event_type: "ERROR", agent_id: agentId, message: `pre-skill hook failed: ${err.message}` });
      throw err;
    }

    // 7. Execute skill
    const startMs = Date.now();
    let result, success;

    try {
      const actionStart = Date.now();
      this.eventBus.dispatch({
        event_type: "Action",
        from: agentId,
        trace_id: runTraceId,
        context_boundary: "Orchestration",
        payload: { skill_id: skillId },
      });

      result  = await this._executeSkill(skillManifest, agentId, authLevel, enhancedInput, memory, log, runTraceId);
      success = true;
      this.runtime?.trackStep?.({
        trace_id: runTraceId,
        agent_id: agentId,
        skill_id: skillId,
        phase: "action",
        latency_ms: Date.now() - actionStart,
        token_usage: result?.token_usage,
      });
    } catch (err) {
      result  = { error: err.message, trace_id: runTraceId };
      success = false;
      this.logger.log({ event_type: "ERROR", agent_id: agentId, skill_id: skillId, message: err.message });
    }

    const duration_ms = Date.now() - startMs;

    // 8. Post-skill hook
    await this.hookRegistry.dispatch("after_skill_execution", {
      agent_id: agentId, skill_id: skillId, invocation_key: invocationKey,
      result, success, duration_ms, memory, skill_manifest: skillManifest, log, emit,
    });

    // 9. Cognitive post-processing (trace + memory persistence)
    const postStart = Date.now();
    await this.reasoningLoop.postProcess({
      agentId,
      skillId,
      traceId: runTraceId,
      input: enhancedInput,
      result,
      success,
      durationMs: duration_ms,
    });
    this.runtime?.trackStep?.({
      trace_id: runTraceId,
      agent_id: agentId,
      skill_id: skillId,
      phase: "post_process",
      latency_ms: Date.now() - postStart,
    });

    try {
      await this.runtime?.exportTrace?.(runTraceId);
    } catch {
      // non-fatal observability path
    }

    // 10. Persist run history (async, non-blocking — errors are swallowed)
    if (success) {
      const historyStore = new RunHistoryStore(this.projectRoot);
      historyStore.save(skillId, result, {
        agent_id:   agentId,
        auth_level: authLevel,
        duration_ms,
        trace_id:   runTraceId,
      }).catch(() => { /* non-critical — never breaks the run */ });
    }

    return {
      success,
      result,
      error: success ? undefined : result.error,
      duration_ms,
    };
  }

  /** Run the compliance-check.js helper as a non-blocking subprocess */
  async _runComplianceCheck(agentConfig) {
    const checkerPath = path.join(this.projectRoot, ".agents", "helpers", "compliance-check.js");
    if (!fs.existsSync(checkerPath)) {
      this.logger.warn({ event_type: "WARN", message: "compliance-check.js not found, skipping." });
      return;
    }

    // Validate checkerPath (CWE-78: Command Injection prevention)
    const resolved    = path.resolve(checkerPath);
    const allowedBase = path.resolve(this.projectRoot, ".agents", "helpers");
    if (!resolved.startsWith(allowedBase)) {
      throw new Error("[compliance] Invalid checker path detected (path traversal)");
    }

    // Write agent config to a temp file
    const tmpFile = path.join(os.tmpdir(), `agent-config-${randomUUID()}.json`);
    await fsp.writeFile(tmpFile, JSON.stringify(agentConfig), "utf8");

    try {
      // spawnAsync is non-blocking — does not stall the event loop for concurrent agents
      await spawnAsync("node", [checkerPath, "--agent-config", tmpFile], {
        cwd:       this.projectRoot,
        timeoutMs: 15000,
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
   * Execute the actual skill by delegating to the appropriate executor.
   * Uses ExecutorFactory to select HandlerExecutor (JS handler) or EchoExecutor (LLM fallback).
   */
  async _executeSkill(skillManifest, agentId, authLevel, input, memory, log, runTraceId) {
    // Validate and gate network requests before execution
    await this._validateNetworkRequests(input, agentId, authLevel);

    const traceId = runTraceId ?? this.runtime?.tracer?.traceId?.();
    const executor = ExecutorFactory.for(skillManifest, {
      runtime:     this.runtime,
      projectRoot: this.projectRoot,
      logger:      this.logger,
      settings:    this.settings,
    });

    return executor.execute(skillManifest, agentId, authLevel, input, memory, log, traceId);
  }

  /**
   * Validate network requests and dispatch before_network_access hooks.
   * @param {object} input
   * @param {string} agentId
   * @param {number} authLevel
   */
  async _validateNetworkRequests(input, agentId, authLevel) {
    if (!Array.isArray(input?.network_requests)) return;

    for (const req of input.network_requests) {
      const url = req?.url;

      // Null/type validation
      if (!url || typeof url !== "string") {
        throw new Error("[agent-runner] Network request URL is required and must be a non-empty string");
      }

      // Format validation
      try {
        new URL(url);
      } catch {
        throw new Error(`[agent-runner] Invalid URL format: ${url}`);
      }

      await this.hookRegistry.dispatch("before_network_access", {
        agent_id:   agentId,
        auth_level: authLevel,
        url,
        method:     req?.method ?? "GET",
        settings:   this.settings,
      });
    }
  }
}

module.exports = { AgentRunner };
