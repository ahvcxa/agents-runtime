# Next Steps for agents-runtime

Generated: 2026-04-06T20:12:48.827Z

## 1. Verify Installation

Check that everything is correctly installed:

```bash
# Should show no errors
node bin/agents.js check --config agent.yaml --project .
```

Expected output:
```
✓ Agent compliance check passed
✓ Config is valid
✓ Skills are registered
```

## 2. Run Your First Analysis

Analyze your codebase:

```bash
node bin/agents.js run \
  --config agent.yaml \
  --skill code-analysis \
  --input '{"files":["src/"],"project_root":"."}'
```

This will produce:
- Cyclomatic complexity findings
- DRY (Don't Repeat Yourself) violations
- Security patterns (injection, XSS, etc.)
- SOLID principles violations
- Cognitive complexity issues

## 3. Security Audit

Run OWASP Top 10 security audit:

```bash
node bin/agents.js run \
  --config agent.yaml \
  --skill security-audit \
  --input '{"files":["src/"],"project_root":"."}'
```

## 4. Configure Your Workspace

Edit `.agents/settings.json`:

```json
{
  "project_root": ".",
  "read_paths": ["src/", "tests/"],
  "python_analysis": {
    "enabled": true,
    "ast_analysis": true,
    "safe_subprocess": true
  },
  "memory_backend": "in-memory",
  "logging": {
    "level": "INFO",
    "output": ".agents/logs"
  }
}
```

## 5. Create Custom Skills (Optional)

Create a new skill in `.agents/skills/my-skill/`:

```
.agents/skills/my-skill/
├── SKILL.md      (metadata + contract)
└── handler.js    (execution logic)
```

See `.agents/skills/code-analysis/SKILL.md` for examples.

## 6. Set Up Hooks (Optional)

Modify behavior with hooks in `.agents/hooks/`:

- `pre-read.hook.js` — Filesystem access guard
- `skill-lifecycle.hook.js` — Before/after skill execution

## 7. Use as MCP Tool (Claude/Cursor/Windsurf)

Start the MCP server:

```bash
node bin/mcp.js --project .
```

Then configure your AI editor (Claude Desktop, Cursor, Windsurf) to use agents-runtime.
See `docs/MCP_SETUP.md` for details.

## Integrate with GitHub Actions

Create `.github/workflows/agent-audit.yml`:

```yaml
name: Agent Security Audit
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: node ./agents-runtime/bin/agents.js run --config agent.yaml --skill security-audit --project .
```

## 8. Integration Examples

### Pre-commit Hook

```.git/hooks/pre-commit```
```bash
#!/bin/sh
node bin/agents.js run \
  --config agent.yaml \
  --skill security-audit \
  --input '{"files":["src/"],"project_root":"$(pwd)"}'
```

### Docker Integration

```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "bin/agents.js", "run", "--config", "agent.yaml", "--skill", "code-analysis"]
```

## Troubleshooting

If you encounter issues:

1. Check `.agents/TROUBLESHOOTING.md`
2. Review `.agents/logs/` for error details
3. Run with `-v, --verbose` for detailed output
4. Visit https://github.com/ahvcxa/agents-runtime/issues

## Getting Help

- **Documentation**: README.md in project root
- **Examples**: `examples/` directory
- **Issues**: GitHub issues page
- **Discussions**: GitHub discussions

## Agent Types Reference

- **Observer** (Level 1) — Read-only analysis, no modifications
- **Executor** (Level 2) — Can suggest refactoring + write files
- **Orchestrator** (Level 3) — Full control, spawn sub-agents

Your agent is: **orchestrator (spawns sub-agents)**

---

Enjoy using agents-runtime! 🚀
