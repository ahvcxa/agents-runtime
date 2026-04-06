# File Operations Skill

Read, write, append, and delete files with sandbox mode protection. All operations are restricted to the `/.agents/workspace/` directory.

## Quick Start

```javascript
const { execute } = require('./.agents/skills/file-operations/handler');

// Read a file
const result = await execute({
  operation: 'read',
  path: 'data.json'
});

if (result.success) {
  console.log(result.data.content);
} else {
  console.error('Error:', result.error.code);
}
```

## Features

### ✅ Sandbox Mode
- **Restricted Access**: All operations confined to `/.agents/workspace/` directory
- **Path Traversal Prevention**: `../` attacks are blocked
- **Blocked Files**: No access to `.env`, `.git`, `node_modules`, etc.
- **Safe by Default**: No symlink following, limited permissions

### ✅ Security
- **Size Limits**: Maximum 10MB per file to prevent exhaustion
- **Permission Control**: Files created with restricted permissions (0644)
- **Validation**: All paths normalized and validated
- **Audit Trail**: All operations logged (in logging skill)

### ✅ Reliability
- **Atomic Operations**: Use standard Node.js fs API
- **Error Handling**: Clear error codes for all failure modes
- **Metadata Capture**: File stats (size, created, modified dates)

## Parameters

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| **operation** | string | - | ✅ | Operation: read, write, append, delete, exists, list |
| **path** | string | - | ✅ | File/directory path (relative, within sandbox) |
| **content** | string | - | - | File content (write/append operations) |
| **encoding** | string | utf-8 | - | File encoding (utf-8, ascii, base64) |
| **createDirs** | boolean | false | - | Create parent directories (write/append only) |

## Operations

### READ - Get file contents

```javascript
const result = await execute({
  operation: 'read',
  path: 'config.json',
  encoding: 'utf-8'
});

// Response
{
  success: true,
  data: {
    content: '{"app": "example"}',
    size: 20,
    created: '2026-04-06T12:00:00.000Z',
    modified: '2026-04-07T14:30:00.000Z'
  }
}
```

### WRITE - Create or overwrite file

```javascript
const result = await execute({
  operation: 'write',
  path: 'output.txt',
  content: 'Hello, World!',
  createDirs: true  // Create parent dirs if needed
});

// Response
{
  success: true,
  data: {
    path: 'output.txt',
    size: 13
  }
}
```

### APPEND - Add content to file

```javascript
const result = await execute({
  operation: 'append',
  path: 'logs.txt',
  content: '[INFO] Application started\n'
});

// Response
{
  success: true,
  data: {
    path: 'logs.txt',
    size: 1024  // Total file size after append
  }
}
```

### DELETE - Remove file

```javascript
const result = await execute({
  operation: 'delete',
  path: 'temp-data.json'
});

// Response
{
  success: true,
  data: {
    deleted: true
  }
}
```

### EXISTS - Check if file/directory exists

```javascript
const result = await execute({
  operation: 'exists',
  path: 'config.json'
});

// Response
{
  success: true,
  data: {
    exists: true  // or false
  }
}
```

### LIST - Directory contents

```javascript
const result = await execute({
  operation: 'list',
  path: 'data'  // or '.' for root
});

// Response
{
  success: true,
  data: {
    files: ['config.json', 'data.csv'],
    directories: ['logs', 'cache'],
    count: 4
  }
}
```

## Response Format

### Success Response

```javascript
{
  success: true,
  data: {
    // Structure varies by operation
    content: "...",     // read
    path: "...",        // write/append
    exists: true,       // exists
    deleted: true,      // delete
    files: [...],       // list
    directories: [...]
  },
  error: null,
  metadata: {
    executionTime: 5,
    timestamp: "2026-04-07T..."
  }
}
```

### Error Response

```javascript
{
  success: false,
  data: null,
  error: {
    code: "FILE_NOT_FOUND",
    message: "File or directory not found",
    details: {
      nodeError: "ENOENT"
    }
  },
  metadata: {
    executionTime: 2,
    timestamp: "2026-04-07T..."
  }
}
```

## Error Codes

| Code | Cause | Notes |
|------|-------|-------|
| **FILE_NOT_FOUND** | File doesn't exist | Check path and parent directory |
| **PERMISSION_DENIED** | Cannot access file | Check permissions in workspace |
| **IS_DIRECTORY** | Path is a directory, not a file | Use list operation instead |
| **NOT_DIRECTORY** | Path is not a directory | Use file operations instead |
| **FILE_TOO_LARGE** | File exceeds 10MB limit | Split into smaller files |
| **SANDBOX_VIOLATION** | Path outside workspace | All operations confined to /.agents/workspace/ |
| **PATH_TRAVERSAL_ATTEMPT** | `../` or absolute path used | Use relative paths only |
| **BLOCKED_FILE** | Access to restricted file | .env, .git, etc. are blocked |
| **FILE_OPERATION_FAILED** | Generic file system error | Check error details |

## Workspace Directory

All operations use this directory:

```
/.agents/workspace/
├── config.json
├── data/
│   ├── users.csv
│   └── settings.json
├── logs/
│   └── app.log
└── cache/
    └── ...
```

Create and organize your files here. The workspace persists between agent executions.

## Examples

### 1. Read JSON Configuration

```javascript
const result = await execute({
  operation: 'read',
  path: 'config.json'
});

if (result.success) {
  const config = JSON.parse(result.data.content);
  console.log('API URL:', config.apiUrl);
}
```

### 2. Write Results to File

```javascript
const results = { processed: 100, errors: 2 };

await execute({
  operation: 'write',
  path: 'results.json',
  content: JSON.stringify(results, null, 2),
  createDirs: true
});
```

