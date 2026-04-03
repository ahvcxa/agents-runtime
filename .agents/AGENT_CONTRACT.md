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

*Schema version: 1.0.0 · Vendor-neutral · Compatible with any agent runtime*
