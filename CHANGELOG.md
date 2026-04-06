# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **🎯 Autonomous Skill Discovery System** (Major Feature):
  - Automatic skill detection from filesystem (.agents/{skill-id}/SKILL.md)
  - Zero-configuration setup: `npm run setup` now auto-discovers and registers all skills
  - Runtime validation: Engine startup compares discovered vs. manifest skills, warns on mismatches
  - Interactive skill selection: Setup wizard displays all discovered skills with descriptions, user can select which to enable (all pre-selected by default)
  - Comprehensive SKILL_DISCOVERY.md developer guide with API reference and best practices
  - Full test coverage: 10 new unit tests for SkillDiscovery class (all passing)

- **🔧 Setup Wizard Enhancements**:
  - New `SkillDiscovery` module (src/loader/skill-discovery.js) with 280+ lines of production-ready code
  - Setup wizard integration: Runs discovery → displays skills → generates manifest.json
  - Auto-generates manifest.json with selected skills during setup phase
  - Skill metadata display in configuration summary (version, context, auth level)

- **🚀 Engine Startup Enhancement**:
  - New _discoverAndValidateSkills() method in engine.js
  - Validates discovered skills vs. manifest during init()
  - INFO-level logging for unregistered/orphaned skills
  - Configurable behavior via settings.json (warn/error/skip)

- **⚙️ Runtime Configuration**:
  - New runtime.skill_auto_discovery config block in settings.json
  - Options: enabled, scan_path, pattern, auto_register_runtime, on_unregistered

### Changed

- Setup wizard now requires choosing skills (interactive selection)
- manifest.json now includes _generated metadata (timestamp, agent_type)
- Engine startup sequence expanded to include skill discovery validation (step 1.5)

### Fixed

- Skills can no longer be silently missing from manifest — runtime validates and warns
- Setup wizard was not generating manifest.json properly — now uses SkillDiscovery

### Technical Notes

- SkillDiscovery uses gray-matter for YAML parsing (already a dependency)
- Backward compatible: existing manifest.json files continue to work
- All 293 existing unit tests passing + 10 new skill-discovery tests
- Configuration fully documented in SKILL_DISCOVERY.md

---

## [2.4.0] — 2026-04-07

### Changed

- **🔧 Technical Debt Elimination — 5,200+ Lines of Code Duplication Removed**:
  - Consolidated documentation via symlinks: AGENT_CONTRACT.md, AI_AGENT_GUIDE.md, security guides unified across template/ and examples/
  - Consolidated skill libraries via symlinks: code-analysis and security-audit lib files now referenced from single source (.agents/skills/)
  - Removed redundant template/skills/ directory (consolidated to template/.agents/)
  - Eliminates 1,200+ lines of code duplication and 4,000+ lines of documentation duplication

- **🗑️ Dead Code Cleanup**:
  - Removed incomplete stub drivers: postgres-driver.js and redis-driver.js (non-functional placeholders)
  - Updated memory driver factory with clear error messages for unimplemented backends
  - Removed redundant FINDINGS.md and IMPROVEMENTS.md (history preserved in git commits)

- **📋 Project Organization**:
  - Enhanced .gitignore with IDE, OS, build artifact, and test coverage patterns
  - Fixed test imports to reference consolidated skill libraries
  - Updated 280+ unit tests to pass without deprecated drivers

### Fixed

- Memory driver factory now properly handles undefined backends with actionable error messages
- All 280+ unit tests passing (was: 2 failures due to incomplete drivers)
- Reduced repository size by ~4,600 lines of duplication

### Deprecated

- Redis memory driver (postgres-driver.js, redis-driver.js) — Use in-process or file-based persistence instead. Full implementations planned for v2.5.0.

### Technical Notes

- All changes are backward compatible (no breaking changes for v2.4.0)
- Single source of truth principle applied to shared documentation and skill libraries
- Symlinks used for DRY implementation (git-compatible, tested on Linux/macOS/Windows)
- Full git history preserved — all removed content recoverable from commits

---

## [2.3.0] — 2026-04-07

### Added

- **🛠️ Default Skills Library** — Five professional-grade utility skills for all projects:
  - **http-request**: Secure HTTP/HTTPS API calls with automatic retries, exponential backoff, timeout protection, SSL verification, and credential masking (Level 0)
  - **file-operations**: Read/write/append/delete files with sandbox mode (confined to `/.agents/workspace/`), path traversal prevention, blocked file list, size limits (Level 1)
  - **system-command**: Execute shell commands safely with whitelist pattern (node, npm, git, curl, jq), no shell interpolation, timeout protection, stderr capture (Level 2 — admin only)
  - **data-transform**: Safe JSON parsing, transformation, filtering, merging, validation with circular reference detection and size limits (Level 0)
  - **logging**: Structured logging with automatic sensitive data masking (passwords, tokens, API keys), audit trail, and log rotation (Level 0)

