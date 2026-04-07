"use strict";
/**
 * tests/engine.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for AgentRuntime initialization and core API.
 */

const path = require("path");
const { AgentRuntime } = require("../src/engine");

const PROJECT_ROOT = path.resolve(__dirname, "fixtures/project");

describe("AgentRuntime", () => {
  let runtime;

  beforeAll(async () => {
    runtime = new AgentRuntime({ projectRoot: PROJECT_ROOT });
    // Disable auto-discovery since test fixtures don't have agent.yaml
    await runtime.init({ autoDiscoverAgent: false });
  });

  afterAll(async () => {
    if (runtime) await runtime.shutdown();
  });

  test("initializes without error", () => {
    expect(runtime).toBeDefined();
  });

  test("loads the manifest correctly", () => {
    expect(runtime.manifest).toBeDefined();
    expect(runtime.manifest.spec_version).toBe("1.0.0");
  });

  test("loads settings correctly", () => {
    expect(runtime.settings).toBeDefined();
    expect(runtime.settings.runtime).toBeDefined();
    expect(runtime.settings.security.forbidden_file_patterns.length).toBeGreaterThan(0);
  });

  test("listHooks returns registered hooks", () => {
    const hooks = runtime.listHooks();
    expect(Array.isArray(hooks)).toBe(true);
    // pre-read, pre-skill, post-skill should be registered
    expect(hooks).toContain("pre-read");
  });

  test("listSkills returns registered skills", () => {
    const skills = runtime.listSkills();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("code-analysis");
  });

  test("throws if not initialized", () => {
    const rt = new AgentRuntime({ projectRoot: PROJECT_ROOT });
    expect(() => rt.listSkills()).toThrow("not initialized");
  });

  test("delegates task via event bus", () => {
    const evt = runtime.delegateTask("orchestrator-01", "executor-01", {
      action: "run-skill",
      skill: "code-analysis",
    });
    expect(evt.event_type).toBe("TaskDelegated");
    expect(evt.from).toBe("orchestrator-01");
    expect(evt.to).toBe("executor-01");
  });

  test("checkNetworkAccess enforces hooks", async () => {
    await expect(runtime.checkNetworkAccess({
      agent_id: "observer-01",
      auth_level: 1,
      url: "https://api.example.com/v1",
    })).rejects.toThrow("SECURITY_VIOLATION");
  });

  test("semanticEventHistory returns array", () => {
    const rows = runtime.semanticEventHistory("TaskDelegated", 3);
    expect(Array.isArray(rows)).toBe(true);
  });

  test("listExternalMcpTools returns array", () => {
    const tools = runtime.listExternalMcpTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  test("remember and retrieve long-term cognitive memory", async () => {
    const key = await runtime.rememberLongTerm("insight:test", { text: "sandbox hardening" }, { text: "sandbox hardening" });
    expect(key).toBe("insight:test");
    const row = await runtime.retrieveLongTerm("insight:test");
    expect(row.value).toEqual({ text: "sandbox hardening" });
  });

  test("semanticRecall returns array", async () => {
    await runtime.rememberLongTerm("insight:oauth", { text: "oauth rotation" }, { text: "oauth token rotation" });
    const hits = await runtime.semanticRecall("oauth", 3);
    expect(Array.isArray(hits)).toBe(true);
  });

  test("sandboxHealth returns structured status", async () => {
    const health = await runtime.sandboxHealth();
    expect(["healthy", "degraded", "offline"]).toContain(health.status);
  });

  test("trackStep and traceReport work", () => {
    runtime.trackStep({
      trace_id: "trace-demo",
      agent_id: "observer-01",
      skill_id: "code-analysis",
      phase: "pre_process",
      latency_ms: 7,
      token_usage: { input_tokens: 1, output_tokens: 1 },
    });
    const report = runtime.traceReport("trace-demo");
    expect(report.trace_id).toBe("trace-demo");
    expect(report.step_count).toBeGreaterThan(0);
  });
});
