#!/usr/bin/env node
"use strict";
/**
 * bin/setup-interactive.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive setup wizard for agents-runtime
 * 
 * Usage:
 *   node bin/setup-interactive.js
 *   npm run setup        (if added to package.json scripts)
 *
 * Features:
 *   - Interactive prompts for configuration
 *   - Validates project directory
 *   - Auto-generates appropriate template
 *   - Creates next-steps guide
 *   - Color-coded output
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");
const SkillDiscovery = require("../src/loader/skill-discovery");

// Color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  gray: "\x1b[90m",
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function log(text, color = "reset") {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

function logSection(title) {
  console.log("");
  log(`╔═══════════════════════════════════════════════════════╗`, "bright");
  log(`║  ${title.padEnd(53)}║`, "bright");
  log(`╚═══════════════════════════════════════════════════════╝`, "bright");
  console.log("");
}

function question(query) {
  return new Promise((resolve) => {
    rl.question(`${colors.blue}? ${colors.reset}${query}`, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function selectFromList(prompt, options) {
  log(`${prompt}`, "blue");
  options.forEach((opt, idx) => {
    log(`  ${idx + 1}. ${opt}`, "gray");
  });
  
  const answer = await question(`  Enter choice (1-${options.length}): `);
  const idx = parseInt(answer) - 1;
  
  if (idx < 0 || idx >= options.length) {
    log(`  ✗ Invalid choice. Please try again.`, "red");
    return selectFromList(prompt, options);
  }
  
  return options[idx];
}

async function confirm(msg) {
  const answer = await question(`${msg} (y/n): `);
  return answer.toLowerCase() === "y";
}

async function main() {
  logSection("agents-runtime Interactive Setup");
  
  log("Welcome! This wizard will help you set up agents-runtime.", "green");
  log("It takes about 2 minutes to complete.\n");

  // Step 1: Project directory
  let projectDir = process.cwd();
  const customDir = await question("Project directory (default: current): ");
  if (customDir) {
    projectDir = path.resolve(customDir);
    if (!fs.existsSync(projectDir)) {
      log(`  ✗ Directory not found: ${projectDir}`, "red");
      process.exit(1);
    }
  }

  log(`  ✓ Using: ${projectDir}\n`, "green");

  // Step 2: Agent type/template
  const agentType = await selectFromList(
    "What type of agent do you want to set up?",
    [
      "observer (read-only analysis)",
      "executor (read + write refactoring)",
      "fullstack (all skills + memory)",
      "orchestrator (spawns sub-agents)",
      "security-only (OWASP audit only)",
    ]
  );

  log(`  ✓ Selected: ${agentType}\n`, "green");

  // Step 3: Python support
  const pythonSupport = await confirm("Enable Python code analysis?");
  
  if (pythonSupport) {
    try {
      execSync("python3 --version 2>/dev/null || python --version");
      log(`  ✓ Python detected\n`, "green");
    } catch (e) {
      log(`  ⚠ Python not found (optional). Skipping.\n`, "yellow");
    }
  }

  // Step 4: Memory backend
  const memoryBackend = await selectFromList(
    "Memory storage backend?",
    [
      "in-memory (default, fast, local-only)",
      "file-based (persistent, single machine)",
      "redis (distributed, shared state)",
    ]
  );

  log(`  ✓ Selected: ${memoryBackend}\n`, "green");

  // Step 4.5: Enable Memory System
  const enableMemorySystem = await confirm("Enable Memory System for project analysis?\n  (automatic change tracking + git hooks)");
  
  log(`  ✓ Memory System: ${enableMemorySystem ? "✓ Enabled" : "✗ Disabled"}\n`, "green");

  // Step 5: CI/CD integration
  const ciIntegration = await selectFromList(
    "Will you use this in CI/CD?",
    [
      "no (local development only)",
      "github-actions",
      "gitlab-ci",
      "jenkins",
      "other (manual setup)",
    ]
  );

  log(`  ✓ Selected: ${ciIntegration}\n`, "green");

  // Step 6: Skill discovery and selection
  logSection("Discovering Skills");
  
  let discoveredSkills = [];
  let skillDiscoveryErrors = [];
  
  try {
    const discovery = new SkillDiscovery({
      scanPath: ".agents",
      pattern: "SKILL.md",
      logger: { 
        log: (msg) => log(`  ${msg}`, "gray"),
        warn: (msg) => log(`  ⚠ ${msg}`, "yellow")
      }
    });
    
    const runtimeDir = path.resolve(__dirname, "..");
    const result = await discovery.discoverSkills(runtimeDir);
    discoveredSkills = result.skills;
    skillDiscoveryErrors = result.errors;
    
    if (discoveredSkills.length === 0) {
      log(`  ⚠ No skills discovered. This may indicate a problem.\n`, "yellow");
    } else {
      log(`  ✓ Discovered ${discoveredSkills.length} skill(s)\n`, "green");
    }
  } catch (err) {
    log(`  ✗ Skill discovery failed: ${err.message}\n`, "red");
    log(`  Using default skills instead.\n`, "yellow");
  }

  // Step 7: Select which skills to enable
  let selectedSkills = discoveredSkills;
  
  if (discoveredSkills.length > 0) {
    log(`Available skills:`, "blue");
    discoveredSkills.forEach((skill, idx) => {
      const readOnlyLabel = skill.read_only ? "(read-only)" : "(read+write)";
      log(
        `  ${idx + 1}. ${skill.id.padEnd(20)} v${skill.version} ${readOnlyLabel}`,
        "gray"
      );
      if (skill.description) {
        log(`     ${skill.description}`, "gray");
      }
    });
    console.log("");
    
    const enableAll = await confirm("Enable all discovered skills?");
    
    if (!enableAll && discoveredSkills.length > 1) {
      selectedSkills = [];
      for (const skill of discoveredSkills) {
        const enable = await confirm(`  Enable ${skill.id}?`);
        if (enable) {
          selectedSkills.push(skill);
        }
      }
      console.log("");
    }
    
    log(`  ✓ Selected ${selectedSkills.length} skill(s) to enable\n`, "green");
  }

  // Show summary
  console.log("");
  log("╔═══════════════════════════════════════════════════════╗", "bright");
  log("║  CONFIGURATION SUMMARY                                ║", "bright");
  log("╚═══════════════════════════════════════════════════════╝", "bright");
  log(`  Project Dir:      ${path.basename(projectDir)}/`, "gray");
  log(`  Agent Type:       ${agentType}`, "gray");
  log(`  Python Support:   ${pythonSupport ? "✓ Yes" : "✗ No"}`, "gray");
  log(`  Memory Backend:   ${memoryBackend}`, "gray");
  log(`  Memory System:    ${enableMemorySystem ? "✓ Enabled (with git hooks)" : "✗ Disabled"}`, "gray");
  log(`  CI/CD:            ${ciIntegration}`, "gray");
  log(`  Skills Enabled:   ${selectedSkills.length} skill(s)`, "gray");
  if (selectedSkills.length > 0) {
    selectedSkills.forEach(skill => {
      log(`    - ${skill.id} (v${skill.version})`, "gray");
    });
  }
  console.log("");

  const proceed = await confirm("Proceed with setup?");
  if (!proceed) {
    log("  Setup cancelled.", "yellow");
    rl.close();
    process.exit(0);
  }

  // Perform setup
  logSection("Running Setup");
  
  try {
    // Detect agents-runtime location
    const runtimeDir = path.resolve(__dirname, "..");
    const setupScriptPath = path.join(runtimeDir, "setup-agents.sh");

    if (!fs.existsSync(setupScriptPath)) {
      throw new Error(
        `setup-agents.sh not found at ${setupScriptPath}`
      );
    }

    // Map agent type to template
    const templateMap = {
      "observer (read-only analysis)": "observer",
      "executor (read + write refactoring)": "executor",
      "fullstack (all skills + memory)": "fullstack",
      "orchestrator (spawns sub-agents)": "orchestrator",
      "security-only (OWASP audit only)": "security-only",
    };

    const template = templateMap[agentType];
    const cmd = `bash "${setupScriptPath}" "${projectDir}" --agent ${template}`;

    log("Executing setup script...", "gray");
    execSync(cmd, { stdio: "inherit" });

    log("\n✓ Setup script completed!\n", "green");

    // Generate manifest.json with selected skills
    if (selectedSkills.length > 0) {
      generateManifestJson(projectDir, selectedSkills, {
        agentType,
        timestamp: new Date().toISOString()
      });
    }

    // Create .agents/QUICK_START.md
    createQuickStartGuide(projectDir, {
      agentType,
      pythonSupport,
      memoryBackend,
      ciIntegration,
      runtimeDir,
    });

    // Create .agents/NEXT_STEPS.md
    createNextStepsGuide(projectDir, {
      agentType,
      ciIntegration,
      pythonSupport,
    });

    // Final summary
    logSection("Setup Complete! 🎉");

    log("✓ agents-runtime has been installed successfully!", "green");
    console.log("");
    log("Next steps:", "bright");
    log(`  1. cd ${path.basename(projectDir)}/`, "gray");
    log(`  2. Review .agents/QUICK_START.md for first run guide`, "gray");
    log(`  3. Read .agents/NEXT_STEPS.md for detailed setup`, "gray");
    log(`  4. Run: npm install (if needed)`, "gray");
    console.log("");
    log("Quick start:", "bright");
    log(`  agents check --config agent.yaml`, "gray");
    log(`  agents analyze src/`, "gray");
    log(`  agents audit src/ --security`, "gray");
    console.log("");
    log("Documentation:", "bright");
    log(`  cat .agents/QUICK_START.md`, "gray");
    log(`  cat .agents/TROUBLESHOOTING.md`, "gray");
    console.log("");

  } catch (err) {
    log(`\n✗ Setup failed: ${err.message}`, "red");
    if (err.stderr) {
      log(`\nDetails:\n${err.stderr}`, "gray");
    }
    process.exit(1);
  }

  rl.close();
}

/**
 * Generate manifest.json with discovered and selected skills
 */