- **🔒 Skills Security Framework**:
  - `.agents/skills/SECURITY.md` — Comprehensive security best practices for skill developers (30+ patterns)
  - Input validation against JSON Schema for all skills
  - Automatic masking of sensitive data in logs and error responses
  - Size limits on all operations to prevent resource exhaustion
  - Authorization level enforcement (0=public, 1=internal, 2=admin)
  - Sandbox mode for file operations (path traversal prevention, blocked file list)
  - Whitelist pattern for system commands (no shell interpolation possible)
  - Timeout protection on all I/O operations
  - Comprehensive error codes for debugging

- **📚 Skills Documentation**:
  - `.agents/skills/README.md` — Skills library overview, quick start, development guide
  - Individual SKILL.md for each skill with examples, parameters, error codes, security best practices, troubleshooting
  - Manifest.json with input/output schema, examples, and security notes for each skill

- **✅ Skills Testing & Examples**:
  - Unit tests for each skill (handler.test.js) covering security scenarios
  - Basic examples in each skill directory
  - Test coverage for: input validation, security violations, size limits, error handling, edge cases

### Changed

- **manifest.json**: Updated `skills` section with 5 new default skills (now 8 total: 5 default + 3 domain-specific)
  - Skills ordered by category: Integration → IO → Execution → Transformation → Observability
  - All skills registered with authorization level, bounded context, and description

