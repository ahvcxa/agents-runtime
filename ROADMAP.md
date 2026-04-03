# Technical Roadmap: agents-runtime v1.3.0+
## Professional Development Plan

**Planning Date:** April 4, 2026  
**Vision:** Transform from good-quality to enterprise-grade codebase  
**Timeline:** 3 sprints (3-4 weeks)

---

## Strategic Context

After completing 5 phases of refactoring (security fixes, DRY consolidation, modularization), the codebase has achieved:
- ✅ **0 CRITICAL security vulnerabilities**
- ✅ **25% reduction in code quality findings** (28 → 21)
- ✅ **100% test pass rate** (39/39)
- ✅ **Professional modular architecture**

However, 3 architectural gaps remain that block production deployment and limit scalability:

1. **Performance:** Synchronous execution blocks concurrent agents
2. **Isolation:** No true sandboxing (Docker/WASM) for untrusted code
3. **Analysis Depth:** Regex-based analysis misses complex vulnerabilities

This roadmap addresses all three with professional, phased approach.

---

## Phase 6: HIGH-Priority Code Quality Fixes

### Duration: 2-4 hours
### Goal: Eliminate all HIGH-severity findings
### Status: PENDING

---

### 6.1: Fix File Driver Race Condition
**File:** `src/memory/drivers/file-driver.js:71-80`  
**CWE:** CWE-362 (Concurrent Execution)  
**Current Risk:** Data loss if operations execute before `_load()` completes

#### Current Code
```javascript
class FileMemoryDriver {
  upsert(key, value) {
    this._ensureReady().catch(() => {});  // ❌ Fire-and-forget
    this.data.set(key, value);             // May execute before load!
  }
}
```

#### After Fix
```javascript
class FileMemoryDriver {
  async upsert(key, value) {
    await this._ensureReady();  // ✅ Proper async/await
    this.data.set(key, value);
    await this.flush();
  }
}
```

#### Changes Required
- [ ] Make `upsert()` async
- [ ] Make `get()` async
- [ ] Make `delete()` async
- [ ] Update all callers in `memory-store.js`
- [ ] Update tests in `tests/memory-store.test.js`
- [ ] Verify no race conditions in concurrent access

#### Test Plan
```bash
npm test -- --testNamePattern="FileMemoryDriver"
# Verify async operations serialize correctly
```

#### Effort: 1 hour

---

### 6.2: Extract Semantic Memory into Separate Class
**File:** `src/memory/memory-store.js:1-200`  
**Principle:** SOLID - Single Responsibility  
**Current Problem:** MemoryStoreClient has 4 distinct responsibilities mixed

#### Current Structure
```javascript
class MemoryStoreClient {
  // Responsibility 1: Core persistence API
  get(key) { ... }
  set(key, value) { ... }
  delete(key) { ... }
  
  // Responsibility 2: Semantic search
  semanticSearch(query, maxResults) { ... }
  
  // Responsibility 3: Access control
  _assertAuthLevel(key, operation) { ... }
  
  // Responsibility 4: Event logging
  _trackOperation(operation, key) { ... }
}
```

#### After Fix
```javascript
// New: src/memory/semantic-memory.js
class SemanticMemoryClient {
  constructor(embeddingsModel) {
    this.model = embeddingsModel;
  }
  
  async search(query, maxResults = 5) { ... }
  updateIndex(key, value) { ... }
}

// Refactored: src/memory/memory-store.js
class MemoryStoreClient {
  constructor(driver, semanticMemory, authManager) {
    this.driver = driver;
    this.semantic = semanticMemory;  // Injected dependency
    this.auth = authManager;
  }
  
  get(key) { ... }
  set(key, value) { ... }
  // No mixed concerns
}
```

#### Changes Required
- [ ] Create `src/memory/semantic-memory.js` class
- [ ] Create `src/memory/auth-manager.js` class (extract access control)
- [ ] Refactor `MemoryStoreClient` constructor for DI
- [ ] Update `createMemoryStore()` factory to wire dependencies
- [ ] Update `tests/memory-store.test.js` with mocks
- [ ] Verify 39/39 tests pass

#### Test Plan
```bash
npm test
# Verify no regression in memory operations
```

#### Effort: 2 hours

---

### 6.3: Decompose Agent Runner Execution Method
**File:** `src/agent-runner.js:178-246`  
**Principle:** Cyclomatic Complexity (CC=13 → target < 10)  
**Current Problem:** Too many nested if/try-catch branches

