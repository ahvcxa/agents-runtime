# Skills Security Guidelines

This document outlines security best practices for all skills. **All skill developers MUST follow these guidelines.**

## Core Principles

1. **Trust Nothing**: Validate ALL inputs
2. **Least Privilege**: Skills only access what they need
3. **Fail Safely**: Errors don't leak sensitive data
4. **Audit Everything**: Log actions (without exposing secrets)
5. **Defense in Depth**: Multiple layers of protection

---

## Input Validation

### Rule 1: Validate All Inputs

Every input parameter must be validated against the `input` schema in `manifest.json`.

**Good:**
```javascript
const Ajv = require('ajv');
const ajv = new Ajv();
const schema = require('./manifest.json').input;
const validate = ajv.compile(schema);

async function execute(input) {
  if (!validate(input)) {
    return error('VALIDATION_FAILED', validate.errors);
  }
  // Safe to use input now
}
```

**Bad:**
```javascript
async function execute(input) {
  // Don't use input directly!
  const url = input.url; // Could be anything
  return fetch(url);
}
```

### Rule 2: Type Checking

Always verify types explicitly:

```javascript
// Good
if (typeof input.timeout !== 'number' || input.timeout < 0) {
  return error('INVALID_TIMEOUT');
}

// Bad
const timeout = input.timeout || 30000; // Could be string!
```

### Rule 3: Size Limits

All inputs must have size limits:

**http-request**: 
- URL max length: 2048 chars
- Request body max: 5MB
- Response body max: 50MB

**file-operations**:
- File path max length: 260 chars
- File content max: 10MB

**system-command**:
- Command length max: 1024 chars
- Argument length max: 32KB total

**data-transform**:
- Input JSON max: 50MB
- Rules JSON max: 1MB

**logging**:
- Message max length: 4096 chars
- Single log file max: 100MB

---

## Network Security (http-request)

### SSL/TLS

**Rule**: ALWAYS verify SSL certificates. Never disable validation.

```javascript
// Good - SSL verification enabled (default)
const response = await fetch(url); // Node.js 18+ verifies by default

// Bad - SSL verification disabled (NEVER DO THIS)
const agent = new https.Agent({ rejectUnauthorized: false });
const response = await fetch(url, { agent }); // SECURITY RISK!
```

### No Credentials in Logs

**Rule**: Credentials MUST be masked in all logs.

```javascript
// Good - Mask Authorization header
const headers = input.headers || {};
const logHeaders = { ...headers };
if (logHeaders.Authorization) {
  logHeaders.Authorization = '***MASKED***';
}
console.log('Request headers:', logHeaders);

// Bad - Exposes auth token
console.log('Headers:', headers); // Logs "Authorization: Bearer sk-abc123"
```

### Timeout Protection

**Rule**: All network requests MUST have a timeout.

```javascript
// Good - 30 second timeout
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);

try {
  const response = await fetch(url, { signal: controller.signal });
  return { success: true, data: response };
} catch (err) {
  if (err.name === 'AbortError') {
    return error('NETWORK_TIMEOUT');
  }
  throw err;
} finally {
  clearTimeout(timeout);
}

// Bad - No timeout
const response = await fetch(url); // Could hang forever
```

### Allowed Domains

**Rule**: Only allow whitelisted domains (configurable).

```javascript
// In settings.json
"http_allowed_domains": [
  "api.example.com",
  "*.github.com",
  "localhost:3000"  // Only in dev
]

// In handler.js
function isAllowedDomain(url) {
  const urlObj = new URL(url);
  return ALLOWED_DOMAINS.some(domain => {
    // Exact match or wildcard
    return urlObj.hostname === domain || 
           urlObj.hostname.endsWith('.' + domain);
  });
}
```

---

## File System Security (file-operations)

### Sandbox Mode

**Rule**: All file operations are restricted to `/.agents/workspace/` directory.

```javascript
const path = require('path');

function validatePath(filePath) {
  // Resolve to absolute path
  const absolute = path.resolve(filePath);
  const sandbox = path.resolve('/.agents/workspace');
  
  // Ensure path is within sandbox
  if (!absolute.startsWith(sandbox)) {
    throw new Error('Path outside sandbox: ' + filePath);
  }
  
  return absolute;
}

// Good - file is in sandbox
const content = await readFile('data.json'); // ✅ /.agents/workspace/data.json

// Bad - file outside sandbox
const secret = await readFile('/etc/passwd'); // ❌ BLOCKED
const secret = await readFile('../../.env'); // ❌ BLOCKED (path traversal)
```

### Path Traversal Prevention

**Rule**: Prevent `../` directory traversal attacks.

```javascript
// Good - Normalize path and check
const normalized = path.normalize(filePath);
if (normalized.includes('..')) {
  return error('PATH_TRAVERSAL_ATTEMPT');
}

// Bad - Allows traversal
const content = fs.readFileSync(filePath); // Could be '../../etc/passwd'
```

