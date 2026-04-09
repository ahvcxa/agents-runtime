/**
 * Tests for DecisionEngine and OutputProcessor (Stage 3)
 * 
 * Test Coverage:
 * - DecisionEngine: aggregation, deduplication, false positive filtering, recommendations
 * - OutputProcessor: formatting, coloring, report generation
 */

const DecisionEngine = require('../src/opencode-bridge/decision-engine');
const OutputProcessor = require('../src/opencode-bridge/output-processor');

describe('Stage 3: Decision Engine and Output Processing', () => {
  let decisionEngine;
  let outputProcessor;

  beforeEach(() => {
    decisionEngine = new DecisionEngine({
      enableFalsePositiveFiltering: true
    });
    outputProcessor = new OutputProcessor({
      colorize: false
    });
  });

  // ==================== DecisionEngine Tests ====================

  describe('DecisionEngine', () => {
    describe('aggregateFindings', () => {
      test('should aggregate findings from both sources', () => {
        const analysisResults = {
          codeAnalysis: {
            findings: [
              { file: 'app.js', line: 10, message: 'Unused variable', type: 'unused-variable', severity: 'LOW' }
            ]
          },
          securityAudit: {
            findings: [
              { file: 'db.js', line: 5, message: 'SQL injection risk', type: 'sql-injection', severity: 'CRITICAL' }
            ]
          }
        };

        const result = decisionEngine.aggregateFindings(analysisResults);

        expect(result.totalFindings).toBe(2);
        expect(result.sourceBreakdown.codeAnalysis).toBe(1);
        expect(result.sourceBreakdown.securityAudit).toBe(1);
        expect(result.allFindings.length).toBe(2);
      });

      test('should deduplicate identical findings', () => {
        const analysisResults = {
          codeAnalysis: {
            findings: [
              { file: 'app.js', line: 10, message: 'Duplicate code', type: 'duplicate-code', severity: 'MEDIUM' }
            ]
          },
          securityAudit: {
            findings: [
              { file: 'app.js', line: 10, message: 'Duplicate code', type: 'duplicate-code', severity: 'MEDIUM' }
            ]
          }
        };

        const result = decisionEngine.aggregateFindings(analysisResults);

        expect(result.totalFindings).toBe(1);
        expect(result.deduplicated).toBe(true);
        expect(result.duplicatesRemoved).toBe(1);
        expect(result.allFindings[0].sources).toContain('code-analysis');
        expect(result.allFindings[0].sources).toContain('security-audit');
      });

      test('should filter false positives when enabled', () => {
        const analysisResults = {
          codeAnalysis: {
            findings: [
              { file: 'app.js', line: 10, message: 'Minor whitespace issue', type: 'style', severity: 'LOW' },
              { file: 'app.js', line: 15, message: 'Unused variable x', type: 'unused-variable', severity: 'MEDIUM' }
            ]
          },
          securityAudit: {
            findings: []
          }
        };

        const result = decisionEngine.aggregateFindings(analysisResults);

        // Low severity style issues should be filtered
        expect(result.totalFindings).toBeLessThanOrEqual(2);
      });

      test('should group findings by category and severity', () => {
        const analysisResults = {
          codeAnalysis: {
            findings: [
              { file: 'app.js', line: 10, message: 'Issue 1', category: 'complexity', severity: 'HIGH' },
              { file: 'app.js', line: 20, message: 'Issue 2', category: 'complexity', severity: 'HIGH' },
              { file: 'util.js', line: 5, message: 'Issue 3', category: 'testing', severity: 'MEDIUM' }
            ]
          },
          securityAudit: { findings: [] }
        };

        const result = decisionEngine.aggregateFindings(analysisResults);

        expect(result.byCategory).toHaveProperty('complexity');
        expect(result.byCategory).toHaveProperty('testing');
        expect(result.byCategory.complexity.HIGH.length).toBe(2);
        expect(result.byCategory.testing.MEDIUM.length).toBe(1);
      });
    });

    describe('deduplicate', () => {
      test('should identify duplicate findings', () => {
        const findings = [
          { file: 'app.js', line: 10, message: 'Error', type: 'bug', source: 'source1' },
          { file: 'app.js', line: 10, message: 'Error', type: 'bug', source: 'source2' },
          { file: 'app.js', line: 10, message: 'Error', type: 'bug', source: 'source3' }
        ];

        const dedup = decisionEngine.deduplicate(findings);

        expect(dedup.length).toBe(1);
        expect(dedup[0].sources).toHaveLength(3);
      });

      test('should preserve unique findings', () => {
        const findings = [
          { file: 'app.js', line: 10, message: 'Error 1', type: 'bug' },
          { file: 'app.js', line: 20, message: 'Error 2', type: 'bug' },
          { file: 'util.js', line: 5, message: 'Error 3', type: 'bug' }
        ];

        const dedup = decisionEngine.deduplicate(findings);

        expect(dedup.length).toBe(3);
      });
    });

    describe('filterFalsePositives', () => {
      test('should filter INFO level security findings', () => {
        const findings = [
          { file: 'app.js', line: 10, message: 'Info', severity: 'INFO', originalSource: 'security-audit' },
          { file: 'app.js', line: 20, message: 'Critical', severity: 'CRITICAL', originalSource: 'security-audit' }
        ];

        const filtered = decisionEngine.filterFalsePositives(findings);

        expect(filtered.length).toBe(1);
        expect(filtered[0].severity).toBe('CRITICAL');
      });

      test('should keep security findings with actual severity', () => {
        const findings = [
          { file: 'app.js', line: 10, message: 'SQL injection', severity: 'CRITICAL', originalSource: 'security-audit' },
          { file: 'app.js', line: 20, message: 'XSS vulnerability', severity: 'HIGH', originalSource: 'security-audit' }
        ];

        const filtered = decisionEngine.filterFalsePositives(findings);

        expect(filtered.length).toBe(2);
      });
    });

    describe('generateRecommendations', () => {
      test('should generate recommendations for duplicate code', () => {
        const findings = [
          { file: 'a.js', line: 10, message: 'Duplicate code', type: 'duplicate-code', severity: 'MEDIUM' },
          { file: 'b.js', line: 20, message: 'Duplicate code', type: 'duplicate-code', severity: 'MEDIUM' },
          { file: 'c.js', line: 30, message: 'Duplicate code', type: 'duplicate-code', severity: 'MEDIUM' }
        ];

        const aggregated = {
          allFindings: findings,
          totalFindings: 3
        };

        const recommendations = decisionEngine.generateRecommendations(aggregated);

        expect(recommendations.length).toBeGreaterThan(0);
        const dupRec = recommendations.find(r => r.category === 'duplicate-code');
        expect(dupRec).toBeDefined();
        expect(dupRec.message).toContain('3 instances');
        expect(dupRec.actionItems.length).toBeGreaterThan(0);
      });

      test('should generate recommendations for SQL injection', () => {
        const findings = [
          { file: 'db.js', line: 10, message: 'SQL injection risk', type: 'sql-injection', severity: 'CRITICAL' },
          { file: 'db.js', line: 50, message: 'SQL injection risk', type: 'sql-injection', severity: 'CRITICAL' }
        ];

        const aggregated = {
          allFindings: findings,
          totalFindings: 2
        };

        const recommendations = decisionEngine.generateRecommendations(aggregated);

        const sqlRec = recommendations.find(r => r.category === 'sql-injection');
        expect(sqlRec).toBeDefined();
        expect(sqlRec.actionItems).toContain('Use parameterized queries');
      });

      test('should prioritize recommendations by severity', () => {
        const findings = [
          { file: 'a.js', line: 1, message: 'High issue', severity: 'HIGH' },
          { file: 'b.js', line: 1, message: 'Low issue', severity: 'LOW' }
        ];

        const aggregated = {
          allFindings: findings,
          totalFindings: 2
        };

        const recommendations = decisionEngine.generateRecommendations(aggregated);

        if (recommendations.length > 1) {
          const priorities = recommendations.map(r => r.priority);
          // CRITICAL/HIGH should come before MEDIUM/LOW
          const highIndex = priorities.indexOf('HIGH');
          const lowIndex = priorities.indexOf('LOW');
          if (highIndex >= 0 && lowIndex >= 0) {
            expect(highIndex).toBeLessThan(lowIndex);
          }
        }
      });
    });

    describe('calculateRiskScore', () => {
      test('should calculate risk score based on findings', () => {
        const aggregated = {
          allFindings: [
            { severity: 'CRITICAL' },
            { severity: 'CRITICAL' },
            { severity: 'HIGH' },
            { severity: 'MEDIUM' }
          ],
          totalFindings: 4
        };

        const risk = decisionEngine.calculateRiskScore(aggregated);

        expect(risk.score).toBeGreaterThan(0);
        expect(risk.riskLevel).toBe('CRITICAL');
        expect(risk.breakdown.critical).toBe(2);
        expect(risk.breakdown.high).toBe(1);
        expect(risk.breakdown.medium).toBe(1);
      });

      test('should return LOW risk for minimal findings', () => {
        const aggregated = {
          allFindings: [
            { severity: 'LOW' }
          ],
          totalFindings: 1
        };

        const risk = decisionEngine.calculateRiskScore(aggregated);

        expect(risk.riskLevel).toBe('LOW');
        expect(risk.score).toBeLessThan(30);
      });

      test('should return HIGH risk for multiple high severity findings', () => {
        const aggregated = {
          allFindings: [
            { severity: 'HIGH' },
            { severity: 'HIGH' },
            { severity: 'HIGH' },
            { severity: 'HIGH' }
          ],
          totalFindings: 4
        };

        const risk = decisionEngine.calculateRiskScore(aggregated);

        expect(risk.riskLevel).toBe('HIGH');
        expect(risk.score).toBeGreaterThanOrEqual(50);
      });
    });

    describe('generateActionPlan', () => {
      test('should create action plan with immediate, near-term, and planned phases', () => {
        const aggregated = {
          allFindings: [
            { file: 'a.js', line: 1, severity: 'CRITICAL', originalSource: 'security-audit', message: 'SQL injection' },
            { file: 'b.js', line: 2, severity: 'HIGH', originalSource: 'code-analysis', message: 'High complexity' },
            { file: 'c.js', line: 3, severity: 'MEDIUM', originalSource: 'code-analysis', message: 'Unused var' }
          ],
          totalFindings: 3
        };

        const riskScore = {
          score: 50,
          riskLevel: 'HIGH',
          breakdown: { critical: 1, high: 1, medium: 1 }
        };

        const plan = decisionEngine.generateActionPlan(aggregated, riskScore);

        expect(plan.phases.immediate).toBeDefined();
        expect(plan.phases.nearTerm).toBeDefined();
        expect(plan.phases.planned).toBeDefined();
        expect(plan.totalEstimatedDays).toBeGreaterThan(0);
      });

      test('should prioritize critical security findings', () => {
        const aggregated = {
          allFindings: [
            { file: 'a.js', line: 1, severity: 'CRITICAL', originalSource: 'security-audit', message: 'SQL injection' },
            { file: 'b.js', line: 2, severity: 'CRITICAL', originalSource: 'code-analysis', message: 'Critical bug' }
          ],
          totalFindings: 2
        };

        const riskScore = {
          score: 80,
          riskLevel: 'CRITICAL',
          breakdown: { critical: 2, high: 0, medium: 0 }
        };

        const plan = decisionEngine.generateActionPlan(aggregated, riskScore);

        expect(plan.phases.immediate.length).toBeGreaterThan(0);
      });
    });

    describe('compareResults', () => {
      test('should detect new findings', () => {
        const previous = {
          allFindings: [
            { file: 'a.js', line: 1, message: 'Issue' }
          ],
          totalFindings: 1
        };

        const current = {
          allFindings: [
            { file: 'a.js', line: 1, message: 'Issue' },
            { file: 'b.js', line: 2, message: 'New issue' }
          ],
          totalFindings: 2
        };

        const comparison = decisionEngine.compareResults(previous, current);

        expect(comparison.newFindings).toBe(1);
        expect(comparison.resolvedFindings).toBe(0);
        expect(comparison.trend).toBe('degrading');
      });

      test('should detect resolved findings', () => {
        const previous = {
          allFindings: [
            { file: 'a.js', line: 1, message: 'Issue 1' },
            { file: 'b.js', line: 2, message: 'Issue 2' }
          ],
          totalFindings: 2
        };

        const current = {
          allFindings: [
            { file: 'a.js', line: 1, message: 'Issue 1' }
          ],
          totalFindings: 1
        };

        const comparison = decisionEngine.compareResults(previous, current);

        expect(comparison.newFindings).toBe(0);
        expect(comparison.resolvedFindings).toBe(1);
        expect(comparison.trend).toBe('improving');
      });
    });
  });

  // ==================== OutputProcessor Tests ====================

  describe('OutputProcessor', () => {
    const mockFindings = {
      totalFindings: 3,
      deduplicated: false,
      duplicatesRemoved: 0,
      falsePositivesFiltered: 0,
      sourceBreakdown: { codeAnalysis: 2, securityAudit: 1 },
      allFindings: [
        { file: 'app.js', line: 10, message: 'Issue 1', severity: 'HIGH', category: 'security', originalSource: 'security-audit' },
        { file: 'util.js', line: 20, message: 'Issue 2', severity: 'MEDIUM', category: 'code', originalSource: 'code-analysis' },
        { file: 'app.js', line: 30, message: 'Issue 3', severity: 'LOW', category: 'style', originalSource: 'code-analysis' }
      ],
      byCategory: {
        security: { HIGH: [{ file: 'app.js', line: 10, message: 'Issue 1' }] },
        code: { MEDIUM: [{ file: 'util.js', line: 20, message: 'Issue 2' }] },
        style: { LOW: [{ file: 'app.js', line: 30, message: 'Issue 3' }] }
      }
    };

    const mockRiskScore = {
      score: 42,
      riskLevel: 'MEDIUM',
      breakdown: { critical: 0, high: 1, medium: 1 },
      summary: 'Several issues detected.'
    };

    const mockRecommendations = [
      {
        type: 'finding-type',
        category: 'security',
        priority: 'HIGH',
        message: 'Fix security issues',
        actionItems: ['Use parameterized queries'],
        affectedFindings: [{ file: 'app.js', line: 10 }]
      }
    ];

    describe('formatAsJSON', () => {
      test('should format results as JSON', () => {
        const result = outputProcessor.formatAsJSON(mockFindings, mockRiskScore, mockRecommendations, new Date().toISOString());

        expect(result).toHaveProperty('report');
        expect(result).toHaveProperty('findings');
        expect(result).toHaveProperty('recommendations');
        expect(result.report.summary.totalFindings).toBe(3);
        expect(result.findings.length).toBe(3);
      });

      test('should include metadata when configured', () => {
        const proc = new OutputProcessor({ includeMetadata: true });
        const result = proc.formatAsJSON(mockFindings, mockRiskScore, mockRecommendations, new Date().toISOString());

        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('version');
      });
    });

    describe('formatAsMarkdown', () => {
      test('should format results as Markdown', () => {
        const result = outputProcessor.formatAsMarkdown(mockFindings, mockRiskScore, mockRecommendations, new Date().toISOString());

        expect(typeof result).toBe('string');
        expect(result).toContain('# Code Analysis Report');
        expect(result).toContain('Risk Assessment');
        expect(result).toContain('MEDIUM');
      });

      test('should include recommendations in Markdown', () => {
        const result = outputProcessor.formatAsMarkdown(mockFindings, mockRiskScore, mockRecommendations, new Date().toISOString());

        expect(result).toContain('Recommendations');
        expect(result).toContain('Use parameterized queries');
      });
    });

    describe('formatAsText', () => {
      test('should format results as plain text', () => {
        const result = outputProcessor.formatAsText(mockFindings, mockRiskScore, mockRecommendations, new Date().toISOString());

        expect(typeof result).toBe('string');
        expect(result).toContain('CODE ANALYSIS REPORT');
        expect(result).toContain('Risk Level: MEDIUM');
      });

      test('should include summary statistics in text', () => {
        const result = outputProcessor.formatAsText(mockFindings, mockRiskScore, mockRecommendations, new Date().toISOString());

        expect(result).toContain('Total Findings: 3');
        expect(result).toContain('Security Audit: 1');
      });
    });

    describe('formatAsHTML', () => {
      test('should format results as HTML', () => {
        const result = outputProcessor.formatAsHTML(mockFindings, mockRiskScore, mockRecommendations, new Date().toISOString());

        expect(typeof result).toBe('string');
        expect(result).toContain('<!DOCTYPE html>');
        expect(result).toContain('<table>');
        expect(result).toContain('Code Analysis Report');
      });

      test('should escape HTML special characters', () => {
        const findings = {
          ...mockFindings,
          allFindings: [
            { file: 'app.js', line: 10, message: '<script>alert("xss")</script>', severity: 'HIGH', category: 'security', originalSource: 'security-audit' }
          ]
        };

        const result = outputProcessor.formatAsHTML(findings, mockRiskScore, mockRecommendations, new Date().toISOString());

        expect(result).toContain('&lt;script&gt;');
        expect(result).not.toContain('<script>alert');
      });
    });

    describe('createQuickSummary', () => {
      test('should create a quick summary', () => {
        const summary = outputProcessor.createQuickSummary(mockFindings, mockRiskScore);

        expect(summary).toHaveProperty('riskLevel');
        expect(summary).toHaveProperty('score');
        expect(summary).toHaveProperty('totalFindings');
        expect(summary).toHaveProperty('topFindingsByFile');
        expect(summary.riskLevel).toBe('MEDIUM');
        expect(summary.score).toBe(42);
        expect(summary.totalFindings).toBe(3);
      });
    });

    describe('formatResults', () => {
      test('should format in JSON format', () => {
        const result = outputProcessor.formatResults(mockFindings, mockRiskScore, mockRecommendations, 'json');
        expect(result).toHaveProperty('report');
      });

      test('should format in Markdown format', () => {
        const result = outputProcessor.formatResults(mockFindings, mockRiskScore, mockRecommendations, 'markdown');
        expect(typeof result).toBe('string');
        expect(result).toContain('#');
      });

      test('should throw for unsupported format', () => {
        expect(() => {
          outputProcessor.formatResults(mockFindings, mockRiskScore, mockRecommendations, 'xml');
        }).toThrow();
      });
    });

    describe('getRiskColor', () => {
      test('should return appropriate color for risk level', () => {
        expect(outputProcessor.getRiskColor('CRITICAL')).toBe('red');
        expect(outputProcessor.getRiskColor('HIGH')).toBe('orange');
        expect(outputProcessor.getRiskColor('MEDIUM')).toBe('yellow');
        expect(outputProcessor.getRiskColor('LOW')).toBe('green');
      });
    });
  });
});
