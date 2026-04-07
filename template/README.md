# Template Files

This directory contains templates that are distributed with agents-runtime.

## Structure

- `.agents/` - Agent skill templates and configurations
  - `code-analysis/` - Code quality analysis skill
  - `security-audit/` - OWASP security audit skill
  - `refactor/` - Automated refactoring suggestions
  - `file-operations/`, `data-transform/`, `http-request/`, `logging/`, `system-command/` - Utility skills
  - `helpers/` - Utility modules
  - `hooks/` - Lifecycle hooks
  - `manifest.json` - Skill registry template
  - `settings.json` - Runtime configuration template
  - `SECURITY.md` - Security guidelines
  - `README.md` - Skill documentation

- `agent-startup.md` - Canonical startup protocol documentation

- `memory-system/` - Advanced memory system implementation
  - `core/` - Memory indexing and storage
  - `scanners/` - Project structure and dependency analysis
  - `hooks/` - Git integration hooks
  - `cli/` - Command-line interface
  - Complete implementation guide included

## How It Works

When users run `npm run setup` or initialize agents-runtime:

1. Files from `template/` are copied to the user's `.agents/` directory
2. Users can customize their local copy as needed
3. The template files in this directory remain the canonical source in git

## Contributing

When making changes to templates:

1. **Always edit files in `template/`**, not in user projects' `.agents/`
2. Changes made here will be distributed to all users via npm
3. Document any breaking changes in CHANGELOG.md
4. Update version number in package.json if templates change significantly

### Important Notes

- `agent-startup.md` is the source of truth for the startup protocol
- All changes to distributed templates must be production-ready (no TODOs)
- Test changes locally before committing
- The `memory-system/` is an advanced optional feature with complete documentation

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed contribution guidelines.
