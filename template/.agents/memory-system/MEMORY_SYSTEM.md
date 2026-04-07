# 📚 Memory System Documentation

## Overview

The **Memory System** is a high-performance, language-aware project memory engine for agents-runtime. It enables agents to quickly understand and navigate large codebases without expensive token consumption.

## Key Features

- 🚀 **Fast Context Loading**: 2-3ms memory lookups vs 15-20s full analysis
- 💾 **Persistent Storage**: Git-trackable JSON files in `.agents/memory/`
- 🌍 **Multi-Language Support**: JavaScript, TypeScript, Python (Phase 1), Go/Rust (Phase 2)
- 📊 **Intelligent Indexing**: Full-text search, language-specific queries
- 🔄 **Incremental Updates**: Git-aware delta scanning
- 🔐 **Secure**: Sensitive data redaction, access control via role levels

## Quick Start

### 1. Build Project Memory

```bash
npm run agents learn
# or
npm run agents learn --refresh  # Incremental update
```

### 2. View Statistics

```bash
npm run agents memory:stats
npm run agents memory:stats --language javascript
```

### 3. Search Memory

```bash
npm run agents memory:search "exports"
npm run agents memory:search "main" --language python
```

### 4. List Languages

```bash
npm run agents memory:languages
```

## Architecture

### Directory Structure

```
.agents/memory-system/
├── core/                          # Core orchestration
│   ├── project-memory-store.js    # Main entry point
│   ├── memory-index.js            # Indexing engine
│   ├── change-detector.js         # Git-aware change detection
│   └── language-detector.js       # Language detection
│
├── scanners/                      # Modular scanners
│   ├── structure-scanner.js       # File tree, LOC, complexity
│   ├── dependency-scanner.js      # Dependency graphs
│   ├── capability-scanner.js      # Exports, functions, classes
│   ├── config-scanner.js          # Configuration detection
│   │
│   └── language-plugins/          # Language-specific plugins
│       ├── javascript-plugin.js   # JS/TS support
│       ├── python-plugin.js       # Python support
│       └── (go, rust, java stubs)
│
├── cli/                           # CLI integration
│   ├── commands.js                # Command handlers
│   └── validators.js              # Input validation
│
└── hooks/                         # Git hooks
    ├── git-post-commit.js
    └── git-post-merge.js
```

### Memory Data Structure

```json
{
  "metadata": {
    "version": "2.0.0",
    "languages_detected": ["javascript", "python"],
    "scan_date": "2026-04-07T...",
    "scan_duration_ms": 750,
    "project_hash": "abc123def456"
  },
  "structure": {
    "root": "/path/to/project",
    "total_files": 255,
    "total_lines": 45234,
    "by_language": {
      "javascript": [...],
      "python": [...]
    }
  },
  "dependencies": {
    "javascript": {
      "direct": {...},
      "dev": {...}
    },
    "python": {
      "direct": {...}
    }
  },
  "capabilities": {
    "javascript": {
      "exports": [...],
      "functions": [...],
      "classes": [...]
    },
    "python": {...}
  },
  "indexes": {
    "full_text": [...],
    "languages": [...],
    "symbols": {...}
  }
}
```

## Commands

### `agents learn`

Performs a full project scan and builds memory.

**Options:**
- `-p, --project <dir>`: Project root (default: cwd)
- `-r, --refresh`: Incremental update instead of full scan
- `-f, --force`: Force full rescan (ignore cache)
- `-v, --verbose`: Verbose output
- `--languages <list>`: Comma-separated languages to scan

**Example:**
```bash
npm run agents learn
npm run agents learn --refresh                    # Quick update
npm run agents learn --languages javascript,python
```

### `agents memory:stats`

Shows memory statistics and metadata.

**Options:**
- `-p, --project <dir>`: Project root
- `--language <lang>`: Show stats for specific language

**Example:**
```bash
npm run agents memory:stats
npm run agents memory:stats --language javascript
```

### `agents memory:search <query>`

Searches project memory (full-text).

**Options:**
- `-p, --project <dir>`: Project root
- `--language <lang>`: Filter by language
- `--limit <n>`: Max results (default: 10)

**Example:**
```bash
npm run agents memory:search "exports"
npm run agents memory:search "main" --language python --limit 20
```

### `agents memory:languages`

Lists all detected languages and their statistics.

**Example:**
```bash
npm run agents memory:languages
```

### `agents memory:export [format]`

Exports memory to JSON or text format.

**Options:**
- `-p, --project <dir>`: Project root
- `-o, --output <file>`: Output file (optional)

**Example:**
```bash
npm run agents memory:export json
npm run agents memory:export text
```

## Performance

### Scan Times

**Initial Scan (Full):**
- Structure scanning: ~300ms
- Config scanning: ~50ms
- JavaScript dependencies: ~150ms
- Python dependencies: ~200ms
- Indexing: ~50ms
- **Total: ~750ms**

**Incremental Update (1 file changed):**
- Git diff detection: ~25ms
- Re-parse single file: ~50ms
- Update indexes: ~25ms
- **Total: ~100ms**

