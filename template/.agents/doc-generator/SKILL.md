# Documentation Generator Skill

## Overview
The Documentation Generator skill automatically creates comprehensive project documentation including README, API documentation, and changelogs.

## Authorization Level
**Required:** 2 (write capability)

## Input Schema
```json
{
  "project_root": "/home/user/project",
  "include_readme": true,
  "include_api_docs": true,
  "include_changelog": false,
  "package_json": {
    "name": "my-project",
    "version": "1.0.0",
    "description": "My awesome project"
  },
  "dry_run": true
}
```

## Output Schema
```json
{
  "generated_docs": [
    {
      "file": "README.md",
      "type": "readme",
      "lines": 200,
      "sections": ["Overview", "Installation", "Usage"]
    },
    {
      "file": "docs/API.md",
      "type": "api",
      "lines": 150,
      "methods_documented": 25
    }
  ],
  "summary": {
    "total_generated": 2,
    "total_lines": 350
  }
}
```

## Features
- **README generation:** Creates comprehensive project README
- **API documentation:** Extracts and documents API from JSDoc
- **Changelog generation:** Builds changelog from git history
- **Dry-run mode:** Preview documentation without writing
- **Multi-section support:** Sections for installation, usage, testing, contributing

## Constraints
- `canRead: true` - Read source files and git history
- `canWrite: true` - Write documentation files
- `canExecute: false` - No command execution
- `canAccessSecrets: false` - No secret access