#### Current Code (Simplified)
```javascript
async _executeSkill(skill, agent, context) {
  if (skill.executor === 'python') {
    if (!skill.source) {
      // validation...
    }
    const analyzer = await this.registry.load(skill.analyzer);
    if (!analyzer) {
      // error handling...
    }
    try {
      // complex execution...
    } catch (err) {
      // error handling...
    }
  } else if (skill.executor === 'javascript') {
    // another branch...
  } else if (skill.executor === 'external') {
    // yet another branch...
  }
  // Event logging...
}
```

#### After Fix
```javascript
async _executeSkill(skill, agent, context) {
  const handler = this._getExecutionHandler(skill.executor);
  return handler.execute(skill, agent, context);
}

async _getExecutionHandler(executor) {
  switch (executor) {
    case 'python': return new PythonExecutor(this.registry);
    case 'javascript': return new JavaScriptExecutor();
    case 'external': return new ExternalExecutor();
    default: throw new Error(`Unknown executor: ${executor}`);
  }
}
```

#### Changes Required
- [ ] Create `src/executors/python-executor.js` class
- [ ] Create `src/executors/javascript-executor.js` class
- [ ] Create `src/executors/external-executor.js` class
- [ ] Define `IExecutor` interface (JSDoc)
- [ ] Refactor `_executeSkill()` to use handler pattern
- [ ] Move error handling into executor classes
- [ ] Update `agent-runner.test.js` to mock executors
- [ ] Verify 39/39 tests pass

#### Test Plan
```bash
npm test -- --testNamePattern="AgentRunner"
# Verify no regression in skill execution
```

#### Effort: 1.5 hours

---

### 6.4: Simplify MCP Server Compliance Check
**File:** `src/mcp/mcp-server.js:154-229`  
**Principle:** Cyclomatic Complexity (CC=12 → target < 10)  
**Current Problem:** 6+ nested if-else validation chains

#### Current Code (Simplified)
```javascript
const complianceCheckTool = {
  async execute(params) {
    if (!params.agentId) { 
      throw new Error('agentId required'); 
    }
    const agent = await this.agents.get(params.agentId);
    if (!agent) { 
      throw new Error('Agent not found'); 
    }
    if (agent.state === 'suspended') { 
      throw new Error('Agent is suspended'); 
    }
    if (!agent.manifest) { 
      throw new Error('Manifest missing'); 
    }
    // ... 10+ more conditions
  }
};
```

#### After Fix
```javascript
class ComplianceValidator {
  async validate(agentId, agents) {
    this._validateAgentId(agentId);
    const agent = await agents.get(agentId);
    this._validateAgentExists(agent);
    this._validateAgentState(agent);
    this._validateManifest(agent.manifest);
    return { compliant: true, agent };
  }
  
  _validateAgentId(agentId) {
    if (!agentId) throw new Error('agentId required');
  }
  
  _validateAgentState(agent) {
    if (agent.state === 'suspended') 
      throw new Error('Agent is suspended');
  }
  // ... more simple validators
}
```

#### Changes Required
- [ ] Create `src/mcp/validators/compliance-validator.js` class
- [ ] Break validation logic into single-check methods
- [ ] Simplify `complianceCheckTool.execute()` to use validator
- [ ] Update `mcp-server.test.js` with validator tests
- [ ] Verify 39/39 tests pass

#### Test Plan
```bash
npm test -- --testNamePattern="complianceCheckTool"
# Verify all validation paths work correctly
```

#### Effort: 1.5 hours

---

### Phase 6 Summary

| Task | Effort | Risk | Impact |
|------|--------|------|--------|
| Fix race condition | 1h | LOW | CRITICAL |
| Extract semantic memory | 2h | MEDIUM | HIGH |
| Decompose _executeSkill | 1.5h | MEDIUM | HIGH |
| Simplify compliance_check | 1.5h | LOW | MEDIUM |
| **Total** | **6h** | - | - |

**Minimum Viable Phase 6:** Race condition + _executeSkill (2.5h)

**Success Criteria:**
- ✅ 39/39 tests pass
- ✅ All HIGH findings eliminated
- ✅ Average CC < 15 per module
- ✅ 0 race condition warnings

---

## Phase 7: Auto-Fixable + MEDIUM-Priority Issues

### Duration: 2-3 hours
### Goal: Reduce remaining findings to < 10
### Status: PENDING

