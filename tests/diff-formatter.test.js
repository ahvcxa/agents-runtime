const { formatTerminal, formatJson } = require("../src/diff/diff-formatter");

describe("DiffFormatter", () => {
  const dummyDiff = {
    summary: { total_before: 5, total_after: 6, trend_pct: 20, regressed: true },
    new_findings: [
      { severity: "CRITICAL", file: "src/auth.js", line_start: 10, message: "Missing JWT validation" }
    ],
    resolved: [
      { severity: "LOW", file: "src/utils.js", line_start: 42, message: "Unused variable" }
    ],
    worsened: [
      { 
        before: { severity: "MEDIUM", file: "src/main.js" }, 
        after:  { severity: "HIGH", file: "src/main.js", line_start: 55 } 
      }
    ],
    improved: []
  };

  const dummyMeta = {
    baseline: { git_sha: "abc1234", timestamp: "2026-04-04T12:00:00Z" },
    current: { git_sha: "def5678", timestamp: "2026-04-04T12:05:00Z" }
  };

  test("formatJson includes diff and meta", () => {
    const result = formatJson(dummyDiff, dummyMeta);
    expect(result.summary.total_after).toBe(6);
    expect(result.meta.baseline.git_sha).toBe("abc1234");
  });

  test("formatTerminal handles basic output correctly", () => {
    const text = formatTerminal(dummyDiff, dummyMeta);
    
    // Check header
    expect(text).toContain("Diff vs. abc1234");
    // Check summary
    expect(text).toContain("Trend");
    expect(text).toContain("5 → 6 findings");
    expect(text).toContain("+20%");
    
    // Check sections
    expect(text).toContain("NEW");
    expect(text).toContain("src/auth.js:10");
    expect(text).toContain("Missing JWT validation");

    expect(text).toContain("FIXED");
    expect(text).toContain("src/utils.js:42");

    expect(text).toContain("WORSE");
    expect(text).toContain("MEDIUM");
    expect(text).toContain("HIGH");
    
    expect(text).toContain("Regressions detected");
    
    expect(text).not.toContain("BETTER"); // improved was empty
  });

  test("formatTerminal handles no baseline edge case safely", () => {
    const diffNoBaseline = {
      summary: { total_before: 0, total_after: 2, trend_pct: null, regressed: true },
      new_findings: [{}, {}],
      resolved: [], worsened: [], improved: []
    };
    const text = formatTerminal(diffNoBaseline, {});
    expect(text).toContain("(no baseline)");
    expect(text).toContain("previous run");
  });
});
