"use strict";

/**
 * .agents/orchestrator/lib/result-aggregator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregates results from multiple skill executions
 */

const {
  normalizeAndDedupeFindings,
  normalizeSeverity
} = require('./output-projector');

/**
 * Aggregate execution results from all skills
 * @param {object[]} results - Array of skill execution results
 * @returns {object} Aggregated summary
 */
function aggregateResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return createEmptySummary();
  }

  const summary = {
    workflow_status: 'success',
    total_skills_executed: 0,
    total_skills_skipped: 0,
    total_skills_failed: 0,
    total_skills_success: 0,
    total_duration_ms: 0,
    by_status: {
      success: [],
      failed: [],
      skipped: []
    },
    by_skill: {},
    aggregated_findings: [],
    findings_by_severity: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFO: 0
    },
    errors: [],
    warnings: []
  };

  // Process each skill result
  for (const result of results) {
    const { skill_id, status, output, duration_ms, error } = result;

    summary.total_duration_ms += (duration_ms || 0);

    // Track by status
    summary.by_status[status]?.push(skill_id);

    // Detailed skill info
    summary.by_skill[skill_id] = {
      status,
      duration_ms,
      error: error || null
    };

    switch (status) {
      case 'success':
        summary.total_skills_success++;
        aggregateSkillOutput(summary, skill_id, output, result.raw_output);
        break;
      case 'failed':
        summary.total_skills_failed++;
        summary.errors.push({
          skill_id,
          error,
          timestamp: result.executed_at
        });
        break;
      case 'skipped':
        summary.total_skills_skipped++;
        summary.warnings.push({
          skill_id,
          reason: error,
          timestamp: result.executed_at
        });
        break;
    }
  }

  summary.aggregated_findings = normalizeAndDedupeFindings(summary.aggregated_findings);
  summary.findings_by_severity = summarizeSeverity(summary.aggregated_findings);

  summary.total_skills_executed = results.length - summary.total_skills_skipped;

  // Determine workflow status
  if (summary.total_skills_failed === 0 && summary.total_skills_skipped === 0) {
    summary.workflow_status = 'success';
  } else if (summary.total_skills_failed === 0) {
    summary.workflow_status = 'partial';
  } else if (summary.total_skills_success === 0) {
    summary.workflow_status = 'failed';
  } else {
    summary.workflow_status = 'partial';
  }

  return summary;
}

/**
 * Aggregate output from a single skill
 * @param {object} summary - Summary object to update
 * @param {string} skillId - Skill identifier
 * @param {object} output - Skill output
 */
function aggregateSkillOutput(summary, skillId, output, rawOutput) {
  const source = pickBestOutput(output, rawOutput);

  if (!source || typeof source !== 'object') {
    return;
  }

  // Aggregate findings (for analysis and security audit)
  if (Array.isArray(source.findings)) {
    for (const finding of source.findings) {
      const normalizedFinding = {
        ...finding,
        severity: normalizeSeverity(finding?.severity)
      };

      summary.aggregated_findings.push({
        skill: skillId,
        ...normalizedFinding
      });
    }
  }

  // Store skill-specific summary info
  if (source.summary && typeof source.summary === 'object') {
    summary.by_skill[skillId].summary = source.summary;
  }
}

function pickBestOutput(output, rawOutput) {
  if (rawOutput && typeof rawOutput === 'object') {
    return rawOutput;
  }

  if (output && typeof output === 'object') {
    return output;
  }

  return null;
}

function summarizeSeverity(findings) {
  const severityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0
  };

  for (const finding of findings || []) {
    const severity = normalizeSeverity(finding?.severity);
    severityCounts[severity] += 1;
  }

  return severityCounts;
}

/**
 * Create empty summary
 * @returns {object}
 */
function createEmptySummary() {
  return {
    workflow_status: 'success',
    total_skills_executed: 0,
    total_skills_skipped: 0,
    total_skills_failed: 0,
    total_skills_success: 0,
    total_duration_ms: 0,
    by_status: {
      success: [],
      failed: [],
      skipped: []
    },
    by_skill: {},
    aggregated_findings: [],
    findings_by_severity: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFO: 0
    },
    errors: [],
    warnings: []
  };
}

/**
 * Sort findings by severity
 * @param {object[]} findings
 * @returns {object[]}
 */
function sortFindingsBySeverity(findings) {
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

  return findings.sort((a, b) => {
    const orderA = severityOrder[a.severity] ?? 99;
    const orderB = severityOrder[b.severity] ?? 99;
    return orderA - orderB;
  });
}

/**
 * Generate text report
 * @param {object} results - Execution results
 * @param {object} summary - Aggregated summary
 * @returns {string}
 */
function generateTextReport(results, summary) {
  let report = '';

  report += '═══════════════════════════════════════════════════════════\n';
  report += '  ORCHESTRATOR WORKFLOW EXECUTION REPORT\n';
  report += '═══════════════════════════════════════════════════════════\n\n';

  report += `Status: ${summary.workflow_status.toUpperCase()}\n`;
  report += `Total Duration: ${summary.total_duration_ms}ms\n`;
  report += `Skills Executed: ${summary.total_skills_executed}\n`;
  report += `  ✓ Success: ${summary.total_skills_success}\n`;
  report += `  ✗ Failed: ${summary.total_skills_failed}\n`;
  report += `  ⊘ Skipped: ${summary.total_skills_skipped}\n\n`;

  if (Object.keys(summary.by_skill).length > 0) {
    report += '───────────────────────────────────────────────────────────\n';
    report += 'SKILL DETAILS\n';
    report += '───────────────────────────────────────────────────────────\n';

    for (const [skillId, info] of Object.entries(summary.by_skill)) {
      report += `\n${skillId}:\n`;
      report += `  Status: ${info.status}\n`;
      report += `  Duration: ${info.duration_ms}ms\n`;
      if (info.error) {
        report += `  Error: ${info.error}\n`;
      }
      if (info.summary) {
        report += `  Summary: ${JSON.stringify(info.summary).substring(0, 100)}\n`;
      }
    }
  }

  if (summary.aggregated_findings.length > 0) {
    report += '\n───────────────────────────────────────────────────────────\n';
    report += 'FINDINGS\n';
    report += '───────────────────────────────────────────────────────────\n';
    report += `Total: ${summary.aggregated_findings.length}\n`;
    report += `  CRITICAL: ${summary.findings_by_severity.CRITICAL}\n`;
    report += `  HIGH: ${summary.findings_by_severity.HIGH}\n`;
    report += `  MEDIUM: ${summary.findings_by_severity.MEDIUM}\n`;
    report += `  LOW: ${summary.findings_by_severity.LOW}\n`;
    report += `  INFO: ${summary.findings_by_severity.INFO}\n`;
  }

  if (summary.errors.length > 0) {
    report += '\n───────────────────────────────────────────────────────────\n';
    report += 'ERRORS\n';
    report += '───────────────────────────────────────────────────────────\n';
    for (const err of summary.errors) {
      report += `\n${err.skill_id}: ${err.error}\n`;
    }
  }

  report += '\n═══════════════════════════════════════════════════════════\n';

  return report;
}

module.exports = {
  aggregateResults,
  aggregateSkillOutput,
  sortFindingsBySeverity,
  generateTextReport,
  createEmptySummary,
  summarizeSeverity,
  pickBestOutput
};
