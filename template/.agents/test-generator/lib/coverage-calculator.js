"use strict";
/**
 * Coverage calculator
 * Estimates test coverage from findings
 */

function calculateCoverage(findings, generatedTests) {
  if (findings.length === 0) {
    return 0;
  }

  // Base coverage from findings count
  const coveredFindings = Math.min(generatedTests.length, findings.length);
  const baseCoverage = (coveredFindings / findings.length) * 100;

  // Adjust based on test quality
  let quality = 0.8; // Default 80% quality

  // Check for complex findings
  const complexCount = findings.filter(f => 
    f.severity === "HIGH" || f.severity === "CRITICAL"
  ).length;

  if (complexCount > 0) {
    quality = 0.6; // Complex tests need more work
  }

  const estimatedCoverage = Math.round(baseCoverage * quality);

  return Math.min(estimatedCoverage, 95); // Cap at 95%
}

module.exports = { calculateCoverage };
