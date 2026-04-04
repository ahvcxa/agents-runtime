"use strict";
/**
 * tests/executor-factory.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for ExecutorFactory, HandlerExecutor (canHandle), and EchoExecutor.
 */

const path = require("path");
const { ExecutorFactory }  = require("../src/executors/executor-factory");
const { HandlerExecutor }  = require("../src/executors/handler-executor");
const { EchoExecutor }     = require("../src/executors/echo-executor");

const PROJECT_ROOT = path.resolve(__dirname, "fixtures/project");

// Minimal runtime stub
function makeRuntime(extraTracer = false) {
  return {
    tracer: extraTracer ? {
      startSpan: () => ({ end: jest.fn(), recordException: jest.fn() }),
      traceId:   () => "test-trace-id",
    } : null,
    projectRoot: PROJECT_ROOT,
    logger:  { log: jest.fn() },
    settings: { runtime: { sandbox: { strategy: "process" }, agent_timeout_seconds: 10 } },
  };
}

describe("HandlerExecutor.canHandle()", () => {
  test("returns false when skillManifest has no handler", () => {
    const skill = { id: "echo-skill" };
    expect(HandlerExecutor.canHandle(skill, PROJECT_ROOT)).toBe(false);
  });

  test("returns false when handler path does not exist on disk", () => {
    const skill = { id: "missing-skill", handler: ".agents/skills/nonexistent/handler.js" };
    expect(HandlerExecutor.canHandle(skill, PROJECT_ROOT)).toBe(false);
  });
});

describe("ExecutorFactory.for()", () => {
  test("returns EchoExecutor when skill has no handler", () => {
    const skill   = { id: "llm-skill" };
    const runtime = makeRuntime();
    const executor = ExecutorFactory.for(skill, {
      runtime,
      projectRoot: PROJECT_ROOT,
      logger:      runtime.logger,
      settings:    runtime.settings,
    });
    expect(executor).toBeInstanceOf(EchoExecutor);
  });

  test("returns EchoExecutor when handler path does not exist", () => {
    const skill   = { id: "missing-skill", handler: ".agents/skills/nonexistent/handler.js" };
    const runtime = makeRuntime();
    const executor = ExecutorFactory.for(skill, {
      runtime,
      projectRoot: PROJECT_ROOT,
      logger:      runtime.logger,
      settings:    runtime.settings,
    });
    expect(executor).toBeInstanceOf(EchoExecutor);
  });
});

describe("EchoExecutor.execute()", () => {
  test("returns skill metadata echo with trace_id", async () => {
    const runtime  = makeRuntime(true);
    const executor = new EchoExecutor({ runtime });

    const skill = {
      id:          "test-skill",
      name:        "Test Skill",
      version:     "1.0.0",
      description: "A test skill",
    };
    const log     = jest.fn();
    const result  = await executor.execute(skill, "agent-01", 1, { query: "test" }, {}, log, "trace-abc");

    expect(result.skill_id).toBe("test-skill");
    expect(result.skill_name).toBe("Test Skill");
    expect(result.trace_id).toBe("trace-abc");
    expect(result.input_echo).toEqual({ query: "test" });
    expect(result.note).toMatch(/No JS handler/);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event_type: "INFO" }));
  });

  test("includes skill_description fallback from description", async () => {
    const runtime  = makeRuntime(true);
    const executor = new EchoExecutor({ runtime });
    const skill    = { id: "s", name: "S", description: "My desc" };
    const result   = await executor.execute(skill, "a", 1, {}, {}, jest.fn(), "t1");
    expect(result.skill_description).toBe("My desc");
  });

  test("uses content slice when description is missing", async () => {
    const runtime  = makeRuntime(true);
    const executor = new EchoExecutor({ runtime });
    const skill    = { id: "s", name: "S", content: "A".repeat(400) };
    const result   = await executor.execute(skill, "a", 1, {}, {}, jest.fn(), "t1");
    expect(result.skill_description.length).toBe(300);
  });
});
