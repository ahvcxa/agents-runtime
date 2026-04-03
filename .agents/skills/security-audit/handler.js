"use strict";
/**
 * .agents/skills/security-audit/handler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * OWASP Top 10 (2021) deep security audit handler.
 * Complements code-analysis with context-aware, comprehensive security checks.
 *
 * @param {object} ctx
 * @param {string}   ctx.agentId
 * @param {number}   ctx.authLevel
 * @param {object}   ctx.input         - { files: string[], project_root?: string }
 * @param {object}   ctx.memory
 * @param {Function} ctx.log
 * @returns {Promise<{ findings: Finding[], summary: object }>}
 */

const fs   = require("fs");
const path = require("path");

let _pyAnalyzer;
function getPyAnalyzer() {
  if (!_pyAnalyzer) {
    try {
      // When installed: .agents/skills/security-audit/ → .agents/helpers/
      _pyAnalyzer = require(path.join(__dirname, "../../helpers/python-analyzer"));
    } catch {
      _pyAnalyzer = null;
    }
  }
  return _pyAnalyzer;
}

// ─── UUID-v4 ─────────────────────────────────────────────────────────────────
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function finding({ owasp_category, cwe_id, severity, file, line_start, line_end, message, recommendation, auto_fixable = false }) {
  const key = `sec-${owasp_category?.replace(/:/g, "")}-${path.basename(file)}-L${line_start}`;
  return {
    id:              uuid(),
    skill:           "security-audit",
    principle:       `OWASP ${owasp_category}`,
    severity,
    file,
    line_start,
    line_end:        line_end ?? line_start,
    message,
    recommendation,
    cwe_id,
    owasp_category,
    auto_fixable,
    suppression_key: key,
  };
}

// ─── File resolution ──────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml", ".env", ".py"]);

function resolveFiles(inputs, root) {
  const result = [];
  for (const input of inputs) {
    const abs = path.isAbsolute(input) ? input : path.join(root, input);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) collectFiles(abs, result);
    else if (SUPPORTED_EXTS.has(path.extname(abs).toLowerCase())) result.push(abs);
  }
  return result;
}

function collectFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
}

// ─── OWASP rule sets ─────────────────────────────────────────────────────────

