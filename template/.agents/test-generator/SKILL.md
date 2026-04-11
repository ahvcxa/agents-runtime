# Test Generator Skill

## Overview
The Test Generator skill automatically creates unit tests from code analysis findings. It supports Jest, Mocha, and Vitest frameworks.

## Authorization Level
**Required:** 2 (write capability)

## Input Schema
```json
{
  "findings": [
    {
      "file": "src/utils.js",
      "line": 42,
      "message": "Function lacks test coverage",
      "type": "testing",
      "severity": "MEDIUM"
    }
  ],
  "project_root": "/home/user/project",
  "test_framework": "jest",
  "coverage_target": 80,
  "dry_run": true
}
```

## Output Schema
```json
{
  "generated_tests": [
    {
      "file": "src/utils.test.js",
      "source_file": "src/utils.js",
      "lines": 150,
      "mocks_count": 5,
      "findings_covered": 8
    }
  ],
  "mocks_generated": 5,
  "summary": {
    "framework": "jest",
    "total_generated": 5,
    "total_lines": 750,
    "estimated_coverage": 85,
    "coverage_target": 80
  }
}
```

## Features
- **Multi-framework support:** Jest, Mocha, Vitest
- **Mock generation:** Automatic mock/stub creation
- **Coverage estimation:** Calculates expected test coverage
- **Dry-run mode:** Preview changes without writing
- **Grouped tests:** Organizes tests by finding type

## Constraints
- `canRead: true` - Read source files
- `canWrite: true` - Write test files
- `canExecute: false` - No test execution
- `canAccessSecrets: false` - No secret access
