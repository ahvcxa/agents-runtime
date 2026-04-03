"use strict";
/**
 * tests/engine.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for AgentRuntime initialization and core API.
 */

const path = require("path");
const { AgentRuntime } = require("../src/engine");

// Point to the sibling template project
const PROJECT_ROOT = path.resolve(__dirname, "./fixtures");

describe("AgentRuntime", () => {
  let runtime;

  beforeAll(async () => {
    runtime = new AgentRuntime({ projectRoot: PROJECT_ROOT });
    await runtime.init();
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
});
