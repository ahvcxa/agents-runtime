"use strict";

/**
 * .agents/orchestrator/lib/progress-tracker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks workflow progress and emits normalized progress events
 */

/**
 * Create progress tracker
 * @param {object} params
 * @returns {{ onResult: Function, summary: Function }}
 */
function createProgressTracker(params) {
  const {
    workflowId,
    totalSkills,
    log,
    now = () => Date.now()
  } = params;

  const startedAt = now();
  const state = {
    completed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    last_update_ms: 0
  };

  function onResult(result) {
    state.completed += 1;
    if (result.status === 'success') state.success += 1;
    if (result.status === 'failed') state.failed += 1;
    if (result.status === 'skipped') state.skipped += 1;

    const elapsedMs = Math.max(0, now() - startedAt);
    const remaining = Math.max(0, totalSkills - state.completed);
    const averagePerStep = state.completed > 0 ? elapsedMs / state.completed : 0;
    const etaMs = Math.max(0, Math.round(averagePerStep * remaining));
    const percentage = totalSkills > 0
      ? Math.min(100, Math.round((state.completed / totalSkills) * 100))
      : 100;

    state.last_update_ms = elapsedMs;

    const payload = {
      workflow_id: workflowId,
      completed: state.completed,
      total: totalSkills,
      percentage,
      success: state.success,
      failed: state.failed,
      skipped: state.skipped,
      elapsed_ms: elapsedMs,
      eta_ms: etaMs,
      latest_skill: result.skill_id,
      latest_status: result.status
    };

    if (typeof log === 'function') {
      log({
        event_type: 'PROGRESS_UPDATE',
        message: '[orchestrator] Workflow progress update',
        ...payload
      });
    }

    return payload;
  }

  function summary() {
    const elapsedMs = Math.max(0, now() - startedAt);
    return {
      completed: state.completed,
      total: totalSkills,
      percentage: totalSkills > 0 ? Math.min(100, Math.round((state.completed / totalSkills) * 100)) : 100,
      success: state.success,
      failed: state.failed,
      skipped: state.skipped,
      elapsed_ms: elapsedMs,
      eta_ms: 0,
      finished: state.completed >= totalSkills
    };
  }

  return {
    onResult,
    summary
  };
}

module.exports = {
  createProgressTracker
};
