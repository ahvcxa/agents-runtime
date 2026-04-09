/**
 * Code Analyzer Skill Wrapper
 * Wraps agents-runtime code-analysis skill with professional decision making
 */

const RuntimeClient = require('../agent-bridge/runtime-client');
const { SkillExecutionError, TimeoutError } = require('../agent-bridge/errors');

class CodeAnalyzer {
  constructor(constraints = {}, logger = console) {
    this.constraints = constraints;
    this.logger = logger;
    this.client = null;
  }

  /**
   * Initialize with runtime client
   */
  setRuntimeClient(client) {
    this.client = client;
  }

  /**
   * Analyze code for complexity, DRY violations, and metrics
   */
  async analyze(targetPath, options = {}) {
    if (!this.client) {
      throw new Error('RuntimeClient not initialized');
    }

    this.logger.debug(`[CodeAnalyzer] Analyzing: ${targetPath}`, options);

    try {
      // Build analysis input
      const input = {
        files: [targetPath],
        project_root: options.projectRoot || process.cwd(),
        skip_tests: options.skipTests !== false,
        skip_node_modules: options.skipNodeModules !== false,
        complexity_threshold: options.complexityThreshold || 10,
        dry_threshold: options.dryThreshold || 3,
        include_metrics: options.includeMetrics !== false
      };

      // Invoke skill
      const result = await this.client.invokeSkill('code-analysis', input, {
        projectPath: options.projectPath || process.cwd(),
        timeout: options.timeout || 30000
      });

      if (!result.success) {
        throw new SkillExecutionError('Code analysis failed', {
          skillId: 'code-analysis',
          error: result.error
        });
      }

      // Process findings
      const processed = this.processFindings(result.result);

      // Generate summary
      const summary = this.generateSummary(processed);

      return {
        success: true,
        skillId: 'code-analysis',
        findings: processed,
        summary,
        duration: result.duration,
        timestamp: result.timestamp
      };

    } catch (error) {
      if (error instanceof TimeoutError) {
        throw error;
      }
      throw new SkillExecutionError(`Code analysis failed: ${error.message}`, {
        skillId: 'code-analysis',
        error: error.message
      });
    }
  }

  /**
   * Process and categorize findings
   */
  processFindings(result) {
    const findings = result.findings || [];

    // Categorize
    const categories = {
      complexity: [],
      duplication: [],
      testing: [],
      style: [],
      other: []
    };

    for (const finding of findings) {
      const category = finding.category || 'other';
      if (categories[category]) {
        categories[category].push(finding);
      } else {
        categories.other.push(finding);
      }
    }

    // Sort by severity within each category
    for (const category in categories) {
      categories[category].sort((a, b) => {
        const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
        return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      });
    }

    return {
      byCategory: categories,
      all: findings,
      total: findings.length,
      metrics: result.metrics || {}
    };
  }

  /**
   * Generate professional summary and recommendations
   */
  generateSummary(processed) {
    const recommendations = [];
    const { byCategory, metrics, total } = processed;

    // Complexity analysis
    if (byCategory.complexity.length > 0) {
      const critical = byCategory.complexity.filter(f => f.severity === 'CRITICAL').length;
      const high = byCategory.complexity.filter(f => f.severity === 'HIGH').length;

      if (critical > 0) {
        recommendations.push({
          priority: 'CRITICAL',
          category: 'Complexity',
          message: `${critical} function(s) with high cyclomatic complexity. Refactor to reduce branching.`,
          impact: 'high',
          effort: 'medium'
        });
      }

      if (high > 0) {
        recommendations.push({
          priority: 'HIGH',
          category: 'Complexity',
          message: `${high} function(s) exceed recommended complexity threshold`,
          impact: 'medium',
          effort: 'medium'
        });
      }
    }

    // DRY analysis
    if (byCategory.duplication.length > 0) {
      const duplicated = byCategory.duplication.length;
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Code Duplication',
        message: `${duplicated} code block(s) with duplication detected`,
        impact: 'medium',
        effort: 'high'
      });
    }

    // Testing analysis
    if (byCategory.testing.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Testing',
        message: `${byCategory.testing.length} function(s) lack proper test coverage`,
        impact: 'high',
        effort: 'medium'
      });
    }

    // Overall score
    const score = this.calculateQualityScore(metrics, total);

    return {
      overallScore: score,
      totalIssues: total,
      byCategory: {
        complexity: byCategory.complexity.length,
        duplication: byCategory.duplication.length,
        testing: byCategory.testing.length,
        style: byCategory.style.length,
        other: byCategory.other.length
      },
      recommendations: recommendations.sort((a, b) => {
        const priorityOrder = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }),
      metrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate overall code quality score (0-100)
   */
  calculateQualityScore(metrics, totalIssues) {
    let score = 100;

    // Deduct for issues
    score -= Math.min(totalIssues * 2, 30);

    // Deduct for complexity
    if (metrics.averageComplexity > 10) {
      score -= Math.min((metrics.averageComplexity - 10) * 2, 20);
    }

    // Deduct for duplication
    if (metrics.duplicationPercentage > 5) {
      score -= Math.min(metrics.duplicationPercentage, 15);
    }

    // Deduct for test coverage
    if (metrics.testCoverage < 80) {
      score -= Math.max(0, (80 - metrics.testCoverage) * 0.5);
    }

    return Math.max(0, Math.round(score));
  }
}

module.exports = CodeAnalyzer;
