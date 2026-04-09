/**
 * CodeFormatter - OpenCode wrapper for code-formatter skill
 * 
 * Fixes code style, formatting, imports, and unused code
 * Integrates with the code-formatter agent module
 */

const { spawn } = require('child_process');
const path = require('path');

class CodeFormatter {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.timeout = options.timeout || 30000;
    this.runtimePath = options.runtimePath || path.join(__dirname, '../../..');
  }

  /**
   * Format code files
   * @param {Array} files - Files to format
   * @param {Object} options - Format options
   * @returns {Promise<Object>} Formatting results
   */
  async format(files, options = {}) {
    const {
      project_root = process.cwd(),
      config = 'prettier',
      rules = ['format', 'imports', 'unused'],
      dry_run = true
    } = options;

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('At least one file must be specified');
    }

    return this.invokeSkill('code-formatter', {
      files,
      project_root,
      config,
      rules,
      dry_run
    });
  }

  /**
   * Invoke code-formatter skill
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
          this.logger.error('Code formatting failed:', errorOutput);
          reject(new Error(`Code formatting failed: ${errorOutput}`));
          return;
        }

        try {
          const result = JSON.parse(output);
          resolve(this.processResults(result));
        } catch (err) {
          reject(new Error(`Failed to parse formatting output: ${err.message}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Formatting error: ${err.message}`));
      });
    });
  }

  /**
   * Process skill results
   */
  processResults(skillOutput) {
    const { fixed_files = [], summary = {} } = skillOutput;

    return {
      fixed: fixed_files.length,
      totalChanges: summary.total_changes || 0,
      files: fixed_files,
      summary: {
        message: `Fixed ${fixed_files.length} file(s) with ${summary.total_changes || 0} changes`,
        rules: summary.rules_applied,
        dryRun: summary.dry_run
      }
    };
  }

  /**
   * Format with all rules
   */
  async formatAll(files, options = {}) {
    return this.format(files, {
      rules: ['format', 'imports', 'unused', 'eslint'],
      ...options
    });
  }

  /**
   * Preview formatting changes
   */
  async preview(files, options = {}) {
    return this.format(files, {
      dry_run: true,
      ...options
    });
  }

  /**
   * Apply formatting changes
   */
  async apply(files, options = {}) {
    return this.format(files, {
      dry_run: false,
      ...options
    });
  }
}

module.exports = CodeFormatter;