### No Sensitive Files

**Rule**: Block access to sensitive files.

```javascript
const BLOCKED_FILES = [
  '.env', '.env.local', '.env.production',
  '.git/**', '.gitignore',
  'node_modules/**',
  '*.key', '*.pem', '*.pfx',
  '.aws/**', '.ssh/**'
];

function isBlockedFile(filePath) {
  const lower = filePath.toLowerCase();
  return BLOCKED_FILES.some(pattern => {
    // Simple pattern matching
    return lower.includes(pattern.replace('/**', '').replace('*', ''));
  });
}
```

### File Size Limits

**Rule**: Prevent resource exhaustion with size limits.

```javascript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function readFile(filePath) {
  const stats = await fs.promises.stat(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    return error('FILE_TOO_LARGE', { size: stats.size, limit: MAX_FILE_SIZE });
  }
  return fs.promises.readFile(filePath, 'utf-8');
}
```

---

## Command Execution Security (system-command)

### Whitelist Pattern

**Rule**: Only allow pre-approved commands. NO shell interpolation.

```javascript
const ALLOWED_COMMANDS = {
  'node': { args: 'unlimited', cwd: true },
  'npm': { args: 'unlimited', cwd: true },
  'git': { args: 'unlimited', cwd: true },
  'jq': { args: 'unlimited', stdin: true },
  'curl': { args: 'limited', timeout: 30000 }
};

// Good - Whitelist check
if (!ALLOWED_COMMANDS[command]) {
  return error('COMMAND_NOT_ALLOWED', { command });
}

// Bad - Allows dangerous commands
exec(userInput); // User could pass 'rm -rf /'
```

### No Shell Interpolation

**Rule**: Pass arguments as array, NEVER as string concatenation.

```javascript
// Good - Safe argument passing
const { execFile } = require('child_process');
await execFile('node', ['script.js', userArg1, userArg2]);

// Also good - Using spawn
const { spawn } = require('child_process');
spawn('npm', ['install', '--save', packageName]);

// Bad - Shell interpolation (VULNERABLE)
exec(`node script.js ${userArg}`); // Injection: userArg could be '; rm -rf /'
exec(`npm install ${package_name}`); // Injection possible

// Bad - String concatenation
const cmd = 'git clone ' + userUrl; // Injection: userUrl could have shell metacharacters
```

### Timeout Protection

**Rule**: All commands must have timeout.

```javascript
// Good - 60 second timeout
const timeout = 60000;
const child = spawn('node', ['long-script.js']);
const timer = setTimeout(() => child.kill(), timeout);

child.on('exit', () => clearTimeout(timer));

// Bad - No timeout
spawn('node', ['script.js']); // Could hang forever
```

### Stderr Capture

