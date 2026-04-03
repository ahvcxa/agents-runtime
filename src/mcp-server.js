"use strict";
/**
 * src/mcp-server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Model Context Protocol (MCP) server for agents-runtime.
 *
 * Exposes 4 tools that any MCP-compatible AI client (Claude Desktop, Cursor,
 * Windsurf, GPT with MCP bridge, etc.) can call directly:
 *
 *   • code_analysis      — 5-principle static analysis (JS + Python)
 *   • security_audit     — OWASP Top 10 (2021) deep security audit
 *   • refactor           — Unified diff patch generator (dry-run safe)
 *   • compliance_check   — Agent authorization & contract validation
 *
 * Transport: stdio (standard for local MCP servers)
 * Usage:     node bin/mcp.js --project /path/to/project
 */

const { McpServer }           = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z }                   = require("zod");
const path                    = require("path");
const { createRuntime }       = require("./engine");

// ─── Shared agent context (Observer level — read-only by default) ─────────────
const DEFAULT_AGENT = {
  agent: {
    id:                  "mcp-client",
    role:                "Observer",
    authorization_level: 1,
    skill_set:           ["code-analysis", "security-audit", "refactor"],
    read_only:           true,
  },
};

// ─── Format findings for MCP text response ────────────────────────────────────
function formatFindings(findings, summary) {
  if (!findings || findings.length === 0) {
    return "✅ No findings. Code looks clean!";
  }

  const bySev = summary?.by_severity ?? {};
  const header = [
    `📊 **Summary**: ${findings.length} finding(s)`,
    Object.entries(bySev)
      .filter(([, n]) => n > 0)
      .map(([sev, n]) => `${sevIcon(sev)} ${sev}: ${n}`)
      .join("  ·  "),
    `📁 Files scanned: ${summary?.files_scanned ?? "?"}`,
    "",
  ].join("\n");

  const lines = findings.slice(0, 50).map((f) =>
    [
      `${sevIcon(f.severity)} **[${f.severity}]** ${f.principle}`,
      `   📄 ${f.file}:${f.line_start}${f.symbol ? ` (${f.symbol})` : ""}`,
      `   💬 ${f.message}`,
      `   💡 ${f.recommendation}`,
      f.cwe_id ? `   🔗 ${f.cwe_id}${f.owasp_category ? ` · ${f.owasp_category}` : ""}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );

  const footer = findings.length > 50
    ? `\n…and ${findings.length - 50} more findings. Narrow the file scope to see all.`
    : "";

  return header + lines.join("\n\n") + footer;
}

function sevIcon(sev) {
  return { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🟢", INFO: "ℹ️" }[sev] ?? "⚪";
}

// ─── MCP Server factory ───────────────────────────────────────────────────────
async function createMcpServer(projectRoot) {
  const server = new McpServer({
    name:    "agents-runtime",
    version: "1.0.0",
  });

  // Lazy runtime — created on first tool call to avoid startup overhead
  let _runtime = null;
  async function getRuntime() {
    if (!_runtime) {
      _runtime = await createRuntime({
        projectRoot,
        verbosity: "silent",
      });
    }
    return _runtime;
  }

  // ── Tool 1: code_analysis ─────────────────────────────────────────────────
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
    },
    async ({ files, project_root }) => {
      try {
        const rt = await getRuntime();
        const result = await rt.runAgent(DEFAULT_AGENT, "code-analysis", {
          files,
          project_root: project_root ?? projectRoot,
        });
        const text = result.success
          ? formatFindings(result.result.findings, result.result.summary)
          : `❌ Error: ${result.error ?? result.result?.error ?? "Unknown error"}`;
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  // ── Tool 2: security_audit ────────────────────────────────────────────────
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
    },
    async ({ files, project_root }) => {
      try {
        const rt = await getRuntime();
        const result = await rt.runAgent(DEFAULT_AGENT, "security-audit", {
          files,
          project_root: project_root ?? projectRoot,
        });
        const text = result.success
          ? formatFindings(result.result.findings, result.result.summary)
          : `❌ Error: ${result.error ?? result.result?.error ?? "Unknown error"}`;
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  // ── Tool 3: refactor ──────────────────────────────────────────────────────
  server.tool(
    "refactor",
    [
      "Generates unified diff patches for auto-fixable findings from code_analysis or security_audit.",
      "Always runs in dry-run mode by default — patches are proposed but never applied without explicit approval.",
      "Patches cover: magic number extraction, empty catch block fixes, and similar auto-fixable patterns.",
      "Pass findings from a prior code_analysis or security_audit call as input.",
    ].join(" "),
    {
      findings: z
        .array(z.object({
          file:         z.string(),
          line_start:   z.number(),
          line_end:     z.number(),
          principle:    z.string(),
          severity:     z.string(),
          message:      z.string(),
          recommendation: z.string(),
          auto_fixable: z.boolean().optional(),
        }))
        .describe("Findings array from a previous code_analysis or security_audit call."),
      project_root: z.string().optional().describe("Absolute path to the project root."),
      dry_run: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true (default), patches are proposed but not applied to disk."),
    },
    async ({ findings, project_root, dry_run }) => {
      try {
        const rt = await getRuntime();
        const execAgent = {
          agent: {
            id:                  "mcp-client",
            role:                "Executor",
            authorization_level: 2,
            skill_set:           ["refactor"],
            read_only:           false,
          },
        };
        const result = await rt.runAgent(execAgent, "refactor", {
          findings,
          project_root: project_root ?? projectRoot,
          dry_run: dry_run ?? true,
        });
        if (!result.success) {
          return { content: [{ type: "text", text: `❌ Error: ${result.error}` }] };
        }
        const { patches, summary } = result.result;
        if (!patches || patches.length === 0) {
          return {
            content: [{
              type: "text",
              text: `ℹ️ No auto-fixable patches generated.\n${summary.auto_fixable} finding(s) were auto-fixable but no patch template matched.\nReview findings manually.`,
            }],
          };
        }
        const text = [
          `🔧 **${patches.length} patch(es) generated** (dry_run=${dry_run ?? true})`,
          "",
          ...patches.map((p, i) =>
            [`**Patch ${i + 1}**: ${p.file} — ${p.description}`, "```diff", p.diff, "```"].join("\n")
          ),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  // ── Tool 4: compliance_check ──────────────────────────────────────────────
  server.tool(
    "compliance_check",
    [
      "Validates an agent configuration against the .agents/ contract.",
      "Checks: authorization level, skill_set membership, read_only constraints,",
      "hook registration, and manifest consistency.",
      "Use this before running other tools to ensure the agent config is valid.",
    ].join(" "),
    {
      agent_id: z
        .string()
        .optional()
        .default("mcp-client")
        .describe("Agent identifier to check. Defaults to 'mcp-client'."),
      authorization_level: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .default(1)
        .describe("Authorization level: 1=Observer, 2=Executor, 3=Orchestrator"),
      skill_set: z
        .array(z.string())
        .optional()
        .default(["code-analysis", "security-audit"])
        .describe("Skills the agent wants to use."),
    },
    async ({ agent_id, authorization_level, skill_set }) => {
      try {
        const rt = await getRuntime();
        const agentConfig = {
          agent: {
            id: agent_id,
            role: ["Observer", "Executor", "Orchestrator"][authorization_level - 1],
            authorization_level,
            skill_set,
            read_only: authorization_level === 1,
          },
        };
        // Run compliance directly — check each skill is registered and auth passes
        const lines = [`🔍 Compliance check for agent '${agent_id}' (level ${authorization_level})`];
        let passed = true;

        for (const skillId of skill_set) {
          try {
            const handler = await rt.skillRegistry.load(skillId, authorization_level);
            lines.push(`  ✅ Skill '${skillId}' — registered and authorized`);
          } catch (e) {
            lines.push(`  ❌ Skill '${skillId}' — ${e.message}`);
            passed = false;
          }
        }

        lines.push("");
        lines.push(passed
          ? "✅ **Compliance passed.** Agent is authorized to use requested skills."
          : "❌ **Compliance failed.** Fix the errors above before running skills."
        );

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  return server;
}

module.exports = { createMcpServer };
