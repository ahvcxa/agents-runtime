# AGENT_CONTRACT.md — Autonomous Agent Behavioral Standards

> **Authority Level:** Root Configuration
> All agents operating within this project MUST comply with every directive
> defined in this document. Violations are treated as fatal orchestration errors.
>
> **Runtime Discovery:** Agents should locate this file via `.agents/manifest.json`
> under the `entry_points.contract` key.

---

## 1. Purpose & Scope

This file defines the **canonical behavioral contract** for every autonomous agent,
sub-agent, and orchestrated process that operates within this repository.
It is vendor-neutral and compatible with any agent runtime (GPT, Gemini, Claude,
LLaMA, custom systems, etc.).

Single source of truth for:
- Structural and behavioral standards
- Security constraints and forbidden operations
- Domain boundary enforcement (DDD)
- Inter-agent communication protocols

Any agent that cannot locate or parse this file **must halt and emit a
configuration error** rather than proceed with undefined behavior.

---

## 2. Architectural Standards

### 2.1 Agent Identity & Role Declaration

Every agent MUST declare its identity at initialization using the following contract.
The canonical schema is defined in `.agents/manifest.json` under `agent_identity_schema`.

```yaml
agent:
  id: "<unique-slug>"           # e.g. "code-reviewer-01" (lowercase, hyphens/underscores only)
  role: "Observer"              # Observer | Executor | Orchestrator
  skill_set:
    - "<skill-id>"              # Must reference a valid .agents/skills/ entry
  authorization_level: 1        # 1=Observer, 2=Executor, 3=Orchestrator
  read_only: true               # Agents performing analysis SHOULD be read-only
```

### 2.2 Determinism Principle

Agents MUST produce deterministic, repeatable outputs for identical inputs and
environment states. Non-deterministic behavior MUST be explicitly declared in
the agent's skill manifest.

### 2.3 Minimal Footprint

Agents MUST operate with the least privilege required to complete their task:
- Request only the filesystem paths their skill explicitly requires
- Release memory locks and file handles immediately after use
- Never spawn sub-processes outside the declared `execution_context`

### 2.4 Observability Contract

Every agent MUST emit structured log entries to the path defined in
`.agents/settings.json` under `logging.output_path`. Log entries MUST include:

```json
{
  "timestamp": "<ISO-8601>",
  "agent_id":  "<string>",
  "event_type": "SKILL_START | SKILL_END | HOOK_FIRE | ERROR | AUDIT",
  "payload":   {}
}
```

---

## 3. Security Constraints

> **CRITICAL — NON-NEGOTIABLE**
> These constraints are enforced at the framework level. Any agent that attempts
> to bypass them MUST be immediately terminated and the incident logged as a
> `SECURITY_VIOLATION`.

### 3.1 Forbidden File Patterns

Agents are **strictly prohibited** from reading, writing, or referencing any file
matching the patterns defined in `.agents/settings.json` under
`security.forbidden_file_patterns`. The canonical list includes:

```
.env  ·  .env.*  ·  *.env  ·  secrets/  ·  **/secrets/**
credentials/  ·  **/credentials/**  ·  *.pem  ·  *.key  ·  *.p12
*.pfx  ·  *.keystore  ·  id_rsa  ·  id_ed25519  ·  *.secret
config/database.yml  ·  config/master.key
```

**Enforcement:** `.agents/hooks/pre-read.hook.js` MUST validate every file path
against this blocklist before any read operation is permitted.

### 3.2 Network Isolation

Agents MUST NOT initiate outbound network connections unless:
1. The target URL is declared in `.agents/settings.json` under `security.allowed_endpoints`
2. The connection is approved by an agent with `authorization_level >= 2`

### 3.3 Credential Injection Prohibition

Agents MUST NOT accept credentials via command-line arguments, environment
variable sweeps, or inline string literals in skill definitions.
All credential access is delegated to the designated **Secrets Broker** service.

### 3.4 Audit Trail

Every security-sensitive operation MUST produce an immutable audit entry.
Audit entries cannot be deleted or modified by any agent, regardless of
authorization level.

---

## 4. Domain-Driven Design (DDD) Enforcement

### 4.1 Bounded Context Map

```
┌──────────────────────────────┬───────────────────────────────┐
│  CONTEXT: Analysis           │  CONTEXT: Transformation      │
│  Aggregate Root: CodeUnit    │  Aggregate Root: Refactoring  │
│  Entities: Function, Class   │  Entities: Edit, Patch        │
│  Value Objects: Metric,      │  Value Objects: DiffHunk,     │
│                Complexity    │                ChangeSet      │
├──────────────────────────────┼───────────────────────────────┤
│  CONTEXT: Orchestration      │  CONTEXT: Reporting           │
│  Aggregate Root: Pipeline    │  Aggregate Root: Report       │
│  Entities: Agent, Task       │  Entities: Finding, Severity  │
│  Value Objects: Status,      │  Value Objects: Score,        │
│                Priority      │                Recommendation │
└──────────────────────────────┴───────────────────────────────┘
```

### 4.2 Context Crossing Rules

- Cross-context communication MUST use published **Domain Events**
  (e.g. `AnalysisCompleted`, `RefactoringProposed`)
- Agents MUST NOT hold direct references to aggregate roots from foreign contexts
- Anti-corruption layers MUST be implemented at every context boundary

---

## 5. Cross-Agent Communication Protocol

### 5.1 Message Contract

All inter-agent messages MUST conform to:

```json
{
  "message_id":      "<uuid-v4>",
  "from":            "<agent-id>",
  "to":              "<agent-id | broadcast>",
  "context_boundary":"<bounded-context-name>",
  "event_type":      "<DomainEvent>",
  "schema_version":  "1.0",
  "payload":         {},
  "timestamp":       "<ISO-8601>",
  "ttl_seconds":     300
}
```

