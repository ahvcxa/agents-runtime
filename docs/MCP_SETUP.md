# MCP Server Setup for Claude Desktop

agents-runtime provides a Model Context Protocol (MCP) server that integrates with Claude Desktop, allowing Claude to analyze code for security issues and quality problems.

## Quick Setup

### 1. Configuration

The MCP server configuration is automatically set up at:
```
~/.claude/claude_desktop_config.json
```

If not present, create it with:
```json
{
  "mcpServers": {
    "agents-runtime": {
      "command": "node",
      "args": [
        "/absolute/path/to/agents-runtime/bin/mcp.js",
        "--project",
        "/absolute/path/to/agents-runtime"
      ]
    }
  }
}
```

### 2. Restart Claude Desktop

Fully quit and reopen Claude Desktop (not just minimize):
```bash
# macOS
killall Claude

# Linux
pkill Claude

# Then reopen from Applications menu
```

### 3. Use with Claude

In Claude Desktop, ask it to analyze code:

```
Analyze this code for security issues:

import os
def process(filename):
    os.system(f"cat {filename}")
```

Claude will automatically call the `code_analysis` tool and return findings.

## Available Tools

1. **code_analysis** — Static analysis for JS/TS/Python
2. **security_audit** — OWASP Top 10 audit
3. **refactor** — Generate fix patches
4. **compliance_check** — Validate agent configs
5. **delegate_task** — Task delegation
6. **send_agent_message** — Agent messaging
7. **task_status** — Status tracking
8. **ack_task** — Task acknowledgement
9. **retry_task** — Retry failed tasks
10. **semantic_events** — Semantic search

## Verification

Test the MCP server locally:
```bash
cd /path/to/agents-runtime
node bin/mcp.js --project .
```

Should output:
```
[agents-runtime MCP] Starting server. Project: /path/to/agents-runtime
[agents-runtime MCP] Server ready. Waiting for tool calls...
```

## Troubleshooting

**Tools not available in Claude Desktop:**
1. Fully quit Claude (not minimize)
2. Wait 2-3 seconds
3. Reopen Claude Desktop
4. Wait 5 seconds for server connection

**Server won't start:**
```bash
# Verify Node.js installed
node --version

# Test server directly
cd /path/to/agents-runtime
node bin/mcp.js --project .
```

**Config issues:**
```bash
# Verify file exists and is valid JSON
cat ~/.claude/claude_desktop_config.json | jq .

# Should show agents-runtime server entry
```

## How It Works

1. Claude Desktop reads `claude_desktop_config.json`
2. Launches MCP server via `node bin/mcp.js` on demand
3. Server exposes 10 tools via MCP protocol
4. Claude discovers and uses tools automatically
5. Tools call agents-runtime skills (code-analysis, security-audit, etc.)
6. Results returned to Claude for human-readable output

## Development

Run test suite:
```bash
npm test
```

All 39 tests should pass, including MCP integration.

## More Information

- [MCP Protocol Spec](https://modelcontextprotocol.io/)
- [agents-runtime Documentation](./README.md)
- [Code Quality Standards](./FINDINGS.md)
- [Technical Roadmap](./ROADMAP.md)
