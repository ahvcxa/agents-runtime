# Default Skills Library

This directory contains the default utility skills available to all agents. These are foundational capabilities that most projects need.

## Quick Overview

| Skill | Purpose | Auth Level | Sandbox | Status |
|-------|---------|-----------|---------|--------|
| **http-request** | Make HTTP/HTTPS API calls | 0 | N/A | ✅ |
| **file-operations** | Read/write/delete files | 1 | ✅ | ✅ |
| **system-command** | Execute shell commands | 2 | ✅ | ✅ |
| **data-transform** | JSON & data transformation | 0 | N/A | ✅ |
| **logging** | Structured logging & audit trail | 0 | N/A | ✅ |

## Authorization Levels

- **Level 0 (Public)**: No authorization required. Used by any agent.
- **Level 1 (Internal)**: Requires agent authorization level ≥ 1. Isolated operations.
- **Level 2 (Admin)**: Requires agent authorization level ≥ 2. Full system access.

## For Each Skill

Each skill directory follows a consistent structure:

```
skill-name/
├── handler.js          # Main implementation (exports `execute(input)`)
├── manifest.json       # Skill definition, input/output schema, examples
├── SKILL.md           # User-facing documentation
├── examples/
│   ├── basic.js       # Simple usage examples
│   └── advanced.js    # Complex scenarios & edge cases
└── __tests__/
    └── handler.test.js # Unit tests
```

## Standard Response Format

All skills return a consistent response object:

```javascript
{
  success: boolean,           // true if execution completed successfully
  data: any,                  // Actual result (structure varies by skill)
  error: {                    // Null if success=true
    code: string,             // Error identifier (e.g., "NETWORK_TIMEOUT")
    message: string,          // Human-readable error message
    details?: any             // Additional context (stack trace, validation errors, etc)
  },
  metadata: {
    executionTime: number,    // Duration in milliseconds
    timestamp: string,        // ISO 8601 timestamp
    retries?: number          // Number of retries (http-request only)
  }
}
```

## Skill Usage in Code

### Basic Usage

```javascript
const { execute } = require('./.agents/skills/http-request/handler');

const result = await execute({
  method: 'GET',
  url: 'https://api.example.com/data'
});

if (result.success) {
  console.log('Response:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### With AI Agents

AI agents access skills through the runtime's skill execution interface. See `.agents/AI_AGENT_GUIDE.md` for details.

## Security Considerations

**See `.agents/skills/SECURITY.md` for detailed security guidelines.**

Key points:
- All network requests validate SSL certificates
- File operations are sandboxed to `/.agents/workspace/`
- System commands use whitelist pattern (no shell interpolation)
- Sensitive data (passwords, tokens) is auto-masked in logs
- Size limits protect against resource exhaustion

## Development Guide

### Adding a New Skill

1. Create `your-skill/` directory
2. Create `handler.js` with `async execute(input)` function
3. Create `manifest.json` with input/output schema
4. Create `SKILL.md` with documentation
5. Add unit tests in `__tests__/`
6. Add examples in `examples/`
7. Update `.agents/manifest.json` to register the skill
8. Test in `examples/simple-js-app`

### Example handler.js Structure

```javascript
/**
 * Execute your-skill
 * @param {Object} input - Input parameters (validated against manifest schema)
 * @returns {Promise<Object>} Standard response object
 */
async function execute(input) {
  const startTime = Date.now();
  
  try {
    // Your implementation here
    const result = await doSomething(input);
    
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
    return {
      success: false,
      data: null,
      error: {
        code: 'YOUR_ERROR_CODE',
        message: err.message,
        details: { stack: err.stack }
      },
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = { execute };
```

### Example manifest.json Structure

```json
{
  "id": "your-skill",
  "version": "1.0.0",
  "name": "Your Skill Name",
  "description": "What this skill does",
  "authorization_required_level": 0,
  "input": {
    "type": "object",
    "properties": {
      "param1": { "type": "string", "description": "..." },
      "param2": { "type": "number", "description": "..." }
    },
    "required": ["param1"],
    "additionalProperties": false
  },
  "output": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "data": { "type": "object" },
      "error": { "type": ["object", "null"] },
      "metadata": { "type": "object" }
    }
  },
  "examples": [
    {
      "name": "Basic Example",
      "input": { "param1": "value" },
      "output": { "success": true, "data": {...} }
    }
  ],
  "security_notes": [
    "No sensitive data in logs",
    "Always validate input"
  ]
}
```

## Testing

Run all skill tests:

```bash
npm test -- .agents/skills/
```

Run tests for a specific skill:

```bash
npm test -- .agents/skills/http-request/
```

## Performance Benchmarks

| Skill | Typical Execution Time | Notes |
|-------|------------------------|-------|
| http-request (GET) | 200-500ms | Depends on network |
| file-operations (read) | 5-50ms | Depends on file size |
| system-command | 50-500ms | Depends on command |
| data-transform | 1-100ms | Depends on data size |
| logging (write) | 2-10ms | Async, non-blocking |

## Troubleshooting

### Skills Not Loading?

1. Check `.agents/manifest.json` has skill registered
2. Verify `handler.js` exports `execute` function
3. Check console for startup errors

### Authorization Denied?

Agent's `authorization_level` must be ≥ skill's `authorization_required_level`

### Sandbox Violations?

File operations limited to `/.agents/workspace/`. Move files there first.

## Contributing

To add or modify skills:

1. Follow the structure documented above
2. Add unit tests
3. Test with real examples
4. Update CHANGELOG.md
5. Create PR with explanation

---

**Last Updated**: 2026-04-07  
**Spec Version**: 1.0.0
