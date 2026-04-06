# AI Agent Guide: Best Practices & Integration

> For: Claude, GPT, Gemini, and other autonomous AI agents using agents-runtime

---

## 1. Before You Start

**Read these files in this order:**

1. `.agents/agent-startup.md` — MANDATORY initialization protocol
2. `.agents/AGENT_CONTRACT.md` — Behavioral standards and constraints
3. This file — Best practices

**Then:**
- Verify your `agent.yaml` exists in project root
- Run compliance check
- Announce capabilities to user
- Only then interact with user

---

## 2. Core Rules (Non-Negotiable)

### Rule 1: Always Initialize First

```javascript
// Pseudo-code of what you should do

// Step 1: Find config
const agentConfig = readYamlFile('./agent.yaml');
if (!agentConfig) {
  throw Error("agent.yaml not found");
}

// Step 2: Run compliance
const result = runCommand(
  'node .agents/helpers/compliance-check.js --agent-config ./agent.yaml'
);
if (result.exit_code !== 0) {
  throw Error("Compliance check failed:\n" + result.stderr);
}

// Step 3: Parse capabilities
const { id, role, authorization_level } = agentConfig.agent;

// Step 4: Announce to user
console.log(`Initialized as ${id} (${role}, Level ${authorization_level})`);

// Step 5: Ready
agent_initialized = true;
```

### Rule 2: Respect Authorization Levels

Your authorization level determines what you can do:

**Level 1 — Observer (Read-Only)**
```yaml
Allowed:
  - Read any file (except forbidden patterns)
  - Run code-analysis and security-audit skills
  - Emit domain events
  - Read memory

NOT Allowed:
  - Write/modify files
  - Run refactor skill
  - Spawn sub-agents
  - Approve network calls
```

**Level 2 — Executor (Read & Write)**
```yaml
Allowed:
  - All of Level 1
  - Write and modify files
  - Run refactor skill (create patches)
  - Access memory across contexts
  - Emit domain events

NOT Allowed:
  - Spawn sub-agents
  - Approve network calls
  - Modify pipeline checkpoints
```

**Level 3 — Orchestrator (Full Access)**
```yaml
Allowed:
  - All of Level 2
  - Spawn and terminate sub-agents
  - Approve network calls
  - Modify pipeline checkpoints
  - Manage agent lifecycle

NOT Allowed:
  - Override security hooks
  - Access forbidden file patterns
  - Bypass compliance checks
```

### Rule 3: Never Ignore SECURITY_VIOLATION Events

If you encounter a `SECURITY_VIOLATION` event:

```json
{
  "event_type": "SECURITY_VIOLATION",
  "agent_id": "your-agent-id",
  "file_path": ".env",
  "matched_pattern": ".env",
  "reason": "Forbidden file pattern"
}
```

**What to do:**
1. Stop attempting that operation
2. Explain to user why it failed
3. Suggest an alternative
4. Do NOT retry or try to bypass

**Example:**
```
❌ Cannot read .env files (security restriction)

Why: .env files contain secrets and are protected by the framework.
How to fix: Use .env.example instead, or ask the user to provide
            the values you need in a different way.
```

### Rule 4: Listen to Hooks

Before and after skill execution, hooks run:

- `pre-skill` → Validates authorization, checks distributed locks
- `post-skill` → Caches results, emits domain events

If a hook fails, the skill won't execute. This is intentional.

---

## 3. Typical Workflow

Here's what a complete interaction should look like:

```
┌─────────────────────────────────────────────────┐
│ 1. STARTUP (automatic, before user sees you)    │
├─────────────────────────────────────────────────┤
│ • Locate agent.yaml                             │
│ • Run compliance-check.js                       │
│ • Load settings.json                            │
│ • Emit AGENT_INITIALIZED event                  │
│ • Announce capabilities                         │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ 2. USER INTERACTION ENABLED                     │
├─────────────────────────────────────────────────┤
│ • pre-interaction hook verifies startup         │
│ • User asks you to do something                 │
│ • You can now process requests                  │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ 3. SKILL EXECUTION                              │
├─────────────────────────────────────────────────┤
│ • pre-skill hook runs (auth check, locks)       │
│ • Your skill executes                           │
│ • Findings/Patches generated                    │
│ • post-skill hook runs (caching, events)        │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ 4. RESULTS DELIVERY                             │
├─────────────────────────────────────────────────┤
│ • Structured findings/patches                   │
│ • Domain events emitted                         │
│ • Audit trail updated                           │
│ • User sees results                             │
└─────────────────────────────────────────────────┘
```

---

## 4. Using Each Skill

### Skill: code-analysis

**What it does:** Analyzes code for complexity, DRY violations, security patterns, SOLID issues, cognitive complexity.

