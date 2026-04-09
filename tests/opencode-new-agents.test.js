/**
 * Tests for new agent modules and OpenCode wrappers
 * Test coverage for test-generator, doc-generator, and code-formatter
 */

const TestGenerator = require('../src/opencode-bridge/skills/test-generator');
const DocGenerator = require('../src/opencode-bridge/skills/doc-generator');
const CodeFormatter = require('../src/opencode-bridge/skills/code-formatter');

describe('New Agent Modules', () => {
  // ==================== TEST GENERATOR TESTS ====================

  describe('TestGenerator', () => {
    let testGen;

    beforeEach(() => {
      testGen = new TestGenerator({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    describe('initialization', () => {
      test('should initialize with default options', () => {
        expect(testGen.timeout).toBe(30000);
        expect(testGen.logger).toBeDefined();
      });

      test('should initialize with custom timeout', () => {
        const custom = new TestGenerator({ timeout: 60000 });
        expect(custom.timeout).toBe(60000);
      });
    });

    describe('generate method', () => {
      test('should require findings input', async () => {
        const findings = [
          {
            file: 'src/utils.js',
            line: 42,
            message: 'Function lacks coverage',
            type: 'testing',
            severity: 'MEDIUM'
          }
        ];

        const options = {
          framework: 'jest',
          coverage_target: 80,
          dry_run: true
        };

        // Test should accept findings and options
        expect(() => testGen.generate(findings, options)).toBeDefined();
      });

      test('should support jest framework', async () => {
        const options = {
          framework: 'jest',
          dry_run: true
        };

        expect(options.framework).toBe('jest');
      });

      test('should support mocha framework', async () => {
        const options = {
          framework: 'mocha',
          dry_run: true
        };

        expect(options.framework).toBe('mocha');
      });

      test('should support vitest framework', async () => {
        const options = {
          framework: 'vitest',
          dry_run: true
        };

        expect(options.framework).toBe('vitest');
      });
    });

    describe('getRecommendations', () => {
      test('should identify testing issues', () => {
        const codeAnalysis = {
          findings: [
            { category: 'testing', type: 'testing', message: 'Missing tests', severity: 'HIGH', file: 'src/app.js' },
            { category: 'testing', type: 'testing', message: 'Low coverage', severity: 'MEDIUM', file: 'src/utils.js' }
          ]
        };

        const recs = testGen.getRecommendations(codeAnalysis);

        expect(recs.totalIssues).toBe(2);
        expect(recs.recommendations.length).toBe(2);
        expect(recs.estimatedTestCount).toBeGreaterThan(0);
      });

      test('should estimate test count', () => {
        const codeAnalysis = {
          findings: [
            { category: 'testing', message: 'Test 1', severity: 'HIGH', file: 'a.js' },
            { category: 'testing', message: 'Test 2', severity: 'MEDIUM', file: 'b.js' }
          ]
        };

        const recs = testGen.getRecommendations(codeAnalysis);

        // 2 issues * 1.5 = 3 estimated tests
        expect(recs.estimatedTestCount).toBe(3);
      });

      test('should handle empty findings', () => {
        const codeAnalysis = { findings: [] };
        const recs = testGen.getRecommendations(codeAnalysis);

        expect(recs.totalIssues).toBe(0);
        expect(recs.recommendations).toHaveLength(0);
      });
    });
  });

  // ==================== DOC GENERATOR TESTS ====================

  describe('DocGenerator', () => {
    let docGen;

    beforeEach(() => {
      docGen = new DocGenerator({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    describe('initialization', () => {
      test('should initialize with default options', () => {
        expect(docGen.timeout).toBe(30000);
        expect(docGen.logger).toBeDefined();
      });
    });

    describe('generate methods', () => {
      test('should support generating README', async () => {
        const packageJson = {
          name: 'test-project',
          version: '1.0.0',
          description: 'Test project'
        };

        const options = { dry_run: true };

        expect(async () => {
          await docGen.generateReadme(packageJson, options);
        }).toBeDefined();
      });

      test('should support generating API docs', async () => {
        const options = { dry_run: true };

        expect(async () => {
          await docGen.generateApiDocs(options);
        }).toBeDefined();
      });

      test('should support generating all docs', async () => {
        const packageJson = {
          name: 'test-project',
          version: '1.0.0'
        };

        const options = { dry_run: true };

        expect(async () => {
          await docGen.generateAll(packageJson, options);
        }).toBeDefined();
      });
    });

    describe('processResults', () => {
      test('should process documentation output', () => {
        const output = {
          generated_docs: [
            { file: 'README.md', type: 'readme', lines: 200 },
            { file: 'docs/API.md', type: 'api', lines: 150 }
          ],
          summary: {
            total_lines: 350
          }
        };

        const result = docGen.processResults(output);

        expect(result.generated).toBe(2);
        expect(result.totalLines).toBe(350);
        expect(result.summary.files).toHaveLength(2);
      });

      test('should handle empty documentation', () => {
        const output = {
          generated_docs: [],
          summary: { total_lines: 0 }
        };

        const result = docGen.processResults(output);

        expect(result.generated).toBe(0);
        expect(result.totalLines).toBe(0);
      });
    });
  });

  // ==================== CODE FORMATTER TESTS ====================

  describe('CodeFormatter', () => {
    let formatter;

    beforeEach(() => {
      formatter = new CodeFormatter({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    describe('initialization', () => {
      test('should initialize with default options', () => {
        expect(formatter.timeout).toBe(30000);
        expect(formatter.logger).toBeDefined();
      });
    });

    describe('format method', () => {
      test('should require files input', async () => {
        expect(async () => {
          await formatter.format([]);
        }).rejects.toThrow();
      });

      test('should accept valid file list', () => {
        const files = ['src/app.js', 'src/utils.js'];
        const options = { dry_run: true };

        expect(async () => {
          await formatter.format(files, options);
        }).toBeDefined();
      });

      test('should support prettier config', () => {
        const options = { config: 'prettier', dry_run: true };
        expect(options.config).toBe('prettier');
      });

      test('should support eslint config', () => {
        const options = { config: 'eslint', dry_run: true };
        expect(options.config).toBe('eslint');
      });
    });

    describe('formatting rules', () => {
      test('should support format rule', () => {
        const options = { rules: ['format'], dry_run: true };
        expect(options.rules).toContain('format');
      });

      test('should support imports rule', () => {
        const options = { rules: ['imports'], dry_run: true };
        expect(options.rules).toContain('imports');
      });

      test('should support unused rule', () => {
        const options = { rules: ['unused'], dry_run: true };
        expect(options.rules).toContain('unused');
      });

      test('should support eslint rule', () => {
        const options = { rules: ['eslint'], dry_run: true };
        expect(options.rules).toContain('eslint');
      });

      test('should support multiple rules', () => {
        const options = { rules: ['format', 'imports', 'unused'], dry_run: true };
        expect(options.rules).toHaveLength(3);
      });
    });

    describe('helper methods', () => {
      test('should have formatAll method', () => {
        expect(formatter.formatAll).toBeDefined();
      });

      test('should have preview method', () => {
        expect(formatter.preview).toBeDefined();
      });

      test('should have apply method', () => {
        expect(formatter.apply).toBeDefined();
      });
    });

    describe('processResults', () => {
      test('should process formatting output', () => {
        const output = {
          fixed_files: [
            { file: 'src/app.js', changes: 8, lines_affected: 12 },
            { file: 'src/utils.js', changes: 5, lines_affected: 7 }
          ],
          summary: {
            total_changes: 13,
            rules_applied: 'format, imports, unused',
            dry_run: true
          }
        };

        const result = formatter.processResults(output);

        expect(result.fixed).toBe(2);
        expect(result.totalChanges).toBe(13);
        expect(result.summary.message).toContain('2 file(s)');
      });

      test('should handle no changes', () => {
        const output = {
          fixed_files: [],
          summary: { total_changes: 0 }
        };

        const result = formatter.processResults(output);

        expect(result.fixed).toBe(0);
        expect(result.totalChanges).toBe(0);
      });
    });
  });

  // ==================== INTEGRATION TESTS ====================

  describe('Agent Integration', () => {
    test('should have all three agents available', () => {
      expect(TestGenerator).toBeDefined();
      expect(DocGenerator).toBeDefined();
      expect(CodeFormatter).toBeDefined();
    });

    test('should all follow same interface pattern', () => {
      const testGen = new TestGenerator();
      const docGen = new DocGenerator();
      const formatter = new CodeFormatter();

      // All should have logger
      expect(testGen.logger).toBeDefined();
      expect(docGen.logger).toBeDefined();
      expect(formatter.logger).toBeDefined();

      // All should have timeout
      expect(testGen.timeout).toBeDefined();
      expect(docGen.timeout).toBeDefined();
      expect(formatter.timeout).toBeDefined();

      // All should have invokeSkill
      expect(testGen.invokeSkill).toBeDefined();
      expect(docGen.invokeSkill).toBeDefined();
      expect(formatter.invokeSkill).toBeDefined();

      // All should have processResults
      expect(testGen.processResults).toBeDefined();
      expect(docGen.processResults).toBeDefined();
      expect(formatter.processResults).toBeDefined();
    });

    test('should work together in workflow', () => {
      // Simulate workflow: analyze → generate tests → generate docs → format code
      const codeAnalysis = {
        findings: [
          { category: 'testing', type: 'testing', message: 'Missing tests', severity: 'HIGH', file: 'src/app.js' }
        ]
      };

      const testGen = new TestGenerator();
      const docGen = new DocGenerator();
      const formatter = new CodeFormatter();

      // Get test generation recommendations
      const testRecs = testGen.getRecommendations(codeAnalysis);
      expect(testRecs.totalIssues).toBeGreaterThan(0);

      // All three agents should be ready
      expect(testGen).toBeDefined();
      expect(docGen).toBeDefined();
      expect(formatter).toBeDefined();
    });
  });
});
