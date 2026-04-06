# Quick Start Guide

Generated: 2026-04-06T20:12:48.826Z
Agent Type: orchestrator (spawns sub-agents)

## What you just installed

- **agents-runtime** — An AI-powered code analysis engine
- **agent.yaml** — Your agent configuration
- **.agents/** — Agent skills, hooks, and settings

## Your first command (60 seconds)

### Option 1: Using npm scripts (recommended)

```bash
# Analyze your code
npm run analyze -- src/

# Security audit
npm run audit -- src/

# Compliance check
npm run check
```

### Option 2: Using direct node command

```bash
node ../../../agents-runtime/bin/agents.js run \
  --config agent.yaml \
  --skill code-analysis \
  --input '{"files":["src/"],"project_root":"."}'
```

## Common commands

| Task | Command |
|------|---------|
| Analyze code | `npm run analyze -- src/` |
| Security audit | `npm run audit -- src/` |
| Check compliance | `npm run check` |
| List skills | `npm run list` |
| Show events | `npm run events` |

## Configuration

Your agent is configured as:
- Type: orchestrator (spawns sub-agents)
- Location: `agent.yaml`
- Settings: `.agents/settings.json`

To change configuration, edit `agent.yaml` and re-run checks.

## Troubleshooting

See `.agents/TROUBLESHOOTING.md` for common issues and solutions.

## Next steps

1. Review `.agents/settings.json` for runtime config
2. Add your project paths to `.agents/settings.json`
3. Run `npm run check` to validate your config
4. Integrate into CI/CD (see NEXT_STEPS.md)

## Documentation

- Full docs: `../../../agents-runtime/README.md`
- Skill reference: `.agents/skills/*/SKILL.md`
- Contributing: `../../../agents-runtime/CONTRIBUTING.md`

## Python Support

Python analysis is enabled. The runtime will analyze .py files in addition to .js/.ts files.


---

For more help, visit: https://github.com/ahvcxa/agents-runtime
