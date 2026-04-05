# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- _No user-facing changes yet._

---

## [2.0.0] — 2026-04-05

### Added

- V2 orchestration layer with cognitive memory, sandbox abstraction, external MCP client layer, reasoning-loop middleware, and HITL approval tokens.
- SQLite cognitive memory provider with session and long-term persistence plus semantic recall.
- MCP retry/backoff and circuit-breaker resilience for unstable external servers.
- End-to-end external MCP -> sandbox -> memory pipeline and observability step tracking.
- Secure filesystem MCP tools with write-mode gating and project-root path enforcement.

---

## [1.3.0] — 2026-04-04

### Added

- **AST-based Python analyzer** (`src/analyzers/python-ast-analyzer.js`) — deep
  security analysis via Python's native `ast` module run in a subprocess. Detects
  vulnerabilities that regex cannot catch:
  - `exec()` calls → CRITICAL (CWE-78)
  - `eval()` calls → HIGH (CWE-78)
  - `pickle.loads()` → CRITICAL (CWE-502, OWASP A08:2021)
  - `subprocess` / `Popen` usage → MEDIUM (CWE-78)
  - Dangerous imports (`pickle`, `marshal`, `ctypes`, `cffi`) → MEDIUM (CWE-676)
  - Python syntax errors surfaced as HIGH findings
  - Graceful degradation: if Python 3.8+ is unavailable, regex-based results are
    returned unchanged with `available: false`
- **ExecutorFactory pattern** (`src/executors/`) — Strategy pattern for skill
  execution; decomposes `_executeSkill()` (CC=13) into pluggable classes:
  - `BaseExecutor` — abstract interface
  - `HandlerExecutor` — JS handler file execution via sandbox
  - `EchoExecutor` — LLM-driven skill fallback (no JS handler required)
  - `ExecutorFactory` — selects correct executor at runtime
- **SemanticMemoryClient** (`src/memory/semantic-memory.js`) — extracted from
  `MemoryStoreClient` per SOLID/SRP; handles semantic event indexing and search
- **ComplianceValidator** (`src/mcp/validators/compliance-validator.js`) —
  extracted from `compliance_check` MCP tool; each validation check is its own
  method (CC reduced from 12 to 3)
- **`EXPORT_NAMES_MAP` / `ALLOWED_HOOK_EVENTS`** constants in `hook-registry.js`
  for O(1) hook name resolution instead of O(n) dynamic inference fallback

### Fixed

- **Race condition (CWE-362)**: `FileMemoryDriver.upsert/get/delete` now properly
  `await this._ensureReady()` — fire-and-forget pattern eliminated, no more silent
  data loss when reads occur before file load completes
- **Stack overflow**: `redact()` in `structured-logger.js` now tracks recursion
  depth (`maxDepth=10`) to prevent stack overflow on circular or deeply nested objects
- **Injection prevention (CWE-78)**: Docker binary path validated against
  `ALLOWED_DOCKER_PATHS` whitelist before any subprocess spawn in `sandbox/executor.js`
- **Network request validation**: URL null-check + `new URL()` format validation
  added before `before_network_access` hook dispatch in `agent-runner.js`
- **Query injection guard**: `semanticSearch()` now rejects non-string or empty
  queries with a clear error before any processing

### Changed

- **Non-blocking subprocess** (`agent-runner.js`): replaced `execFile/promisify`
  with `spawnAsync()` — streams stdout/stderr independently, does not stall the
  Node.js event loop under concurrent agent load
- **Python analysis is now async**: `analyzeCodePython()` and `auditSecurityPython()`
  return `Promise<Finding[]>` (was synchronous) to accommodate the AST subprocess pass

### Tests

- Expanded coverage from **39 tests / 8 suites** to **87 tests / 12 suites** (+48 tests)
- New test suites: `executor-factory.test.js`, `compliance-validator.test.js`,
  `semantic-memory.test.js`, `python-ast-analyzer.test.js`
- All 87 tests pass on Node.js 18, 20, and 22

### CI

- Added `setup-python@v5` step to CI matrix so AST analyzer runs at full
  capability in CI (no graceful degradation on ubuntu-latest)


## [1.2.1] — 2026-04-03

### Fixed

- Eliminated lingering timeout handles in sandbox execution by replacing raw timeout race logic with a managed `withTimeout(...)` helper that always clears timers.
- Removed Jest `--forceExit` from `test` and `test:coverage` scripts now that open-handle leaks are resolved.

### Quality

- Verified clean shutdown with `--detectOpenHandles`.
- Confirmed all checks pass without force-exit fallback (`8/8` suites, `39/39` tests).

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

[1.3.0]: https://github.com/ahvcxa/agents-runtime/compare/v1.2.1...v1.3.0
[2.0.0]: https://github.com/ahvcxa/agents-runtime/compare/v1.3.0...v2.0.0
[1.2.1]: https://github.com/ahvcxa/agents-runtime/releases/tag/v1.2.1
[1.1.0]: https://github.com/ahvcxa/agents-runtime/releases/tag/v1.1.0
[1.0.0]: https://github.com/ahvcxa/agents-runtime/releases/tag/v1.0.0
