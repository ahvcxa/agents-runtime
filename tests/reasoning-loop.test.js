"use strict";

const { ReasoningLoop } = require("../src/orchestration/reasoning-loop");

describe("ReasoningLoop", () => {
  test("preProcess injects retrieved memories", async () => {
    const runtime = {
      semanticRecall: jest.fn().mockResolvedValue([{ key: "k1", score: 0.9 }]),
      eventBus: { dispatch: jest.fn() },
    };
    const loop = new ReasoningLoop(runtime);

    const out = await loop.preProcess({
      agentId: "a1",
      skillId: "s1",
      input: { query: "oauth" },
      traceId: "t1",
    });

    expect(runtime.semanticRecall).toHaveBeenCalledWith("oauth", 5);
    expect(Array.isArray(out._retrieved_memories)).toBe(true);
    expect(out._retrieved_memories.length).toBe(1);
  });

  test("postProcess writes memory and emits observation", async () => {
    const runtime = {
      rememberSession: jest.fn().mockResolvedValue("session-key"),
      rememberLongTerm: jest.fn().mockResolvedValue("lt-key"),
      eventBus: { dispatch: jest.fn() },
    };
    const loop = new ReasoningLoop(runtime);

    await loop.postProcess({
      agentId: "a1",
      skillId: "s1",
      traceId: "t1",
      input: { query: "x" },
      result: { ok: true },
      success: true,
      durationMs: 12,
    });

    expect(runtime.rememberSession).toHaveBeenCalled();
    expect(runtime.rememberLongTerm).toHaveBeenCalled();
    expect(runtime.eventBus.dispatch).toHaveBeenCalled();
  });
});
