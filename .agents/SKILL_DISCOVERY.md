# Skill Discovery System — Developer Guide

**Document Version:** 1.0.0  
**Last Updated:** 2026-04-07  
**Audience:** Developers extending agents-runtime with custom skills

---

## Overview

The **Skill Discovery System** provides autonomous, zero-configuration skill discovery for agents-runtime. When you add a new skill to your project, the system automatically finds it, parses its metadata, and registers it—no manual manifest editing required.

### Problem Solved

**Before:**
```
1. Create skill in .agents/my-skill/
2. Manually edit .agents/manifest.json
3. Restart agent
4. ❌ Error-prone, not scalable
```

**After:**
```
1. Create skill in .agents/my-skill/SKILL.md
2. Run: npm run setup
3. ✅ Skill auto-discovered and manifest auto-generated
```

---

## How It Works

### Discovery Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    npm run setup                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
    ┌──────────────────▼──────────────────┐
    │  SkillDiscovery.discoverSkills()    │
    │  Scan: .agents/{skill-id}/SKILL.md  │
    └──────────────────┬──────────────────┘
                       │
    ┌──────────────────▼──────────────────────┐
    │  Parse YAML frontmatter for each skill  │
    │  Extract: id, version, auth_level, ...  │
    └──────────────────┬──────────────────────┘
                       │
    ┌──────────────────▼──────────────────────┐
    │  User: Select which skills to enable    │
    │  (All are pre-selected by default)      │
    └──────────────────┬──────────────────────┘
                       │
    ┌──────────────────▼──────────────────────┐
    │  Generate .agents/manifest.json         │
    │  with selected skills                   │
    └─────────────────────────────────────────┘
```

### Runtime Validation

At startup, the engine validates discovered vs. registered skills:

```
┌─────────────────────────────────────────────────────────────┐
│                  engine.init()                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
    ┌──────────────▼──────────────────┐
    │  Load manifest.json skills      │
    │  Discover .agents/*/SKILL.md    │
    └──────────────┬──────────────────┘
                   │
    ┌──────────────▼──────────────────────────────┐
    │  Compare: discovered vs. manifest          │
    │  ├─ in_both          (✓ OK)                │
    │  ├─ only_discovered  (⚠ WARN)              │
    │  └─ only_manifest    (⚠ WARN - orphaned)   │
    └─────────────────────────────────────────────┘
```

If unregistered skills are found:
```
INFO: Found 2 unregistered skill(s)
  - my-custom-skill (v1.0.0)
  - another-skill (v0.5.0)
Hint: Run 'npm run setup' to refresh the manifest.json
```

---

## File Structure

### Skill Directory Layout

```
.agents/
├── code-analysis/
│   └── SKILL.md                    ← Metadata + documentation
├── my-custom-skill/
│   ├── SKILL.md                    ← REQUIRED: Frontmatter + docs
│   ├── handler.js                  ← REQUIRED: Skill execution logic
│   ├── lib/
│   │   └── helpers.js              ← OPTIONAL: Helper utilities
│   └── __tests__/
│       └── handler.test.js         ← OPTIONAL: Unit tests
└── manifest.json                   ← AUTO-GENERATED: Skill registry
```

### SKILL.md Frontmatter Schema

Every skill **MUST** have a `SKILL.md` file with YAML frontmatter:

```markdown
---
id: my-custom-skill
version: 1.0.0
authorization_required_level: 0
bounded_context: Analysis
read_only: true
handler: .agents/my-custom-skill/handler.js
aggregate_root: Finding
output_event: AnalysisCompleted
description: "Performs custom code analysis on JavaScript/TypeScript files"
---

# SKILL: My Custom Skill

Your markdown documentation here...
```

### Frontmatter Fields

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | string | ✅ | — | Skill identifier (snake_case) |
| `version` | string | ✅ | — | Semantic version (e.g., "1.0.0") |
| `authorization_required_level` | number | ⚠️ | 0 | 0=Observer, 1=Executor, 2=Orchestrator, 3=Admin |
| `bounded_context` | string | ⚠️ | "Unknown" | Domain/context (e.g., "Analysis", "Security", "Refactor") |
| `read_only` | boolean | ⚠️ | true | Can this skill modify files? |
| `handler` | string | ⚠️ | — | Path to handler.js (relative to project root) |
| `aggregate_root` | string | ❌ | — | Domain-driven design aggregate root |
| `output_event` | string | ❌ | — | Domain event emitted when skill completes |
| `description` | string | ❌ | — | Human-readable skill description |

**Legend:** ✅ = Required, ⚠️ = Strongly recommended, ❌ = Optional

---

## Adding a New Skill

### Step 1: Create Directory Structure

```bash
mkdir -p .agents/my-skill/{lib,__tests__}
```

### Step 2: Create SKILL.md

```markdown
---
id: my-skill
version: 1.0.0
authorization_required_level: 1
bounded_context: Analysis
read_only: true
handler: .agents/my-skill/handler.js
description: "Custom analysis for my use case"
---

# SKILL: My Skill

This skill performs custom analysis on project files.

## Features

- Feature 1
- Feature 2

## Usage

See handler.js for implementation details.
```

### Step 3: Create handler.js

```javascript
/**
 * Handler for my-skill
 * @param {object} ctx - Execution context
 * @param {object} ctx.input - Skill input parameters
 * @param {object} ctx.logger - Logger instance
 * @param {object} ctx.config - Skill configuration
 * @returns {Promise<object>} Skill output
 */
