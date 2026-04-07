# agents-runtime Setup Guide

This guide explains how to set up agents-runtime for development and understand what files are automatically generated vs. what are templates.

---

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/ahvcxa/agents-runtime.git
cd agents-runtime

# Install dependencies
npm install

# Run setup wizard (interactive)
npm run setup

# Verify installation
npm test
```

---

## Understanding Generated vs. Template Files

The agents-runtime project distinguishes between **template files** (shipped in the package) and **generated files** (created at runtime).

### Template Files (In Git)

These files are part of the source distribution and are checked into version control:

| Path | Purpose | Tracked |
|------|---------|---------|
| `template/.agents/` | Template skill definitions | ✓ Yes |
| `template/.agents/manifest.json` | Skill registry template | ✓ Yes |
| `template/.agents/settings.json` | Configuration template | ✓ Yes |
| `template/.agents/helpers/` | Utility modules | ✓ Yes |
| `template/.agents/hooks/` | Lifecycle hooks | ✓ Yes |
| `examples/` | Reference configurations | ✓ Yes |
| `.agents/agent-startup.md` | Runtime protocol documentation | ✓ Yes |

### Generated Files (NOT in Git)

These files are created automatically and should **never** be committed to version control:

| Path | When Created | Purpose | Tracked |
|------|--------------|---------|---------|
| `.agents/manifest.json` | On `npm install` | Merged skill registry | ✗ No |
| `.agents/settings.json` | On `npm install` | Runtime configuration | ✗ No |
| `.agents/memory/` | On first run | Persistent memory store | ✗ No |
| `.agents/logs/` | On skill execution | Audit logs | ✗ No |
| `agent.yaml` | On `npm run setup` | Instance-specific config | ✗ No |
| `node_modules/` | On `npm install` | Dependencies | ✗ No |

---

## Setup Workflow

### Step 1: Install Dependencies

```bash
npm install
```

**What happens:**
- `npm` reads `package.json` and installs all dependencies
- `postinstall` script runs `setup-test-env.js` (creates test fixtures)
- `postinstall` script runs `inject-role.js` (initializes agent role)
- `.agents/` directory is created from `template/.agents/`

### Step 2: Interactive Configuration (Optional)

```bash
npm run setup
```

**What happens:**
- Interactive wizard guides you through agent configuration
- Creates `agent.yaml` with your settings:
  - Agent name
  - Authorization level (Observer/Executor/Orchestrator)
  - Enabled skills
  - Memory backend choice
  - Security rules

### Step 3: Verify Installation

```bash
# Run all tests
npm test

# Check agent configuration
npm run agents check

# View discovered skills
npm run agents learn
```

---

## File Structure After Setup

After running `npm install` and `npm run setup`, your project structure looks like:

```
agents-runtime/
├── .agents/                          # GENERATED at runtime
│   ├── manifest.json                 # (Generated from template)
│   ├── settings.json                 # (Generated from template)
│   ├── memory/                       # (Empty until first run)
│   │   ├── indexes.json
│   │   ├── capabilities.json
│   │   └── dependencies.json
│   ├── logs/                         # (Created on skill execution)
│   └── [skill directories]           # (Copied from template)
│
├── agent.yaml                        # GENERATED from npm run setup
│
├── template/.agents/                 # Template (part of distribution)
│   ├── manifest.json                 # Original template
│   ├── settings.json                 # Original template
│   ├── helpers/
│   ├── hooks/
│   └── [skill definitions]
│
├── src/                              # Source code
├── bin/                              # CLI entry points
├── tests/                            # Test suites
└── node_modules/                     # Dependencies
```

---

## .gitignore Rules

The following files are intentionally excluded from version control:

```gitignore
# Generated configurations (per project instance)
agent.yaml
.agents/

# Agent runtime data
.agents/logs/
.agents/.memory-store

# Build and dependency outputs
node_modules/
dist/
build/

# IDE and OS files
.vscode/
.idea/
.DS_Store
```

**Why these are excluded:**
- `agent.yaml` is instance-specific to your project
- `.agents/` contains auto-generated configs and runtime data
- `node_modules/` is redundant (use `npm install` to recreate)
- IDE settings vary per developer

**What you SHOULD commit:**
- `template/.agents/` (templates for distribution)
- `examples/` (reference configurations)
- Source code in `src/` and `bin/`
- Test files in `tests/`
- Documentation files

---

## Common Scenarios

### Scenario 1: Developer Setting Up for First Time

```bash
# 1. Clone and install
git clone https://github.com/ahvcxa/agents-runtime.git
cd agents-runtime
npm install

