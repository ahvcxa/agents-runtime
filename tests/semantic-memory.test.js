"use strict";
/**
 * tests/semantic-memory.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for SemanticMemoryClient.
 */

const { SemanticMemoryClient } = require("../src/memory/semantic-memory");

function makeCfg(enabled = true, topK = 5) {
  return { enabled, top_k: topK };
}

describe("SemanticMemoryClient", () => {
  describe("enabled flag", () => {
    test("is true when configured with enabled: true", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      expect(mem.enabled).toBe(true);
    });

    test("is false when configured with enabled: false", () => {
      const mem = new SemanticMemoryClient(makeCfg(false), "agent-01");
      expect(mem.enabled).toBe(false);
    });

    test("is false when config is empty", () => {
      const mem = new SemanticMemoryClient({}, "agent-01");
      expect(mem.enabled).toBe(false);
    });
  });

  describe("appendEvent()", () => {
    test("does nothing when disabled", () => {
      const mem = new SemanticMemoryClient(makeCfg(false), "agent-01");
      mem.appendEvent({ event_type: "TaskDelegated", trace_id: "t1", message_id: "m1" });
      expect(mem.search("TaskDelegated")).toEqual([]);
    });

    test("indexes event when enabled", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      mem.appendEvent({
        event_type: "TaskDelegated",
        trace_id:   "t1",
        message_id: "m1",
        payload:    { action: "run-skill" },
      });
      const hits = mem.search("TaskDelegated");
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].event_type).toBe("TaskDelegated");
    });

    test("uses fallback key when message_id missing", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      mem.appendEvent({ event_type: "InfoEvent", trace_id: "t2" });
      const hits = mem.search("InfoEvent");
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });

    test("uses fallback trace_id when trace_id missing", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      mem.appendEvent({ event_type: "OrphanEvent", message_id: "m1" });
      const hits = mem.search("OrphanEvent");
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("search()", () => {
    test("returns empty array for empty query", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      mem.appendEvent({ event_type: "A", trace_id: "t1", message_id: "m1" });
      expect(mem.search("")).toEqual([]);
    });

    test("returns empty array when nothing matches", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      mem.appendEvent({ event_type: "B", trace_id: "t1", message_id: "m1" });
      expect(mem.search("zzz-no-match-zzz")).toEqual([]);
    });

    test("respects top_k limit", () => {
      const mem = new SemanticMemoryClient({ enabled: true, top_k: 2 }, "agent-01");
      for (let i = 0; i < 5; i++) {
        mem.appendEvent({ event_type: "Repeated", trace_id: `t${i}`, message_id: `m${i}` });
      }
      const hits = mem.search("Repeated", { top_k: 2 });
      expect(hits.length).toBeLessThanOrEqual(2);
    });

    test("is case-insensitive", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      mem.appendEvent({ event_type: "SecurityAudit", trace_id: "t1", message_id: "m1" });
      expect(mem.search("securityaudit").length).toBeGreaterThanOrEqual(1);
      expect(mem.search("SECURITYAUDIT").length).toBeGreaterThanOrEqual(1);
    });

    test("searches payload content", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      mem.appendEvent({
        event_type: "X",
        trace_id:   "t1",
        message_id: "m1",
        payload:    { skill: "code-analysis", severity: "critical" },
      });
      expect(mem.search("code-analysis").length).toBeGreaterThanOrEqual(1);
      expect(mem.search("critical").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("shutdown()", () => {
    test("clears the internal store", () => {
      const mem = new SemanticMemoryClient(makeCfg(true), "agent-01");
      mem.appendEvent({ event_type: "X", trace_id: "t1", message_id: "m1" });
      expect(mem.search("X").length).toBeGreaterThanOrEqual(1);
      mem.shutdown();
      expect(mem.search("X")).toEqual([]);
    });
  });
});
