# agents-runtime v2.0 Architecture

This document defines the v2.0 transition from a tool-centric runtime to an
Agentic OS orchestration layer.

## Goals

- Decouple orchestration loop from MCP transport/tooling
- Introduce provider contracts for memory, sandbox, and external MCP clients
- Add traceable cognitive loop (pre-retrieval + post-persistence)

## Current v2.0 Foundation Implemented

1. `IMCPClient` contract
   - `src/core/contracts/mcp-client.contract.js`
2. `MCPManager` orchestration layer
   - `src/mcp/client/mcp-manager.js`
   - transport support: `stdio`, `streamable-http`
3. Runtime integration
   - `src/engine.js` now initializes optional external MCP client layer
   - runtime APIs:
     - `listExternalMcpTools()`
     - `callExternalMcpTool()`
     - `mcpHealth()`
4. MCP bridge tools
   - `external_mcp_tools`
   - `external_mcp_call`
5. Memory and sandbox contracts
   - `src/core/contracts/memory-provider.contract.js`
   - `src/core/contracts/sandbox.contract.js`
6. Cognitive memory provider (in-process)
   - `src/memory/providers/in-process-memory-provider.js`
   - `src/memory/providers/memory-provider-factory.js`
   - runtime APIs: `rememberSession`, `rememberLongTerm`, `retrieveSession`, `retrieveLongTerm`, `semanticRecall`
7. Sandbox manager abstraction
   - `src/sandbox/sandbox-manager.js`
   - runtime API: `sandboxHealth`
8. Cognitive MCP bridge tools
   - `cognitive_remember`
   - `cognitive_recall`
9. Reasoning loop middleware
   - `src/orchestration/reasoning-loop.js`
   - pre-process retrieval + post-process persistence
10. HITL risk guard
   - `src/orchestration/hitl-guard.js`
   - blocks high-risk actions unless explicit approval is provided
11. Observability step tracking
   - `src/observability/step-tracker.js`
   - exporter abstraction: `src/observability/exporters/index.js`
12. Sandbox provider registry
   - `src/sandbox/providers/index.js`
   - `src/sandbox/providers/process-provider.js`
   - `src/sandbox/providers/docker-provider.js`
   - `src/sandbox/providers/e2b-provider.js`
13. Operational health and trace tools
   - `trace_report`
   - `mcp_health`
   - `sandbox_health`
14. HITL approval token flow
   - `src/orchestration/approval-manager.js`
   - MCP tools: `hitl_issue_token`, `hitl_validate_token`

## Suggested v2.0 Target Structure

```text
src/
  core/
    contracts/
      mcp-client.contract.js
      memory-provider.contract.js
      sandbox.contract.js
    runtime/
      agent-runtime.js
      reasoning-loop.js
  mcp/
    client/
      mcp-manager.js
      adapters/
      transports/
    server/
      mcp-server.js
      tool-registry.js
  memory/
    short-term/
    long-term/
    retrieval/
  sandbox/
    providers/
    policy/
  observability/
    tracing/
    exporters/
```

## Configuration

External MCP client layer is configured via `.agents/settings.json`:

```json
{
  "runtime": {
    "mcp_client": {
      "enabled": false,
      "auto_discover": true,
      "servers": []
    }
  }
}
```

Each server entry:

```json
{
  "id": "github",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"]
}
```

Alternative transport:

```json
{
  "id": "remote-mcp",
  "transport": "streamable-http",
  "url": "https://mcp.example.com"
}
```

## Next Milestones

1. `IMemoryProvider` + long-term vector providers
2. `ISandbox` provider abstraction (Docker/E2B)
3. Reasoning loop middleware phases:
   - pre: retrieval
   - action: tool/sandbox execution
   - post: trace + memory write
4. HITL guard policy for high-risk actions (`rm -rf`, `curl | sh`)
