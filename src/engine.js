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
const { MCPManager } = require("./mcp/client/mcp-manager");
const { createMemoryProvider } = require("./memory/providers/memory-provider-factory");
const { SandboxManager } = require("./sandbox/sandbox-manager");
const { StepTracker } = require("./observability/step-tracker");
const { createExporter } = require("./observability/exporters");
const { ApprovalManager } = require("./orchestration/approval-manager");
const { PipelineService } = require("./orchestration/pipeline-service");
const { runSecurityValidation } = require("./security/security-validator");
const SkillDiscovery = require("./loader/skill-discovery");

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

    // 1.5. Discover and validate skills (auto-discovery)
    await this._discoverAndValidateSkills();

    // 2. Validate security constraints (addresses 16 security findings)
    const packageJsonPath = path.join(this.projectRoot, "package.json");
    const packageJson = fs.existsSync(packageJsonPath)
      ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
      : {};
    runSecurityValidation(packageJson, this.settings);

    // Override verbosity if provided
    if (this._verbosity) this.settings.logging.verbosity_mode = this._verbosity;

    // 2. Boot infrastructure
    this.logger   = new StructuredLogger(this.settings, this.projectRoot);
    this.semanticMemory = createMemoryStore(this.settings, 3, "runtime-system", this.projectRoot);
    this.eventBus = new EventBus(this.logger, { semanticMemory: this.semanticMemory });
    this.tracer = createTracer("agents-runtime");
    this.mcpManager = new MCPManager(this.settings, this.logger);
    this.cognitiveMemory = createMemoryProvider(this.settings);
    this.sandboxManager = new SandboxManager(this.settings, this.logger);
    this.stepTracker = new StepTracker(this.logger);
    this.traceExporter = createExporter(this.settings, this.logger);
    this.approvalManager = new ApprovalManager(this.settings, this.logger);
    this.pipelineService = new PipelineService(this);

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

    // 5. Optional MCP client layer (v2.0)
    await this.mcpManager.init();

    // 6. Cognitive memory layer (v2.0)
    await this.cognitiveMemory.init();

    // 7. Sandbox provider layer (v2.0)
    await this.sandboxManager.init();

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

  listExternalMcpTools() {
    this._assertReady();
    return this.mcpManager.listDiscoveredTools();
  }

  async callExternalMcpTool(toolName, input = {}, options = {}) {
    this._assertReady();
    return this.mcpManager.callTool(toolName, input, options);
  }

  async mcpHealth() {
    this._assertReady();
    return this.mcpManager.healthCheck();
  }

  async rememberSession(sessionId, role, content, metadata = {}) {
    this._assertReady();
    const key = `session:${sessionId}:${Date.now()}`;
    await this.cognitiveMemory.store(key, { role, content, metadata }, {
      namespace: "session",
      session_id: sessionId,
      role,
    });
    return key;
  }

  async rememberLongTerm(key, value, options = {}) {
    this._assertReady();
    await this.cognitiveMemory.store(key, value, {
      namespace: "long_term",
      text: options.text || JSON.stringify(value),
      metadata: options.metadata || {},
    });
    return key;
  }

  async retrieveSession(sessionId, key = "*") {
    this._assertReady();
    return this.cognitiveMemory.retrieve(key, {
      namespace: "session",
      session_id: sessionId,
    });
  }

  async retrieveLongTerm(key) {
    this._assertReady();
    return this.cognitiveMemory.retrieve(key, { namespace: "long_term" });
  }

  async semanticRecall(query, topK = 5) {
    this._assertReady();
    return this.cognitiveMemory.semanticSearch(query, { top_k: topK });
  }

  async sandboxHealth() {
    this._assertReady();
    return this.sandboxManager.healthCheck();
  }

  trackStep(step) {
    this._assertReady();
    return this.stepTracker.track(step);
  }

  traceReport(traceId) {
    this._assertReady();
    return this.stepTracker.reportTrace(traceId);
  }

  async exportTrace(traceId) {
    this._assertReady();
    const report = this.traceReport(traceId);
    return this.traceExporter.exportTrace(report);
  }

  async runMcpSandboxMemoryPipeline(params) {
    this._assertReady();
    return this.pipelineService.runExternalMcpSandboxMemoryPipeline(params);
  }

  /** Graceful shutdown */
  async shutdown() {
    this.logger?.log({ event_type: "INFO", message: "AgentRuntime shutting down..." });
    await this.hookRegistry.dispatch("on_shutdown", { settings: this.settings });
    this.semanticMemory?.shutdown?.();
    await this.mcpManager?.shutdown?.();
    await this.cognitiveMemory?.shutdown?.();
    await this.sandboxManager?.shutdown?.();
    this.runner?.clearActiveTimers?.();
    this._ready = false;
  }

  _assertReady() {
    if (!this._ready) throw new Error("[engine] AgentRuntime not initialized. Call init() first.");
  }

  /**
   * Discover skills from filesystem and validate against manifest.
   * Logs warnings if unregistered skills are found.
   * @private
   */
  async _discoverAndValidateSkills() {
    const skillDiscoveryConfig = this.settings.runtime?.skill_auto_discovery || {};
    
    if (!skillDiscoveryConfig.enabled) {
      return; // Skip if disabled
    }

    try {
      const discovery = new SkillDiscovery({
        scanPath: skillDiscoveryConfig.scan_path || ".agents",
        pattern: skillDiscoveryConfig.pattern || "SKILL.md",
        logger: {
          log: (msg) => { /* silent */ },
          warn: (msg) => { /* silent */ }
        }
      });

      const result = await discovery.discoverSkills(this.projectRoot);
      const discoveredSkills = result.skills || [];
      const manifestSkills = this.manifest.skills || [];

      // Compare discovered with manifest
      const comparison = discovery.compareWithManifest(
        manifestSkills,
        discoveredSkills
      );

      // Log if there are unregistered skills
      if (comparison.only_discovered.length > 0) {
        this.logger?.log({
          event_type: "INFO",
          level: "warn",
          message: `Found ${comparison.only_discovered.length} unregistered skill(s)`,
          unregistered_skills: comparison.only_discovered.map(s => ({
            id: s.id,
            path: s.path,
            version: s.version
          })),
          hint: "Run 'npm run setup' to refresh the manifest.json",
          behavior: skillDiscoveryConfig.on_unregistered || "warn"
        });
      }

      // Log if there are orphaned skills in manifest
      if (comparison.only_manifest.length > 0) {
        this.logger?.log({
          event_type: "WARN",
          message: `Found ${comparison.only_manifest.length} orphaned skill(s) in manifest.json`,
          orphaned_skills: comparison.only_manifest.map(s => s.id),
          hint: "These skills are registered but not found in .agents/ directory"
        });
      }

      // Optionally auto-register unregistered skills at runtime (if enabled)
      if (skillDiscoveryConfig.auto_register_runtime === true && comparison.only_discovered.length > 0) {
        this.logger?.log({
          event_type: "INFO",
          message: `Auto-registering ${comparison.only_discovered.length} discovered skill(s)`,
          skills: comparison.only_discovered.map(s => s.id)
        });
        // Skills will be auto-registered when SkillRegistry processes them
      }

    } catch (err) {
      // Log but don't fail — missing discovery is not fatal
      this.logger?.log({
        event_type: "WARN",
        message: `Skill discovery failed: ${err.message}`,
        error_code: "SKILL_DISCOVERY_ERROR"
      });
    }
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
