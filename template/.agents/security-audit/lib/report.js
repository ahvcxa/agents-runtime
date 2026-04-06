"use strict";

/**
 * Report Generator - Detailed security findings with context
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Generates structured security findings with:
 * - OWASP/CWE references
 * - Severity levels
 * - Actionable recommendations
 * - Auto-fixable indicators
 */

const crypto = require("crypto");

class ReportGenerator {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.findings = [];
    this.summary = {
      files_scanned: 0,
      findings_total: 0,
      by_severity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
      by_owasp: {},
      by_cwe: {},
      auto_fixable_count: 0,
      suppressed_count: 0,
    };
  }

  /**
   * Generate unique finding ID using crypto
   */
  generateFindingId(file, line, cwe) {
    const input = `${file}:${line}:${cwe}`;
    return crypto.createHash("sha256").update(input).digest("hex").substring(0, 16);
  }

  /**
   * Add a finding to the report
   */
  addFinding(data) {
    const finding = {
      id: this.generateFindingId(data.file, data.line_start, data.cwe),
      skill: "security-audit",
      principle: `OWASP ${data.owasp}`,
      severity: data.severity,
      file: data.file,
      line_start: data.line_start,
      line_end: data.line_end || data.line_start,
      symbol: data.symbol || null,
      message: data.message,
      recommendation: data.recommendation,
      cwe_id: data.cwe,
      owasp_category: data.owasp,
      auto_fixable: data.auto_fixable || false,
      suppression_key: data.suppression_key,
      tags: data.tags || [],
      context: data.context || {},
    };

    this.findings.push(finding);

    // Update summary
    this.summary.findings_total++;
    this.summary.by_severity[finding.severity]++;
    this.summary.by_owasp[finding.owasp_category] = 
      (this.summary.by_owasp[finding.owasp_category] || 0) + 1;
    this.summary.by_cwe[finding.cwe_id] = 
      (this.summary.by_cwe[finding.cwe_id] || 0) + 1;

    if (finding.auto_fixable) {
      this.summary.auto_fixable_count++;
    }

    return finding;
  }

  /**
   * Mark finding as suppressed
   */
  markSuppressed(finding, suppressionReason = "") {
    const idx = this.findings.findIndex(f => f.id === finding.id);
    if (idx >= 0) {
      this.findings[idx].suppressed = true;
      this.findings[idx].suppression_reason = suppressionReason;
      this.summary.suppressed_count++;
    }
  }

  /**
   * Get active (non-suppressed) findings
   */
  getActiveFindings() {
    return this.findings.filter(f => !f.suppressed);
  }

  /**
   * Get suppressed findings
   */
  getSuppressedFindings() {
    return this.findings.filter(f => f.suppressed);
  }

  /**
   * Sort findings by severity
   */
  sortBySerit() {
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    return this.findings.sort((a, b) => {
      const aDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (aDiff !== 0) return aDiff;
      return a.line_start - b.line_start;
    });
  }

  /**
   * Get findings by severity level
   */
  getBySereve(severity) {
    return this.findings.filter(f => f.severity === severity && !f.suppressed);
  }

  /**
   * Get findings by OWASP category
   */
  getByOwasp(owaspCode) {
    return this.findings.filter(f => f.owasp_category === owaspCode && !f.suppressed);
  }

  /**
   * Get findings by CWE
   */
  getByCwe(cweId) {
    return this.findings.filter(f => f.cwe_id === cweId && !f.suppressed);
  }

  /**
   * Generate summary report
   */
  getSummaryReport() {
    const active = this.getActiveFindings();
    const suppressed = this.getSuppressedFindings();

    return {
      total_findings: this.findings.length,
      active_findings: active.length,
      suppressed_findings: suppressed.length,
      files_scanned: this.summary.files_scanned,
      by_severity: {
        CRITICAL: active.filter(f => f.severity === "CRITICAL").length,
        HIGH: active.filter(f => f.severity === "HIGH").length,
        MEDIUM: active.filter(f => f.severity === "MEDIUM").length,
        LOW: active.filter(f => f.severity === "LOW").length,
        INFO: active.filter(f => f.severity === "INFO").length,
      },
      by_owasp: this.summary.by_owasp,
      auto_fixable_count: this.summary.auto_fixable_count,
      has_critical: active.some(f => f.severity === "CRITICAL"),
      has_high: active.some(f => f.severity === "HIGH"),
    };
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(title = "Security Audit Report") {
    const active = this.getActiveFindings();
    const grouped = {};

    // Group by OWASP category
    for (const finding of active) {
      if (!grouped[finding.owasp_category]) {
        grouped[finding.owasp_category] = [];
      }
      grouped[finding.owasp_category].push(finding);
    }

    let html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .critical { background: #fee; border-left: 4px solid #c00; padding: 10px; margin: 10px 0; }
    .high { background: #fef0f0; border-left: 4px solid #f00; padding: 10px; margin: 10px 0; }
    .medium { background: #fffbf0; border-left: 4px solid #fa0; padding: 10px; margin: 10px 0; }
    .low { background: #f9f9f9; border-left: 4px solid #0a0; padding: 10px; margin: 10px 0; }
    .info { background: #f0f0ff; border-left: 4px solid #00f; padding: 10px; margin: 10px 0; }
    code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="summary">
    <h2>Summary</h2>
    <p>Total Findings: ${active.length}</p>
    <p>Critical: ${active.filter(f => f.severity === "CRITICAL").length}</p>
    <p>High: ${active.filter(f => f.severity === "HIGH").length}</p>
    <p>Medium: ${active.filter(f => f.severity === "MEDIUM").length}</p>
    <p>Low: ${active.filter(f => f.severity === "LOW").length}</p>
    <p>Info: ${active.filter(f => f.severity === "INFO").length}</p>
  </div>`;

    for (const [owasp, findings] of Object.entries(grouped)) {
      html += `<h2>${owasp}</h2>`;
      for (const f of findings) {
        const severityClass = f.severity.toLowerCase();
        html += `<div class="${severityClass}">
          <strong>[${f.severity}] ${f.message}</strong>
          <p>File: <code>${f.file}:${f.line_start}</code></p>
          <p>CWE: ${f.cwe_id}</p>
          <p><em>${f.recommendation}</em></p>
        </div>`;
      }
    }

    html += `</body></html>`;
    return html;
  }

  /**
   * Export findings as JSON
   */
  toJSON() {
    return {
      metadata: {
        tool: "security-audit",
        version: "2.0.0",
        generated_at: new Date().toISOString(),
      },
      summary: this.getSummaryReport(),
      findings: this.getActiveFindings(),
      suppressed: this.getSuppressedFindings(),
    };
  }
}

module.exports = { ReportGenerator };