const LINE_RULES = [
  // A01: Broken Access Control
  { pattern: /\.route\s*\([^)]+\)\s*\.(?:get|post|put|delete|patch)(?!\s*[^(]*(?:auth|guard|middleware|isAuth|requireAuth|verifyToken))/,
    owasp: "A01:2021", cwe: "CWE-285",  severity: "HIGH",
    message: "Route defined without visible auth middleware",
    recommendation: "Apply authentication middleware (e.g. auth, guard) before route handlers." },
  { pattern: /app\.(get|post|put|delete|patch)\s*\([^,]+,\s*(?!.*(?:auth|guard|verify|require))[a-zA-Z]/,
    owasp: "A01:2021", cwe: "CWE-285",  severity: "MEDIUM",
    message: "Express route without explicit auth check",
    recommendation: "Add authentication and authorization middleware to every protected route." },

  // A02: Cryptographic Failures
  { pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)/,
    owasp: "A02:2021", cwe: "CWE-319",  severity: "MEDIUM",
    message: "Hardcoded external URL — check that HTTPS is enforced",
    recommendation: "Ensure all external connections use HTTPS. Never downgrade to HTTP for sensitive endpoints." },
  { pattern: /createCipheriv\s*\(\s*['"](?:des|des3|rc4|des-ede|aes-128-ecb|aes-256-ecb)['"]/i,
    owasp: "A02:2021", cwe: "CWE-327",  severity: "CRITICAL",
    message: "Deprecated or weak cipher (DES/RC4/ECB mode) in use",
    recommendation: "Use AES-256-GCM or ChaCha20-Poly1305. Never use ECB mode (no IVs = deterministic ciphertext)." },
  { pattern: /Buffer\.from\s*\([^)]+,\s*['"]base64['"]\s*\).*(?:password|secret|key|token)/i,
    owasp: "A02:2021", cwe: "CWE-259",  severity: "HIGH",
    message: "Base64-encoded secret decoded in code — likely hardcoded credential",
    recommendation: "Store secrets in environment variables or a secrets manager, never in source code." },

  // A03: Injection
  { pattern: /\$\{.*(?:req\.|params\.|query\.|body\.).*\}/,
    owasp: "A03:2021", cwe: "CWE-89",   severity: "CRITICAL",
    message: "Template literal contains user input — potential injection sink",
    recommendation: "Never interpolate user-controlled data into SQL/shell/template contexts without sanitization." },
  { pattern: /new RegExp\s*\([^)]*(?:req\.|params\.|query\.|body\.)/,
    owasp: "A03:2021", cwe: "CWE-730",  severity: "HIGH",
    message: "User-controlled input used in RegExp constructor — ReDoS risk",
    recommendation: "Validate and limit user input before using in RegExp. Consider using a safe regex library." },
  { pattern: /child_process|require\s*\(\s*['"]child_process['"]\s*\)/,
    owasp: "A03:2021", cwe: "CWE-78",   severity: "HIGH",
    message: "child_process module imported — ensure no user input reaches shell commands",
    recommendation: "Audit every exec/spawn call. Use execFile() with argument arrays." },

  // A04: Insecure Design
  { pattern: /app\.use\s*\([^)]*cors\s*\(\s*\{[^}]*origin\s*:\s*['"]\*['"]/,
    owasp: "A04:2021", cwe: "CWE-942",  severity: "HIGH",
    message: "CORS configured with wildcard origin (*) — allows any site to make cross-origin requests",
    recommendation: "Restrict CORS origin to an allow-list of trusted domains." },
  { pattern: /(?:limit|rate).*(?:disabled|false|0)\s*[,;]/i,
    owasp: "A04:2021", cwe: "CWE-770",  severity: "MEDIUM",
    message: "Rate limiting appears to be disabled",
    recommendation: "Enable rate limiting on all public endpoints. Use express-rate-limit or similar." },

  // A05: Security Misconfiguration
  { pattern: /(?:NODE_ENV|environment)\s*[:=]\s*['"]development['"]/,
    owasp: "A05:2021", cwe: "CWE-16",   severity: "MEDIUM",
    message: "Development environment flag found in source code",
    recommendation: "Never hardcode environment names. Use environment variables and validate at startup." },
  { pattern: /app\.set\s*\(\s*['"]x-powered-by['"]|app\.disable\s*\(\s*['"]x-powered-by/,
    owasp: "A05:2021", cwe: "CWE-200",  severity: "LOW",
    message: "X-Powered-By header management found — ensure it is disabled in production",
    recommendation: "Call app.disable('x-powered-by') or use helmet() to suppress the header." },
  { pattern: /console\.(error|log)\s*\([^)]*(?:err|error|stack|exception)/i,
    owasp: "A05:2021", cwe: "CWE-209",  severity: "LOW",
    message: "Error details may be logged verbosely and could expose stack traces",
    recommendation: "Use a structured logger. Never expose full stack traces to end users." },

  // A07: Identification and Authentication Failures
  { pattern: /jwt\.sign\s*\([^,]+,\s*[^,]+,\s*\{[^}]*expiresIn\s*:\s*(?:'|")(?:\d{4,}|never|0)(?:'|")/,
    owasp: "A07:2021", cwe: "CWE-613",  severity: "HIGH",
    message: "JWT with very long or no expiry — session tokens should expire",
    recommendation: "Set short JWT expiry (e.g. expiresIn: '15m') and implement refresh token rotation." },
  { pattern: /(?:password|passwd)\s*==\s*|===\s*(?:req\.|body\.).*(?:password|passwd)/i,
    owasp: "A07:2021", cwe: "CWE-522",  severity: "HIGH",
    message: "Plaintext password comparison detected",
    recommendation: "Never compare passwords in plaintext. Use bcrypt.compare() or argon2.verify()." },
  { pattern: /md5\s*\(.*(?:password|passwd|secret)/i,
    owasp: "A07:2021", cwe: "CWE-916",  severity: "CRITICAL",
    message: "MD5 used for password hashing — trivially broken",
    recommendation: "Use bcrypt (cost≥12), scrypt, or argon2id for password hashing." },

  // A08: Software and Data Integrity Failures
  { pattern: /require\s*\(\s*[^'"]\s*\+/,
    owasp: "A08:2021", cwe: "CWE-829",  severity: "HIGH",
    message: "Dynamic require() with string concatenation — path injection risk",
    recommendation: "Use a static allow-list of permitted module names before dynamic require()." },
  { pattern: /JSON\.parse\s*\([^)]*(?:req\.|body\.|params\.|query\.)/,
    owasp: "A08:2021", cwe: "CWE-502",  severity: "MEDIUM",
    message: "JSON.parse() called on user-controlled input without schema validation",
    recommendation: "Validate the parsed object against a schema (zod, ajv, joi) before use." },

  // A09: Security Logging and Monitoring Failures
  { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    owasp: "A09:2021", cwe: "CWE-390",  severity: "MEDIUM",
    message: "Empty catch block — errors are silently swallowed",
    recommendation: "Log caught errors with structured context (file, function, timestamp)." },

  // A10: SSRF
  { pattern: /(?:fetch|axios|got|request|http\.get|https\.get)\s*\([^)]*(?:req\.|params\.|query\.|body\.)/,
    owasp: "A10:2021", cwe: "CWE-918",  severity: "CRITICAL",
    message: "HTTP client called with user-controlled URL — Server-Side Request Forgery (SSRF) risk",
    recommendation: "Validate URLs against an allow-list of permitted hosts. Block internal/metadata IPs." },
];

// Multi-line / file-level checks
function auditFileLevel(content, relPath, findings) {
  // A06: Vulnerable Components — check for known risky version ranges in package.json
  if (relPath.endsWith("package.json")) {
    let pkg;
    try { pkg = JSON.parse(content); } catch { return; }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const RISKY_PACKAGES = {
      "lodash":      (v) => v.match(/^\^?[0-3]\./),
      "express":     (v) => v.match(/^\^?[0-3]\./),
      "log4js":      (v) => v.match(/^\^?[0-5]\./),
      "axios":       (v) => v.match(/^\^?0\./),
      "node-fetch":  (v) => v.match(/^\^?[0-1]\./),
      "ejs":         (v) => v.match(/^\^?[0-2]\./),
    };
    for (const [pkg_name, checkFn] of Object.entries(RISKY_PACKAGES)) {
      const ver = deps[pkg_name];
      if (ver && checkFn(ver)) {
        findings.push(finding({
          owasp_category: "A06:2021",
          cwe_id:         "CWE-1104",
          severity:       "HIGH",
          file:           relPath,
          line_start:     1,
          line_end:       1,
          message:        `Potentially outdated/vulnerable package: '${pkg_name}@${ver}'`,
          recommendation: `Run 'npm audit' and upgrade '${pkg_name}' to latest stable version.`,
        }));
      }
    }
    return;
  }

  // A05: Detect debug mode flags in config files
  if (relPath.endsWith(".env") || relPath.endsWith(".env.example")) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/^DEBUG\s*=\s*true|^LOG_LEVEL\s*=\s*debug/i.test(lines[i])) {
        findings.push(finding({
          owasp_category: "A05:2021",
          cwe_id:         "CWE-16",
          severity:       "LOW",
          file:           relPath,
          line_start:     i + 1,
          line_end:       i + 1,
          message:        "Debug/verbose logging enabled in environment config",
          recommendation: "Disable debug logging in production environments.",
        }));
      }
    }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
async function execute({ agentId, authLevel, input, memory, log }) {
  const files   = input?.files ?? [];
  const rootDir = input?.project_root ?? process.cwd();

  log({ event_type: "INFO", agent_id: agentId, message: `security-audit: scanning ${files.length} path(s)` });

  const resolvedFiles = resolveFiles(files, rootDir);
  log({ event_type: "INFO", message: `Resolved ${resolvedFiles.length} file(s)` });

  const allFindings = [];
  const summary     = { files_scanned: 0, by_severity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }, by_owasp: {} };

  for (const absPath of resolvedFiles) {
    let content;
    try { content = fs.readFileSync(absPath, "utf8"); }
    catch { log({ event_type: "WARN", message: `Cannot read: ${absPath}` }); continue; }

    const lines   = content.split("\n");
    const relPath = path.relative(rootDir, absPath);
    const fileFindings = [];

    // File-level checks
    auditFileLevel(content, relPath, fileFindings);

    const ext = path.extname(absPath).toLowerCase();

    if (ext === ".py") {
      const py = getPyAnalyzer();
      if (py) fileFindings.push(...py.auditSecurityPython(lines, relPath));
    } else {
      // Line-level checks (JS/TS/config files)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
        for (const rule of LINE_RULES) {
          if (rule.pattern.test(line)) {
            fileFindings.push(finding({
              owasp_category: rule.owasp,
              cwe_id:         rule.cwe,
              severity:       rule.severity,
              file:           relPath,
              line_start:     i + 1,
              line_end:       i + 1,
              message:        rule.message,
              recommendation: rule.recommendation,
            }));
          }
        }
      }
    }


    // Suppression filter
    const suppressions = new Set();
    for (const line of lines) {
      const m = line.match(/agent-suppress:\s*(\S+)/);
      if (m) suppressions.add(m[1]);
    }
    const filtered = fileFindings.filter((f) => {
      if (suppressions.has(f.suppression_key)) {
        log({ event_type: "INFO", message: `Suppressed: ${f.suppression_key}` });
        return false;
      }
      return true;
    });

    allFindings.push(...filtered);
    summary.files_scanned++;
    for (const f of filtered) {
      summary.by_severity[f.severity] = (summary.by_severity[f.severity] ?? 0) + 1;
      summary.by_owasp[f.owasp_category] = (summary.by_owasp[f.owasp_category] ?? 0) + 1;
    }

    if (filtered.length > 0) {
      log({ event_type: "INFO", message: `${relPath}: ${filtered.length} security finding(s)` });
    }
  }

  // Cache in memory
  try {
    memory.set(`skill:security-audit:cache:last-run:${agentId}`, {
      findings: allFindings, summary, scanned_at: new Date().toISOString(),
    }, { ttl_seconds: 3600, tags: ["skill:security-audit", "context:analysis", "lifecycle:transient"] });
  } catch { /* ignore memory write failure */ }

  log({
    event_type: "INFO",
    message:    `Security audit complete. ${summary.files_scanned} file(s), ${allFindings.length} finding(s).`,
    summary,
  });

  return { findings: allFindings, summary };
}

module.exports = { execute };
