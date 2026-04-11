"use strict";

/**
 * .agents/orchestrator/lib/skill-runner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared real skill invocation with timeout and retry support
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * Execute one skill with standardized behavior
 * @param {object} params
 * @returns {Promise<object>}
 */
async function executeSkill(params) {
  const {
    skillId,
    input,
    ctx,
    timeoutMs,
    workflowId,
    retryPolicy,
    progress = null
  } = params;

  const { log } = ctx;
  const startTime = Date.now();
  const attemptsAllowed = retryPolicy?.enabled === false ? 1 : (retryPolicy?.max_attempts || 1);

  log({
    event_type: 'SKILL_START',
    skill_id: skillId,
    workflow_id: workflowId,
    attempts_allowed: attemptsAllowed,
    timestamp: new Date().toISOString()
  });

  let attempt = 0;
  let lastError = null;
  let lastErrorKind = 'unknown';

  while (attempt < attemptsAllowed) {
    attempt += 1;

    try {
      const output = await runSkillProcess({
        skillId,
        input,
        timeoutMs
      });

      const duration = Date.now() - startTime;
      const result = {
        skill_id: skillId,
        status: 'success',
        output,
        duration_ms: duration,
        error: null,
        executed_at: new Date().toISOString(),
        attempt_count: attempt,
        retried: attempt > 1,
        last_error_kind: lastErrorKind === 'unknown' ? null : lastErrorKind
      };

      log({
        event_type: 'SKILL_END',
        skill_id: skillId,
        status: 'success',
        duration_ms: duration,
        workflow_id: workflowId,
        attempt_count: attempt,
        retried: attempt > 1
      });

      if (typeof progress === 'function') {
        progress({ skill_id: skillId, status: 'success', duration_ms: duration });
      }

      return result;
    } catch (error) {
      lastError = error;
      lastErrorKind = classifyError(error);

      const shouldRetry = attempt < attemptsAllowed && isRetryableError(lastErrorKind);
      if (!shouldRetry) {
        break;
      }

      const delayMs = computeRetryDelay(attempt, retryPolicy);
      log({
        event_type: 'RETRY_ATTEMPT',
        skill_id: skillId,
        workflow_id: workflowId,
        attempt,
        max_attempts: attemptsAllowed,
        delay_ms: delayMs,
        error_kind: lastErrorKind,
        error: error.message
      });

      await sleep(delayMs);
    }
  }

  const duration = Date.now() - startTime;
  const failedResult = {
    skill_id: skillId,
    status: 'failed',
    output: null,
    duration_ms: duration,
    error: lastError ? lastError.message : 'Unknown execution error',
    executed_at: new Date().toISOString(),
    attempt_count: attempt,
    retried: attempt > 1,
    last_error_kind: lastErrorKind
  };

  log({
    event_type: 'SKILL_END',
    skill_id: skillId,
    status: 'failed',
    duration_ms: duration,
    workflow_id: workflowId,
    error: failedResult.error,
    attempt_count: attempt,
    retried: attempt > 1,
    error_kind: lastErrorKind
  });

  if (typeof progress === 'function') {
    progress({ skill_id: skillId, status: 'failed', duration_ms: duration, error: failedResult.error });
  }

  return failedResult;
}

/**
 * Spawn skill process and parse JSON output
 * @param {object} params
 * @returns {Promise<any>}
 */
