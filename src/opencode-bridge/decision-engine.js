/**
 * DecisionEngine - Aggregates, deduplicates, and prioritizes findings from multiple analysis sources
 * 
 * Responsibilities:
 * - Combine findings from CodeAnalyzer and SecurityAuditor
 * - Deduplicate identical findings across multiple analyses
 * - Filter false positives using heuristics
 * - Group findings by category/severity
 * - Generate prioritized, actionable recommendations
 * - Calculate risk scores and impact assessments
 */

const crypto = require('crypto');

class DecisionEngine {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.maxFindingsPerCategory = options.maxFindingsPerCategory || 10;
    this.enableFalsePositiveFiltering = options.enableFalsePositiveFiltering !== false;
    this.recommendationThreshold = options.recommendationThreshold || 'MEDIUM'; // Only recommend fixes for issues at this level or higher
  }

  /**
   * Aggregate findings from multiple analysis results
   * @param {Object} analysisResults - { codeAnalysis, securityAudit }
   * @returns {Object} Aggregated findings with deduplication
   */
  aggregateFindings(analysisResults) {
    const { codeAnalysis = {}, securityAudit = {} } = analysisResults;

    // Collect all findings
    const allFindings = [];

    // Add code analysis findings
    if (codeAnalysis.findings && Array.isArray(codeAnalysis.findings)) {
      allFindings.push(...codeAnalysis.findings.map(f => ({
        ...f,
        source: 'code-analysis',
        originalSource: 'code-analysis'
      })));
    }

    // Add security audit findings
    if (securityAudit.findings && Array.isArray(securityAudit.findings)) {
      allFindings.push(...securityAudit.findings.map(f => ({
        ...f,
        source: 'security-audit',
        originalSource: 'security-audit'
      })));
    }

    // Deduplicate
    const deduplicated = this.deduplicate(allFindings);

    // Filter false positives if enabled
    let filtered = deduplicated;
    if (this.enableFalsePositiveFiltering) {
      filtered = this.filterFalsePositives(deduplicated);
    }

    // Group and prioritize
    const grouped = this.groupByCategory(filtered);

    return {
      totalFindings: filtered.length,
      deduplicated: deduplicated.length < allFindings.length,
      duplicatesRemoved: allFindings.length - deduplicated.length,
      falsePositivesFiltered: this.enableFalsePositiveFiltering && (deduplicated.length - filtered.length),
      byCategory: grouped,
      allFindings: filtered,
      sourceBreakdown: {
        codeAnalysis: filtered.filter(f => f.originalSource === 'code-analysis').length,
        securityAudit: filtered.filter(f => f.originalSource === 'security-audit').length
      }
    };
  }

  /**
   * Deduplicate findings using hash-based comparison
   * @param {Array} findings - Array of finding objects
   * @returns {Array} Deduplicated findings
   */
  deduplicate(findings) {
    const seen = new Map();
    const deduplicated = [];

    for (const finding of findings) {
      const hash = this.generateFindingHash(finding);

      if (!seen.has(hash)) {
        seen.set(hash, finding);
        deduplicated.push(finding);
      } else {
        // Merge sources if same finding from multiple sources
        const existing = seen.get(hash);
        if (!existing.sources) {
          existing.sources = [existing.source || existing.originalSource];
        }
        if (!existing.sources.includes(finding.source || finding.originalSource)) {
          existing.sources.push(finding.source || finding.originalSource);
        }
      }
    }

    return deduplicated;
  }

  /**
   * Generate unique hash for a finding to detect duplicates
   * @param {Object} finding - Finding object
   * @returns {string} Hash of finding
   */
  generateFindingHash(finding) {
    const key = `${finding.file || 'N/A'}:${finding.line || 0}:${finding.type || 'N/A'}:${finding.message || ''}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Filter out likely false positives using heuristics
   * @param {Array} findings - Array of findings
   * @returns {Array} Filtered findings
   */
  filterFalsePositives(findings) {
    return findings.filter(finding => {
      // Keep security findings - always important
      if (finding.originalSource === 'security-audit' && finding.severity) {
        return !this.isLikelyFalsePositive(finding, 'security');
      }

      // For code analysis, filter low-value findings
      if (finding.originalSource === 'code-analysis') {
        return !this.isLikelyFalsePositive(finding, 'code');
      }

      return true;
    });
  }

  /**
   * Determine if a finding is likely a false positive
   * @param {Object} finding - Finding object
   * @param {string} type - Type of finding ('security' or 'code')
   * @returns {boolean} True if likely false positive
   */
  isLikelyFalsePositive(finding, type) {
    if (type === 'security') {
      // Heuristics for security findings
      const message = (finding.message || '').toLowerCase();
      const severity = (finding.severity || '').toUpperCase();

      // INFO level is typically low value
      if (severity === 'INFO') return true;

      // Common library false positives
      if (message.includes('node_modules') || message.includes('vendor')) return true;

      return false;
    }

    if (type === 'code') {
      const severity = (finding.severity || '').toUpperCase();
      const message = (finding.message || '').toLowerCase();

      // Filter very low severity items
      if (severity === 'LOW' && message.includes('style')) return true;

      // Filter trailing whitespace, minor formatting
      if (message.includes('whitespace') || message.includes('newline')) return true;

      return false;
    }

    return false;
  }

  /**
   * Group findings by category and severity
   * @param {Array} findings - Array of findings
   * @returns {Object} Grouped findings
   */
  groupByCategory(findings) {
    const grouped = {};

    for (const finding of findings) {
      const category = finding.category || 'uncategorized';
      const severity = finding.severity || 'UNKNOWN';

      if (!grouped[category]) {
        grouped[category] = {};
      }

      if (!grouped[category][severity]) {
        grouped[category][severity] = [];
      }

      grouped[category][severity].push(finding);
    }

    // Sort by severity within each category
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    Object.keys(grouped).forEach(category => {
      const severities = Object.keys(grouped[category]).sort(
        (a, b) => (severityOrder[a] || 999) - (severityOrder[b] || 999)
      );
      const sorted = {};
      severities.forEach(sev => {
        sorted[sev] = grouped[category][sev];
      });
      grouped[category] = sorted;
    });

    return grouped;
  }

  /**
   * Generate intelligent recommendations based on findings
   * @param {Object} aggregatedFindings - Output from aggregateFindings()
   * @returns {Array} Prioritized recommendations
   */
  generateRecommendations(aggregatedFindings) {
    const recommendations = [];
    const { allFindings } = aggregatedFindings;

    // Group by type and file for pattern detection
    const byType = {};
    const byFile = {};

    for (const finding of allFindings) {
      const type = finding.type || 'unknown';
      const file = finding.file || 'unknown';

      if (!byType[type]) byType[type] = [];
      if (!byFile[file]) byFile[file] = [];

      byType[type].push(finding);
      byFile[file].push(finding);
    }

    // Generate recommendations from patterns
    for (const [type, findings] of Object.entries(byType)) {
      if (findings.length === 0) continue;

      const severity = findings[0].severity || 'UNKNOWN';
      const recommendation = this.generateTypeRecommendation(type, findings, severity);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    // Generate file-specific recommendations
    for (const [file, findings] of Object.entries(byFile)) {
      if (findings.length === 0 || file === 'unknown') continue;

      const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
      const highCount = findings.filter(f => f.severity === 'HIGH').length;

      if (criticalCount > 0 || highCount > 0) {
        recommendations.push({
          type: 'file-priority',
          file,
          priority: criticalCount > 0 ? 'CRITICAL' : 'HIGH',
          message: `File has ${criticalCount} critical and ${highCount} high severity issues. Prioritize remediation.`,
          findingCount: findings.length,
          critical: criticalCount,
          high: highCount
        });
      }
    }

    // Sort by priority
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    recommendations.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 999;
      const bPriority = priorityOrder[b.priority] || 999;
      return aPriority - bPriority;
    });

    return recommendations;
  }

  /**
   * Generate recommendation for a specific finding type
   * @param {string} type - Finding type
   * @param {Array} findings - Findings of this type
   * @param {string} severity - Severity level
   * @returns {Object|null} Recommendation object or null
   */
  generateTypeRecommendation(type, findings, severity) {
    const count = findings.length;
    let message = '';
    let actionItems = [];

    switch (type.toLowerCase()) {
      case 'duplicate-code':
        message = `Found ${count} instances of code duplication. Consider extracting duplicated code into reusable functions.`;
        actionItems = ['Review duplicated code blocks', 'Extract into shared utilities', 'Add tests for extracted code'];
        break;

      case 'unused-variable':
      case 'unused-function':
        message = `Found ${count} unused ${type === 'unused-function' ? 'functions' : 'variables'}. Remove to improve code clarity.`;
        actionItems = ['Review unused code', 'Remove if no longer needed', 'Check for false positives'];
        break;

      case 'sql-injection':
        message = `Found ${count} potential SQL injection vulnerabilities. Use parameterized queries immediately.`;
        actionItems = ['Use parameterized queries', 'Sanitize user input', 'Add input validation'];
        break;

      case 'hardcoded-secret':
        message = `Found ${count} hardcoded secrets. Move to environment variables immediately.`;
        actionItems = ['Move secrets to .env', 'Rotate compromised credentials', 'Add git hooks to prevent future leaks'];
        break;

      case 'xss-vulnerability':
        message = `Found ${count} potential XSS vulnerabilities. Sanitize user input and use proper encoding.`;
        actionItems = ['Implement input sanitization', 'Use security libraries', 'Add CSP headers'];
        break;

      case 'missing-input-validation':
        message = `Found ${count} cases of missing input validation. Always validate user input.`;
        actionItems = ['Add input validation', 'Use validation libraries', 'Add unit tests for edge cases'];
        break;

      case 'deprecated-api':
        message = `Found ${count} uses of deprecated APIs. Update to modern equivalents.`;
        actionItems = ['Review deprecation notices', 'Update code incrementally', 'Test thoroughly'];
        break;

      case 'high-complexity':
        message = `Found ${count} functions with high cyclomatic complexity. Consider refactoring.`;
        actionItems = ['Break into smaller functions', 'Simplify conditional logic', 'Add tests before refactoring'];
        break;

      default:
        if (count >= 3) {
          message = `Found ${count} instances of ${type}. Investigate and address systematically.`;
          actionItems = ['Review all instances', 'Identify root cause', 'Implement systematic fix'];
        } else {
          return null; // Don't recommend for small counts of unknown types
        }
    }

    if (!message) return null;

    return {
      type: 'finding-type',
      category: type,
      priority: severity,
      message,
      count,
      actionItems,
      affectedFindings: findings.slice(0, 5) // Show first 5 examples
    };
  }

  /**
   * Calculate overall risk score (0-100)
   * @param {Object} aggregatedFindings - Output from aggregateFindings()
   * @returns {Object} Risk assessment
   */
  calculateRiskScore(aggregatedFindings) {
    const { allFindings } = aggregatedFindings;

    const criticalCount = allFindings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = allFindings.filter(f => f.severity === 'HIGH').length;
    const mediumCount = allFindings.filter(f => f.severity === 'MEDIUM').length;

    // Scoring: CRITICAL=40pts, HIGH=15pts, MEDIUM=5pts
    const score = Math.min(100, (criticalCount * 40) + (highCount * 15) + (mediumCount * 5));

    let riskLevel = 'LOW';
    if (score >= 70) riskLevel = 'CRITICAL';
    else if (score >= 50) riskLevel = 'HIGH';
    else if (score >= 30) riskLevel = 'MEDIUM';

    return {
      score,
      riskLevel,
      breakdown: {
        critical: criticalCount,
        high: highCount,
        medium: mediumCount
      },
      summary: this.generateRiskSummary(score, riskLevel, criticalCount, highCount)
    };
  }

  /**
   * Generate human-readable risk summary
   * @param {number} score - Risk score
   * @param {string} level - Risk level
   * @param {number} critical - Critical count
   * @param {number} high - High count
   * @returns {string} Summary text
   */
  generateRiskSummary(score, level, critical, high) {
    if (critical > 0) {
      return `URGENT: ${critical} critical issue(s) require immediate attention. Code should not be deployed until resolved.`;
    }

    if (high > 0) {
      return `HIGH RISK: ${high} significant issue(s) found. Address before production deployment.`;
    }

    if (score >= 30) {
      return `MODERATE RISK: Several issues detected. Recommend addressing before next release.`;
    }

    return `LOW RISK: Code quality is acceptable. Minor improvements recommended.`;
  }

  /**
   * Generate action plan prioritized by impact
   * @param {Object} aggregatedFindings - Output from aggregateFindings()
   * @param {Object} riskScore - Output from calculateRiskScore()
   * @returns {Object} Action plan with phases
   */
  generateActionPlan(aggregatedFindings, riskScore) {
    const { allFindings } = aggregatedFindings;
    const actionPlan = {
      immediate: [],      // Must fix now
      nearTerm: [],       // Fix before next release
      planned: []         // Schedule for future
    };

    // Immediate actions: CRITICAL security findings
    const criticalSecurityFindings = allFindings.filter(
      f => f.severity === 'CRITICAL' && f.originalSource === 'security-audit'
    );
    actionPlan.immediate.push(...criticalSecurityFindings.slice(0, 3).map(f => ({
      finding: f,
      estimatedDays: 1,
      description: `Fix critical security issue: ${f.message}`
    })));

    // Immediate: CRITICAL code issues
    const criticalCodeFindings = allFindings.filter(
      f => f.severity === 'CRITICAL' && f.originalSource === 'code-analysis'
    );
    actionPlan.immediate.push(...criticalCodeFindings.slice(0, 3).map(f => ({
      finding: f,
      estimatedDays: 2,
      description: `Address critical code issue: ${f.message}`
    })));

    // Near-term: HIGH severity
    const highFindings = allFindings.filter(f => f.severity === 'HIGH');
    actionPlan.nearTerm.push(...highFindings.slice(0, 5).map(f => ({
      finding: f,
      estimatedDays: 3,
      description: `Fix: ${f.message}`
    })));

    // Planned: MEDIUM and LOW
    const mediumFindings = allFindings.filter(f => f.severity === 'MEDIUM');
    actionPlan.planned.push(...mediumFindings.slice(0, 3).map(f => ({
      finding: f,
      estimatedDays: 5,
      description: `Consider: ${f.message}`
    })));

    return {
      phases: actionPlan,
      totalEstimatedDays: actionPlan.immediate.length * 1.5 + actionPlan.nearTerm.length * 2 + actionPlan.planned.length * 3,
      criticalPath: actionPlan.immediate
    };
  }

  /**
   * Compare two analysis results to identify changes
   * @param {Object} previousResults - Prior aggregated findings
   * @param {Object} currentResults - New aggregated findings
   * @returns {Object} Comparison report
   */
  compareResults(previousResults, currentResults) {
    const previousHashes = new Set(
      (previousResults.allFindings || []).map(f => this.generateFindingHash(f))
    );
    const currentHashes = new Set(
      (currentResults.allFindings || []).map(f => this.generateFindingHash(f))
    );

    const newFindings = (currentResults.allFindings || []).filter(
      f => !previousHashes.has(this.generateFindingHash(f))
    );
    const resolvedFindings = (previousResults.allFindings || []).filter(
      f => !currentHashes.has(this.generateFindingHash(f))
    );

    return {
      previousTotal: previousResults.totalFindings,
      currentTotal: currentResults.totalFindings,
      newFindings: newFindings.length,
      resolvedFindings: resolvedFindings.length,
      trend: newFindings.length > resolvedFindings.length ? 'degrading' : 'improving',
      newFindingsDetails: newFindings,
      resolvedFindingsDetails: resolvedFindings,
      summary: this.generateComparisonSummary(newFindings, resolvedFindings)
    };
  }

  /**
   * Generate human-readable comparison summary
   * @param {Array} newFindings - Newly discovered findings
   * @param {Array} resolvedFindings - Fixed findings
   * @returns {string} Summary text
   */
  generateComparisonSummary(newFindings, resolvedFindings) {
    if (resolvedFindings.length > newFindings.length) {
      const net = resolvedFindings.length - newFindings.length;
      return `Progress: ${net} more issues fixed than introduced. Good trend.`;
    }

    if (newFindings.length > resolvedFindings.length) {
      const net = newFindings.length - resolvedFindings.length;
      return `Regression: ${net} new issues introduced. Code quality declining.`;
    }

    return `No net change in issue count.`;
  }
}

module.exports = DecisionEngine;
