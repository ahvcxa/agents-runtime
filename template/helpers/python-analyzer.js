"use strict";
/**
 * src/analyzers/python-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Python source code analyzer — implements all 5 principles from SKILL.md
 * adapted for Python syntax. No external deps.
 *
 * Exported functions are called by code-analysis and security-audit handlers.
 */

const path = require("path");

// ─── UUID helper ──────────────────────────────────────────────────────────────
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Finding builder ──────────────────────────────────────────────────────────
function finding({ skill = "code-analysis", principle, severity, file, line_start, line_end,
  symbol, message, recommendation, cwe_id, owasp_category, auto_fixable = false }) {
  const key = `${principle.toLowerCase().replace(/[\s—]+/g, "-")}-${path.basename(file)}-L${line_start}`;
  return {
    id: uuid(), skill, principle, severity, file,
    line_start, line_end: line_end ?? line_start,
    symbol: symbol ?? undefined, message, recommendation,
    cwe_id: cwe_id ?? undefined,
    owasp_category: owasp_category ?? undefined,
    auto_fixable, suppression_key: key,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip inline comment and string literals from a Python line for analysis */
function stripPython(line) {
  // Remove # comments (naïve but good enough for pattern matching)
  return line.replace(/#.*$/, "").trim();
}

/** Detect Python indentation level (number of spaces) */
function indentLevel(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 1 — Cyclomatic Complexity (Python)
// CC = 1 + (if / elif / for / while / except / and / or / ternary `if`)
// ─────────────────────────────────────────────────────────────────────────────
function analyzeCyclomaticComplexity(lines, relPath) {
  const findings = [];
  const FUNC_PATTERN = /^(\s*)(?:def|async\s+def)\s+(\w+)\s*\(/;
  const DECISION_PATTERN = /\bif\b|\belif\b|\bfor\b|\bwhile\b|\bexcept\b|\band\b|\bor\b/g;
  // detect ternary: `x if cond else y`
  const TERNARY = /\w+\s+if\s+.+\s+else\s/;

  let inFunc = false;
  let funcName = "";
  let funcStart = 0;
  let funcIndent = 0;
  let cc = 1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = stripPython(raw);

    const funcMatch = raw.match(FUNC_PATTERN);
    if (funcMatch && !inFunc) {
      inFunc      = true;
      funcName    = funcMatch[2];
      funcStart   = i + 1;
      funcIndent  = funcMatch[1].length;
      cc          = 1;
      continue;
    }

    if (inFunc) {
      // Function ends when we find a non-empty line at same or lower indent
      if (stripped.length > 0 && indentLevel(raw) <= funcIndent && i > funcStart) {
        // emit finding if threshold exceeded
        if (cc >= 11) {
          findings.push(finding({
            principle: "Cyclomatic Complexity", severity: cc > 20 ? "CRITICAL" : "HIGH",
            file: relPath, line_start: funcStart, line_end: i, symbol: funcName,
            message: `Function '${funcName}' has cyclomatic complexity of ${cc} (threshold: ${cc > 20 ? ">20 unmaintainable" : "11-20 complex"})`,
            recommendation: cc > 20
              ? `Break '${funcName}' into smaller functions. Apply Single Responsibility Principle.`
              : `Document '${funcName}' and plan decomposition.`,
          }));
        }
        inFunc = false;
        // Re-check this line as potential new function
        const newFunc = raw.match(FUNC_PATTERN);
        if (newFunc) { inFunc = true; funcName = newFunc[2]; funcStart = i + 1; funcIndent = newFunc[1].length; cc = 1; }
        continue;
      }

      const decisions = (stripped.match(DECISION_PATTERN) ?? []).length;
      cc += decisions;
      if (TERNARY.test(stripped)) cc += 1;
    }
  }

  // Handle function at end of file
  if (inFunc && cc >= 11) {
    findings.push(finding({
      principle: "Cyclomatic Complexity", severity: cc > 20 ? "CRITICAL" : "HIGH",
      file: relPath, line_start: funcStart, line_end: lines.length, symbol: funcName,
      message: `Function '${funcName}' has cyclomatic complexity of ${cc}`,
      recommendation: `Break '${funcName}' into smaller functions.`,
    }));
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 2 — DRY (Python)
// ─────────────────────────────────────────────────────────────────────────────
function analyzeDry(lines, relPath) {
  const findings = [];
  const magicNumbers = new Map();
  const magicStrings = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = stripPython(lines[i]);

    // Magic numbers
    for (const m of line.matchAll(/(?<![.\w])(\d{2,})(?![.\w])/g)) {
      const val = m[1];
      if (["100", "200", "201", "400", "401", "403", "404", "500", "True", "False"].includes(val)) continue;
      if (!magicNumbers.has(val)) magicNumbers.set(val, []);
      magicNumbers.get(val).push(i + 1);
    }

    // Magic strings — not imports/logging
    if (!line.match(/^(?:import|from|print|logging|log\.|logger\.)/)) {
      for (const m of line.matchAll(/["']([A-Za-z][A-Za-z0-9_\-]{4,})["'](?!\s*:)/g)) {
        const val = m[1];
        if (!magicStrings.has(val)) magicStrings.set(val, []);
        magicStrings.get(val).push(i + 1);
      }
    }
  }

  for (const [val, lineNums] of magicNumbers) {
    if (lineNums.length > 2) {
      findings.push(finding({
        principle: "DRY", severity: "MEDIUM", file: relPath,
        line_start: lineNums[0], line_end: lineNums[lineNums.length - 1],
        message: `Magic number '${val}' appears ${lineNums.length} times (lines ${lineNums.join(", ")})`,
        recommendation: `Extract to a named constant: ${val.toUpperCase()}_CONSTANT = ${val}`,
      }));
    }
  }

  for (const [val, lineNums] of magicStrings) {
    if (lineNums.length > 2) {
      findings.push(finding({
        principle: "DRY", severity: "MEDIUM", file: relPath,
        line_start: lineNums[0], line_end: lineNums[lineNums.length - 1],
        message: `Magic string '${val}' appears ${lineNums.length} times`,
        recommendation: `Extract to a named constant or Enum: ${val.toUpperCase()} = "${val}"`,
      }));
    }
  }

  // Duplicate block detection (non-overlapping)
  const BLOCK_SIZE = 6;
  const fingerprints = lines.map(l => stripPython(l).replace(/\s+/g, " "));
  const seen = new Map();
  const reported = new Set();
  let i = 0;
  while (i <= fingerprints.length - BLOCK_SIZE) {
    const blockLines = fingerprints.slice(i, i + BLOCK_SIZE);
    const meaningful = blockLines.filter(l => l.length > 4 && !l.startsWith("#"));
    const blockKey   = meaningful.join("\n");
    if (meaningful.length < Math.ceil(BLOCK_SIZE * 0.6) || blockKey.length < 100) { i++; continue; }
    if (seen.has(blockKey) && !reported.has(seen.get(blockKey))) {
      const prev = seen.get(blockKey);
      reported.add(prev);
      findings.push(finding({
        principle: "DRY", severity: "HIGH", file: relPath,
        line_start: prev + 1, line_end: i + BLOCK_SIZE,
        message: `Structural clone: ${BLOCK_SIZE}-line block first at L${prev + 1}–${prev + BLOCK_SIZE}, duplicated at L${i + 1}–${i + BLOCK_SIZE}`,
        recommendation: "Extract duplicated logic into a shared helper function",
      }));
      i += BLOCK_SIZE;
    } else {
      if (!seen.has(blockKey)) seen.set(blockKey, i);
      i++;
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 3 — Security-First (Python-specific rules)
// ─────────────────────────────────────────────────────────────────────────────
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

function analyzeSecurity(lines, relPath) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#")) continue;
    for (const rule of PY_SECURITY_RULES) {
      if (rule.pattern.test(line)) {
        findings.push(finding({
          skill:          "code-analysis",
          principle:      `Security — ${rule.owasp}`,
          severity:       rule.sev,
          file:           relPath,
          line_start:     i + 1,
          line_end:       i + 1,
          message:        rule.msg,
          recommendation: rule.rec,
          cwe_id:         rule.cwe,
          owasp_category: rule.owasp,
        }));
      }
    }
  }
  return findings;
}

// Same rules but labeled for security-audit skill
function analyzeSecurityAudit(lines, relPath) {
  return analyzeSecurity(lines, relPath).map(f => ({ ...f, skill: "security-audit" }));
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 4 — SOLID (Python)
// ─────────────────────────────────────────────────────────────────────────────
function analyzeSolid(lines, relPath) {
  const findings = [];

  // SRP: file > 500 non-empty lines
  const nonEmpty = lines.filter(l => l.trim() && !l.trim().startsWith("#"));
  if (nonEmpty.length > 500) {
    findings.push(finding({
      principle: "SOLID — Single Responsibility", severity: "MEDIUM", file: relPath,
      line_start: 1, line_end: lines.length,
      message: `Module has ${nonEmpty.length} non-empty lines (>500). Likely violates SRP.`,
      recommendation: "Split into smaller, focused modules. Each module: one reason to change.",
    }));
  }

  // OCP: long if/elif chains
  let chainLen = 0, chainStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*elif\s/.test(lines[i])) {
      if (chainLen === 0) chainStart = i;
      chainLen++;
    } else if (/^\s*if\s/.test(lines[i])) {
      chainLen = 0;
    } else if (chainLen > 0 && !/^\s*(else\s*:|#)/.test(lines[i]) && lines[i].trim()) {
      if (chainLen > 4) {
        findings.push(finding({
          principle: "SOLID — Open/Closed", severity: "MEDIUM", file: relPath,
          line_start: chainStart + 1, line_end: i,
          message: `elif chain with ${chainLen + 1} branches. Violates Open/Closed Principle.`,
          recommendation: "Replace with a dispatch dict or Strategy pattern",
        }));
      }
      chainLen = 0;
    }
  }

  // Class size: methods > 10 or LoC > 200 per class
  let inClass = false, className = "", classStart = 0, classIndent = 0, methodCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const cls = raw.match(/^(\s*)class\s+(\w+)/);
    if (cls) {
      if (inClass && methodCount > 10) {
        findings.push(finding({
          principle: "SOLID — Single Responsibility", severity: "MEDIUM", file: relPath,
          line_start: classStart, line_end: i, symbol: className,
          message: `Class '${className}' has ${methodCount} methods (>10). May have too many responsibilities.`,
          recommendation: "Extract related methods into smaller focused classes or mixins.",
        }));
      }
      inClass = true; className = cls[2]; classStart = i + 1; classIndent = cls[1].length; methodCount = 0;
      continue;
    }
    if (inClass) {
      if (/^\s*def\s+/.test(raw) && indentLevel(raw) === classIndent + 4) methodCount++;
      if (raw.trim() && indentLevel(raw) <= classIndent && !raw.trim().startsWith("#") && i > classStart) {
        inClass = false;
      }
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 5 — Cognitive Complexity (Python)
// ─────────────────────────────────────────────────────────────────────────────
function analyzeCognitiveComplexity(lines, relPath) {
  const findings = [];
  const FUNC_PATTERN = /^(\s*)(?:def|async\s+def)\s+(\w+)\s*\(/;
  const NESTING = /\b(if|elif|for|while|except|with)\b/g;
  const FLOW    = /\b(break|continue|return|raise|yield)\b/;

  let inFunc = false, fnName = "", fnStart = 0, fnBaseIndent = 0;
  let cog = 0, nestLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = stripPython(raw);
    const indent   = indentLevel(raw);

    const funcMatch = raw.match(FUNC_PATTERN);
    if (funcMatch && !inFunc) {
      inFunc     = true; fnName = funcMatch[2];
      fnStart    = i + 1; fnBaseIndent = funcMatch[1].length;
      cog        = 0; nestLevel = 0;
      continue;
    }

    if (inFunc) {
      if (stripped.length > 0 && indent <= fnBaseIndent && i > fnStart) {
        if (cog > 15) {
          findings.push(finding({
            principle: "Cognitive Complexity", severity: cog > 30 ? "HIGH" : "MEDIUM",
            file: relPath, line_start: fnStart, line_end: i, symbol: fnName,
            message: `Function '${fnName}' has cognitive complexity ${cog} (threshold: 15)`,
            recommendation: `Extract nested logic in '${fnName}' into well-named helpers. Reduce nesting depth.`,
          }));
        }
        inFunc = false;
        const newF = raw.match(FUNC_PATTERN);
        if (newF) { inFunc = true; fnName = newF[2]; fnStart = i + 1; fnBaseIndent = newF[1].length; cog = 0; nestLevel = 0; }
        continue;
      }

      nestLevel = Math.max(0, Math.floor((indent - fnBaseIndent) / 4));
      const nestHits = (stripped.match(NESTING) ?? []).length;
      cog += nestHits * Math.max(1, nestLevel);
      if (FLOW.test(stripped)) cog += 1;
    }
  }

  // End of file
  if (inFunc && cog > 15) {
    findings.push(finding({
      principle: "Cognitive Complexity", severity: cog > 30 ? "HIGH" : "MEDIUM",
      file: relPath, line_start: fnStart, line_end: lines.length, symbol: fnName,
      message: `Function '${fnName}' has cognitive complexity ${cog}`,
      recommendation: "Extract nested logic into helpers.",
    }));
  }

  return findings;
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * Run full code-analysis on a Python file's lines.
 * @param {string[]} lines
 * @param {string}   relPath
 * @returns {Finding[]}
 */
function analyzeCodePython(lines, relPath) {
  return [
    ...analyzeCyclomaticComplexity(lines, relPath),
    ...analyzeDry(lines, relPath),
    ...analyzeSecurity(lines, relPath),
    ...analyzeSolid(lines, relPath),
    ...analyzeCognitiveComplexity(lines, relPath),
  ];
}

/**
 * Run security-audit on a Python file.
 * @param {string[]} lines
 * @param {string}   relPath
 * @returns {Finding[]}
 */
function auditSecurityPython(lines, relPath) {
  return analyzeSecurityAudit(lines, relPath);
}

module.exports = { analyzeCodePython, auditSecurityPython };
