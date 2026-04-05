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
});
