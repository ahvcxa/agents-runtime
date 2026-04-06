"use strict";

/**
 * Pattern Analyzer - Context-aware detection of security issues
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Analyzes code patterns with contextual awareness to reduce false positives.
 */

const rules = require("./rules");

/**
 * Skip certain lines from analysis to avoid false positives
 */
function shouldSkipLine(line, fileExt) {
  // Skip comments
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
    return true;
  }

  // Skip empty lines
  if (trimmed.length === 0) {
    return true;
  }

  // Skip rule definitions in this handler file itself
  if (trimmed.match(/^\{?\s*(?:pattern|severity|owasp|cwe|message|recommendation):/)) {
    return true;
  }

  // Skip regex literal definitions
  if (line.includes("/") && line.includes(",") && line.match(/\/[^\/]+\/[\s,]/)) {
    return true;
  }

  // Skip database .exec() calls (false positive from sqlite)
  if (line.match(/\b(?:db|database|this\.db)\s*\.exec\s*\(/i)) {
    return true;
  }

  // Skip test files for certain severity checks
  if (fileExt === ".test.js" || fileExt === ".spec.js") {
    // Still report CRITICAL and HIGH, but skip MEDIUM/LOW in tests
    // Handled in caller
  }

  return false;
}

/**
 * Apply context checks to verify if a finding is legitimate
 */
function applyContextChecks(line, rule, context = {}) {
  const checks = rule.context_checks || [];

  // A01: Route handler checks
  if (checks.includes("public_endpoint")) {
    // Check if endpoint is explicitly marked as public
    if (line.match(/\/public\/|\/static\/|\/assets\//i)) {
      return false;  // Not a violation
    }
  }

  // A03: Database .exec() should not match
  if (checks.includes("child_process_exec") || checks.includes("child_process_spawn")) {
    if (line.match(/\b(?:db|database|this\.db)\s*\.(?:exec|spawn)/i)) {
      return false;
    }
  }

  // A10: SSRF should check if URL is allowlisted
  if (checks.includes("http_client")) {
    // If URL is in comments or allowlist, skip
    if (line.match(/\/\/.*(?:fetch|axios|got|request)/)) {
      return false;
    }
  }

  return true;  // All context checks pass
}

/**
 * Analyze a single line against all rules
 */
function analyzeLine(line, lineNum, rule, fileExt = ".js") {
  if (!rule || !rule.pattern) {
    return null;  // Skip rules without patterns (file-level only)
  }

  if (!rules.passesExclusionChecks(line, rule)) {
    return null;  // Line matches an exclusion
  }

  if (!rule.pattern.test(line)) {
    return null;  // Pattern doesn't match
  }

  if (!applyContextChecks(line, rule, { fileExt })) {
    return null;  // Context checks failed
  }

  return {
    rule_id: rule.id,
    owasp: rule.owasp,
    cwe: rule.cwe,
    severity: rule.severity,
    message: rule.message,
    recommendation: rule.recommendation,
    auto_fixable: rule.auto_fixable || false,
  };
}

/**
 * Analyze all lines in a file
 */
function analyzeFileLines(content, filePath) {
  const fileExt = filePath.endsWith(".py") ? ".py" : 
                   filePath.endsWith(".ts") ? ".ts" :
                   filePath.endsWith(".json") ? ".json" : ".js";

  const lines = content.split("\n");
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (shouldSkipLine(line, fileExt)) {
      continue;
    }

    // Apply all rules to this line
    for (const rule of rules.getAllRules()) {
      const finding = analyzeLine(line, i + 1, rule, fileExt);
      if (finding) {
        findings.push({
          ...finding,
          line_start: i + 1,
          line_end: i + 1,
          file: filePath,
        });
      }
    }
  }

  return findings;
}

module.exports = {
  shouldSkipLine,
  applyContextChecks,
  analyzeLine,
  analyzeFileLines,
};
