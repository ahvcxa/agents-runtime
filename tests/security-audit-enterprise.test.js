"use strict";

/**
 * tests/security-audit-enterprise.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Comprehensive test suite for enterprise-grade security audit handler v2.0.0
 * Tests pattern detection, suppression, and false positive handling.
 */

const rules = require("../.agents/security-audit/lib/rules");
const analyzer = require("../.agents/security-audit/lib/analyzer");
const { SuppressionEngine } = require("../.agents/security-audit/lib/suppression");
const { ReportGenerator } = require("../.agents/security-audit/lib/report");

describe("Security Audit - Enterprise Grade (v2.0.0)", () => {
  
  // ─── Rules Module Tests ──────────────────────────────────────────────────────
  describe("Rules Module", () => {
    test("should have all OWASP categories defined", () => {
      const rulesList = rules.getAllRules();
      const owaspCodes = new Set(rulesList.map(r => r.owasp));
      
      expect(owaspCodes.has("A01:2021")).toBe(true);
      expect(owaspCodes.has("A02:2021")).toBe(true);
      expect(owaspCodes.has("A03:2021")).toBe(true);
      expect(owaspCodes.has("A04:2021")).toBe(true);
      expect(owaspCodes.has("A05:2021")).toBe(true);
      expect(owaspCodes.has("A06:2021")).toBe(true);
      expect(owaspCodes.has("A07:2021")).toBe(true);
      expect(owaspCodes.has("A08:2021")).toBe(true);
      expect(owaspCodes.has("A09:2021")).toBe(true);
      expect(owaspCodes.has("A10:2021")).toBe(true);
    });

    test("should retrieve rule by ID", () => {
      const rule = rules.getRuleById("A03_EXEC_DYNAMIC");
      expect(rule).toBeDefined();
      expect(rule.owasp).toBe("A03:2021");
      expect(rule.cwe).toBe("CWE-78");
    });

    test("should retrieve rules by OWASP category", () => {
      const a01Rules = rules.getRulesByOwasp("A01:2021");
      expect(a01Rules.length).toBeGreaterThan(0);
      expect(a01Rules.every(r => r.owasp === "A01:2021")).toBe(true);
    });

    test("should check exclusion rules correctly", () => {
      const rule = rules.getRuleById("A03_EXEC_DYNAMIC");
      
      // This line should be excluded (database .exec() call)
      const dbExecLine = "const result = db.exec('SELECT * FROM users');";
      expect(rules.passesExclusionChecks(dbExecLine, rule)).toBe(false);
    });

    test("should have metadata for all rules", () => {
      const rulesList = rules.getAllRules();
      for (const rule of rulesList) {
        expect(rule.id).toBeDefined();
        expect(rule.pattern === null || rule.pattern instanceof RegExp).toBe(true);
        expect(rule.owasp).toBeDefined();
        expect(rule.cwe).toBeDefined();
        expect(rule.severity).toMatch(/CRITICAL|HIGH|MEDIUM|LOW|INFO/);
        expect(rule.message).toBeDefined();
        expect(rule.recommendation).toBeDefined();
        expect(Array.isArray(rule.context_checks)).toBe(true);
        expect(Array.isArray(rule.false_positive_exclusions)).toBe(true);
        expect(typeof rule.auto_fixable).toBe("boolean");
      }
    });
  });

  // ─── Analyzer Module Tests ───────────────────────────────────────────────────
  describe("Analyzer Module", () => {
    test("should skip comment lines", () => {
      expect(analyzer.shouldSkipLine("// This is a comment", ".js")).toBe(true);
      expect(analyzer.shouldSkipLine(" * block comment", ".js")).toBe(true);
      expect(analyzer.shouldSkipLine("# Python comment", ".py")).toBe(true);
    });

    test("should skip empty lines", () => {
      expect(analyzer.shouldSkipLine("", ".js")).toBe(true);
      expect(analyzer.shouldSkipLine("   ", ".js")).toBe(true);
    });

    test("should skip rule definitions in handler", () => {
      const lines = [
        "{ pattern: /some-regex/,",
        "  owasp: 'A01:2021',",
        "  severity: 'HIGH',",
      ];
      for (const line of lines) {
        expect(analyzer.shouldSkipLine(line, ".js")).toBe(true);
      }
    });

    test("should skip database .exec() calls", () => {
      expect(analyzer.shouldSkipLine("db.exec('SELECT *')", ".js")).toBe(true);
      expect(analyzer.shouldSkipLine("this.db.exec(query)", ".js")).toBe(true);
      expect(analyzer.shouldSkipLine("database.exec(sql)", ".js")).toBe(true);
    });

    test("should detect A03 - exec with dynamic arguments", () => {
      const code = `
const { exec } = require('child_process');
exec('rm -rf ' + userInput);  // VIOLATION
      `.trim();

      const findings = analyzer.analyzeFileLines(code, "test.js");
      const execFindings = findings.filter(f => f.rule_id === "A03_EXEC_DYNAMIC");
      expect(execFindings.length).toBeGreaterThan(0);
      expect(execFindings[0].severity).toBe("HIGH");
    });

    test("should NOT flag db.exec() as command injection", () => {
      const code = `
const db = new DatabaseSync(':memory:');
const result = db.exec('SELECT * FROM users WHERE id = ?');  // SAFE - db method
      `.trim();

      const findings = analyzer.analyzeFileLines(code, "test.js");
      const execFindings = findings.filter(f => f.rule_id === "A03_EXEC_DYNAMIC");
      expect(execFindings.length).toBe(0);  // Should NOT detect db.exec()
    });

    test("should detect A04 - CORS wildcard", () => {
      const code = `
const cors = require('cors');
app.use(cors({ origin: '*' }));  // VIOLATION
      `.trim();

      const findings = analyzer.analyzeFileLines(code, "app.js");
      const corsFindings = findings.filter(f => f.rule_id === "A04_CORS_WILDCARD");
      expect(corsFindings.length).toBeGreaterThan(0);
    });

    test("should detect A07 - plaintext password comparison", () => {
      const code = `
if (password === userInput) {  // VIOLATION
  auth = true;
}
      `.trim();

      const findings = analyzer.analyzeFileLines(code, "auth.js");
      const pwdFindings = findings.filter(f => f.rule_id === "A07_PLAINTEXT_PASSWORD");
      expect(pwdFindings.length).toBeGreaterThan(0);
    });

    test("should detect A10 - SSRF risk", () => {
      const code = `
const fetch = require('node-fetch');
fetch(req.query.url);  // VIOLATION - user-controlled URL
      `.trim();

      const findings = analyzer.analyzeFileLines(code, "api.js");
      const ssrfFindings = findings.filter(f => f.rule_id === "A10_SSRF_RISK");
      expect(ssrfFindings.length).toBeGreaterThan(0);
    });
  });

  // ─── Suppression Engine Tests ────────────────────────────────────────────────
  describe("Suppression Engine", () => {
    test("should parse OWASP-format suppressions", () => {
      const code = `
const cors = require('cors');
// agent-suppress: A04:2021
app.use(cors({ origin: '*' }));
      `.trim();

      const engine = new SuppressionEngine();
      engine.parseSuppressions(code);

      expect(engine.suppressions.size).toBeGreaterThan(0);
    });

    test("should parse suppressions with reason", () => {
      const code = `
// agent-suppress: A04:2021 reason="CORS wildcard intentional for public API"
app.use(cors({ origin: '*' }));
      `.trim();

      const engine = new SuppressionEngine();
      engine.parseSuppressions(code);

      const entries = Array.from(engine.suppressions.values());
      expect(entries.some(e => e.reason.includes("CORS"))).toBe(true);
    });

    test("should check if finding is suppressed", () => {
      const code = `
// agent-suppress: A04:2021
app.use(cors({ origin: '*' }));
      `.trim();

      const engine = new SuppressionEngine();
      engine.parseSuppressions(code);

      const finding = {
        owasp: "A04:2021",
        line_start: 2,
        suppression_key: "test-key",
      };

      const result = engine.isSuppressed(finding);
      expect(result.suppressed).toBe(true);
      expect(result.method).toBe("owasp_category");
    });

    test("should generate suppression audit trail", () => {
      const code = `
// agent-suppress: A01:2021 reason="Health endpoint"
app.get('/health', () => { ... });
// agent-suppress: A04:2021 reason="Public API"
app.use(cors({ origin: '*' }));
      `.trim();

      const engine = new SuppressionEngine();
      engine.parseSuppressions(code);

      const trail = engine.getSuppressionAuditTrail();
      expect(trail.length).toBeGreaterThan(0);
      expect(trail[0].type).toBe("owasp_category");
    });

    test("should get suppression statistics", () => {
      const code = `
// agent-suppress: A01:2021
route1();
// agent-suppress: A04:2021
route2();
      `.trim();

      const engine = new SuppressionEngine();
      engine.parseSuppressions(code);

      const stats = engine.getSuppressionStats();
      expect(stats.total).toBeGreaterThan(0);
    });
  });

  // ─── Report Generator Tests ──────────────────────────────────────────────────
  describe("Report Generator", () => {
    test("should add findings to report", () => {
      const report = new ReportGenerator();

      report.addFinding({
        file: "app.js",
        line_start: 10,
        line_end: 10,
        owasp: "A03:2021",
        cwe: "CWE-78",
        severity: "HIGH",
        message: "Command injection risk",
        recommendation: "Use execFile() instead",
        auto_fixable: false,
      });

      expect(report.findings.length).toBe(1);
      expect(report.summary.findings_total).toBe(1);
      expect(report.summary.by_severity.HIGH).toBe(1);
    });

    test("should track auto-fixable findings", () => {
      const report = new ReportGenerator();

      report.addFinding({
        file: "crypto.js",
        line_start: 5,
        owasp: "A02:2021",
        cwe: "CWE-327",
        severity: "CRITICAL",
        message: "Weak cipher",
        recommendation: "Use AES-256-GCM",
        auto_fixable: true,
      });

      expect(report.summary.auto_fixable_count).toBe(1);
    });

    test("should suppress findings", () => {
      const report = new ReportGenerator();

      const finding = report.addFinding({
        file: "app.js",
        line_start: 10,
        owasp: "A03:2021",
        cwe: "CWE-78",
        severity: "HIGH",
        message: "Test",
        recommendation: "Test",
        auto_fixable: false,
      });

      report.markSuppressed(finding, "Intentional");

      const suppressed = report.getSuppressedFindings();
      expect(suppressed.length).toBe(1);
      expect(suppressed[0].suppression_reason).toBe("Intentional");
    });

    test("should get findings by severity", () => {
      const report = new ReportGenerator();

      report.addFinding({
        file: "a.js",
        line_start: 1,
        owasp: "A01:2021",
        cwe: "CWE-285",
        severity: "CRITICAL",
        message: "Critical issue",
        recommendation: "Fix immediately",
        auto_fixable: false,
      });

      report.addFinding({
        file: "b.js",
        line_start: 1,
        owasp: "A02:2021",
        cwe: "CWE-319",
        severity: "LOW",
        message: "Low issue",
        recommendation: "Consider fixing",
        auto_fixable: false,
      });

      const critical = report.getBySereve("CRITICAL");
      const low = report.getBySereve("LOW");

      expect(critical.length).toBe(1);
      expect(low.length).toBe(1);
    });

    test("should generate summary report", () => {
      const report = new ReportGenerator();

      report.addFinding({
        file: "app.js",
        line_start: 1,
        owasp: "A01:2021",
        cwe: "CWE-285",
        severity: "HIGH",
        message: "No auth",
        recommendation: "Add middleware",
        auto_fixable: false,
      });

      const summary = report.getSummaryReport();

      expect(summary.total_findings).toBe(1);
      expect(summary.active_findings).toBe(1);
      expect(summary.by_severity.HIGH).toBe(1);
      expect(summary.has_high).toBe(true);
    });

    test("should sort findings by severity", () => {
      const report = new ReportGenerator();

      report.addFinding({
        file: "a.js",
        line_start: 1,
        owasp: "A01:2021",
        cwe: "CWE-1",
        severity: "LOW",
        message: "Low",
        recommendation: "Low",
        auto_fixable: false,
      });

      report.addFinding({
        file: "b.js",
        line_start: 1,
        owasp: "A02:2021",
        cwe: "CWE-2",
        severity: "CRITICAL",
        message: "Critical",
        recommendation: "Critical",
        auto_fixable: false,
      });

      const sorted = report.sortBySerit();
      expect(sorted[0].severity).toBe("CRITICAL");
      expect(sorted[1].severity).toBe("LOW");
    });

    test("should export as JSON", () => {
      const report = new ReportGenerator();

      report.addFinding({
        file: "app.js",
        line_start: 1,
        owasp: "A03:2021",
        cwe: "CWE-78",
        severity: "HIGH",
        message: "Command injection",
        recommendation: "Use execFile()",
        auto_fixable: false,
      });

      const json = report.toJSON();

      expect(json.metadata.tool).toBe("security-audit");
      expect(json.metadata.version).toBe("2.0.0");
      expect(json.findings.length).toBe(1);
    });
  });

  // ─── Integration Tests ───────────────────────────────────────────────────────
  describe("Integration Tests", () => {
    test("should detect and suppress findings correctly", () => {
      const code = `
const cors = require('cors');
// agent-suppress: A04:2021 reason="Public API requires CORS wildcard"
app.use(cors({ origin: '*' }));
      `.trim();

      // Analyze
      const findings = analyzer.analyzeFileLines(code, "app.js");
      expect(findings.length).toBeGreaterThan(0);

      // Suppress
      const engine = new SuppressionEngine();
      engine.parseSuppressions(code);

      // Check suppression
      const corsFindings = findings.filter(f => f.rule_id === "A04_CORS_WILDCARD");
      if (corsFindings.length > 0) {
        const suppressed = engine.isSuppressed({
          owasp: corsFindings[0].owasp,
          line_start: corsFindings[0].line_start,
        });
        expect(suppressed.suppressed).toBe(true);
      }
    });

    test("should handle complex codebase analysis", () => {
      const code = `
const { exec, execFile } = require('child_process');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Safe usage
execFile('ls', ['-la'], (err, stdout) => {
  console.log(stdout);
});

// Unsafe usage
exec('rm -rf ' + userInput);  // VIOLATION

// CORS config
app.use(cors({ origin: ['https://example.com'] }));  // SAFE

// JWT with no expiry
jwt.sign({ id: 1 }, secret, { expiresIn: 'never' });  // VIOLATION
      `.trim();

      const findings = analyzer.analyzeFileLines(code, "index.js");
      
      // Should detect unsafe exec but not safe execFile
      expect(findings.some(f => f.rule_id === "A03_EXEC_DYNAMIC")).toBe(true);
      
      // Should detect JWT issue
      expect(findings.some(f => f.rule_id === "A07_JWT_NO_EXPIRY")).toBe(true);
    });
  });

  // ─── False Positive Elimination Tests ────────────────────────────────────────
  describe("False Positive Elimination", () => {
    test("should not flag SQLite db.exec() as command injection", () => {
      const code = "const result = db.exec('SELECT * FROM users');";
      const findings = analyzer.analyzeFileLines(code, "test.js");
      const execFindings = findings.filter(f => f.rule_id === "A03_EXEC_DYNAMIC");
      expect(execFindings.length).toBe(0);
    });

    test("should not flag DatabaseSync in complex query", () => {
      const code = `
const database = new DatabaseSync(':memory:');
const stmt = database.prepare('SELECT * FROM users WHERE id = ?');
const results = stmt.all(userId);
const execResult = database.exec('PRAGMA table_info(users)');
      `.trim();

      const findings = analyzer.analyzeFileLines(code, "db.js");
      const execFindings = findings.filter(f => f.rule_id === "A03_EXEC_DYNAMIC");
      expect(execFindings.length).toBe(0);
    });

    test("should flag legitimate child_process.exec with dynamic args", () => {
      const code = "const { exec } = require('child_process'); exec(command + ' && ls');";
      const findings = analyzer.analyzeFileLines(code, "shell.js");
      const execFindings = findings.filter(f => f.rule_id === "A03_EXEC_DYNAMIC");
      expect(execFindings.length).toBeGreaterThan(0);
    });

    test("should not flag commented-out code", () => {
      const code = "// exec('dangerous command');";
      const findings = analyzer.analyzeFileLines(code, "test.js");
      expect(findings.length).toBe(0);
    });
  });
});
