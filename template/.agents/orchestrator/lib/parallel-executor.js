"use strict";

/**
 * .agents/orchestrator/lib/parallel-executor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Parallel execution of skills (read-only or independent operations)
 */

const { executeSkill: runSkill } = require('./skill-runner');
const { evaluateCondition } = require('./condition-evaluator');
const { applyOutputProjection } = require('./output-projector');

/**
 * Execute skills in parallel (Promise.all)
 * @param {string[]} skills - Skill IDs to execute
 * @param {object} parallelGroups - Parallel execution groups
 * @param {object} input - Input parameters
 * @param {object} ctx - Agent context { agentId, authLevel, memory, log }
 * @param {number} timeoutPerSkill - Timeout in ms
 * @param {object} options
 * @returns {Promise<object[]>} Results array
 */
async function executeParallel(skills, parallelGroups, input, ctx, timeoutPerSkill, options = {}) {
  const { log } = ctx;
  const {
    retryPolicy,
    conditions = {},
    outputProjection = null,
    onProgress
  } = options;

  const results = [];
  const resultsMap = {};

  log({
    event_type: 'INFO',
    message: `[orchestrator] Parallel execution: ${skills.length} skill(s) in ${parallelGroups.length} group(s)`,
    group_count: parallelGroups.length
  });

  // Execute each group sequentially, but skills within group in parallel
  for (let groupIdx = 0; groupIdx < parallelGroups.length; groupIdx++) {
    const group = parallelGroups[groupIdx];
    const groupNumber = groupIdx + 1;

    log({
      event_type: 'INFO',
      message: `[orchestrator] Executing group ${groupNumber}/${parallelGroups.length}: ${group.join(', ')}`
    });

    const groupResults = await Promise.all(
      group.map((skillId) => executeParallelSkill({
        skillId,
        input,
        ctx,
        timeoutPerSkill,
        retryPolicy,
        condition: conditions[skillId],
        outputProjection,
        resultsMap,
        onProgress
      }))
    );

    for (let i = 0; i < group.length; i++) {
      const skillId = group[i];
      const result = groupResults[i];
      results.push(result);
      resultsMap[skillId] = result;
    }
  }

  return results;
}

/**
 * Execute one skill within parallel workflow
 * @param {object} params
 * @returns {Promise<object>}
 */
async function executeParallelSkill(params) {
  const {
    skillId,
    input,
    ctx,
    timeoutPerSkill,
    retryPolicy,
    condition,
    outputProjection,
    resultsMap,
    onProgress
  } = params;

  const { log } = ctx;
  const workflowId = input.workflow_id || `wf-${Date.now()}`;

  const conditionContext = {
    input,
    results: toConditionResults(resultsMap)
  };

  const conditionResult = evaluateCondition(condition, conditionContext);
  if (!conditionResult.passed) {
    const skipped = {
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

    log({
      event_type: 'SKILL_END',
      skill_id: skillId,
      status: 'skipped',
      workflow_id: workflowId,
      reason: skipped.error
    });

    if (typeof onProgress === 'function') {
      onProgress(skipped);
    }

    return skipped;
  }

  const skillInput = {
    ...input,
    skill_id: skillId,
    workflow_id: workflowId
  };

  const result = await runSkill({
    skillId,
    input: skillInput,
    ctx,
    timeoutMs: timeoutPerSkill,
    workflowId,
    retryPolicy,
    progress: null
  });

  const output = result.status === 'success'
    ? applyOutputProjection(skillId, outputProjection, result.output)
    : null;

  const transformed = {
    ...result,
    output,
    raw_output: result.output
  };

  if (typeof onProgress === 'function') {
    onProgress(transformed);
  }

  return transformed;
}

/**
 * Build minimal condition context from result map
 * @param {object} resultsMap
 * @returns {object}
 */
function toConditionResults(resultsMap) {
  const map = {};

  for (const [skillId, result] of Object.entries(resultsMap || {})) {
    map[skillId] = {
      status: result.status,
      output: result.raw_output || result.output,
      duration_ms: result.duration_ms,
      error: result.error,
      attempt_count: result.attempt_count || 1
    };
  }

  return map;
}

module.exports = {
  executeParallel,
  executeParallelSkill,
  toConditionResults
};
