"use strict";

/**
 * .agents/skills/security-audit/handler.js (v2.0.0 - Enterprise Grade)
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * OWASP Top 10 (2021) deep security audit handler with:
 * - Professional rule management
 * - Context-aware pattern detection
 * - Robust suppression engine
 * - Comprehensive reporting
 *
 * @param {object} ctx
 * @param {string}   ctx.agentId
 * @param {number}   ctx.authLevel
 * @param {object}   ctx.input         - { files?: string[], scan_directory?: string, project_root?: string }
 * @param {object}   ctx.memory
 * @param {Function} ctx.log
 * @returns {Promise<{ findings: Finding[], summary: object }>}
 */

const fs = require("fs");
const path = require("path");
const rules = require("./lib/rules");
const analyzer = require("./lib/analyzer");
const { SuppressionEngine } = require("./lib/suppression");
const { ReportGenerator } = require("./lib/report");

const SUPPORTED_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml", ".env", ".py"]);
const SELF_PATH = path.resolve(__filename);

// ─── File Resolution ────────────────────────────────────────────────────────
function resolveFiles(inputs, root) {
  const result = [];
  for (const input of inputs) {
    const abs = path.isAbsolute(input) ? input : path.join(root, input);
    if (!fs.existsSync(abs)) continue;
    if (path.resolve(abs) === SELF_PATH) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) collectFiles(abs, result);
    else if (SUPPORTED_EXTS.has(path.extname(abs).toLowerCase())) result.push(abs);
  }
  return result;
}

function collectFiles(dir, out) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (path.resolve(full) === SELF_PATH) continue;
      if (entry.isDirectory()) collectFiles(full, out);
      else if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  } catch {
    // Silently skip inaccessible directories
  }
}

// ─── File-level Checks ──────────────────────────────────────────────────────
function checkPackageJson(content, relPath, report) {
  try {
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const RISKY_PACKAGES = {
      lodash: (v) => v.match(/^\^?[0-3]\./),
      express: (v) => v.match(/^\^?[0-3]\./),
      log4js: (v) => v.match(/^\^?[0-5]\./),
      axios: (v) => v.match(/^\^?0\./),
      "node-fetch": (v) => v.match(/^\^?[0-1]\./),
      ejs: (v) => v.match(/^\^?[0-2]\./),
    };

    for (const [pkgName, checkFn] of Object.entries(RISKY_PACKAGES)) {
      const ver = deps[pkgName];
      if (ver && checkFn(ver)) {
        report.addFinding({
          file: relPath,
          line_start: 1,
          line_end: 1,
          owasp: "A06:2021",
          cwe: "CWE-1104",
          severity: "HIGH",
          message: `Potentially outdated/vulnerable package: '${pkgName}@${ver}'`,
          recommendation: `Run 'npm audit' and upgrade '${pkgName}' to latest stable version.`,
          auto_fixable: false,
          tags: ["vulnerable-dependency"],
        });
      }
    }
  } catch {
    // Not valid JSON, skip
  }
}

function checkEnvFile(content, relPath, report) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^DEBUG\s*=\s*true|^LOG_LEVEL\s*=\s*debug/i.test(lines[i])) {
      report.addFinding({
        file: relPath,
        line_start: i + 1,
        line_end: i + 1,
        owasp: "A05:2021",
        cwe: "CWE-16",
        severity: "LOW",
        message: "Debug/verbose logging enabled in environment config",
        recommendation: "Disable debug logging in production environments.",
        auto_fixable: false,
        tags: ["configuration"],
      });
    }
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────
async function execute({ agentId, authLevel, input, memory, log }) {
  const files = input?.files ?? [];
  const scanDir = input?.scan_directory;
  const rootDir = input?.project_root ?? process.cwd();

  log({ event_type: "INFO", agent_id: agentId, message: "security-audit: initializing v2.0.0" });

  // Resolve files
  let resolvedFiles = [];
  if (files.length > 0) {
    resolvedFiles = resolveFiles(files, rootDir);
  } else if (scanDir) {
    const scanPath = path.isAbsolute(scanDir) ? scanDir : path.join(rootDir, scanDir);
    if (fs.existsSync(scanPath)) {
      collectFiles(scanPath, resolvedFiles);
    }
  }

  log({ event_type: "INFO", message: `Resolved ${resolvedFiles.length} file(s) for scanning` });

  const report = new ReportGenerator(rootDir);
  report.summary.files_scanned = resolvedFiles.length;

  // Process each file
  for (const absPath of resolvedFiles) {
    let content;
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch (err) {
      log({ event_type: "WARN", message: `Cannot read: ${absPath}` });
      continue;
    }

    const relPath = path.relative(rootDir, absPath);
    const ext = path.extname(absPath).toLowerCase();

    // File-level checks
    if (relPath.endsWith("package.json")) {
      checkPackageJson(content, relPath, report);
    }
    if (relPath.endsWith(".env") || relPath.endsWith(".env.example")) {
      checkEnvFile(content, relPath, report);
    }

    // Line-level analysis (JS/TS/JSON/YAML)
    if (![".py"].includes(ext)) {
      const findings = analyzer.analyzeFileLines(content, relPath);
      for (const finding of findings) {
        report.addFinding({
          file: finding.file,
          line_start: finding.line_start,
          line_end: finding.line_end,
          owasp: finding.owasp,
          cwe: finding.cwe,
          severity: finding.severity,
          message: finding.message,
          recommendation: finding.recommendation,
          auto_fixable: finding.auto_fixable,
          suppression_key: `sec-${finding.owasp.replace(/:/g, "")}-${path.basename(relPath)}-L${finding.line_start}`,
        });
      }
    }
  }

  // Apply suppression rules
  const suppressed = [];
  for (const absPath of resolvedFiles) {
    let content;
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch {
      continue;
    }
    const relPath = path.relative(rootDir, absPath);

    const suppressionEngine = new SuppressionEngine();
    suppressionEngine.parseSuppressions(content);

    // Check findings for this file and suppress if needed
    const fileFindings = report.findings.filter(f => f.file === relPath);
    for (const finding of fileFindings) {
      const suppInfo = suppressionEngine.isSuppressed(finding);
      if (suppInfo.suppressed) {
        report.markSuppressed(finding, suppInfo.reason);
        suppressed.push({
          finding_id: finding.id,
          file: relPath,
          owasp: finding.owasp_category,
          reason: suppInfo.reason,
        });
        log({ event_type: "INFO", message: `Suppressed [${finding.owasp_category}:${finding.line_start}]: ${finding.cwe_id}` });
      }
    }
  }

  // Generate summary
  const summary = report.getSummaryReport();

  // Cache results
  try {
    memory.set(`skill:security-audit:cache:${agentId}`, {
      findings: report.getActiveFindings(),
      summary,
      suppressed,
      scanned_at: new Date().toISOString(),
    }, { ttl_seconds: 3600, tags: ["skill:security-audit", "context:analysis"] });
  } catch {
    // Ignore memory errors
  }

  log({
    event_type: "INFO",
    message: `Security audit complete: ${summary.active_findings} finding(s) in ${summary.files_scanned} file(s)`,
    summary,
  });

  return {
    findings: report.getActiveFindings(),
    summary,
    suppressed,
  };
}

module.exports = { execute };
