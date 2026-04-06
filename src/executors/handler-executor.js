"use strict";
/**
 * src/executors/handler-executor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles skill execution via a declared JS handler file (SKILL.md → handler: path).
 * Runs the handler through the sandbox executor for proper isolation.
 *
 * For ESM projects: spawns handler in a separate Node.js subprocess to avoid
 * "require is not defined" errors when the parent project has "type": "module".
 */

const path = require("path");
const fs   = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { BaseExecutor }     = require("./base-executor");
const { executeInSandbox } = require("../sandbox/executor");

const execFileAsync = promisify(execFile);

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

    let absHandler = path.resolve(this.projectRoot, skillManifest.handler);
    let isCjsHandler = false;
    
    // Check if we should use .cjs variant (ESM project)
    if (!fs.existsSync(absHandler) && fs.existsSync(absHandler.replace(/\.js$/, '.cjs'))) {
      absHandler = absHandler.replace(/\.js$/, '.cjs');
      isCjsHandler = true;
      this.logger?.log?.({ event_type: "INFO", message: `[handler-executor] Using .cjs handler for ESM compatibility: ${absHandler}` });
    }

    let handler;
    
    try {
      handler = require(absHandler);
    } catch (err) {
      // For ESM projects, if require() fails, try subprocess approach for .cjs files
      const isEsmError = 
        err.message?.includes('require is not defined') || 
        err.message?.includes('module is not defined');
      
      if (isEsmError && isCjsHandler) {
        this.logger?.log?.({ event_type: "INFO", message: `[handler-executor] Running handler in subprocess due to ESM context` });
        return this._executeHandlerInSubprocess(skillManifest, agentId, authLevel, input, memory, absHandler, span, traceId);
      } else if (isEsmError) {
        const cjsHandler = absHandler.replace(/\.js$/, '.cjs');
        if (fs.existsSync(cjsHandler)) {
          this.logger?.log?.({ event_type: "INFO", message: `[handler-executor] Running handler in subprocess (ESM fallback): ${cjsHandler}` });
          return this._executeHandlerInSubprocess(skillManifest, agentId, authLevel, input, memory, cjsHandler, span, traceId);
        }
        span?.end?.();
        throw new Error(`[handler-executor] Failed to load skill '${skillManifest.id}' handler: ${err.message}`);
      } else {
        span?.end?.();
        throw err;
      }
    }
    
    const fn = handler.execute ?? handler.run ?? handler.default ?? handler;

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

  /**
   * Execute handler in a subprocess when ESM compatibility is needed
   * @private
   */
  async _executeHandlerInSubprocess(skillManifest, agentId, authLevel, input, memory, handlerPath, span, traceId) {
    const wrapperScript = path.join(__dirname, "../utils/handler-subprocess-wrapper.js");
    
    if (!fs.existsSync(wrapperScript)) {
      span?.end?.();
      throw new Error(`[handler-executor] Handler wrapper script not found: ${wrapperScript}`);
    }

    const args = [
      wrapperScript,
      handlerPath,
      JSON.stringify({ agentId, authLevel, input, projectRoot: this.projectRoot })
    ];

    try {
      const { stdout, stderr } = await execFileAsync("node", args, {
        timeout: (this.settings?.runtime?.agent_timeout_seconds ?? 120) * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (stderr) {
        this.logger?.log?.({ event_type: "WARN", message: `[handler-executor] Subprocess stderr: ${stderr}` });
      }

      const result = JSON.parse(stdout);
      if (result && typeof result === "object" && !Array.isArray(result)) {
        return { ...result, trace_id: traceId };
      }
      return result;
    } catch (err) {
      span?.recordException?.(err);
      throw new Error(`[handler-executor] Subprocess failed for skill '${skillManifest.id}': ${err.message}`);
    } finally {
      span?.end?.();
    }
  }

  /** Returns true when this executor can handle the given skill manifest */
  static canHandle(skillManifest, projectRoot) {
    if (!skillManifest.handler) return false;
    let absHandler = path.resolve(projectRoot, skillManifest.handler);
    if (fs.existsSync(absHandler)) return true;
    // For ESM projects, also check .cjs variant
    const cjsHandler = absHandler.replace(/\.js$/, '.cjs');
    return fs.existsSync(cjsHandler);
  }
}

module.exports = { HandlerExecutor };