**Authorization required:** Level 1 (Observer)

**Output:** `Finding[]` — array of findings with `severity`, `file`, `line_start`, `line_end`, `message`, `recommendation`

**How to use:**
```bash
node bin/agents.js run \
  --config agent.yaml \
  --skill code-analysis \
  --input '{"files":["src/"],"project_root":"."}'
```

**Example output:**
```json
{
  "findings": [
    {
      "id": "abc-123",
      "skill": "code-analysis",
      "principle": "Cyclomatic Complexity",
      "severity": "HIGH",
      "file": "src/auth.ts",
      "line_start": 45,
      "line_end": 120,
      "symbol": "validateUser",
      "message": "Function exceeds cyclomatic complexity threshold (CC=18, threshold=10)",
      "recommendation": "Extract nested conditionals into separate functions",
      "auto_fixable": false
    }
  ]
}
```

---

### Skill: security-audit

**What it does:** Deep security audit aligned with OWASP Top 10 (2021).

**Authorization required:** Level 1 (Observer)

**Output:** `Finding[]` — findings with `owasp_category` field populated

**How to use:**
```bash
node bin/agents.js run \
  --config agent.yaml \
  --skill security-audit \
  --input '{"files":["src/"],"project_root":"."}'
```

**Covers all 10 OWASP categories:**
- A01:2021 — Broken Access Control
- A02:2021 — Cryptographic Failures
- A03:2021 — Injection
- A04:2021 — Insecure Design
- A05:2021 — Security Misconfiguration
- A06:2021 — Vulnerable Components
- A07:2021 — Authentication Failures
- A08:2021 — Software Integrity Failures
- A09:2021 — Logging & Monitoring Failures
- A10:2021 — SSRF

**Example output:**
```json
{
  "findings": [
    {
      "id": "xyz-789",
      "skill": "security-audit",
      "severity": "CRITICAL",
      "file": "src/api.ts",
      "line_start": 67,
      "symbol": "queryDatabase",
      "message": "SQL injection vulnerability: user input concatenated into SQL query",
      "recommendation": "Use parameterized queries or ORM with prepared statements",
      "cwe_id": "CWE-89",
      "owasp_category": "A03:2021",
      "auto_fixable": false
    }
  ]
}
```

---

### Skill: refactor

**What it does:** Creates unified diff patches for auto-fixable findings.

**Authorization required:** Level 2 (Executor)

**Prerequisites:**
- Must have `code-analysis` or `security-audit` findings with `auto_fixable: true`
- Patches are NOT applied automatically — always require review

**Output:** `Patch[]` — unified diffs with metadata

**How to use:**
```bash
node bin/agents.js run \
  --config agent.yaml \
  --skill refactor \
  --input '{
    "findings": [...],
    "project_root": "."
  }'
```

**Example output:**
```json
{
  "patches": [
    {
      "id": "patch-001",
      "finding_id": "abc-123",
      "skill": "refactor",
      "status": "proposed",
      "diff": "--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -45,10 +45,8 @@\n...",
      "files_modified": ["src/auth.ts"],
      "behavior_change": false,
      "created_at": "2026-04-06T20:30:00Z"
    }
  ]
}
```

---

## 5. Handling Errors & Edge Cases

### Case 1: File Not Found

```javascript
// If you try to read a file that doesn't exist
Error: ENOENT: no such file or directory, open 'src/missing.js'

// What to do:
→ Check the file path
→ List directory contents
→ Tell user the path is wrong
→ Ask for clarification
```

### Case 2: Forbidden File Pattern

```json
{
  "event_type": "SECURITY_VIOLATION",
  "agent_id": "your-agent",
  "file_path": ".env",
  "matched_pattern": ".env"
}

// What to do:
→ Stop trying to read .env
→ Offer alternative: read .env.example instead
→ Explain the security restriction
```

### Case 3: Authorization Denied

```javascript
// If you try refactor (level 2) but you're level 1:
Error: CHK-003: read_only agents cannot run level-2 skills

// What to do:
→ Explain your limitation to user
→ Suggest what a level-2 agent could do
→ Ask user to enable higher privileges if needed
```

### Case 4: Compliance Check Failed

```json
{
  "status": "FAILED",
  "checks_failed": 1,
  "details": [
    {
      "id": "CHK-004",
      "pass": false,
      "detail": "Skill 'my-skill' not found in .agents/skills/ registry"
    }
  ]
}

// What to do:
→ Agent MUST HALT
→ Do NOT proceed to user interaction
→ Report the error with full details
→ Ask user to fix agent.yaml
```

---

## 6. Troubleshooting Checklist

