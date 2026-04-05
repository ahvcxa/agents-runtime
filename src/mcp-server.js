"use strict";
/**
 * src/mcp-server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Model Context Protocol (MCP) server for agents-runtime.
 *
 * Exposes multiple tools that any MCP-compatible AI client (Claude Desktop,
 * Cursor, Windsurf, GPT with MCP bridge, etc.) can call directly:
 *
 *   • code_analysis      — 5-principle static analysis (JS + Python)
 *   • security_audit     — OWASP Top 10 (2021) deep security audit
 *   • list_project_files — Secure local filesystem listing
 *   • read_project_file  — Secure file reader with pagination
 *   • ... plus refactor/compliance/task/event tools
 *
 * Transport: stdio (standard for local MCP servers)
 * Usage:     node bin/mcp.js --project /path/to/project
 */

const { McpServer }           = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z }                   = require("zod");
const path                    = require("path");
const { createRuntime }       = require("./engine");
const { registerCodeAnalysisTool, registerSecurityAuditTool } = require("./mcp/tools-register");
const { registerFilesystemTools } = require("./mcp/filesystem-tools");
const { formatFindings, formatSkillResult, toToolResponse } = require("./mcp/tool-helpers");
const { ComplianceValidator } = require("./mcp/validators/compliance-validator");

// ─── Constants ─────────────────────────────────────────────────────────────────
/**
 * Agent ID format validation pattern.
 * Valid patterns: "orchestrator-01", "analyzer_01", "task-runner", etc.
 */
