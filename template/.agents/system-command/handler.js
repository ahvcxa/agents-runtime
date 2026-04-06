const { execFile, exec } = require('child_process');
const path = require('path');

// Whitelist of allowed commands
const ALLOWED_COMMANDS = {
  'node': { timeout: 600000, description: 'Node.js runtime' },
  'npm': { timeout: 300000, description: 'NPM package manager' },
  'git': { timeout: 60000, description: 'Git version control' },
  'curl': { timeout: 60000, description: 'HTTP client' },
  'jq': { timeout: 30000, description: 'JSON processor' },
  'grep': { timeout: 30000, description: 'Text search' },
  'ls': { timeout: 10000, description: 'List files' },
  'cat': { timeout: 10000, description: 'Read files' },
  'mkdir': { timeout: 5000, description: 'Create directory' },
  'rm': { timeout: 10000, description: 'Remove files' },
  'mv': { timeout: 10000, description: 'Move files' },
  'cp': { timeout: 10000, description: 'Copy files' },
  'echo': { timeout: 5000, description: 'Print text' },
  'pwd': { timeout: 5000, description: 'Print working directory' },
  'whoami': { timeout: 5000, description: 'Print username' },
  'which': { timeout: 5000, description: 'Find command' },
  'date': { timeout: 5000, description: 'Print date/time' },
  'find': { timeout: 30000, description: 'Find files' },
  'tar': { timeout: 60000, description: 'Archive files' },
  'zip': { timeout: 60000, description: 'Zip files' },
  'unzip': { timeout: 60000, description: 'Unzip files' },
  'python': { timeout: 300000, description: 'Python interpreter' },
  'python3': { timeout: 300000, description: 'Python 3 interpreter' }
};

const DANGEROUS_COMMANDS = [
  'sudo', 'su', 'passwd', 'chmod', 'chown',
  'rm -rf', 'mkfs', 'dd', 'fdisk',
  'kill -9', 'killall'
];

