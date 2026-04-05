"use strict";

const { Client } = require("@modelcontextprotocol/sdk/client");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { IMCPClient } = require("../../core/contracts/mcp-client.contract");

function normalizeToolResult(result) {
  return {
    is_error: Boolean(result?.isError),
    structured_content: result?.structuredContent,
    content: Array.isArray(result?.content)
      ? result.content.map((item) => {
          if (item?.type === "text") return item.text;
          return JSON.stringify(item);
        }).join("\n")
      : "",
    raw: result,
  };
}

function resolveTransport(config) {
  const mode = String(config?.transport ?? "stdio").toLowerCase();

  if (mode === "stdio") {
    if (!config?.command) {
      throw new Error(`[mcp-manager] stdio transport requires 'command' for server '${config?.id ?? "unknown"}'`);
    }
    return new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      cwd: config.cwd,
      stderr: "pipe",
    });
  }

  if (mode === "streamable-http" || mode === "http") {
    if (!config?.url) {
      throw new Error(`[mcp-manager] streamable-http transport requires 'url' for server '${config?.id ?? "unknown"}'`);
    }
    return new StreamableHTTPClientTransport(new URL(config.url));
  }

  throw new Error(`[mcp-manager] Unsupported transport '${mode}' for server '${config?.id ?? "unknown"}'`);
}

class MCPClientAdapter extends IMCPClient {
  constructor(config = {}) {
    super(config);
    this.id = config.id;
    this.config = config;
    this.client = new Client({
      name: `agents-runtime-mcp-client:${this.id}`,
      version: "2.0.0",
    });
    this.transport = null;
    this.connected = false;
    this.toolsCache = [];
    this.lastError = null;
  }

  async init() {
    if (this.connected) return;
    this.transport = resolveTransport(this.config);
    await this.client.connect(this.transport);
    this.connected = true;
    this.lastError = null;
  }

  async discoverTools() {
    await this.init();
    const listed = await this.client.listTools();
    const tools = (listed?.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
      server_id: this.id,
    }));
    this.toolsCache = tools;
    return tools;
  }

  async callTool(toolName, input = {}, options = {}) {
    const startedAt = Date.now();
    try {
      await this.init();
      const result = await this.client.callTool({
        name: toolName,
        arguments: input,
      }, undefined, options?.request_options);
      return {
        ok: !result?.isError,
        latency_ms: Date.now() - startedAt,
        ...normalizeToolResult(result),
      };
    } catch (err) {
      this.lastError = err.message;
      return {
        ok: false,
        latency_ms: Date.now() - startedAt,
        error: {
          code: "MCP_TOOL_CALL_FAILED",
          message: err.message,
          retriable: true,
        },
      };
    }
  }

  async healthCheck() {
    try {
      await this.init();
      await this.client.listTools();
      return {
        status: "healthy",
        checked_at: new Date().toISOString(),
      };
    } catch (err) {
      this.lastError = err.message;
      return {
        status: "offline",
        checked_at: new Date().toISOString(),
        last_error: err.message,
      };
    }
  }

  async shutdown() {
    try {
      await this.transport?.close?.();
    } catch {
      // no-op
    } finally {
      this.connected = false;
      this.transport = null;
    }
  }
}

class MCPManager {
  constructor(settings = {}, logger = null) {
    this.settings = settings;
    this.logger = logger;
    this.clients = new Map();
    this.toolIndex = new Map(); // tool_name -> server_id
  }

  _mcpConfig() {
    const cfg = this.settings?.runtime?.mcp_client ?? {};
    return {
      enabled: Boolean(cfg.enabled),
      servers: Array.isArray(cfg.servers) ? cfg.servers : [],
      autoDiscover: cfg.auto_discover !== false,
    };
  }

  async init() {
    const cfg = this._mcpConfig();
    if (!cfg.enabled) {
      this.logger?.log?.({ event_type: "INFO", message: "MCP client layer disabled in settings." });
      return;
    }

    for (const serverCfg of cfg.servers) {
      if (!serverCfg?.id) continue;
      const adapter = new MCPClientAdapter(serverCfg);
      await adapter.init();
      this.clients.set(serverCfg.id, adapter);
      this.logger?.log?.({
        event_type: "INFO",
        message: `MCP client connected: ${serverCfg.id}`,
      });
    }

    if (cfg.autoDiscover) {
      await this.refreshToolIndex();
    }
  }

  async refreshToolIndex() {
    this.toolIndex.clear();
    for (const [serverId, client] of this.clients.entries()) {
      try {
        const tools = await client.discoverTools();
        for (const tool of tools) {
          this.toolIndex.set(tool.name, serverId);
        }
      } catch (err) {
        this.logger?.log?.({
          event_type: "WARN",
          message: `MCP tool discovery failed for '${serverId}': ${err.message}`,
        });
      }
    }
  }

  listServers() {
    return [...this.clients.keys()];
  }

  listDiscoveredTools() {
    return [...this.toolIndex.entries()].map(([name, server_id]) => ({ name, server_id }));
  }

  async callTool(toolName, input = {}, options = {}) {
    const serverId = options.server_id ?? this.toolIndex.get(toolName);
    if (!serverId) {
      return {
        ok: false,
        error: {
          code: "MCP_TOOL_NOT_FOUND",
          message: `No MCP server found for tool '${toolName}'`,
          retriable: false,
        },
      };
    }

    const client = this.clients.get(serverId);
    if (!client) {
      return {
        ok: false,
        error: {
          code: "MCP_SERVER_NOT_AVAILABLE",
          message: `MCP server '${serverId}' is not initialized`,
          retriable: true,
        },
      };
    }

    return client.callTool(toolName, input, options);
  }

  async healthCheck() {
    const out = [];
    for (const [id, client] of this.clients.entries()) {
      out.push({ server_id: id, ...(await client.healthCheck()) });
    }
    return out;
  }

  async shutdown() {
    for (const client of this.clients.values()) {
      await client.shutdown();
    }
    this.clients.clear();
    this.toolIndex.clear();
  }
}

module.exports = {
  MCPManager,
  MCPClientAdapter,
};
