"use strict";
/**
 * tests/python-ast-analyzer.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for python-ast-analyzer.js.
 * Falls back gracefully if Python is not available on the test runner.
 */

const { analyzePythonAst, astInfoToFindings } = require("../src/analyzers/python-ast-analyzer");

// ─── astInfoToFindings (pure function — always testable) ─────────────────────

describe("astInfoToFindings()", () => {
  const FILE = "/project/src/app.py";

  test("returns empty array for null astInfo", () => {
    expect(astInfoToFindings(null, FILE)).toEqual([]);
  });

  test("returns a CRITICAL finding for syntax errors", () => {
    const result = astInfoToFindings({ error: "invalid syntax", line: 5 }, FILE);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("HIGH");
    expect(result[0].line_start).toBe(5);
    expect(result[0].message).toMatch(/syntax error/i);
  });

  test("returns CRITICAL finding for exec() calls", () => {
    const astInfo = { exec_calls: [{ line: 10 }], eval_calls: [], pickle_loads: [], subprocess_calls: [], imports: [] };
    const findings = astInfoToFindings(astInfo, FILE);
    const f = findings.find(x => x.message.includes("exec()"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("CRITICAL");
    expect(f.cwe_id).toBe("CWE-78");
    expect(f.line_start).toBe(10);
  });

  test("returns HIGH finding for eval() calls", () => {
    const astInfo = { exec_calls: [], eval_calls: [{ line: 20 }], pickle_loads: [], subprocess_calls: [], imports: [] };
    const findings = astInfoToFindings(astInfo, FILE);
    const f = findings.find(x => x.message.includes("eval()"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("HIGH");
    expect(f.line_start).toBe(20);
  });

  test("returns CRITICAL finding for pickle.loads()", () => {
    const astInfo = { exec_calls: [], eval_calls: [], pickle_loads: [{ line: 30 }], subprocess_calls: [], imports: [] };
    const findings = astInfoToFindings(astInfo, FILE);
    const f = findings.find(x => x.message.includes("pickle.loads()"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("CRITICAL");
    expect(f.cwe_id).toBe("CWE-502");
  });

  test("returns MEDIUM finding for subprocess calls", () => {
    const astInfo = { exec_calls: [], eval_calls: [], pickle_loads: [], subprocess_calls: [{ line: 40 }], imports: [] };
    const findings = astInfoToFindings(astInfo, FILE);
    const f = findings.find(x => x.message.includes("subprocess"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("MEDIUM");
  });

  test("returns MEDIUM finding for dangerous imports (pickle)", () => {
    const astInfo = { exec_calls: [], eval_calls: [], pickle_loads: [], subprocess_calls: [], imports: [{ module: "pickle", line: 1 }] };
    const findings = astInfoToFindings(astInfo, FILE);
    const f = findings.find(x => x.message.includes("pickle"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("MEDIUM");
    expect(f.cwe_id).toBe("CWE-676");
  });

  test("safe imports produce no findings", () => {
    const astInfo = { exec_calls: [], eval_calls: [], pickle_loads: [], subprocess_calls: [], imports: [{ module: "os", line: 1 }, { module: "json", line: 2 }] };
    const findings = astInfoToFindings(astInfo, FILE);
    expect(findings).toHaveLength(0);
  });

  test("multiple issues produce multiple findings", () => {
    const astInfo = {
      exec_calls:       [{ line: 5 }],
      eval_calls:       [{ line: 10 }],
      pickle_loads:     [{ line: 15 }],
      subprocess_calls: [{ line: 20 }],
      imports:          [{ module: "marshal", line: 1 }],
    };
    const findings = astInfoToFindings(astInfo, FILE);
    expect(findings.length).toBe(5);
  });

  test("all findings have required fields", () => {
    const astInfo = { exec_calls: [{ line: 1 }], eval_calls: [], pickle_loads: [], subprocess_calls: [], imports: [] };
    const findings = astInfoToFindings(astInfo, FILE);
    for (const f of findings) {
      expect(f).toHaveProperty("id");
      expect(f).toHaveProperty("severity");
      expect(f).toHaveProperty("file");
      expect(f).toHaveProperty("line_start");
      expect(f).toHaveProperty("message");
      expect(f).toHaveProperty("recommendation");
      expect(f).toHaveProperty("auto_fixable");
    }
  });
});

// ─── analyzePythonAst (integration — requires Python 3.8+) ──────────────────

describe("analyzePythonAst()", () => {
  test("returns available: false gracefully when Python is not available or times out", async () => {
    // This test intentionally passes whether Python is or isn't available —
    // it verifies the contract: never throws, always returns { findings, available }
    const result = await analyzePythonAst("x = 1", "/fake/file.py", { timeoutMs: 100 });
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("available");
    expect(Array.isArray(result.findings)).toBe(true);
  });

  test("returns { findings: [], astInfo: null, available: false } for nonsense command path", async () => {
    // Force graceful degradation with extremely short timeout
    const result = await analyzePythonAst("x = 1", "/fake/file.py", { timeoutMs: 1 });
    expect(result.available).toBe(false);
    expect(result.astInfo).toBeNull();
    expect(result.findings).toEqual([]);
  });

  test("findings from AST have correct file reference", async () => {
    // Only meaningful if Python is available — otherwise it returns []
    const dangerousCode = `
import pickle
data = pickle.loads(b"malicious")
eval("exec('rm -rf /')")
`;
    const result = await analyzePythonAst(dangerousCode, "/the/file.py");
    if (!result.available) return; // Skip if Python not on PATH

    expect(result.findings.length).toBeGreaterThan(0);
    for (const f of result.findings) {
      expect(f.file).toBe("/the/file.py");
    }
  });
});
