# Security Audit Handler v2.0.0 - Quick Reference

## Installation

The handler is already integrated into the agents-runtime. No additional installation needed.

## Basic Usage

```bash
# Scan the src directory
node -e "
const handler = require('./template/skills/security-audit/handler.js');
(async () => {
  const result = await handler.execute({
    agentId: 'scanner-1',
    authLevel: 1,
    input: { scan_directory: './src' },
    memory: {},
    log: console.log,
  });
  console.log(JSON.stringify(result.summary, null, 2));
})();
"
```

## Common Scenarios

### 1. Find Critical Issues Only

```javascript
const critical = result.findings.filter(f => f.severity === 'CRITICAL');
console.log(`Critical issues: ${critical.length}`);
critical.forEach(f => {
  console.log(`  [${f.cwe_id}] ${f.file}:${f.line_start}`);
});
```

### 2. Suppress a Known Safe Pattern

```javascript
// In your code file, before the line:
// agent-suppress: A03:2021 reason="Safe - validates input before exec()"
exec(validatedCommand);
```

### 3. Generate HTML Report

```javascript
const { ReportGenerator } = require('./template/skills/security-audit/lib/report.js');
const report = new ReportGenerator();

// ... populate report with findings ...

const html = report.generateHtmlReport('My Security Report');
fs.writeFileSync('report.html', html);
```

### 4. Get Suppression Audit Trail

```javascript
result.suppressed.forEach(s => {
  console.log(`Suppressed: ${s.owasp} in ${s.file}`);
  console.log(`  Reason: ${s.reason}`);
});
```

## Suppression Formats

### OWASP Category (Recommended)
```javascript
// agent-suppress: A03:2021 reason="Safe usage"
exec(command);
```

### With Full Justification
```javascript
// agent-suppress: A04:2021 reason="Public API requires CORS wildcard for mobile app access"
app.use(cors({ origin: '*' }));
```

### Multiple Suppressions
```javascript
// agent-suppress: A01:2021 reason="Health endpoint is public"
// agent-suppress: A03:2021 reason="No dynamic shell execution"
app.get('/health', healthHandler);
```

## OWASP Quick Reference

| Category | Focus | Example |
|----------|-------|---------|
| **A01:2021** | Broken Access Control | Missing auth, privilege escalation |
| **A02:2021** | Cryptographic Failures | Weak ciphers, hardcoded secrets |
| **A03:2021** | Injection | SQL, command, template injection |
| **A04:2021** | Insecure Design | CORS wildcard, no rate limiting |
| **A05:2021** | Security Misconfiguration | Debug mode, verbose logging |
| **A06:2021** | Vulnerable Components | Outdated packages |
| **A07:2021** | Auth Failures | Weak passwords, no JWT expiry |
| **A08:2021** | Integrity Failures | Dynamic require, unsafe JSON.parse |
| **A09:2021** | Logging Failures | Empty catch blocks |
| **A10:2021** | SSRF | User-controlled URLs |

## Severity Levels

```
CRITICAL - Immediate action required (stop deployment)
HIGH     - Must fix before production
MEDIUM   - Should fix (add to backlog)
LOW      - Consider fixing (minor security improvement)
INFO     - Informational (no action required)
```

## Common Suppressions

### Health Endpoint
```javascript
// agent-suppress: A01:2021 reason="Public health check endpoint"
app.get('/health', () => 'OK');
```

### Public CORS API
```javascript
// agent-suppress: A04:2021 reason="Public API requires CORS wildcard for browser access"
app.use(cors({ origin: '*' }));
```

### Intentional Logging
```javascript
// agent-suppress: A05:2021 reason="Development logging, disabled in production"
console.error('Error:', error.stack);
```

### Safe Child Process
```javascript
// agent-suppress: A03:2021 reason="execFile with array args, no shell execution"
execFile('ls', ['-la'], (err) => {});
```

## Exit Codes

