# AI Agent Startup Protocol (MANDATORY)

> **Authority Level:** Critical
> Every AI agent operating within this project MUST follow this protocol
> before engaging with users. Non-compliance is a fatal orchestration error.

---

## 1. Scope

This protocol applies **exclusively** to AI agents (Claude, GPT, Gemini, etc.)
that operate autonomously within this runtime environment.

Human users and CI/CD pipelines follow different initialization paths (see
`.agents/QUICK_START.md` and `.agents/NEXT_STEPS.md`).

---

## 2. Five-Step Mandatory Initialization

### **Step 1: Locate `agent.yaml` Configuration**

**What to do:**
- Search for `agent.yaml` in these locations (in order):
  1. `./agent.yaml` (project root)
  2. `../agent.yaml` (parent directory)
  3. `../../agent.yaml` (grandparent directory)

**If found:**
- Load YAML file
- Parse the `agent:` block
- Extract: `id`, `role`, `authorization_level`, `skill_set`, `read_only`

**If NOT found:**
- Emit error: `ConfigurationNotFound`
- Do NOT proceed to user interaction
- Exit with code 1

**Example output (after success):**
```
✓ Located agent.yaml at: ./agent.yaml
  id: orchestrator-01
  role: Orchestrator
  authorization_level: 3
  skills: ["code-analysis", "security-audit", "refactor"]
```

---

### **Step 2: Run Compliance Check**

**What to do:**
```bash
node .agents/helpers/compliance-check.js --agent-config ./agent.yaml
```

**Expected behavior:**
- The script validates:
  - Agent identity declaration is complete (CHK-001)
  - Authorization level is valid 1|2|3 (CHK-002)
  - Read-only constraint is respected (CHK-003)
  - Declared skills exist in registry (CHK-004)
  - Read paths don't violate forbidden patterns (CHK-005)

**Exit codes:**
- `0` → All checks passed. Continue to Step 3.
- `1` → One or more checks failed. HALT immediately.

**If fails:**
- Print full error details to user
- Emit event: `STARTUP_FAILURE`
- Do NOT proceed

**Example output (success):**
```json
{
  "status": "PASSED",
  "timestamp": "2026-04-06T20:30:00Z",
  "agent_id": "orchestrator-01",
  "agent_role": "Orchestrator",
  "authorization_level": 3,
  "skills_verified": ["code-analysis", "security-audit", "refactor"],
  "checks_passed": 5,
  "checks_failed": 0
}
```

---

### **Step 3: Load Settings & Initialize Memory**

**What to do:**
- Parse `.agents/settings.json`
- Initialize memory backend (in-process by default)
- Load `ai_agent_discovery` configuration
- Load logging configuration
- Load security rules (forbidden patterns, allowed endpoints)

**Validation:**
- Verify `ai_agent_discovery.config_file` points to valid file
- Verify `security.forbidden_file_patterns` is an array
- Verify memory backend is accessible

**If successful:**
```
✓ Settings loaded
✓ Memory backend initialized (in-process)
✓ Security rules loaded
✓ Logging configured
```

---

### **Step 4: Emit `AGENT_INITIALIZED` Event**

**What to do:**
- Log a structured event to `.agents/logs/agent-*.jsonl`
- Format:
  ```json
  {
    "timestamp": "<ISO-8601>",
    "agent_id": "orchestrator-01",
    "event_type": "AGENT_INITIALIZED",
    "authorization_level": 3,
    "role": "Orchestrator",
    "skills": ["code-analysis", "security-audit", "refactor"],
    "status": "ready_for_user_interaction"
  }
  ```

---

### **Step 5: Announce Capabilities to User**

**What to do:**
Print a startup banner summarizing:
- Agent ID and role
- Authorization level (what this means)
- Available skills
- Read-only status
- Any startup warnings or notes

**Example output:**
```
╔════════════════════════════════════════════════════════════╗
║                    AGENT INITIALIZED                       ║
╠════════════════════════════════════════════════════════════╣
║  Agent ID:             orchestrator-01                     ║
║  Role:                 Orchestrator (Level 3)              ║
║  Capabilities:         ✓ Read & Write                      ║
║                        ✓ Spawn Sub-Agents                  ║
║                        ✓ Network Calls (with approval)     ║
║  Available Skills:     code-analysis, security-audit,      ║
║                        refactor                            ║
║  Memory Backend:       in-process                          ║
║  Audit Logging:        .agents/logs/agent-2026-04-06.jsonl║
╚════════════════════════════════════════════════════════════╝

Ready for user interaction. What would you like me to do?
```

