"use strict";

/**
 * .agents/orchestrator/lib/validator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Input validation for orchestrator skill
 */

const VALID_SKILLS = new Set([
  'code-analysis',
  'security-audit',
  'refactor',
  'test-generator',
  'doc-generator',
  'code-formatter',
  'file-operations',
  'http-request',
  'data-transform',
  'logging',
  'system-command'
]);

const VALID_MODES = new Set(['parallel', 'sequential']);

const CONDITION_OPERATORS = new Set([
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'exists',
  'contains'
]);

const DEFAULT_RETRY_POLICY = Object.freeze({
  enabled: true,
  max_attempts: 3,
  base_delay_ms: 250,
  max_delay_ms: 4000,
  multiplier: 2,
  jitter: true
});

/**
 * Validate orchestrator input
 * @param {object} input - Raw input from ctx.input
 * @returns {object} Validated and normalized input
 * @throws {Error} If validation fails
 */
function validateInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Input must be an object');
  }

  // Validate mode
  let mode = (input.mode || 'parallel').toLowerCase();
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid mode: ${input.mode}. Must be 'parallel' or 'sequential'`);
  }

  // Validate skills array
  let skills = input.skills || Array.from(VALID_SKILLS);
  if (!Array.isArray(skills) || skills.length === 0) {
    throw new Error('skills must be a non-empty array');
  }

  // Filter and validate each skill
  const validatedSkills = [];
  for (const skill of skills) {
    if (typeof skill !== 'string') {
      throw new Error(`Each skill must be a string, got ${typeof skill}`);
    }
    const trimmed = skill.trim();
    if (!VALID_SKILLS.has(trimmed)) {
      throw new Error(`Unknown skill: ${skill}. Valid skills: ${Array.from(VALID_SKILLS).join(', ')}`);
    }
    if (!validatedSkills.includes(trimmed)) {
      validatedSkills.push(trimmed);
    }
  }

  if (validatedSkills.length === 0) {
    throw new Error('No valid skills specified');
  }

  // Validate project_root
  const projectRoot = input.project_root || process.cwd();
  if (typeof projectRoot !== 'string') {
    throw new Error('project_root must be a string');
  }

  // Validate timeout_per_skill
  let timeoutPerSkill = input.timeout_per_skill ?? 30000;
  if (typeof timeoutPerSkill !== 'number' || timeoutPerSkill <= 0) {
    throw new Error('timeout_per_skill must be a positive number (milliseconds)');
  }
  if (timeoutPerSkill > 300000) {
    throw new Error('timeout_per_skill exceeds maximum (5 minutes)');
  }

  // Validate dry_run
  const dryRun = input.dry_run !== false; // default true

  // Validate skip_on_error
  const skipOnError = input.skip_on_error !== false; // default true

  const retryPolicy = validateRetryPolicy(input.retry_policy);
  const conditions = validateConditions(input.conditions);
  const outputProjection = validateOutputProjection(input.output_projection);

  return {
    ...input,
    mode,
    skills: validatedSkills,
    project_root: projectRoot,
    timeout_per_skill: Math.floor(timeoutPerSkill),
    dry_run: dryRun,
    skip_on_error: skipOnError,
    retry_policy: retryPolicy,
    conditions,
    output_projection: outputProjection
  };
}

/**
 * Validate retry policy
 * @param {object|boolean|undefined} retryPolicy
 * @returns {object}
 */
function validateRetryPolicy(retryPolicy) {
  if (retryPolicy === undefined || retryPolicy === null) {
    return { ...DEFAULT_RETRY_POLICY };
  }

  if (retryPolicy === false) {
    return {
      ...DEFAULT_RETRY_POLICY,
      enabled: false,
      max_attempts: 1
    };
  }

  if (typeof retryPolicy !== 'object') {
    throw new Error('retry_policy must be an object or false');
  }

  const enabled = retryPolicy.enabled !== false;
  const maxAttempts = retryPolicy.max_attempts ?? DEFAULT_RETRY_POLICY.max_attempts;
  const baseDelay = retryPolicy.base_delay_ms ?? DEFAULT_RETRY_POLICY.base_delay_ms;
  const maxDelay = retryPolicy.max_delay_ms ?? DEFAULT_RETRY_POLICY.max_delay_ms;
  const multiplier = retryPolicy.multiplier ?? DEFAULT_RETRY_POLICY.multiplier;
  const jitter = retryPolicy.jitter !== false;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error('retry_policy.max_attempts must be an integer between 1 and 10');
  }

  if (!Number.isFinite(baseDelay) || baseDelay < 0 || baseDelay > 10000) {
    throw new Error('retry_policy.base_delay_ms must be between 0 and 10000');
  }

  if (!Number.isFinite(maxDelay) || maxDelay < 1 || maxDelay > 60000) {
    throw new Error('retry_policy.max_delay_ms must be between 1 and 60000');
  }

  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) {
    throw new Error('retry_policy.multiplier must be between 1 and 10');
  }

  return {
    enabled,
    max_attempts: enabled ? maxAttempts : 1,
    base_delay_ms: Math.floor(baseDelay),
    max_delay_ms: Math.floor(maxDelay),
    multiplier,
    jitter
  };
}

/**
 * Validate skill condition map
 * @param {object|undefined} conditions
 * @returns {object}
 */
function validateConditions(conditions) {
  if (conditions === undefined || conditions === null) {
    return {};
  }

  if (typeof conditions !== 'object' || Array.isArray(conditions)) {
    throw new Error('conditions must be an object keyed by skill id');
  }

  const normalized = {};

  for (const [skillId, condition] of Object.entries(conditions)) {
    if (!VALID_SKILLS.has(skillId)) {
      throw new Error(`conditions contains unknown skill key: ${skillId}`);
    }

    normalized[skillId] = normalizeConditionNode(condition, `conditions.${skillId}`);
  }

  return normalized;
}

/**
 * Normalize condition expression tree
 * @param {any} node
 * @param {string} path
 * @returns {object|boolean}
 */
function normalizeConditionNode(node, path) {
  if (typeof node === 'boolean') {
    return node;
  }

  if (Array.isArray(node)) {
    if (node.length === 0) {
      throw new Error(`${path} array cannot be empty`);
    }
    return {
      all: node.map((entry, index) => normalizeConditionNode(entry, `${path}[${index}]`))
    };
  }

  if (!node || typeof node !== 'object') {
    throw new Error(`${path} must be an object, array, or boolean`);
  }

  // Simple leaf rule
  if (typeof node.path === 'string' && typeof node.op === 'string') {
    const rulePath = node.path.trim();
    const op = node.op.trim();

    if (!rulePath) {
      throw new Error(`${path}.path cannot be empty`);
    }

    if (!CONDITION_OPERATORS.has(op)) {
      throw new Error(`${path}.op must be one of: ${Array.from(CONDITION_OPERATORS).join(', ')}`);
    }

    if ((op === 'contains' || op === '==' || op === '!=' || op === '>' || op === '>=' || op === '<' || op === '<=') && node.value === undefined) {
      throw new Error(`${path}.value is required for operator '${op}'`);
    }

    return {
      path: rulePath,
      op,
      value: node.value
    };
  }

  const normalized = {};
  const hasAll = Object.prototype.hasOwnProperty.call(node, 'all');
  const hasAny = Object.prototype.hasOwnProperty.call(node, 'any');
  const hasNot = Object.prototype.hasOwnProperty.call(node, 'not');

  if (!hasAll && !hasAny && !hasNot) {
    throw new Error(`${path} must include a leaf rule (path/op) or logical keys (all/any/not)`);
  }

  if (hasAll) {
    if (!Array.isArray(node.all) || node.all.length === 0) {
      throw new Error(`${path}.all must be a non-empty array`);
    }
    normalized.all = node.all.map((entry, index) => normalizeConditionNode(entry, `${path}.all[${index}]`));
  }

  if (hasAny) {
    if (!Array.isArray(node.any) || node.any.length === 0) {
      throw new Error(`${path}.any must be a non-empty array`);
    }
    normalized.any = node.any.map((entry, index) => normalizeConditionNode(entry, `${path}.any[${index}]`));
  }

  if (hasNot) {
    normalized.not = normalizeConditionNode(node.not, `${path}.not`);
  }

  return normalized;
}

/**
 * Validate output projection config
 * @param {object|string[]|undefined} outputProjection
 * @returns {object|null}
 */
function validateOutputProjection(outputProjection) {
  if (outputProjection === undefined || outputProjection === null) {
    return null;
  }

  if (Array.isArray(outputProjection)) {
    return {
      default: normalizePathList(outputProjection, 'output_projection')
    };
  }

  if (typeof outputProjection !== 'object') {
    throw new Error('output_projection must be an object or array of paths');
  }

  const normalized = {};
  for (const [key, value] of Object.entries(outputProjection)) {
    if (key !== 'default' && !VALID_SKILLS.has(key)) {
      throw new Error(`output_projection contains unknown skill key: ${key}`);
    }
    normalized[key] = normalizePathList(value, `output_projection.${key}`);
  }

  return normalized;
}

/**
 * Validate list of dot paths
 * @param {any} paths
 * @param {string} pathLabel
 * @returns {string[]}
 */
function normalizePathList(paths, pathLabel) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error(`${pathLabel} must be a non-empty array of string paths`);
  }

  const deduped = [];
  for (const value of paths) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${pathLabel} values must be non-empty strings`);
    }

    const normalized = value.trim();
    if (!deduped.includes(normalized)) {
      deduped.push(normalized);
    }
  }

  return deduped;
}

