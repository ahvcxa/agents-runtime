"use strict";
/**
 * src/mcp/tools-register.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tool registration helpers for MCP server
 */

const { z } = require("zod");
const { formatFindings, formatSkillResult, toToolResponse } = require("./tool-helpers");

const DEFAULT_AGENT = {
  agent: {
    id: "mcp-client",
    role: "Observer",
    authorization_level: 1,
    skill_set: ["code-analysis", "security-audit", "refactor"],
    read_only: true,
  },
};

/**
 * Register code_analysis tool
 */
function registerCodeAnalysisTool(server, getRuntime, projectRoot) {
  server.tool(
    "code_analysis",
    [
      "Performs static code analysis on JavaScript/TypeScript and Python source files.",
      "Checks for: Cyclomatic Complexity, DRY violations (magic numbers, structural clones),",
      "Security-First patterns, SOLID principle adherence, and Cognitive Complexity.",
      "Returns findings with severity (CRITICAL/HIGH/MEDIUM/LOW), file location, and fix recommendations.",
    ].join(" "),
    {
      files: z
        .array(z.string())
        .describe('List of file paths or directories to analyze. Example: ["src/", "tests/"]'),
      project_root: z
        .string()
        .optional()
        .describe("Absolute path to the project root. Defaults to the server project root."),
      stream: z.boolean().optional().default(false),
    },
    async ({ files, project_root, stream }) => {
      try {
        const rt = await getRuntime();
        const result = await rt.runAgent(DEFAULT_AGENT, "code-analysis", {
          files,
          project_root: project_root ?? projectRoot,
        });
        return formatSkillResult(
          result,
          (r) => formatFindings(r.findings, r.summary),
          stream
        );
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );
}

/**
 * Register security_audit tool
 */
function registerSecurityAuditTool(server, getRuntime, projectRoot) {
  server.tool(
    "security_audit",
    [
      "Runs a deep OWASP Top 10 (2021) security audit on JavaScript, TypeScript, Python,",
      "JSON, YAML, and .env files. Covers: A01 Broken Access Control, A02 Cryptographic Failures,",
      "A03 Injection, A04 Insecure Design, A05 Misconfiguration, A06 Vulnerable Components,",
      "A07 Auth Failures, A08 Integrity Failures, A09 Logging Failures, A10 SSRF.",
      "Returns CWE IDs, OWASP categories, and precise fix recommendations.",
    ].join(" "),
    {
      files: z
        .array(z.string())
        .describe(
          'Files or directories to audit. Include config files for best results: ["src/", ".env.example", "package.json"]'
        ),
      project_root: z
        .string()
        .optional()
        .describe("Absolute path to the project root."),
      stream: z.boolean().optional().default(false),
    },
    async ({ files, project_root, stream }) => {
      try {
        const rt = await getRuntime();
        const result = await rt.runAgent(DEFAULT_AGENT, "security-audit", {
          files,
          project_root: project_root ?? projectRoot,
        });
        return formatSkillResult(
          result,
          (r) => formatFindings(r.findings, r.summary),
          stream
        );
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );
}

module.exports = {
  registerCodeAnalysisTool,
  registerSecurityAuditTool,
};