function generateManifestJson(projectDir, selectedSkills, config) {
  const agentsDir = path.join(projectDir, ".agents");
  const manifestPath = path.join(agentsDir, "manifest.json");

  // Build skills array for manifest
  const skillsForManifest = selectedSkills.map(skill => ({
    id: skill.id,
    path: skill.path,
    version: skill.version,
    authorization_required_level: skill.authorization_required_level,
    bounded_context: skill.bounded_context,
    read_only: skill.read_only,
    ...(skill.description && { description: skill.description }),
    ...(skill.aggregate_root && { aggregate_root: skill.aggregate_root }),
    ...(skill.handler && { handler: skill.handler }),
    ...(skill.output_event && { output_event: skill.output_event }),
  }));

  try {
    // Load existing manifest if it exists
    let manifest = {};
    if (fs.existsSync(manifestPath)) {
      const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest = existing;
    }

    // Update skills array
    manifest.skills = skillsForManifest;
    
    // Add metadata if not present
    if (!manifest.$schema) {
      manifest.$schema = "https://json-schema.org/draft/2020-12/schema";
      manifest.spec_version = "1.0.0";
      manifest.description =
        "Agent configuration manifest with auto-discovered skills";
    }

    // Add generation metadata
    manifest._generated = {
      timestamp: config.timestamp,
      agent_type: config.agentType,
      by: "setup-interactive.js",
    };

    // Write manifest
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8"
    );

    log(
      `  ✓ Generated manifest.json with ${skillsForManifest.length} skill(s)`,
      "green"
    );
  } catch (err) {
    log(
      `  ⚠ Warning: Could not generate manifest.json: ${err.message}`,
      "yellow"
    );
  }
}

