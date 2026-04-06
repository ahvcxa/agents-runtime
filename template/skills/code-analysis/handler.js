"use strict";
/**
 * template/skills/code-analysis/handler.js (Refactored v2.1.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrator for code analysis skill.
 * Delegates to modular analyzer libraries in ./lib/
 *
 * @param {object} ctx - { agentId, authLevel, input, memory, log }
 * @returns {Promise<{ findings, summary }>}
 */

const fs   = require("fs");
const path = require("path");
const { analyzeCyclomaticComplexity } = require("./lib/cyclomatic-complexity");
const { analyzeDry } = require("./lib/dry");
const { analyzeSecurity } = require("./lib/security");
const { analyzeSolid } = require("./lib/solid");
const { analyzeCognitiveComplexity } = require("./lib/cognitive-complexity");

// Python analyzer
let _pyAnalyzer;
function getPyAnalyzer() {
  if (!_pyAnalyzer) {
    try {
      _pyAnalyzer = require(path.join(__dirname, "../../helpers/python-analyzer"));
    } catch {
      _pyAnalyzer = null;
    }
  }
  return _pyAnalyzer;
}

// UUID-v4 (no deps, uses crypto for randomness)
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Finding builder
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

// File discovery
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

// Suppression filter
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

// Main handler
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
      const py = getPyAnalyzer();
      if (py) {
        filefindings.push(...py.analyzeCodePython(lines, relPath));
      } else {
        log({ event_type: "WARN", message: `Python analyzer not available — skipping ${relPath}` });
      }
    } else {
      // Run all JavaScript analyzers using the modular approach
      analyzeCyclomaticComplexity(lines, relPath, filefindings, finding);
      analyzeDry(lines, relPath, filefindings, finding);
      analyzeSecurity(lines, relPath, filefindings, finding);
      analyzeSolid(lines, relPath, filefindings, finding);
      analyzeCognitiveComplexity(lines, relPath, filefindings, finding);
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
