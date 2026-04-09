/**
 * Stage 2 Skills Tests
 * CodeAnalyzer and SecurityAuditor wrapper tests
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');
const CodeAnalyzer = require('../src/opencode-bridge/skills/code-analyzer');
const SecurityAuditor = require('../src/opencode-bridge/skills/security-auditor');

describe('CodeAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new CodeAnalyzer({}, console);
  });

  it('should initialize properly', () => {
    expect(analyzer).toBeDefined();
    expect(analyzer.constraints).toBeDefined();
  });

  it('should process findings by category', () => {
    const mockResult = {
      findings: [
        { id: '1', category: 'complexity', severity: 'HIGH', rule: 'cyclomatic-complexity' },
        { id: '2', category: 'duplication', severity: 'MEDIUM', rule: 'code-duplication' },
        { id: '3', category: 'complexity', severity: 'MEDIUM', rule: 'cognitive-complexity' },
        { id: '4', category: 'testing', severity: 'LOW', rule: 'untested-function' }
      ],
      metrics: { averageComplexity: 8, duplicationPercentage: 3 }
    };

    const processed = analyzer.processFindings(mockResult);

    expect(processed.byCategory.complexity).toHaveLength(2);
    expect(processed.byCategory.duplication).toHaveLength(1);
    expect(processed.byCategory.testing).toHaveLength(1);
    expect(processed.total).toBe(4);
  });

  it('should sort findings by severity within categories', () => {
    const mockResult = {
      findings: [
        { id: '1', category: 'complexity', severity: 'LOW', rule: 'test1' },
        { id: '2', category: 'complexity', severity: 'HIGH', rule: 'test2' },
        { id: '3', category: 'complexity', severity: 'MEDIUM', rule: 'test3' }
      ],
      metrics: {}
    };

    const processed = analyzer.processFindings(mockResult);
    const complexityFindings = processed.byCategory.complexity;

    expect(complexityFindings[0].severity).toBe('HIGH');
    expect(complexityFindings[1].severity).toBe('MEDIUM');
    expect(complexityFindings[2].severity).toBe('LOW');
  });

  it('should generate summary with recommendations', () => {
    const processed = {
      byCategory: {
        complexity: [
          { id: '1', severity: 'CRITICAL' },
          { id: '2', severity: 'HIGH' }
        ],
        duplication: [
          { id: '3', severity: 'MEDIUM' }
        ],
        testing: [
          { id: '4', severity: 'MEDIUM' }
        ],
        style: [],
        other: []
      },
      metrics: { averageComplexity: 12 },
      total: 4
    };

    const summary = analyzer.generateSummary(processed);

    expect(summary.overallScore).toBeDefined();
    expect(summary.totalIssues).toBe(4);
    expect(summary.recommendations.length).toBeGreaterThan(0);
  });

  it('should calculate quality score correctly', () => {
    const score1 = analyzer.calculateQualityScore({ averageComplexity: 5 }, 0);
    const score2 = analyzer.calculateQualityScore({ averageComplexity: 15 }, 5);

    expect(score1).toBeGreaterThan(score2);
    expect(score1).toBeGreaterThan(0);
    expect(score2).toBeGreaterThanOrEqual(0);
  });

  it('should require runtime client for analysis', async () => {
    await expect(
      analyzer.analyze('src/test.js')
    ).rejects.toThrow('RuntimeClient not initialized');
  });
});

describe('SecurityAuditor', () => {
  let auditor;

  beforeEach(() => {
    auditor = new SecurityAuditor({}, console);
  });

  it('should initialize properly', () => {
    expect(auditor).toBeDefined();
    expect(auditor.OWASP_TOP_10).toHaveLength(10);
  });

  it('should process findings by severity', () => {
    const mockResult = {
      findings: [
        { id: '1', severity: 'CRITICAL', rule: 'sql-injection' },
        { id: '2', severity: 'HIGH', rule: 'xss' },
        { id: '3', severity: 'HIGH', rule: 'auth-bypass' },
        { id: '4', severity: 'MEDIUM', rule: 'weak-encryption' },
        { id: '5', severity: 'LOW', rule: 'deprecated-api' }
      ]
    };

    const processed = auditor.processFindings(mockResult);

    expect(processed.bySeverity.CRITICAL).toHaveLength(1);
    expect(processed.bySeverity.HIGH).toHaveLength(2);
    expect(processed.bySeverity.MEDIUM).toHaveLength(1);
    expect(processed.bySeverity.LOW).toHaveLength(1);
    expect(processed.total).toBe(5);
  });

  it('should remove duplicate findings', () => {
    const mockResult = {
      findings: [
        { file: 'test.js', line: 10, rule: 'sql-injection', severity: 'CRITICAL' },
        { file: 'test.js', line: 10, rule: 'sql-injection', severity: 'CRITICAL' }, // duplicate
        { file: 'test.js', line: 15, rule: 'xss', severity: 'HIGH' }
      ]
    };

    const processed = auditor.processFindings(mockResult);

    expect(processed.bySeverity.CRITICAL).toHaveLength(1);
    expect(processed.bySeverity.HIGH).toHaveLength(1);
  });

  it('should map findings to OWASP Top 10', () => {
    const processed = {
      findings: [
        { id: '1', rule: 'sql-injection', severity: 'CRITICAL' },
        { id: '2', rule: 'xss', severity: 'HIGH' },
        { id: '3', rule: 'weak-auth', severity: 'HIGH' },
        { id: '4', rule: 'ssl-missing', severity: 'MEDIUM' }
      ],
      bySeverity: { CRITICAL: [1], HIGH: [2, 3], MEDIUM: [4], LOW: [], INFO: [] }
    };

    const withOWASP = auditor.mapToOWASP(processed);

    expect(withOWASP.findings[0].owaspCategory).toBe('Injection');
    expect(withOWASP.findings[1].owaspCategory).toBe('Cross-Site Scripting');
    expect(withOWASP.findings[2].owaspCategory).toBe('Broken Authentication');
    expect(withOWASP.findings[3].owaspCategory).toBe('Sensitive Data Exposure');
  });

  it('should generate critical recommendations for critical findings', () => {
    const withOWASP = {
      bySeverity: { CRITICAL: [1, 2], HIGH: [], MEDIUM: [], LOW: [], INFO: [] },
      byOWASP: { 'Injection': [1, 2] },
      findings: []
    };

    const recommendations = auditor.generateSecurityRecommendations(withOWASP);

    const criticalRec = recommendations.find(r => r.priority === 'CRITICAL');
    expect(criticalRec).toBeDefined();
    expect(criticalRec.message).toContain('2 critical');
  });

  it('should generate summary with risk level assessment', () => {
    const withOWASP = {
      summary: { critical: 0, high: 2, medium: 5, low: 10, info: 0 },
      bySeverity: { CRITICAL: [], HIGH: [1, 2], MEDIUM: [1, 2, 3, 4, 5], LOW: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
    };
    const recommendations = [];

    const summary = auditor.generateSummary(withOWASP, recommendations);

    expect(summary.overallRiskLevel).toBe('HIGH');
    expect(summary.securityScore).toBeLessThan(100);
    expect(summary.securityScore).toBeGreaterThanOrEqual(0);
  });

  it('should rate CRITICAL risk level for critical findings', () => {
    const withOWASP = {
      summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      bySeverity: { CRITICAL: [1], HIGH: [], MEDIUM: [], LOW: [] }
    };
    const recommendations = [];

    const summary = auditor.generateSummary(withOWASP, recommendations);

    expect(summary.overallRiskLevel).toBe('CRITICAL');
  });

  it('should require runtime client for audit', async () => {
    await expect(
      auditor.audit('src/test.js')
    ).rejects.toThrow('RuntimeClient not initialized');
  });
});
