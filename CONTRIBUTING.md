# Contributing to agents-runtime

Thank you for your interest in contributing! This document explains how to get started.

---

## Development Setup

```bash
git clone https://github.com/ahvcxa/agents-runtime.git
cd agents-runtime
npm install
npm test        # Run the test suite (18 tests, ~0.2s)
```

---

## Project Structure

| Path | Purpose |
|------|---------|
| `bin/agents.js` | CLI entry point |
| `src/engine.js` | Central orchestrator |
| `src/agent-runner.js` | Skill lifecycle pipeline |
| `src/analyzers/` | Language-specific analyzers (JS, Python) |
| `src/registry/` | Hook and skill registries |
| `src/memory/` | ACL-backed memory store |
| `tests/` | Jest test suites |

The `.agents/` template lives in the companion `agents-template/` directory and is what `setup-agents.sh` installs into user projects.

---

## Contributing a New Language Analyzer

1. Create `src/analyzers/<lang>-analyzer.js`
2. Export two functions:
   ```javascript
   module.exports = {
     analyzeCode<Lang>(lines, relPath) { return findings[]; },
     auditSecurity<Lang>(lines, relPath) { return findings[]; },
   };
   ```
3. Copy the analyzer to `.agents/helpers/<lang>-analyzer.js`
4. Wire it into the skill handlers (dispatch by file extension)
5. Add tests in `tests/`

---

## Contributing a New Skill

1. Create `.agents/skills/<skill-name>/SKILL.md` with the required YAML frontmatter
2. Create `.agents/skills/<skill-name>/handler.js` implementing `async execute(ctx)`
3. Register the skill in `.agents/manifest.json`
4. Update `README.md` with the skill description

---

## Code Style

- **No external runtime dependencies** beyond `commander`, `gray-matter`, `js-yaml`
- All new analyzer logic must be pure Node.js (no native bindings)
- Every exported function must have a JSDoc comment
- Finding objects must conform to the `Finding` interface in `code-analysis/SKILL.md`

---

## Pull Request Guidelines

- One feature / bug fix per PR
- Include tests for new functionality
- Update `README.md` if CLI commands or skill behavior changes
- Ensure `npm test` passes with no failures

---

## Reporting Issues

Use the GitHub issue templates:
- 🐛 **Bug Report** — for incorrect findings, crashes, or unexpected behavior
- 💡 **Feature Request** — for new skills, language support, or CLI commands
- 🔒 **Security** — for vulnerabilities, please email directly (do not open a public issue)

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