### 3. Append Log Entry

```javascript
const timestamp = new Date().toISOString();
const logEntry = `[${timestamp}] Processing completed\n`;

await execute({
  operation: 'append',
  path: 'logs/app.log',
  content: logEntry,
  createDirs: true
});
```

### 4. Process Multiple Files

```javascript
// List files in data directory
const listResult = await execute({
  operation: 'list',
  path: 'data'
});

// Process each CSV file
for (const file of listResult.data.files.filter(f => f.endsWith('.csv'))) {
  const readResult = await execute({
    operation: 'read',
    path: `data/${file}`
  });
  
  if (readResult.success) {
    // Process CSV content
    const lines = readResult.data.content.split('\n');
    console.log(`${file}: ${lines.length} lines`);
  }
}
```

### 5. Safe File Update with Backup

```javascript
// Create backup
const original = await execute({
  operation: 'read',
  path: 'important.json'
});

await execute({
  operation: 'write',
  path: 'important.json.backup',
  content: original.data.content
});

// Update original
await execute({
  operation: 'write',
  path: 'important.json',
  content: JSON.stringify(newData, null, 2)
});
```

### 6. Check Before Creating

```javascript
const checkResult = await execute({
  operation: 'exists',
  path: 'output.csv'
});

if (!checkResult.data.exists) {
  // Create new file
  await execute({
    operation: 'write',
    path: 'output.csv',
    content: 'header1,header2\n'
  });
} else {
  // Append to existing
  await execute({
    operation: 'append',
    path: 'output.csv',
    content: 'value1,value2\n'
  });
}
```

### 7. Large File Handling

```javascript
// For files > 10MB, write in chunks
const largeData = generateData(); // In parts
const chunkSize = 5 * 1024 * 1024; // 5MB

for (let i = 0; i < largeData.length; i += chunkSize) {
  const chunk = largeData.slice(i, i + chunkSize);
  
  if (i === 0) {
    // First chunk: write (overwrite)
    await execute({
      operation: 'write',
      path: 'large-file.bin',
      content: chunk
    });
  } else {
    // Subsequent chunks: append
    await execute({
      operation: 'append',
      path: 'large-file.bin',
      content: chunk
    });
  }
}
```

## Security Best Practices

### 1. Validate File Paths

```javascript
// Good - Safe relative path
await execute({
  operation: 'read',
  path: 'config.json'
});

// Bad - Absolute path (blocked)
await execute({
  operation: 'read',
  path: '/etc/passwd'  // ERROR: Sandbox violation
});

// Bad - Path traversal (blocked)
await execute({
  operation: 'read',
  path: '../../.env'   // ERROR: Path traversal
});
```

### 2. Don't Store Secrets

```javascript
// Good - Store in environment or secure vault
const apiKey = process.env.API_KEY;

// Bad - Don't write secrets to files
await execute({
  operation: 'write',
  path: 'api-key.txt',
  content: apiKey  // SECURITY RISK
});
```

### 3. Sanitize User Input

```javascript
// Good - Validate filename
function getSafePath(userInput) {
  const sanitized = path.basename(userInput); // Remove path components
  if (!sanitized || sanitized.startsWith('.')) {
    throw new Error('Invalid filename');
  }
  return `data/${sanitized}`;
}

// Bad - Use user input directly
const userFile = userInput;  // Could be '../../.env'
await execute({
  operation: 'read',
  path: userFile  // Vulnerable!
});
```

### 4. Handle Errors Safely

```javascript
// Good - Check for specific errors
const result = await execute({
  operation: 'read',
  path: userProvidedPath
});

if (result.error?.code === 'SANDBOX_VIOLATION') {
  console.error('Attempted sandbox escape');
} else if (!result.success) {
  console.error('File operation failed:', result.error.message);
}

// Bad - Log entire error object
console.error('Error:', result);  // Could expose secrets
```

## Limitations

1. **Sandbox Only**: All operations in `/.agents/workspace/` directory
2. **No Symlinks**: Symbolic links are not followed
3. **10MB Limit**: Maximum file size per operation
4. **No Binary**: Only text encoding supported (utf-8, ascii, base64)
5. **No Permissions**: Cannot change file ownership or detailed permissions
6. **No Streaming**: Entire file loaded into memory

## Performance Tips

1. **Batch Operations**: Use list() to read directory structure once
2. **Size Check**: Check file size before read operations on large files
3. **Append Efficiently**: Use append() for log files instead of read-modify-write
4. **No Realtime Monitoring**: Use filesystem polling for file changes
5. **Chunk Large Data**: Split > 5MB data into chunks

## Related Skills

- **data-transform**: Parse JSON/CSV files
- **logging**: Write structured logs
- **http-request**: Save HTTP responses
- **system-command**: Process files with CLI tools

## Troubleshooting

### "SANDBOX_VIOLATION" Error

**Cause**: Attempted to access file outside `/.agents/workspace/`

**Solution**: Use relative paths within sandbox

```javascript
// ✅ Correct
await execute({ operation: 'read', path: 'data.json' });

// ❌ Wrong
await execute({ operation: 'read', path: '/home/user/file.json' });
```

### "FILE_NOT_FOUND" Error

**Cause**: File doesn't exist

**Solution**: Check path or create with write operation

```javascript
const exists = await execute({ operation: 'exists', path: 'file.txt' });
if (!exists.data.exists) {
  await execute({
    operation: 'write',
    path: 'file.txt',
    content: 'initial content'
  });
}
```

### "FILE_TOO_LARGE" Error

**Cause**: File exceeds 10MB limit

**Solution**: Use streaming or process in chunks (see examples)

---

**Version**: 1.0.0  
**Last Updated**: 2026-04-07
