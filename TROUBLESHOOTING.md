# Troubleshooting Guide

> Having trouble? This guide covers the most common issues and solutions.

## 🔴 Critical Issues

### "agent.yaml: No such file or directory"

**Problem:** You haven't set up the project yet.

**Solution:**
```bash
# Run the interactive setup wizard
npm run setup

# Or use the traditional setup
bash setup-agents.sh . --agent fullstack
```

### "Cannot find module '../src/engine'"

**Problem:** `agents-runtime` is not installed or the directory structure is wrong.

**Solution:**
```bash
# Make sure you're in the agents-runtime repository
cd agents-runtime

# Install dependencies
npm install

# Try the command again
agents analyze src/
```

### "Python version X is not supported"

**Problem:** You have Python 2, but agents-runtime needs Python 3.8+.

**Solution:**
```bash
# Check your Python version
python3 --version

# If not installed, install Python 3.8+
# macOS: brew install python3
# Ubuntu: sudo apt-get install python3
# Windows: Download from python.org

# Disable Python analysis if you don't need it
# Edit agent.yaml and remove "python" from languages
```

### Analysis shows "0 findings" but there should be issues

**Problem:** Either the code is perfect (unlikely 😄), or the skill isn't running correctly.

**Verify:**
```bash
# Check compliance first
agents check

# Run with verbose output
agents analyze src/ --verbose

# Check settings.json
cat .agents/settings.json

# Make sure your files are in read_paths
```

## 🟠 High Priority Issues

### Slow analysis / Timeout

**Problem:** Analysis is taking too long or timing out.

**Solutions:**
1. **Exclude large folders:**
   ```yaml
   # agent.yaml
   read_paths:
     - "src/"
     - "lib/"
     # - "node_modules/"     ← Large folder!
     # - "build/"            ← Generated files!
     # - ".next/"            ← Build output!
   ```

2. **Disable unnecessary features:**
   ```json
   {
     "python_analysis": {
       "enabled": false,
       "ast_analysis": false
     }
   }
   ```

3. **Run on specific files:**
   ```bash
   agents analyze src/core/ --verbose
   ```

### "Skill not found: code-analysis"

**Problem:** The skill isn't registered in the project.

**Solution:**
```bash
# Check registered skills
agents list

# Reinstall .agents/ folder
bash setup-agents.sh . --force

# Verify manifest.json
cat .agents/manifest.json
```

### Permission denied errors

**Problem:** No write access to `.agents/` folder.

**Solution:**
```bash
# Check permissions
ls -la .agents/

# Fix if needed (macOS/Linux)
chmod -R 755 .agents/

# On Windows, right-click → Properties → Security → Edit
```

### "Config is invalid" error

**Problem:** Your `agent.yaml` or `settings.json` has syntax errors.

**Solution:**
```bash
# Validate YAML syntax
cat agent.yaml

# Try using JSON instead (also supported)
cat .agents/settings.json

# Common issues:
# - Missing colons (:)
# - Wrong indentation (use spaces, not tabs)
# - Unclosed quotes

# Quick fix: regenerate from template
bash setup-agents.sh . --force
```

## 🟡 Medium Priority Issues

### "module 'ast' has no attribute 'parse'"

**Problem:** Python AST analysis failed.

**Solution:**
```bash
# Disable AST analysis if not needed
# Edit .agents/settings.json
{
  "python_analysis": {
    "ast_analysis": false
  }
}

# Or verify Python path
which python3
```

### No findings even though there are issues

**Problem:** The analyzer might not detect certain patterns.

**Possible causes:**
- **Security patterns:** Only detects common patterns (SQL injection, XSS, hardcoded secrets, etc.)
- **Complexity:** Only reports CC ≥ 11 or cognitive complexity > 15
- **DRY violations:** Only reports clones ≥ 6 lines or duplicated strings used > 2x

**Verify patterns:**
```bash
# Check what the skill looks for
cat .agents/skills/code-analysis/SKILL.md
cat .agents/skills/security-audit/SKILL.md
```

### Different results between runs

**Problem:** Analysis is inconsistent.