---

### 7.1: Apply 5 Auto-Fixable Changes (30 minutes)

#### 7.1a: Extract AGENT_ID_PATTERN
**File:** `src/mcp/mcp-server.js:172`

```javascript
// Before
if (!/^[a-z0-9_-]{3,}$/.test(params.agentId)) { ... }

// After
const AGENT_ID_PATTERN = /^[a-z0-9_-]{3,}$/;
if (!AGENT_ID_PATTERN.test(params.agentId)) { ... }
```

**Changes:**
- [ ] Add constant at module level
- [ ] Replace inline regex
- [ ] Update `mcp-server.test.js` if needed

---

#### 7.1b: Extract ANSI_COLORS
**File:** `src/telemetry/logger.js:81`

```javascript
// Before
const colors = { red: '\x1b[31m', yellow: '\x1b[33m', /* ... */ };

// After
const ANSI_COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};
```

**Changes:**
- [ ] Extract to module-level constant
- [ ] Replace all references
- [ ] Add JSDoc with ANSI code reference

---

#### 7.1c: Extract EXPORT_NAMES_MAP
**File:** `src/registry/hook-registry.js:99`

```javascript
// Before
if (!['pre-execute', 'post-execute', 'pre-network'].includes(name)) { ... }

// After
const EXPORT_NAMES_MAP = {
  'pre-execute': true,
  'post-execute': true,
  'pre-network': true,
};
if (!EXPORT_NAMES_MAP[name]) { ... }
```

**Changes:**
- [ ] Create mapping object
- [ ] Replace array lookup (O(n) → O(1))
- [ ] Add JSDoc with valid export names

---

#### 7.1d: Extract detectDuplicateValues Function
**File:** `src/analyzers/py-dry-analyzer.js:19`

```javascript
// New utility function
function detectDuplicateValues(items, threshold = 2) {
  const seen = new Map();
  
  items.forEach(item => {
    seen.set(item, (seen.get(item) || 0) + 1);
  });
  
  return Array.from(seen.entries())
    .filter(([_, count]) => count >= threshold)
    .map(([item, _]) => item);
}

// Usage
const duplicates = detectDuplicateValues(magicNumbers);
```

**Changes:**
- [ ] Create shared function in `py-common.js`
- [ ] Replace inline logic in py-dry-analyzer.js
- [ ] Add JSDoc with examples

---

#### 7.1e: Add Fallback UUID Generation
**File:** `src/events/event-bus.js:13`

```javascript
// Before
const uuid = () => randomUUID();

// After
const uuid = () => {
  try {
    return randomUUID();
  } catch {
    // Fallback if crypto module unavailable
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2);
    return `${timestamp}-${random}`;
  }
};
```

**Changes:**
- [ ] Add error handling wrapper
- [ ] Document fallback behavior
- [ ] Verify backwards compatibility

---

### 7.2: Fix Medium-Priority Security Issues (1 hour)

#### 7.2a: Fix Query Injection in semanticSearch
**File:** `src/memory/memory-store.js:167`

```javascript
// Before
async semanticSearch(query, maxResults = 5) {
  // No input validation!
  const embedding = await this.semantic.embed(query);
  // ...
}

// After
async semanticSearch(query, maxResults = 5) {
  // Validate input
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Query must be non-empty string');
  }
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
    throw new Error('maxResults must be integer between 1-100');
  }
  
  const embedding = await this.semantic.embed(query);
  // ...
}
```

**Changes:**
- [ ] Add input validation
- [ ] Document parameter constraints
- [ ] Add test cases for invalid input

---

#### 7.2b: Add Null Validation in Network Code
**File:** `src/agent-runner.js:187`

```javascript
// Before
const response = await fetch(context.networkRequest.url);

// After
async _executeNetworkSkill(skill, context) {
  const url = context.networkRequest?.url;
  
  if (!url || typeof url !== 'string') {
    throw new Error('Network request URL is required and must be string');
  }
  
  // Additional validation
  try {
    new URL(url);  // Validate it's a valid URL
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }
  
  const response = await fetch(url);
  return response;
}
```

**Changes:**
- [ ] Add null checks
- [ ] Add URL format validation
- [ ] Add test cases

---

#### 7.2c: Add Docker Path Validation
**File:** `src/sandbox/executor.js:50`

