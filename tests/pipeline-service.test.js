"use strict";

const { PipelineService, transformForSandbox } = require("../src/orchestration/pipeline-service");

describe("PipelineService", () => {
  test("transformForSandbox supports summarize mode", () => {
    const out = transformForSandbox({ a: 1, b: 2 }, "summarize");
    expect(out.type).toBe("object");
  });

  test("returns failure payload when external MCP call fails", async () => {
    const runtime = {
      tracer: { traceId: () => "trace-1" },
      semanticRecall: jest.fn().mockResolvedValue([]),
      callExternalMcpTool: jest.fn().mockResolvedValue({
        ok: false,
        error: { code: "MCP_TOOL_NOT_FOUND", message: "missing" },
      }),
      trackStep: jest.fn(),
      rememberSession: jest.fn().mockResolvedValue("k"),
      rememberLongTerm: jest.fn(),
      sandboxManager: { execute: jest.fn() },
      settings: { runtime: { sandbox: { strategy: "process" } } },
      logger: { log() {} },
    };

    const service = new PipelineService(runtime);
    const result = await service.runExternalMcpSandboxMemoryPipeline({
      tool_name: "github_list_prs",
      tool_input: {},
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("external_mcp_call");
  });

  test("runs successful pipeline and persists memory", async () => {
    const runtime = {
      tracer: { traceId: () => "trace-2" },
      semanticRecall: jest.fn().mockResolvedValue([{ key: "m1", score: 0.9 }]),
      callExternalMcpTool: jest.fn().mockResolvedValue({
        ok: true,
        structured_content: { prs: [{ id: 1 }] },
      }),
      sandboxManager: {
        execute: jest.fn().mockImplementation(async ({ run }) => run()),
      },
      settings: { runtime: { sandbox: { strategy: "process" } } },
      logger: { log() {} },
      trackStep: jest.fn(),
      rememberSession: jest.fn().mockResolvedValue("s1"),
      rememberLongTerm: jest.fn().mockResolvedValue("lt1"),
    };

    const service = new PipelineService(runtime);
    const result = await service.runExternalMcpSandboxMemoryPipeline({
      tool_name: "github_list_prs",
      tool_input: { repo: "owner/repo" },
      query: "open pull requests",
      sandbox_mode: "summarize",
    });

    expect(result.success).toBe(true);
    expect(result.trace_id).toBe("trace-2");
    expect(runtime.rememberLongTerm).toHaveBeenCalled();
  });
});
