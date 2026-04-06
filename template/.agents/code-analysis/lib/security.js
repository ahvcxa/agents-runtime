"use strict";
/**
 * Security analyzer — extracted from handler.js
 */

const SECURITY_RULES = [
  {
    pattern: /exec\s*\(|execSync\s*\(|spawn\s*\(/,
    message: "Potential OS command injection via child_process",
    recommendation: "Validate and sanitize all user input before passing to shell. Use execFile() with arg arrays.",
    severity: "CRITICAL", principle: "Security — Injection", cwe_id: "CWE-78", owasp: "A03:2021",
  },
  {
    pattern: /query\s*\([^)]*\+|query\s*\([^)]*template|query\s*\(`[^`]*\${/,
    message: "Potential SQL injection via string concatenation in query",
    recommendation: "Use parameterized queries or prepared statements",
    severity: "CRITICAL", principle: "Security — Injection", cwe_id: "CWE-89", owasp: "A03:2021",
  },
  {
    pattern: /innerHTML\s*=|document\.write\s*\(|\.html\s*\([^)]*req\./,
    message: "Potential XSS via unsafe DOM manipulation",
    recommendation: "Use textContent or sanitize HTML with a trusted library (DOMPurify)",
    severity: "CRITICAL", principle: "Security — Injection", cwe_id: "CWE-79", owasp: "A03:2021",
  },
  {
    pattern: /\beval\s*\(/,
    message: "Use of eval() — code injection risk",
    recommendation: "Eliminate eval(). Use JSON.parse() for data, or a safe expression evaluator.",
    severity: "CRITICAL", principle: "Security — Insecure Deserialization", cwe_id: "CWE-95", owasp: "A08:2021",
  },
  {
    pattern: /new Function\s*\(/,
    message: "Dynamic code generation via new Function()",
    recommendation: "Avoid new Function() with user-controlled input. Use a safe allow-listed evaluator.",
    severity: "CRITICAL", principle: "Security — Insecure Deserialization", cwe_id: "CWE-95", owasp: "A08:2021",
  },
  {
    pattern: /(?:api[_-]?key|secret|password|token|bearer|auth(?:orization)?)\s*[:=]\s*['"`][A-Za-z0-9+/=_\-]{8,}/i,
    message: "Hardcoded secret/credential detected",
    recommendation: "Move credential to environment variable or secrets manager. Never hardcode in source.",
    severity: "CRITICAL", principle: "Security — Hardcoded Secrets", cwe_id: "CWE-798", owasp: "A02:2021",
  },
  {
    pattern: /createHash\s*\(\s*['"]md5['"]\s*\)|createHash\s*\(\s*['"]sha1['"]\s*\)/,
    message: "Weak hash algorithm (MD5/SHA1) — not suitable for security-sensitive operations",
    recommendation: "Use SHA-256 or SHA-3 via crypto.createHash('sha256'). For passwords use bcrypt/argon2.",
    severity: "HIGH", principle: "Security — Cryptographic Weakness", cwe_id: "CWE-327", owasp: "A02:2021",
  },
  {
    pattern: /Math\.random\s*\(\)/,
    message: "Math.random() used — not cryptographically secure",
    recommendation: "Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive randomness.",
    severity: "HIGH", principle: "Security — Cryptographic Weakness", cwe_id: "CWE-338", owasp: "A02:2021",
  },
  {
    pattern: /readFile(?:Sync)?\s*\([^)]*(?:req\.|params\.|query\.)/,
    message: "Potential path traversal — file path derived from user input",
    recommendation: "Validate and normalize paths. Use path.resolve() and confirm the result is within expected directory.",
    severity: "CRITICAL", principle: "Security — Injection", cwe_id: "CWE-22", owasp: "A01:2021",
  },
];

function analyzeSecurity(lines, relPath, findings, finding) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    for (const rule of SECURITY_RULES) {
      if (rule.pattern.test(line)) {
        findings.push(finding({
          principle:      rule.principle,
          severity:       rule.severity,
          file:           relPath,
          line_start:     i + 1,
          line_end:       i + 1,
          message:        rule.message,
          recommendation: rule.recommendation,
          cwe_id:         rule.cwe_id,
          owasp_category: rule.owasp,
          auto_fixable:   false,
        }));
      }
    }
  }
}

module.exports = { analyzeSecurity };
