"use strict";
/**
 * tests/memory-store.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the memory store: TTL expiry, tag queries, access control.
 */

const { createMemoryStore } = require("../src/memory/memory-store");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "fixtures/project");

const BASE_SETTINGS = {
  memory: {
    enabled:            true,
    backend:            "in-process",
    redis:              {},
    postgres:           {},
    vector:             {},
    ttl_default_seconds: 3600,
    max_size_mb:        256,
    indexes: {
      key_value: { enabled: true, max_value_size_kb: 64 },
      tag_based: { enabled: true, max_result_set: 500 },
    },
    access_control: {
      rules: [
        { namespace_pattern: "agent:*:state",        read_min_level: 1, write_min_level: 2 },
        { namespace_pattern: "skill:*:cache:*",      read_min_level: 1, write_min_level: 1 },
        { namespace_pattern: "pipeline:*",           read_min_level: 1, write_min_level: 3 },
      ],
    },
    persistence: { enabled: false },
  },
};

describe("MemoryStore", () => {
  test("set and get a value", () => {
    const mem = createMemoryStore(BASE_SETTINGS, 1, "test-agent", PROJECT_ROOT);
    mem.set("skill:analysis:cache:abc123", { result: 42 }, { ttl_seconds: 60 });
    const val = mem.get("skill:analysis:cache:abc123");
    expect(val).toEqual({ result: 42 });
  });

  test("returns undefined for expired key", async () => {
    const mem = createMemoryStore(BASE_SETTINGS, 1, "test-agent", PROJECT_ROOT);
    mem.set("skill:analysis:cache:expired", { x: 1 }, { ttl_seconds: 0 });

    // TTL=0 means it expires immediately
    await new Promise((r) => setTimeout(r, 10));
    const val = mem.get("skill:analysis:cache:expired");
    expect(val).toBeUndefined();
  });

  test("queryByTags returns matching entries", () => {
    const mem = createMemoryStore(BASE_SETTINGS, 1, "test-agent", PROJECT_ROOT);
    mem.set("skill:analysis:cache:t1", { a: 1 }, { tags: ["severity:high", "context:analysis"] });
    mem.set("skill:analysis:cache:t2", { b: 2 }, { tags: ["severity:low",  "context:analysis"] });

    const results = mem.queryByTags(["context:analysis"]);
    expect(results.length).toBe(2);

    const high = mem.queryByTags(["severity:high"]);
    expect(high.length).toBe(1);
    expect(high[0].value).toEqual({ a: 1 });
  });

  test("level-1 agent CANNOT write to agent:*:state (requires level 2)", () => {
    const mem = createMemoryStore(BASE_SETTINGS, 1, "observer-01", PROJECT_ROOT);
    expect(() => mem.set("agent:observer-01:state", { status: "running" })).toThrow();
  });

  test("level-2 agent CAN write to agent:*:state", () => {
    const mem = createMemoryStore(BASE_SETTINGS, 2, "executor-01", PROJECT_ROOT);
    expect(() => mem.set("agent:executor-01:state", { status: "running" })).not.toThrow();
  });

  test("level-1 agent CANNOT write to pipeline:* (requires level 3)", () => {
    const mem = createMemoryStore(BASE_SETTINGS, 1, "observer-01", PROJECT_ROOT);
    expect(() => mem.set("pipeline:run-123:checkpoint", {})).toThrow();
  });

  test("stats returns correct counts", () => {
    const mem = createMemoryStore(BASE_SETTINGS, 1, "observer-01", PROJECT_ROOT);
    mem.set("skill:analysis:cache:s1", { x: 1 });
    mem.set("skill:analysis:cache:s2", { y: 2 });
    const stats = mem.stats();
    expect(stats.total_keys).toBeGreaterThanOrEqual(2);
  });

  test("supports adapter selection for redis backend", () => {
    const cfg = JSON.parse(JSON.stringify(BASE_SETTINGS));
    cfg.memory.backend = "redis";
    const mem = createMemoryStore(cfg, 1, "observer-01", PROJECT_ROOT);
    mem.set("skill:analysis:cache:r1", { ok: true });
    expect(mem.get("skill:analysis:cache:r1")).toEqual({ ok: true });
    expect(mem.stats().backend).toBe("redis");
  });

  test("supports adapter selection for postgres backend", () => {
    const cfg = JSON.parse(JSON.stringify(BASE_SETTINGS));
    cfg.memory.backend = "postgres";
    const mem = createMemoryStore(cfg, 1, "observer-01", PROJECT_ROOT);
    mem.set("skill:analysis:cache:p1", { ok: true });
    expect(mem.get("skill:analysis:cache:p1")).toEqual({ ok: true });
    expect(mem.stats().backend).toBe("postgres");
  });

  test("appends and searches semantic events", () => {
    const cfg = JSON.parse(JSON.stringify(BASE_SETTINGS));
    cfg.memory.semantic_events = { enabled: true, top_k: 5 };
    const mem = createMemoryStore(cfg, 3, "runtime-system", PROJECT_ROOT);
    mem.appendSemanticEvent({
      event_type: "TaskDelegated",
      trace_id: "trace-1",
      message_id: "msg-1",
      payload: { action: "run-skill", skill: "code-analysis" },
    });

    const hits = mem.semanticSearch("run-skill", { top_k: 3 });
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].event_type).toBe("TaskDelegated");
  });
});
