"use strict";
/**
 * tests/diff-engine.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for DiffEngine — pure function, no I/O.
 */

const { compare, findingKey } = require("../src/diff/diff-engine");

// ─── Test helpers ─────────────────────────────────────────────────────────────

function f(overrides = {}) {
  return {
    file:      "src/app.js",
    line_start: 10,
    principle: "Security",
    message:   "eval() detected",
    severity:  "HIGH",
    ...overrides,
  };
}

// ─── findingKey ───────────────────────────────────────────────────────────────

describe("findingKey()", () => {
  test("produces consistent key for same finding", () => {
    const a = f();
    const b = f();
    expect(findingKey(a)).toBe(findingKey(b));
  });

  test("differs for different files", () => {
    expect(findingKey(f({ file: "a.js" }))).not.toBe(findingKey(f({ file: "b.js" })));
  });

  test("differs for different lines", () => {
    expect(findingKey(f({ line_start: 1 }))).not.toBe(findingKey(f({ line_start: 2 })));
  });

  test("truncates message to 60 chars", () => {
    const long  = f({ message: "A".repeat(100) });
    const short = f({ message: "A".repeat(100) });
    expect(findingKey(long)).toBe(findingKey(short));
  });

  test("normalises backslashes in file path", () => {
    const win  = f({ file: "src\\app.js" });
    const unix = f({ file: "src/app.js" });
    expect(findingKey(win)).toBe(findingKey(unix));
  });
});

// ─── compare — empty arrays ───────────────────────────────────────────────────

describe("compare() — empty inputs", () => {
  test("returns all-zero summary for two empty arrays", () => {
    const { summary } = compare([], []);
    expect(summary.total_before).toBe(0);
    expect(summary.total_after).toBe(0);
    expect(summary.new_count).toBe(0);
    expect(summary.resolved_count).toBe(0);
    expect(summary.regressed).toBe(false);
  });

  test("trend_pct is null when baseline is empty (no division by zero)", () => {
    const { summary } = compare([], [f()]);
    expect(summary.trend_pct).toBeNull();
  });
});

// ─── new findings ─────────────────────────────────────────────────────────────

describe("compare() — new findings", () => {
  test("detects a finding present in current but not in baseline", () => {
    const { new_findings, summary } = compare([], [f()]);
    expect(new_findings).toHaveLength(1);
    expect(new_findings[0].message).toBe("eval() detected");
    expect(summary.new_count).toBe(1);
    expect(summary.regressed).toBe(true);
  });

  test("new_by_severity is populated", () => {
    const { summary } = compare([], [f({ severity: "HIGH" }), f({ severity: "CRITICAL", line_start: 99 })]);
    expect(summary.new_by_severity["HIGH"]).toBe(1);
    expect(summary.new_by_severity["CRITICAL"]).toBe(1);
  });
});

// ─── resolved ────────────────────────────────────────────────────────────────

describe("compare() — resolved", () => {
  test("detects a finding present in baseline but not in current", () => {
    const { resolved, summary } = compare([f()], []);
    expect(resolved).toHaveLength(1);
    expect(summary.resolved_count).toBe(1);
    expect(summary.regressed).toBe(false);
  });
});

// ─── severity changes ─────────────────────────────────────────────────────────

describe("compare() — severity changes", () => {
  test("detects worsened finding (LOW → CRITICAL)", () => {
    const baseline = f({ severity: "LOW" });
    const current  = f({ severity: "CRITICAL" });
    const { worsened, summary } = compare([baseline], [current]);
    expect(worsened).toHaveLength(1);
    expect(worsened[0].before.severity).toBe("LOW");
    expect(worsened[0].after.severity).toBe("CRITICAL");
    expect(summary.worsened_count).toBe(1);
    expect(summary.regressed).toBe(true);
  });

  test("detects improved finding (HIGH → LOW)", () => {
    const baseline = f({ severity: "HIGH" });
    const current  = f({ severity: "LOW" });
    const { improved, summary } = compare([baseline], [current]);
    expect(improved).toHaveLength(1);
    expect(summary.improved_count).toBe(1);
  });

  test("unchanged when severity stays the same", () => {
    const { unchanged, summary } = compare([f()], [f()]);
    expect(unchanged).toHaveLength(1);
    expect(summary.unchanged_count).toBe(1);
    expect(summary.regressed).toBe(false);
  });
});

// ─── trend ────────────────────────────────────────────────────────────────────

describe("compare() — trend", () => {
  test("negative trend when findings decrease", () => {
    const baseline = [f(), f({ line_start: 20 }), f({ line_start: 30 })];
    const current  = [f()];
    const { summary } = compare(baseline, current);
    expect(summary.trend_pct).toBeLessThan(0);
    expect(summary.delta).toBe(-2);
  });

  test("positive trend when findings increase", () => {
    const baseline = [f()];
    const current  = [f(), f({ line_start: 50 }), f({ line_start: 60 })];
    const { summary } = compare(baseline, current);
    expect(summary.trend_pct).toBeGreaterThan(0);
    expect(summary.delta).toBe(2);
  });
});

// ─── mixed scenario ───────────────────────────────────────────────────────────

describe("compare() — mixed scenario", () => {
  test("correctly classifies new, resolved, worsened, unchanged in one call", () => {
    const baseline = [
      f({ line_start: 1, severity: "HIGH" }),    // → unchanged
      f({ line_start: 2, severity: "LOW" }),     // → worsened (now CRITICAL)
      f({ line_start: 3, severity: "MEDIUM" }),  // → resolved
    ];
    const current = [
      f({ line_start: 1, severity: "HIGH" }),    // unchanged
      f({ line_start: 2, severity: "CRITICAL" }),// worsened
      f({ line_start: 99, severity: "HIGH" }),   // new
    ];
    const { new_findings, resolved, worsened, unchanged, summary } = compare(baseline, current);
    expect(new_findings).toHaveLength(1);
    expect(resolved).toHaveLength(1);
    expect(worsened).toHaveLength(1);
    expect(unchanged).toHaveLength(1);
    expect(summary.regressed).toBe(true);
  });
});
