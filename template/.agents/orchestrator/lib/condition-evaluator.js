"use strict";

/**
 * .agents/orchestrator/lib/condition-evaluator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates safe condition DSL for skill execution control
 */

/**
 * Evaluate condition tree
 * @param {object|boolean|undefined} condition
 * @param {object} context
 * @returns {{ passed: boolean, reason: string|null }}
 */
function evaluateCondition(condition, context) {
  if (condition === undefined || condition === null) {
    return { passed: true, reason: null };
  }

  const passed = evaluateNode(condition, context);
  if (passed) {
    return { passed: true, reason: null };
  }

  return {
    passed: false,
    reason: 'condition evaluated to false'
  };
}

/**
 * Collect referenced skills from condition paths
 * @param {object|boolean|undefined} condition
 * @param {string[]} knownSkills
 * @returns {string[]}
 */
function collectConditionDependencies(condition, knownSkills = []) {
  if (!condition) {
    return [];
  }

  const references = new Set();
  const known = new Set(knownSkills);

  walkCondition(condition, (rule) => {
    const path = String(rule.path || '');
    const segments = path.split('.').filter(Boolean);
    if (segments.length >= 2 && segments[0] === 'results') {
      const maybeSkill = segments[1];
      if (!known.size || known.has(maybeSkill)) {
        references.add(maybeSkill);
      }
    }
  });

  return Array.from(references);
}

function walkCondition(node, onRule) {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      walkCondition(entry, onRule);
    }
    return;
  }

  if (typeof node.path === 'string' && typeof node.op === 'string') {
    onRule(node);
    return;
  }

  if (Array.isArray(node.all)) {
    for (const entry of node.all) {
      walkCondition(entry, onRule);
    }
  }

  if (Array.isArray(node.any)) {
    for (const entry of node.any) {
      walkCondition(entry, onRule);
    }
  }

  if (node.not !== undefined) {
    walkCondition(node.not, onRule);
  }
}

function evaluateNode(node, context) {
  if (typeof node === 'boolean') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.every((entry) => evaluateNode(entry, context));
  }

  if (!node || typeof node !== 'object') {
    return false;
  }

  if (typeof node.path === 'string' && typeof node.op === 'string') {
    return evaluateRule(node, context);
  }

  if (Array.isArray(node.all)) {
    return node.all.every((entry) => evaluateNode(entry, context));
  }

  if (Array.isArray(node.any)) {
    return node.any.some((entry) => evaluateNode(entry, context));
  }

  if (node.not !== undefined) {
    return !evaluateNode(node.not, context);
  }

  return false;
}

function evaluateRule(rule, context) {
  const actual = getPathValue(context, rule.path);

  switch (rule.op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'contains':
      return containsValue(actual, rule.value);
    case '==':
      return actual === rule.value;
    case '!=':
      return actual !== rule.value;
    case '>':
      return Number(actual) > Number(rule.value);
    case '>=':
      return Number(actual) >= Number(rule.value);
    case '<':
      return Number(actual) < Number(rule.value);
    case '<=':
      return Number(actual) <= Number(rule.value);
    default:
      return false;
  }
}

function getPathValue(source, path) {
  if (!path || typeof path !== 'string') {
    return undefined;
  }

  const segments = path.split('.').filter(Boolean);
  let value = source;

  for (const segment of segments) {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value !== 'object') {
      return undefined;
    }
    value = value[segment];
  }

  return value;
}

function containsValue(actual, expected) {
  if (Array.isArray(actual)) {
    return actual.includes(expected);
  }

  if (typeof actual === 'string') {
    return actual.includes(String(expected));
  }

  if (actual && typeof actual === 'object') {
    return Object.prototype.hasOwnProperty.call(actual, expected);
  }

  return false;
}

module.exports = {
  evaluateCondition,
  collectConditionDependencies
};
