"use strict";
/**
 * .agents/skills/code-analysis/handler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real JS handler for the code-analysis skill.
 * Implements all 5 principles defined in SKILL.md:
 *   1. Cyclomatic Complexity
 *   2. DRY (duplication detection)
 *   3. Security-First auditing
 *   4. SOLID adherence
 *   5. Cognitive Complexity
 *
 * @param {object} ctx
 * @param {string}   ctx.agentId
 * @param {number}   ctx.authLevel
 * @param {object}   ctx.input         - { files: string[] }
 * @param {object}   ctx.memory        - CrossAgentMemoryClient
 * @param {Function} ctx.log
 * @returns {Promise<Finding[]>}
 */

const fs   = require("fs");
const path = require("path");

// Python analyzer — co-located in .agents/helpers/ so it works in any installed project
let _pyAnalyzer;
function getPyAnalyzer() {
  if (!_pyAnalyzer) {
    try {
      // When installed: .agents/skills/code-analysis/ → .agents/helpers/
      _pyAnalyzer = require(path.join(__dirname, "../../helpers/python-analyzer"));
    } catch {
      _pyAnalyzer = null;
    }
  }
  return _pyAnalyzer;
}

// ─── UUID-v4 (no deps) ───────────────────────────────────────────────────────
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Finding builder ──────────────────────────────────────────────────────────
function finding({ principle, severity, file, line_start, line_end, symbol, message, recommendation, cwe_id, owasp_category, auto_fixable = false }) {
  const key = `${principle.toLowerCase().replace(/\s+/g, "-")}-${path.basename(file)}-L${line_start}`;
  return {
    id:               uuid(),
    skill:            "code-analysis",
    principle,
    severity,
    file,
    line_start,
    line_end:         line_end ?? line_start,
    symbol:           symbol ?? undefined,
    message,
    recommendation,
    cwe_id:           cwe_id ?? undefined,
    owasp_category:   owasp_category ?? undefined,
    auto_fixable,
    suppression_key:  key,
  };
}

// ─── File discovery ───────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"]);

function resolveFiles(inputs, projectRoot) {
  const result = [];
  for (const input of inputs) {
    const abs = path.isAbsolute(input) ? input : path.join(projectRoot, input);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      collectFilesRecursive(abs, result);
    } else if (SUPPORTED_EXTS.has(path.extname(abs))) {
      result.push(abs);
    }
  }
  return result;
}

