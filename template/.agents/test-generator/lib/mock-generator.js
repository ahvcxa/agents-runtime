"use strict";
/**
 * Mock and stub generator
 * Creates mock objects and test stubs
 */

function generateMocks(sourceFile, findings) {
  const mocks = [];

  // Identify what needs to be mocked based on findings
  for (const finding of findings) {
    if (finding.type === "external-dependency" || finding.message.includes("mock")) {
      mocks.push(generateMock(finding));
    }
  }

  return mocks;
}

function generateMock(finding) {
  const mockName = finding.message
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 30);

  return {
    name: mockName,
    type: "function",
    stub: `const ${mockName}Mock = jest.fn().mockReturnValue({});`
  };
}

module.exports = { generateMocks };
