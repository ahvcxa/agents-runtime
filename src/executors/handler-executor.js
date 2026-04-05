"use strict";
/**
 * src/executors/handler-executor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles skill execution via a declared JS handler file (SKILL.md → handler: path).
 * Runs the handler through the sandbox executor for proper isolation.
 */

const path = require("path");
const fs   = require("fs");
const { BaseExecutor }     = require("./base-executor");
const { executeInSandbox } = require("../sandbox/executor");

class HandlerExecutor extends BaseExecutor {
  /**
   * @param {object} options
   * @param {object}   options.runtime       - AgentRuntime instance
   * @param {string}   options.projectRoot
   * @param {object}   options.logger
   * @param {object}   options.settings
   */
  constructor({ runtime, projectRoot, logger, settings }) {
    super();
    this.runtime     = runtime;
    this.projectRoot = projectRoot;
    this.logger      = logger;
    this.settings    = settings;
  }

  /**
   * @param {object}   skillManifest
   * @param {string}   agentId
   * @param {number}   authLevel
   * @param {object}   input
   * @param {object}   memory
   * @param {Function} log
   * @param {string}   [traceId]
   * @returns {Promise<object>}
   */
  async execute(skillManifest, agentId, authLevel, input, memory, log, traceId) {
    const tracer = this.runtime?.tracer;
    const span   = tracer?.startSpan("skill.execute", {
      "agent.id": agentId,
      "skill.id": skillManifest.id,
      "trace.id": traceId,
    });

    const absHandler = path.resolve(this.projectRoot, skillManifest.handler);
    const handler    = require(absHandler);
    const fn         = handler.execute ?? handler.run ?? handler.default ?? handler;

    if (typeof fn !== "function") {
      span?.end?.();
      throw new Error(`[handler-executor] Skill '${skillManifest.id}' handler export is not a function`);
    }

    try {
      const runner = this.runtime?.sandboxManager?.execute?.bind(this.runtime.sandboxManager) ?? executeInSandbox;
      const result = await runner({
        strategy:        this.settings?.runtime?.sandbox?.strategy ?? "process",
        timeoutMs:       (this.settings?.runtime?.agent_timeout_seconds ?? 120) * 1000,
        logger:          this.logger,
        sandboxSettings: this.settings?.runtime?.sandbox ?? {},
        projectRoot:     this.projectRoot,
        handlerPath:     absHandler,
        handlerExport:   handler.execute ? "execute" : (handler.run ? "run" : (handler.default ? "default" : null)),
        context:         { agentId, authLevel, input, settings: this.settings, projectRoot: this.projectRoot },
        run:             () => fn({ agentId, authLevel, input, memory, log }),
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

  /** Returns true when this executor can handle the given skill manifest */
  static canHandle(skillManifest, projectRoot) {
    if (!skillManifest.handler) return false;
    const absHandler = path.resolve(projectRoot, skillManifest.handler);
    return fs.existsSync(absHandler);
  }
}

module.exports = { HandlerExecutor };
