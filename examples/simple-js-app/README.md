# Simple JavaScript Project Example

This is a minimal example showing how to use agents-runtime with a JavaScript project.

## What's inside

- `src/` - Source code with intentional issues (for demo purposes)
- `package.json` - Project configuration
- `.gitignore` - Git configuration
- `README.md` - This file

## Quick start

```bash
# 1. Go to this directory
cd examples/simple-js-app

# 2. Set up agents-runtime
npm run setup

# 3. Run analysis
agents analyze src/

# 4. Run security audit
agents audit src/ package.json
```

## What to expect

The code in `src/` has intentional issues:

- **SQL Injection:** Direct query concatenation
- **Hardcoded credentials:** API keys in comments
- **High complexity:** Complex conditional logic
- **Code duplication:** Repeated patterns

The agents-runtime scanner will find these and report them with:
- 🔴 **CRITICAL** - Security threats
- 🟠 **HIGH** - Code quality issues
- 🟡 **MEDIUM** - Minor improvements

## Learning points

1. **Code Analysis** - See cyclomatic complexity, DRY violations, etc.
2. **Security Audit** - OWASP Top 10 patterns
3. **Configuration** - How to set up agent.yaml
4. **Integration** - Use in your own projects

## Next steps

1. **Add your own code:** Copy your JavaScript files to `src/`
2. **Configure:** Edit `agent.yaml` to adjust analysis rules
3. **Integrate CI/CD:** Add to GitHub Actions, GitLab CI, etc.
4. **Monitor:** Track improvements with `--diff` flag

---

See `../../README.md` for full documentation.
