---
id: security-audit
version: 1.0.0
authorization_required_level: 1
bounded_context: Analysis
aggregate_root: CodeUnit
output_event: SecurityAuditCompleted
output_schema: Finding[]
read_only: true
handler: .agents/security-audit/handler.js
---


# SKILL: Security Audit

Deep security audit aligned with **OWASP Top 10**.
Complements `code-analysis` with thorough, context-aware security analysis.

This skill is **read-only**. It MUST NOT modify any source file.

---

## Activation

```yaml
agent:
  id: "security-auditor-01"
  skill_set:
    - "security-audit"
  authorization_level: 1
  read_only: true
```

---

## OWASP Top 10 Coverage

| # | Category | Key Checks |
|---|----------|-----------|
| A01:2021 | Broken Access Control | Missing auth middleware, privilege escalation, CORS misconfiguration |
| A02:2021 | Cryptographic Failures | No TLS enforcement, plaintext sensitive data, weak key sizes |
| A03:2021 | Injection | SQL, NoSQL, OS command, LDAP, XPath, template, log injection |
| A04:2021 | Insecure Design | Missing rate limiting, no account lockout, mass assignment vulnerabilities |
| A05:2021 | Security Misconfiguration | Debug mode in prod, default credentials, verbose error messages |
| A06:2021 | Vulnerable Components | CVE cross-reference, EOL runtime versions |
| A07:2021 | Auth Failures | Weak password policy, low-entropy session tokens, missing MFA |
| A08:2021 | Software Integrity | Missing SRI on CDN scripts, unsafe deserialization, no checksum in CI/CD |
| A09:2021 | Security Logging Failures | No auth audit logs, no tamper-evident controls, no failed-login alerting |
| A10:2021 | SSRF | User-controlled URLs passed to HTTP clients without allowlist |

---

## Output Contract

Uses the same `Finding` interface as `code-analysis`.
The `owasp_category` field MUST be populated for all findings.

## Suppression

```
// agent-suppress: <suppression_key> reason="<justification>"
```

---

*Schema version: 1.0.0 · Vendor-neutral*
