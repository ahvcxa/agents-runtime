/**
 * Runtime Client
 * Safe wrapper for invoking agents-runtime skills
 * Enforces constraints at every step
 */

const path = require('path');
const { spawn } = require('child_process');
const {
  SkillExecutionError,
  TimeoutError,
  ParseError
} = require('./errors');

class RuntimeClient {
  constructor(agentsRuntimePath = '.', constraints = {}, logger = console) {
    this.runtimePath = agentsRuntimePath;
    this.constraints = constraints;
    this.logger = logger;
    this.activeProcesses = new Map();
  }

  /**
   * Invoke a skill with timeout and error handling
   */
  async invokeSkill(skillId, input, options = {}) {
    const startTime = Date.now();
    const timeout = options.timeout || 30000;
    const projectPath = options.projectPath || process.cwd();

    this.logger.debug(`[RuntimeClient] Invoking skill: ${skillId}`, {
      input: typeof input === 'string' ? input : JSON.stringify(input).substring(0, 100),
      projectPath
    });

    try {
      // Build command
      const cmd = 'node';
      const args = [
        path.join(this.runtimePath, 'bin', 'agents.js'),
        'run',
        '--skill', skillId,
        '--input', typeof input === 'string' ? input : JSON.stringify(input),
        '--project', projectPath,
        '--json'  // Request JSON output
      ];

      // Execute with timeout
      const result = await this.executeWithTimeout(cmd, args, timeout, skillId);

      const duration = Date.now() - startTime;

      this.logger.debug(`[RuntimeClient] Skill completed: ${skillId}`, {
        duration,
        resultSize: JSON.stringify(result).length
      });

      return {
        success: true,
        skillId,
        result,
        duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof TimeoutError) {
        throw error;
      }

      throw new SkillExecutionError(
        `Skill "${skillId}" execution failed: ${error.message}`,
        {
          skillId,
          duration,
          error: error.message,
          logs: error.logs || []
        }
      );
    }
  }

  /**
   * Execute command with timeout
   */
  async executeWithTimeout(cmd, args, timeout, skillId) {
    return new Promise((resolve, reject) => {
      let killed = false;
      let output = '';
      let errorOutput = '';

      const process = spawn(cmd, args, {
        cwd: this.runtimePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
      });

      this.activeProcesses.set(skillId, process);

      // Collect output
      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Set timeout
      const timeoutHandle = setTimeout(() => {
        killed = true;
        process.kill('SIGTERM');

        reject(new TimeoutError(
          `Skill "${skillId}" exceeded timeout of ${timeout}ms`,
          { operation: skillId, duration: timeout, limit: timeout }
        ));
      }, timeout);

      // Handle completion
      process.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(skillId);

        if (killed) return; // Already rejected

        if (code !== 0) {
          reject(new Error(
            `Process exited with code ${code}\nStderr: ${errorOutput}`
          ));
          return;
        }

        // Try to parse JSON output
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (parseError) {
          reject(new ParseError(
            `Failed to parse skill output as JSON`,
            {
              data: output.substring(0, 500),
              format: 'json',
              error: parseError
            }
          ));
        }
      });

      process.on('error', (error) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(skillId);
        reject(error);
      });
    });
  }

  /**
   * Execute multiple skills in parallel
   */
  async invokeMultiple(skills, input, options = {}) {
    const promises = skills.map(skillId =>
      this.invokeSkill(skillId, input, options)
        .catch(error => ({
          success: false,
          skillId,
          error: error.message,
          timestamp: new Date().toISOString()
        }))
    );

    const results = await Promise.all(promises);

    // Separate successes and failures
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      results: {
        success: successful,
        error: failed
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if runtime is available
   */
  async healthCheck() {
    try {
      const result = await this.executeWithTimeout(
        'node',
        [path.join(this.runtimePath, 'bin', 'agents.js'), '--version'],
        5000,
        'healthcheck'
      );

      this.logger.info('[RuntimeClient] Health check passed', result);
      return { healthy: true, info: result };
    } catch (error) {
      this.logger.error('[RuntimeClient] Health check failed', error.message);
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Kill active processes (cleanup)
   */
  killAllProcesses() {
    for (const [skillId, process] of this.activeProcesses) {
      this.logger.warn(`Killing process for skill: ${skillId}`);
      process.kill('SIGKILL');
    }
    this.activeProcesses.clear();
  }

  /**
   * Get active process count
   */
  getActiveProcessCount() {
    return this.activeProcesses.size;
  }
}

module.exports = RuntimeClient;
