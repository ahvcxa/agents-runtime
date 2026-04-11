"use strict";

/**
 * .agents/orchestrator/handler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrator Agent Handler
 * 
 * Coordinates execution of multiple skills in parallel or sequential mode
 * with dependency management and result aggregation.
 * 
 * Authorization Level: 3 (Orchestrator - full system control)
 * 
 * @param {object} ctx - { agentId, authLevel, input, memory, log }
 * @returns {Promise<{ workflow_id, mode, results, aggregated_summary }>}
 */

const {
  validateInput,
  validateAuthLevel,
  validateSkillAuthLevel
} = require('./lib/validator');

const {
  buildWorkflow,
  isReadOnlyWorkflow
} = require('./lib/coordinator');

const {
  executeParallel
} = require('./lib/parallel-executor');

const {
  executeSequential
} = require('./lib/sequential-executor');

const {
  aggregateResults,
  generateTextReport
} = require('./lib/result-aggregator');

const {
  createProgressTracker
} = require('./lib/progress-tracker');

/**
 * UUID-v4 generator
 */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Main handler
 */
async function execute(ctx) {
  const { agentId, authLevel, input, memory, log } = ctx;

  const workflowId = uuid();
  const startTime = Date.now();

  // Initialize input object if missing
  const baseInput = input || {};
  baseInput.workflow_id = workflowId;

  log({
    event_type: 'INFO',
    message: '[orchestrator] Workflow starting',
    workflow_id: workflowId,
    agent_id: agentId
  });

  try {
    // 1. VALIDATION
    log({
      event_type: 'DEBUG',
      message: '[orchestrator] Validating authorization level',
      auth_level: authLevel
    });

    validateAuthLevel(authLevel);

    log({
      event_type: 'DEBUG',
      message: '[orchestrator] Validating input parameters'
    });

    const validatedInput = validateInput(baseInput);

    log({
      event_type: 'INFO',
      message: '[orchestrator] Input validation passed',
      mode: validatedInput.mode,
      skill_count: validatedInput.skills.length,
      skills: validatedInput.skills.join(', ')
    });

    // 2. SKILL AUTHORIZATION CHECK
    log({
      event_type: 'DEBUG',
      message: '[orchestrator] Checking skill authorizations'
    });

    for (const skillId of validatedInput.skills) {
      validateSkillAuthLevel(skillId, authLevel);
    }

    log({
      event_type: 'INFO',
      message: '[orchestrator] All skill authorizations validated'
    });

    // 3. WORKFLOW BUILDING
    log({
      event_type: 'DEBUG',
      message: '[orchestrator] Building workflow structure'
    });

    const workflow = buildWorkflow(
      validatedInput.skills,
      validatedInput.mode,
      { conditions: validatedInput.conditions }
    );

    log({
      event_type: 'INFO',
      message: '[orchestrator] Workflow structure built',
      execution_order: workflow.order.join(' → '),
      parallel_groups: workflow.parallelGroups.length
    });

    // 4. EXECUTION
    let results = [];
    const progressTracker = createProgressTracker({
      workflowId,
      totalSkills: workflow.order.length,
      log
    });

    if (validatedInput.mode === 'parallel') {
      log({
        event_type: 'INFO',
        message: '[orchestrator] Starting PARALLEL execution mode'
      });

      results = await executeParallel(
        workflow.order,
        workflow.parallelGroups,
        validatedInput,
        ctx,
        validatedInput.timeout_per_skill,
        {
          retryPolicy: validatedInput.retry_policy,
          conditions: validatedInput.conditions,
          outputProjection: validatedInput.output_projection,
          onProgress: progressTracker.onResult
        }
      );
    } else {
      log({
        event_type: 'INFO',
        message: '[orchestrator] Starting SEQUENTIAL execution mode'
      });

      results = await executeSequential(
        workflow.order,
        workflow.dependencies,
        validatedInput,
        ctx,
        validatedInput.timeout_per_skill,
        validatedInput.skip_on_error,
        {
          retryPolicy: validatedInput.retry_policy,
          conditions: validatedInput.conditions,
          outputProjection: validatedInput.output_projection,
          onProgress: progressTracker.onResult
        }
      );
    }

    // 5. AGGREGATION
    log({
      event_type: 'DEBUG',
      message: '[orchestrator] Aggregating results'
    });

    const aggregatedSummary = aggregateResults(results);

    const duration = Date.now() - startTime;

    log({
      event_type: 'INFO',
      message: '[orchestrator] Workflow completed',
      workflow_status: aggregatedSummary.workflow_status,
      duration_ms: duration,
      total_findings: aggregatedSummary.aggregated_findings.length,
      errors: aggregatedSummary.total_skills_failed,
      skipped: aggregatedSummary.total_skills_skipped
    });

    // Generate text report
    const textReport = generateTextReport(results, aggregatedSummary);

    // 6. MEMORY STORAGE
    try {
      memory.set(`orchestrator:workflow:${workflowId}`, {
        workflow_id: workflowId,
        mode: validatedInput.mode,
        skills: validatedInput.skills,
        status: aggregatedSummary.workflow_status,
        created_at: new Date().toISOString(),
        duration_ms: duration,
        findings_count: aggregatedSummary.aggregated_findings.length
      }, {
        ttl_seconds: 86400, // 24 hours
        tags: ['orchestrator', 'workflow']
      });
    } catch (err) {
      log({
        event_type: 'WARN',
        message: '[orchestrator] Failed to cache workflow results',
        error: err.message
      });
    }

    // 7. RETURN RESULT
    return {
      workflow_id: workflowId,
      mode: validatedInput.mode,
      status: aggregatedSummary.workflow_status,
      duration_ms: duration,
      results,
      aggregated_summary: aggregatedSummary,
      progress_summary: progressTracker.summary(),
      text_report: textReport,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    const duration = Date.now() - startTime;

    log({
      event_type: 'ERROR',
      message: '[orchestrator] Workflow failed',
      workflow_id: workflowId,
      error: err.message,
      duration_ms: duration
    });

    return {
      workflow_id: workflowId,
      status: 'error',
      error: err.message,
      duration_ms: duration,
      results: [],
      aggregated_summary: null,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { execute };