```javascript
// Before
const dockerPath = config.dockerPath || '/usr/bin/docker';
const container = spawn(dockerPath, ['run', image, command]);

// After
const ALLOWED_DOCKER_PATHS = [
  '/usr/bin/docker',
  '/usr/local/bin/docker',
  '/opt/docker/bin/docker',
];

function validateDockerPath(path) {
  if (!ALLOWED_DOCKER_PATHS.includes(path)) {
    throw new Error(`Docker path not in whitelist: ${path}`);
  }
  return path;
}

const dockerPath = validateDockerPath(config.dockerPath || '/usr/bin/docker');
```

**Changes:**
- [ ] Create whitelist of allowed paths
- [ ] Validate config during initialization
- [ ] Document security decision

---

### 7.3: Fix Logger Stack Overflow (30 minutes)

**File:** `src/telemetry/logger.js:18`

```javascript
// Before
function redact(obj, path = '') {
  if (typeof obj === 'object') {
    for (const key in obj) {
      redact(obj[key], `${path}.${key}`);  // ❌ Infinite recursion possible
    }
  }
}

// After
function redact(obj, path = '', maxDepth = 10, currentDepth = 0) {
  if (currentDepth >= maxDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }
  
  if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      redact(obj[key], `${path}.${key}`, maxDepth, currentDepth + 1);
    }
  }
}
```

**Changes:**
- [ ] Add depth tracking
- [ ] Add maxDepth parameter
- [ ] Add test for circular references

---

### Phase 7 Summary

| Task | Effort | Impact |
|------|--------|--------|
| 5 auto-fixable changes | 30m | LOW (code quality) |
| Query injection fix | 30m | MEDIUM (security) |
| Null validation | 15m | MEDIUM (robustness) |
| Docker path whitelist | 30m | MEDIUM (security) |
| Logger stack overflow | 30m | MEDIUM (stability) |
| **Total** | **2.5h** | - |

**Success Criteria:**
- ✅ 39/39 tests pass
- ✅ 5 auto-fixable findings eliminated
- ✅ 5 MEDIUM security issues fixed
- ✅ Remaining findings < 10

---

## Phase 8: Strategic Architectural Improvements

### Duration: 4-5 hours (can be split across sprints)
### Goal: Address performance, isolation, and analysis depth gaps
### Status: PENDING (Future roadmap items)

---

### 8a: Performance — execFileSync → Async Spawn

**Priority:** HIGH  
**Effort:** 2-3 hours  
**Impact:** 10x+ concurrent agent execution

#### Problem
Current `agent-runner.js` uses synchronous `execFileSync()`, blocking the event loop. Limits to ~3 concurrent agents before timeouts.

#### Solution
Replace with async `spawn()` for non-blocking execution:

```javascript
// Before
const { execFileSync } = require('child_process');

const result = execFileSync('python3', [script], { 
  timeout: 30000 
});

// After
const { spawn } = require('child_process');

async function executeFile(command, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Execution timeout'));
    }, timeout);
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, code });
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });
  });
}
```

#### Changes Required
- [ ] Replace `execFileSync` with async wrapper
- [ ] Update `_executeSkill()` to await spawn
- [ ] Refactor test timeouts (sync → async)
- [ ] Add concurrent execution tests
- [ ] Benchmark: measure throughput improvement

#### Test Plan
```bash
# Run 10 agents concurrently
npm test -- --testNamePattern="ConcurrentExecution"
# Measure execution time vs baseline
```

#### Effort: 2-3 hours

---

### 8b: Isolation — Docker/WASM Sandboxing

**Priority:** HIGH (prod requirement)  
**Effort:** 8-12 hours (future sprint)  
**Impact:** Enterprise-grade security for untrusted code

#### Problem
Current sandbox (`src/sandbox/executor.js`) is process-level only:
- Agents can access host filesystem
- Can consume unlimited CPU/RAM
- Network access not properly isolated
- No container-level security policies

#### Solution
Implement real Docker + WASM fallback:

```javascript
// src/sandbox/docker-executor.js
class DockerExecutor {
  async execute(code, timeout = 30000) {
    const container = await docker.createContainer({
      Image: 'agents-runtime:latest',
      Cmd: ['node', '-e', code],
      Memory: 512 * 1024 * 1024,  // 512MB limit
      MemorySwap: 512 * 1024 * 1024,
      CpuShares: 1024,
      ReadonlyRootfs: true,
      NetworkDisabled: true,
    });
    
    await container.start();
    const result = await container.wait();
    await container.remove();
    return result;
  }
}

// Fallback for environments without Docker
class WasmExecutor {
  async execute(code, timeout = 30000) {
    // WASM-based sandboxing using @wasmer/wasm-transformer
    // ...
  }
}
```

