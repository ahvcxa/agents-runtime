"use strict";

/**
 * tests/orchestrator.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive test suite for Orchestrator skill
 * 
 * Tests: 35+ covering all modules and error cases
 */

const assert = require('assert');
const {
  validateInput,
  validateAuthLevel,
  validateSkillAuthLevel
} = require('../.agents/orchestrator/lib/validator');

const {
  buildWorkflow,
  getSkillMetadata,
  getSkillsByType,
  isReadOnlyWorkflow,
  topologicalSort
} = require('../.agents/orchestrator/lib/coordinator');

const {
  aggregateResults,
  sortFindingsBySeverity,
  generateTextReport
} = require('../.agents/orchestrator/lib/result-aggregator');

const { execute: orchestratorHandler } = require('../.agents/orchestrator/handler');

describe('Orchestrator Skill - Comprehensive Tests', () => {
  // ─── VALIDATOR TESTS ─────────────────────────────────────────────────────
  
  describe('Validator Module', () => {
    it('should validate correct input', () => {
      const input = {
        mode: 'parallel',
        skills: ['code-analysis', 'security-audit'],
        project_root: '/tmp',
        timeout_per_skill: 30000,
        dry_run: true,
        skip_on_error: true
      };

      const result = validateInput(input);
      assert.strictEqual(result.mode, 'parallel');
      assert.deepStrictEqual(result.skills, ['code-analysis', 'security-audit']);
      assert.strictEqual(result.timeout_per_skill, 30000);
      assert.strictEqual(result.dry_run, true);
    });

    it('should accept default mode', () => {
      const input = { skills: ['code-analysis'] };
      const result = validateInput(input);
      assert.strictEqual(result.mode, 'parallel');
    });

    it('should reject invalid mode', () => {
      const input = { mode: 'invalid', skills: ['code-analysis'] };
      assert.throws(() => validateInput(input), /Invalid mode/);
    });

    it('should reject empty skills array', () => {
      const input = { skills: [] };
      assert.throws(() => validateInput(input), /non-empty array/);
    });

    it('should reject unknown skill', () => {
      const input = { skills: ['unknown-skill'] };
      assert.throws(() => validateInput(input), /Unknown skill/);
    });

    it('should deduplicate skills', () => {
      const input = { skills: ['code-analysis', 'code-analysis', 'security-audit'] };
      const result = validateInput(input);
      assert.deepStrictEqual(result.skills, ['code-analysis', 'security-audit']);
    });

    it('should reject invalid timeout', () => {
      const input = { skills: ['code-analysis'], timeout_per_skill: -1000 };
      assert.throws(() => validateInput(input), /positive number/);
    });

    it('should reject timeout exceeding max', () => {
      const input = { skills: ['code-analysis'], timeout_per_skill: 400000 };
      assert.throws(() => validateInput(input), /maximum/);
    });

    it('should validate auth level', () => {
      assert.doesNotThrow(() => validateAuthLevel(3));
      assert.doesNotThrow(() => validateAuthLevel(4));
    });

    it('should reject insufficient auth level', () => {
      assert.throws(() => validateAuthLevel(2), /authorization level >= 3/);
      assert.throws(() => validateAuthLevel(1), /authorization level >= 3/);
    });

    it('should validate skill auth requirements', () => {
      assert.doesNotThrow(() => validateSkillAuthLevel('code-analysis', 3));
      assert.doesNotThrow(() => validateSkillAuthLevel('refactor', 3));
    });

    it('should reject skill exceeding auth level', () => {
      assert.throws(() => validateSkillAuthLevel('refactor', 1), /authorization level >= 2/);
    });
  });

  // ─── COORDINATOR TESTS ───────────────────────────────────────────────────

  describe('Coordinator Module', () => {
    it('should get skill metadata', () => {
      const meta = getSkillMetadata('code-analysis');
      assert.strictEqual(meta.type, 'read');
      assert.strictEqual(meta.authLevel, 1);
    });

    it('should return default metadata for unknown skill', () => {
      const meta = getSkillMetadata('unknown');
      assert.strictEqual(meta.type, 'read');
      assert.strictEqual(meta.authLevel, 1);
    });

    it('should build workflow with parallel mode', () => {
      const workflow = buildWorkflow(['code-analysis', 'security-audit'], 'parallel');
      assert(Array.isArray(workflow.order));
      assert(Array.isArray(workflow.parallelGroups));
      assert.strictEqual(workflow.mode, 'parallel');
    });

    it('should build workflow with sequential mode', () => {
      const workflow = buildWorkflow(['code-analysis', 'refactor'], 'sequential');
      assert.strictEqual(workflow.mode, 'sequential');
      assert.strictEqual(workflow.order[0], 'code-analysis');
      assert.strictEqual(workflow.order[1], 'refactor');
    });

    it('should handle dependencies in workflow', () => {
      const workflow = buildWorkflow(['code-analysis', 'refactor'], 'sequential');
      assert.deepStrictEqual(workflow.dependencies['refactor'], ['code-analysis']);
    });

    it('should filter skills by type', () => {
      const readSkills = getSkillsByType(['code-analysis', 'refactor', 'security-audit'], 'read');
      assert.strictEqual(readSkills.length, 2);
      assert(readSkills.includes('code-analysis'));
      assert(readSkills.includes('security-audit'));
    });

    it('should identify read-only workflow', () => {
      assert.strictEqual(isReadOnlyWorkflow(['code-analysis', 'security-audit']), true);
      assert.strictEqual(isReadOnlyWorkflow(['code-analysis', 'refactor']), false);
    });

    it('should perform topological sort', () => {
      const skills = ['code-analysis', 'refactor', 'security-audit'];
      const deps = {
        'code-analysis': [],
        'refactor': ['code-analysis'],
        'security-audit': []
      };
      const sorted = topologicalSort(skills, deps);
      assert(sorted.indexOf('code-analysis') < sorted.indexOf('refactor'));
    });
  });

  // ─── RESULT AGGREGATOR TESTS ─────────────────────────────────────────────

  describe('Result Aggregator Module', () => {
    it('should aggregate empty results', () => {
      const summary = aggregateResults([]);
      assert.strictEqual(summary.workflow_status, 'success');
      assert.strictEqual(summary.total_skills_executed, 0);
    });

    it('should aggregate successful results', () => {
      const results = [
        {
          skill_id: 'code-analysis',
          status: 'success',
          output: { findings: [], summary: { files: 5 } },
          duration_ms: 1000,
          error: null
        }
      ];
      const summary = aggregateResults(results);
      assert.strictEqual(summary.workflow_status, 'success');
      assert.strictEqual(summary.total_skills_success, 1);
    });

    it('should aggregate failed results', () => {
      const results = [
        {
          skill_id: 'code-analysis',
          status: 'failed',
          output: null,
          duration_ms: 500,
          error: 'Timeout'
        }
      ];
      const summary = aggregateResults(results);
      assert.strictEqual(summary.total_skills_failed, 1);
      assert.strictEqual(summary.errors.length, 1);
    });

    it('should aggregate skipped results', () => {
      const results = [
        {
          skill_id: 'refactor',
          status: 'skipped',
          output: null,
          duration_ms: 0,
          error: 'Unsatisfied dependencies'
        }
      ];
      const summary = aggregateResults(results);
      assert.strictEqual(summary.total_skills_skipped, 1);
      assert.strictEqual(summary.warnings.length, 1);
    });

    it('should aggregate findings by severity', () => {
      const results = [
        {
          skill_id: 'security-audit',
          status: 'success',
          output: {
            findings: [
              { severity: 'CRITICAL' },
              { severity: 'HIGH' },
              { severity: 'HIGH' },
              { severity: 'MEDIUM' }
            ],
            summary: {}
          },
          duration_ms: 1000,
          error: null
        }
      ];
      const summary = aggregateResults(results);
      assert.strictEqual(summary.findings_by_severity.CRITICAL, 1);
      assert.strictEqual(summary.findings_by_severity.HIGH, 2);
      assert.strictEqual(summary.findings_by_severity.MEDIUM, 1);
    });

    it('should determine workflow status as partial', () => {
      const results = [
        { skill_id: 'code-analysis', status: 'success', output: {}, duration_ms: 100, error: null },
        { skill_id: 'refactor', status: 'failed', output: null, duration_ms: 100, error: 'Error' }
      ];
      const summary = aggregateResults(results);
      assert.strictEqual(summary.workflow_status, 'partial');
    });

    it('should generate text report', () => {
      const results = [
        { skill_id: 'code-analysis', status: 'success', output: {}, duration_ms: 100, error: null }
      ];
      const summary = aggregateResults(results);
      const report = generateTextReport(results, summary);
      assert(report.includes('ORCHESTRATOR WORKFLOW'));
      assert(report.includes('code-analysis'));
      assert(report.includes('success'));
    });

    it('should sort findings by severity', () => {
      const findings = [
        { severity: 'LOW' },
        { severity: 'CRITICAL' },
        { severity: 'MEDIUM' },
        { severity: 'HIGH' }
      ];
      const sorted = sortFindingsBySeverity(findings);
      assert.strictEqual(sorted[0].severity, 'CRITICAL');
      assert.strictEqual(sorted[1].severity, 'HIGH');
      assert.strictEqual(sorted[2].severity, 'MEDIUM');
      assert.strictEqual(sorted[3].severity, 'LOW');
    });
  });

  // ─── HANDLER INTEGRATION TESTS ───────────────────────────────────────────

  describe('Handler Integration', () => {
    const mockLogger = (obj) => {
      // Mock logger implementation
    };

    const mockMemory = {
      set: () => Promise.resolve(),
      get: () => Promise.resolve(null)
    };

    it('should reject with insufficient auth level', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 1,
        input: { skills: ['code-analysis'] },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert.strictEqual(result.status, 'error');
      assert(result.error.includes('authorization level >= 3'));
    });

    it('should accept with sufficient auth level', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: { skills: ['code-analysis'] },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.workflow_id);
      assert(result.duration_ms >= 0);
    });

    it('should return workflow_id', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: { skills: ['code-analysis'] },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.workflow_id);
      assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result.workflow_id));
    });

    it('should handle empty input', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {},
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.workflow_id);
      assert.strictEqual(typeof result.duration_ms, 'number');
    });

    it('should include aggregated summary', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: { skills: ['code-analysis'] },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.aggregated_summary);
      assert(result.aggregated_summary.workflow_status);
      assert(typeof result.aggregated_summary.total_duration_ms === 'number');
    });

    it('should execute parallel mode', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'parallel',
          skills: ['code-analysis', 'security-audit']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert.strictEqual(result.mode, 'parallel');
      assert(Array.isArray(result.results));
    });

    it('should execute sequential mode', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          mode: 'sequential',
          skills: ['code-analysis', 'refactor']
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert.strictEqual(result.mode, 'sequential');
      assert(Array.isArray(result.results));
    });

    it('should respect timeout settings', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          skills: ['code-analysis'],
          timeout_per_skill: 5000
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.workflow_id);
    });

    it('should handle dry_run flag', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          skills: ['code-formatter'],
          dry_run: true
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.workflow_id);
    });

    it('should handle error gracefully', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: {
          skills: 'invalid' // Wrong type
        },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert.strictEqual(result.status, 'error');
      assert(result.error);
    });

    it('should generate text report', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: { skills: ['code-analysis'] },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.text_report);
      assert(typeof result.text_report === 'string');
      assert(result.text_report.length > 0);
    });

    it('should include timestamp', async () => {
      const ctx = {
        agentId: 'test-orchestrator',
        authLevel: 3,
        input: { skills: ['code-analysis'] },
        memory: mockMemory,
        log: mockLogger
      };

      const result = await orchestratorHandler(ctx);
      assert(result.timestamp);
      assert(/^\d{4}-\d{2}-\d{2}T/.test(result.timestamp));
    });
  });
});
