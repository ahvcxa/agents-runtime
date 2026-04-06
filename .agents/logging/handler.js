const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const LOG_DIR = '.agents/logs';
const LOG_FILE = path.join(LOG_DIR, 'agent.log');
const MAX_LOG_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_LOG_FILES = 10;

// Sensitive data patterns
const SENSITIVE_PATTERNS = [
  { pattern: /password\s*[:=]\s*['"]?([^'"\s,}]+)/gi, key: 'password' },
  { pattern: /token\s*[:=]\s*['"]?([^'"\s,}]+)/gi, key: 'token' },
  { pattern: /api[_-]?key\s*[:=]\s*['"]?([^'"\s,}]+)/gi, key: 'api_key' },
  { pattern: /authorization\s*[:=]\s*['"]?([^'"\s,}]+)/gi, key: 'authorization' },
  { pattern: /secret\s*[:=]\s*['"]?([^'"\s,}]+)/gi, key: 'secret' },
  { pattern: /aws[_-]?secret\s*[:=]\s*['"]?([^'"\s,}]+)/gi, key: 'aws_secret' },
  { pattern: /private[_-]?key\s*[:=]\s*['"]?([^'"\s,}]+)/gi, key: 'private_key' }
];

/**
 * Mask sensitive data in string
 */
function maskSensitiveData(str) {
  if (typeof str !== 'string') {
    return { masked: str, maskedFields: [] };
  }

  let masked = str;
  const maskedFields = [];

  for (const { pattern, key } of SENSITIVE_PATTERNS) {
    if (pattern.test(masked)) {
      maskedFields.push(key);
      masked = masked.replace(pattern, (match) => {
        return match.replace(/(['"]?)([^'"\s,}]+)(['"]?)$/, `$1***MASKED***$3`);
      });
      pattern.lastIndex = 0; // Reset regex
    }
  }

  return { masked, maskedFields };
}

/**
 * Mask sensitive data in object
 */
function maskSensitiveObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return { masked: obj, maskedFields: [] };
  }

  const maskedFields = [];
  const sensitiveKeys = [
    'password', 'token', 'api_key', 'apiKey',
    'authorization', 'secret', 'aws_secret', 'private_key'
  ];

  const maskRecursive = (target) => {
    for (const key in target) {
      if (target.hasOwnProperty(key)) {
        const lower = key.toLowerCase();

        if (sensitiveKeys.some(sk => lower.includes(sk.toLowerCase()))) {
          if (typeof target[key] === 'string' && target[key].length > 0) {
            target[key] = '***MASKED***';
            if (!maskedFields.includes(key)) {
              maskedFields.push(key);
            }
          }
        } else if (typeof target[key] === 'object' && target[key] !== null) {
          maskRecursive(target[key]);
        }
      }
    }
  };

  const copy = JSON.parse(JSON.stringify(obj));
  maskRecursive(copy);

  return { masked: copy, maskedFields };
}

/**
 * Ensure log directory exists
 */
async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create log directory:', err);
  }
}

/**
 * Rotate logs if size exceeded
 */
async function rotateLogsIfNeeded() {
  try {
    const stats = fsSync.statSync(LOG_FILE);
    
    if (stats.size > MAX_LOG_FILE_SIZE) {
      const timestamp = new Date().getTime();
      const backupFile = `${LOG_FILE}.${timestamp}`;
      await fs.rename(LOG_FILE, backupFile);

      // Clean up old logs
      const files = await fs.readdir(LOG_DIR);
      const logFiles = files
        .filter(f => f.startsWith('agent.log.'))
        .sort()
        .reverse();

      if (logFiles.length > MAX_LOG_FILES) {
        for (let i = MAX_LOG_FILES; i < logFiles.length; i++) {
          await fs.unlink(path.join(LOG_DIR, logFiles[i]));
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Log rotation failed:', err);
    }
  }
}

/**
 * Write log entry
 */
async function writeLog(level, message, data = null) {
  await ensureLogDir();

  // Mask sensitive data
  const { masked: maskedMessage, maskedFields: messageFields } = maskSensitiveData(message);
  const { masked: maskedData, maskedFields: dataFields } = data
    ? maskSensitiveObject(data)
    : { masked: data, maskedFields: [] };

  const maskedFields = [...new Set([...messageFields, ...dataFields])];

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: maskedMessage,
    data: maskedData || null,
    masked: maskedFields.length > 0,
    maskedFields
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  try {
    await fs.appendFile(LOG_FILE, logLine, 'utf-8');
    await rotateLogsIfNeeded();
  } catch (err) {
    console.error('Failed to write log:', err);
  }

  return {
    message: maskedMessage,
    level,
    timestamp: logEntry.timestamp,
    data: maskedData
  };
}

/**
 * Tail log file (get last N lines)
 */
async function tailLogs(lines = 100) {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    const allLines = content.split('\n').filter(line => line.length > 0);
    const tailLines = allLines.slice(-lines);

    const logs = tailLines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });

    return {
      logs,
      count: logs.length,
      totalLines: allLines.length
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { logs: [], count: 0, totalLines: 0 };
    }
    throw err;
  }
}

/**
 * Search logs by pattern
 */
async function searchLogs(pattern) {
  try {
    const regex = new RegExp(pattern, 'i');
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    const allLines = content.split('\n').filter(line => line.length > 0);

    const matches = [];
    for (const line of allLines) {
      if (regex.test(line)) {
        try {
          matches.push(JSON.parse(line));
        } catch {
          matches.push({ raw: line });
        }
      }
    }

    return {
      matches,
      count: matches.length,
      pattern
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { matches: [], count: 0, pattern };
    }
    throw err;
  }
}

/**
 * Clear log file
 */
async function clearLogs() {
  try {
    await fs.unlink(LOG_FILE);
    return { cleared: true };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { cleared: true }; // Already empty
    }
    throw err;
  }
}

/**
 * Execute logging operation
 * @param {Object} input - Input parameters
 * @param {Object} context - Runtime context (optional)
 * @returns {Promise<Object>} Standard response object
 */
async function execute(input, context = {}) {
  const startTime = Date.now();

  try {
    const {
      operation,
      level = 'INFO',
      message = '',
      data = null,
      lines = 100,
      pattern = ''
    } = input;

    let result;

    switch (operation) {
      case 'log':
      case 'debug':
      case 'info':
      case 'warn':
      case 'error':
        const logLevel = operation === 'log' ? level : operation.toUpperCase();
        result = await writeLog(logLevel, message, data);
        break;

      case 'tail':
        result = await tailLogs(lines);
        break;

      case 'search':
        if (!pattern) {
          throw new Error('Pattern required for search operation');
        }
        result = await searchLogs(pattern);
        break;

      case 'clear':
        result = await clearLogs();
        break;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return {
      success: true,
      data: result,
      error: null,
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        masked: result.masked || false,
        maskedFields: result.maskedFields || []
      }
    };
  } catch (err) {
    let errorCode = 'LOGGING_FAILED';
    let errorMessage = err.message;

    if (err.message.includes('Pattern')) {
      errorCode = 'INVALID_PATTERN';
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
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = { execute };
