"use strict";
/**
 * tests/run-history-store.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for RunHistoryStore — save/list/load/loadPair lifecycle.
 * Uses a temp directory per test to avoid polluting the real project.
 */

const os   = require("os");
const path = require("path");
const fsp  = require("fs/promises");
const { RunHistoryStore } = require("../src/diff/run-history-store");

// ─── Setup: isolated temp dir per test ────────────────────────────────────────

let tmpDir;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "agents-history-test-"));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

function makeStore() {
  return new RunHistoryStore(tmpDir);
}

const SKILL = "security-audit";
const SAMPLE_RESULT = { findings: [{ id: "f1", severity: "HIGH", file: "src/app.js" }] };

// ─── save() ──────────────────────────────────────────────────────────────────

describe("RunHistoryStore.save()", () => {
  test("creates the skill directory and a .json file", async () => {
    const store = makeStore();
    const filePath = await store.save(SKILL, SAMPLE_RESULT);
    const stat = await fsp.stat(filePath);
    expect(stat.isFile()).toBe(true);
    expect(filePath.endsWith(".json")).toBe(true);
  });

  test("saved file is valid JSON with skill_id, timestamp, result", async () => {
    const store = makeStore();
    const filePath = await store.save(SKILL, SAMPLE_RESULT, { agent_id: "agent-01" });
    const raw = await fsp.readFile(filePath, "utf8");
    const record = JSON.parse(raw);
    expect(record.skill_id).toBe(SKILL);
    expect(record.result).toEqual(SAMPLE_RESULT);
    expect(record.meta.agent_id).toBe("agent-01");
    expect(typeof record.timestamp).toBe("string");
  });

  test("sanitizes skill id to prevent path traversal", async () => {
    const store = makeStore();
    const filePath = await store.save("../../evil-skill", SAMPLE_RESULT);
    // Should not escape tmpDir
    expect(filePath.startsWith(tmpDir)).toBe(true);
  });

  test("multiple saves create multiple files", async () => {
    const store = makeStore();
    await store.save(SKILL, SAMPLE_RESULT);
    await new Promise(r => setTimeout(r, 10)); // ensure timestamps differ
    await store.save(SKILL, SAMPLE_RESULT);
    const runs = await store.list(SKILL);
    expect(runs.length).toBe(2);
  });
});

// ─── list() ──────────────────────────────────────────────────────────────────

describe("RunHistoryStore.list()", () => {
  test("returns empty array when no runs exist", async () => {
    const store = makeStore();
    const runs = await store.list(SKILL);
    expect(runs).toEqual([]);
  });

  test("returns runs newest first", async () => {
    const store = makeStore();
    await store.save(SKILL, { findings: [{ id: "old" }] });
    await new Promise(r => setTimeout(r, 15));
    await store.save(SKILL, { findings: [{ id: "new" }] });
    const runs = await store.list(SKILL);
    expect(runs.length).toBe(2);
    // First entry should be the newer one (higher ISO timestamp)
    expect(runs[0].filename > runs[1].filename).toBe(true);
  });

  test("respects limit", async () => {
    const store = makeStore();
    for (let i = 0; i < 5; i++) {
      await store.save(SKILL, SAMPLE_RESULT);
      await new Promise(r => setTimeout(r, 5));
    }
    const runs = await store.list(SKILL, 3);
    expect(runs.length).toBe(3);
  });
});

// ─── load() ──────────────────────────────────────────────────────────────────

describe("RunHistoryStore.load()", () => {
  test("returns null when skill has no runs", async () => {
    const store = makeStore();
    const result = await store.load(SKILL, 0);
    expect(result).toBeNull();
  });

  test("loads most recent run with index 0", async () => {
    const store = makeStore();
    await store.save(SKILL, { findings: [{ id: "first" }] });
    await new Promise(r => setTimeout(r, 15));
    await store.save(SKILL, { findings: [{ id: "second" }] });

    const record = await store.load(SKILL, 0);
    expect(record.result.findings[0].id).toBe("second");
  });

  test("loads older run with index 1", async () => {
    const store = makeStore();
    await store.save(SKILL, { findings: [{ id: "first" }] });
    await new Promise(r => setTimeout(r, 15));
    await store.save(SKILL, { findings: [{ id: "second" }] });

    const record = await store.load(SKILL, 1);
    expect(record.result.findings[0].id).toBe("first");
  });

  test("returns null for out-of-range index", async () => {
    const store = makeStore();
    await store.save(SKILL, SAMPLE_RESULT);
    const result = await store.load(SKILL, 99);
    expect(result).toBeNull();
  });
});

// ─── loadPair() ──────────────────────────────────────────────────────────────

describe("RunHistoryStore.loadPair()", () => {
  test("returns {current:null, baseline:null} with no runs", async () => {
    const store = makeStore();
    const { current, baseline } = await store.loadPair(SKILL);
    expect(current).toBeNull();
    expect(baseline).toBeNull();
  });

  test("returns {current, baseline:null} with only one run", async () => {
    const store = makeStore();
    await store.save(SKILL, SAMPLE_RESULT);
    const { current, baseline } = await store.loadPair(SKILL);
    expect(current).not.toBeNull();
    expect(baseline).toBeNull();
  });

  test("returns both when two runs exist", async () => {
    const store = makeStore();
    await store.save(SKILL, { findings: [{ id: "v1" }] });
    await new Promise(r => setTimeout(r, 15));
    await store.save(SKILL, { findings: [{ id: "v2" }] });
    const { current, baseline } = await store.loadPair(SKILL);
    expect(current.result.findings[0].id).toBe("v2");
    expect(baseline.result.findings[0].id).toBe("v1");
  });
});