```javascript
const criticalCount = result.findings.filter(f => f.severity === 'CRITICAL').length;
const highCount = result.findings.filter(f => f.severity === 'HIGH').length;

if (criticalCount > 0) process.exit(2);  // Blocking error
if (highCount > 5) process.exit(1);     // Warning
process.exit(0);                        // Success
```

## Integration with CI/CD

### GitHub Actions
```yaml
- name: Security Audit
  run: npm run security-audit || true
  
- name: Check Critical Issues
  run: |
    CRITICAL=$(jq '.findings[] | select(.severity=="CRITICAL")' report.json | wc -l)
    if [ $CRITICAL -gt 0 ]; then exit 1; fi
```

### GitLab CI
```yaml
security_audit:
  script:
    - npm run security-audit
  artifacts:
    reports:
      sast: security-report.json
```

## Troubleshooting

### False Positive Not Gone?

1. Check suppression format: `A03:2021` not `A3:2021`
2. Comment must be on same or previous line
3. Clear cache: `rm -rf node_modules/.cache`
4. Verify no typos in OWASP code

### Finding Not Detected?

1. Check file extension (supported: .js, .ts, .json, .py, .yaml, .env)
2. Verify pattern matches (test in online regex tool)
3. Check if line is skipped (comments, rule definitions)
4. Review analyzer.shouldSkipLine() logic

### Performance Issues?

1. Reduce scan scope (fewer files)
2. Exclude node_modules and dist
3. Use specific file patterns instead of full directory

## Performance Tips

```javascript
// Good - specific directory
input: { scan_directory: './src' }

// Better - specific files
input: { files: ['./src/auth', './src/api'] }

// Exclude common directories
input: { 
  scan_directory: './src',
  exclude: ['**/node_modules/**', '**/dist/**']
}
```

## Output Examples

### Summary Output
```json
{
  "total_findings": 5,
  "active_findings": 3,
  "suppressed_findings": 2,
  "files_scanned": 15,
  "by_severity": {
    "CRITICAL": 1,
    "HIGH": 2,
    "MEDIUM": 0,
    "LOW": 0,
    "INFO": 0
  },
  "by_owasp": {
    "A03:2021": 2,
    "A04:2021": 1
  }
}
```

### Finding Example
```json
{
  "id": "abc123def456",
  "severity": "HIGH",
  "file": "src/api/auth.js",
  "line_start": 42,
  "line_end": 42,
  "owasp_category": "A03:2021",
  "cwe_id": "CWE-78",
  "message": "exec() called with dynamic arguments — command injection risk",
  "recommendation": "Use execFile() with shell: false and argument arrays.",
  "auto_fixable": false,
  "suppression_key": "sec-A03-auth.js-L42"
}
```

## Advanced Usage

### Custom Scan with Report
```javascript
const { execute } = require('./handler.js');
const { ReportGenerator } = require('./lib/report.js');

const result = await execute({...});
const report = new ReportGenerator();

result.findings.forEach(f => report.addFinding(f));
const json = report.toJSON();
const html = report.generateHtmlReport();

// Export both
fs.writeFileSync('report.json', JSON.stringify(json, null, 2));
fs.writeFileSync('report.html', html);
```

### Filter by Category and Export
```javascript
const a03Findings = result.findings.filter(f => 
  f.owasp_category === 'A03:2021'
);

console.table(a03Findings.map(f => ({
  file: f.file,
  line: f.line_start,
  cwe: f.cwe_id,
  message: f.message,
})));
```

## Documentation

- **ENTERPRISE_GUIDE.md** - Complete architecture and usage
- **MIGRATION_GUIDE.md** - v1.0 → v2.0 comparison
- **SKILL.md** - Skill definition and standards
- This file - Quick reference

## Support

For issues or questions:
1. Check ENTERPRISE_GUIDE.md for detailed docs
2. Review test cases in security-audit-enterprise.test.js
3. Examine rule definitions in lib/rules.js
4. Check git commit history for context

---

**Version:** 2.0.0 (Enterprise Grade)
**Last Updated:** April 6, 2026
**Status:** Production Ready ✅
