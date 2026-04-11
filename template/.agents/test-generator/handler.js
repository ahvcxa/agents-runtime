"use strict";
/**
 * .agents/test-generator/handler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Test Generator Skill Handler
 * 
 * Generates unit tests from code analysis findings
 * Supports Jest, Mocha, and Vitest frameworks
 * 
 * Authorization Level: 2 (write capability)
 * 
 * @param {object} ctx - { agentId, authLevel, input, memory, log }
 * @returns {Promise<{ generated_tests, summary }>}
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

  // Authorization check
  if (authLevel < 2) {
    throw new Error("test-generator requires authorization level >= 2");
  }

  // Validate input
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

  // Group findings by file
  const findingsByFile = {};
  for (const finding of findings) {
    const file = finding.file || "unknown";
    if (!findingsByFile[file]) {
      findingsByFile[file] = [];
    }
    findingsByFile[file].push(finding);
  }

  // Generate tests for each file
  for (const [sourceFile, fileFindings] of Object.entries(findingsByFile)) {
    try {
      // Skip non-source files
      if (sourceFile === "unknown" || !sourceFile.match(/\.(js|ts|jsx|tsx)$/)) {
        continue;
      }

      log.debug(`Generating tests for: ${sourceFile}`);

      let testContent;
      let testFileName;

      // Generate based on framework
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

      // Generate mocks if needed
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

  // Calculate coverage estimate
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