# 2. Generate instance configuration
npm run setup

# 3. Run tests to verify everything works
npm test

# 4. Work on code
# (Do NOT commit .agents/ or agent.yaml)
```

### Scenario 2: CI/CD Environment

```bash
# In GitHub Actions or similar:
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 18

- run: npm install          # Generates .agents/ and agent.yaml
- run: npm test             # Runs with instance config
- run: npm run agents check # Verifies configuration
```

**Note:** CI/CD pipelines will auto-generate `.agents/` and `agent.yaml` on each run. These are ephemeral and cleaned up afterward.

### Scenario 3: Contributing a New Skill

```bash
# 1. Add skill to template (so it gets distributed)
cp -r my-skill template/.agents/skills/my-skill/

# 2. Register in template manifest
# (Edit template/.agents/manifest.json)

# 3. Commit template changes
git add template/.agents/
git commit -m "feat: add my-skill"

# 4. Local .agents/ will auto-update on next npm install
npm install

# 5. Test the skill
npm run agents execute my-skill

# Do NOT commit the auto-generated .agents/ directory
```

### Scenario 4: Updating .agents Configuration

If you modify `.agents/settings.json` or `.agents/manifest.json`:

**Option A: Make it stick (update template)**
```bash
# Edit template/.agents/settings.json
# Commit it
git add template/.agents/settings.json
git commit -m "chore: update default runtime settings"
```

**Option B: Local override only**
```bash
# Edit .agents/settings.json directly
# Don't commit it (it's in .gitignore)
# It will persist locally but won't affect other developers
```

---

## Troubleshooting

### Problem: `.agents/` directory not created after npm install

**Solution:**
```bash
# Run the postinstall scripts manually
node bin/setup-test-env.js
node bin/inject-role.js

# Or reinstall
rm -rf node_modules
npm install
```

### Problem: agent.yaml not found, npm run setup doesn't work

**Solution:**
```bash
# Check if interactive setup script exists
ls -la bin/setup-interactive.js

# Run it directly
node bin/setup-interactive.js

# Verify output
cat agent.yaml
```

### Problem: Tests fail with "Cannot find module .agents"

**Solution:**
```bash
# This means postinstall didn't run. Run:
npm install

# Then:
npm test
```

### Problem: Different developers have different .agents/ content

**This is expected and OK!** 

The `.agents/` directory is local to each developer's machine:
- Each runs `npm install` independently
- Each may run `npm run setup` with different answers
- Each gets their own `agent.yaml`

This is **by design** — the `.agents/` directory and `agent.yaml` are instance-specific and should never be shared.

---

## Version Updates

When pulling a new version:

```bash
# 1. Pull latest code
git pull origin main

# 2. Check if package.json changed
git diff package.json

# 3. Reinstall dependencies and regenerate .agents/
npm install

# 4. If configuration structure changed, run setup again
npm run setup

# 5. Tests should pass
npm test
```

---

## Security Considerations

### What Gets Stored Locally

- `agent.yaml`: Your agent configuration (authorization level, enabled skills)
- `.agents/memory/`: Persistent indexes of code and dependencies
- `.agents/logs/`: Audit trail of skill executions

### What You Should Protect

- `agent.yaml` — Contains your agent's authorization level
- Secrets in `.agents/logs/` — May contain sensitive execution data

### What's Safe to Share

- `template/.agents/` — Skill templates (no sensitive data)
- `examples/` — Reference configs (public)
- Everything else in src/, tests/, bin/ — Public source code

---

## Next Steps

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines
- Review [Agent Startup Protocol](.agents/agent-startup.md) to understand runtime
- Check [Security Audit Documentation](.agents/SECURITY.md) for security features
- Explore [examples/](examples/) for sample configurations

---

## Questions?

- 📖 Check [README.md](README.md) for project overview
- 🐛 Report issues on [GitHub Issues](https://github.com/ahvcxa/agents-runtime/issues)
- 💬 Discussions available on [GitHub Discussions](https://github.com/ahvcxa/agents-runtime/discussions)
