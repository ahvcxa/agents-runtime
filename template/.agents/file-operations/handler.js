const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Configuration
const SANDBOX_DIR = '/.agents/workspace';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BLOCKED_PATTERNS = [
  '.env', '.env.local', '.env.production', '.env.test',
  '.git', '.gitignore',
  'node_modules',
  '.aws', '.ssh',
  '.key', '.pem', '.pfx',
  '.private', '.secret'
];

/**
 * Validate and normalize file path
 * @param {string} filePath - Input path
 * @returns {object} { valid: boolean, absolute: string, error: string }
 */
function validatePath(filePath) {
  try {
    // Normalize path to prevent traversal
    const normalized = path.normalize(filePath);
    
    // Check for path traversal attempts
    if (normalized.includes('..') || normalized.startsWith('/')) {
      return {
        valid: false,
        error: 'Path traversal not allowed'
      };
    }

    // Resolve to absolute path within sandbox
    const absolute = path.resolve(SANDBOX_DIR, normalized);
    
    // Ensure it's within sandbox
    if (!absolute.startsWith(path.resolve(SANDBOX_DIR))) {
      return {
        valid: false,
        error: 'Path is outside sandbox directory'
      };
    }

    // Check against blocked patterns
    const basename = path.basename(absolute).toLowerCase();
    const fullPathLower = absolute.toLowerCase();
    
    for (const pattern of BLOCKED_PATTERNS) {
      const patternLower = pattern.toLowerCase();
      if (basename.includes(patternLower) || fullPathLower.includes(patternLower)) {
        return {
          valid: false,
          error: `Access to ${pattern} files is blocked`
        };
      }
    }

    return {
      valid: true,
      absolute
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message
    };
  }
}

/**
 * Read file operation
 */
async function readFile(filePath, encoding = 'utf-8') {
  const validation = validatePath(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const stats = await fs.stat(validation.absolute);
  
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File size (${stats.size} bytes) exceeds limit (${MAX_FILE_SIZE} bytes)`);
  }

  const content = await fs.readFile(validation.absolute, encoding);
  
  return {
    content,
    size: stats.size,
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString()
  };
}

/**
 * Write file operation
 */
async function writeFile(filePath, content, createDirs = false) {
  const validation = validatePath(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Check content size
  const contentSize = Buffer.byteLength(content);
  if (contentSize > MAX_FILE_SIZE) {
    throw new Error(`Content size (${contentSize} bytes) exceeds limit (${MAX_FILE_SIZE} bytes)`);
  }

  // Create parent directories if requested
  if (createDirs) {
    const dir = path.dirname(validation.absolute);
    await fs.mkdir(dir, { recursive: true });
  }

  await fs.writeFile(validation.absolute, content, 'utf-8');

  return {
    path: path.relative(SANDBOX_DIR, validation.absolute),
    size: contentSize
  };
}

/**
 * Append to file operation
 */
async function appendFile(filePath, content, createDirs = false) {
  const validation = validatePath(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Check content size
  const contentSize = Buffer.byteLength(content);
  if (contentSize > MAX_FILE_SIZE) {
    throw new Error(`Content size exceeds limit`);
  }

  // Create parent directories if requested
  if (createDirs) {
    const dir = path.dirname(validation.absolute);
    await fs.mkdir(dir, { recursive: true });
  }

  await fs.appendFile(validation.absolute, content, 'utf-8');

  // Get final file stats
  const stats = await fs.stat(validation.absolute);

  return {
    path: path.relative(SANDBOX_DIR, validation.absolute),
    size: stats.size
  };
}

/**
 * Delete file operation
 */
async function deleteFile(filePath) {
  const validation = validatePath(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  await fs.unlink(validation.absolute);

  return {
    deleted: true
  };
}

/**
 * Check file existence
 */
async function checkExists(filePath) {
  const validation = validatePath(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    await fs.stat(validation.absolute);
    return { exists: true };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { exists: false };
    }
    throw err;
  }
}

/**
 * List directory contents
 */
async function listDirectory(filePath) {
  const validation = validatePath(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Handle root sandbox directory specially
  let dirPath = validation.absolute;
  if (filePath === '.') {
    dirPath = SANDBOX_DIR;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  const files = [];
  const directories = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      directories.push(entry.name);
    } else {
      files.push(entry.name);
    }
  }

  return {
    files,
    directories,
    count: files.length + directories.length
  };
}

/**
 * Execute file operation
 * @param {Object} input - Input parameters
 * @param {Object} context - Runtime context (optional)
 * @returns {Promise<Object>} Standard response object
 */
async function execute(input, context = {}) {
  const startTime = Date.now();

  try {
    const { operation, path: filePath, content, encoding = 'utf-8', createDirs = false } = input;

    let result;

    switch (operation) {
      case 'read':
        result = await readFile(filePath, encoding);
        break;

      case 'write':
        if (!content) {
          throw new Error('content is required for write operation');
        }
        result = await writeFile(filePath, content, createDirs);
        break;

      case 'append':
        if (!content) {
          throw new Error('content is required for append operation');
        }
        result = await appendFile(filePath, content, createDirs);
        break;

      case 'delete':
        result = await deleteFile(filePath);
        break;

      case 'exists':
        result = await checkExists(filePath);
        break;

      case 'list':
        result = await listDirectory(filePath);
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
        timestamp: new Date().toISOString()
      }
    };
  } catch (err) {
    let errorCode = 'FILE_OPERATION_FAILED';
    let errorMessage = err.message;

    if (err.code === 'ENOENT') {
      errorCode = 'FILE_NOT_FOUND';
      errorMessage = 'File or directory not found';
    } else if (err.code === 'EACCES') {
      errorCode = 'PERMISSION_DENIED';
      errorMessage = 'Permission denied';
    } else if (err.code === 'EISDIR') {
      errorCode = 'IS_DIRECTORY';
      errorMessage = 'Path is a directory, not a file';
    } else if (err.code === 'ENOTDIR') {
      errorCode = 'NOT_DIRECTORY';
      errorMessage = 'Path is not a directory';
    } else if (err.message.includes('sandbox')) {
      errorCode = 'SANDBOX_VIOLATION';
    } else if (err.message.includes('traversal')) {
      errorCode = 'PATH_TRAVERSAL_ATTEMPT';
    } else if (err.message.includes('blocked')) {
      errorCode = 'BLOCKED_FILE';
    } else if (err.message.includes('exceeds limit')) {
      errorCode = 'FILE_TOO_LARGE';
    }

    return {
      success: false,
      data: null,
      error: {
        code: errorCode,
        message: errorMessage,
        details: {
          nodeError: err.code
        }
      },
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = { execute };