const MAX_OUTPUT_SIZE = 2 * 1024 * 1024; // 2MB
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*['"]?([^'"\s]+)/gi,
  /token\s*[:=]\s*['"]?([^'"\s]+)/gi,
  /api[_-]?key\s*[:=]\s*['"]?([^'"\s]+)/gi,
  /authorization\s*[:=]\s*['"]?([^'"\s,]+)/gi,
  /secret\s*[:=]\s*['"]?([^'"\s]+)/gi,
  /aws[_-]?secret/gi
];

/**
 * Mask sensitive environment variables
 */
function maskSensitiveEnv(env) {
  const masked = { ...env };
  const sensitiveKeys = [
    'PASSWORD', 'TOKEN', 'API_KEY', 'SECRET',
    'AWS_SECRET_ACCESS_KEY', 'DATABASE_PASSWORD',
    'PRIVATE_KEY', 'AUTH_TOKEN'
  ];
  
  for (const key of sensitiveKeys) {
    for (const envKey of Object.keys(masked)) {
      if (envKey.toUpperCase().includes(key.toUpperCase())) {
        masked[envKey] = '***MASKED***';
      }
    }
  }
  
  return masked;
}

/**
 * Check if command is in whitelist
 */
function isCommandAllowed(command) {
  const baseCommand = path.basename(command);
  
  // Check whitelist
  if (!(baseCommand in ALLOWED_COMMANDS)) {
    return { allowed: false, reason: 'Command not in whitelist' };
  }
  
  // Check dangerous patterns
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (command.includes(dangerous)) {
      return { allowed: false, reason: 'Dangerous command pattern detected' };
    }
  }
  
  return { allowed: true };
}

/**
 * Execute shell command safely
 */
function executeCommand(command, args, cwd, timeout, env) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let stderrSize = 0;
    let timedOut = false;

    // Merge environment (add to existing, don't replace)
    const childEnv = {
      ...process.env,
      ...env
    };

    const child = execFile(command, args, {
      cwd: cwd || process.cwd(),
      env: childEnv,
      timeout: timeout || 60000,
      maxBuffer: MAX_OUTPUT_SIZE
    });

    // Collect stdout
    child.stdout.on('data', (data) => {
      const dataStr = data.toString();
      stdoutSize += Buffer.byteLength(dataStr);
      
      if (stdoutSize > MAX_OUTPUT_SIZE) {
        child.kill('SIGTERM');
        reject(new Error('Output size exceeds limit'));
        return;
      }
      
      stdout += dataStr;
    });

    // Collect stderr
    child.stderr.on('data', (data) => {
      const dataStr = data.toString();
      stderrSize += Buffer.byteLength(dataStr);
      
      if (stderrSize > MAX_OUTPUT_SIZE) {
        child.kill('SIGTERM');
        reject(new Error('Error output size exceeds limit'));
        return;
      }
      
      stderr += dataStr;
    });

    // Handle completion
    child.on('close', (code, signal) => {
      if (timedOut) {
        return; // Already rejected
      }
      
      resolve({
        stdout: stdout.slice(0, MAX_OUTPUT_SIZE),
        stderr: stderr.slice(0, MAX_OUTPUT_SIZE),
        exitCode: code,
        signal: signal
      });
    });

    // Handle timeout
    child.on('error', (err) => {
      if (err.code === 'ETIMEDOUT') {
        timedOut = true;
        reject(new Error(`Command timed out after ${timeout}ms`));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Execute system command
 * @param {Object} input - Input parameters
 * @param {Object} context - Runtime context (optional)
 * @returns {Promise<Object>} Standard response object
 */
async function execute(input, context = {}) {
  const startTime = Date.now();

  try {
    const {
      command,
      args = [],
      cwd = null,
      timeout = 60000,
      env = {}
    } = input;

    // Validate command is in whitelist
    const validation = isCommandAllowed(command);
    if (!validation.allowed) {
      return {
        success: false,
        data: null,
        error: {
          code: 'COMMAND_NOT_ALLOWED',
          message: `Command '${command}' is not in whitelist`,
          details: {
            reason: validation.reason
          }
        },
        metadata: {
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          command
        }
      };
    }

    // Validate args are strings (no shell injection)
    if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string')) {
      return {
        success: false,
        data: null,
        error: {
          code: 'INVALID_ARGS',
          message: 'Arguments must be array of strings'
        },
        metadata: {
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          command
        }
      };
    }

    // Check total args length
    const totalArgsSize = args.reduce((sum, arg) => sum + Buffer.byteLength(arg), 0);
    if (totalArgsSize > 32 * 1024) {
      return {
        success: false,
        data: null,
        error: {
          code: 'ARGS_TOO_LARGE',
          message: 'Total argument size exceeds 32KB limit'
        },
        metadata: {
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          command
        }
      };
    }

    // Execute command
    const result = await executeCommand(command, args, cwd, timeout, env);

    return {
      success: result.exitCode === 0,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        signal: result.signal
      },
      error: result.exitCode !== 0 ? {
        code: 'COMMAND_FAILED',
        message: `Command exited with code ${result.exitCode}`,
        details: {
          exitCode: result.exitCode,
          signal: result.signal
        }
      } : null,
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        command,
        outputSize: Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)
      }
    };
  } catch (err) {
    let errorCode = 'COMMAND_EXECUTION_FAILED';
    let errorMessage = err.message;

    if (err.message.includes('timeout')) {
      errorCode = 'COMMAND_TIMEOUT';
      errorMessage = `Command timed out after ${input.timeout || 60000}ms`;
    } else if (err.message.includes('ENOENT')) {
      errorCode = 'COMMAND_NOT_FOUND';
      errorMessage = `Command '${input.command}' not found in PATH`;
    } else if (err.message.includes('Output size')) {
      errorCode = 'OUTPUT_TOO_LARGE';
      errorMessage = 'Command output exceeds size limit (2MB)';
    }

    return {
      success: false,
      data: null,
      error: {
        code: errorCode,
        message: errorMessage
      },
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        command: input.command
      }
    };
  }
}

module.exports = { execute, ALLOWED_COMMANDS };
