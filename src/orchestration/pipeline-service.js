"use strict";

function summarizeValue(value) {
  if (value == null) return "null";
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return `object(keys=${Object.keys(value).slice(0, 12).join(",")})`;
  return String(value);
}

function transformForSandbox(externalPayload, mode = "pass_through") {
  const selected = String(mode || "pass_through").toLowerCase();

  if (selected === "extract_text") {
    if (typeof externalPayload === "string") return { text: externalPayload };
    return { text: JSON.stringify(externalPayload, null, 2) };
  }

  if (selected === "summarize") {
    if (Array.isArray(externalPayload)) {
      return {
        type: "array",
        length: externalPayload.length,
        sample: externalPayload.slice(0, 3).map(summarizeValue),
      };
    }
    if (externalPayload && typeof externalPayload === "object") {
      const keys = Object.keys(externalPayload);
      return {
        type: "object",
        key_count: keys.length,
        keys: keys.slice(0, 25),
        preview: summarizeValue(externalPayload),
      };
    }
    return { type: typeof externalPayload, value: summarizeValue(externalPayload) };
  }

  return externalPayload;
}

class PipelineService {
  constructor(runtime) {
    this.runtime = runtime;
  }

  async runExternalMcpSandboxMemoryPipeline({
    agent_id = "mcp-client",
    tool_name,
    tool_input = {},
    server_id,
    query,
    sandbox_mode = "pass_through",
    memory_key,
    timeout_ms = 20000,
  }) {
    if (!tool_name) {
      throw new Error("tool_name is required");
    }

    const traceId = this.runtime?.tracer?.traceId?.() || `trace-${Date.now()}`;
    const startedAt = Date.now();

    // Pre-process: retrieve similar memories
    let retrieved = [];
    const preStart = Date.now();
    if (query && typeof query === "string") {
      try {
        retrieved = await this.runtime.semanticRecall(query, 5);
      } catch {
        retrieved = [];
      }
    }
    this.runtime.trackStep({
      trace_id: traceId,
      agent_id,
      skill_id: "external_mcp_pipeline",
      phase: "pre_process.retrieve_memory",
      latency_ms: Date.now() - preStart,
    });

    // Action 1: call external MCP tool
    const externalStart = Date.now();
    const external = await this.runtime.callExternalMcpTool(tool_name, tool_input, { server_id });
    this.runtime.trackStep({
      trace_id: traceId,
      agent_id,
      skill_id: "external_mcp_pipeline",
      phase: "action.external_mcp_call",
      latency_ms: Date.now() - externalStart,
    });

    if (!external?.ok) {
      const failure = {
        success: false,
        stage: "external_mcp_call",
        trace_id: traceId,
        error: external?.error || { code: "MCP_CALL_FAILED", message: "Unknown MCP failure" },
        retrieved_memory_count: retrieved.length,
      };
      await this.runtime.rememberSession(`session:${agent_id}`, "system", JSON.stringify(failure), { trace_id: traceId });
      return failure;
    }

    // Action 2: process through sandbox provider
    const externalPayload = external.structured_content ?? external.content ?? external.raw;
    const sandboxInput = transformForSandbox(externalPayload, sandbox_mode);
    const sandboxStart = Date.now();
    let sandboxOutput;

    try {
      sandboxOutput = await this.runtime.sandboxManager.execute({
        strategy: this.runtime.settings?.runtime?.sandbox?.strategy ?? "process",
        timeoutMs: timeout_ms,
        logger: this.runtime.logger,
        sandboxSettings: this.runtime.settings?.runtime?.sandbox ?? {},
        context: {
          trace_id: traceId,
          tool_name,
          sandbox_mode,
        },
        run: () => ({
          processed: sandboxInput,
          metadata: {
            sandbox_mode,
            tool_name,
          },
        }),
      });
    } catch (err) {
      const failure = {
        success: false,
        stage: "sandbox_execution",
        trace_id: traceId,
        error: { code: "SANDBOX_FAILED", message: err.message },
        external_result: externalPayload,
        retrieved_memory_count: retrieved.length,
      };
      await this.runtime.rememberSession(`session:${agent_id}`, "system", JSON.stringify(failure), { trace_id: traceId });
      return failure;
    }

    this.runtime.trackStep({
      trace_id: traceId,
      agent_id,
      skill_id: "external_mcp_pipeline",
      phase: "action.sandbox_execution",
      latency_ms: Date.now() - sandboxStart,
    });

    // Post-process: persist long-term memory insight
    const key = memory_key || `pipeline:${tool_name}:${traceId}`;
    await this.runtime.rememberLongTerm(key, {
      trace_id: traceId,
      tool_name,
      tool_input,
      sandbox_mode,
      external_result: externalPayload,
      sandbox_output: sandboxOutput,
      retrieved_memory_count: retrieved.length,
    }, {
      text: `pipeline ${tool_name} ${sandbox_mode}`,
      metadata: {
        trace_id: traceId,
        agent_id,
      },
    });

    this.runtime.trackStep({
      trace_id: traceId,
      agent_id,
      skill_id: "external_mcp_pipeline",
      phase: "post_process.persist_memory",
      latency_ms: Math.max(0, Date.now() - startedAt),
    });

    return {
      success: true,
      trace_id: traceId,
      memory_key: key,
      retrieved_memory_count: retrieved.length,
      external_result: externalPayload,
      sandbox_output: sandboxOutput,
      total_latency_ms: Date.now() - startedAt,
    };
  }
}

module.exports = { PipelineService, transformForSandbox };