function collectFilesRecursive(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFilesRecursive(full, out);
    else if (SUPPORTED_EXTS.has(path.extname(entry.name))) out.push(full);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 1 — Cyclomatic Complexity
// CC = 1 + (if / else if / for / while / do / case / catch / && / || / ?? / ternary)
// ─────────────────────────────────────────────────────────────────────────────
function analyzeCyclomaticComplexity(lines, relPath, findings) {
  // Extract functions via simple heuristics
  const functionPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\(.*\)\s*\{|async\s+(\w+)\s*\()/;
  const decisionPattern = /\bif\b|\belse if\b|\bfor\b|\bwhile\b|\bdo\b|\bcase\b|\bcatch\b|(?<![=!<>])&&(?![&=])|(?<![|=!])\|\|(?![|=])|\?\?(?!=)|\?(?![.?])/g;

  let inFunction = false;
  let functionStart = 0;
  let functionName = "";
  let braceDepth = 0;
  let functionBraceStart = 0;
  let cc = 1;
  let functionLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.replace(/\/\/.*$/, "").replace(/`[^`]*`/g, '""');

    if (!inFunction) {
      const match = stripped.match(functionPattern);
      if (match && stripped.includes("{")) {
        inFunction     = true;
        functionStart  = i + 1;
        functionName   = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "(anonymous)";
        functionBraceStart = braceDepth;
        cc             = 1;
        functionLines  = [];
      }
    }

    if (inFunction) {
      functionLines.push(line);
      const decisions = (stripped.match(decisionPattern) ?? []).length;
      cc += decisions;

      for (const ch of stripped) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      // Function ends when brace depth returns to where it started
      if (braceDepth <= functionBraceStart && functionLines.length > 1) {
        inFunction = false;
        const functionEnd = i + 1;

        if (cc >= 11) {
          const severity = cc > 20 ? "CRITICAL" : "HIGH";
          findings.push(finding({
            principle:      "Cyclomatic Complexity",
            severity,
            file:           relPath,
            line_start:     functionStart,
            line_end:       functionEnd,
            symbol:         functionName,
            message:        `Function '${functionName}' has cyclomatic complexity of ${cc} (threshold: ${cc > 20 ? ">20 unmaintainable" : "11-20 complex"})`,
            recommendation: cc > 20
              ? `Decompose '${functionName}' into smaller functions. Consider Strategy or Command pattern.`
              : `Add @complexity annotation and plan decomposition of '${functionName}'.`,
            auto_fixable:   false,
          }));
        }
      }
    } else {
      // Track brace depth outside functions too
      for (const ch of stripped) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 2 — DRY (magic numbers/strings, duplicate blocks)
// ─────────────────────────────────────────────────────────────────────────────
function analyzeDry(lines, relPath, findings) {
  const magicNumbers = new Map(); // value → [lineNums]
  const magicStrings = new Map(); // value → [lineNums]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, "");

    // Magic numbers (exclude 0, 1, -1, 2, common lengths)
    const numMatches = line.matchAll(/(?<![.\w])(\d{2,})(?!\s*[:.,]?\s*\w)/g);
    for (const m of numMatches) {
      const val = m[1];
      if (["100", "200", "201", "400", "401", "403", "404", "500"].includes(val)) continue; // HTTP codes OK
      if (!magicNumbers.has(val)) magicNumbers.set(val, []);
      magicNumbers.get(val).push(i + 1);
    }

    // Magic strings (quoted, > 4 chars, not imports/requires)
    if (!line.match(/require\(|import\s|from\s['"]|console\.|logger\./)) {
      const strMatches = line.matchAll(/['"]([A-Za-z][A-Za-z0-9_\-]{4,})['"](?!\s*:)/g);
      for (const m of strMatches) {
        const val = m[1];
        if (!magicStrings.has(val)) magicStrings.set(val, []);
        magicStrings.get(val).push(i + 1);
      }
    }
  }

  // Report magic numbers used > 2 times
  for (const [val, lineNums] of magicNumbers) {
    if (lineNums.length > 2) {
      findings.push(finding({
        principle:      "DRY",
        severity:       "MEDIUM",
        file:           relPath,
        line_start:     lineNums[0],
        line_end:       lineNums[lineNums.length - 1],
        message:        `Magic number '${val}' appears ${lineNums.length} times (lines ${lineNums.join(", ")})`,
        recommendation: `Extract '${val}' to a named constant, e.g. const MAX_RETRY_COUNT = ${val}`,
        auto_fixable:   false,
      }));
    }
  }

  // Report magic strings used > 2 times
  for (const [val, lineNums] of magicStrings) {
    if (lineNums.length > 2) {
      findings.push(finding({
        principle:      "DRY",
        severity:       "MEDIUM",
        file:           relPath,
        line_start:     lineNums[0],
        line_end:       lineNums[lineNums.length - 1],
        message:        `Magic string '${val}' appears ${lineNums.length} times (lines ${lineNums.join(", ")})`,
        recommendation: `Extract '${val}' to a named constant or enum`,
        auto_fixable:   false,
      }));
    }
  }

  // Duplicate block detection — non-overlapping scan.
  // We hash each meaningful line, then look for the first re-occurrence
  // of a BLOCK_SIZE-line fingerprint. On match we emit ONE finding and
  // jump past the matched range so overlapping windows don't fire again.
  const BLOCK_SIZE = 6;
  const MIN_BLOCK_CHARS = 120; // ignore tiny blocks (imports, closing braces…)

  // Build a cleaned fingerprint per line
  const fingerprints = lines.map(l =>
    l.trim().replace(/\/\/.*$/, "").replace(/\s+/g, " ")
  );

  const seen = new Map(); // fingerprint → first-occurrence start index
  const reported = new Set(); // track already-reported first-occurrence starts

  let i = 0;
  while (i <= fingerprints.length - BLOCK_SIZE) {
    // Build a block fingerprint (only meaningful lines)
    const blockLines = fingerprints.slice(i, i + BLOCK_SIZE);
    const meaningful = blockLines.filter(l => l.length > 4 && l !== "{" && l !== "}");
    const blockKey   = meaningful.join("\n");

    if (meaningful.length < Math.ceil(BLOCK_SIZE * 0.6) || blockKey.length < MIN_BLOCK_CHARS) {
      i++;
      continue;
    }

    if (seen.has(blockKey) && !reported.has(seen.get(blockKey))) {
      const prevStart = seen.get(blockKey);
      reported.add(prevStart);
      findings.push(finding({
        principle:      "DRY",
        severity:       "HIGH",
        file:           relPath,
        line_start:     prevStart + 1,
        line_end:       i + BLOCK_SIZE,
        message:        `Structural clone: ${BLOCK_SIZE}-line code block first at L${prevStart + 1}–${prevStart + BLOCK_SIZE}, duplicated at L${i + 1}–${i + BLOCK_SIZE}`,
        recommendation: "Extract the duplicated block into a shared named function",
        auto_fixable:   false,
      }));
      i += BLOCK_SIZE; // jump past to avoid cascading overlapping reports
    } else {
      if (!seen.has(blockKey)) seen.set(blockKey, i);
      i++;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 3 — Security-First Auditing
// ─────────────────────────────────────────────────────────────────────────────
const SECURITY_RULES = [
  // 3a. Injection
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
  // 3b. Insecure deserialization
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
  // 3c. Hardcoded secrets
  {
    pattern: /(?:api[_-]?key|secret|password|token|bearer|auth(?:orization)?)\s*[:=]\s*['"`][A-Za-z0-9+/=_\-]{8,}/i,
    message: "Hardcoded secret/credential detected",
    recommendation: "Move credential to environment variable or secrets manager. Never hardcode in source.",
    severity: "CRITICAL", principle: "Security — Hardcoded Secrets", cwe_id: "CWE-798", owasp: "A02:2021",
  },
  // 3e. Cryptographic weakness
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
  // Path traversal
  {
    pattern: /readFile(?:Sync)?\s*\([^)]*(?:req\.|params\.|query\.)/,
    message: "Potential path traversal — file path derived from user input",
    recommendation: "Validate and normalize paths. Use path.resolve() and confirm the result is within expected directory.",
    severity: "CRITICAL", principle: "Security — Injection", cwe_id: "CWE-22", owasp: "A01:2021",
  },
];