function runSkillProcess(params) {
  const { skillId, input, timeoutMs } = params;

  return new Promise((resolve, reject) => {
    const skillInput = JSON.stringify(input || {});
    const agentsCli = path.resolve(__dirname, '../../../bin/agents.js');
    const child = spawn('node', [
      agentsCli,
      'run',
      '--skill', skillId,
      '--input', skillInput,
      '--project', input.project_root || process.cwd()
    ], {
      cwd: input.project_root || process.cwd()
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let killHandle = null;
    const timeoutHandle = setTimeout(() => {
      if (settled) return;

      const timeoutErr = new Error(`Skill execution timeout after ${timeoutMs}ms`);
      timeoutErr.kind = 'timeout';

      try {
        child.kill('SIGTERM');
        killHandle = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
        }, 500);
      } catch {}

      settleReject(timeoutErr);
    }, timeoutMs);

    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
      resolve(value);
    };

    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
      reject(error);
    };

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      const spawnErr = new Error(`Failed to spawn skill '${skillId}': ${error.message}`);
      spawnErr.kind = 'spawn';
      settleReject(spawnErr);
    });

    child.on('close', (code) => {
      if (settled) return;

      if (code !== 0) {
        const processErr = new Error(formatSkillError(skillId, code, stderr, stdout));
        processErr.kind = classifyProcessError(stderr, stdout);
        settleReject(processErr);
        return;
      }

      try {
        const parsed = parseSkillOutput(stdout);
        settleResolve(parsed);
      } catch (error) {
        const parseErr = new Error(`Skill '${skillId}' returned invalid JSON output: ${error.message}`);
        parseErr.kind = 'parse';
        settleReject(parseErr);
      }
    });
  });
}

/**
 * Parse output from agents CLI run command
 * @param {string} stdout
 * @returns {object}
 */
function parseSkillOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) {
    return { summary: { status: 'ok' } };
  }

  const marker = '─── Skill Result ───────────────────────────────────────';
  const markerIndex = text.indexOf(marker);

  let jsonCandidate = text;
  if (markerIndex >= 0) {
    const start = text.indexOf('{', markerIndex);
    const statusIndex = text.indexOf('Status:', start >= 0 ? start : markerIndex);
    if (start >= 0) {
      jsonCandidate = statusIndex >= 0 ? text.slice(start, statusIndex) : text.slice(start);
    }
  } else {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end >= start) {
      jsonCandidate = text.slice(start, end + 1);
    }
  }

  return JSON.parse(stripAnsi(jsonCandidate).trim());
}

function formatSkillError(skillId, code, stderr, stdout) {
  const cleanStderr = stripAnsi(String(stderr || '')).trim();
  const cleanStdout = stripAnsi(String(stdout || '')).trim();
  const detail = cleanStderr || cleanStdout || 'unknown error';
  return `Skill '${skillId}' exited with code ${code}: ${detail}`;
}

function classifyProcessError(stderr, stdout) {
  const text = `${stderr || ''}\n${stdout || ''}`.toLowerCase();

  if (text.includes('timeout')) {
    return 'timeout';
  }

  if (text.includes('econnrefused') || text.includes('network') || text.includes('temporar')) {
    return 'transient';
  }

  return 'process';
}

function classifyError(error) {
  if (!error) return 'unknown';
  if (error.kind) return error.kind;

  const message = String(error.message || '').toLowerCase();
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('spawn')) return 'spawn';
  if (message.includes('invalid json') || message.includes('parse')) return 'parse';
  if (message.includes('econn') || message.includes('network')) return 'transient';
  return 'process';
}

function isRetryableError(kind) {
  return kind === 'timeout' || kind === 'spawn' || kind === 'transient';
}

function computeRetryDelay(attempt, policy) {
  const baseDelay = policy?.base_delay_ms ?? 250;
  const maxDelay = policy?.max_delay_ms ?? 4000;
  const multiplier = policy?.multiplier ?? 2;
  const jitter = policy?.jitter !== false;

  const exponent = Math.max(0, attempt - 1);
  const rawDelay = baseDelay * Math.pow(multiplier, exponent);
  let delay = Math.min(maxDelay, rawDelay);

  if (jitter) {
    const randomFactor = 0.5 + Math.random();
    delay = Math.floor(delay * randomFactor);
  }

  return Math.max(0, Math.floor(delay));
}

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  executeSkill,
  runSkillProcess,
  parseSkillOutput,
  classifyError,
  isRetryableError,
  computeRetryDelay
};
