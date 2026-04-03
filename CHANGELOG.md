# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2024-04-03

### Added

#### Runtime Engine
- `AgentRuntime` — central orchestrator that bootstraps manifest, settings, hooks, and skills
- `AgentRunner` — full skill lifecycle pipeline (compliance → pre-skill → execute → post-skill → event emit)
- `HookRegistry` — automatic hook dispatch based on `manifest.json` lifecycle configuration
- `SkillRegistry` — lazy skill loading with authorization level enforcement
- `MemoryStore` — ACL-backed in-memory store with namespace-based write permissions
- `EventBus` — domain event bus (EventEmitter-based)
- `StructuredLogger` — JSONL-format logger with field redaction and verbosity modes

#### CLI (`bin/agents.js`)
- `agents run` — execute a skill with full lifecycle hooks
- `agents check` — run compliance validation for an agent config
- `agents list` — list registered skills and hooks
- `agents events` — show recent domain events

#### Skills (`.agents/skills/`)
- **`code-analysis`** — 5-principle static analysis (Cyclomatic Complexity, DRY, Security, SOLID, Cognitive Complexity)
- **`security-audit`** — OWASP Top 10 (2021) deep security audit with 25 JS + 18 Python rules
- **`refactor`** — unified diff patch generator for `auto_fixable` findings (dry-run safe)

#### Language Support
- JavaScript / TypeScript / JSX / TSX / MJS / CJS
- **Python** — full 5-principle analysis via `src/analyzers/python-analyzer.js`

#### Template (`agents-template/`)
- `setup-agents.sh` — one-command installer for any project
- `pre-read.hook.js` — path traversal + forbidden pattern enforcement
- `skill-lifecycle.hook.js` — pre-skill / post-skill lifecycle events with memory locking
- `helpers/python-analyzer.js` — co-installed Python analyzer

### Security
- Memory namespace ACL: Observer (level 1) cannot write above `skill:*:cache:*`
- Pre-read hook blocks path traversal and forbidden file patterns at framework level
- All skill handler `handler:` paths are resolved from SKILL.md frontmatter

### Tests
- 18 tests across 3 suites: `engine.test.js`, `hook-registry.test.js`, `memory-store.test.js`
- All tests pass on Node.js 18, 20, and 22

---

[1.0.0]: https://github.com/ahvcxa/agents-runtime/releases/tag/v1.0.0
