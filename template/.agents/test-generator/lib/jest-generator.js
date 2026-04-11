"use strict";
/**
 * Jest test template generator
 * Creates Jest unit test files from findings
 */

function generateJestTests(sourceFile, findings) {
  const filename = sourceFile.split("/").pop().replace(/\.(js|ts|jsx|tsx)$/, "");
  const imports = generateImports(sourceFile);

  let testSuite = `${imports}

describe('${filename}', () => {`;

  // Group findings by type
  const byType = {};
  for (const finding of findings) {
    const type = finding.type || "general";
    if (!byType[type]) byType[type] = [];
    byType[type].push(finding);
  }

  // Generate test suites by type
  let testCount = 0;
  for (const [type, typeFindings] of Object.entries(byType)) {
    testSuite += `\n\n  describe('${type}', () => {`;

    for (const finding of typeFindings.slice(0, 3)) {
      testSuite += generateTestCase(finding, testCount++);
    }

    if (typeFindings.length > 3) {
      testSuite += `\n    // TODO: Generate tests for remaining ${typeFindings.length - 3} findings`;
    }

    testSuite += "\n  });";
  }

  testSuite += "\n});";

  return testSuite;
}

function generateImports(sourceFile) {
  const moduleName = sourceFile.split("/").pop().replace(/\.(js|ts|jsx|tsx)$/, "");
  return `const { ${moduleName} } = require("${sourceFile.replace(/\.(js|ts|jsx|tsx)$/, "")}");`;
}

function generateTestCase(finding, index) {
  const testName = finding.message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .substring(0, 50);

  return `
    test('should handle case: ${testName}', () => {
      // Arrange
      const input = {};
      
      // Act
      const result = () => {
        // Call function under test
      };
      
      // Assert
      expect(result).toBeDefined();
      // TODO: Implement actual test assertion
    });`;
}

module.exports = { generateJestTests };
