---
id: code-analysis
version: 1.2.0
authorization_required_level: 1
bounded_context: Analysis
aggregate_root: CodeUnit
output_event: AnalysisCompleted
output_schema: Finding[]
read_only: true
handler: .agents/code-analysis/handler.js
---


# SKILL: Code Analysis

This skill performs static, structural, and semantic analysis of source code.
It produces machine-readable `Finding` objects emitted as domain events into
the shared memory bus.

This skill is **read-only**. It MUST NOT modify any source file.

---

## Activation

```yaml
agent:
  id: "static-analyzer-01"
  skill_set:
    - "code-analysis"
  authorization_level: 1
  read_only: true
```

---

## Analytical Principles

### Principle 1 — Cyclomatic Complexity (CC)

**Thresholds:**

| CC Score | Classification | Required Action |
|----------|---------------|-----------------|
| 1 – 5    | Simple        | No action required |
| 6 – 10   | Moderate      | Document with `@complexity` annotation |
| 11 – 20  | Complex       | Emit `Finding(severity=HIGH)`, suggest decomposition |
| > 20     | Unmaintainable| Emit `Finding(severity=CRITICAL)` |

```
CC = 1 + (number of decision points: if / else if / for / while / do / case / catch / && / || / ternary)
```

---

### Principle 2 — DRY (Don't Repeat Yourself)

| Duplication Type | Severity | Recommended Refactoring |
|------------------|----------|-------------------------|
| Structural clone (> 10 lines) | HIGH | Extract shared function |
| Structural clone (5–10 lines) | MEDIUM | Extract or parameterize |
| Magic string/number (> 2 uses) | MEDIUM | Extract to named constant |
| Semantic clone | LOW | Document relationship |
| Interface overlap > 80% | MEDIUM | Evaluate extension or composition |

---

### Principle 3 — Security-First Auditing

**Mandatory checks in every run:**

- **3a. Injection:** SQL, shell, template, path traversal, XSS vectors → `CRITICAL`
- **3b. Insecure Deserialization:** `eval()`, `pickle.loads()`, `YAML.load()` without safe loader → `CRITICAL`
- **3c. Hardcoded Secrets:**
  ```regex
  (api[_-]?key|secret|password|token|bearer|auth)["\\s]*[:=]["\\s]*[A-Za-z0-9+/=_\\-]{8,}
  ```
  → `CRITICAL`, also emit `SECURITY_VIOLATION` audit event
- **3d. Broken Access Control:** Auth checks missing or performed after operation → `HIGH`
- **3e. Cryptographic Weakness:** MD5/SHA1 for passwords, DES/ECB, `Math.random()` in security contexts → `HIGH`
- **3f. Vulnerable Dependencies:** CVEs in last 12 months, EOL versions → `MEDIUM`–`CRITICAL`

---

### Principle 4 — SOLID Adherence

| Principle | Violation Signal | Severity |
|-----------|-----------------|----------|
| Single Responsibility | Class > 2 responsibilities OR > 500 LoC | MEDIUM |
| Open/Closed | `switch`/`if-else` type dispatch with > 4 branches | MEDIUM |
| Liskov Substitution | Override throws `NotImplementedException` | HIGH |
| Interface Segregation | Interface > 7 methods, implementors stub > 30% | MEDIUM |
| Dependency Inversion | Direct `new ConcreteClass()` in business logic | LOW |

---

### Principle 5 — Cognitive Complexity

**Threshold:** > 15 → emit `Finding(severity=MEDIUM)`.

---

## Output Contract

```typescript
interface Finding {
  id: string;                    // uuid-v4
  skill: "code-analysis";
  principle: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  file: string;                  // Relative path from project root
  line_start: number;
  line_end: number;
  symbol?: string;
  message: string;
  recommendation: string;
  cwe_id?: string;
  owasp_category?: string;
  auto_fixable: boolean;
  suppression_key?: string;
}
```

## Suppression

```
// agent-suppress: <suppression_key> reason="<justification>"
```

Suppressed findings MUST be logged at `INFO` level. Never silently dropped.

---

*Schema version: 1.2.0 · Vendor-neutral*