### 5.2 Idempotency

All agent operations exposed as message handlers MUST be idempotent.
Duplicate message delivery MUST NOT cause duplicate state mutations.

### 5.3 Authorization Hierarchy

| Level | Role          | Capabilities |
|-------|---------------|-------------|
| `1`   | Observer      | Read-only, emit events, no mutations |
| `2`   | Executor      | Read + write within own bounded context |
| `3`   | Orchestrator  | Spawn sub-agents, cross-context coordination, approve network calls |

---

## 6. Skill System Integration

Agents load capabilities exclusively from `.agents/skills/`. Skill discovery
is defined in `.agents/manifest.json` under the `skills` array.

- Skill loading is lazy by default
- Failed skill initialization MUST cause graceful degradation, not pipeline crash
- Skill versioning follows semantic versioning (`MAJOR.MINOR.PATCH`)

---

## 7. Suppression Protocol

To suppress a specific finding, add an inline comment in the following format:

```
// agent-suppress: <suppression_key> reason="<justification>"
```

Suppressed findings MUST still be logged at `INFO` level. They MUST NOT be
silently dropped.

---

## 8. Compliance Verification

At startup, every agent MUST run `.agents/helpers/compliance-check.js`, which validates:

1. Agent identity declaration is complete
2. No forbidden file patterns in the agent's declared read paths
3. Authorization level is consistent with the assigned role
4. All declared skills exist and are parseable

**Failure of any compliance check = agent MUST NOT proceed.**

---

## 9. AI Agent Initialization Protocol (MANDATORY for AI-based agents)

> **Scope:** This section applies exclusively to AI agents (Claude, GPT, Gemini, etc.)
> that operate autonomously within this runtime.
>
> Human users and CI/CD pipelines follow different initialization paths.

### 9.1 Five-Step Mandatory Initialization

Every AI agent MUST complete the following sequence BEFORE engaging with users:

**Step 1: Locate Configuration**
- Search for `agent.yaml` in: `./` → `../` → `../../`
- If not found → **HALT with error**, exit code 1
- Parse YAML → extract `id`, `role`, `authorization_level`, `skill_set`

**Step 2: Run Compliance Check**
- Execute: `node .agents/helpers/compliance-check.js --agent-config ./agent.yaml`
- Expected exit code: `0` (success) or `1` (failure)
- If fails → **HALT with detailed error output**
- Validate:
  - Agent identity declaration is complete
  - Authorization level is valid (1, 2, or 3)
  - Declared skills exist in registry
  - Read paths don't violate forbidden patterns

**Step 3: Load Settings & Initialize Memory**
- Parse `.agents/settings.json`
- Initialize memory backend (in-process by default)
- Load `ai_agent_discovery` configuration
- Load security rules and logging configuration

**Step 4: Emit `AGENT_INITIALIZED` Event**
- Log structured event: `{ event_type: "AGENT_INITIALIZED", agent_id, authorization_level, timestamp }`
- Update internal state: `agent_initialized = true`

**Step 5: Announce Capabilities**
- Print startup banner with:
  - Agent ID and role
  - Authorization level and what it means
  - Available skills
  - Any startup warnings

### 9.2 Hard-Fail Behavior

If **ANY** step fails:

1. **Stop immediately** — Do not proceed to user interaction
2. **Report error** — Print full details with debugging hints
3. **Emit event** — Log `SECURITY_VIOLATION` or `STARTUP_FAILURE`
4. **Exit code 1** — Non-zero exit code

| Scenario | Action |
|----------|--------|
| `agent.yaml` not found | HALT + "Config file not found in search paths" |
| Compliance check fails | HALT + Show all failed checks with details |
| Forbidden path in read_paths | HALT + "Security: forbidden pattern in paths" |
| Memory backend unreachable | HALT + "Backend configuration error" |

### 9.3 Configuration Discovery

Search paths for `agent.yaml`:

```json
{
  "search_paths": [
    "./agent.yaml",      // Current directory
    "../agent.yaml",     // Parent directory
    "../../agent.yaml"   // Grandparent directory
  ],
  "error_if_not_found": true,
  "startup_timeout_seconds": 30
}
```

If `error_if_not_found: true` and file is not found → agent MUST emit error and HALT.

### 9.4 Pre-Interaction Hook

Before responding to any user input, the `pre-interaction.hook.js` hook verifies:

```javascript
if (!context.initialized) {
  throw Error("Agent not initialized. Startup protocol must complete first.");
}
```

This is **non-bypassable**. No user interaction is allowed until startup completes.

### 9.5 Expected Capabilities After Init

After successful startup, agent can announce:

```
Role: Observer (Level 1)
├─ Read files: YES
├─ Write files: NO
├─ Read memory: YES
├─ Write memory: NO
└─ Spawn sub-agents: NO

Role: Executor (Level 2)
├─ Read files: YES
├─ Write files: YES
├─ Read memory: YES
├─ Write memory: YES
└─ Spawn sub-agents: NO

Role: Orchestrator (Level 3)
├─ Read files: YES
├─ Write files: YES
├─ Read memory: YES
├─ Write memory: YES
├─ Spawn sub-agents: YES
├─ Approve network calls: YES
└─ Modify pipeline checkpoints: YES
```

### 9.6 Documentation & References

- **Startup protocol:** `.agents/agent-startup.md`
- **Best practices:** `.agents/AI_AGENT_GUIDE.md`
- **Configuration:** `agent.yaml` (project root)
- **Compliance checks:** `.agents/helpers/compliance-check.js`

---

*Schema version: 1.0.0 · Vendor-neutral · Mandatory for AI agents*