**Agent Memory Lookup:**
- `memory.read('project:javascript')`: ~2ms
- `memory.search('query')`: ~5ms

### Token Savings

Without Memory System:
- Per command analysis: 8K tokens
- 30 commands/day: 240K tokens
- Monthly: ~7.2M tokens

With Memory System:
- Initial scan (once): 15K tokens
- Per command lookup: 2.5K tokens
- 30 commands/day: 75K tokens
- Monthly: ~2.25M tokens

**Savings: ~69% reduction!** 🎯

## Language Support

### Phase 1 (Current)
- ✅ JavaScript/TypeScript
- ✅ Python

### Phase 2 (Coming)
- ✅ Go
- ✅ Rust

### Phase 3 (Future)
- ✅ Java
- ✅ C/C++

## Git Integration

### Automatic Updates

Memory can be automatically updated when:

1. **Post-commit**: Change log is updated
2. **Post-merge**: Full sync performed (if memory exists)

### Setup

**✅ Hooks Already Installed**

Git hooks are pre-installed and active in `.git/hooks/`:
- `post-commit` - Updates change log after each commit
- `post-merge` - Syncs memory after pulls/merges

Hooks run silently in the background (non-blocking) to ensure git operations are never interrupted.

**Manual Reinstallation (if needed)**

```bash
# Create post-commit hook
cat > .git/hooks/post-commit << 'EOF'
#!/bin/bash
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"
node "./.agents/memory-system/hooks/git-post-commit.js" 2>/dev/null
exit 0
EOF

# Create post-merge hook
cat > .git/hooks/post-merge << 'EOF'
#!/bin/bash
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"
node "./.agents/memory-system/hooks/git-post-merge.js" 2>/dev/null
exit 0
EOF

# Make executable
chmod +x .git/hooks/post-commit .git/hooks/post-merge
```

**Verify Hooks Are Working**

```bash
# Check hook files exist and are executable
ls -la .git/hooks/post-commit .git/hooks/post-merge

# View recent change log entries (should show post_commit/post_merge types)
tail .agents/memory/change-log.json
```

## Troubleshooting

### Memory not found

```bash
npm run agents learn  # Build memory first
```

### Out of date memory

```bash
npm run agents learn --refresh  # Incremental update
npm run agents learn --force    # Full re-scan
```

### Large projects (>1000 files)

Memory system handles large projects efficiently:
- Selective file scanning
- Indexed access (O(1) lookups)
- Lazy plugin loading

For very large projects (>10K files), consider Phase 2's SQLite backend.

## Security

### Sensitive Data

Automatic redaction of:
- API keys and tokens
- Database passwords
- Private environment variables
- Secret keys and certificates

### Access Control

Memory access is controlled by agent authorization levels:
- **Observer (Level 1)**: Read structure, dependencies, APIs
- **Executor (Level 2)**: Read all, write to change log
- **Orchestrator (Level 3)**: Full read/write access

### Forbidden Files

These file patterns are excluded:
- `.env`, `.env.*`
- `*.key`, `*.pem`
- `secrets/`, `credentials/`
- `node_modules/`, `vendor/`

## Development

### Adding a New Language Scanner

1. Create plugin in `.agents/memory-system/scanners/language-plugins/`
2. Extend `BaseLanguagePlugin` interface
3. Implement required methods:
   - `scanDependencies()`
   - `scanCapabilities()`
   - `getFramework()`

4. Register in `DependencyScanner` and `CapabilityScanner`
5. Add tests in `.agents/memory-system/tests/`

### Testing

```bash
# Unit tests
npm run test -- .agents/memory-system/tests/unit/

# Integration tests
npm run test -- .agents/memory-system/tests/integration/

# Full suite
npm run test -- .agents/memory-system/
```

## API Reference

### ProjectMemoryStore

```javascript
const { ProjectMemoryStore } = require('./.agents/memory-system/core/project-memory-store');

const store = new ProjectMemoryStore(projectRoot);

// Scan project
const memory = await store.scan();

// Incremental update
const updated = await store.incrementalUpdate();

// Load from disk
const loaded = store.loadMemory();

// Search
const results = store.search('query', {language: 'javascript'});

// Statistics
const stats = store.getStats();
```

### MemoryIndex

```javascript
const { MemoryIndex } = require('./.agents/memory-system/core/memory-index');

const index = new MemoryIndex();

// Build indexes
const indexes = index.buildIndexes(memory);

// Search
const results = index.search('query', {limit: 10});

// Language-specific
const symbols = index.getLanguageSymbols('javascript');
const files = index.getLanguageFiles('python');
```

### ChangeDetector

```javascript
const { ChangeDetector } = require('./.agents/memory-system/core/change-detector');

const detector = new ChangeDetector(projectRoot);

// Detect changes
const changes = await detector.detectChanges();

// Load change log
const log = detector.loadChangeLog();

// Append entry
detector.appendChangeLog({type: 'manual_scan'});
```

## Contributing

Memory system improvements welcome! Please:

1. Write tests for new features
2. Follow existing code style (Node.js, no external deps)
3. Update this documentation
4. Keep Phase 1 dependency-free

## License

Same as agents-runtime (MIT)