**Causes:**
- File order varies (non-deterministic)
- Settings changed
- Code was modified

**Compare runs:**
```bash
agents analyze src/ --diff

# See detailed diff
agents diff --skill code-analysis
```

### Memory store getting large

**Problem:** `.agents/.memory-store` is taking too much disk space.

**Solution:**
```bash
# Clear old entries (safe)
rm .agents/.memory-store

# Next run will recreate it
agents check

# Or switch to in-memory (less persistent, but lighter)
# Edit .agents/settings.json
{
  "memory_backend": "in-memory"
}
```

## 🟢 Low Priority Issues

### Output is not colored (Windows CMD)

**Problem:** Colors don't show up in Windows Command Prompt.

**Solution:**
```bash
# Use Windows Terminal instead (modern & pretty)
# Or enable ANSI support:
# Settings → Region & language → Advanced → Change system locale
# ☑ Beta: Use Unicode UTF-8 for worldwide language support

# Or just pipe output:
agents analyze src/ > report.txt
```

### Can't use `agents` command globally

**Problem:** `agents` command only works in the project directory.

**Solution:**
```bash
# Option 1: Use full path
node /path/to/agents-runtime/bin/agents.js analyze src/

# Option 2: Install globally (advanced)
npm install -g /path/to/agents-runtime

# Option 3: Add alias to .bashrc/.zshrc
alias agents="node /path/to/agents-runtime/bin/agents.js"
```

### "Node.js version X is too old"

**Problem:** You have Node.js < 18.0.0.

**Solution:**
```bash
# Check version
node --version

# Upgrade Node.js
# Option 1: nvm (Node Version Manager) - Recommended
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Option 2: Direct download
# Visit https://nodejs.org/ and download LTS version
```

### MCP server won't start

**Problem:** Can't connect MCP server to Claude Desktop, Cursor, etc.

**Solution:**
```bash
# Start MCP server
node bin/mcp.js --project .

# Test if it's running
curl http://localhost:3000/health

# Check MCP config path in Claude Desktop
# macOS: ~/Library/Application\ Support/Claude/claude_desktop_config.json
# Windows: %APPDATA%\Claude\claude_desktop_config.json
# Linux: ~/.config/Claude/claude_desktop_config.json

# Verify file path is absolute (not relative)
{
  "mcpServers": {
    "agents-runtime": {
      "command": "node",
      "args": [
        "/absolute/path/to/agents-runtime/bin/mcp.js",
        "--project",
        "/absolute/path/to/your/project"
      ]
    }
  }
}
```

## 🔧 Advanced Debugging

### Enable verbose logging

```bash
# Show detailed logs
agents analyze src/ --verbose

# Check log files
cat .agents/logs/*.log
```

### Check event history

```bash
# See what happened
agents events --limit 50

# Filter by event type
agents events | grep "CRITICAL"
```

### Manual skill execution

```bash
# Run with explicit input
agents run \
  --config agent.yaml \
  --skill code-analysis \
  --input '{"files":["src/"],"project_root":"."}' \
  --verbose
```

### Validate configuration

```bash
# Check compliance
agents check --config agent.yaml

# Review settings
cat agent.yaml
cat .agents/settings.json
cat .agents/manifest.json
```

## 📞 Still Having Issues?

1. **Check this guide again** — Most issues are covered here
2. **Check the logs** — `cat .agents/logs/*.log`
3. **Run `agents check`** — Validates configuration
4. **Search GitHub Issues** — https://github.com/ahvcxa/agents-runtime/issues
5. **Open a new issue** — Include:
   - `node --version` and `npm --version`
   - Python version (if applicable)
   - Your `agent.yaml` (without secrets)
   - Error message (full output)
   - Steps to reproduce

## 🚀 Pro Tips

- **Backup your config:** `cp -r .agents .agents.backup`
- **Version control:** Commit `.agents/` to git (except logs/)
- **Monitor trends:** Use `--diff` flag to track improvements
- **Schedule analysis:** Add to cron job or CI/CD pipeline
- **Export reports:** `agents analyze src/ --export report.json`

---

**Still need help?** Post in GitHub Discussions or open an issue! 🙌