| Symptom | Check | Fix |
|---------|-------|-----|
| "agent.yaml not found" | Current directory, parent directory | Ensure agent.yaml is in project root |
| "Compliance check failed" | Error details | Fix agent.yaml (missing fields, bad skills, etc.) |
| "SECURITY_VIOLATION" | Forbidden pattern | Read from allowed paths only |
| "Authorization denied" | Your authorization_level | Request higher level or find alternative approach |
| "File not found" | Path is correct | Check if file exists, verify path |
| "Memory unreachable" | Settings.json memory config | Restart, check backend service |
| Skill doesn't run | Pre-skill hook logs | Check compliance, authorization, input format |

---

## 7. Logging & Audit Trail

All your operations are logged to `.agents/logs/agent-*.jsonl`

**Log entry format:**
```json
{
  "timestamp": "2026-04-06T20:30:00Z",
  "agent_id": "orchestrator-01",
  "event_type": "SKILL_START | SKILL_END | ERROR | SECURITY_VIOLATION",
  "payload": {
    "skill_id": "code-analysis",
    "input_files": 5,
    "findings_count": 12,
    "duration_ms": 1234
  }
}
```

**Your agent_id is logged in every entry.** This helps with:
- Debugging what your agent did
- Audit compliance
- Performance monitoring

---

## 8. Quick Reference Commands

```bash
# Check agent configuration
node .agents/helpers/compliance-check.js --agent-config ./agent.yaml

# Run code analysis
node bin/agents.js run \
  --config agent.yaml \
  --skill code-analysis \
  --input '{"files":["src/"]}'

# Run security audit
node bin/agents.js run \
  --config agent.yaml \
  --skill security-audit \
  --input '{"files":["src/"]}'

# Generate refactor patches
node bin/agents.js run \
  --config agent.yaml \
  --skill refactor \
  --input '{"findings":[...]}'

# Watch logs in real-time
tail -f .agents/logs/agent-*.jsonl | jq .
```

---

## 9. Integration Patterns

### Pattern 1: Analysis → Report

```javascript
// Step 1: Run analysis
const findings = await runSkill('code-analysis', { files: ['src/'] });

// Step 2: Filter by severity
const criticalFindings = findings.filter(f => f.severity === 'CRITICAL');

// Step 3: Report to user
console.log(`Found ${criticalFindings.length} critical issues`);
criticalFindings.forEach(f => {
  console.log(`  • ${f.file}:${f.line_start} - ${f.message}`);
});
```

### Pattern 2: Analysis → Refactor → Review

```javascript
// Step 1: Run analysis
const findings = await runSkill('code-analysis', { files: ['src/'] });

// Step 2: Filter auto-fixable
const fixable = findings.filter(f => f.auto_fixable);

// Step 3: Generate patches
const patches = await runSkill('refactor', { findings: fixable });

// Step 4: Show to user for review
console.log('Generated patches:');
patches.forEach(p => {
  console.log(`\n--- ${p.files_modified[0]} ---`);
  console.log(p.diff);
});

// Step 5: Wait for user approval
// → apply patches only if user says yes
```

### Pattern 3: Continuous Security Monitoring

```javascript
// Run security audit on every code change
const findings = await runSkill('security-audit', { 
  files: changedFiles 
});

// Fail CI/CD if critical findings
if (findings.some(f => f.severity === 'CRITICAL')) {
  process.exit(1);
}
```

---

## 10. Common Questions

### Q: Can I read `.env` files?
**A:** No. Forbidden patterns are enforced at the framework level. Use `.env.example` instead.

### Q: Can I spawn sub-agents?
**A:** Only if you're Orchestrator (Level 3). Check your `authorization_level` in `agent.yaml`.

### Q: Can I make network calls?
**A:** Only if you're Level 3 and the endpoint is in `allowed_endpoints` list.

### Q: What if compliance check fails?
**A:** Agent MUST NOT proceed. Fix the error in `agent.yaml` and try again.

### Q: How do I know my skills are available?
**A:** After initialization, you'll see the list. Or check `.agents/skills/` directory.

### Q: Can I modify files?
**A:** Only if you're Level 2 or 3. Level 1 (Observer) is read-only.

### Q: What's the difference between a Finding and a Patch?
**A:** Finding = a problem detected by analysis. Patch = a proposed fix generated by refactor skill.

---

## 11. Getting Help

- **Startup issues:** See `.agents/agent-startup.md`
- **Behavioral rules:** See `.agents/AGENT_CONTRACT.md`
- **Skill details:** See `.agents/skills/*/SKILL.md`
- **Runtime logs:** Check `.agents/logs/agent-*.jsonl`
- **Examples:** Check `/examples/` directory

---

*Last updated: 2026-04-06 · For agents-runtime v1.0.0+*
