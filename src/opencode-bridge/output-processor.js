/**
 * OutputProcessor - Formats analysis results for different output formats and targets
 * 
 * Responsibilities:
 * - Format findings for JSON, Markdown, plain text, and HTML outputs
 * - Apply severity-based coloring and formatting
 * - Generate summary statistics
 * - Create structured reports ready for display/file export
 * - Handle error cases gracefully
 */

class OutputProcessor {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.includeMetadata = options.includeMetadata !== false;
    this.colorize = options.colorize !== false;
  }

  /**
   * Process and format all findings for output
   * @param {Object} aggregatedFindings - From DecisionEngine.aggregateFindings()
   * @param {Object} riskScore - From DecisionEngine.calculateRiskScore()
   * @param {Array} recommendations - From DecisionEngine.generateRecommendations()
   * @param {string} format - Output format: 'json', 'markdown', 'text', 'html'
   * @returns {Object} Formatted output
   */
  formatResults(aggregatedFindings, riskScore, recommendations, format = 'markdown') {
    const timestamp = new Date().toISOString();

    switch (format.toLowerCase()) {
      case 'json':
        return this.formatAsJSON(aggregatedFindings, riskScore, recommendations, timestamp);
      case 'markdown':
        return this.formatAsMarkdown(aggregatedFindings, riskScore, recommendations, timestamp);
      case 'text':
        return this.formatAsText(aggregatedFindings, riskScore, recommendations, timestamp);
      case 'html':
        return this.formatAsHTML(aggregatedFindings, riskScore, recommendations, timestamp);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Format as JSON
   * @returns {Object} JSON-formatted output
   */
  formatAsJSON(aggregatedFindings, riskScore, recommendations, timestamp) {
    return {
      report: {
        timestamp,
        summary: {
          totalFindings: aggregatedFindings.totalFindings,
          deduplicated: aggregatedFindings.deduplicated,
          duplicatesRemoved: aggregatedFindings.duplicatesRemoved,
          falsePositivesFiltered: aggregatedFindings.falsePositivesFiltered,
          sourceBreakdown: aggregatedFindings.sourceBreakdown
        },
        riskAssessment: {
          score: riskScore.score,
          riskLevel: riskScore.riskLevel,
          breakdown: riskScore.breakdown,
          summary: riskScore.summary
        }
      },
      findings: aggregatedFindings.allFindings.map(f => this.normalizeFinding(f)),
      recommendations: recommendations.map(r => this.normalizeRecommendation(r)),
      groupedByCategory: this.formatGroupedFindings(aggregatedFindings.byCategory),
      metadata: this.includeMetadata ? this.generateMetadata() : undefined
    };
  }

  /**
   * Format as Markdown
   * @returns {string} Markdown-formatted output
   */
  formatAsMarkdown(aggregatedFindings, riskScore, recommendations, timestamp) {
    let markdown = '';

    // Header
    markdown += `# Code Analysis Report\n\n`;
    markdown += `**Generated**: ${timestamp}\n\n`;

    // Risk Assessment
    markdown += this.formatMarkdownRiskAssessment(riskScore);

    // Summary Statistics
    markdown += this.formatMarkdownSummary(aggregatedFindings);

    // Recommendations
    if (recommendations.length > 0) {
      markdown += this.formatMarkdownRecommendations(recommendations);
    }

    // Detailed Findings
    markdown += this.formatMarkdownFindings(aggregatedFindings);

    return markdown;
  }

  /**
   * Format risk assessment section for Markdown
   */
  formatMarkdownRiskAssessment(riskScore) {
    const riskColor = this.getRiskColor(riskScore.riskLevel);
    return `## Risk Assessment\n\n` +
      `**Risk Level**: ${this.colorizeText(riskScore.riskLevel, riskColor)}\n` +
      `**Score**: ${riskScore.score}/100\n\n` +
      `### Breakdown\n` +
      `- Critical: ${riskScore.breakdown.critical}\n` +
      `- High: ${riskScore.breakdown.high}\n` +
      `- Medium: ${riskScore.breakdown.medium}\n\n` +
      `> ${riskScore.summary}\n\n`;
  }

  /**
   * Format summary statistics for Markdown
   */
  formatMarkdownSummary(aggregatedFindings) {
    let summary = `## Summary\n\n`;
    summary += `| Metric | Value |\n`;
    summary += `|--------|-------|\n`;
    summary += `| Total Findings | ${aggregatedFindings.totalFindings} |\n`;
    summary += `| Code Analysis | ${aggregatedFindings.sourceBreakdown.codeAnalysis} |\n`;
    summary += `| Security Audit | ${aggregatedFindings.sourceBreakdown.securityAudit} |\n`;
    summary += `| Duplicates Removed | ${aggregatedFindings.duplicatesRemoved || 0} |\n`;
    summary += `| False Positives Filtered | ${aggregatedFindings.falsePositivesFiltered || 0} |\n\n`;

    return summary;
  }

  /**
   * Format recommendations for Markdown
   */
  formatMarkdownRecommendations(recommendations) {
    let md = `## Recommendations\n\n`;

    for (const rec of recommendations) {
      const priority = this.colorizeText(rec.priority, this.getRiskColor(rec.priority));
      md += `### ${priority} - ${rec.message}\n\n`;

      if (rec.actionItems && rec.actionItems.length > 0) {
        md += `**Action Items**:\n`;
        for (const item of rec.actionItems) {
          md += `- ${item}\n`;
        }
        md += '\n';
      }

      if (rec.affectedFindings && rec.affectedFindings.length > 0) {
        md += `**Examples**:\n`;
        for (const finding of rec.affectedFindings.slice(0, 2)) {
          md += `- ${finding.file || 'unknown'}:${finding.line || '?'} - ${finding.message}\n`;
        }
        md += '\n';
      }
    }

    return md;
  }

  /**
   * Format detailed findings for Markdown
   */
  formatMarkdownFindings(aggregatedFindings) {
    let md = `## Detailed Findings\n\n`;

    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

    for (const [category, severityMap] of Object.entries(aggregatedFindings.byCategory)) {
      const severities = Object.keys(severityMap).sort(
        (a, b) => (severityOrder[a] || 999) - (severityOrder[b] || 999)
      );

      md += `### ${category}\n\n`;

      for (const severity of severities) {
        const findings = severityMap[severity];
        md += `#### ${severity} (${findings.length})\n\n`;

        for (const finding of findings.slice(0, 5)) {
          const color = this.getRiskColor(severity);
          md += `- **${this.colorizeText(severity, color)}** | ${finding.file || 'unknown'}:${finding.line || '?'}\n`;
          md += `  ${finding.message}\n`;
          if (finding.suggestion) {
            md += `  > Suggestion: ${finding.suggestion}\n`;
          }
          md += '\n';
        }

        if (findings.length > 5) {
          md += `  ... and ${findings.length - 5} more\n\n`;
        }
      }
    }

    return md;
  }

  /**
   * Format as Plain Text
   */
  formatAsText(aggregatedFindings, riskScore, recommendations, timestamp) {
    let text = '';

    text += 'CODE ANALYSIS REPORT\n';
    text += '='.repeat(80) + '\n\n';

    text += `Generated: ${timestamp}\n\n`;

    // Risk Assessment
    text += 'RISK ASSESSMENT\n';
    text += '-'.repeat(40) + '\n';
    text += `Risk Level: ${riskScore.riskLevel}\n`;
    text += `Score: ${riskScore.score}/100\n`;
    text += `Critical: ${riskScore.breakdown.critical}\n`;
    text += `High: ${riskScore.breakdown.high}\n`;
    text += `Medium: ${riskScore.breakdown.medium}\n`;
    text += `\n${riskScore.summary}\n\n`;

    // Summary
    text += 'SUMMARY\n';
    text += '-'.repeat(40) + '\n';
    text += `Total Findings: ${aggregatedFindings.totalFindings}\n`;
    text += `Code Analysis: ${aggregatedFindings.sourceBreakdown.codeAnalysis}\n`;
    text += `Security Audit: ${aggregatedFindings.sourceBreakdown.securityAudit}\n\n`;

    // Recommendations
    if (recommendations.length > 0) {
      text += 'TOP RECOMMENDATIONS\n';
      text += '-'.repeat(40) + '\n';
      for (const rec of recommendations.slice(0, 5)) {
        text += `[${rec.priority}] ${rec.message}\n`;
        if (rec.actionItems) {
          for (const item of rec.actionItems) {
            text += `  - ${item}\n`;
          }
        }
        text += '\n';
      }
    }

    // Key findings by category
    text += 'FINDINGS BY CATEGORY\n';
    text += '-'.repeat(40) + '\n';
    for (const [category, severityMap] of Object.entries(aggregatedFindings.byCategory)) {
      text += `\n${category.toUpperCase()}\n`;
      for (const [severity, findings] of Object.entries(severityMap)) {
        text += `  ${severity}: ${findings.length}\n`;
      }
    }

    return text;
  }

  /**
   * Format as HTML
   */
  formatAsHTML(aggregatedFindings, riskScore, recommendations, timestamp) {
    const findings = aggregatedFindings.allFindings;
    const criticalCount = riskScore.breakdown.critical;
    const highCount = riskScore.breakdown.high;

    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Code Analysis Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; line-height: 1.6; }
    .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
    .risk-critical { background: #fee; color: #c00; padding: 10px; border-radius: 4px; border-left: 4px solid #c00; }
    .risk-high { background: #ffe; color: #880; padding: 10px; border-radius: 4px; border-left: 4px solid #880; }
    .risk-medium { background: #eff; color: #088; padding: 10px; border-radius: 4px; border-left: 4px solid #088; }
    .risk-low { background: #efe; color: #080; padding: 10px; border-radius: 4px; border-left: 4px solid #080; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: bold; }
    .severity-critical { color: #c00; font-weight: bold; }
    .severity-high { color: #880; font-weight: bold; }
    .severity-medium { color: #088; }
    .severity-low { color: #080; }
    .summary-stat { display: inline-block; margin-right: 20px; }
    .stat-value { font-size: 24px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Code Analysis Report</h1>
    <p>Generated: ${timestamp}</p>
  </div>

  <div class="risk-${riskScore.riskLevel.toLowerCase()}">
    <h2>Risk Assessment: ${riskScore.riskLevel}</h2>
    <p><strong>Score:</strong> ${riskScore.score}/100</p>
    <p>${riskScore.summary}</p>
  </div>

  <h2>Summary</h2>
  <div>
    <div class="summary-stat">
      <div class="stat-value">${aggregatedFindings.totalFindings}</div>
      <div>Total Findings</div>
    </div>
    <div class="summary-stat">
      <div class="stat-value severity-critical">${criticalCount}</div>
      <div>Critical</div>
    </div>
    <div class="summary-stat">
      <div class="stat-value severity-high">${highCount}</div>
      <div>High</div>
    </div>
  </div>

  <h2>Detailed Findings</h2>
  <table>
    <tr>
      <th>Severity</th>
      <th>File</th>
      <th>Line</th>
      <th>Message</th>
      <th>Category</th>
    </tr>`;

    for (const finding of findings.slice(0, 50)) {
      const sevClass = `severity-${(finding.severity || 'unknown').toLowerCase()}`;
      html += `
    <tr>
      <td class="${sevClass}">${finding.severity || 'N/A'}</td>
      <td>${this.escapeHTML(finding.file || 'unknown')}</td>
      <td>${finding.line || '?'}</td>
      <td>${this.escapeHTML(finding.message || 'N/A')}</td>
      <td>${this.escapeHTML(finding.category || 'N/A')}</td>
    </tr>`;
    }

    html += `
  </table>`;

    if (findings.length > 50) {
      html += `<p><em>Showing 50 of ${findings.length} findings</em></p>`;
    }

    html += `
</body>
</html>`;

    return html;
  }

  /**
   * Normalize finding object for output
   */
  normalizeFinding(finding) {
    return {
      file: finding.file || 'unknown',
      line: finding.line || null,
      message: finding.message || '',
      severity: finding.severity || 'UNKNOWN',
      category: finding.category || 'uncategorized',
      type: finding.type || 'unknown',
      suggestion: finding.suggestion || null,
      source: finding.originalSource || finding.source,
      sources: finding.sources || []
    };
  }

  /**
   * Normalize recommendation object for output
   */
  normalizeRecommendation(rec) {
    return {
      type: rec.type || 'general',
      priority: rec.priority || 'MEDIUM',
      message: rec.message,
      actionItems: rec.actionItems || [],
      affectedCount: rec.count || (rec.affectedFindings ? rec.affectedFindings.length : 0)
    };
  }

  /**
   * Format grouped findings
   */
  formatGroupedFindings(byCategory) {
    const result = {};
    for (const [cat, sevMap] of Object.entries(byCategory)) {
      result[cat] = {};
      for (const [sev, findings] of Object.entries(sevMap)) {
        result[cat][sev] = findings.length;
      }
    }
    return result;
  }

  /**
   * Generate metadata about the analysis
   */
  generateMetadata() {
    return {
      version: '1.0.0',
      generator: 'opencode-bridge',
      timestamp: new Date().toISOString(),
      format: 'structured-report'
    };
  }

  /**
   * Get color code for risk level
   */
  getRiskColor(level) {
    const colors = {
      CRITICAL: 'red',
      HIGH: 'orange',
      MEDIUM: 'yellow',
      LOW: 'green',
      INFO: 'blue'
    };
    return colors[level] || 'gray';
  }

  /**
   * Colorize text for terminal output
   */
  colorizeText(text, color) {
    if (!this.colorize) return text;

    const colorCodes = {
      red: '\x1b[31m',
      orange: '\x1b[33m',
      yellow: '\x1b[33m',
      green: '\x1b[32m',
      blue: '\x1b[34m',
      gray: '\x1b[37m'
    };

    const reset = '\x1b[0m';
    return `${colorCodes[color] || ''}${text}${reset}`;
  }

  /**
   * Escape HTML special characters
   */
  escapeHTML(str) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Create a summary for quick viewing
   */
  createQuickSummary(aggregatedFindings, riskScore) {
    return {
      riskLevel: riskScore.riskLevel,
      score: riskScore.score,
      totalFindings: aggregatedFindings.totalFindings,
      critical: riskScore.breakdown.critical,
      high: riskScore.breakdown.high,
      medium: riskScore.breakdown.medium,
      topFindingsByFile: this.getTopFindingsByFile(aggregatedFindings.allFindings, 5)
    };
  }

  /**
   * Get top findings grouped by file
   */
  getTopFindingsByFile(findings, limit) {
    const byFile = {};
    for (const finding of findings) {
      const file = finding.file || 'unknown';
      if (!byFile[file]) byFile[file] = [];
      byFile[file].push(finding);
    }

    const result = {};
    const files = Object.keys(byFile).sort(
      (a, b) => byFile[b].length - byFile[a].length
    ).slice(0, limit);

    for (const file of files) {
      result[file] = {
        count: byFile[file].length,
        severities: this.countBySeverity(byFile[file])
      };
    }

    return result;
  }

  /**
   * Count findings by severity
   */
  countBySeverity(findings) {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const finding of findings) {
      const sev = finding.severity || 'LOW';
      if (counts.hasOwnProperty(sev)) {
        counts[sev]++;
      }
    }
    return counts;
  }
}

module.exports = OutputProcessor;
