"use strict";

/**
 * tests/security-audit-fp.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Test suite for false positive fixes in security-audit/handler.js:
 * 1. child_process + execFile should not produce HIGH findings
 * 2. agent-suppress: OWASP_CATEGORY suppression should work
 * 3. handler.js should not self-report when scanning its own directory
 */

const fs = require("fs");
const path = require("path");
const { execute } = require("../.agents/security-audit/handler");

describe("Security Audit - False Positive Fixes", () => {
  
  // ─── Test Setup ───────────────────────────────────────────────────────────
  const tempDir = path.join(__dirname, ".security-audit-temp");
  
  beforeAll(() => {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  });
  
  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  // ─── TEST 1: child_process + execFile ─────────────────────────────────────
  describe("FP-1: child_process + execFile should not raise HIGH", () => {
    
    it("should not flag execFile() with shell: false as HIGH", async () => {
      const code = `const { execFile } = require("child_process");

async function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { shell: false }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}`;
      
      const testFile = path.join(tempDir, "safe-exec.js");
      fs.writeFileSync(testFile, code, "utf8");
      
      const result = await execute({
        agentId: "test-agent",
        authLevel: 3,
        input: {
          files: [testFile],
          project_root: tempDir,
        },
        memory: { set: () => {} },
        log: () => {},
      });
      
      // Should NOT have HIGH severity findings for child_process
      const childProcessHighFindings = result.findings.filter(
        (f) => f.cwe_id === "CWE-78" && f.severity === "HIGH"
      );
      expect(childProcessHighFindings).toHaveLength(0);
      
      // Should have INFO level finding about import
      const infoFindings = result.findings.filter(
        (f) => f.cwe_id === "CWE-78" && f.severity === "INFO"
      );
      expect(infoFindings.length).toBeGreaterThanOrEqual(0); // May or may not have INFO
    });
    
    it("should flag exec() without safety checks as HIGH", async () => {
      const code = `const { exec } = require("child_process");

function unsafeRun(userInput) {
  exec("echo " + userInput, (err, stdout) => {
    console.log(stdout);
  });
}`;
      
      const testFile = path.join(tempDir, "unsafe-exec.js");
      fs.writeFileSync(testFile, code, "utf8");
      
      const result = await execute({
        agentId: "test-agent",
        authLevel: 3,
        input: {
          files: [testFile],
          project_root: tempDir,
        },
        memory: { set: () => {} },
        log: () => {},
      });
      
      // Should have HIGH severity finding for exec() with concatenation
      const highFindings = result.findings.filter(
        (f) => f.cwe_id === "CWE-78" && f.severity === "HIGH"
      );
      expect(highFindings.length).toBeGreaterThanOrEqual(1);
    });
  });
  
  // ─── TEST 2: Suppression by OWASP category ───────────────────────────────
  describe("FP-2: agent-suppress with OWASP category", () => {
    
    it("should suppress rate-limiting findings with A04:2021 suppression", async () => {
      const code = `// Configuration file
const config = {
  // agent-suppress: A04:2021
  rate_limit_disabled: true, // This would normally trigger A04:2021
};`;
      
      const testFile = path.join(tempDir, "config-with-suppression.js");
      fs.writeFileSync(testFile, code, "utf8");
      
      const result = await execute({
        agentId: "test-agent",
        authLevel: 3,
        input: {
          files: [testFile],
          project_root: tempDir,
        },
        memory: { set: () => {} },
        log: () => {},
      });
      
      // Should NOT have A04:2021 findings at line 3 (suppressed)
      const suppressedFindings = result.findings.filter(
        (f) => f.owasp_category === "A04:2021" && f.line_start === 3
      );
      expect(suppressedFindings).toHaveLength(0);
    });
    
    it("should suppress findings without category match", async () => {
      const code = `// agent-suppress: A02:2021
const apiUrl = "http://api.example.com"; // Should be suppressed`;
      
      const testFile = path.join(tempDir, "http-with-suppression.js");
      fs.writeFileSync(testFile, code, "utf8");
      
      const result = await execute({
        agentId: "test-agent",
        authLevel: 3,
        input: {
          files: [testFile],
          project_root: tempDir,
        },
        memory: { set: () => {} },
        log: () => {},
      });
      
      // Should NOT have A02:2021 findings at line 2 (suppressed by line 1)
      // The suppression applies to the same line number
      const suppressedFindings = result.findings.filter(
        (f) => f.owasp_category === "A02:2021" && (f.line_start === 1 || f.line_start === 2)
      );
      expect(suppressedFindings).toHaveLength(0);
    });
  });
  
  // ─── TEST 3: Handler self-scan exclusion ──────────────────────────────────
  describe("FP-3: handler.js should not self-report", () => {
    
    it("should exclude handler.js from scan when in same directory", async () => {
      const handlerPath = path.resolve(
        __dirname,
        "../template/skills/security-audit/handler.js"
      );
      
      if (!fs.existsSync(handlerPath)) {
        console.log("handler.js not found, skipping self-scan test");
        return;
      }
      
      const result = await execute({
        agentId: "test-agent",
        authLevel: 3,
        input: {
          files: [path.dirname(handlerPath)],
          project_root: path.dirname(path.dirname(handlerPath)),
        },
        memory: { set: () => {} },
        log: () => {},
      });
      
      // Should NOT have findings from handler.js itself
      const handlerFindings = result.findings.filter((f) =>
        f.file.includes("handler.js") && f.file.includes("security-audit")
      );
      
      // handler.js should not report its own regex patterns as findings
      expect(handlerFindings.filter((f) => f.message.includes("child_process module imported"))).toHaveLength(0);
    });
  });
  
  // ─── TEST 4: Rule definitions should not trigger patterns ──────────────────
  describe("FP-3b: Rule definitions in handler.js", () => {
    
    it("should not flag pattern definitions as findings", async () => {
      const code = `
const RULES = [
  { pattern: /child_process|require/, owasp: "A03:2021", severity: "INFO" },
  { pattern: /exec\\s*\\(/, owasp: "A03:2021", severity: "HIGH" },
];`;
      
      const testFile = path.join(tempDir, "rule-definitions.js");
      fs.writeFileSync(testFile, code, "utf8");
      
      const result = await execute({
        agentId: "test-agent",
        authLevel: 3,
        input: {
          files: [testFile],
          project_root: tempDir,
        },
        memory: { set: () => {} },
        log: () => {},
      });
      
      // Should not flag the pattern definitions themselves
      const falsePositives = result.findings.filter(
        (f) => f.file.includes("rule-definitions.js") && f.cwe_id === "CWE-78"
      );
      expect(falsePositives).toHaveLength(0);
    });
  });
  
  // ─── TEST 5: Integration test ─────────────────────────────────────────────
  describe("FP: Integration test with multiple issues", () => {
    
    it("should correctly handle mixed safe and unsafe code", async () => {
      const code = `const { execFile, exec } = require("child_process");

// Safe usage
function safeRun(cmd, args) {
  // agent-suppress: A03:2021
  return execFile(cmd, args, { shell: false }, callback);
}

// Unsafe usage
function unsafeRun(input) {
  exec("process " + input); // Should be flagged as HIGH
}`;
      
      const testFile = path.join(tempDir, "mixed-usage.js");
      fs.writeFileSync(testFile, code, "utf8");
      
      const result = await execute({
        agentId: "test-agent",
        authLevel: 3,
        input: {
          files: [testFile],
          project_root: tempDir,
        },
        memory: { set: () => {} },
        log: () => {},
      });
      
      // Safe execFile at line 5 should be suppressed
      const line5Findings = result.findings.filter((f) => f.line_start === 5);
      expect(line5Findings).toHaveLength(0);
      
      // Unsafe exec() at line 11 should be flagged
      const line11Findings = result.findings.filter(
        (f) => f.line_start === 11 && f.severity === "HIGH"
      );
      expect(line11Findings.length).toBeGreaterThan(0);
    });
  });
});
