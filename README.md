<div align="center">

# 🤖 agents-runtime

**A vendor-neutral AI Agent Runtime Engine**

[![Tests](https://github.com/ahvcxa/agents-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/ahvcxa/agents-runtime/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Execute AI agent skills with lifecycle hooks, OWASP security auditing, and zero vendor lock-in.
Works with any LLM provider — Claude, GPT, Gemini, or fully offline.

[Quick Start](#-quick-start) · [CLI Reference](#-cli-reference) · [Writing Skills](#-writing-a-skill) · [Contributing](CONTRIBUTING.md)

</div>

---

## ✨ What is this?

`agents-runtime` is a **Node.js runtime engine** that executes formalized AI agent skill definitions (`.agents/` configuration). It turns a collection of markdown/JSON config files into a real, runnable analysis pipeline.

Instead of every AI chat session re-inventing the wheel, you define **skills** once and run them programmatically — in CI, as a pre-commit hook, or from the CLI.

```
┌─────────────────────────────────────────────────┐
│                  agents-runtime                  │
│                                                  │
│  manifest.json ──► HookRegistry                  │
│  settings.json ──► AgentRuntime ──► EventBus     │
│  SKILL.md      ──► SkillRegistry                 │
│  handler.js    ──► AgentRunner ──► Findings[]    │
└─────────────────────────────────────────────────┘
```

### Key Features

| Feature | Description |
|---------|-------------|
| 🔌 **Vendor-Neutral** | No LLM API keys required. Runs fully offline. |
| 🐍 **Multi-Language** | Analyzes JavaScript/TypeScript **and** Python source code |
| 🛡️ **OWASP Top 10** | Built-in security audit covering all 10 categories (2021) |
| 🔒 **Security Hooks** | `pre-read` hook enforces path traversal protection at framework level |
| 📋 **ACL Memory** | Authorization-level-based memory namespaces (Observer / Executor / Orchestrator) |
| 📦 **Zero Config** | One script installs the full `.agents/` config into any existing project |
| ✅ **18 Tests** | Jest test suite covering engine, hooks, and memory layers |

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18.0.0
- npm ≥ 9.0.0

### 1. Clone the runtime

```bash
git clone https://github.com/ahvcxa/agents-runtime.git
cd agents-runtime
npm install
```

### 2. Install the agent config into your project

```bash
bash setup-agents.sh /path/to/your/project
```


### 3. Create an agent config

Create `agent.yaml` in your project root:

```yaml
agent:
  id: "my-analyzer"
  role: "Observer"
  skill_set:
    - "code-analysis"
    - "security-audit"
  authorization_level: 1
  read_only: true
  read_paths:
    - "src/"
    - "tests/"
```

### 4. Run

```bash
# Verify compliance
node bin/agents.js check \
  --config /your-project/agent.yaml \
  --project /your-project

# Analyze code
node bin/agents.js run \
  --config /your-project/agent.yaml \
  --skill code-analysis \
  --input '{"files":["src/"],"project_root":"/your-project"}' \
  --project /your-project

# Security audit
node bin/agents.js run \
  --config /your-project/agent.yaml \
  --skill security-audit \
  --input '{"files":["src/",".env.example"],"project_root":"/your-project"}' \
  --project /your-project
```

---

## 📁 Repository Structure

```
agents-runtime/              ← repo root
├── setup-agents.sh          ← one-command installer
├── bin/
│   └── agents.js            # CLI entry point
├── src/
│   ├── engine.js            # AgentRuntime — central orchestrator
│   ├── agent-runner.js      # Skill lifecycle pipeline
│   ├── analyzers/
│   │   └── python-analyzer.js
│   ├── loader/
│   │   ├── manifest-loader.js
│   │   ├── settings-loader.js
│   │   └── skill-loader.js
│   ├── registry/
│   │   ├── hook-registry.js
│   │   └── skill-registry.js
│   ├── memory/
│   │   └── memory-store.js
│   └── events/
│       └── event-bus.js
├── template/                ← installed into target projects by setup-agents.sh
│   ├── manifest.json        # Machine-readable entry point
│   ├── settings.json        # Runtime, memory, logging, security config
│   ├── AGENT_CONTRACT.md    # Human-readable behavioral contract
│   ├── hooks/
│   │   ├── pre-read.hook.js          # Filesystem access guard
│   │   └── skill-lifecycle.hook.js  # pre-skill / post-skill events
│   ├── helpers/
│   │   ├── compliance-check.js       # Agent compliance validator
│   │   ├── memory-client.js          # CrossAgentMemoryClient reference impl
│   │   └── python-analyzer.js        # Python static analysis engine
│   └── skills/
│       ├── code-analysis/
│       │   ├── SKILL.md
│       │   └── handler.js
│       ├── security-audit/
│       │   ├── SKILL.md
│       │   └── handler.js
│       └── refactor/
│           ├── SKILL.md
│           └── handler.js
├── examples/
│   ├── observer-agent.yaml  # Level-1 read-only agent
│   └── executor-agent.yaml  # Level-2 read/write agent
└── tests/
    ├── engine.test.js
    ├── hook-registry.test.js
    └── memory-store.test.js
```


---

## ⚙️ CLI Reference

```
Usage: agents <command> [options]

Commands:
  run     Execute a skill against a project
  check   Run compliance check for an agent config
  list    List registered skills and hooks
  events  Show recent domain events from memory

Options:
  --config <path>   Path to agent YAML config file
  --project <path>  Path to project root (contains .agents/)
  --skill <id>      Skill to execute (for 'run' command)
  --input <json>    JSON input to pass to the skill handler
  -v, --verbose     Enable verbose output
  -h, --help        Display help
```

### Examples

```bash
# List all skills and hooks registered in a project
node bin/agents.js list --project ./my-project

# Compliance check
node bin/agents.js check --config ./my-project/agent.yaml --project ./my-project

# Full code analysis of a Python + JS project
node bin/agents.js run \
  --config ./my-project/agent.yaml \
  --skill code-analysis \
  --input '{"files":["src/","tests/"],"project_root":"./my-project"}' \
  --project ./my-project

# Security audit
node bin/agents.js run \
  --config ./my-project/agent.yaml \
  --skill security-audit \
  --input '{"files":["src/",".env.example","package.json"],"project_root":"./my-project"}' \
  --project ./my-project
```

---

## 🧠 Authorization Levels

Agents operate at one of three authorization levels, which control memory write access and which skills can be executed:

| Level | Role | Can Execute | Memory Write |
|-------|------|-------------|-------------|
| 1 | **Observer** | `code-analysis`, `security-audit` | `skill:*:cache:*` namespace |
| 2 | **Executor** | All skills incl. `refactor` | `skill:*`, `pipeline:staging:*` |
| 3 | **Orchestrator** | All skills + spawn sub-agents | Full namespace access |

---

## 🔍 Built-in Skills

### `code-analysis`

Static analysis covering all 5 principles:

| Principle | What it checks |
|-----------|----------------|
| **Cyclomatic Complexity** | Functions with CC ≥ 11 (HIGH) or CC > 20 (CRITICAL) |
| **DRY** | Magic numbers/strings used >2x, structural code clones ≥6 lines |
| **Security-First** | 8 JS + 18 Python security patterns (injection, secrets, crypto, SSRF) |
| **SOLID** | SRP (file >500 LoC), OCP (elif chains >4), DIP (direct `new`), class size |
| **Cognitive Complexity** | Functions scoring >15 (MEDIUM) or >30 (HIGH) |

Supports: `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` **`.py`**

### `security-audit`

OWASP Top 10 (2021) deep security audit:

| OWASP | Checks |
|-------|--------|
| A01 | Missing auth middleware, CORS wildcard |
| A02 | Weak ciphers, base64-encoded secrets, hardcoded credentials |
| A03 | Template injection, ReDoS, SQL injection, subprocess shell=True |
| A04 | CORS misconfiguration, rate limiting disabled |
| A05 | DEBUG=True, verbose error exposure |
| A06 | `package.json` known vulnerable version ranges |
| A07 | Plaintext password compare, MD5 hashing, long JWT expiry |
| A08 | Dynamic require(), JSON.parse without schema validation, pickle.loads() |
| A09 | Empty catch/except blocks |
| A10 | SSRF via user-controlled HTTP URLs |

### `refactor`

Generates **unified diff patches** for `auto_fixable: true` findings. **Dry-run by default** — patches are always proposed, never applied without Orchestrator approval.

---

## 📝 Writing a Skill

1. Create a directory under `.agents/skills/<your-skill>/`
2. Add a `SKILL.md` with YAML frontmatter:

```yaml
---
id: my-skill
version: 1.0.0
authorization_required_level: 1
bounded_context: Analysis
output_event: MySkillCompleted
output_schema: Finding[]
read_only: true
handler: .agents/skills/my-skill/handler.js
---
```

3. Create `handler.js`:

```javascript
"use strict";

async function execute({ agentId, authLevel, input, memory, log }) {
  log({ event_type: "INFO", message: `my-skill starting for ${agentId}` });

  // Your analysis logic here
  const findings = [];

  // Cache results
  memory.set(`skill:my-skill:cache:last-run:${agentId}`, {
    findings, scanned_at: new Date().toISOString()
  });

  return { findings };
}

module.exports = { execute };
```

4. Register in `manifest.json`:

```json
{
  "skills": [
    {
      "id": "my-skill",
      "path": ".agents/skills/my-skill/SKILL.md"
    }
  ]
}
```

---

## 🔇 Suppressing Findings

Add an inline comment to suppress a specific finding:

```python
# agent-suppress: dry-myfile.py-L42 reason="intentional duplication for clarity"
```

```javascript
// agent-suppress: security-a02:2021-config.js-L15 reason="test fixture only"
```

Suppressed findings are logged at `INFO` level. They are **never silently dropped**.

---

## 🧪 Running Tests

```bash
npm test
```

```
Test Suites: 3 passed, 3 total
Tests:       18 passed, 18 total
Time:        ~0.2s
```

---

## 🔗 Use in CI/CD

### GitHub Actions

```yaml
# .github/workflows/agent-audit.yml
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

      - name: Install agents-runtime
        run: |
          git clone https://github.com/yourusername/agents-runtime.git ../agents-runtime
          cd ../agents-runtime && npm install

      - name: Run security audit
        run: |
          node ../agents-runtime/bin/agents.js run \
            --config agent.yaml \
            --skill security-audit \
            --input '{"files":["src/"],"project_root":"${{ github.workspace }}"}' \
            --project ${{ github.workspace }}
```

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
node /path/to/agents-runtime/bin/agents.js run \
  --config agent.yaml \
  --skill security-audit \
  --input '{"files":["src/"],"project_root":"$(pwd)"}' \
  --project "$(pwd)"
```

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────┐
│                        CLI (agents.js)                      │
└────────────────────────┬───────────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────────┐
│                    AgentRuntime                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ManifestLoader│  │SettingsLoader│  │  StructuredLogger│  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ HookRegistry│  │SkillRegistry │  │    EventBus      │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────┘  │
│         │                │                                  │
│  ┌──────▼────────────────▼─────────────────────────────┐   │
│  │                   AgentRunner                        │   │
│  │  compliance → pre-skill → execute → post-skill → emit│   │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   handler.js      MemoryStore    EventBus
   (code-analysis  (ACL-backed    (domain
    security-audit  in-memory)     events)
    refactor)
```

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

---

## 📄 License

MIT © 2024 — See [LICENSE](LICENSE) for details.
