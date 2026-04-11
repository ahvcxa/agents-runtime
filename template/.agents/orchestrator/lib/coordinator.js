"use strict";

/**
 * .agents/orchestrator/lib/coordinator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Workflow coordinator: skill ordering, dependency management, parallel groups
 */

const { collectConditionDependencies } = require('./condition-evaluator');

/**
 * Define skill dependencies and execution groups
 */
const SKILL_METADATA = {
  'code-analysis': {
    authLevel: 1,
    type: 'read',
    depends_on: [],
    blockedBy: []
  },
  'security-audit': {
    authLevel: 1,
    type: 'read',
    depends_on: [],
    blockedBy: []
  },
  'refactor': {
    authLevel: 2,
    type: 'write',
    depends_on: ['code-analysis'],
    blockedBy: []
  },
  'test-generator': {
    authLevel: 2,
    type: 'write',
    depends_on: ['code-analysis'],
    blockedBy: []
  },
  'doc-generator': {
    authLevel: 2,
    type: 'write',
    depends_on: ['code-analysis'],
    blockedBy: []
  },
  'code-formatter': {
    authLevel: 2,
    type: 'write',
    depends_on: [],
    blockedBy: []
  },
  'file-operations': {
    authLevel: 1,
    type: 'read',
    depends_on: [],
    blockedBy: []
  },
  'http-request': {
    authLevel: 1,
    type: 'read',
    depends_on: [],
    blockedBy: []
  },
  'data-transform': {
    authLevel: 1,
    type: 'read',
    depends_on: [],
    blockedBy: []
  },
  'logging': {
    authLevel: 1,
    type: 'write',
    depends_on: [],
    blockedBy: []
  },
  'system-command': {
    authLevel: 2,
    type: 'write',
    depends_on: [],
    blockedBy: []
  }
};

/**
 * Get skill metadata
 * @param {string} skillId
 * @returns {object} Metadata or default
 */
function getSkillMetadata(skillId) {
  return SKILL_METADATA[skillId] || {
    authLevel: 1,
    type: 'read',
    depends_on: [],
    blockedBy: []
  };
}

/**
 * Build workflow structure
 * @param {string[]} requestedSkills - Skill IDs to execute
 * @param {string} mode - 'parallel' or 'sequential'
 * @param {object} options - Workflow options
 * @returns {object} Workflow structure { order, dependencies, parallelGroups }
 */
function buildWorkflow(requestedSkills, mode = 'parallel', options = {}) {
  if (!Array.isArray(requestedSkills) || requestedSkills.length === 0) {
    throw new Error('requestedSkills must be a non-empty array');
  }

  const conditions = options.conditions || {};

  // Filter skills to only those requested
  const skillSet = new Set(requestedSkills);
  
  // Build dependency graph
  const dependencies = {};
  const resolved = [];
  const visited = new Set();

  function resolveDependencies(skillId) {
    if (visited.has(skillId)) return;
    visited.add(skillId);

    const metadata = getSkillMetadata(skillId);
    const deps = metadata.depends_on || [];
    const conditionDeps = collectConditionDependencies(conditions[skillId], requestedSkills)
      .filter(dep => dep !== skillId);

    dependencies[skillId] = dedupeList([
      ...deps.filter(dep => skillSet.has(dep)),
      ...conditionDeps.filter(dep => skillSet.has(dep))
    ]);

    for (const dep of dependencies[skillId]) {
      if (!visited.has(dep)) {
        resolveDependencies(dep);
      }
    }

    resolved.push(skillId);
  }

  // Resolve all requested skills
  for (const skill of requestedSkills) {
    resolveDependencies(skill);
  }

  // Build execution order using topological sort
  const order = topologicalSort(resolved, dependencies);

  // Build parallel groups (for parallel mode)
  const parallelGroups = buildParallelGroups(order, dependencies, mode);

  return {
    order,
    dependencies,
    parallelGroups,
    mode,
    skill_count: order.length,
    conditions
  };
}

/**
 * Topological sort for execution order
 * @param {string[]} skills - All skill IDs
 * @param {object} dependencies - { skillId: [deps] }
 * @returns {string[]} Ordered skill list
 */
function topologicalSort(skills, dependencies) {
  const inDegree = {};
  const adjList = {};

  // Initialize
  for (const skill of skills) {
    inDegree[skill] = 0;
    adjList[skill] = [];
  }

  // Build graph
  for (const skill of skills) {
    const deps = dependencies[skill] || [];
    inDegree[skill] = deps.length;
    for (const dep of deps) {
      if (adjList[dep]) {
        adjList[dep].push(skill);
      }
    }
  }

  // Kahn's algorithm
  const queue = [];
  const sorted = [];

  for (const skill of skills) {
    if (inDegree[skill] === 0) {
      queue.push(skill);
    }
  }

  while (queue.length > 0) {
    const skill = queue.shift();
    sorted.push(skill);

    for (const neighbor of adjList[skill]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== skills.length) {
    throw new Error('Circular dependency detected in skill workflow');
  }

  return sorted;
}

/**
 * Build parallel execution groups
 * @param {string[]} orderedSkills - Topologically sorted skills
 * @param {object} dependencies - { skillId: [deps] }
 * @param {string} mode - 'parallel' or 'sequential'
 * @returns {string[][]} Parallel groups
 */
function buildParallelGroups(orderedSkills, dependencies, mode) {
  if (mode === 'sequential') {
    // Each skill in its own group (executed one by one)
    return orderedSkills.map(skill => [skill]);
  }

  // Parallel mode: build dependency levels
  const groups = [];
  const pending = orderedSkills.slice();
  const executed = new Set();

  while (pending.length > 0) {
    const runnable = pending.filter((skill) => {
      const deps = dependencies[skill] || [];
      return deps.every(dep => executed.has(dep));
    });

    if (runnable.length === 0) {
      throw new Error('Unable to build parallel groups due to unsatisfied dependencies');
    }

    groups.push(runnable);

    for (const skill of runnable) {
      executed.add(skill);
      const idx = pending.indexOf(skill);
      if (idx >= 0) pending.splice(idx, 1);
    }
  }

  return groups;
}

function dedupeList(values) {
  const seen = new Set();
  const deduped = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      deduped.push(value);
    }
  }

  return deduped;
}

/**
 * Get skills by type
 * @param {string[]} skillIds - List of skill IDs
 * @param {string} type - 'read' or 'write'
 * @returns {string[]} Filtered skills
 */
function getSkillsByType(skillIds, type) {
  return skillIds.filter(skillId => {
    const metadata = getSkillMetadata(skillId);
    return metadata.type === type;
  });
}

/**
 * Check if all skills are read-only
 * @param {string[]} skillIds
 * @returns {boolean}
 */
function isReadOnlyWorkflow(skillIds) {
  return getSkillsByType(skillIds, 'write').length === 0;
}

module.exports = {
  buildWorkflow,
  getSkillMetadata,
  getSkillsByType,
  isReadOnlyWorkflow,
  topologicalSort,
  buildParallelGroups
};
