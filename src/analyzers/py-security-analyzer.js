"use strict";
/**
 * src/analyzers/py-security-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Security analyzer for Python (OWASP Top 10)
 */

const { finding } = require("./py-common");

const PY_SECURITY_RULES = [
  // Injection
  { pattern: /subprocess\.(call|run|Popen|check_output)\s*\([^)]*shell\s*=\s*True/,
    msg: "subprocess called with shell=True — OS command injection risk",
    rec: "Remove shell=True. Pass command as a list: subprocess.run(['cmd', 'arg'])",
    sev: "CRITICAL", cwe: "CWE-78", owasp: "A03:2021" },
  { pattern: /os\.system\s*\(|os\.popen\s*\(/,
    msg: "os.system()/os.popen() — OS command injection risk",
    rec: "Use subprocess.run() with a list of arguments, never a shell string",
    sev: "CRITICAL", cwe: "CWE-78", owasp: "A03:2021" },
  { pattern: /execute\s*\([^)]*%\s*|execute\s*\([^)]*\.format\s*\(|execute\s*\(f['"]/,
    msg: "SQL query built with string formatting — SQL injection risk",
    rec: "Use parameterized queries: cursor.execute('SELECT * FROM t WHERE id=%s', (val,))",
    sev: "CRITICAL", cwe: "CWE-89", owasp: "A03:2021" },

  // Insecure deserialization
  { pattern: /\beval\s*\(/,
    msg: "eval() usage — arbitrary code execution risk",
    rec: "Eliminate eval(). Use ast.literal_eval() for safe expression parsing",
    sev: "CRITICAL", cwe: "CWE-95", owasp: "A08:2021" },
  { pattern: /pickle\.loads?\s*\(|pickle\.load\s*\(/,
    msg: "pickle.load/loads() — insecure deserialization, can execute arbitrary code",
    rec: "Never unpickle data from untrusted sources. Use JSON or MessagePack instead.",
    sev: "CRITICAL", cwe: "CWE-502", owasp: "A08:2021" },
  { pattern: /yaml\.load\s*\([^)]*(?!Loader\s*=\s*yaml\.(?:SafeLoader|BaseLoader))/,
    msg: "yaml.load() without SafeLoader — code execution risk",
    rec: "Use yaml.safe_load() or yaml.load(data, Loader=yaml.SafeLoader)",
    sev: "CRITICAL", cwe: "CWE-502", owasp: "A08:2021" },
  { pattern: /jsonpickle\.decode\s*\(/,
    msg: "jsonpickle.decode() — insecure deserialization",
    rec: "Avoid jsonpickle for untrusted data. Use json.loads() with a schema validator.",
    sev: "CRITICAL", cwe: "CWE-502", owasp: "A08:2021" },

  // Hardcoded secrets
  { pattern: /(?:api[_-]?key|secret|password|token|bearer|auth)\s*=\s*['"][A-Za-z0-9+/=_\-]{8,}/i,
    msg: "Hardcoded credential detected",
    rec: "Move to environment variable: os.environ.get('SECRET_KEY') or use python-dotenv",
    sev: "CRITICAL", cwe: "CWE-798", owasp: "A02:2021" },

  // Cryptographic weakness
  { pattern: /hashlib\.(?:md5|sha1)\s*\(/,
    msg: "Weak hash algorithm (MD5/SHA1) used",
    rec: "For passwords use bcrypt/argon2. For integrity use hashlib.sha256()",
    sev: "HIGH", cwe: "CWE-327", owasp: "A02:2021" },
  { pattern: /random\.(?:random|randint|choice|shuffle)\s*\(/,
    msg: "random module used — not cryptographically secure",
    rec: "For security-sensitive operations use secrets module: secrets.token_hex()",
    sev: "HIGH", cwe: "CWE-338", owasp: "A02:2021" },
  { pattern: /DES|RC4|Blowfish|AES\.MODE_ECB/,
    msg: "Weak or deprecated cipher algorithm in use",
    rec: "Use AES-256-GCM via cryptography library: Fernet or AESGCM",
    sev: "CRITICAL", cwe: "CWE-327", owasp: "A02:2021" },

  // Path traversal
  { pattern: /open\s*\([^)]*(?:request\.|args\.|kwargs\.|getenv|environ\[)/,
    msg: "File opened with user-controlled path — path traversal risk",
    rec: "Use pathlib.Path(base_dir, user_path).resolve() and verify it's within base_dir",
    sev: "CRITICAL", cwe: "CWE-22", owasp: "A01:2021" },

  // Debug / config
  { pattern: /DEBUG\s*=\s*True/,
    msg: "DEBUG=True in source code — exposes stack traces in production",
    rec: "Use environment variable: DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'",
    sev: "MEDIUM", cwe: "CWE-16", owasp: "A05:2021" },
  { pattern: /app\.run\s*\([^)]*debug\s*=\s*True/,
    msg: "Flask app running with debug=True — never enable in production",
    rec: "Set debug from environment: app.run(debug=os.environ.get('FLASK_DEBUG', '0') == '1')",
    sev: "HIGH", cwe: "CWE-16", owasp: "A05:2021" },

  // SSRF
  { pattern: /requests\.(get|post|put|delete|head)\s*\([^)]*(?:request\.|args\.|kwargs\.)/,
    msg: "HTTP request made with user-controlled URL — SSRF risk",
    rec: "Validate URLs against an allow-list of permitted hosts before making requests",
    sev: "CRITICAL", cwe: "CWE-918", owasp: "A10:2021" },

  // Authentication
  { pattern: /(?:password|passwd)\s*==\s*|==\s*(?:request\.|data\.).*(?:password|passwd)/i,
    msg: "Plaintext password comparison",
    rec: "Use bcrypt.checkpw() or werkzeug.security.check_password_hash()",
    sev: "CRITICAL", cwe: "CWE-522", owasp: "A07:2021" },
  { pattern: /md5\s*\(.*(?:password|passwd|secret)/i,
    msg: "MD5 used for password hashing",
    rec: "Use bcrypt.hashpw() or argon2-cffi for password hashing",
    sev: "CRITICAL", cwe: "CWE-916", owasp: "A07:2021" },

  // Empty except
  { pattern: /except\s*(?:Exception|BaseException)?\s*:\s*$|except\s*\(\s*Exception\s*\)\s*:/,
    msg: "Bare or broad except clause — swallows all exceptions",
    rec: "Catch specific exception types and log them: except ValueError as e: logger.error(e)",
    sev: "MEDIUM", cwe: "CWE-390", owasp: "A09:2021" },
];

function analyzeSecurity(lines, relPath, skill = "code-analysis") {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#")) continue;
    for (const rule of PY_SECURITY_RULES) {
      if (rule.pattern.test(line)) {
        findings.push(finding({
          skill,
          principle: `Security — ${rule.owasp}`,
          severity: rule.sev,
          file: relPath,
          line_start: i + 1,
          line_end: i + 1,
          message: rule.msg,
          recommendation: rule.rec,
          cwe_id: rule.cwe,
          owasp_category: rule.owasp,
        }));
      }
    }
  }
  return findings;
}

module.exports = { analyzeSecurity };
