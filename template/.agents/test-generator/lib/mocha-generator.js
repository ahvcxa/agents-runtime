"use strict";
/**
 * Mocha/Chai test generator
 * Creates Mocha unit test files
 */

function generateMochaTests(sourceFile, findings) {
  const filename = sourceFile.split("/").pop().replace(/\.(js|ts|jsx|tsx)$/, "");
  const imports = `const { expect } = require('chai');
const { ${filename} } = require("${sourceFile.replace(/\.(js|ts|jsx|tsx)$/, "")}");`;

  let testSuite = `${imports}

describe('${filename}', () => {`;

  const byType = {};
  for (const finding of findings) {
    const type = finding.type || "general";
    if (!byType[type]) byType[type] = [];
    byType[type].push(finding);
  }

  let testCount = 0;
  for (const [type, typeFindings] of Object.entries(byType)) {
    testSuite += `\n\n  describe('${type}', () => {`;

    for (const finding of typeFindings.slice(0, 3)) {
      testSuite += generateMochaTestCase(finding, testCount++);
    }

    if (typeFindings.length > 3) {
      testSuite += `\n    // TODO: Generate tests for remaining ${typeFindings.length - 3} findings`;
    }

    testSuite += "\n  });";
  }

  testSuite += "\n});";

  return testSuite;
}

function generateMochaTestCase(finding, index) {
  const testName = finding.message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .substring(0, 50);

  return `
    it('should handle case: ${testName}', () => {
      // Arrange
      const input = {};
      
      // Act
      const result = () => {
        // Call function under test
      };
      
      // Assert
      expect(result).to.be.defined;
      // TODO: Implement actual test assertion
    });`;
}

module.exports = { generateMochaTests };