/**
 * Validate authorization level
 * @param {number} authLevel - Agent authorization level
 * @throws {Error} If authLevel insufficient
 */
function validateAuthLevel(authLevel) {
  if (typeof authLevel !== 'number') {
    throw new Error('authLevel must be a number');
  }
  if (authLevel < 3) {
    throw new Error(`orchestrator requires authorization level >= 3, got ${authLevel}`);
  }
}

/**
 * Validate skill authorization requirements
 * @param {string} skillId - Skill identifier
 * @param {number} availableAuthLevel - Agent's auth level
 * @throws {Error} If agent cannot execute this skill
 */
function validateSkillAuthLevel(skillId, availableAuthLevel) {
  const skillAuthRequirements = {
    'code-analysis': 1,
    'security-audit': 1,
    'refactor': 2,
    'test-generator': 2,
    'doc-generator': 2,
    'code-formatter': 2,
    'file-operations': 1,
    'http-request': 1,
    'data-transform': 1,
    'logging': 1,
    'system-command': 2
  };

  const required = skillAuthRequirements[skillId] || 1;
  if (availableAuthLevel < required) {
    throw new Error(
      `skill '${skillId}' requires authorization level >= ${required}, got ${availableAuthLevel}`
    );
  }
}

module.exports = {
  validateInput,
  validateAuthLevel,
  validateSkillAuthLevel,
  VALID_SKILLS,
  VALID_MODES,
  CONDITION_OPERATORS,
  DEFAULT_RETRY_POLICY,
  validateRetryPolicy,
  validateConditions,
  validateOutputProjection
};
