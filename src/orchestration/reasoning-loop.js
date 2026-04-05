"use strict";

class ReasoningLoop {
  constructor(runtime) {
    this.runtime = runtime;
  }

  _extractQuery(input = {}) {
    if (typeof input.query === "string" && input.query.trim()) return input.query.trim();
    if (typeof input.prompt === "string" && input.prompt.trim()) return input.prompt.trim();
    if (typeof input.task === "string" && input.task.trim()) return input.task.trim();
    if (typeof input.message === "string" && input.message.trim()) return input.message.trim();
    return "";
  }

  async preProcess({ agentId, skillId, input, traceId }) {
    const query = this._extractQuery(input);
    let retrieved = [];

    if (query && typeof this.runtime?.semanticRecall === "function") {
      try {
        retrieved = await this.runtime.semanticRecall(query, 5);
      } catch {
        retrieved = [];
      }
    }

    this.runtime?.eventBus?.dispatch?.({
      event_type: "Thought",
      from: agentId,
      context_boundary: "Orchestration",
      trace_id: traceId,
      payload: {
        skill_id: skillId,
        query_present: Boolean(query),
        retrieved_count: retrieved.length,
      },
    });

    return {
      ...input,
      _retrieved_memories: retrieved,
      _trace_id: traceId,
    };
  }

  async postProcess({ agentId, skillId, traceId, input, result, success, durationMs }) {
    const sessionId = `session:${agentId}`;

    try {
      await this.runtime?.rememberSession?.(sessionId, "assistant", JSON.stringify({
        skill_id: skillId,
        success,
        duration_ms: durationMs,
      }), { trace_id: traceId });
    } catch {
      // non-fatal
    }

    if (success) {
      try {
        const key = `insight:${skillId}:${traceId}`;
        await this.runtime?.rememberLongTerm?.(key, {
          skill_id: skillId,
          trace_id: traceId,
          input_summary: {
            keys: Object.keys(input || {}),
          },
          result,
        }, {
          text: `${skillId} success trace ${traceId}`,
          metadata: { agent_id: agentId, duration_ms: durationMs },
        });
      } catch {
        // non-fatal
      }
    }

    this.runtime?.eventBus?.dispatch?.({
      event_type: "Observation",
      from: agentId,
      context_boundary: "Orchestration",
      trace_id: traceId,
      payload: {
        skill_id: skillId,
        success,
        duration_ms: durationMs,
      },
    });
  }
}

module.exports = { ReasoningLoop };
