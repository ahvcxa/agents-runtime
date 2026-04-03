#!/usr/bin/env node
"use strict";
/**
 * bin/mcp.js — agents-runtime MCP server entry point
 *
 * Usage:
 *   node bin/mcp.js --project /path/to/project
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "agents-runtime": {
 *       "command": "node",
 *       "args": ["/path/to/agents-runtime/bin/mcp.js", "--project", "/path/to/your/project"]
 *     }
 *   }
 * }
 */

const { program }              = require("commander");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { createMcpServer }      = require("../src/mcp-server");
const path                     = require("path");

program
  .name("agents-mcp")
  .description("agents-runtime MCP server — exposes code analysis and security audit as AI tools")
  .version("1.0.0")
  .option("--project <path>", "Path to target project (must have .agents/ installed)", process.cwd())
  .parse(process.argv);

const opts        = program.opts();
const projectRoot = path.resolve(opts.project);

(async () => {
  process.stderr.write(`[agents-runtime MCP] Starting server. Project: ${projectRoot}\n`);

  const server    = await createMcpServer(projectRoot);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  process.stderr.write("[agents-runtime MCP] Server ready. Waiting for tool calls...\n");
})().catch((err) => {
  process.stderr.write(`[agents-runtime MCP] Fatal error: ${err.message}\n`);
  process.exit(1);
});