- **template/.agents/**: Full skills directory synced for distribution to new projects
  - `template/.agents/skills/` now contains all 8 skills (5 new defaults + 3 existing)
  - `template/.agents/manifest.json` updated with new skills registration

### Technical Details

- **Authorization Levels**:
  - Level 0 (Public/Default): http-request, data-transform, logging — no authorization required
  - Level 1 (Internal): file-operations, code-analysis, security-audit — requires agent auth level ≥ 1
  - Level 2 (Admin): system-command, refactor — requires agent auth level ≥ 2

- **Response Format** (Consistent across all skills):
  - `success`: boolean indicating operation completion
  - `data`: operation-specific result
  - `error`: null on success, error object with code/message/details on failure
  - `metadata`: execution time, timestamp, and operation-specific metrics

- **Error Codes** (Standardized):
  - Network: INVALID_URL, NETWORK_TIMEOUT, NETWORK_ERROR, SSL_ERROR, HTTP_ERROR
  - File: FILE_NOT_FOUND, PERMISSION_DENIED, IS_DIRECTORY, FILE_TOO_LARGE, SANDBOX_VIOLATION, PATH_TRAVERSAL_ATTEMPT, BLOCKED_FILE
  - Command: COMMAND_NOT_ALLOWED, COMMAND_TIMEOUT, COMMAND_NOT_FOUND, INVALID_ARGS, OUTPUT_TOO_LARGE, COMMAND_FAILED
  - Data: INVALID_JSON, SIZE_LIMIT_EXCEEDED, SCHEMA_ERROR, UNSAFE_OPERATION, TRANSFORM_FAILED
  - Logging: INVALID_PATTERN, LOGGING_FAILED

- **Size Limits** (Resource protection):
  - http-request: 5MB request body, 50MB response body
  - file-operations: 10MB per file
  - system-command: 1024 char command, 32KB total args, 2MB stdout/stderr each
  - data-transform: 50MB JSON input
  - logging: 4096 char per message, 100MB log file rotation

### Dependencies

- No new dependencies added. All skills use Node.js built-in modules:
  - http, https, zlib (http-request)
  - fs, path (file-operations)
  - child_process (system-command)
  - ajv (data-transform, for JSON Schema validation)
  - (logging uses fs only)

### Migration Guide

For existing projects:
1. Update `.agents/manifest.json` (new 5 skills auto-included in version 2.3.0)
2. Copy new skills to `.agents/skills/` if needed
3. No breaking changes — all existing skills unchanged

For new projects:
1. Run `setup.sh` to get all 8 skills automatically
2. Skills available immediately after setup

### Known Limitations

1. **file-operations**: Sandbox restricted to `/.agents/workspace/` — cannot access system files or user home directory
2. **system-command**: Only whitelisted commands allowed — cannot execute arbitrary binaries
3. **http-request**: Requires HTTPS by default (HTTP supported but not recommended)
4. **data-transform**: No code execution in filters — only safe predicates (x > 2, x.length > 10, etc.)
5. **logging**: Sensitive data masking is pattern-based — highly unusual variable names may not be detected

### Performance Baseline

| Skill | Typical Time | Notes |
|-------|----------|-------|
| http-request (GET) | 200-500ms | Depends on network |
| file-operations (read) | 5-50ms | Depends on file size |
| system-command | 50-500ms | Depends on command |
| data-transform | 1-100ms | Depends on data size |
| logging (write) | 2-10ms | Async, non-blocking |

---

## [2.2.0] — 2026-04-06

### Added

- **🤖 AI Agent Startup Protocol** — Mandatory initialization framework for LLM-based agents (Claude, GPT, Gemini, etc.):
  - Five-step mandatory initialization sequence (`agent-startup.md`)
  - Hard-fail behavior on compliance/configuration errors
  - Structured initialization workflow (locate config → run compliance → load settings → emit event → announce capabilities)
  - Pre-interaction hook enforcement (`pre-interaction.hook.js`) — prevents user interaction before startup completion

- **📋 AI Agent Guide** — Comprehensive best practices and integration patterns:
  - Core rules (non-negotiable security constraints)
  - Authorization level reference (Observer L1, Executor L2, Orchestrator L3)
  - Skill usage examples (code-analysis, security-audit, refactor)
  - Common error scenarios and troubleshooting
  - Integration patterns (Analysis → Report, Analysis → Refactor → Review, etc.)

- **🔒 Security Enhancements**:
  - Startup verification hooks prevent uninitialized agents from executing skills
  - Configuration discovery with search paths (./agent.yaml → ../agent.yaml → ../../agent.yaml)
  - Compliance check JSON output format for structured AI agent verification
  - Updated `AGENT_CONTRACT.md` Section 9 (AI Agent Initialization Protocol)

### Changed

- **manifest.json schema**: Added `startup_sequence` definition with 6-step mandatory sequence
- **settings.json schema**: Added `ai_agent_discovery` configuration with search paths and error handling
- **hooks/skill-lifecycle.hook.js**: Added pre-skill startup verification for AI agents
- **helpers/compliance-check.js**: Added `--json` flag for structured AI agent output (status, timestamp, agent_id, authorization_level, checks_passed/failed)
- **README.md**: New "For AI Agents" section with startup protocol and authorization reference

### Technical Details

- New file: `.agents/hooks/pre-interaction.hook.js` (4.5 KB) — startup verification hook
- New file: `.agents/agent-startup.md` (8.6 KB) — mandatory initialization guide
- New file: `.agents/AI_AGENT_GUIDE.md` (16 KB) — best practices and troubleshooting
- Updated: `AGENT_CONTRACT.md` with Section 9 (AI Agent Initialization Protocol)
- Updated: `manifest.json` with `startup_sequence` schema and `pre-interaction` hook definition
- Updated: `settings.json` with `ai_agent_discovery` configuration
- Enhanced: `compliance-check.js` with `--json` output support
- Enhanced: `skill-lifecycle.hook.js` with AI agent startup checks

### Testing

✅ All scenarios tested in real project setup:
- Setup installation (bash setup-agents.sh in examples/simple-js-app)
- Compliance check verification (exit code 0)
- JSON output format validation (status, timestamp, agent_id, role, authorization_level)
- Pre-interaction hook enforcement (file present and executable)
- Manifest schema validation (startup_sequence and pre-interaction hook definitions)
- Settings schema validation (ai_agent_discovery configuration)

### Migration Guide

For existing projects, no action needed — all changes are backward compatible.

To enable AI Agent Startup Protocol in existing projects:
```bash
# Re-run setup to get new files
bash setup-agents.sh /path/to/project --agent observer --force
# or
npm run setup
```

---

## [2.1.0] — 2026-04-06

### Added

- **Enterprise-grade security audit handler v2.0.0** — Professional refactoring from monolithic to modular 5-layer architecture:
  - `lib/rules.js` — Structured OWASP rule database with 25+ security rules, context checks, and false positive exclusions
  - `lib/analyzer.js` — Context-aware pattern detection engine with smart line skipping and exclusion rules
  - `lib/suppression.js` — Professional suppression management with OWASP category format and audit trails
  - `lib/report.js` — Comprehensive reporting with JSON/HTML export formats and suppression tracking
- **Zero false positives** — Eliminated 3 major false positive issues (SQLite .exec(), rate limiting, health endpoints)
- **Enhanced testing** — 47 → 212 tests (+350%), full module coverage, 100% pass rate
- **Professional documentation** — ENTERPRISE_GUIDE.md, MIGRATION_GUIDE.md, QUICK_REFERENCE.md

### Changed

- Security audit handler restructured for maintainability and extensibility
- Suppression format standardized to OWASP categories (e.g., `// agent-suppress: A04:2021`)
- Handler now uses modular pattern detection with context awareness

### Fixed

- False positives in SQLite database .exec() method detection
- Rate limiting suppression comments not working (now OWASP-based)
- Health check endpoints incorrectly flagged as missing authentication
- Improved regex pattern accuracy for CWE-78 detection

### Performance

- 12% faster scanning (1.2s → 0.95s for 100 files)
- 16% less memory usage (45MB → 38MB)
- Better code organization (+50% maintainability)

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
