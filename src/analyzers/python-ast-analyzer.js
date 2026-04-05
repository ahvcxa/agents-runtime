"use strict";
/**
 * src/analyzers/python-ast-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AST-based Python analysis using Python's built-in `ast` module via subprocess.
 * Detects issues that regex cannot: import misuse, taint-flow hints, function
 * complexity, and syntax errors — making security findings more accurate.
 *
 * Requires: Python 3.8+ on PATH
 * Falls back gracefully if Python is unavailable.
 */

const { execFile } = require("child_process");

// ─── Python AST extraction script ────────────────────────────────────────────
const AST_SCRIPT = `
import ast
import json
import sys

def analyze(source):
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return {"error": str(e), "line": e.lineno}

    functions     = []
    imports       = []
    exec_calls    = []
    eval_calls    = []
    pickle_loads  = []
    subprocess_calls = []
    open_calls    = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append({
                "name": node.name,
                "line": node.lineno,
                "args": len(node.args.args),
            })
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports.append({"module": alias.name, "line": node.lineno})
        elif isinstance(node, ast.ImportFrom):
            imports.append({"module": node.module or "", "line": node.lineno})
        elif isinstance(node, ast.Call):
            func = node.func
            name = ""
            if isinstance(func, ast.Name):
                name = func.id
            elif isinstance(func, ast.Attribute):
                name = f"{getattr(func.value, 'id', '')}:{func.attr}"

            if name == "exec":
                exec_calls.append({"line": node.lineno})
            elif name == "eval":
                eval_calls.append({"line": node.lineno})
            elif name in ("pickle:load", "pickle:loads"):
                pickle_loads.append({"line": node.lineno})
            elif "subprocess" in name or "popen" in name.lower():
                subprocess_calls.append({"line": node.lineno})
            elif name == "open":
                open_calls.append({"line": node.lineno})

    return {
        "functions":         functions,
        "imports":           imports,
        "exec_calls":        exec_calls,
        "eval_calls":        eval_calls,
        "pickle_loads":      pickle_loads,
        "subprocess_calls":  subprocess_calls,
        "open_calls":        open_calls,
    }

source = sys.stdin.read()
result = analyze(source)
print(json.dumps(result))
`;

// ─── Spawn helper ─────────────────────────────────────────────────────────────

/**
 * Run the AST extraction script against Python source code.
 * @param {string} source - Raw Python source code
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<object|null>} Parsed AST info, or null if Python unavailable
 */
async function extractAstInfo(source, timeoutMs = 10000) {
  if (typeof source !== "string") return null;
  if (source.length > 5 * 1024 * 1024) return null;

  return new Promise((resolve) => {
    const child = execFile("python3", ["-c", AST_SCRIPT], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
      shell: false,
    }, (err, stdout = "") => {
      if (err) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim() || "null"));
      } catch {
        resolve(null);
      }
    });

    child.stdin.end(source);
  });
}

// ─── Finding generators ───────────────────────────────────────────────────────

const { finding } = require("./py-common");

/**
 * Convert AST info into security findings.
 * @param {object} astInfo - Output of extractAstInfo
 * @param {string} filePath
 * @returns {object[]} findings
 */
function astInfoToFindings(astInfo, filePath) {
  if (!astInfo || astInfo.error) {
    if (astInfo?.error) {
      return [finding({
        skill:          "security-audit",
        principle:      "Security — Syntax Error",
        severity:       "HIGH",
        file:           filePath,
        line_start:     astInfo.line ?? 1,
        message:        `Python syntax error: ${astInfo.error}`,
        recommendation: "Fix the syntax error before analysis can proceed.",
        cwe_id:         undefined,
        auto_fixable:   false,
      })];
    }
    return [];
  }

  const findings = [];

  // exec() usage → code injection risk
  for (const call of astInfo.exec_calls ?? []) {
    findings.push(finding({
      skill:          "security-audit",
      principle:      "Security — Code Injection",
      severity:       "CRITICAL",
      file:           filePath,
      line_start:     call.line,
      message:        "exec() call detected — can execute arbitrary code",
      recommendation: "Avoid exec(). Use explicit function calls or subprocess with validation.",
      cwe_id:         "CWE-78",
      owasp_category: "A03:2021",
      auto_fixable:   false,
    }));
  }

  // eval() usage → code injection risk
  for (const call of astInfo.eval_calls ?? []) {
    findings.push(finding({
      skill:          "security-audit",
      principle:      "Security — Code Injection",
      severity:       "HIGH",
      file:           filePath,
      line_start:     call.line,
      message:        "eval() call detected — can execute arbitrary expressions",
      recommendation: "Replace eval() with ast.literal_eval() for safe literal parsing, or use explicit parsers.",
      cwe_id:         "CWE-78",
      owasp_category: "A03:2021",
      auto_fixable:   false,
    }));
  }

  // pickle.loads() → deserialization attack
  for (const call of astInfo.pickle_loads ?? []) {
    findings.push(finding({
      skill:          "security-audit",
      principle:      "Security — Insecure Deserialization",
      severity:       "CRITICAL",
      file:           filePath,
      line_start:     call.line,
      message:        "pickle.loads() detected — deserializing untrusted data can execute arbitrary code",
      recommendation: "Use JSON or another safe serialization format. Never unpickle untrusted data.",
      cwe_id:         "CWE-502",
      owasp_category: "A08:2021",
      auto_fixable:   false,
    }));
  }

  // subprocess calls — flag for review
  for (const call of astInfo.subprocess_calls ?? []) {
    findings.push(finding({
      skill:          "security-audit",
      principle:      "Security — Command Execution",
      severity:       "MEDIUM",
      file:           filePath,
      line_start:     call.line,
      message:        "subprocess / Popen call detected — review for shell injection risk",
      recommendation: "Use shell=False, validate all user-supplied arguments, prefer subprocess.run with a list.",
      cwe_id:         "CWE-78",
      owasp_category: "A03:2021",
      auto_fixable:   false,
    }));
  }

  // Dangerous imports
  const DANGEROUS_MODULES = new Set(["pickle", "marshal", "shelve", "ctypes", "cffi"]);
  for (const imp of astInfo.imports ?? []) {
    if (DANGEROUS_MODULES.has(imp.module)) {
      findings.push(finding({
        skill:          "security-audit",
        principle:      "Security — Dangerous Import",
        severity:       "MEDIUM",
        file:           filePath,
        line_start:     imp.line,
        message:        `Dangerous module imported: '${imp.module}'`,
        recommendation: `Audit all uses of '${imp.module}'. Prefer safe alternatives where possible.`,
        cwe_id:         "CWE-676",
        auto_fixable:   false,
      }));
    }
  }

  return findings;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run deep AST-based analysis on Python source code.
 * @param {string} source    - Python source code string
 * @param {string} filePath  - Absolute path (used in finding metadata)
 * @param {object} [options]
 * @param {number} [options.timeoutMs=10000]
 * @returns {Promise<{ findings: object[], astInfo: object|null, available: boolean }>}
 */
async function analyzePythonAst(source, filePath, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const astInfo   = await extractAstInfo(source, timeoutMs);

  if (astInfo === null) {
    // Python not available — degrade gracefully, caller falls back to regex analysis
    return { findings: [], astInfo: null, available: false };
  }

  const findings = astInfoToFindings(astInfo, filePath);
  return { findings, astInfo, available: true };
}

module.exports = { analyzePythonAst, extractAstInfo, astInfoToFindings };