#### Changes Required
- [ ] Create `src/sandbox/docker-executor.js`
- [ ] Create `src/sandbox/wasm-executor.js` (optional)
- [ ] Update `executor.js` factory to choose executor
- [ ] Add Docker Compose for development
- [ ] Create Docker image with Node.js + analyzer stack
- [ ] Add orchestration for container lifecycle
- [ ] Document security policies

#### Infrastructure Requirements
- Docker daemon running
- Pre-built `agents-runtime:latest` image
- Container registry (optional)
- Resource limits enforced

#### Test Plan
```bash
docker-compose up -d
npm test -- --testNamePattern="DockerExecutor"
# Verify sandbox isolation, resource limits
```

#### Effort: 8-12 hours

---

### 8c: Analysis Depth — AST-based Python Analysis

**Priority:** HIGH (security)  
**Effort:** 3-4 hours  
**Impact:** Catch taint-flow vulnerabilities, control-flow issues

#### Problem
Current `python-analyzer.js` uses regex patterns. Misses:
- Variable taint tracking (data flow)
- Control flow analysis (unreachable code)
- Type inference vulnerabilities
- Complex injection vectors

#### Solution
Use real Python AST parser via subprocess:

```javascript
// src/analyzers/python-ast-analyzer.js
const { spawn } = require('child_process');

async function analyzePythonAST(code) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', ['-c', `
import ast
import json
import sys

try:
  tree = ast.parse(sys.stdin.read())
  print(json.dumps({
    'ast': ast.dump(tree),
    'functions': [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)],
    'variables': [node.id for node in ast.walk(tree) if isinstance(node, ast.Name)],
    'imports': [node.module for node in ast.walk(tree) if isinstance(node, ast.Import)],
  }))
except SyntaxError as e:
  print(json.dumps({'error': str(e)}))
`]);
    
    let output = '';
    python.stdout.on('data', (data) => {
      output += data;
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        resolve(JSON.parse(output));
      } else {
        reject(new Error('AST parsing failed'));
      }
    });
    
    python.stdin.write(code);
    python.stdin.end();
  });
}

async function performTaintAnalysis(ast, entryPoints) {
  // Walk AST, track variable sources, sinks, flows
  const sources = extractSources(ast);       // Input vectors
  const sinks = extractSinks(ast);           // Dangerous operations
  const flows = computeDataFlow(ast);        // Variable usage paths
  
  return validateFlows(sources, sinks, flows);
}
```

#### Changes Required
- [ ] Create `src/analyzers/python-ast-analyzer.js`
- [ ] Add taint analysis module (`taint-analyzer.js`)
- [ ] Update `python-analyzer.js` to use AST as primary source
- [ ] Add data-flow visualization
- [ ] Document AST structure for developers
- [ ] Add test cases with known vulnerabilities

#### Alternative: Node.js Binding
If subprocess calls are too slow, use `@python/core` or similar binding:
```bash
npm install python-core
```

#### Test Plan
```bash
npm test -- --testNamePattern="PythonASTAnalyzer"
# Verify AST parsing, taint analysis on vulnerable code samples
```

#### Effort: 3-4 hours

---

### Phase 8 Summary

| Task | Effort | Priority | Impact |
|------|--------|----------|--------|
| Async spawn | 2-3h | HIGH | 10x scalability |
| Docker/WASM | 8-12h | HIGH | Enterprise security |
| AST analysis | 3-4h | HIGH | Deeper vulnerability detection |
| **Total** | **13-19h** | - | - |

**Recommended Sequencing:**
1. **Sprint 1:** 8a (async spawn)
2. **Sprint 2:** 8c (AST analysis)
3. **Sprint 3+:** 8b (Docker/WASM, can be parallelized)

---

## Overall Roadmap Timeline

