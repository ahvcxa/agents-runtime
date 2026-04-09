/**
 * Tests for AnalysisCLI and ReportGenerator (Stage 4)
 * 
 * Test Coverage:
 * - AnalysisCLI: analyze, audit, suggestRefactoring, inspect, compare commands
 * - ReportGenerator: executive summary, technical report, trend analysis, HTML generation
 */

const AnalysisCLI = require('../src/opencode-bridge/cli');
const ReportGenerator = require('../src/opencode-bridge/report-generator');
const path = require('path');

describe('Stage 4: CLI and Report Generation', () => {
  let cli;
  let reportGenerator;

  beforeEach(() => {
    cli = new AnalysisCLI({
      projectPath: process.cwd(),
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
      }
    });

    reportGenerator = new ReportGenerator({
      organization: 'Test Org'
    });
  });

  // ==================== AnalysisCLI Tests ====================

  describe('AnalysisCLI', () => {
    describe('initialization', () => {
      test('should initialize with default options', () => {
        expect(cli.projectPath).toBeDefined();
        expect(cli.outputFormat).toBe('markdown');
        expect(cli.agentBridge).toBeDefined();
      });

      test('should initialize with custom options', () => {
        const customCLI = new AnalysisCLI({
          outputFormat: 'json',
          outputFile: '/tmp/report.json'
        });

        expect(customCLI.outputFormat).toBe('json');
        expect(customCLI.outputFile).toBe('/tmp/report.json');
      });
    });

    describe('detectLanguage', () => {
      test('should detect JavaScript files', () => {
        expect(cli.detectLanguage('app.js')).toBe('JavaScript');
      });

      test('should detect TypeScript files', () => {
        expect(cli.detectLanguage('app.ts')).toBe('TypeScript');
      });

      test('should detect Python files', () => {
        expect(cli.detectLanguage('script.py')).toBe('Python');
      });

      test('should return Unknown for unrecognized extensions', () => {
        expect(cli.detectLanguage('file.xyz')).toBe('Unknown');
      });
    });

    describe('identifyRefactoringFocusAreas', () => {
      test('should group recommendations by category', () => {
        const recommendations = [
          { category: 'duplicate', actionItems: ['Extract method', 'Create shared util'] },
          { category: 'complexity', actionItems: ['Break into smaller functions'] },
          { category: 'duplicate', actionItems: ['DRY principle'] }
        ];

        const focusAreas = cli.identifyRefactoringFocusAreas(recommendations);

        expect(focusAreas).toHaveProperty('duplicate');
        expect(focusAreas).toHaveProperty('complexity');
        expect(focusAreas.duplicate).toHaveLength(2);
      });
    });

    describe('formatMarkdownReport', () => {
      test('should format comparison results', () => {
        const result = {
          type: 'comparison',
          trend: 'improving',
          improvement: 5,
          comparison: {
            newFindings: 2,
            resolvedFindings: 7,
            summary: 'Code quality improving'
          }
        };

        const formatted = cli.formatMarkdownReport(result);

        expect(typeof formatted).toBe('string');
        expect(formatted).toContain('Improving');
        expect(formatted).toContain('+5');
      });

      test('should format analysis results with findings', () => {
        const result = {
          type: 'analysis',
          analysis: {
            aggregated: {
              totalFindings: 5,
              sourceBreakdown: { codeAnalysis: 3, securityAudit: 2 },
              byCategory: {},
              allFindings: []
            },
            riskScore: {
              score: 45,
              riskLevel: 'MEDIUM',
              breakdown: { critical: 0, high: 1, medium: 2 },
              summary: 'Several issues detected'
            },
            recommendations: []
          }
        };

        const formatted = cli.formatMarkdownReport(result);

        expect(typeof formatted).toBe('string');
        expect(formatted).toContain('Code Analysis Report');
      });
    });

    describe('formatTextReport', () => {
      test('should format results as plain text', () => {
        const result = {
          type: 'analysis',
          analysis: {
            aggregated: {
              totalFindings: 3,
              sourceBreakdown: { codeAnalysis: 2, securityAudit: 1 },
              byCategory: {},
              allFindings: []
            },
            riskScore: {
              score: 50,
              riskLevel: 'HIGH',
              breakdown: { critical: 0, high: 2, medium: 1 },
              summary: 'High risk'
            },
            recommendations: []
          }
        };

        const formatted = cli.formatTextReport(result);

        expect(typeof formatted).toBe('string');
        expect(formatted).toContain('Risk Level: HIGH');
        expect(formatted).toContain('Total Findings');
      });

      test('should format comparison text report', () => {
        const result = {
          type: 'comparison',
          trend: 'degrading',
          improvement: -3,
          comparison: {
            newFindings: 5,
            resolvedFindings: 2,
            summary: 'Code quality declining'
          }
        };

        const formatted = cli.formatTextReport(result);

        expect(typeof formatted).toBe('string');
        expect(formatted).toContain('degrading');
        expect(formatted).toContain('5');
      });
    });
  });

  // ==================== ReportGenerator Tests ====================

  describe('ReportGenerator', () => {
    const mockAggregated = {
      totalFindings: 8,
      duplicatesRemoved: 1,
      falsePositivesFiltered: 0,
      sourceBreakdown: { codeAnalysis: 5, securityAudit: 3 },
      allFindings: [
        { file: 'app.js', line: 10, message: 'Critical issue', severity: 'CRITICAL', originalSource: 'security-audit' },
        { file: 'util.js', line: 20, message: 'High complexity', severity: 'HIGH', originalSource: 'code-analysis' },
        { file: 'db.js', line: 30, message: 'SQL injection', severity: 'HIGH', originalSource: 'security-audit' }
      ],
      byCategory: {
        security: {
          CRITICAL: [{ file: 'app.js', line: 10, message: 'Critical issue' }],
          HIGH: [{ file: 'db.js', line: 30, message: 'SQL injection' }]
        },
        code: {
          HIGH: [{ file: 'util.js', line: 20, message: 'High complexity' }]
        }
      }
    };

    const mockRiskScore = {
      score: 65,
      riskLevel: 'HIGH',
      breakdown: { critical: 1, high: 2, medium: 0 },
      summary: 'One critical and two high-severity issues detected. Immediate action required.'
    };

    const mockRecommendations = [
      {
        type: 'finding-type',
        category: 'sql-injection',
        priority: 'HIGH',
        message: 'Fix SQL injection vulnerabilities',
        actionItems: ['Use parameterized queries', 'Sanitize input']
      }
    ];

    describe('generateExecutiveSummary', () => {
      test('should generate executive summary', () => {
        const summary = reportGenerator.generateExecutiveSummary(mockAggregated, mockRiskScore);

        expect(typeof summary).toBe('string');
        expect(summary).toContain('EXECUTIVE SUMMARY');
        expect(summary).toContain('HIGH');
        expect(summary).toContain('65/100');
      });

      test('should include critical findings warning', () => {
        const summary = reportGenerator.generateExecutiveSummary(mockAggregated, mockRiskScore);

        expect(summary).toContain('ACTION REQUIRED');
        expect(summary).toContain('critical');
      });

      test('should include metrics breakdown', () => {
        const summary = reportGenerator.generateExecutiveSummary(mockAggregated, mockRiskScore);

        expect(summary).toContain('Total Issues Identified');
        expect(summary).toContain('Critical');
        expect(summary).toContain('High');
      });
    });

    describe('generateTechnicalReport', () => {
      test('should generate technical report', () => {
        const result = {
          path: '/project',
          timestamp: new Date().toISOString(),
          analysis: {
            aggregated: mockAggregated,
            riskScore: mockRiskScore,
            recommendations: mockRecommendations,
            actionPlan: {
              phases: {
                immediate: [{ description: 'Fix critical issue' }],
                nearTerm: [{ description: 'Address high severity' }],
                planned: []
              }
            }
          }
        };

        const report = reportGenerator.generateTechnicalReport(result);

        expect(typeof report).toBe('string');
        expect(report).toContain('CODE ANALYSIS TECHNICAL REPORT');
        expect(report).toContain('DETAILED FINDINGS');
        expect(report).toContain('SECURITY');
        expect(report).toContain('CODE');
      });

      test('should include action plan sections', () => {
        const result = {
          path: '/project',
          timestamp: new Date().toISOString(),
          analysis: {
            aggregated: mockAggregated,
            riskScore: mockRiskScore,
            recommendations: [],
            actionPlan: {
              phases: {
                immediate: [{ description: 'Fix now' }],
                nearTerm: [{ description: 'Fix soon' }],
                planned: [{ description: 'Fix later' }]
              }
            }
          }
        };

        const report = reportGenerator.generateTechnicalReport(result);

        expect(report).toContain('IMMEDIATE');
        expect(report).toContain('NEAR-TERM');
        expect(report).toContain('PLANNED');
      });
    });

    describe('generateSecurityReport', () => {
      test('should generate security report', () => {
        const result = {
          path: '/secure-project',
          timestamp: new Date().toISOString(),
          audit: {
            aggregated: mockAggregated,
            riskScore: mockRiskScore,
            recommendations: mockRecommendations
          }
        };

        const report = reportGenerator.generateSecurityReport(result);

        expect(typeof report).toBe('string');
        expect(report).toContain('SECURITY AUDIT REPORT');
        expect(report).toContain('VULNERABILITY BREAKDOWN');
      });

      test('should handle no security findings', () => {
        const emptyAggregated = { ...mockAggregated, allFindings: [] };
        const result = {
          path: '/secure-project',
          timestamp: new Date().toISOString(),
          audit: {
            aggregated: emptyAggregated,
            riskScore: { ...mockRiskScore, riskLevel: 'LOW', score: 5 },
            recommendations: []
          }
        };

        const report = reportGenerator.generateSecurityReport(result);

        expect(report).toContain('No security issues detected');
      });
    });

    describe('generateTrendReport', () => {
      test('should generate trend report from history', () => {
        const history = [
          {
            timestamp: '2024-01-01',
            analysis: {
              riskScore: { score: 80, breakdown: { critical: 2, high: 1 } },
              aggregated: { totalFindings: 10 }
            }
          },
          {
            timestamp: '2024-01-15',
            analysis: {
              riskScore: { score: 60, breakdown: { critical: 1, high: 2 } },
              aggregated: { totalFindings: 8 }
            }
          },
          {
            timestamp: '2024-02-01',
            analysis: {
              riskScore: { score: 45, breakdown: { critical: 0, high: 1 } },
              aggregated: { totalFindings: 5 }
            }
          }
        ];

        const report = reportGenerator.generateTrendReport(history);

        expect(typeof report).toBe('string');
        expect(report).toContain('CODE QUALITY TREND ANALYSIS');
        expect(report).toContain('IMPROVING');
      });

      test('should detect degrading trend', () => {
        const history = [
          {
            timestamp: '2024-01-01',
            analysis: {
              riskScore: { score: 30, breakdown: { critical: 0, high: 1 } },
              aggregated: { totalFindings: 3 }
            }
          },
          {
            timestamp: '2024-02-01',
            analysis: {
              riskScore: { score: 70, breakdown: { critical: 2, high: 2 } },
              aggregated: { totalFindings: 12 }
            }
          }
        ];

        const report = reportGenerator.generateTrendReport(history);

        expect(report).toContain('DEGRADING');
      });

      test('should handle insufficient history', () => {
        const history = [
          {
            timestamp: '2024-01-01',
            analysis: {
              riskScore: { score: 50 },
              aggregated: { totalFindings: 5 }
            }
          }
        ];

        const report = reportGenerator.generateTrendReport(history);

        expect(report).toContain('Insufficient history');
      });
    });

    describe('generateHTMLReport', () => {
      test('should generate HTML report', () => {
        const result = {
          path: '/project',
          timestamp: new Date().toISOString(),
          analysis: {
            aggregated: mockAggregated,
            riskScore: mockRiskScore
          }
        };

        const html = reportGenerator.generateHTMLReport(result);

        expect(typeof html).toBe('string');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<table>');
        expect(html).toContain('Code Analysis Report');
        expect(html).toContain('HIGH');
      });

      test('should properly escape HTML entities', () => {
        const dangerousAggregated = {
          ...mockAggregated,
          allFindings: [
            { file: 'app.js', line: 10, message: '<script>alert("xss")</script>', severity: 'HIGH', originalSource: 'code' }
          ]
        };

        const result = {
          path: '/project',
          timestamp: new Date().toISOString(),
          analysis: {
            aggregated: dangerousAggregated,
            riskScore: mockRiskScore
          }
        };

        const html = reportGenerator.generateHTMLReport(result);

        expect(html).not.toContain('<script>alert');
        expect(html).toContain('&lt;script&gt;');
      });

      test('should include metrics in HTML', () => {
        const result = {
          path: '/project',
          timestamp: new Date().toISOString(),
          analysis: {
            aggregated: mockAggregated,
            riskScore: mockRiskScore
          }
        };

        const html = reportGenerator.generateHTMLReport(result);

        expect(html).toContain('65'); // risk score
        expect(html).toContain('8'); // total findings
      });
    });

    describe('getRiskColor', () => {
      test('should return appropriate color for each risk level', () => {
        expect(reportGenerator.getRiskColor('CRITICAL')).toBe('#c00');
        expect(reportGenerator.getRiskColor('HIGH')).toBe('#f60');
        expect(reportGenerator.getRiskColor('MEDIUM')).toBe('#fc0');
        expect(reportGenerator.getRiskColor('LOW')).toBe('#0c0');
      });

      test('should return default color for unknown level', () => {
        expect(reportGenerator.getRiskColor('UNKNOWN')).toBe('#999');
      });
    });
  });
});
