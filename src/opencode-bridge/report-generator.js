/**
 * ReportGenerator - Creates professional analysis reports
 * 
 * Generates:
 * - Executive summaries
 * - Detailed technical reports
 * - PDF/HTML reports
 * - Trend analysis
 * - Compliance reports
 */

class ReportGenerator {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.organization = options.organization || 'Organization';
    this.includeHistoricalTrends = options.includeHistoricalTrends !== false;
  }

  /**
   * Generate executive summary
   * @param {Object} aggregatedFindings - From DecisionEngine
   * @param {Object} riskScore - From DecisionEngine
   * @returns {string} Executive summary text
   */
  generateExecutiveSummary(aggregatedFindings, riskScore) {
    let summary = '';

    summary += 'EXECUTIVE SUMMARY\n';
    summary += '='.repeat(60) + '\n\n';

    // Risk assessment
    summary += `Risk Level: ${riskScore.riskLevel}\n`;
    summary += `Risk Score: ${riskScore.score}/100\n\n`;

    // Key metrics
    summary += 'KEY METRICS\n';
    summary += '-'.repeat(40) + '\n';
    summary += `Total Issues Identified: ${aggregatedFindings.totalFindings}\n`;
    summary += `  - Critical: ${riskScore.breakdown.critical}\n`;
    summary += `  - High: ${riskScore.breakdown.high}\n`;
    summary += `  - Medium: ${riskScore.breakdown.medium}\n`;
    summary += `  - Code Analysis Issues: ${aggregatedFindings.sourceBreakdown.codeAnalysis}\n`;
    summary += `  - Security Issues: ${aggregatedFindings.sourceBreakdown.securityAudit}\n\n`;

    // Risk summary
    summary += 'RISK ASSESSMENT\n';
    summary += '-'.repeat(40) + '\n';
    summary += `${riskScore.summary}\n\n`;

    // Recommendations
    const criticalCount = riskScore.breakdown.critical;
    if (criticalCount > 0) {
      summary += `ACTION REQUIRED: ${criticalCount} critical issue(s) must be addressed immediately.\n\n`;
    } else {
      summary += 'NEXT STEPS: Address high-severity issues before next release.\n\n';
    }

    return summary;
  }

  /**
   * Generate detailed technical report
   * @param {Object} analysisResult - Complete analysis result
   * @returns {string} Detailed report
   */
  generateTechnicalReport(analysisResult) {
    let report = '';

    const { analysis, path, timestamp } = analysisResult;
    const { aggregated, riskScore, recommendations, actionPlan } = analysis;

    // Header
    report += 'CODE ANALYSIS TECHNICAL REPORT\n';
    report += '='.repeat(70) + '\n\n';
    report += `Generated: ${timestamp}\n`;
    report += `Project Path: ${path}\n`;
    report += `Organization: ${this.organization}\n\n`;

    // Executive Summary
    report += this.generateExecutiveSummary(aggregated, riskScore);

    // Finding Categories
    report += 'DETAILED FINDINGS BY CATEGORY\n';
    report += '-'.repeat(60) + '\n\n';

    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    for (const [category, severityMap] of Object.entries(aggregated.byCategory)) {
      report += `\n${category.toUpperCase()}\n`;
      report += '  ' + '-'.repeat(40) + '\n';

      const severities = Object.keys(severityMap).sort(
        (a, b) => (severityOrder[a] || 999) - (severityOrder[b] || 999)
      );

      for (const severity of severities) {
        const findings = severityMap[severity];
        report += `\n  ${severity} (${findings.length}):\n`;

        for (const finding of findings.slice(0, 3)) {
          report += `    • ${finding.file}:${finding.line}\n`;
          report += `      ${finding.message}\n`;
          if (finding.suggestion) {
            report += `      → ${finding.suggestion}\n`;
          }
        }

        if (findings.length > 3) {
          report += `    ... and ${findings.length - 3} more\n`;
        }
      }
    }

    report += '\n\n';

    // Recommendations
    if (recommendations.length > 0) {
      report += 'RECOMMENDATIONS\n';
      report += '-'.repeat(60) + '\n\n';

      for (const rec of recommendations.slice(0, 5)) {
        report += `[${rec.priority}] ${rec.message}\n`;
        if (rec.actionItems) {
          report += 'Action Items:\n';
          for (const item of rec.actionItems) {
            report += `  1. ${item}\n`;
          }
        }
        report += '\n';
      }
    }

    // Action Plan
    if (actionPlan && actionPlan.phases) {
      report += 'ACTION PLAN\n';
      report += '-'.repeat(60) + '\n\n';

      if (actionPlan.phases.immediate && actionPlan.phases.immediate.length > 0) {
        report += 'IMMEDIATE (Next 1-2 days):\n';
        for (const action of actionPlan.phases.immediate) {
          report += `  • ${action.description}\n`;
        }
        report += '\n';
      }

      if (actionPlan.phases.nearTerm && actionPlan.phases.nearTerm.length > 0) {
        report += 'NEAR-TERM (Next 1-2 weeks):\n';
        for (const action of actionPlan.phases.nearTerm) {
          report += `  • ${action.description}\n`;
        }
        report += '\n';
      }

      if (actionPlan.phases.planned && actionPlan.phases.planned.length > 0) {
        report += 'PLANNED (Next month):\n';
        for (const action of actionPlan.phases.planned) {
          report += `  • ${action.description}\n`;
        }
        report += '\n';
      }
    }

    // Statistics
    report += '\nSTATISTICS\n';
    report += '-'.repeat(60) + '\n';
    report += `Total Findings Analyzed: ${aggregated.allFindings.length}\n`;
    report += `Duplicates Removed: ${aggregated.duplicatesRemoved || 0}\n`;
    report += `False Positives Filtered: ${aggregated.falsePositivesFiltered || 0}\n`;

    return report;
  }

  /**
   * Generate security-focused report
   * @param {Object} analysisResult - Security audit result
   * @returns {string} Security report
   */
  generateSecurityReport(analysisResult) {
    let report = '';

    const { audit, path, timestamp } = analysisResult;
    const { aggregated, riskScore, recommendations } = audit;

    report += 'SECURITY AUDIT REPORT\n';
    report += '='.repeat(70) + '\n\n';
    report += `Generated: ${timestamp}\n`;
    report += `Project: ${path}\n\n`;

    // Risk Assessment
    report += 'SECURITY RISK ASSESSMENT\n';
    report += '-'.repeat(40) + '\n';
    report += `Overall Risk Level: ${riskScore.riskLevel}\n`;
    report += `Risk Score: ${riskScore.score}/100\n\n`;

    // Vulnerability breakdown
    report += 'VULNERABILITY BREAKDOWN\n';
    report += '-'.repeat(40) + '\n';
    report += `Critical Vulnerabilities: ${riskScore.breakdown.critical}\n`;
    report += `High Severity Issues: ${riskScore.breakdown.high}\n`;
    report += `Medium Severity Issues: ${riskScore.breakdown.medium}\n\n`;

    // Risk summary
    report += riskScore.summary + '\n\n';

    // Security findings
    report += 'SECURITY FINDINGS\n';
    report += '-'.repeat(40) + '\n';

    const securityFindings = aggregated.allFindings;
    if (securityFindings.length === 0) {
      report += 'No security issues detected.\n\n';
    } else {
      for (const finding of securityFindings.slice(0, 10)) {
        report += `\n[${finding.severity}] ${finding.file}:${finding.line}\n`;
        report += `Type: ${finding.type}\n`;
        report += `Issue: ${finding.message}\n`;
        if (finding.owasp) {
          report += `OWASP: ${finding.owasp}\n`;
        }
      }

      if (securityFindings.length > 10) {
        report += `\n... and ${securityFindings.length - 10} more vulnerabilities\n`;
      }
    }

    report += '\n\nRECOMMENDATIONS\n';
    report += '-'.repeat(40) + '\n';
    for (const rec of recommendations.slice(0, 5)) {
      report += `• ${rec.message}\n`;
      if (rec.actionItems) {
        for (const item of rec.actionItems) {
          report += `  → ${item}\n`;
        }
      }
    }

    return report;
  }

  /**
   * Generate trend analysis report
   * @param {Array} historicalResults - Array of past analysis results
   * @returns {string} Trend report
   */
  generateTrendReport(historicalResults) {
    if (historicalResults.length < 2) {
      return 'Insufficient history for trend analysis. Need at least 2 analyses.';
    }

    let report = '';

    report += 'CODE QUALITY TREND ANALYSIS\n';
    report += '='.repeat(60) + '\n\n';

    // Extract scores over time
    const scores = historicalResults.map((result, idx) => ({
      index: idx,
      timestamp: result.timestamp,
      score: result.analysis.riskScore.score,
      findings: result.analysis.aggregated.totalFindings,
      critical: result.analysis.riskScore.breakdown.critical
    }));

    // Overall trend
    const firstScore = scores[0].score;
    const lastScore = scores[scores.length - 1].score;
    const trend = lastScore < firstScore ? 'IMPROVING' : lastScore > firstScore ? 'DEGRADING' : 'STABLE';

    report += `Overall Trend: ${trend}\n`;
    report += `Initial Score: ${firstScore}/100\n`;
    report += `Current Score: ${lastScore}/100\n`;
    report += `Change: ${lastScore > firstScore ? '+' : ''}${lastScore - firstScore}\n\n`;

    // Finding trends
    report += 'FINDING TRENDS\n';
    report += '-'.repeat(40) + '\n';

    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];
      const arrow = i === 0 ? '→' : score.findings < scores[i - 1].findings ? '↓' : score.findings > scores[i - 1].findings ? '↑' : '→';
      report += `${arrow} ${score.timestamp.split('T')[0]}: ${score.findings} issues (${score.critical} critical)\n`;
    }

    return report;
  }

  /**
   * Generate HTML report
   * @param {Object} analysisResult - Analysis result
   * @returns {string} HTML report
   */
  generateHTMLReport(analysisResult) {
    const { analysis, path, timestamp } = analysisResult;
    const { aggregated, riskScore } = analysis;

    const riskColor = this.getRiskColor(riskScore.riskLevel);

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Analysis Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
    .container { max-width: 1000px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { border-bottom: 3px solid ${riskColor}; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 28px; color: #111; margin-bottom: 5px; }
    .header p { color: #666; font-size: 14px; }
    .risk-badge { display: inline-block; padding: 8px 16px; background: ${riskColor}; color: white; border-radius: 4px; font-weight: bold; margin: 10px 0; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
    .metric { background: #f9f9f9; padding: 15px; border-radius: 6px; border-left: 4px solid ${riskColor}; }
    .metric-value { font-size: 24px; font-weight: bold; color: #111; }
    .metric-label { font-size: 12px; color: #666; margin-top: 5px; text-transform: uppercase; }
    .findings { margin: 30px 0; }
    .finding { background: #f9f9f9; padding: 15px; margin: 10px 0; border-left: 4px solid #ddd; border-radius: 4px; }
    .severity-critical { border-left-color: #c00; }
    .severity-high { border-left-color: #f60; }
    .severity-medium { border-left-color: #fc0; }
    .severity-low { border-left-color: #0c0; }
    .severity-label { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; margin-right: 10px; }
    .severity-critical .severity-label { background: #fdd; color: #c00; }
    .severity-high .severity-label { background: #ffe; color: #f60; }
    .severity-medium .severity-label { background: #ffe; color: #fc0; }
    .severity-low .severity-label { background: #dfd; color: #0c0; }
    .file-path { color: #666; font-family: monospace; font-size: 13px; }
    .message { margin: 8px 0; color: #333; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: bold; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Code Analysis Report</h1>
      <p>Generated: ${timestamp}</p>
      <p>Project: ${path}</p>
      <div class="risk-badge">${riskScore.riskLevel}</div>
    </div>

    <div class="metrics">
      <div class="metric">
        <div class="metric-value">${riskScore.score}</div>
        <div class="metric-label">Risk Score</div>
      </div>
      <div class="metric">
        <div class="metric-value">${aggregated.totalFindings}</div>
        <div class="metric-label">Total Findings</div>
      </div>
      <div class="metric">
        <div class="metric-value">${riskScore.breakdown.critical}</div>
        <div class="metric-label">Critical</div>
      </div>
      <div class="metric">
        <div class="metric-value">${riskScore.breakdown.high}</div>
        <div class="metric-label">High</div>
      </div>
    </div>

    <h2>Risk Assessment</h2>
    <p>${riskScore.summary}</p>

    <h2>Top Issues</h2>
    <div class="findings">`;

    for (const finding of aggregated.allFindings.slice(0, 10)) {
      const severity = (finding.severity || 'unknown').toLowerCase();
      html += `
      <div class="finding severity-${severity}">
        <span class="severity-label">${finding.severity}</span>
        <span class="file-path">${this.escapeHTML(finding.file)}:${finding.line}</span>
        <div class="message">${this.escapeHTML(finding.message)}</div>
      </div>`;
    }

    html += `
    </div>

    <h2>Summary by Category</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Critical</th>
          <th>High</th>
          <th>Medium</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>`;

    for (const [category, severityMap] of Object.entries(aggregated.byCategory)) {
      const critical = (severityMap.CRITICAL || []).length;
      const high = (severityMap.HIGH || []).length;
      const medium = (severityMap.MEDIUM || []).length;
      const total = critical + high + medium;

      html += `
        <tr>
          <td>${category}</td>
          <td>${critical}</td>
          <td>${high}</td>
          <td>${medium}</td>
          <td>${total}</td>
        </tr>`;
    }

    html += `
      </tbody>
    </table>

    <div class="footer">
      <p>This report was auto-generated by Code Analysis Engine. Review findings carefully and discuss with your team.</p>
    </div>
  </div>
</body>
</html>`;

    return html;
  }

  /**
   * Escape HTML special characters
   */
  escapeHTML(str) {
    if (!str) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Get color for risk level
   */
  getRiskColor(level) {
    const colors = {
      CRITICAL: '#c00',
      HIGH: '#f60',
      MEDIUM: '#fc0',
      LOW: '#0c0'
    };
    return colors[level] || '#999';
  }
}

module.exports = ReportGenerator;
