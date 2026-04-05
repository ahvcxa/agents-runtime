"use strict";

const { StepTracker } = require("../src/observability/step-tracker");

describe("StepTracker", () => {
  test("tracks and reports trace metrics", () => {
    const tracker = new StepTracker();
    tracker.track({
      trace_id: "t1",
      agent_id: "a1",
      skill_id: "s1",
      phase: "pre_process",
      latency_ms: 10,
      token_usage: { input_tokens: 2, output_tokens: 1 },
    });
    tracker.track({
      trace_id: "t1",
      agent_id: "a1",
      skill_id: "s1",
      phase: "action",
      latency_ms: 40,
      token_usage: { input_tokens: 5, output_tokens: 3 },
    });

    const report = tracker.reportTrace("t1");
    expect(report.step_count).toBe(2);
    expect(report.total_latency_ms).toBe(50);
    expect(report.token_usage.input_tokens).toBe(7);
    expect(report.token_usage.output_tokens).toBe(4);
  });
});
