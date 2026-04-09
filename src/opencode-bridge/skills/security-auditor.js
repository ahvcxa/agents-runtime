/**
 * Security Auditor Skill Wrapper
 * Wraps agents-runtime security-audit skill with OWASP and CVE analysis
 */

const RuntimeClient = require('../agent-bridge/runtime-client');
const { SkillExecutionError, TimeoutError } = require('../agent-bridge/errors');

class SecurityAuditor {
  constructor(constraints = {}, logger = console) {
    this.constraints = constraints;
    this.logger = logger;
    this.client = null;

    // OWASP Top 10 categories
    this.OWASP_TOP_10 = [
      'Injection',
      'Broken Authentication',
      'Sensitive Data Exposure',
      'XML External Entities',
      'Broken Access Control',
      'Security Misconfiguration',
      'Cross-Site Scripting',
      'Insecure Deserialization',
      'Using Components with Known Vulnerabilities',
      'Insufficient Logging & Monitoring'
    ];
  }

  /**
   * Initialize with runtime client
   */
  setRuntimeClient(client) {
    this.client = client;
  }

  /**
   * Run comprehensive security audit
   */
  async audit(targetPath, options = {}) {
    if (!this.client) {
      throw new Error('RuntimeClient not initialized');
    }

    this.logger.debug(`[SecurityAuditor] Auditing: ${targetPath}`, options);

    try {
      // Build audit input
      const input = {
        files: [targetPath],
        project_root: options.projectRoot || process.cwd(),
        severity_filter: options.minSeverity || 'LOW',
        owasp_top_10: options.owaspTopTen !== false,
        include_cve: options.includeCVE !== false,
        include_custom_rules: options.includeCustomRules !== false
      };

      // Invoke skill
      const result = await this.client.invokeSkill('security-audit', input, {
        projectPath: options.projectPath || process.cwd(),
        timeout: options.timeout || 30000
      });

      if (!result.success) {
        throw new SkillExecutionError('Security audit failed', {
          skillId: 'security-audit',
          error: result.error
        });
      }

      // Process findings
      const processed = this.processFindings(result.result);

      // Map to OWASP
      const withOWASP = this.mapToOWASP(processed);

      // Generate recommendations
      const recommendations = this.generateSecurityRecommendations(withOWASP);

      return {
        success: true,
        skillId: 'security-audit',
        findings: withOWASP.findings,
        bySeverity: withOWASP.bySeverity,
        byOWASP: withOWASP.byOWASP,
        recommendations,
        summary: this.generateSummary(withOWASP, recommendations),
        duration: result.duration,
        timestamp: result.timestamp
      };

    } catch (error) {
      if (error instanceof TimeoutError) {
        throw error;
      }
      throw new SkillExecutionError(`Security audit failed: ${error.message}`, {
        skillId: 'security-audit',
        error: error.message
      });
    }
  }

  /**
   * Process and prioritize findings by severity
   */
  processFindings(result) {
    const findings = result.findings || [];

    // Group by severity
    const bySeverity = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
      INFO: []
    };

    for (const finding of findings) {
      const severity = finding.severity || 'INFO';
      if (bySeverity[severity]) {
        bySeverity[severity].push(finding);
      }
    }

