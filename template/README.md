# Template Files

This directory contains templates that are distributed with agents-runtime.

## Structure

- `.agents/` - Agent skill templates and configurations
- `agent-startup.md` - Canonical startup protocol documentation
- `helpers/` - Utility module templates
- `hooks/` - Lifecycle hook templates
- `settings.json` - Default runtime configuration template
- `memory-system/` - Memory system implementation template

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

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed contribution guidelines.
