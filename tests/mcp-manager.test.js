"use strict";

jest.mock("@modelcontextprotocol/sdk/client", () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: "github_list_prs", description: "List PRs", inputSchema: { type: "object" } },
        ],
      }),
      callTool: jest.fn().mockResolvedValue({
        isError: false,
        content: [{ type: "text", text: "ok" }],
        structuredContent: { ok: true },
      }),
    })),
  };
});

jest.mock("@modelcontextprotocol/sdk/client/stdio.js", () => {
  return {
    StdioClientTransport: jest.fn().mockImplementation(() => ({
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => {
  return {
    StreamableHTTPClientTransport: jest.fn().mockImplementation(() => ({
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

const { MCPManager } = require("../src/mcp/client/mcp-manager");

describe("MCPManager", () => {
  test("does nothing when mcp_client is disabled", async () => {
    const manager = new MCPManager({ runtime: { mcp_client: { enabled: false } } });
    await manager.init();
    expect(manager.listServers()).toEqual([]);
    expect(manager.listDiscoveredTools()).toEqual([]);
  });

  test("connects stdio server and discovers tools", async () => {
    const manager = new MCPManager({
      runtime: {
        mcp_client: {
          enabled: true,
          auto_discover: true,
          servers: [
            {
              id: "github",
              transport: "stdio",
              command: "node",
              args: ["/tmp/fake-github-mcp.js"],
            },
          ],
        },
      },
    });

    await manager.init();

    expect(manager.listServers()).toEqual(["github"]);
    const tools = manager.listDiscoveredTools();
    expect(tools.length).toBe(1);
    expect(tools[0]).toEqual({ name: "github_list_prs", server_id: "github" });
  });

  test("routes tool call to discovered server", async () => {
    const manager = new MCPManager({
      runtime: {
        mcp_client: {
          enabled: true,
          auto_discover: true,
          servers: [
            {
              id: "github",
              transport: "stdio",
              command: "node",
              args: ["/tmp/fake-github-mcp.js"],
            },
          ],
        },
      },
    });

    await manager.init();
    const result = await manager.callTool("github_list_prs", { repo: "owner/repo" });
    expect(result.ok).toBe(true);
    expect(result.content).toContain("ok");
  });

  test("returns structured error when tool is missing", async () => {
    const manager = new MCPManager({ runtime: { mcp_client: { enabled: true, servers: [] } } });
    await manager.init();
    const result = await manager.callTool("unknown_tool", {});
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("MCP_TOOL_NOT_FOUND");
  });

  test("retries transient failures and succeeds", async () => {
    const manager = new MCPManager({
      runtime: {
        mcp_client: {
          enabled: true,
          auto_discover: true,
          retry: { max_attempts: 3, base_delay_ms: 0, breaker_threshold: 10, breaker_cooldown_ms: 1000 },
          servers: [
            { id: "github", transport: "stdio", command: "node", args: ["/tmp/fake.js"] },
          ],
        },
      },
    });
    await manager.init();
    const adapter = manager.clients.get("github");
    const spy = jest.spyOn(adapter, "callTool")
      .mockResolvedValueOnce({ ok: false, error: { retriable: true, code: "X", message: "fail1" } })
      .mockResolvedValueOnce({ ok: false, error: { retriable: true, code: "X", message: "fail2" } })
      .mockResolvedValueOnce({ ok: true, content: "ok", latency_ms: 1 });

    const result = await manager.callTool("github_list_prs", {});
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  test("opens circuit breaker after repeated failures", async () => {
    const manager = new MCPManager({
      runtime: {
        mcp_client: {
          enabled: true,
          auto_discover: true,
          retry: { max_attempts: 1, base_delay_ms: 0, breaker_threshold: 1, breaker_cooldown_ms: 60000 },
          servers: [
            { id: "github", transport: "stdio", command: "node", args: ["/tmp/fake.js"] },
          ],
        },
      },
    });
    await manager.init();
    const adapter = manager.clients.get("github");
    jest.spyOn(adapter, "callTool").mockResolvedValue({
      ok: false,
      error: { retriable: true, code: "MCP_TOOL_CALL_FAILED", message: "boom" },
    });

    const first = await manager.callTool("github_list_prs", {});
    expect(first.ok).toBe(false);

    const second = await manager.callTool("github_list_prs", {});
    expect(second.ok).toBe(false);
    expect(second.error.code).toBe("MCP_CIRCUIT_OPEN");
  });
});