```
Current (DONE)
├─ Phase 1: Security fixes
├─ Phase 2: DRY consolidation
├─ Phase 3: Python-analyzer decomposition
├─ Phase 4: MCP-server extraction
└─ Phase 5: Memory-store modularization

Week 1 (NEXT)
├─ Phase 6: HIGH-priority fixes (2-4 hours)
│  ├─ Race condition in file-driver
│  ├─ SRP in memory-store
│  ├─ Complexity in _executeSkill
│  └─ Complexity in compliance_check
└─ Phase 7: Auto-fixable + MEDIUM issues (2-3 hours)
   ├─ 5 auto-fixable constants
   └─ 5 security/stability fixes

Week 2-3
├─ Phase 8a: Async spawn (2-3 hours)
│  └─ 10x concurrent agents
├─ Phase 8c: AST analysis (3-4 hours)
│  └─ Taint flow detection
└─ Phase 8b: Docker/WASM (8-12 hours, next sprint)
   └─ Enterprise-grade isolation

Target State (v1.3.0+)
├─ 0 HIGH findings
├─ < 5 MEDIUM findings remaining
├─ 100% async/await (no execFileSync)
├─ Real Docker sandboxing
├─ AST-based Python analysis
└─ 10x+ concurrent agent execution
```

---

## Success Metrics

### Code Quality
- [ ] Total findings: 21 → < 10 (52% improvement)
- [ ] CRITICAL: 0 → 0 (maintained)
- [ ] HIGH: 4 → 0 (eliminated)
- [ ] Auto-fixable: 5 → 0 (applied)

### Performance
- [ ] Concurrent agent throughput: 3 → 30+ agents/sec
- [ ] Event loop blocking: eliminated
- [ ] P99 latency: < 100ms

### Security
- [ ] All CWE vulnerabilities mitigated
- [ ] Docker isolation enforced
- [ ] Taint analysis enabled

### Testing
- [ ] Test suites: 39/39 passing
- [ ] Code coverage: > 80%
- [ ] Regression tests: all green

---

## Effort Estimates

| Phase | Estimate | Risk | Can Parallelize |
|-------|----------|------|-----------------|
| Phase 6 | 2-4h | MEDIUM | Partly |
| Phase 7 | 2-3h | LOW | Yes |
| Phase 8a | 2-3h | MEDIUM | No |
| Phase 8c | 3-4h | MEDIUM | Yes |
| Phase 8b | 8-12h | HIGH | No |
| **Total** | **17-26h** | - | - |

**Recommended Allocation:**
- **Sprint 1:** Phase 6 + 7 (4-7h)
- **Sprint 2:** Phase 8a + 8c (5-7h)
- **Sprint 3:** Phase 8b (8-12h) or defer to next quarter

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Async refactoring breaks tests | MEDIUM | HIGH | Run full test suite after each change |
| Docker setup issues | MEDIUM | MEDIUM | Develop in container, CI/CD integration |
| Python subprocess overhead | LOW | MEDIUM | Benchmark, consider caching AST results |
| Memory leaks in concurrent execution | LOW | HIGH | Memory profiling, stress tests (100+ agents) |

---

## Dependencies & Prerequisites

### Phase 6-7
- Node.js 18.x+ (already satisfied)
- npm packages (no new deps)
- No infrastructure changes

### Phase 8a (Async Spawn)
- Node.js 18.x+ (already satisfied)
- No new dependencies

### Phase 8c (AST Analysis)
- Python 3.8+
- No new Node.js deps
- Option: Add `python-core` binding (3-4h faster than subprocess)

### Phase 8b (Docker/WASM)
- Docker daemon (production requirement)
- Dockerfile (to be created)
- Optional: `@wasmer/wasm-transformer` (WASM fallback)
- Kubernetes (for orchestration, optional)

---

## GitOps Strategy

Each phase will be a separate commit:

```bash
# Phase 6
git commit -m "refactor: fix high-priority code quality issues (race conditions, SRP, complexity)"

# Phase 7
git commit -m "refactor: apply auto-fixable changes and fix medium-priority issues"

# Phase 8a
git commit -m "refactor: replace execFileSync with async spawn for concurrent execution"

# Phase 8c
git commit -m "refactor: implement AST-based Python analysis with taint flow detection"

# Phase 8b (future)
git commit -m "feat: add Docker/WASM sandboxing for untrusted code execution"
```

---

## Approval & Sign-Off

This roadmap outlines professional, systematic improvements to agents-runtime.

**Next Step:** Execute Phase 6-7 (4-7 hours) to achieve production readiness baseline.

---

**Document Version:** 1.0  
**Last Updated:** 2026-04-04  
**Owner:** Orchestrator (Authorization Level 3)  
**Review Cycle:** Weekly (adjust as needed)