async function execute(ctx) {
  const { input, logger } = ctx;
  
  logger.log(`[my-skill] Starting analysis...`);
  
  // Your implementation here
  const findings = [];
  
  return {
    success: true,
    findings,
    summary: `Found ${findings.length} items`
  };
}

module.exports = { execute };
```

### Step 4: Register the Skill

Run setup to auto-discover:
```bash
npm run setup
```

The skill will be automatically discovered and added to `manifest.json`.

### Step 5: Verify

```bash
# List all skills
npm run list

# Should see your skill in the output
agents-runtime v2.4.0

Skills:
  ✓ code-analysis (v1.2.0) — Analysis
  ✓ my-skill (v1.0.0) — Analysis
  ✓ security-audit (v1.0.0) — Security
```

---

## Configuration

### Settings (.agents/settings.json)

```json
{
  "runtime": {
    "skill_auto_discovery": {
      "enabled": true,
      "scan_path": ".agents",
      "pattern": "SKILL.md",
      "auto_register_runtime": false,
      "on_unregistered": "warn"
    }
  }
}
```

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| `enabled` | boolean | `true` | Enable skill discovery during setup and runtime validation |
| `scan_path` | string | `.agents` | Directory to scan (relative to project root) |
| `pattern` | string | `SKILL.md` | Filename pattern to match |
| `auto_register_runtime` | boolean | `false` | Auto-register unregistered skills at runtime (strict mode) |
| `on_unregistered` | string | `"warn"` | What to do if unregistered skills found: `"warn"`, `"error"`, `"skip"` |

---

## API Reference

### SkillDiscovery Class

Located in `src/loader/skill-discovery.js`

#### Constructor

```javascript
const discovery = new SkillDiscovery({
  scanPath: ".agents",      // Directory to scan
  pattern: "SKILL.md",      // Filename pattern
  logger: {                 // Custom logger (optional)
    log: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg)
  }
});
```

#### Methods

##### discoverSkills(projectRoot)

Discover all skills by scanning filesystem.

```javascript
const result = await discovery.discoverSkills(".");

// Result structure:
{
  skills: [
    {
      id: "my-skill",
      version: "1.0.0",
      path: ".agents/my-skill/SKILL.md",
      authorization_required_level: 1,
      bounded_context: "Analysis",
      read_only: true,
      description: "...",
      // ... other fields
    }
  ],
  errors: [
    {
      file: ".agents/bad-skill/SKILL.md",
      error: "Missing required field: 'version'"
    }
  ],
  discovered_at: "2026-04-07T10:30:00.000Z"
}
```

##### compareWithManifest(manifestSkills, discoveredSkills)

Compare discovered skills with manifest.json skills.

```javascript
const comparison = discovery.compareWithManifest(
  manifest.skills,    // From manifest.json
  result.skills       // From discovery
);

