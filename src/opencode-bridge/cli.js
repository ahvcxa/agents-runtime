/**
 * AnalysisCLI - Command-line interface for running analyses
 * 
 * Provides user-facing commands:
 * - analyze <path> - Run code analysis on a project
 * - audit <path> - Run security audit
 * - suggest-refactoring <path> - Generate refactoring suggestions
 * - inspect <file> - Inspect a specific file
 */

const path = require('path');
const fs = require('fs');
const AgentBridge = require('./agent-bridge');
const CodeAnalyzer = require('./skills/code-analyzer');
const SecurityAuditor = require('./skills/security-auditor');
const DecisionEngine = require('./decision-engine');
const OutputProcessor = require('./output-processor');

class AnalysisCLI {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.outputFormat = options.outputFormat || 'markdown';
    this.outputFile = options.outputFile || null;
    this.logger = options.logger || console;
    
    this.agentBridge = new AgentBridge(options);
    this.codeAnalyzer = new CodeAnalyzer(options);
    this.securityAuditor = new SecurityAuditor(options);
    this.decisionEngine = new DecisionEngine(options);
    this.outputProcessor = new OutputProcessor(options);
  }

  /**
   * Analyze a project for code quality issues
   * @param {string} targetPath - Path to analyze (file or directory)
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis results
   */
  async analyze(targetPath, options = {}) {
    try {
      this.logger.info(`[CLI] Starting code analysis on: ${targetPath}`);

      // Validate path
      const resolvedPath = path.resolve(this.projectPath, targetPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Path not found: ${resolvedPath}`);
      }

      // Run code analysis
      this.logger.info('[CLI] Running code analysis...');
      const codeAnalysisResults = await this.codeAnalyzer.analyze(resolvedPath);

      // Run security audit
      this.logger.info('[CLI] Running security audit...');
      const securityAuditResults = await this.securityAuditor.audit(resolvedPath);

      // Aggregate findings
      this.logger.info('[CLI] Aggregating and processing findings...');
      const aggregated = this.decisionEngine.aggregateFindings({
        codeAnalysis: codeAnalysisResults,
        securityAudit: securityAuditResults
      });

      // Calculate risk score
      const riskScore = this.decisionEngine.calculateRiskScore(aggregated);

      // Generate recommendations
      const recommendations = this.decisionEngine.generateRecommendations(aggregated);

      // Generate action plan
      const actionPlan = this.decisionEngine.generateActionPlan(aggregated, riskScore);

      const result = {
        path: resolvedPath,
        timestamp: new Date().toISOString(),
        analysis: {
          aggregated,
          riskScore,
          recommendations,
          actionPlan
        }
      };

      // Output results
      await this.outputResults(result);

      return result;
    } catch (error) {
      this.logger.error('[CLI] Analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Run security-focused audit
   * @param {string} targetPath - Path to audit
   * @param {Object} options - Audit options
   * @returns {Promise<Object>} Security audit results
   */
  async audit(targetPath, options = {}) {
    try {
      this.logger.info(`[CLI] Starting security audit on: ${targetPath}`);

      const resolvedPath = path.resolve(this.projectPath, targetPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Path not found: ${resolvedPath}`);
      }

      // Run comprehensive security audit
      this.logger.info('[CLI] Running security audit...');
      const auditResults = await this.securityAuditor.audit(resolvedPath);

      // Create aggregated result with security focus
      const aggregated = this.decisionEngine.aggregateFindings({
        codeAnalysis: { findings: [] },
        securityAudit: auditResults
      });

      // Filter to only security findings
      aggregated.allFindings = aggregated.allFindings.filter(
        f => f.originalSource === 'security-audit'
      );

      const riskScore = this.decisionEngine.calculateRiskScore(aggregated);
      const recommendations = this.decisionEngine.generateRecommendations(aggregated);

      const result = {
        path: resolvedPath,
        timestamp: new Date().toISOString(),
        type: 'security-audit',
        audit: {
          aggregated,
          riskScore,
          recommendations
        }
      };

      await this.outputResults(result);
      return result;
    } catch (error) {
      this.logger.error('[CLI] Audit failed:', error.message);
      throw error;
    }
  }

  /**
   * Suggest refactoring opportunities
   * @param {string} targetPath - Path to analyze
   * @param {Object} options - Refactoring options
   * @returns {Promise<Object>} Refactoring suggestions
   */
  async suggestRefactoring(targetPath, options = {}) {
    try {
      this.logger.info(`[CLI] Analyzing refactoring opportunities in: ${targetPath}`);

      const resolvedPath = path.resolve(this.projectPath, targetPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Path not found: ${resolvedPath}`);
      }

      // Run code analysis (focuses on refactoring-relevant issues)
      this.logger.info('[CLI] Running code analysis for refactoring suggestions...');
      const codeAnalysisResults = await this.codeAnalyzer.analyze(resolvedPath);

      // Filter for refactoring-relevant findings
      const refactoringFindings = codeAnalysisResults.findings.filter(f => {
        const message = (f.message || '').toLowerCase();
        return message.includes('duplicate') || 
               message.includes('complexity') || 
               message.includes('long') ||
               message.includes('smell');
      });

      const aggregated = this.decisionEngine.aggregateFindings({
        codeAnalysis: { findings: refactoringFindings },
        securityAudit: { findings: [] }
      });

      const recommendations = this.decisionEngine.generateRecommendations(aggregated);

      const result = {
        path: resolvedPath,
        timestamp: new Date().toISOString(),
        type: 'refactoring-suggestions',
        refactoring: {
          aggregated,
          recommendations,
          focusAreas: this.identifyRefactoringFocusAreas(recommendations)
        }
      };

      await this.outputResults(result);
      return result;
    } catch (error) {
      this.logger.error('[CLI] Refactoring analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Inspect a specific file
   * @param {string} filePath - File to inspect
   * @param {Object} options - Inspection options
   * @returns {Promise<Object>} File inspection results
   */
  async inspect(filePath, options = {}) {
    try {
      this.logger.info(`[CLI] Inspecting file: ${filePath}`);

      const resolvedPath = path.resolve(this.projectPath, filePath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }

      if (!fs.statSync(resolvedPath).isFile()) {
        throw new Error(`Not a file: ${resolvedPath}`);
      }

      // Analyze just this file
      const codeAnalysisResults = await this.codeAnalyzer.analyze(resolvedPath);
      const securityAuditResults = await this.securityAuditor.audit(resolvedPath);

      const aggregated = this.decisionEngine.aggregateFindings({
        codeAnalysis: codeAnalysisResults,
        securityAudit: securityAuditResults
      });

      const riskScore = this.decisionEngine.calculateRiskScore(aggregated);
      const recommendations = this.decisionEngine.generateRecommendations(aggregated);

      // Get file content info
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const lines = content.split('\n');
      const size = fs.statSync(resolvedPath).size;

      const result = {
        file: resolvedPath,
        timestamp: new Date().toISOString(),
        type: 'file-inspection',
        fileInfo: {
          lines: lines.length,
          characters: content.length,
          bytes: size,
          language: this.detectLanguage(filePath)
        },
        inspection: {
          aggregated,
          riskScore,
          recommendations,
          topIssues: aggregated.allFindings.slice(0, 10)
        }
      };

      await this.outputResults(result);
      return result;
    } catch (error) {
      this.logger.error('[CLI] File inspection failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate comparison report between two analyses
   * @param {Object} previousResults - Previous analysis results
   * @param {Object} currentResults - Current analysis results
   * @returns {Promise<Object>} Comparison report
   */
  async compareAnalyses(previousResults, currentResults) {
    try {
      this.logger.info('[CLI] Generating comparison report...');

      const previousAggregated = previousResults.analysis.aggregated || previousResults.audit.aggregated;
      const currentAggregated = currentResults.analysis.aggregated || currentResults.audit.aggregated;

      const comparison = this.decisionEngine.compareResults(previousAggregated, currentAggregated);

      const result = {
        timestamp: new Date().toISOString(),
        type: 'comparison',
        comparison,
        trend: comparison.trend,
        improvement: comparison.resolvedFindings - comparison.newFindings
      };

      await this.outputResults(result);
      return result;
    } catch (error) {
      this.logger.error('[CLI] Comparison failed:', error.message);
      throw error;
    }
  }

  /**
   * Output results in configured format
   */
  async outputResults(result) {
    try {
      let formatted;

      if (this.outputFormat === 'json') {
        formatted = JSON.stringify(result, null, 2);
      } else if (this.outputFormat === 'markdown') {
        formatted = this.formatMarkdownReport(result);
      } else if (this.outputFormat === 'text') {
        formatted = this.formatTextReport(result);
      } else {
        formatted = JSON.stringify(result, null, 2);
      }

      if (this.outputFile) {
        fs.writeFileSync(this.outputFile, formatted, 'utf8');
        this.logger.info(`[CLI] Results written to: ${this.outputFile}`);
      } else {
        console.log(formatted);
      }
    } catch (error) {
      this.logger.error('[CLI] Output writing failed:', error.message);
      throw error;
    }
  }

  /**
   * Format results as Markdown
   */
  formatMarkdownReport(result) {
    let md = '';

    if (result.type === 'comparison') {
      md += `# Analysis Comparison\n\n`;
      md += `**Trend**: ${result.trend === 'improving' ? '✓ Improving' : '✗ Degrading'}\n`;
      md += `**Net Change**: ${result.improvement > 0 ? '+' : ''}${result.improvement} issues\n\n`;
      md += `- New Issues: ${result.comparison.newFindings}\n`;
      md += `- Resolved Issues: ${result.comparison.resolvedFindings}\n\n`;
      md += `${result.comparison.summary}\n`;
    } else {
      const aggregated = result.analysis?.aggregated || result.audit?.aggregated || result.refactoring?.aggregated || result.inspection?.aggregated;
      const riskScore = result.analysis?.riskScore || result.audit?.riskScore || result.inspection?.riskScore;
      const recommendations = result.analysis?.recommendations || result.audit?.recommendations || result.refactoring?.recommendations || result.inspection?.recommendations || [];

      if (aggregated && riskScore) {
        const formattedOutput = this.outputProcessor.formatAsMarkdown(aggregated, riskScore, recommendations, result.timestamp);
        md += formattedOutput;
      } else {
        md = JSON.stringify(result, null, 2);
      }
    }

    return md;
  }

  /**
   * Format results as plain text
   */
  formatTextReport(result) {
    let text = '';

    if (result.type === 'comparison') {
      text += 'ANALYSIS COMPARISON\n';
      text += '=' .repeat(40) + '\n\n';
      text += `Trend: ${result.trend}\n`;
      text += `Net Change: ${result.improvement}\n`;
      text += `New Issues: ${result.comparison.newFindings}\n`;
      text += `Resolved: ${result.comparison.resolvedFindings}\n\n`;
      text += result.comparison.summary + '\n';
    } else {
      const aggregated = result.analysis?.aggregated || result.audit?.aggregated || result.inspection?.aggregated;
      const riskScore = result.analysis?.riskScore || result.audit?.riskScore || result.inspection?.riskScore;
      const recommendations = result.analysis?.recommendations || result.audit?.recommendations || result.inspection?.recommendations || [];

      if (aggregated && riskScore) {
        text = this.outputProcessor.formatAsText(aggregated, riskScore, recommendations, result.timestamp);
      }
    }

    return text;
  }

  /**
   * Identify focus areas for refactoring
   */
  identifyRefactoringFocusAreas(recommendations) {
    const areas = {};
    for (const rec of recommendations) {
      if (!areas[rec.category]) {
        areas[rec.category] = [];
      }
      areas[rec.category].push(rec.actionItems);
    }
    return areas;
  }

  /**
   * Detect programming language from file extension
   */
  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.jsx': 'JSX',
      '.tsx': 'TSX',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.go': 'Go',
      '.rs': 'Rust',
      '.rb': 'Ruby',
      '.php': 'PHP'
    };
    return languageMap[ext] || 'Unknown';
  }
}

module.exports = AnalysisCLI;