function analyzeSecurity(lines, relPath, findings) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and test files
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

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 4 — SOLID
// ─────────────────────────────────────────────────────────────────────────────
function analyzeSolid(lines, relPath, findings) {
  // SRP: file > 500 LoC
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length > 500) {
    findings.push(finding({
      principle:      "SOLID — Single Responsibility",
      severity:       "MEDIUM",
      file:           relPath,
      line_start:     1,
      line_end:       lines.length,
      message:        `File has ${nonEmpty.length} non-empty lines (>500). Likely violates Single Responsibility Principle.`,
      recommendation: "Split this module into smaller, focused modules. Each module should have one reason to change.",
      auto_fixable:   false,
    }));
  }

  // OCP: large if-else / switch chains
  let consecutiveElseIf = 0;
  let chainStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(else\s+if|case\s)/i.test(lines[i])) {
      if (consecutiveElseIf === 0) chainStart = i + 1;
      consecutiveElseIf++;
    } else if (/^\s*(if\s*\()/i.test(lines[i])) {
      consecutiveElseIf = 0;
    } else if (consecutiveElseIf > 0 && !/^\s*(else|{|})/i.test(lines[i])) {
      if (consecutiveElseIf > 4) {
        findings.push(finding({
          principle:      "SOLID — Open/Closed",
          severity:       "MEDIUM",
          file:           relPath,
          line_start:     chainStart,
          line_end:       i,
          message:        `if-else / case chain with ${consecutiveElseIf + 1} branches. Violates Open/Closed Principle.`,
          recommendation: "Replace type-based dispatch with polymorphism, strategy pattern, or a lookup map.",
          auto_fixable:   false,
        }));
      }
      consecutiveElseIf = 0;
    }
  }

  // DIP: direct `new ClassName()` in non-constructor/factory context
  const dipPattern = /=\s*new\s+([A-Z][A-Za-z0-9_]+)\s*\(/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(class|constructor|\/\/)/.test(line)) continue;
    let match;
    while ((match = dipPattern.exec(line)) !== null) {
      const className = match[1];
      // Ignore Error, Map, Set, Promise, Date (built-ins)
      if (/^(Error|Map|Set|Promise|Date|Array|RegExp|URL|Buffer)$/.test(className)) continue;
      findings.push(finding({
        principle:      "SOLID — Dependency Inversion",
        severity:       "LOW",
        file:           relPath,
        line_start:     i + 1,
        line_end:       i + 1,
        message:        `Direct instantiation of '${className}' in business logic. Depends on concrete implementation.`,
        recommendation: `Inject '${className}' as a dependency or use a factory/IoC container.`,
        auto_fixable:   false,
      }));
    }
    dipPattern.lastIndex = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPLE 5 — Cognitive Complexity
