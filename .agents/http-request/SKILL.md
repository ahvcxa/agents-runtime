# HTTP Request Skill

Make secure HTTP/HTTPS API calls with professional-grade features: automatic retries, timeout protection, response streaming, and credential masking.

## Quick Start

```javascript
const { execute } = require('./.agents/skills/http-request/handler');

// Simple GET request
const result = await execute({
  method: 'GET',
  url: 'https://api.github.com/users/github'
});

if (result.success) {
  console.log('Status:', result.data.status);
  console.log('Body:', result.data.body);
} else {
  console.error('Error:', result.error.code, result.error.message);
}
```

## Features

### ✅ Built-in Security
- **SSL/TLS Verification**: Always enabled. Prevents MITM attacks.
- **Credential Masking**: Auth headers are redacted from logs automatically.
- **Size Limits**: Prevents memory exhaustion (5MB request, 50MB response).
- **Timeout Protection**: Requests hang protection (default 30s).

### ✅ Reliability
- **Automatic Retries**: Exponential backoff for transient failures.
- **Redirect Following**: Smart handling of 3xx redirects (max 5).
- **Error Recovery**: Distinguishes between retryable and permanent errors.
- **Compression Support**: Handles gzip and deflate responses.

### ✅ Observability
- **Structured Logging**: Execution time, retry count, redirect count.
- **Detailed Errors**: Clear error codes (TIMEOUT, SSL_ERROR, etc.)
- **Response Metadata**: Size, headers, status codes.

## Parameters

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| **method** | string | - | ✅ | HTTP method: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS |
| **url** | string | - | ✅ | Target URL (http or https). Max 2048 chars. |
| **headers** | object | {} | - | Custom HTTP headers |
| **body** | string\|object | null | - | Request body (auto JSON stringified). Max 5MB. |
| **timeout** | number | 30000 | - | Timeout in milliseconds (100ms - 5min) |
| **retry** | object | - | - | Retry configuration (see below) |
| **allowRedirects** | boolean | true | - | Follow 3xx redirects (max 5) |
| **validateStatus** | boolean | true | - | Treat 4xx/5xx as errors |

### Retry Configuration

```javascript
retry: {
  maxAttempts: 3,           // 1-10 attempts
  initialDelay: 1000,       // Initial delay in ms (min 100)
  backoffMultiplier: 2      // Exponential backoff (1-10)
}
```

**Exponential Backoff Example** (initialDelay=1000, multiplier=2):
- Attempt 1: Fail → Wait 1000ms
- Attempt 2: Fail → Wait 2000ms
- Attempt 3: Fail → Wait 4000ms
- Attempt 4: Give up

## Response Format

### Success Response

```javascript
{
  success: true,
  data: {
    status: 200,
    statusText: "OK",
    headers: {
      "content-type": "application/json",
      "content-length": "1234"
    },
    body: { /* parsed response */ },
    size: 1234
  },
  error: null,
  metadata: {
    executionTime: 234,      // milliseconds
    timestamp: "2026-04-07T...",
    retries: 0,
    redirects: 0
  }
}
```

### Error Response

```javascript
{
  success: false,
  data: null,
  error: {
    code: "NETWORK_TIMEOUT",     // Error code
    message: "Request timed out after 30000ms",
    details: {
      errorCode: "ETIMEDOUT",    // Node.js error code
      nodeError: "..."
    }
  },
  metadata: {
    executionTime: 30123,
    timestamp: "2026-04-07T..."
  }
}
```

## Error Codes

| Code | Cause | Retryable | Notes |
|------|-------|-----------|-------|
| **INVALID_URL** | Malformed URL | No | Check URL format |
| **NETWORK_TIMEOUT** | Request exceeded timeout | Yes | Increase timeout if needed |
| **NETWORK_ERROR** | Connection failed | Yes | Check network/DNS |
| **SSL_ERROR** | Certificate verification failed | No | Check certificate or update CA |
| **HTTP_ERROR** | 4xx/5xx status code | Maybe | 5xx errors may retry |
| **RESPONSE_TOO_LARGE** | Response > 50MB | No | Reduce response size |
| **INVALID_JSON** | JSON parsing failed | No | Check response format |
| **REDIRECT_LIMIT_EXCEEDED** | Too many redirects | No | Use allowRedirects=false |
| **UNSUPPORTED_PROTOCOL** | Not http/https | No | Use http:// or https:// |

## Examples

### 1. Simple GET

```javascript
const result = await execute({
  method: 'GET',
  url: 'https://api.example.com/users'
});

console.log(result.data.body); // Array of users
```

### 2. POST with JSON Body

```javascript
const result = await execute({
  method: 'POST',
  url: 'https://api.example.com/users',
  headers: {
    'Content-Type': 'application/json'
  },
  body: {
    name: 'John',
    email: 'john@example.com'
  }
});

console.log(result.data.body.id); // New user ID
```

### 3. With Authentication

```javascript
const result = await execute({
  method: 'GET',
  url: 'https://api.github.com/user',
  headers: {
    'Authorization': 'Bearer your-github-token',
    'Accept': 'application/vnd.github.v3+json'
  }
});

// Auth header is masked in logs: Authorization: ***MASKED***
console.log(result.data.body.login); // GitHub username
```

### 4. Custom Retry Strategy

