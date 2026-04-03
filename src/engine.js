"use strict";
/**
 * src/engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AgentRuntime — the central orchestrator.
 * Bootstraps from manifest.json + settings.json and exposes the public API.
 */

const path = require("path");
const fs   = require("fs");

const { loadManifest }   = require("./loader/manifest-loader");
const { loadSettings }   = require("./loader/settings-loader");
const { StructuredLogger }= require("./logger/structured-logger");
const { EventBus }       = require("./events/event-bus");
const { HookRegistry }   = require("./registry/hook-registry");
const { SkillRegistry }  = require("./registry/skill-registry");
const { AgentRunner }    = require("./agent-runner");
const { createTracer }   = require("./telemetry/tracer");
const { createMemoryStore } = require("./memory/memory-store");

class AgentRuntime {
  /**
   * @param {object} options
   * @param {string} options.projectRoot - Absolute path to the project using .agents/
   * @param {string} [options.verbosity]  - Override verbosity_mode
   */
  constructor({ projectRoot, verbosity } = {}) {
    if (!projectRoot) throw new Error("[engine] projectRoot is required");
    this.projectRoot = path.resolve(projectRoot);
    this._verbosity  = verbosity;
    this._ready      = false;
  }

  /**
   * Initialize the runtime. Must be called before any other method.
   * @returns {Promise<AgentRuntime>} this
   */
  async init() {
    // 1. Load config
    this.manifest = loadManifest(this.projectRoot);
    this.settings = loadSettings(this.projectRoot);

    // Override verbosity if provided
    if (this._verbosity) this.settings.logging.verbosity_mode = this._verbosity;

    // 2. Boot infrastructure
    this.logger   = new StructuredLogger(this.settings, this.projectRoot);
    this.semanticMemory = createMemoryStore(this.settings, 3, "runtime-system", this.projectRoot);
    this.eventBus = new EventBus(this.logger, { semanticMemory: this.semanticMemory });
    this.tracer = createTracer("agents-runtime");

    this.logger.log({
      event_type: "INFO",
      message:    `AgentRuntime booting — project: ${this.projectRoot}`,
      spec_version: this.manifest.spec_version,
    });

    // 3. Boot registries
    this.hookRegistry  = new HookRegistry(this.manifest.hooks, this.logger);
    this.skillRegistry = new SkillRegistry(this.manifest.skills, this.settings, this.logger);

    // 4. Boot runner
    this.runner = new AgentRunner(this);

    this._ready = true;
    this.logger.log({ event_type: "INFO", message: "AgentRuntime ready." });

    return this;
  }

  /**
   * Run a skill for an agent.
   * @param {object} agentConfig - Parsed YAML { agent: { id, role, authorization_level, skill_set } }
   * @param {string} skillId
   * @param {object} [input]
   */
  async runAgent(agentConfig, skillId, input = {}) {
    this._assertReady();
    return this.runner.run(agentConfig, skillId, input);
  }

  /**
   * Fire a filesystem pre-read hook to validate a path.
   * @param {object} context - { agent_id, file_path, auth_level }
   */
  async checkFileAccess(context) {
    this._assertReady();
    return this.hookRegistry.dispatch("before_filesystem_read", {
      ...context,
      settings: this.settings,
    });
  }

  async checkNetworkAccess(context) {
    this._assertReady();
    return this.hookRegistry.dispatch("before_network_access", {
      ...context,
      settings: this.settings,
    });
  }

  /** List all registered hooks */
  listHooks() {
    this._assertReady();
    return this.hookRegistry.list();
  }

  /** List all registered skills */
  listSkills() {
    this._assertReady();
    return this.skillRegistry.listSkills();
  }

  /** Subscribe to domain events */
  onEvent(eventType, handler) {
    this._assertReady();
    this.eventBus.subscribe(eventType, handler);
  }

  delegateTask(fromAgentId, toAgentId, task) {
    this._assertReady();
    return this.eventBus.delegateTask(fromAgentId, toAgentId, task);
  }

  /** Get recent event history */
  eventHistory(limit = 50) {
    this._assertReady();
    return this.eventBus.history(limit);
  }

  semanticEventHistory(query, topK = 5) {
    this._assertReady();
    return this.eventBus.semanticHistory(query, topK);
  }

  /** Graceful shutdown */
  async shutdown() {
    this.logger?.log({ event_type: "INFO", message: "AgentRuntime shutting down..." });
    await this.hookRegistry.dispatch("on_shutdown", { settings: this.settings });
    this.semanticMemory?.shutdown?.();
    this.runner?.clearActiveTimers?.();
    this._ready = false;
  }

  _assertReady() {
    if (!this._ready) throw new Error("[engine] AgentRuntime not initialized. Call init() first.");
  }
}

/**
 * Factory helper — create and initialize in one call.
 * @param {object} options
 * @returns {Promise<AgentRuntime>}
 */
async function createRuntime(options) {
  const rt = new AgentRuntime(options);
  await rt.init();
  return rt;
}

module.exports = { AgentRuntime, createRuntime };
