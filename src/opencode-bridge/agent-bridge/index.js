/**
 * Agent Bridge - Main Entry Point
 * Orchestrates the interaction between OpenCode and agents-runtime
 */

const RuntimeClient = require('./runtime-client');
const ConstraintValidator = require('./constraint-validator');
const { ErrorHandler } = require('./errors');

class AgentBridge {
  constructor(options = {}) {
    this.runtimePath = options.runtimePath || '.';
    this.constraints = options.constraints || {};
    this.logger = options.logger || console;
    this.auditLog = options.auditLog || (() => {});

    // Initialize components
    this.validator = new ConstraintValidator(this.constraints, this.logger);
    this.client = new RuntimeClient(this.runtimePath, this.constraints, this.logger);

    // Validate hard constraints on startup
    try {
      this.validator.validateHardConstraints();
      this.logger.info('[AgentBridge] Hard constraints validated ✓');
    } catch (error) {
      this.logger.error('[AgentBridge] Hard constraint validation failed', error.message);
      throw error;
    }
  }

  /**
   * Analyze code with selected skills
   */
  async analyze(targetPath, options = {}) {
    const startTime = Date.now();

    this.logger.info(`[AgentBridge] Starting analysis: ${targetPath}`);

    try {
      // 1. Validate input
      this.validator.isFilePathAllowed(targetPath);

      // 2. Select skills based on analysis type
      const analysisType = options.type || 'full';
      const skills = this.selectSkillsForAnalysis(analysisType);

      this.logger.debug(`[AgentBridge] Selected skills: ${skills.join(', ')}`);

      // 3. Invoke skills
      const input = {
        files: [targetPath],
        project_root: options.projectRoot || process.cwd(),
        skip_tests: options.skipTests !== false,
        skip_node_modules: options.skipNodeModules !== false
      };

      const allResults = await this.client.invokeMultiple(skills, input, {
        projectPath: options.projectPath || process.cwd()
      });

      // 4. Validate output
      for (const result of allResults.results.success) {
        try {
          this.validator.validateOutput(result.result);
        } catch (secretError) {
          // Strip secrets and continue
          result.result = this.validator.stripSecrets(result.result);
          this.logger.warn('[AgentBridge] Secrets stripped from output');
        }
      }

      // 5. Aggregate findings
      const aggregated = this.aggregateFindings(allResults);

      // 6. Log audit trail
      const duration = Date.now() - startTime;
      this.auditLog('analysis_completed', {
        targetPath,
        analysisType,
        skills,
        findingsCount: aggregated.findings.length,
        duration,
        errors: allResults.results.error.length
      });

      return {
        success: true,
        analysis: aggregated,
        duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const decision = ErrorHandler.handle(error, {
        operation: 'analyze',
        logger: this.logger,
        auditLog: this.auditLog
      });

      this.auditLog('analysis_failed', {
        targetPath,
        error: error.message,
        decision: decision.action,
        duration
      });

      throw error;
    }
  }

  /**
   * Security audit with OWASP focus
   */
  async securityAudit(targetPath, options = {}) {
    this.logger.info(`[AgentBridge] Starting security audit: ${targetPath}`);

    try {
      // Validate
      this.validator.isFilePathAllowed(targetPath);

      // Run security-audit skill
      const input = {
        files: [targetPath],
        project_root: options.projectRoot || process.cwd(),
        severity_filter: options.minSeverity || 'LOW',
        owasp_top_10: true,
        include_cve: true
      };

      const result = await this.client.invokeSkill('security-audit', input, {
        projectPath: options.projectPath || process.cwd()
      });

      // Validate output
      try {
        this.validator.validateOutput(result.result);
      } catch (secretError) {
        result.result = this.validator.stripSecrets(result.result);
      }

      // Filter and prioritize findings
      const processed = this.processSecurityFindings(result.result);

      this.auditLog('security_audit_completed', {
        targetPath,
        findings: processed.findings.length,
        critical: processed.bySeverity.CRITICAL.length,
        high: processed.bySeverity.HIGH.length
      });

      return {
        success: true,
        audit: processed,
        duration: result.duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const decision = ErrorHandler.handle(error, {
        operation: 'securityAudit',
        logger: this.logger,
        auditLog: this.auditLog
      });

      throw error;
    }
  }

  /**
   * Propose refactoring (requires approval)
   */
  async proposeRefactoring(targetPath, options = {}) {
    this.logger.info(`[AgentBridge] Proposing refactoring: ${targetPath}`);

    try {
      // Validate
      this.validator.isFilePathAllowed(targetPath);
      const { allowed, requiresApproval } = this.validator.canModifyCode();

      if (!allowed) {
        throw new Error('Code modifications not allowed by constraints');
      }

      // Run refactor skill
      const input = {
        files: [targetPath],
        project_root: options.projectRoot || process.cwd(),
        focus: options.focus || 'all',  // 'complexity', 'duplication', 'tests', 'all'
        safety_level: options.safetyLevel || 'conservative'
      };

      const result = await this.client.invokeSkill('refactor', input, {
        projectPath: options.projectPath || process.cwd()
      });

      // Validate output
      try {
        this.validator.validateOutput(result.result);
      } catch (secretError) {
        result.result = this.validator.stripSecrets(result.result);
      }

      // Extract proposal
      const proposal = {
        skillId: 'refactor',
        targetFile: targetPath,
        suggestions: result.result.suggestions || [],
        diffs: result.result.diffs || [],
        rationale: result.result.rationale || [],
        requiresApproval,
        timestamp: result.timestamp
      };

      this.auditLog('refactoring_proposed', {
        targetPath,
        suggestionCount: proposal.suggestions.length,
        requiresApproval
      });

      return {
        success: true,
        proposal,
        duration: result.duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const decision = ErrorHandler.handle(error, {
        operation: 'proposeRefactoring',
        logger: this.logger,
        auditLog: this.auditLog
      });

      throw error;
    }
  }

  /**
   * Get constraint report
   */
  getConstraintReport() {
    return this.validator.getConstraintReport();
  }

  /**
   * Health check
   */
  async healthCheck() {
    return this.client.healthCheck();
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.client.killAllProcesses();
    this.logger.info('[AgentBridge] Cleanup completed');
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Select skills based on analysis type
   */
  selectSkillsForAnalysis(analysisType) {
    const SKILL_SETS = {
      'full': ['code-analysis', 'security-audit'],
      'code-only': ['code-analysis'],
      'security-only': ['security-audit'],
      'complexity': ['code-analysis'],
      'vulnerabilities': ['security-audit']
    };

    return SKILL_SETS[analysisType] || SKILL_SETS.full;
  }

  /**
   * Aggregate findings from multiple skills
   */
  aggregateFindings(allResults) {
    const findings = [];
    const metrics = {};

    for (const result of allResults.results.success) {
      if (result.result.findings) {
        findings.push(...result.result.findings);
      }
      if (result.result.metrics) {
        Object.assign(metrics, result.result.metrics);
      }
    }

    // Deduplicate
    const deduplicated = this.deduplicateFindings(findings);

    // Prioritize
    const prioritized = deduplicated.sort((a, b) => {
      const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    return {
      findings: prioritized,
      totalFindings: prioritized.length,
      metrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Deduplicate findings
   */
  deduplicateFindings(findings) {
    const seen = new Set();
    const unique = [];

    for (const finding of findings) {
      const key = `${finding.file}:${finding.line}:${finding.rule}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(finding);
      }
    }

    return unique;
  }

  /**
   * Process security findings with prioritization
   */
  processSecurityFindings(result) {
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

    // Generate recommendations
    const recommendations = this.generateSecurityRecommendations(bySeverity);

    return {
      findings,
      bySeverity,
      summary: {
        total: findings.length,
        critical: bySeverity.CRITICAL.length,
        high: bySeverity.HIGH.length,
        medium: bySeverity.MEDIUM.length,
        low: bySeverity.LOW.length
      },
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate smart recommendations
   */
  generateSecurityRecommendations(bySeverity) {
    const recommendations = [];

    if (bySeverity.CRITICAL.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        message: `Fix ${bySeverity.CRITICAL.length} critical vulnerabilities immediately`,
        action: 'Review and patch all critical issues before deployment'
      });
    }

    if (bySeverity.HIGH.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        message: `Address ${bySeverity.HIGH.length} high-severity issues`,
        action: 'Fix high-severity issues before next release'
      });
    }

    if (bySeverity.CRITICAL.length === 0 && bySeverity.HIGH.length === 0) {
      recommendations.push({
        priority: 'INFO',
        message: 'No critical or high-severity vulnerabilities found',
        action: 'Continue monitoring for medium and low-severity issues'
      });
    }

    return recommendations;
  }
}

module.exports = AgentBridge;