    // Deduplicate and sort
    for (const severity in bySeverity) {
      // Remove duplicates
      const seen = new Set();
      bySeverity[severity] = bySeverity[severity].filter(f => {
        const key = `${f.file}:${f.rule}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort by file and line
      bySeverity[severity].sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        return (a.line || 0) - (b.line || 0);
      });
    }

    return {
      findings,
      bySeverity,
      total: findings.length,
      summary: {
        critical: bySeverity.CRITICAL.length,
        high: bySeverity.HIGH.length,
        medium: bySeverity.MEDIUM.length,
        low: bySeverity.LOW.length,
        info: bySeverity.INFO.length
      }
    };
  }

  /**
   * Map security findings to OWASP Top 10 categories
   */
  mapToOWASP(processed) {
    const byOWASP = {};
    for (const category of this.OWASP_TOP_10) {
      byOWASP[category] = [];
    }

    // Mapping rules
    const MAPPING = {
      'sql-injection': 'Injection',
      'command-injection': 'Injection',
      'xss': 'Cross-Site Scripting',
      'cross-site-scripting': 'Cross-Site Scripting',
      'auth': 'Broken Authentication',
      'authentication': 'Broken Authentication',
      'password': 'Broken Authentication',
      'encryption': 'Sensitive Data Exposure',
      'ssl': 'Sensitive Data Exposure',
      'tls': 'Sensitive Data Exposure',
      'xxx': 'XML External Entities',
      'access': 'Broken Access Control',
      'permission': 'Broken Access Control',
      'config': 'Security Misconfiguration',
      'cve': 'Using Components with Known Vulnerabilities',
      'dependency': 'Using Components with Known Vulnerabilities',
      'logging': 'Insufficient Logging & Monitoring',
      'monitoring': 'Insufficient Logging & Monitoring'
    };

    // Classify each finding
    const classified = processed.findings.map(finding => {
      let owaspCategory = 'Security Misconfiguration'; // default

      const lowerRule = (finding.rule || '').toLowerCase();
      for (const [pattern, category] of Object.entries(MAPPING)) {
        if (lowerRule.includes(pattern)) {
          owaspCategory = category;
          break;
        }
      }

      byOWASP[owaspCategory].push(finding);

      return {
        ...finding,
        owaspCategory
      };
    });

    return {
      ...processed,
      findings: classified,
      byOWASP
    };
  }

  /**
   * Generate security recommendations
   */
  generateSecurityRecommendations(withOWASP) {
    const recommendations = [];
    const { bySeverity, byOWASP } = withOWASP;

    // Critical findings
    if (bySeverity.CRITICAL.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        message: `🚨 ${bySeverity.CRITICAL.length} critical vulnerability(ies) found - FIX IMMEDIATELY`,
        action: 'Review each critical issue and apply patches/fixes before any production deployment',
        estimatedEffort: 'High',
        deadline: 'Immediate'
      });
    }

    // High findings
    if (bySeverity.HIGH.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        message: `⚠️ ${bySeverity.HIGH.length} high-severity issue(s) found`,
        action: 'Schedule fixes for the next sprint. Do not merge to main without addressing.',
        estimatedEffort: 'High',
        deadline: 'Next sprint'
      });
    }

    // OWASP-specific recommendations
    for (const [category, findings] of Object.entries(byOWASP)) {
      if (findings.length > 0 && category !== 'Security Misconfiguration') {
        recommendations.push({
          priority: 'MEDIUM',
          owaspCategory: category,
          message: `${category}: ${findings.length} finding(s)`,
          action: `Review and remediate ${category} issues per OWASP guidelines`,
          estimatedEffort: 'Medium',
          deadline: 'Current release'
        });
      }
    }

    // Overall assessment
    if (bySeverity.CRITICAL.length === 0 && bySeverity.HIGH.length === 0) {
      recommendations.push({
        priority: 'INFO',
        message: '✅ No critical or high-severity vulnerabilities found',
        action: 'Continue monitoring. Address medium/low issues in future releases.',
        estimatedEffort: 'Low',
        deadline: 'Ongoing'
      });
    }

    return recommendations;
  }

  /**
   * Generate professional security summary
   */
  generateSummary(withOWASP, recommendations) {
    const { summary, bySeverity } = withOWASP;

    // Risk level assessment
    let riskLevel = 'LOW';
    if (summary.critical > 0) riskLevel = 'CRITICAL';
    else if (summary.high > 0) riskLevel = 'HIGH';
    else if (summary.medium > 3) riskLevel = 'MEDIUM';

    // Security score (0-100)
    let securityScore = 100;
    securityScore -= summary.critical * 40;
    securityScore -= summary.high * 15;
    securityScore -= summary.medium * 5;
    securityScore -= summary.low * 1;
    securityScore = Math.max(0, Math.min(100, securityScore));

    return {
      overallRiskLevel: riskLevel,
      securityScore,
      totalFindings: summary.critical + summary.high + summary.medium + summary.low + summary.info,
      bySeverity: summary,
      criticalRequired: summary.critical > 0 ? 'IMMEDIATE ACTION REQUIRED' : 'No critical issues',
      recommendations: recommendations.slice(0, 5),  // Top 5
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SecurityAuditor;
