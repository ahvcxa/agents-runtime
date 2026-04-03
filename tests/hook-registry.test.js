"use strict";
/**
 * tests/hook-registry.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for HookRegistry — dispatch, security violations, optional vs required.
 */

const path = require("path");
const { HookRegistry } = require("../src/registry/hook-registry");
const { StructuredLogger } = require("../src/logger/structured-logger");
const { loadSettings } = require("../src/loader/settings-loader");

const PROJECT_ROOT = path.resolve(__dirname, "./fixtures");

// Minimal logger that doesn't write to disk
const nullLogger = { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, audit: () => {} };

function makeHookDefs() {
  return [
    {
      id:           "pre-read",
      path:         ".agents/hooks/pre-read.hook.js",
      absolutePath: path.join(PROJECT_ROOT, ".agents/hooks/pre-read.hook.js"),
      fires:        "before_filesystem_read",
      required:     true,
    },
    {
      id:           "pre-skill",
      path:         ".agents/hooks/skill-lifecycle.hook.js",
      absolutePath: path.join(PROJECT_ROOT, ".agents/hooks/skill-lifecycle.hook.js"),
      export:       "preSkillHook",
      fires:        "before_skill_execution",
      required:     true,
    },
    {
      id:           "post-skill",
      path:         ".agents/hooks/skill-lifecycle.hook.js",
      absolutePath: path.join(PROJECT_ROOT, ".agents/hooks/skill-lifecycle.hook.js"),
      export:       "postSkillHook",
      fires:        "after_skill_execution",
      required:     true,
    },
  ];
}

describe("HookRegistry", () => {
  let registry;
  let settings;

  beforeAll(() => {
    settings = loadSettings(PROJECT_ROOT);
    registry = new HookRegistry(makeHookDefs(), nullLogger);
  });

  test("registers all hooks from manifest defs", () => {
    const hooks = registry.list();
    expect(hooks).toContain("pre-read");
    expect(hooks).toContain("pre-skill");
    expect(hooks).toContain("post-skill");
  });

  test("pre-read hook ALLOWS a safe path", async () => {
    const results = await registry.dispatch("before_filesystem_read", {
      agent_id:  "test-agent",
      file_path: "src/index.js",
      auth_level: 1,
      settings,
    });
    expect(results[0].result).toEqual({ allowed: true });
  });

  test("pre-read hook BLOCKS a forbidden path (.env)", async () => {
    await expect(
      registry.dispatch("before_filesystem_read", {
        agent_id:  "test-agent",
        file_path: ".env",
        auth_level: 1,
        settings,
      })
    ).rejects.toThrow("SECURITY_VIOLATION");
  });

  test("pre-read hook BLOCKS path traversal (../ attack)", async () => {
    await expect(
      registry.dispatch("before_filesystem_read", {
        agent_id:  "test-agent",
        file_path: "../../etc/passwd",
        auth_level: 1,
        settings,
      })
    ).rejects.toThrow("SECURITY_VIOLATION");
  });

  test("dispatch returns empty array for unknown lifecycle event", async () => {
    const results = await registry.dispatch("unknown_event", {});
    expect(results).toEqual([]);
  });
});
