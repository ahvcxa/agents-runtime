"use strict";

/**
 * tests/orchestrator-integration.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * End-to-End integration tests for Orchestrator skill
 * 
 * Tests real skill invocation and sequential execution flow
 */

const assert = require('assert');
const path = require('path');
const { execute: orchestratorHandler } = require('../.agents/orchestrator/handler');

describe('Orchestrator Skill - E2E Integration Tests', () => {
  const mockLogger = (obj) => {
    // Silent logger for tests
  };

  const mockMemory = {
    set: () => Promise.resolve(),
    get: () => Promise.resolve(null)
  };

  // Get project root for testing
  const projectRoot = path.resolve(__dirname, '..');

  describe('Real Skill Invocation', () => {
    it('should invoke code-analysis skill', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: ['code-analysis'],
          project_root: projectRoot,
          timeout_per_skill: 10000,
          files: ['src/engine.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);

      assert(result.workflow_id);
      assert.strictEqual(result.mode, 'parallel');
      assert(result.results);
      assert(Array.isArray(result.results));
      assert(result.results.length > 0);
    }, 15000);

    it('should handle skill execution', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: ['code-analysis'],
          project_root: projectRoot,
          timeout_per_skill: 5000,
          files: ['/nonexistent/path/file.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.workflow_id);
      assert(result.aggregated_summary);
    }, 15000);
  });

  describe('Sequential Execution Flow', () => {
    it('should execute sequential mode with multiple skills', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'sequential',
          skills: ['code-analysis', 'security-audit'],
          project_root: projectRoot,
          timeout_per_skill: 8000,
          files: ['src/engine.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);

      assert(result.workflow_id);
      assert.strictEqual(result.mode, 'sequential');
      assert(result.results);
      assert(Array.isArray(result.results));
    }, 20000);

    it('should pass data from code-analysis to downstream skills', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'sequential',
          skills: ['code-analysis'],
          project_root: projectRoot,
          timeout_per_skill: 8000,
          files: ['src/engine.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);

      const analysisResult = result.results.find(r => r.skill_id === 'code-analysis');
      assert(analysisResult);
    }, 20000);

    it('should skip downstream skill when condition is false', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'sequential',
          skills: ['code-analysis', 'refactor'],
          project_root: projectRoot,
          timeout_per_skill: 8000,
          files: ['src/engine.js'],
          conditions: {
            refactor: {
              path: 'results.code-analysis.status',
              op: '==',
              value: 'failed'
            }
          }
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      const refactorResult = result.results.find((entry) => entry.skill_id === 'refactor');

      assert(refactorResult);
      assert.strictEqual(refactorResult.status, 'skipped');
    }, 25000);
  });

  describe('Result Aggregation from Real Skills', () => {
    it('should aggregate findings from executed skills', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: ['code-analysis'],
          project_root: projectRoot,
          timeout_per_skill: 8000,
          files: ['src/engine.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);

      assert(result.aggregated_summary);
      assert(typeof result.aggregated_summary.total_duration_ms === 'number');
      assert(typeof result.aggregated_summary.total_skills_executed === 'number');
    }, 15000);

    it('should generate text report from results', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: ['code-analysis'],
          project_root: projectRoot,
          timeout_per_skill: 8000,
          files: ['src/engine.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);

      assert(result.text_report);
      assert(typeof result.text_report === 'string');
    }, 15000);

    it('should include progress summary for completed workflow', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: ['code-analysis'],
          project_root: projectRoot,
          timeout_per_skill: 8000,
          files: ['src/engine.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);

      assert(result.progress_summary);
      assert.strictEqual(result.progress_summary.total, 1);
      assert.strictEqual(result.progress_summary.completed, 1);
      assert.strictEqual(result.progress_summary.finished, true);
    }, 15000);
  });

  describe('Error Handling in E2E', () => {
    it('should handle timeout gracefully', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: ['code-analysis'],
          project_root: projectRoot,
          timeout_per_skill: 500,
          files: ['src/engine.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.workflow_id);
    }, 15000);

    it('should handle empty skills gracefully', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: [],
          project_root: projectRoot,
          timeout_per_skill: 5000
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.workflow_id);
    }, 10000);
  });

  describe('Workflow Status', () => {
    it('should return valid workflow status', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: ['code-analysis'],
          project_root: projectRoot,
          timeout_per_skill: 8000,
          files: ['src/engine.js']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);

      assert(result.aggregated_summary);
      assert(['success', 'partial', 'failed', 'error'].includes(result.aggregated_summary.workflow_status));
    }, 15000);
  });
});
