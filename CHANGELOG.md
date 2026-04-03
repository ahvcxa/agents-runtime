# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Added MCP multi-agent lifecycle tools:
  - `delegate_task`
  - `send_agent_message`
  - `task_status`
  - `ack_task`
  - `retry_task`
  - `semantic_events`
- Added semantic event memory APIs in runtime and event bus:
  - `AgentRuntime.semanticEventHistory(query, topK)`
  - `EventBus.semanticHistory(query, topK)`
- Added trace-linked result metadata propagation in skill execution outputs.

### Changed

- Hardened async performance paths:
  - Compliance temp-file I/O switched to `fs/promises` in `src/agent-runner.js`.
  - Temp cleanup now uses async unlink for non-blocking shutdown behavior.
- Improved sandbox controls:
  - Added docker feature gate (`docker_enabled`) and resource controls (`docker_cpus`, `docker_memory`).
  - Docker strategy now attempts isolated execution with safe fallback behavior.
- Extended memory semantics:
  - Added `semantic_events` config block and vector-like text similarity fallback behavior.
  - Event envelopes are now persisted into semantic memory when enabled.
- Updated MCP tool output handling with streaming-style chunked responses (`stream: true`).

### Tests

- Expanded coverage to **39 tests / 8 suites**.
- Extended tests for semantic event indexing/query, docker sandbox gating, and MCP multi-agent tool registration.

---

## [1.1.0] — 2026-04-03

### Added

- Introduced an adapter-based memory architecture in `src/memory/memory-store.js` with pluggable backends:
  - `InProcessMemoryDriver`
  - `FileMemoryDriver`
  - `RedisMemoryDriver` (scaffold)
  - `PostgresMemoryDriver` (scaffold)
  - `VectorMemoryDriver` (scaffold)
- Added sandbox execution orchestration in `src/sandbox/executor.js` with strategy selection (`process`, `docker`, `wasm`) and timeout protection.
- Added `pre-network` security hook support to enforce outbound endpoint allowlisting and authorization policy:
  - `template/hooks/pre-network.hook.js`
  - `before_network_access` lifecycle wiring in manifest and runtime hooks.
- Added multi-agent communication extensions on the event bus:
  - `sendMessage(...)`
  - `delegateTask(...)` producing `TaskDelegated` domain events.
- Added OpenTelemetry-compatible tracing bootstrap with graceful no-op fallback in `src/telemetry/tracer.js`.
- Added report export subsystem in `src/report/exporter.js` with JSON, HTML, and PDF outputs.
- Added CLI export support to `agents run`:
  - `--export <path>`
  - `--format <json|html|pdf>`

### Changed

- Hardened MCP compliance output and refactor patch formatting to match runtime patch schema.
- Added stricter manifest validation for hook and skill definitions (`id`, `path`, `fires`, array shape checks).
- Isolated runtime tests from repository root by introducing a dedicated fixture project under `tests/fixtures/project`.
- Extended runtime defaults to include sandbox configuration and backend-specific memory sections (`redis`, `postgres`, `vector`).
- Updated template and fixture manifests/settings to include `pre-network` and network policy examples.

### Tests

- Expanded coverage from 18 tests / 3 suites to 35 tests / 8 suites.
- Added `tests/mcp-server.test.js` and `tests/manifest-loader.test.js`.
- Added `tests/event-bus.test.js`, `tests/exporter.test.js`, and `tests/sandbox.test.js`.
- Extended existing engine, hook, and memory test suites for delegation, network gating, and adapter backend selection.

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

#### Template (`template/`)
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

[1.1.0]: https://github.com/ahvcxa/agents-runtime/releases/tag/v1.1.0
[1.0.0]: https://github.com/ahvcxa/agents-runtime/releases/tag/v1.0.0
