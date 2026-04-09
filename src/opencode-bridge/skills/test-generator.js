/**
 * TestGenerator - OpenCode wrapper for test-generator skill
 * 
 * Generates unit tests from code analysis findings
 * Integrates with the test-generator agent module
 */

const { spawn } = require('child_process');
const path = require('path');

class TestGenerator {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.timeout = options.timeout || 30000;
    this.runtimePath = options.runtimePath || path.join(__dirname, '../../..');
  }

  /**
   * Generate tests for code findings
   * @param {Array} findings - Code analysis findings
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated tests
   */
  async generate(findings, options = {}) {
    const {
      framework = 'jest',
      coverage_target = 80,
      dry_run = true,
      project_root = process.cwd()
    } = options;

    return this.invokeSkill('test-generator', {
      findings,
      test_framework: framework,
      coverage_target,
      dry_run,
      project_root
    });
  }

  /**
   * Invoke test-generator skill
   */
  async invokeSkill(skillId, input) {
    return new Promise((resolve, reject) => {
      const args = [
        'bin/agents.js',
        'run',
        '--skill', skillId,
        '--input', JSON.stringify(input),
        '--json'
      ];

      const proc = spawn('node', args, {
        cwd: this.runtimePath,
        timeout: this.timeout
      });

      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          this.logger.error('Test generation failed:', errorOutput);
          reject(new Error(`Test generation failed: ${errorOutput}`));
          return;
        }

        try {
          const result = JSON.parse(output);
          resolve(this.processResults(result));
        } catch (err) {
          reject(new Error(`Failed to parse test generation output: ${err.message}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Test generation error: ${err.message}`));
      });
    });
  }

  /**
   * Process skill results
   */
  processResults(skillOutput) {
    const { generated_tests = [], summary = {} } = skillOutput;

    return {
      generated: generated_tests.length,
      totalLines: summary.total_lines || 0,
      estimatedCoverage: summary.estimated_coverage || 0,
      framework: summary.framework || 'jest',
      tests: generated_tests,
      summary: {
        message: `Generated ${generated_tests.length} test files with ~${summary.total_lines || 0} lines of code`,
        coverage: `${summary.estimated_coverage || 0}% (target: ${summary.coverage_target || 80}%)`,
        mocks: summary.mocks_generated || 0
      }
    };
  }

  /**
   * Generate tests for specific files
   */
  async generateForFiles(files, options = {}) {
    const findings = files.map(file => ({
      file,
      type: 'testing',
      message: 'Test coverage needed',
      severity: 'MEDIUM'
    }));

    return this.generate(findings, options);
  }

  /**
   * Get test generation recommendations
   */
  getRecommendations(codeAnalysisResults) {
    const findings = codeAnalysisResults.findings || [];
    const testingIssues = findings.filter(f => 
      f.category === 'testing' || f.type === 'testing'
    );

    return {
      totalIssues: testingIssues.length,
      recommendations: testingIssues.map(issue => ({
        file: issue.file,
        priority: issue.severity,
        suggestion: `Generate tests for ${issue.file}`,
        message: issue.message
      })),
      estimatedTestCount: Math.ceil(testingIssues.length * 1.5)
    };
  }
}

module.exports = TestGenerator;
