/**
 * DocGenerator - OpenCode wrapper for doc-generator skill
 * 
 * Generates comprehensive project documentation
 * Integrates with the doc-generator agent module
 */

const { spawn } = require('child_process');
const path = require('path');

class DocGenerator {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.timeout = options.timeout || 30000;
    this.runtimePath = options.runtimePath || path.join(__dirname, '../../..');
  }

  /**
   * Generate documentation
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated documentation
   */
  async generate(options = {}) {
    const {
      project_root = process.cwd(),
      include_readme = true,
      include_api_docs = true,
      include_changelog = false,
      package_json = null,
      dry_run = true
    } = options;

    return this.invokeSkill('doc-generator', {
      project_root,
      include_readme,
      include_api_docs,
      include_changelog,
      package_json,
      dry_run
    });
  }

  /**
   * Invoke doc-generator skill
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
          this.logger.error('Documentation generation failed:', errorOutput);
          reject(new Error(`Documentation generation failed: ${errorOutput}`));
          return;
        }

        try {
          const result = JSON.parse(output);
          resolve(this.processResults(result));
        } catch (err) {
          reject(new Error(`Failed to parse documentation output: ${err.message}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Documentation generation error: ${err.message}`));
      });
    });
  }

  /**
   * Process skill results
   */
  processResults(skillOutput) {
    const { generated_docs = [], summary = {} } = skillOutput;

    return {
      generated: generated_docs.length,
      totalLines: summary.total_lines || 0,
      documents: generated_docs,
      summary: {
        message: `Generated ${generated_docs.length} documentation files with ~${summary.total_lines || 0} lines`,
        files: generated_docs.map(d => d.file)
      }
    };
  }

  /**
   * Generate README only
   */
  async generateReadme(packageJson, options = {}) {
    return this.generate({
      include_readme: true,
      include_api_docs: false,
      include_changelog: false,
      package_json: packageJson,
      ...options
    });
  }

  /**
   * Generate API docs only
   */
  async generateApiDocs(options = {}) {
    return this.generate({
      include_readme: false,
      include_api_docs: true,
      include_changelog: false,
      ...options
    });
  }

  /**
   * Generate all documentation
   */
  async generateAll(packageJson, options = {}) {
    return this.generate({
      include_readme: true,
      include_api_docs: true,
      include_changelog: true,
      package_json: packageJson,
      ...options
    });
  }
}

module.exports = DocGenerator;