---

## 3. Hard-Fail Behavior

If **ANY** of the five steps fail, the agent MUST:

1. **Stop immediately** — Do not proceed to user interaction
2. **Report the error** — Print full details including:
   - Which step failed
   - Why it failed
   - How to fix it
3. **Emit a SECURITY_VIOLATION or STARTUP_FAILURE event**
4. **Exit with code 1**

**Example failure scenarios:**

| Scenario | Step | Action |
|----------|------|--------|
| `agent.yaml` not found | 1 | HALT + "Configuration file not found in search paths" |
| Authorization level invalid | 2 | HALT + "CHK-002: Authorization level must be 1, 2, or 3" |
| Skill not in registry | 2 | HALT + "CHK-004: Skill 'my-skill' not found in registry" |
| Forbidden path in read_paths | 2 | HALT + "CHK-005: Forbidden pattern '.env' in read paths" |
| Memory backend unreachable | 3 | HALT + "Settings error: Memory backend unreachable" |

---

## 4. Configuration Discovery

The runtime searches for `agent.yaml` using this logic:

```yaml
ai_agent_discovery:
  enabled: true
  config_file: "agent.yaml"
  search_paths:
    - "./agent.yaml"           # Current directory
    - "../agent.yaml"          # Parent directory
    - "../../agent.yaml"       # Grandparent directory
  error_if_not_found: true
  startup_timeout_seconds: 30
  compliance_check_required: true
```

If `error_if_not_found: true` and file is not found:
- Agent MUST emit error
- Agent MUST NOT proceed
- Process exits with code 1

---

## 5. Expected Capabilities After Initialization

After successful startup, the agent can announce:

```
Agent Role: Observer (Level 1)
├─ filesystem_read:      YES
├─ filesystem_write:     NO
├─ memory_read:          YES
├─ memory_write:         NO
├─ spawn_sub_agent:      NO
├─ approve_network_call: NO
└─ cross_context_read:   NO

Agent Role: Executor (Level 2)
├─ filesystem_read:      YES
├─ filesystem_write:     YES
├─ memory_read:          YES
├─ memory_write:         YES
├─ spawn_sub_agent:      NO
├─ approve_network_call: NO
└─ cross_context_read:   YES

Agent Role: Orchestrator (Level 3)
├─ filesystem_read:      YES
├─ filesystem_write:     YES
├─ memory_read:          YES
├─ memory_write:         YES
├─ spawn_sub_agent:      YES
├─ approve_network_call: YES
├─ cross_context_read:   YES
├─ terminate_agents:     YES
└─ modify_pipeline_checkpoints: YES
```

---

## 6. Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `agent.yaml: no such file` | Not in search paths | Check project root, run from correct directory |
| `CHK-001: Missing required fields` | Incomplete agent config | Edit agent.yaml, add missing fields |
| `CHK-003: read_only conflict` | Contradictory settings | If read_only=true, set authorization_level=1 |
| `CHK-004: Skill not found` | Skill doesn't exist | Check .agents/skills/ for correct skill name |
| `CHK-005: Forbidden pattern` | Trying to read .env, secrets | Use allowed paths only, see forbidden_file_patterns |
| `Settings error: Memory backend unreachable` | Backend misconfiguration | Check settings.json memory config |

---

## 7. Integration with `pre-interaction.hook.js`

Before responding to any user input, the `pre-interaction.hook.js` hook verifies:

```javascript
if (!context.agent_initialized) {
  throw Error("Agent not initialized. Run startup protocol first.");
}
```

This ensures the five-step protocol completed successfully.

---

## 8. Quick Checklist for AI Agents

Before you interact with the user, verify:

- [ ] Located `agent.yaml`
- [ ] Parsed agent identity (id, role, authorization_level)
- [ ] Ran compliance check (exit code 0)
- [ ] Loaded settings.json
- [ ] Initialized memory backend
- [ ] Emitted AGENT_INITIALIZED event
- [ ] Announced capabilities to user
- [ ] Ready for user requests

---

*Schema version: 1.0.0 · Vendor-neutral · Mandatory for AI agents*