const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9\-_]*$/;

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

  // Register code_analysis and security_audit tools
  registerCodeAnalysisTool(server, getRuntime, projectRoot);
  registerSecurityAuditTool(server, getRuntime, projectRoot);
  registerFilesystemTools(server, getRuntime, projectRoot);

  // ── v2.0 MCP Client Bridge Tools ─────────────────────────────────────────
  server.tool(
    "external_mcp_tools",
    "Lists tools discovered from configured external MCP servers (runtime.mcp_client).",
    {
      stream: z.boolean().optional().default(false),
    },
    async ({ stream }) => {
      try {
        const rt = await getRuntime();
        const tools = rt.listExternalMcpTools();
        if (!tools.length) {
          return toToolResponse("ℹ️ No external MCP tools discovered. Enable runtime.mcp_client and configure servers in .agents/settings.json.", stream);
        }
        const lines = [
          `🔌 External MCP tools: ${tools.length}`,
          "",
          ...tools.map((t) => `- ${t.name} (server=${t.server_id})`),
        ];
        return toToolResponse(lines.join("\n"), stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "external_mcp_call",
    "Calls a tool exposed by an external MCP server configured under runtime.mcp_client.",
    {
      tool_name: z.string().describe("Discovered external MCP tool name."),
      input: z.object({}).passthrough().optional().default({}),
      server_id: z.string().optional().describe("Optional explicit server id override."),
      stream: z.boolean().optional().default(false),
    },
    async ({ tool_name, input, server_id, stream }) => {
      try {
        const rt = await getRuntime();
        const result = await rt.callExternalMcpTool(tool_name, input, { server_id });
        if (!result.ok) {
          return toToolResponse(`❌ ${result.error?.code ?? "MCP_ERROR"}: ${result.error?.message ?? "Unknown error"}`, stream);
        }
        const text = [
          `✅ External MCP tool call succeeded`,
          `🧰 tool=${tool_name}`,
          `⏱️ latency_ms=${result.latency_ms ?? "?"}`,
          "",
          result.content || JSON.stringify(result.structured_content ?? result.raw ?? {}, null, 2),
        ].join("\n");
        return toToolResponse(text, stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "cognitive_remember",
    "Stores an insight into short-term session memory or long-term memory.",
    {
      key: z.string().describe("Memory key identifier."),
      content: z.string().describe("Memory content text."),
      namespace: z.enum(["session", "long_term"]).optional().default("long_term"),
      session_id: z.string().optional().default("default"),
      stream: z.boolean().optional().default(false),
    },
    async ({ key, content, namespace, session_id, stream }) => {
      try {
        const rt = await getRuntime();
        if (namespace === "session") {
          const storedKey = await rt.rememberSession(session_id, "assistant", content, { key });
          return toToolResponse(`✅ Session memory stored\n🧠 key=${storedKey}\n📚 namespace=session\n🆔 session=${session_id}`, stream);
        }

        const storedKey = await rt.rememberLongTerm(key, { content }, { text: content });
        return toToolResponse(`✅ Long-term memory stored\n🧠 key=${storedKey}\n📚 namespace=long_term`, stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "cognitive_recall",
    "Retrieves relevant long-term memories using semantic search.",
    {
      query: z.string().describe("Semantic query text."),
      top_k: z.number().int().min(1).max(20).optional().default(5),
      stream: z.boolean().optional().default(false),
    },
    async ({ query, top_k, stream }) => {
      try {
        const rt = await getRuntime();
        const rows = await rt.semanticRecall(query, top_k);
        if (!rows.length) {
          return toToolResponse("ℹ️ No relevant long-term memories found.", stream);
        }

        return toToolResponse(
          [
            `🧠 Recalled ${rows.length} memory item(s)`,
            "",
            ...rows.map((row, idx) => `${idx + 1}. key=${row.key} score=${row.score?.toFixed?.(4) ?? row.score}\n   ${JSON.stringify(row.value)}`),
          ].join("\n"),
          stream
        );
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "trace_report",
    "Returns per-trace step timeline, latency totals, and token usage totals.",
    {
      trace_id: z.string().describe("Trace identifier returned by skill runs."),
      stream: z.boolean().optional().default(false),
    },
    async ({ trace_id, stream }) => {
      try {
        const rt = await getRuntime();
        const report = rt.traceReport(trace_id);
        return toToolResponse(JSON.stringify(report, null, 2), stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "mcp_health",
    "Health checks configured external MCP clients.",
    {
      stream: z.boolean().optional().default(false),
    },
    async ({ stream }) => {
      try {
        const rt = await getRuntime();
        const health = await rt.mcpHealth();
        return toToolResponse(JSON.stringify(health, null, 2), stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
      }
    }
  );

  server.tool(
    "sandbox_health",
    "Health check for active sandbox provider strategy.",
    {
      stream: z.boolean().optional().default(false),
    },
    async ({ stream }) => {
      try {
        const rt = await getRuntime();
        const health = await rt.sandboxHealth();
        return toToolResponse(JSON.stringify(health, null, 2), stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
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
      stream: z.boolean().optional().default(false),
    },
    async ({ findings, project_root, dry_run, stream }) => {
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
          return toToolResponse(`❌ Error: ${result.error}`, stream);
        }
        const { patches, summary } = result.result;
        if (!patches || patches.length === 0) {
          return toToolResponse(
            `ℹ️ No auto-fixable patches generated.\n${summary.auto_fixable} finding(s) were auto-fixable but no patch template matched.\nReview findings manually.`,
            stream
          );
        }
        const text = [
          `🔧 **${patches.length} patch(es) generated** (dry_run=${dry_run ?? true})`,
          "",
          ...patches.map((p, i) =>
            [
              `**Patch ${i + 1}**: ${(p.files_modified?.[0] ?? "(unknown file)")} — ${(p._note ?? "Refactor patch")}`,
              "```diff",
              p.diff,
              "```",
            ].join("\n")
          ),
        ].join("\n");
        return toToolResponse(text, stream);
      } catch (err) {
        return toToolResponse(`❌ Internal error: ${err.message}`, stream);
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
        const rt        = await getRuntime();
        const validator = new ComplianceValidator();
        const { lines } = validator.validate({ agent_id, authorization_level, skill_set, runtime: rt });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "delegate_task",
    "Delegates a task from one agent to another via domain events.",
    {
      from_agent: z.string(),
      to_agent: z.string(),
      action: z.string(),
      payload: z.object({}).passthrough().optional().default({}),
    },
    async ({ from_agent, to_agent, action, payload }) => {
      try {
        const rt = await getRuntime();
        const evt = rt.delegateTask(from_agent, to_agent, { action, payload });
        return { content: [{ type: "text", text: `✅ Delegated task ${evt.payload.task_id} from '${from_agent}' to '${to_agent}'` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "send_agent_message",
    "Sends an async message between agents through the EventBus.",
    {
      from_agent: z.string(),
      to_agent: z.string(),
      payload: z.object({}).passthrough().optional().default({}),
      parent_message_id: z.string().optional(),
      trace_id: z.string().optional(),
    },
    async ({ from_agent, to_agent, payload, parent_message_id, trace_id }) => {
      try {
        const rt = await getRuntime();
        const evt = rt.eventBus.sendMessage({
          from: from_agent,
          to: to_agent,
          payload,
          parent_message_id,
          trace_id,
        });
        return { content: [{ type: "text", text: `✅ Message sent id=${evt.message_id} trace_id=${evt.trace_id}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "task_status",
    "Reads delegation status by task id from event history.",
    {
      task_id: z.string(),
    },
    async ({ task_id }) => {
      try {
        const rt = await getRuntime();
        const events = rt.eventHistory(500).filter((e) => e.event_type === "TaskDelegated");
        const found = events.find((e) => e.payload?.task_id === task_id);
        if (!found) {
          return { content: [{ type: "text", text: `ℹ️ Task '${task_id}' not found.` }] };
        }
        return {
          content: [{
            type: "text",
            text: `✅ Task '${task_id}' status=${found.payload?.status ?? "unknown"} from=${found.from} to=${found.to}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "ack_task",
    "Acknowledges a delegated task and emits tracking event.",
    {
      task_id: z.string(),
      from_agent: z.string(),
      to_agent: z.string(),
      parent_message_id: z.string().optional(),
      trace_id: z.string().optional(),
    },
    async ({ task_id, from_agent, to_agent, parent_message_id, trace_id }) => {
      try {
        const rt = await getRuntime();
        const evt = rt.eventBus.sendMessage({
          from: from_agent,
          to: to_agent,
          event_type: "TaskAcknowledged",
          payload: { task_id, status: "acknowledged" },
          parent_message_id,
          trace_id,
        });
        return { content: [{ type: "text", text: `✅ Task '${task_id}' acknowledged (message=${evt.message_id})` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "retry_task",
    "Retries a delegated task by re-emitting TaskDelegated with parent linkage.",
    {
      task_id: z.string(),
      from_agent: z.string(),
      to_agent: z.string(),
      action: z.string(),
      payload: z.object({}).passthrough().optional().default({}),
      trace_id: z.string().optional(),
    },
    async ({ task_id, from_agent, to_agent, action, payload, trace_id }) => {
      try {
        const rt = await getRuntime();
        const evt = rt.eventBus.dispatch({
          event_type: "TaskDelegated",
          from: from_agent,
          to: to_agent,
          payload: {
            task_id,
            task: { action, payload },
            status: "retried",
          },
          parent_message_id: task_id,
          trace_id,
        });
        return { content: [{ type: "text", text: `✅ Task '${task_id}' retried (message=${evt.message_id})` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "semantic_events",
    "Queries semantic event memory using text matching/vector fallback.",
    {
      query: z.string(),
      top_k: z.number().int().min(1).max(50).optional().default(5),
    },
    async ({ query, top_k }) => {
      try {
        const rt = await getRuntime();
        const hits = rt.semanticEventHistory(query, top_k);
        if (!hits.length) {
          return { content: [{ type: "text", text: `ℹ️ No semantic events matched query '${query}'.` }] };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ query, top_k, hits }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `❌ Internal error: ${err.message}` }] };
      }
    }
  );

  return server;
}

module.exports = { createMcpServer };
