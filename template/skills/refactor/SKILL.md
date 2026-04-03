---
id: refactor
version: 1.0.0
authorization_required_level: 2
bounded_context: Transformation
aggregate_root: Refactoring
output_event: RefactoringProposed
output_schema: Patch[]
read_only: false
handler: .agents/skills/refactor/handler.js
---


# SKILL: Refactor

Consumes `Finding` events where `auto_fixable: true` and produces safe,
reviewable unified diff patches.

**Patches MUST NOT be applied autonomously** — all patches must be reviewed
and approved before application.

---

## Activation

```yaml
agent:
  id: "refactor-agent-01"
  skill_set:
    - "refactor"
  authorization_level: 2
  read_only: false
```

---

## Patch Generation Rules

| Rule | Description |
|------|-------------|
| Minimal Diff | Smallest possible change that resolves the finding |
| No Behavior Change | Semantically equivalent unless a security fix requires it (must be documented) |
| Test Preservation | MUST NOT break existing tests; test changes must be in same diff |
| One Finding, One Patch | Each patch addresses exactly one `Finding.id` |

---

## Output Contract

```typescript
interface Patch {
  id: string;                    // uuid-v4
  finding_id: string;            // ID of the Finding being addressed
  skill: "refactor";
  status: "proposed" | "approved" | "rejected" | "applied";
  diff: string;                  // Unified diff format
  files_modified: string[];
  behavior_change: boolean;
  behavior_change_reason?: string;
  created_at: string;            // ISO-8601
  approved_by?: string;
}
```

## Suppression

If a finding is suppressed via `// agent-suppress`, this skill MUST NOT
generate a patch for it.

---

*Schema version: 1.0.0 · Vendor-neutral*