// Result structure:
{
  in_both: [...],           // Skills in both
  only_discovered: [...],   // Unregistered skills
  only_manifest: [...],     // Orphaned skills
  summary: {
    total_discovered: 5,
    total_in_manifest: 4,
    unregistered_count: 1,
    orphaned_count: 0
  }
}
```

##### formatForDisplay(skills)

Format skills for CLI display.

```javascript
const formatted = discovery.formatForDisplay(skills);
// Returns array suitable for CLI output
```

---

## Troubleshooting

### Issue: Skill Not Discovered

**Symptoms:**
```
npm run setup

No skills discovered. This may indicate a problem.
```

**Causes & Solutions:**

1. **Missing .agents directory**
   ```bash
   mkdir -p .agents
   mkdir -p .agents/my-skill
   ```

2. **Missing SKILL.md file**
   ```bash
   touch .agents/my-skill/SKILL.md
   # Add frontmatter (see "Adding a New Skill" section)
   ```

3. **Invalid YAML frontmatter**
   ```
   Check for:
   - Missing closing "---" delimiter
   - Invalid YAML syntax (quotes, indentation)
   - Missing required 'id' and 'version' fields
   ```

### Issue: Manifest.json Not Generated

**Symptoms:**
```
npm run setup

⚠ Warning: Could not generate manifest.json
```

**Causes & Solutions:**

1. **Permission denied**
   ```bash
   # Check directory permissions
   ls -la .agents/
   # Should be writable by current user
   ```

2. **Corrupted existing manifest.json**
   ```bash
   # Backup and delete
   cp .agents/manifest.json .agents/manifest.json.backup
   rm .agents/manifest.json
   # Re-run setup
   npm run setup
   ```

### Issue: Runtime Warnings About Unregistered Skills

**Symptoms:**
```
INFO: Found 2 unregistered skill(s)
  - new-skill (v1.0.0)
```

**Solution:**
```bash
npm run setup
```

Run setup to re-scan and update manifest.json.

### Issue: Skills Discovered But Not Loaded

**Symptoms:**
```
npm run setup     ← Skills discovered successfully
npm start         ← Agent starts but skills missing
npm run list      ← Skills not in list
```

**Causes & Solutions:**

1. **manifest.json not updated**
   - Setup wizard may have failed silently
   - Check: `.agents/manifest.json` contains your skills

2. **Settings disabled**
   - Check: `.agents/settings.json`
   - Verify: `runtime.skill_auto_discovery.enabled = true`

---

## Best Practices

### 1. Use Semantic Versioning

```yaml
version: "1.0.0"      # Major.Minor.Patch
```

Follow [semver.org](https://semver.org) — skills can have dependencies.

### 2. Set Correct Authorization Level

```yaml
authorization_required_level: 1
# 0 = Observer (read-only analysis)
# 1 = Executor (can suggest + write)
# 2 = Orchestrator (full control)
```

### 3. Always Define bounded_context

```yaml
bounded_context: "Security"  # One of: Analysis, Security, Refactor, IO, Integration
```

Helps with skill organization and discoverability.

### 4. Include Descriptions

```yaml
description: "Performs OWASP Top 10 security scanning"
```

Shown in setup wizard and help text.

### 5. Test Your Skill

```javascript
// .agents/my-skill/__tests__/handler.test.js
describe("my-skill", () => {
  test("executes successfully", async () => {
    const ctx = {
      input: { /* ... */ },
      logger: { log: () => {} }
    };
    
    const result = await execute(ctx);
    expect(result.success).toBe(true);
  });
});
```

Run tests:
```bash
npm run test
```

---

## Limitations & Future Work

### Current Limitations

| Limitation | Workaround |
|-----------|-----------|
| Skills discovered at startup only | Restart agent to load new skills |
| No hot-reload | Manual restart required |
| SKILL.md must be in skill directory root | Not flexible for complex structures |
| No version pinning | Always uses latest discovered version |

### Roadmap

- [ ] Hot-reload skill discovery (v2.5)
- [ ] Skill dependency resolution (v2.6)
- [ ] Version pinning in manifest.json (v2.7)
- [ ] Skill marketplace/registry (v3.0)

---

## See Also

- [manifest.json Schema](.agents/AGENT_CONTRACT.md)
- [Agent Guide](.agents/AI_AGENT_GUIDE.md)
- [Settings Reference](.agents/settings.json)
- [Contributing Guide](../CONTRIBUTING.md)

---

**Questions?** Visit: https://github.com/ahvcxa/agents-runtime/discussions
