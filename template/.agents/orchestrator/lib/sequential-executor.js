"use strict";

/**
 * .agents/orchestrator/lib/sequential-executor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sequential execution of skills with dependency chain handling
 */

const { executeSkill: runSkill } = require('./skill-runner');
const { evaluateCondition } = require('./condition-evaluator');
const { applyOutputProjection } = require('./output-projector');

/**
 * Execute skills sequentially with dependency handling
 * @param {string[]} orderedSkills - Topologically sorted skills
 * @param {object} dependencies - { skillId: [deps] }
 * @param {object} input - Input parameters
 * @param {object} ctx - Agent context { agentId, authLevel, memory, log }
 * @param {number} timeoutPerSkill - Timeout in ms
 * @param {boolean} skipOnError - Continue on error flag
 * @param {object} options
 * @returns {Promise<object[]>} Results array
 */
async function executeSequential(orderedSkills, dependencies, input, ctx, timeoutPerSkill, skipOnError = true, options = {}) {
  const { log } = ctx;
  const {
    retryPolicy,
    conditions = {},
    outputProjection = null,
    onProgress
  } = options;

  const workflowId = input.workflow_id || `wf-${Date.now()}`;
  const results = [];
  const resultsBySkill = {};

  log({
    event_type: 'INFO',
    message: `[orchestrator] Sequential execution: ${orderedSkills.length} skill(s)`,
    workflow_id: workflowId,
    skip_on_error: skipOnError
  });

  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  for (let idx = 0; idx < orderedSkills.length; idx++) {
    const skillId = orderedSkills[idx];
    const deps = dependencies[skillId] || [];
    const skillNumber = idx + 1;

    // Check if dependencies are satisfied
    const unsatisfiedDeps = deps.filter(dep => {
      const depResult = resultsBySkill[dep];
      return !depResult || depResult.status !== 'success';
    });

    if (unsatisfiedDeps.length > 0) {
      log({
        event_type: 'WARN',
        message: `[orchestrator] Skipping skill ${skillId} - unsatisfied dependencies: ${unsatisfiedDeps.join(', ')}`,
        skill_number: skillNumber
      });

      const skippedResult = {
        skill_id: skillId,
        status: 'skipped',
        output: null,
        raw_output: null,
        duration_ms: 0,
        error: `Unsatisfied dependencies: ${unsatisfiedDeps.join(', ')}`,
        executed_at: new Date().toISOString(),
        attempt_count: 0,
        retried: false,
        last_error_kind: null
      };

      results.push(skippedResult);
      resultsBySkill[skillId] = skippedResult;

      if (typeof onProgress === 'function') {
        onProgress(skippedResult);
      }
      continue;
    }

    const conditionContext = buildConditionContext(input, resultsBySkill);
    const conditionResult = evaluateCondition(conditions[skillId], conditionContext);
    if (!conditionResult.passed) {
      const skippedByCondition = {
        skill_id: skillId,
        status: 'skipped',
        output: null,
        raw_output: null,
        duration_ms: 0,
        error: `Condition not met: ${conditionResult.reason}`,
        executed_at: new Date().toISOString(),
        attempt_count: 0,
        retried: false,
        last_error_kind: null
      };

      results.push(skippedByCondition);
      resultsBySkill[skillId] = skippedByCondition;

      log({
        event_type: 'INFO',
        message: `[orchestrator] Skipping skill ${skillId} due to condition`,
        workflow_id: workflowId
      });

      if (typeof onProgress === 'function') {
        onProgress(skippedByCondition);
      }

      continue;
    }

    log({
      event_type: 'INFO',
      message: `[orchestrator] Executing skill ${skillNumber}/${orderedSkills.length}: ${skillId}`,
      workflow_id: workflowId
    });

    // Build skill input with previous results
    const skillInput = buildSkillInput(skillId, input, resultsBySkill);

    const result = await runSkill({
      skillId,
      input: {
        ...skillInput,
        skill_id: skillId,
        workflow_id: workflowId
      },
      ctx,
      timeoutMs: timeoutPerSkill,
      workflowId,
      retryPolicy,
      progress: null
    });

    const transformedResult = {
      ...result,
      output: result.status === 'success'
        ? applyOutputProjection(skillId, outputProjection, result.output)
        : null,
      raw_output: result.output
    };

    results.push(transformedResult);
    resultsBySkill[skillId] = transformedResult;

    if (typeof onProgress === 'function') {
      onProgress(transformedResult);
    }

    if (transformedResult.status === 'success') {
      consecutiveErrors = 0;
    } else {
      consecutiveErrors++;

      if (!skipOnError) {
        throw new Error(`Skill '${skillId}' failed: ${transformedResult.error}`);
      }

      if (consecutiveErrors >= maxConsecutiveErrors) {
        log({
          event_type: 'ERROR',
          message: `[orchestrator] Too many consecutive errors (${consecutiveErrors}), stopping workflow`,
          workflow_id: workflowId
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Build input for next skill from previous results
 * @param {string} skillId - Current skill
 * @param {object} baseInput - Base input
 * @param {object} resultsBySkill - { skillId: result }
 * @returns {object} Skill input
 */
function buildSkillInput(skillId, baseInput, resultsBySkill) {
  const input = { ...baseInput };

  // Pass previous analysis findings to dependent skills
  if (skillId === 'refactor' || skillId === 'test-generator' || skillId === 'doc-generator') {
    const analysisResult = resultsBySkill['code-analysis'];
    const analysisOutput = analysisResult?.raw_output || analysisResult?.output;
    if (analysisResult && analysisResult.status === 'success' && analysisOutput?.findings) {
      input.findings = cloneFindings(analysisOutput.findings);
    }
  }

  // Pass security findings to dependent skills
  if (skillId === 'refactor') {
    const securityResult = resultsBySkill['security-audit'];
    const securityOutput = securityResult?.raw_output || securityResult?.output;
    if (securityResult && securityResult.status === 'success' && securityOutput?.findings) {
      if (!input.findings) input.findings = [];
      input.findings.push(...cloneFindings(securityOutput.findings));
    }
  }

  return input;
}

/**
 * Build condition context
 * @param {object} baseInput
 * @param {object} resultsBySkill
 * @returns {object}
 */
function buildConditionContext(baseInput, resultsBySkill) {
  const results = {};

  for (const [skillId, result] of Object.entries(resultsBySkill || {})) {
    results[skillId] = {
      status: result.status,
      output: result.raw_output || result.output,
      duration_ms: result.duration_ms,
      error: result.error,
      attempt_count: result.attempt_count || 1
    };
  }

  return {
    input: baseInput,
    results
  };
}

/**
 * Clone findings for downstream skill input
 * @param {object[]} findings
 * @returns {object[]}
 */
function cloneFindings(findings) {
  if (!Array.isArray(findings)) {
    return [];
  }

  return findings.map((finding) => {
    if (!finding || typeof finding !== 'object') {
      return finding;
    }

    return { ...finding };
  });
}

module.exports = {
  executeSequential,
  buildSkillInput,
  buildConditionContext,
  cloneFindings
};
