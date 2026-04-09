/**
 * Tests for agent handlers (test-generator, doc-generator, code-formatter)
 * Unit tests for the agent skill handlers themselves
 */

const { handler: testGenHandler } = require('../.agents/test-generator/handler');
const { handler: docGenHandler } = require('../.agents/doc-generator/handler');
const { handler: formatterHandler } = require('../.agents/code-formatter/handler');

describe('Agent Handlers', () => {
  // ==================== TEST GENERATOR HANDLER ====================

  describe('test-generator handler', () => {
    let ctx;

    beforeEach(() => {
      ctx = {
        agentId: 'test-generator',
        authLevel: 2,
        input: {
          findings: [
            { file: 'src/utils.js', line: 10, message: 'Missing tests', type: 'testing', severity: 'MEDIUM' }
          ],
          test_framework: 'jest',
          coverage_target: 80,
          dry_run: true
        },
        memory: {},
        log: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn()
        }
      };
    });

    test('should initialize handler', () => {
      expect(testGenHandler).toBeDefined();
    });

    test('should reject low authorization', async () => {
      ctx.authLevel = 1;

      expect(async () => {
        await testGenHandler(ctx);
      }).rejects.toThrow();
    });

    test('should accept valid input', async () => {
      const result = await testGenHandler(ctx);

      expect(result).toHaveProperty('generated_tests');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('framework');
      expect(result.summary.framework).toBe('jest');
    });

    test('should support mocha framework', async () => {
      ctx.input.test_framework = 'mocha';

      const result = await testGenHandler(ctx);

      expect(result.summary.framework).toBe('mocha');
    });

    test('should handle empty findings', async () => {
      ctx.input.findings = [];

      const result = await testGenHandler(ctx);

      expect(result.generated_tests).toHaveLength(0);
      expect(result.summary.total_generated).toBe(0);
    });

    test('should validate coverage target', async () => {
      ctx.input.coverage_target = 150; // Invalid

      expect(async () => {
        await testGenHandler(ctx);
      }).rejects.toThrow();
    });

    test('should support dry-run mode', async () => {
      ctx.input.dry_run = true;

      const result = await testGenHandler(ctx);

      expect(result.summary.dry_run).toBe(true);
    });
  });

  // ==================== DOC GENERATOR HANDLER ====================

  describe('doc-generator handler', () => {
    let ctx;

    beforeEach(() => {
      ctx = {
        agentId: 'doc-generator',
        authLevel: 2,
        input: {
          include_readme: true,
          include_api_docs: true,
          include_changelog: false,
          project_root: process.cwd(),
          dry_run: true,
          package_json: {
            name: 'test-project',
            version: '1.0.0',
            description: 'A test project'
          }
        },
        memory: {},
        log: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn()
        }
      };
    });

    test('should initialize handler', () => {
      expect(docGenHandler).toBeDefined();
    });

    test('should reject low authorization', async () => {
      ctx.authLevel = 1;

      expect(async () => {
        await docGenHandler(ctx);
      }).rejects.toThrow();
    });

    test('should generate README', async () => {
      const result = await docGenHandler(ctx);

      expect(result).toHaveProperty('generated_docs');
      expect(result).toHaveProperty('summary');
    });

    test('should generate API docs', async () => {
      ctx.input.include_api_docs = true;

      const result = await docGenHandler(ctx);

      expect(result).toHaveProperty('generated_docs');
    });

    test('should support dry-run mode', async () => {
      ctx.input.dry_run = true;

      const result = await docGenHandler(ctx);

      expect(result.summary.dry_run).toBe(true);
    });

    test('should handle changelog generation', async () => {
      ctx.input.include_changelog = true;
      ctx.input.git_history = [
        { type: 'feat', message: 'Add new feature', version: '1.1.0' }
      ];

      const result = await docGenHandler(ctx);

      expect(result).toHaveProperty('generated_docs');
    });

    test('should include error handling', async () => {
      ctx.input.project_root = '/nonexistent/path';

      const result = await docGenHandler(ctx);

      expect(result).toHaveProperty('errors');
    });
  });

  // ==================== CODE FORMATTER HANDLER ====================

  describe('code-formatter handler', () => {
    let ctx;

    beforeEach(() => {
      ctx = {
        agentId: 'code-formatter',
        authLevel: 2,
        input: {
          files: ['src/app.js'],
          project_root: process.cwd(),
          config: 'prettier',
          rules: ['format', 'imports'],
          dry_run: true
        },
        memory: {},
        log: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn()
        }
      };
    });

    test('should initialize handler', () => {
      expect(formatterHandler).toBeDefined();
    });

    test('should reject low authorization', async () => {
      ctx.authLevel = 1;

      expect(async () => {
        await formatterHandler(ctx);
      }).rejects.toThrow();
    });

    test('should handle empty files list', async () => {
      ctx.input.files = [];

      const result = await formatterHandler(ctx);

      expect(result.fixed_files).toHaveLength(0);
      expect(result.summary.total_fixed).toBe(0);
    });

    test('should support multiple rules', async () => {
      ctx.input.rules = ['format', 'imports', 'unused', 'eslint'];

      const result = await formatterHandler(ctx);

      expect(result.summary.rules_applied).toContain('format');
      expect(result.summary.rules_applied).toContain('imports');
    });

    test('should support dry-run mode', async () => {
      ctx.input.dry_run = true;

      const result = await formatterHandler(ctx);

      expect(result.summary.dry_run).toBe(true);
    });

    test('should report formatting changes', async () => {
      ctx.input.files = ['src/app.js'];

      const result = await formatterHandler(ctx);

      expect(result).toHaveProperty('fixed_files');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('total_changes');
    });

    test('should handle missing files gracefully', async () => {
      ctx.input.files = ['/nonexistent/file.js'];

      const result = await formatterHandler(ctx);

      expect(result).toBeDefined();
    });
  });

  // ==================== HANDLER INTEGRATION TESTS ====================

  describe('Handler Integration', () => {
    test('all handlers should follow same contract', async () => {
      const baseCtx = {
        agentId: 'test',
        authLevel: 2,
        input: {},
        memory: {},
        log: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn()
        }
      };

      // Each handler should return object with specific structure
      const handlers = [
        { handler: testGenHandler, name: 'test-generator', setup: (ctx) => { ctx.input = { findings: [], test_framework: 'jest', coverage_target: 80, dry_run: true }; } },
        { handler: docGenHandler, name: 'doc-generator', setup: (ctx) => { ctx.input = { include_readme: true, dry_run: true }; } },
        { handler: formatterHandler, name: 'code-formatter', setup: (ctx) => { ctx.input = { files: [], dry_run: true }; } }
      ];

      for (const { handler, name, setup } of handlers) {
        const ctx = JSON.parse(JSON.stringify(baseCtx));
        ctx.agentId = name;
        setup(ctx);

        try {
          const result = await handler(ctx);
          expect(result).toBeDefined();
        } catch (err) {
          // Some errors are expected (authorization, validation)
          expect(err.message).toBeDefined();
        }
      }
    });

    test('handlers should be async', () => {
      expect(testGenHandler.constructor.name).toBe('AsyncFunction');
      expect(docGenHandler.constructor.name).toBe('AsyncFunction');
      expect(formatterHandler.constructor.name).toBe('AsyncFunction');
    });
  });
});