// Penalizes: nesting levels, breaks in flow (break/continue/goto), recursion
// ─────────────────────────────────────────────────────────────────────────────
function analyzeCognitiveComplexity(lines, relPath, findings) {
  const funcPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/;
  let inFunction = false;
  let fnName = "";
  let fnStart = 0;
  let braceDepth = 0;
  let fnBraceStart = 0;
  let cogScore = 0;
  let nestLevel = 0;

  const NESTING_TRIGGERS  = /\b(if|for|while|do|switch|catch)\b/g;
  const FLOW_BREAKS       = /\b(break|continue|return|throw)\b/;

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i];
    const stripped = line.replace(/\/\/.*$/, "");

    if (!inFunction) {
      const m = stripped.match(funcPattern);
      if (m && stripped.includes("{")) {
        inFunction    = true;
        fnName        = m[1] ?? m[2] ?? "(anonymous)";
        fnStart       = i + 1;
        fnBraceStart  = braceDepth;
        cogScore      = 0;
        nestLevel     = 0;
      }
    }

    if (inFunction) {
      const nestingMatches = [...stripped.matchAll(NESTING_TRIGGERS)].length;
      cogScore += nestingMatches * Math.max(1, nestLevel);
      if (nestingMatches > 0 && stripped.includes("{")) nestLevel++;

      if (FLOW_BREAKS.test(stripped)) cogScore += 1;

      for (const ch of stripped) {
        if (ch === "{") braceDepth++;
        if (ch === "}") { braceDepth--; nestLevel = Math.max(0, nestLevel - 1); }
      }

      if (braceDepth <= fnBraceStart && i > fnStart) {
        inFunction = false;
        if (cogScore > 15) {
          findings.push(finding({
            principle:      "Cognitive Complexity",
            severity:       cogScore > 30 ? "HIGH" : "MEDIUM",
            file:           relPath,
            line_start:     fnStart,
            line_end:       i + 1,
            symbol:         fnName,
            message:        `Function '${fnName}' has cognitive complexity score of ${cogScore} (threshold: 15)`,
            recommendation: `Simplify '${fnName}' by extracting nested logic into well-named helper functions. Reduce nesting depth.`,
            auto_fixable:   false,
          }));
        }
      }
    } else {
      for (const ch of stripped) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppression filter
// ─────────────────────────────────────────────────────────────────────────────
function filterSuppressed(findings, lines, log) {
  const suppressions = new Set();
  for (const line of lines) {
    const m = line.match(/agent-suppress:\s*(\S+)/);
    if (m) suppressions.add(m[1]);
  }
  if (suppressions.size === 0) return findings;

  return findings.filter((f) => {
    if (suppressions.has(f.suppression_key)) {
      log({ event_type: "INFO", message: `Suppressed finding: ${f.suppression_key}` });
      return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
async function execute({ agentId, authLevel, input, memory, log }) {
  const files  = input?.files ?? [];
  const rootDir = input?.project_root ?? process.cwd();

  log({ event_type: "INFO", agent_id: agentId, message: `code-analysis: scanning ${files.length} path(s)` });

  const resolvedFiles = resolveFiles(files, rootDir);
  log({ event_type: "INFO", agent_id: agentId, message: `Resolved ${resolvedFiles.length} file(s) for analysis` });

  const allFindings = [];
  const summary     = { files_scanned: 0, by_severity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 } };

  for (const absPath of resolvedFiles) {
    let content;
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch {
      log({ event_type: "WARN", message: `Cannot read file: ${absPath}` });
      continue;
    }

    const lines   = content.split("\n");
    const relPath = path.relative(rootDir, absPath);
    const ext     = path.extname(absPath).toLowerCase();
    const filefindings = [];

    if (ext === ".py") {
      // Python — use the dedicated Python analyzer
      const py = getPyAnalyzer();
      if (py) {
        filefindings.push(...py.analyzeCodePython(lines, relPath));
      } else {
        log({ event_type: "WARN", message: `Python analyzer not available — skipping ${relPath}` });
      }
    } else {
      analyzeCyclomaticComplexity(lines, relPath, filefindings);
      analyzeDry(lines, relPath, filefindings);
      analyzeSecurity(lines, relPath, filefindings);
      analyzeSolid(lines, relPath, filefindings);
      analyzeCognitiveComplexity(lines, relPath, filefindings);
    }

    const filtered = filterSuppressed(filefindings, lines, log);
    allFindings.push(...filtered);
    summary.files_scanned++;

    for (const f of filtered) {
      summary.by_severity[f.severity] = (summary.by_severity[f.severity] ?? 0) + 1;
    }

    if (filtered.length > 0) {
      log({ event_type: "INFO", message: `${relPath}: ${filtered.length} finding(s)` });
    }
  }

  // Cache findings in memory (tagged for retrieval)
  try {
    memory.set(`skill:code-analysis:cache:last-run:${agentId}`, {
      findings: allFindings,
      summary,
      scanned_at: new Date().toISOString(),
    }, {
      ttl_seconds: 3600,
      tags: ["skill:code-analysis", "context:analysis", "lifecycle:transient"],
    });
  } catch { /* memory write may fail for read-only agents — that's OK */ }

  log({
    event_type: "INFO",
    message:    `Analysis complete. ${summary.files_scanned} file(s), ${allFindings.length} finding(s).`,
    summary,
  });

  return { findings: allFindings, summary };
}

module.exports = { execute };
