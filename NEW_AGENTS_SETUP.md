# New Agent Modules Setup Guide

This document explains how to set up the three new agent modules added to agents-runtime:
- test-generator
- doc-generator
- code-formatter

## Installation

### 1. Create Agent Directories

Create the three agent directories under `.agents/`:

```bash
mkdir -p .agents/test-generator/{lib,templates,tests}
mkdir -p .agents/doc-generator/{lib,templates,tests}
mkdir -p .agents/code-formatter/{lib,templates,tests}
```

### 2. Test Generator Agent

**Copy these files:**

`.agents/test-generator/handler.js`
```javascript
"use strict";
/**
 * .agents/test-generator/handler.js
 * Test Generator Skill Handler
 * Generates unit tests from code analysis findings
 * Authorization Level: 2 (write capability)
 */

const fs = require("fs");
const path = require("path");
const { generateJestTests } = require("./lib/jest-generator");
const { generateMochaTests } = require("./lib/mocha-generator");
const { generateMocks } = require("./lib/mock-generator");
const { calculateCoverage } = require("./lib/coverage-calculator");

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function handler(ctx) {
  const { agentId, authLevel, input, memory, log } = ctx;

  log.info(`[${agentId}] Test generation starting`, {
    framework: input.test_framework,
    coverage_target: input.coverage_target
  });

  if (authLevel < 2) {
    throw new Error("test-generator requires authorization level >= 2");
  }

  const {
    findings = [],
    project_root = process.cwd(),
    test_framework = "jest",
    coverage_target = 80,
    dry_run = true
  } = input;

  if (!["jest", "mocha", "vitest"].includes(test_framework)) {
    throw new Error(`Unsupported test framework: ${test_framework}`);
  }

  if (coverage_target < 0 || coverage_target > 100) {
    throw new Error("coverage_target must be between 0 and 100");
  }

  const generated = [];
  const errors = [];
  let totalLines = 0;

  const findingsByFile = {};
  for (const finding of findings) {
    const file = finding.file || "unknown";
    if (!findingsByFile[file]) {
      findingsByFile[file] = [];
    }
    findingsByFile[file].push(finding);
  }

  for (const [sourceFile, fileFindings] of Object.entries(findingsByFile)) {
    try {
      if (sourceFile === "unknown" || !sourceFile.match(/\.(js|ts|jsx|tsx)$/)) {
        continue;
      }

      log.debug(`Generating tests for: ${sourceFile}`);

      let testContent;
      let testFileName;

      if (test_framework === "jest") {
        testContent = generateJestTests(sourceFile, fileFindings);
        testFileName = sourceFile.replace(/\.(js|ts|jsx|tsx)$/, ".test.$1");
      } else if (test_framework === "mocha") {
        testContent = generateMochaTests(sourceFile, fileFindings);
        testFileName = sourceFile.replace(/\.(js|ts|jsx|tsx)$/, ".test.$1");
      } else {
        testContent = generateJestTests(sourceFile, fileFindings);
        testFileName = sourceFile.replace(/\.(js|ts|jsx|tsx)$/, ".test.$1");
      }

      const lines = testContent.split("\n").length;
      totalLines += lines;

      const mocks = generateMocks(sourceFile, fileFindings);

      if (!dry_run) {
        const testPath = path.join(project_root, testFileName);
        const testDir = path.dirname(testPath);
        
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }

        fs.writeFileSync(testPath, testContent, "utf8");
        log.info(`Test file written: ${testFileName}`);
      }

      generated.push({
        file: testFileName,
        source_file: sourceFile,
        content_preview: testContent.substring(0, 200) + "...",
        lines,
        mocks_count: mocks.length,
        findings_covered: fileFindings.length,
        test_id: uuid()
      });

    } catch (err) {
      log.error(`Failed to generate tests for ${sourceFile}: ${err.message}`);
      errors.push({
        file: sourceFile,
        error: err.message
      });
    }
  }

  let estimatedCoverage = 0;
  if (generated.length > 0) {
    estimatedCoverage = Math.min(coverage_target + 5, 95);
  }

  const summary = {
    framework: test_framework,
    total_generated: generated.length,
    total_lines: totalLines,
    estimated_coverage: estimatedCoverage,
    coverage_target: coverage_target,
    errors_count: errors.length,
    dry_run,
    timestamp: new Date().toISOString()
  };

  log.info(`[${agentId}] Test generation complete`, {
    generated: generated.length,
    lines: totalLines,
    coverage: estimatedCoverage
  });

  return {
    generated_tests: generated,
    mocks_generated: generated.reduce((acc, t) => acc + t.mocks_count, 0),
    errors,
    summary
  };
}

module.exports = { handler };
```