/**
 * Create a personalized QUICK_START.md guide
 */
function createQuickStartGuide(projectDir, config) {
  const { agentType, pythonSupport, runtimeDir } = config;

  const guide = `# Quick Start Guide

Generated: ${new Date().toISOString()}
Agent Type: ${agentType}

## What you just installed

- **agents-runtime** — An AI-powered code analysis engine
- **agent.yaml** — Your agent configuration
- **.agents/** — Agent skills, hooks, and settings

## Your first command (60 seconds)

### Option 1: Using npm scripts (recommended)

\`\`\`bash
# Analyze your code
npm run analyze -- src/

# Security audit
npm run audit -- src/

# Compliance check
npm run check
\`\`\`

### Option 2: Using direct node command

\`\`\`bash
node ${path.relative(projectDir, path.join(runtimeDir, "bin/agents.js"))} run \\
  --config agent.yaml \\
  --skill code-analysis \\
  --input '{"files":["src/"],"project_root":"."}'
\`\`\`

## Common commands

| Task | Command |
|------|---------|
| Analyze code | \`npm run analyze -- src/\` |
| Security audit | \`npm run audit -- src/\` |
| Check compliance | \`npm run check\` |
| List skills | \`npm run list\` |
| Show events | \`npm run events\` |
| **Build memory** | \`npm run agents learn\` |
| **Memory stats** | \`npm run agents memory:stats\` |
| **Search memory** | \`npm run agents memory:search "query"\` |

## Configuration

Your agent is configured as:
- Type: ${agentType}
- Location: \`agent.yaml\`
- Settings: \`.agents/settings.json\`

To change configuration, edit \`agent.yaml\` and re-run checks.

## Troubleshooting

See \`.agents/TROUBLESHOOTING.md\` for common issues and solutions.

## Next steps

1. Review \`.agents/settings.json\` for runtime config
2. Add your project paths to \`.agents/settings.json\`
3. Run \`npm run check\` to validate your config
4. **Build memory index:** \`npm run agents learn\`
5. Integrate into CI/CD (see NEXT_STEPS.md)

## Documentation

- Full docs: \`${path.relative(projectDir, path.join(runtimeDir, "README.md"))}\`
- Skill reference: \`.agents/skills/*/SKILL.md\`
- Contributing: \`${path.relative(projectDir, path.join(runtimeDir, "CONTRIBUTING.md"))}\`

${pythonSupport ? "## Python Support\n\nPython analysis is enabled. The runtime will analyze .py files in addition to .js/.ts files.\n" : ""}

---

For more help, visit: https://github.com/ahvcxa/agents-runtime
`;

  const quickStartPath = path.join(projectDir, ".agents/QUICK_START.md");
  fs.writeFileSync(quickStartPath, guide);
  log(`  ✓ Created QUICK_START.md`, "green");
}

