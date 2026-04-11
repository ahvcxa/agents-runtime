# Code Formatter Skill

## Overview
The Code Formatter skill automatically fixes code style, formatting, imports, and removes unused code. Supports Prettier, ESLint, and custom formatting rules.

## Authorization Level
**Required:** 2 (write capability)

## Input Schema
```json
{
  "files": ["src/app.js", "src/utils.js"],
  "project_root": "/home/user/project",
  "config": "prettier",
  "rules": ["format", "imports", "unused", "eslint"],
  "dry_run": true
}
```

## Output Schema
```json
{
  "fixed_files": [
    {
      "file": "src/app.js",
      "changes": 8,
      "lines_affected": 12,
      "status": "preview",
      "diff": [...]
    }
  ],
  "summary": {
    "total_fixed": 2,
    "total_changes": 15,
    "dry_run": true,
    "rules_applied": "format, imports, unused, eslint"
  }
}
```

## Features
- **Prettier formatting:** Code style standardization
- **ESLint fixes:** Automatic linting fixes
- **Import optimization:** Sorts and organizes imports
- **Unused code removal:** Identifies and removes unused variables
- **Dry-run mode:** Preview changes before applying
- **Detailed diff:** Shows exact changes per file

## Formatting Rules
- `format` - Code formatting (whitespace, indentation)
- `imports` - Organize imports (sort, deduplicate)
- `unused` - Remove unused variables
- `eslint` - Apply ESLint auto-fixes
- `semicolons` - Add/remove semicolons

## Constraints
- `canRead: true` - Read source files
- `canWrite: true` - Write formatted files
- `canExecute: false` - No command execution
- `canAccessSecrets: false` - No secret access
