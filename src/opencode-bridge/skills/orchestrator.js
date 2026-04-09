"use strict";

/**
 * src/opencode-bridge/skills/orchestrator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenCode bridge wrapper for Orchestrator skill
 * 
 * Integrates orchestrator agent into OpenCode bridge infrastructure
 */

const path = require('path');
const { execute: orchestratorHandler } = require('../../.agents/orchestrator/handler');

/**
 * Create mock context for orchestrator handler
 * @param {object} input - OpenCode input
 * @param {object} options - Options { projectRoot, verbose }
 * @returns {object} Context for handler
 */
function createContext(input, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();

  // Simple mock logger
  const logger = {
    info: (msg, data) => {
      if (options.verbose) {
        console.log(`[orchestrator:info] ${msg}`, data || '');
      }
    },
    debug: (msg, data) => {
      if (options.verbose) {
        console.log(`[orchestrator:debug] ${msg}`, data || '');
      }
    },
    error: (msg, data) => {
      console.error(`[orchestrator:error] ${msg}`, data || '');
    },
    warn: (msg, data) => {
      console.warn(`[orchestrator:warn] ${msg}`, data || '');
    }
  };

  // Simple mock memory system
  const memory = {
    cache: {},
    set: async (key, value, options) => {
      memory.cache[key] = {
        value,
        ttl: (options?.ttl_seconds || 3600) * 1000,
        tags: options?.tags || [],
        createdAt: Date.now()
      };
    },
    get: async (key) => {
      const item = memory.cache[key];
      if (!item) return null;
      
      const age = Date.now() - item.createdAt;
      if (age > item.ttl) {
        delete memory.cache[key];
        return null;
      }
      
      return item.value;
    },
    clear: () => {
      memory.cache = {};
    }
  };

  // Log wrapper (called with various signatures)
  const logWrapper = (eventOrMsg, dataOrUndefined) => {
    if (typeof eventOrMsg === 'object') {
      // Called as log({ event_type, message, ... })
      const { event_type, message, ...rest } = eventOrMsg;
      
      if (options.verbose) {
        console.log(`[orchestrator:${event_type}] ${message}`, Object.keys(rest).length > 0 ? rest : '');
      }
    } else {
      // Called as log(message, data)
      if (options.verbose) {
        console.log(`[orchestrator] ${eventOrMsg}`, dataOrUndefined || '');
      }
    }
  };

  return {
    agentId: 'opencode-orchestrator',
    authLevel: 3, // Full orchestrator permission
    input: {
      ...input,
      project_root: input.project_root || projectRoot
    },
    memory,
    log: logWrapper
  };
}

/**
 * Process orchestrator results for OpenCode output
 * @param {object} result - Handler result
 * @returns {object} Processed result
 */
function processOutput(result) {
  if (result.status === 'error') {
    return {
      success: false,
      error: result.error,
      workflow_id: result.workflow_id
    };
  }

  // Extract key information for summary
  const summary = {
    workflow_id: result.workflow_id,
    mode: result.mode,
    status: result.status,
    duration_ms: result.duration_ms,
    
    execution: {
      total: result.results?.length || 0,
      successful: result.aggregated_summary?.total_skills_success || 0,
      failed: result.aggregated_summary?.total_skills_failed || 0,
      skipped: result.aggregated_summary?.total_skills_skipped || 0
    },

    findings: {
      total: result.aggregated_summary?.aggregated_findings?.length || 0,
      by_severity: result.aggregated_summary?.findings_by_severity || {}
    },

    skills_executed: result.results?.map(r => ({
      skill: r.skill_id,
      status: r.status,
      duration_ms: r.duration_ms,
      error: r.error
    })) || []
  };

  return {
    success: result.status !== 'error',
    summary,
    full_result: result,
    text_report: result.text_report || ''
  };
}

/**
 * Main skill handler for OpenCode bridge
 * @param {object} input - Input { mode, skills, project_root, ... }
 * @param {object} options - Options { projectRoot, verbose }
 * @returns {Promise<object>} Processed result
 */
async function handle(input, options = {}) {
  try {
    const ctx = createContext(input, options);
    const result = await orchestratorHandler(ctx);
    return processOutput(result);
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stack: err.stack
    };
  }
}

/**
 * Export for OpenCode integration
 * 
 * Usage:
 * const orchestrator = require('./skills/orchestrator');
 * const result = await orchestrator.handle({
 *   mode: 'parallel',
 *   skills: ['code-analysis', 'security-audit']
 * });
 */
module.exports = {
  id: 'orchestrator',
  name: 'Orchestrator',
  description: 'Coordinate execution of multiple agent skills',
  
  async handler(input, options) {
    return handle(input, options);
  },
  
  // Direct exports for advanced usage
  handle,
  createContext,
  processOutput
};
