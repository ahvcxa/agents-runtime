"use strict";

class StepTracker {
  constructor(logger = null) {
    this.logger = logger;
    this.steps = [];
  }

  track(step) {
    const row = {
      trace_id: step.trace_id,
      agent_id: step.agent_id,
      skill_id: step.skill_id,
      phase: step.phase,
      latency_ms: step.latency_ms,
      token_usage: step.token_usage || null,
      timestamp: new Date().toISOString(),
    };
    this.steps.push(row);
    if (this.steps.length > 5000) this.steps.shift();
    this.logger?.log?.({
      event_type: "INFO",
      message: "StepTracker event",
      ...row,
    });
    return row;
  }

  queryByTrace(traceId) {
    return this.steps.filter((s) => s.trace_id === traceId);
  }

  reportTrace(traceId) {
    const rows = this.queryByTrace(traceId);
    const totalLatency = rows.reduce((sum, row) => sum + (row.latency_ms || 0), 0);
    const tokenTotals = rows.reduce((acc, row) => {
      if (!row.token_usage) return acc;
      acc.input_tokens += row.token_usage.input_tokens || 0;
      acc.output_tokens += row.token_usage.output_tokens || 0;
      return acc;
    }, { input_tokens: 0, output_tokens: 0 });

    return {
      trace_id: traceId,
      steps: rows,
      step_count: rows.length,
      total_latency_ms: totalLatency,
      token_usage: tokenTotals,
    };
  }
}

module.exports = { StepTracker };