```javascript
const result = await execute({
  method: 'GET',
  url: 'https://flaky-api.example.com/data',
  timeout: 10000,
  retry: {
    maxAttempts: 5,          // Try up to 5 times
    initialDelay: 500,       // Start with 500ms delay
    backoffMultiplier: 1.5   // 500ms → 750ms → 1.1s → 1.7s → 2.5s
  }
});

console.log(result.metadata.retries); // Number of retries performed
```

### 5. No Retries (Fail Fast)

```javascript
const result = await execute({
  method: 'POST',
  url: 'https://api.example.com/critical-operation',
  body: { action: 'delete' },
  retry: {
    maxAttempts: 1  // No retries
  }
});
```

### 6. Disable Redirect Following

```javascript
const result = await execute({
  method: 'HEAD',
  url: 'https://example.com/old-page',
  allowRedirects: false
});

// Get redirected location without following
if (result.data.status === 301) {
  const newLocation = result.data.headers.location;
}
```

### 7. Ignore 4xx Errors

```javascript
const result = await execute({
  method: 'GET',
  url: 'https://api.example.com/maybe-not-found',
  validateStatus: false  // Don't treat 404 as error
});

if (result.data.status === 404) {
  console.log('Not found'); // success=true, but status=404
}
```

### 8. Large Response Handling

```javascript
const result = await execute({
  method: 'GET',
  url: 'https://api.example.com/huge-dataset',
  timeout: 60000  // Increase timeout for large responses
});

console.log(result.metadata.executionTime); // Time spent
console.log(result.data.size);               // Response size in bytes
```

## Security Best Practices

### 1. Always Use HTTPS

```javascript
// Good
await execute({
  method: 'GET',
  url: 'https://api.example.com/data'
});

// Bad - Unencrypted
await execute({
  method: 'GET',
  url: 'http://api.example.com/data'
});
```

### 2. Don't Log Raw Responses with Credentials

```javascript
// Good - Log only what you need
console.log('Status:', result.data.status);

// Bad - Could expose tokens/passwords
console.log('Full response:', JSON.stringify(result.data.body));
```

### 3. Validate URLs from User Input

```javascript
// Good - Validate before use
function isAllowedUrl(url) {
  const allowedDomains = ['api.example.com', 'cdn.example.com'];
  const urlObj = new URL(url);
  return allowedDomains.includes(urlObj.hostname);
}

if (isAllowedUrl(userProvidedUrl)) {
  await execute({ method: 'GET', url: userProvidedUrl });
}

// Bad - Use user URL directly
await execute({ method: 'GET', url: userUrl });
```

### 4. Handle Errors Safely

```javascript
// Good - Log context, not secrets
if (!result.success) {
  console.error('API call failed:', {
    code: result.error.code,
    url: result.data?.headers?.url,
    status: result.data?.status
  });
}

// Bad - Could expose sensitive info
console.error('Request failed:', result);
```

### 5. Set Appropriate Timeouts

```javascript
// Good - Reasonable timeouts for different operations
const shortOp = await execute({
  method: 'GET',
  url: 'https://api.example.com/health',
  timeout: 5000  // 5s for health checks
});

const longOp = await execute({
  method: 'POST',
  url: 'https://api.example.com/process',
  timeout: 120000  // 2min for processing
});

// Bad - No timeout (could hang forever)
await execute({
  method: 'GET',
  url: 'https://api.example.com/data'
  // No timeout specified
});
```

## Comparison with Other Tools

| Feature | http-request | curl | fetch API |
|---------|--------|------|-----------|
| Automatic retries | ✅ | ❌ | ❌ |
| Credential masking | ✅ | ❌ | ❌ |
| Timeout protection | ✅ | ⚠️ | ⚠️ |
| Response size limit | ✅ | ❌ | ❌ |
| Exponential backoff | ✅ | ❌ | ❌ |
| Structured errors | ✅ | ⚠️ | ⚠️ |

## Troubleshooting

### "NETWORK_TIMEOUT" Error

**Cause**: Request took longer than timeout period

**Solutions**:
1. Increase timeout: `timeout: 60000` (60s)
2. Check server health
3. Reduce retry count: `maxAttempts: 1`

### "SSL_ERROR"

**Cause**: Certificate verification failed

**Solutions**:
1. Ensure server has valid SSL certificate
2. Check system time is correct
3. Update CA certificates
4. For development only: Set NODE_TLS_REJECT_UNAUTHORIZED=0

### "ENOTFOUND" Network Error

**Cause**: DNS lookup failed

**Solutions**:
1. Check DNS is working: `nslookup api.example.com`
2. Verify URL is correct
3. Check network connectivity

### All Retries Exhausted

**Cause**: Server is down or returning 5xx errors

**Solutions**:
1. Check server status
2. Wait and retry manually
3. Reduce retry count: `maxAttempts: 2`
4. Increase delay: `initialDelay: 5000`

## Performance Tips

1. **Reuse connections**: HTTP keep-alive is automatic
2. **Reduce payload size**: Use gzip compression if server supports
3. **Parallel requests**: Use Promise.all() for multiple requests
4. **Cache responses**: Implement caching layer if data is stable
5. **Monitor execution time**: Check metadata.executionTime for slow requests

## Related Skills

- **data-transform**: Parse and transform JSON responses
- **logging**: Log HTTP interactions
- **file-operations**: Save HTTP responses to disk

---

**Version**: 1.0.0  
**Last Updated**: 2026-04-07
