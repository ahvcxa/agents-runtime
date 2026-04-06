"use strict";

/**
 * OWASP Top 10 (2021) Security Rules Database
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Each rule defines:
 * - pattern: RegExp to match risky code patterns
 * - owasp: OWASP category (e.g., "A01:2021")
 * - cwe: CWE identifier (e.g., "CWE-285")
 * - severity: CRITICAL, HIGH, MEDIUM, LOW, INFO
 * - message: User-friendly finding description
 * - recommendation: How to fix the issue
 * - context_checks: Optional additional context validation
 * - false_positive_exclusions: Patterns to explicitly exclude (safe usage)
 * - auto_fixable: Whether the tool can auto-fix this issue
 */

const RULES = {
  // ─── A01:2021 Broken Access Control ─────────────────────────────────────────
  A01_ROUTE_NO_AUTH: {
    id: "A01_ROUTE_NO_AUTH",
    pattern: /\.route\s*\([^)]+\)\s*\.(?:get|post|put|delete|patch)(?!\s*[^(]*(?:auth|guard|middleware|isAuth|requireAuth|verifyToken))/,
    owasp: "A01:2021",
    cwe: "CWE-285",
    severity: "HIGH",
    message: "Route defined without visible auth middleware",
    recommendation: "Apply authentication middleware (e.g. auth, guard) before route handlers.",
    context_checks: ["route_handler", "public_endpoint"],
    false_positive_exclusions: [
      /\.route\s*\([^)]*public[^)]*\)/i,  // explicitly marked public
      /health|status|ping|version/i,       // health check endpoints
    ],
    auto_fixable: false,
  },

  A01_EXPRESS_NO_AUTH: {
    id: "A01_EXPRESS_NO_AUTH",
    pattern: /app\.(get|post|put|delete|patch)\s*\([^,]+,\s*(?!.*(?:auth|guard|verify|require))[a-zA-Z]/,
    owasp: "A01:2021",
    cwe: "CWE-285",
    severity: "MEDIUM",
    message: "Express route without explicit auth check",
    recommendation: "Add authentication and authorization middleware to every protected route.",
    context_checks: ["express_route"],
    false_positive_exclusions: [
      /\/public\/|\/static\/|\/assets\//i,
      /health|status|ping/i,
    ],
    auto_fixable: false,
  },

  // ─── A02:2021 Cryptographic Failures ────────────────────────────────────────
  A02_HARDCODED_URL: {
    id: "A02_HARDCODED_URL",
    pattern: /https?:\/\/(?!localhost|127\.0\.0\.1|json-schema\.org|internal|github\.com|example\.com)/,
    owasp: "A02:2021",
    cwe: "CWE-319",
    severity: "MEDIUM",
    message: "Hardcoded external URL — verify HTTPS is enforced",
    recommendation: "Ensure all external connections use HTTPS. Store URLs in configuration, not code.",
    context_checks: ["external_url"],
    false_positive_exclusions: [
      /http:\/\/localhost/,
      /http:\/\/127\.0\.0\.1/,
      /https:\/\/.*\.test/,
      /example\.com|example\.org/,
    ],
    auto_fixable: false,
  },

  A02_WEAK_CIPHER: {
    id: "A02_WEAK_CIPHER",
    pattern: /createCipheriv\s*\(\s*['"](?:des|des3|rc4|des-ede|aes-128-ecb|aes-256-ecb)['"]/i,
    owasp: "A02:2021",
    cwe: "CWE-327",
    severity: "CRITICAL",
    message: "Deprecated or weak cipher (DES/RC4/ECB mode) in use",
    recommendation: "Use AES-256-GCM or ChaCha20-Poly1305. Never use ECB mode.",
    context_checks: ["cryptography"],
    false_positive_exclusions: [],
    auto_fixable: true,
  },

  A02_HARDCODED_SECRET: {
    id: "A02_HARDCODED_SECRET",
    pattern: /Buffer\.from\s*\([^)]+,\s*['"]base64['"]\s*\).*(?:password|secret|key|token)/i,
    owasp: "A02:2021",
    cwe: "CWE-259",
    severity: "HIGH",
    message: "Base64-encoded secret decoded in code — likely hardcoded credential",
    recommendation: "Store secrets in environment variables or a secrets manager.",
    context_checks: ["hardcoded_secret"],
    false_positive_exclusions: [
      /test|fixture|mock|example/i,
    ],
    auto_fixable: false,
  },

  // ─── A03:2021 Injection ─────────────────────────────────────────────────────
  A03_TEMPLATE_INJECTION: {
    id: "A03_TEMPLATE_INJECTION",
    pattern: /\$\{.*(?:req\.|params\.|query\.|body\.).*\}/,
    owasp: "A03:2021",
    cwe: "CWE-89",
    severity: "CRITICAL",
    message: "Template literal contains user input — potential injection sink",
    recommendation: "Never interpolate user-controlled data into SQL/shell/template contexts.",
    context_checks: ["template_literal", "user_input"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  A03_REGEXP_INJECTION: {
    id: "A03_REGEXP_INJECTION",
    pattern: /new RegExp\s*\([^)]*(?:req\.|params\.|query\.|body\.)/,
    owasp: "A03:2021",
    cwe: "CWE-730",
    severity: "HIGH",
    message: "User-controlled input used in RegExp constructor — ReDoS risk",
    recommendation: "Validate input before RegExp. Use safe-regex library or static patterns.",
    context_checks: ["regexp_construction", "user_input"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  A03_EXEC_DYNAMIC: {
    id: "A03_EXEC_DYNAMIC",
    pattern: /\bexec\s*\([^)]*(?:process\.env|path\.join|template|interpolate|\+|`)/,
    owasp: "A03:2021",
    cwe: "CWE-78",
    severity: "HIGH",
    message: "exec() called with dynamic arguments — command injection risk",
    recommendation: "Use execFile() with shell: false and argument arrays. Never concatenate inputs.",
    context_checks: ["child_process_exec", "dynamic_arguments"],
    false_positive_exclusions: [
      /\.exec\s*\(/,  // database .exec() methods
    ],
    auto_fixable: false,
  },

  A03_SPAWN_DYNAMIC: {
    id: "A03_SPAWN_DYNAMIC",
    pattern: /\bspawn\s*\([^)]*(?:process\.env|path\.join|template|interpolate|\+|`)/,
    owasp: "A03:2021",
    cwe: "CWE-78",
    severity: "HIGH",
    message: "spawn() called with dynamic arguments — command injection risk",
    recommendation: "Use execFile() with shell: false and argument arrays.",
    context_checks: ["child_process_spawn", "dynamic_arguments"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  A03_CHILD_PROCESS_IMPORT: {
    id: "A03_CHILD_PROCESS_IMPORT",
    pattern: /require\s*\(\s*['"]child_process['"]\s*\)/,
    owasp: "A03:2021",
    cwe: "CWE-78",
    severity: "INFO",
    message: "child_process module imported — verify execFile() is used",
    recommendation: "Audit every process execution. Use execFile() with argument arrays.",
    context_checks: ["import_child_process"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  // ─── A04:2021 Insecure Design ───────────────────────────────────────────────
  A04_CORS_WILDCARD: {
    id: "A04_CORS_WILDCARD",
    pattern: /app\.use\s*\([^)]*cors\s*\(\s*\{[^}]*origin\s*:\s*['"]\*['"]/,
    owasp: "A04:2021",
    cwe: "CWE-942",
    severity: "HIGH",
    message: "CORS configured with wildcard origin (*) — allows any site to access",
    recommendation: "Restrict CORS origin to an allow-list of trusted domains.",
    context_checks: ["cors_config"],
    false_positive_exclusions: [
      /\/\/.*\*/,  // commented out
    ],
    auto_fixable: false,
  },

  A04_RATE_LIMIT_DISABLED: {
    id: "A04_RATE_LIMIT_DISABLED",
    pattern: /rate(?:\s+)?limit(?:ing)?.*(?:disabled|false|=\s*0)\s*[,;)/]/i,
    owasp: "A04:2021",
    cwe: "CWE-770",
    severity: "MEDIUM",
    message: "Rate limiting appears to be disabled",
    recommendation: "Enable rate limiting on all public endpoints.",
    context_checks: ["rate_limiting_config"],
    false_positive_exclusions: [
      /agent-suppress.*A04:2021/,  // suppressed
      /\/\/.*rate.*limit/,          // commented out
    ],
    auto_fixable: false,
  },

  // ─── A05:2021 Security Misconfiguration ──────────────────────────────────────
  A05_HARDCODED_DEV_ENV: {
    id: "A05_HARDCODED_DEV_ENV",
    pattern: /(?:NODE_ENV|environment)\s*[:=]\s*['"]development['"]/,
    owasp: "A05:2021",
    cwe: "CWE-16",
    severity: "MEDIUM",
    message: "Development environment flag found in source code",
    recommendation: "Never hardcode environment names. Use environment variables.",
    context_checks: ["environment_config"],
    false_positive_exclusions: [
      /test|spec|fixture/i,
    ],
    auto_fixable: false,
  },

  A05_VERBOSE_ERROR_LOG: {
    id: "A05_VERBOSE_ERROR_LOG",
    pattern: /console\.(error|log)\s*\([^)]*(?:err|error|stack|exception)/i,
    owasp: "A05:2021",
    cwe: "CWE-209",
    severity: "LOW",
    message: "Error details may be logged verbosely and expose stack traces",
    recommendation: "Use structured logging. Never expose full stack traces to end users.",
    context_checks: ["error_logging"],
    false_positive_exclusions: [
      /\/\/.*console/,  // commented
      /test|spec/i,
    ],
    auto_fixable: false,
  },

  // ─── A06:2021 Vulnerable Components ─────────────────────────────────────────
  A06_VULNERABLE_PACKAGE: {
    id: "A06_VULNERABLE_PACKAGE",
    pattern: null,  // Special handling in file-level checks
    owasp: "A06:2021",
    cwe: "CWE-1104",
    severity: "HIGH",
    message: "Potentially outdated/vulnerable package detected",
    recommendation: "Run 'npm audit' and upgrade to latest stable version.",
    context_checks: ["package_version"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  // ─── A07:2021 Identification and Authentication Failures ──────────────────────
  A07_JWT_NO_EXPIRY: {
    id: "A07_JWT_NO_EXPIRY",
    pattern: /jwt\.sign\s*\([^,]+,\s*[^,]+,\s*\{[^}]*expiresIn\s*:\s*(?:'|")(?:\d{4,}|never|0)(?:'|")/,
    owasp: "A07:2021",
    cwe: "CWE-613",
    severity: "HIGH",
    message: "JWT with very long or no expiry — session tokens should expire",
    recommendation: "Set short JWT expiry (e.g. expiresIn: '15m') and implement refresh tokens.",
    context_checks: ["jwt_config"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  A07_PLAINTEXT_PASSWORD: {
    id: "A07_PLAINTEXT_PASSWORD",
    pattern: /(?:password|passwd)\s*==\s*|===\s*(?:req\.|body\.).*(?:password|passwd)/i,
    owasp: "A07:2021",
    cwe: "CWE-522",
    severity: "HIGH",
    message: "Plaintext password comparison detected",
    recommendation: "Use bcrypt.compare() or argon2.verify() for password validation.",
    context_checks: ["password_comparison"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  A07_MD5_PASSWORD: {
    id: "A07_MD5_PASSWORD",
    pattern: /md5\s*\(.*(?:password|passwd|secret)/i,
    owasp: "A07:2021",
    cwe: "CWE-916",
    severity: "CRITICAL",
    message: "MD5 used for password hashing — trivially broken",
    recommendation: "Use bcrypt (cost≥12), scrypt, or argon2id for password hashing.",
    context_checks: ["password_hashing"],
    false_positive_exclusions: [],
    auto_fixable: true,
  },

  // ─── A08:2021 Software and Data Integrity Failures ────────────────────────────
  A08_DYNAMIC_REQUIRE: {
    id: "A08_DYNAMIC_REQUIRE",
    pattern: /require\s*\(\s*[^'"]\s*\+/,
    owasp: "A08:2021",
    cwe: "CWE-829",
    severity: "HIGH",
    message: "Dynamic require() with string concatenation — path injection risk",
    recommendation: "Use a static allow-list of permitted module names.",
    context_checks: ["dynamic_import"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  A08_JSON_PARSE_USER_INPUT: {
    id: "A08_JSON_PARSE_USER_INPUT",
    pattern: /JSON\.parse\s*\([^)]*(?:req\.|body\.|params\.|query\.)/,
    owasp: "A08:2021",
    cwe: "CWE-502",
    severity: "MEDIUM",
    message: "JSON.parse() called on user-controlled input without schema validation",
    recommendation: "Validate parsed object against a schema (zod, ajv, joi).",
    context_checks: ["json_parsing"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  // ─── A09:2021 Security Logging and Monitoring Failures ───────────────────────
  A09_EMPTY_CATCH: {
    id: "A09_EMPTY_CATCH",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    owasp: "A09:2021",
    cwe: "CWE-390",
    severity: "MEDIUM",
    message: "Empty catch block — errors are silently swallowed",
    recommendation: "Log caught errors with structured context (file, function, timestamp).",
    context_checks: ["error_handling"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },

  // ─── A10:2021 SSRF ──────────────────────────────────────────────────────────
  A10_SSRF_RISK: {
    id: "A10_SSRF_RISK",
    pattern: /(?:fetch|axios|got|request|http\.get|https\.get)\s*\([^)]*(?:req\.|params\.|query\.|body\.)/,
    owasp: "A10:2021",
    cwe: "CWE-918",
    severity: "CRITICAL",
    message: "HTTP client called with user-controlled URL — SSRF risk",
    recommendation: "Validate URLs against allow-list of permitted hosts. Block internal IPs.",
    context_checks: ["http_client", "user_input"],
    false_positive_exclusions: [],
    auto_fixable: false,
  },
};

/**
 * Get all rules as array for iteration
 */
function getAllRules() {
  return Object.values(RULES);
}

/**
 * Get rule by ID
 */
function getRuleById(id) {
  return RULES[id];
}

/**
 * Get rules by OWASP category
 */
function getRulesByOwasp(owaspCode) {
  return Object.values(RULES).filter(r => r.owasp === owaspCode);
}

/**
 * Check if a line should be excluded by false positive filters
 */
function passesExclusionChecks(line, rule) {
  if (!rule.false_positive_exclusions || rule.false_positive_exclusions.length === 0) {
    return true;
  }
  for (const exclusion of rule.false_positive_exclusions) {
    if (exclusion.test(line)) {
      return false;  // Line matches exclusion, skip this rule
    }
  }
  return true;  // Line passes all exclusions
}

module.exports = {
  RULES,
  getAllRules,
  getRuleById,
  getRulesByOwasp,
  passesExclusionChecks,
};