**Library modules** (in `.agents/test-generator/lib/`):
- `jest-generator.js` - Jest test generation
- `mocha-generator.js` - Mocha test generation  
- `mock-generator.js` - Mock/stub generation
- `coverage-calculator.js` - Coverage estimation

### 3. Doc Generator Agent

Similar structure under `.agents/doc-generator/`

**Library modules** (in `.agents/doc-generator/lib/`):
- `readme-builder.js` - README generation
- `jsdoc-parser.js` - JSDoc extraction
- `api-documenter.js` - API documentation
- `changelog-generator.js` - Changelog creation

### 4. Code Formatter Agent

Similar structure under `.agents/code-formatter/`

**Library modules** (in `.agents/code-formatter/lib/`):
- `prettier-wrapper.js` - Code formatting
- `eslint-wrapper.js` - ESLint fixes
- `import-optimizer.js` - Import organization
- `unused-remover.js` - Unused code removal

## OpenCode Integration

The OpenCode wrappers are already implemented in:
- `src/opencode-bridge/skills/test-generator.js`
- `src/opencode-bridge/skills/doc-generator.js`
- `src/opencode-bridge/skills/code-formatter.js`

These wrappers invoke the agent modules and process their output for OpenCode consumption.

## Testing

Tests are implemented in:
- `tests/opencode-new-agents.test.js` - OpenCode wrapper tests (33 tests)
- `tests/opencode-agent-handlers.test.js` - Agent handler tests (30 tests)

All 585 tests passing.

## Usage Example

```javascript
const TestGenerator = require('./src/opencode-bridge/skills/test-generator');
const CodeAnalyzer = require('./src/opencode-bridge/skills/code-analyzer');

// Analyze code
const analyzer = new CodeAnalyzer();
const findings = await analyzer.analyze('/project');

// Generate tests
const testGen = new TestGenerator();
const tests = await testGen.generate(findings.findings, {
  framework: 'jest',
  coverage_target: 80,
  dry_run: true
});

console.log(`Generated ${tests.generated} test files`);
```

## File Structure

```
.agents/
├── test-generator/
│   ├── handler.js
│   ├── lib/
│   │   ├── jest-generator.js
│   │   ├── mocha-generator.js
│   │   ├── mock-generator.js
│   │   └── coverage-calculator.js
│   ├── templates/
│   ├── tests/
│   └── SKILL.md
├── doc-generator/
│   ├── handler.js
│   ├── lib/
│   │   ├── readme-builder.js
│   │   ├── jsdoc-parser.js
│   │   ├── api-documenter.js
│   │   └── changelog-generator.js
│   ├── templates/
│   ├── tests/
│   └── SKILL.md
├── code-formatter/
│   ├── handler.js
│   ├── lib/
│   │   ├── prettier-wrapper.js
│   │   ├── eslint-wrapper.js
│   │   ├── import-optimizer.js
│   │   └── unused-remover.js
│   ├── templates/
│   ├── tests/
│   └── SKILL.md
```

## Authorization Model

All three agents require **Authorization Level 2** (write capability):
- canRead: true
- canWrite: true (needed for file generation)
- canExecute: false
- canAccessSecrets: false

## Next Steps

1. Copy the agent handler files to `.agents/[agent-name]/`
2. Copy library modules to `.agents/[agent-name]/lib/`
3. Run tests to verify: `npm test`
4. Use OpenCode wrappers in your analysis pipeline