**Rule**: Capture and log stderr separately (don't mix with stdout).

```javascript
// Good
const { execFile } = require('child_process');
const { stdout, stderr } = await execFile('npm', ['install']);

if (stderr) {
  // Log separately (don't mix)
  console.warn('Command stderr:', stderr);
}

return {
  success: true,
  data: { stdout, stderr, exitCode: 0 }
};

// Bad - Mixes stdout/stderr
const output = await exec('npm install');
return { success: true, data: output }; // Can't distinguish errors
```

---

## Data Transformation Security (data-transform)

### Safe JSON Parsing

**Rule**: Use `JSON.parse()` safely with error handling. NEVER use `eval()` or Function constructor.

```javascript
// Good
function safeJsonParse(str, maxSize = 50 * 1024 * 1024) {
  if (str.length > maxSize) {
    return error('JSON_TOO_LARGE');
  }
  
  try {
    return JSON.parse(str);
  } catch (err) {
    return error('INVALID_JSON', { message: err.message });
  }
}

// Bad - NEVER DO THIS
const data = eval(`(${str})`); // Arbitrary code execution!
const data = Function(`return ${str}`)(); // Same vulnerability
```

### Circular Reference Detection

**Rule**: Detect circular references before stringifying.

```javascript
// Good
function safeJsonStringify(obj) {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]'; // Replace with marker
      }
      seen.add(value);
    }
    return value;
  });
}

// Bad - Can hang with circular refs
const json = JSON.stringify(obj); // Infinite loop if obj.self = obj
```

### Schema Validation

**Rule**: Validate data against schema before transformation.

```javascript
// Good
const Ajv = require('ajv');
const schema = require('./manifest.json').input;
const validate = ajv.compile(schema);

async function execute(input) {
  if (!validate(input)) {
    return error('VALIDATION_FAILED', validate.errors);
  }
  // Now safe to process input
}

// Bad - Transform without validation
const transformed = input.data.map(x => x * 2); // input.data could be string!
```

---

## Logging Security (logging)

### Sensitive Data Masking

**Rule**: Auto-mask passwords, tokens, secrets, API keys.

```javascript
// Masking patterns
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*['"]?([^'"\s]+)/gi,
  /token\s*[:=]\s*['"]?([^'"\s]+)/gi,
  /api[_-]?key\s*[:=]\s*['"]?([^'"\s]+)/gi,
  /authorization\s*[:=]\s*['"]?([^'"\s,]+)/gi,
  /secret\s*[:=]\s*['"]?([^'"\s]+)/gi,
  /aws[_-]?secret/gi,
  /private[_-]?key/gi
];

function maskSensitiveData(message) {
  let masked = message;
  const maskedFields = [];
  
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(masked)) {
      maskedFields.push(pattern.source);
      masked = masked.replace(pattern, (match, group) => {
        return match.replace(group, '***MASKED***');
      });
    }
  }
  
  return { masked, maskedFields };
}

// Usage
const { masked, maskedFields } = maskSensitiveData('password=secret123');
// masked: 'password=***MASKED***'
// maskedFields: ['password pattern']
```

### Audit Trail

**Rule**: Log WHO did WHAT and WHEN (without exposing HOW with secrets).

```javascript
// Good - Audit trail without secrets
{
  timestamp: '2026-04-07T12:34:56.789Z',
  level: 'INFO',
  agent: 'agent-123',
  action: 'http_request',
  status: 'success',
  details: {
    url: 'https://api.example.com/...',  // Safe (no query params with secrets)
    method: 'POST',
    statusCode: 200
  }
}

// Bad - Exposes secrets
{
  timestamp: '2026-04-07T12:34:56.789Z',
  level: 'INFO',
  url: 'https://api.example.com/endpoint?api_key=sk-abc123', // ❌ KEY EXPOSED
  headers: { Authorization: 'Bearer token123' } // ❌ TOKEN EXPOSED
}
```

### Log Rotation

**Rule**: Rotate logs to prevent disk exhaustion.

```javascript
// Good - Log rotation
const MAX_LOG_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_LOG_FILES = 10; // Keep 10 rotated files

function rotateLogIfNeeded() {
  const stats = fs.statSync(logFile);
  if (stats.size > MAX_LOG_FILE_SIZE) {
    // Rotate logs
    fs.renameSync(logFile, `${logFile}.${Date.now()}`);
    // Clean up old logs if > MAX_LOG_FILES
  }
}
```

---

## Error Handling Best Practices

### Rule 1: Never Expose System Details

**Bad:**
```javascript
return error('DATABASE_ERROR', { details: err.stack });
```

**Good:**
```javascript
console.error('Database error:', err); // Log internally
return error('DATABASE_ERROR', { message: 'Unable to fetch data' }); // Generic to user
```

### Rule 2: Log Errors, Return Safe Responses

```javascript
async function execute(input) {
  try {
    return { success: true, data: result };
  } catch (err) {
    // Log full error internally
    console.error('Internal error:', {
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    
    // Return safe error to user
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while processing your request'
      }
    };
  }
}
```

---

## Authorization Checks

### Rule: Verify Agent Authorization Level

```javascript
// In manifest.json
"authorization_required_level": 2

// In execute function - runtime checks this automatically
// If agent.authorization_level < 2, execution is blocked
// But you can add extra checks if needed

async function execute(input, context) {
  // context.agent.authorization_level is available
  if (context.agent.authorization_level < 2) {
    return error('AUTHORIZATION_REQUIRED', { level: 2 });
  }
}
```

---

## Testing Security

All skills MUST include security tests:

```javascript
describe('Security Tests', () => {
  test('rejects oversized inputs', async () => {
    const largeInput = 'x'.repeat(MAX_SIZE + 1);
    const result = await execute({ data: largeInput });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INPUT_TOO_LARGE');
  });
  
  test('masks sensitive data in logs', async () => {
    const { masked } = maskSensitiveData('password=secret123');
    expect(masked).not.toContain('secret123');
    expect(masked).toContain('***MASKED***');
  });
  
  test('prevents path traversal', async () => {
    const result = await execute({ path: '../../etc/passwd' });
    expect(result.success).toBe(false);
    expect(result.error.code).toContain('PATH');
  });
});
```

---

## Checklist for New Skills

- [ ] Input validation against manifest schema
- [ ] Type checking for all parameters
- [ ] Size limits enforced
- [ ] Timeout protection (if applicable)
- [ ] Error messages don't expose internals
- [ ] Sensitive data masking (if applicable)
- [ ] Authorization level set appropriately
- [ ] Security tests included
- [ ] No shell interpolation (if command execution)
- [ ] SSL verification (if HTTPS)
- [ ] Path traversal prevention (if file access)
- [ ] Whitelist enforcement (if needed)
- [ ] Audit logging (when relevant)

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [CWE Top 25](https://cwe.mitre.org/top25/)

---

**Last Updated**: 2026-04-07  
**Version**: 1.0.0