/**
 * Create NEXT_STEPS.md guide
 */
function createNextStepsGuide(projectDir, config) {
  const { agentType, ciIntegration } = config;

  let ciSection = "";
  if (ciIntegration !== "no (local development only)") {
    const ciMap = {
      "github-actions": `## Integrate with GitHub Actions

Create \`.github/workflows/agent-audit.yml\`:

\`\`\`yaml
name: Agent Security Audit
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: node ./agents-runtime/bin/agents.js run --config agent.yaml --skill security-audit --project .
\`\`\``,
      "gitlab-ci": `## Integrate with GitLab CI

Create \`.gitlab-ci.yml\`:

\`\`\`yaml
audit:
  image: node:18
  script:
    - npm install
    - node ./agents-runtime/bin/agents.js run --config agent.yaml --skill security-audit
\`\`\``,
      "jenkins": `## Integrate with Jenkins

Add to your Jenkinsfile:

\`\`\`groovy
stage('Agent Audit') {
  steps {
    sh 'node ./agents-runtime/bin/agents.js run --config agent.yaml --skill security-audit'
  }
}
\`\`\``,
      "other (manual setup)": `## Manual CI/CD Setup

See README.md § "Use in CI/CD" for language-specific examples.`,
    };
    ciSection = ciMap[ciIntegration] || "";
  }

  const nextSteps = `# Next Steps for agents-runtime

Generated: ${new Date().toISOString()}

## 1. Verify Installation

Check that everything is correctly installed:

\`\`\`bash
# Should show no errors
node bin/agents.js check --config agent.yaml --project .
\`\`\`

Expected output:
\`\`\`
✓ Agent compliance check passed
✓ Config is valid
✓ Skills are registered
\`\`\`

## 2. Run Your First Analysis

Analyze your codebase:

\`\`\`bash
node bin/agents.js run \\
  --config agent.yaml \\
  --skill code-analysis \\
  --input '{"files":["src/"],"project_root":"."}'
\`\`\`

This will produce:
- Cyclomatic complexity findings
- DRY (Don't Repeat Yourself) violations
- Security patterns (injection, XSS, etc.)
- SOLID principles violations
- Cognitive complexity issues

## 3. Security Audit

Run OWASP Top 10 security audit:

\`\`\`bash
node bin/agents.js run \\
  --config agent.yaml \\
  --skill security-audit \\
  --input '{"files":["src/"],"project_root":"."}'
\`\`\`

## 4. Configure Your Workspace

Edit \`.agents/settings.json\`:

\`\`\`json
{
  "project_root": ".",
  "read_paths": ["src/", "tests/"],
  "python_analysis": {
    "enabled": true,
    "ast_analysis": true,
    "safe_subprocess": true
  },
  "memory_backend": "in-memory",
  "logging": {
    "level": "INFO",
    "output": ".agents/logs"
  }
}
\`\`\`

## 5. Memory System (Project Analysis & Auto-Tracking)

The Memory System automatically indexes your project for fast context loading.

**Build initial memory index:**

\`\`\`bash
npm run agents learn
\`\`\`

**View memory statistics:**

\`\`\`bash
npm run agents memory:stats
npm run agents memory:stats --language javascript
\`\`\`

**Search project memory:**

\`\`\`bash
npm run agents memory:search "your query"
npm run agents memory:search "exports" --language python
\`\`\`

**Automatic Git Integration:**

After setup, two git hooks are installed:
- \`.git/hooks/post-commit\` — Updates change-log after each commit
- \`.git/hooks/post-merge\` — Syncs memory after pulls/merges

Verify hooks are working:

\`\`\`bash
cat .agents/memory/change-log.json | tail
\`\`\`

See \`.agents/memory-system/MEMORY_SYSTEM.md\` for advanced features.

## 6. Create Custom Skills (Optional)

Create a new skill in \`.agents/skills/my-skill/\`:

\`\`\`
.agents/skills/my-skill/
├── SKILL.md      (metadata + contract)
└── handler.js    (execution logic)
\`\`\`

See \`.agents/skills/code-analysis/SKILL.md\` for examples.

## 7. Set Up Hooks (Optional)

Modify behavior with hooks in \`.agents/hooks/\`:

- \`pre-read.hook.js\` — Filesystem access guard
- \`skill-lifecycle.hook.js\` — Before/after skill execution

## 8. Use as MCP Tool (Claude/Cursor/Windsurf)

Start the MCP server:

\`\`\`bash
node bin/mcp.js --project .
\`\`\`

Then configure your AI editor (Claude Desktop, Cursor, Windsurf) to use agents-runtime.
See \`docs/MCP_SETUP.md\` for details.

${ciSection}

## 9. Integration Examples

### Pre-commit Hook

\`\`\`.git/hooks/pre-commit\`\`\`
\`\`\`bash
#!/bin/sh
node bin/agents.js run \\
  --config agent.yaml \\
  --skill security-audit \\
  --input '{"files":["src/"],"project_root":"$(pwd)"}'
\`\`\`

### Docker Integration

\`\`\`dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "bin/agents.js", "run", "--config", "agent.yaml", "--skill", "code-analysis"]
\`\`\`

## Troubleshooting

If you encounter issues:

1. Check \`.agents/TROUBLESHOOTING.md\`
2. Review \`.agents/logs/\` for error details
3. Run with \`-v, --verbose\` for detailed output
4. Visit https://github.com/ahvcxa/agents-runtime/issues

## Getting Help

- **Documentation**: README.md in project root
- **Examples**: \`examples/\` directory
- **Issues**: GitHub issues page
- **Discussions**: GitHub discussions

## Agent Types Reference

- **Observer** (Level 1) — Read-only analysis, no modifications
- **Executor** (Level 2) — Can suggest refactoring + write files
- **Orchestrator** (Level 3) — Full control, spawn sub-agents

Your agent is: **${agentType}**

---

Enjoy using agents-runtime! 🚀
`;

  const nextStepsPath = path.join(projectDir, ".agents/NEXT_STEPS.md");
  fs.writeFileSync(nextStepsPath, nextSteps);
  log(`  ✓ Created NEXT_STEPS.md`, "green");
}

// Run
main().catch((err) => {
  log(`\nFatal error: ${err.message}`, "red");
  process.exit(1);
});
