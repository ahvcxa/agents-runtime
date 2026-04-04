"use strict";
/**
 * src/executors/echo-executor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fallback executor for LLM-driven skills that declare no JS handler.
 * Returns skill metadata + input echo so the LLM can consume the context.
 */

const { BaseExecutor } = require("./base-executor");

class EchoExecutor extends BaseExecutor {
  /**
   * @param {object} options
   * @param {object} options.runtime - AgentRuntime instance
   */
  constructor({ runtime }) {
    super();
    this.runtime = runtime;
  }

  async execute(skillManifest, agentId, authLevel, input, memory, log, traceId) {
    const tracer = this.runtime?.tracer;
    const span   = tracer?.startSpan("skill.execute", {
      "agent.id": agentId,
      "skill.id": skillManifest.id,
      "trace.id": traceId,
    });

    log({ event_type: "INFO", message: `Skill '${skillManifest.id}' has no JS handler — returning echo.` });

    const result = {
      skill_id:          skillManifest.id,
      skill_name:        skillManifest.name,
      version:           skillManifest.version,
      input_echo:        input,
      note:              "No JS handler declared in SKILL.md frontmatter. LLM-driven skill context loaded.",
      skill_description: skillManifest.description ?? skillManifest.content?.slice(0, 300),
      trace_id:          traceId,
    };

    span?.end?.();
    return result;
  }
}

module.exports = { EchoExecutor };
