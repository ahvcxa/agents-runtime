/**
 * Agent Bridge Tests
 * Comprehensive test suite for constraint enforcement and skill invocation
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const ConstraintValidator = require('../src/opencode-bridge/agent-bridge/constraint-validator');
const RuntimeClient = require('../src/opencode-bridge/agent-bridge/runtime-client');
const AgentBridge = require('../src/opencode-bridge/agent-bridge/index');
const {
  ConstraintViolationError,
  ValidationError,
  SecretDetectionError
} = require('../src/opencode-bridge/agent-bridge/errors');

describe('ConstraintValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new ConstraintValidator({}, console);
  });

  describe('Hard Constraints', () => {
    it('should throw if canWrite=true', () => {
      const badConstraints = new ConstraintValidator({
        files: { canWrite: true }
      }, console);

      expect(() => badConstraints.validateHardConstraints()).toThrow(
        ConstraintViolationError
      );
    });

    it('should throw if canExecute=true', () => {
      const badConstraints = new ConstraintValidator({
        execution: { canExecute: true }
      }, console);

      expect(() => badConstraints.validateHardConstraints()).toThrow(
        ConstraintViolationError
      );
    });

    it('should throw if canAccessSecrets=true', () => {
      const badConstraints = new ConstraintValidator({
        data: { canAccessSecrets: true }
      }, console);

      expect(() => badConstraints.validateHardConstraints()).toThrow(
        ConstraintViolationError
      );
    });

    it('should pass with proper constraints', () => {
      expect(() => validator.validateHardConstraints()).not.toThrow();
    });
  });

  describe('File Path Validation', () => {
    it('should allow normal file paths', () => {
      expect(() => validator.isFilePathAllowed('src/index.js')).not.toThrow();
      expect(() => validator.isFilePathAllowed('src/components/App.tsx')).not.toThrow();
    });

    it('should block .env files', () => {
      expect(() => validator.isFilePathAllowed('.env')).toThrow(
        ConstraintViolationError
      );
      expect(() => validator.isFilePathAllowed('.env.local')).toThrow(
        ConstraintViolationError
      );
    });

    it('should block path traversal', () => {
      expect(() => validator.isFilePathAllowed('../../.env')).toThrow(
        ConstraintViolationError
      );
    });
  });

  describe('Secret Detection', () => {
    it('should detect password patterns', () => {
      const output = { password: 'my-secret-pass' };

      expect(() => validator.validateOutput(output)).toThrow(
        SecretDetectionError
      );
    });

    it('should detect API keys', () => {
      const output = { api_key: 'sk_test_abc123def456' };

      expect(() => validator.validateOutput(output)).toThrow(
        SecretDetectionError
      );
    });

    it('should detect bearer tokens', () => {
      const output = { auth: 'bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' };

      expect(() => validator.validateOutput(output)).toThrow(
        SecretDetectionError
      );
    });

    it('should strip secrets from output', () => {
      const output = { password: 'my-secret-pass', username: 'john' };
      const stripped = validator.stripSecrets(output);

      expect(JSON.stringify(stripped)).not.toContain('my-secret-pass');
      expect(JSON.stringify(stripped)).toContain('[REDACTED]');
    });

    it('should allow safe output', () => {
      const output = { username: 'john', email: 'john@example.com', findings: [] };

      expect(() => validator.validateOutput(output)).not.toThrow();
    });
  });

  describe('Skill Validation', () => {
    it('should allow code-analysis skill', () => {
      const skill = validator.canExecuteSkill('code-analysis');
      expect(skill.level).toBe(1);
      expect(skill.mode).toBe('read-only');
    });

    it('should allow security-audit skill', () => {
      const skill = validator.canExecuteSkill('security-audit');
      expect(skill.level).toBe(1);
      expect(skill.mode).toBe('read-only');
    });

    it('should allow refactor skill (with restrictions)', () => {
      const skill = validator.canExecuteSkill('refactor');
      expect(skill.level).toBe(2);
      expect(skill.mode).toBe('propose-only');
    });

    it('should block system-command skill', () => {
      expect(() => validator.canExecuteSkill('system-command')).toThrow(
        ConstraintViolationError
      );
    });

    it('should block file deletion', () => {
      expect(() => validator.canExecuteSkill('file-operations/delete')).toThrow(
        ConstraintViolationError
      );
    });

    it('should reject unknown skills', () => {
      expect(() => validator.canExecuteSkill('unknown-skill')).toThrow(
        ConstraintViolationError
      );
    });
  });

  describe('Code Modification', () => {
    it('should allow code proposals', () => {
      const result = validator.canModifyCode();
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should require approval for modifications', () => {
      const result = validator.canModifyCode();
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('Network Requests', () => {
    it('should block network requests by default', () => {
      expect(() => validator.isNetworkRequestAllowed('api.example.com')).toThrow(
        ConstraintViolationError
      );
    });

    it('should allow whitelisted domains', () => {
      const customValidator = new ConstraintValidator({
        network: {
          canMakeRequests: true,
          allowedDomains: ['api.example.com']
        }
      }, console);

      expect(() => customValidator.isNetworkRequestAllowed('api.example.com')).not.toThrow();
    });

    it('should block non-whitelisted domains', () => {
      const customValidator = new ConstraintValidator({
        network: {
          canMakeRequests: true,
          allowedDomains: ['api.example.com']
        }
      }, console);

      expect(() => customValidator.isNetworkRequestAllowed('other.com')).toThrow(
        ConstraintViolationError
      );
    });

    it('should block POST requests if only GET allowed', () => {
      const customValidator = new ConstraintValidator({
        network: {
          canMakeRequests: true,
          allowedDomains: ['api.example.com'],
          methods: ['GET']
        }
      }, console);

      expect(() => customValidator.isNetworkRequestAllowed('api.example.com', 'POST')).toThrow(
        ConstraintViolationError
      );
    });
  });

  describe('Execution Time', () => {
    it('should accept reasonable execution time', () => {
      const result = validator.isExecutionTimeAcceptable(1000, 'code-analysis');
      expect(result).toBe(true);
    });

    it('should reject excessive execution time', () => {
      const result = validator.isExecutionTimeAcceptable(35000, 'code-analysis');
      expect(result).toBe(false);
    });
  });
});

describe('AgentBridge', () => {
  let bridge;

  beforeEach(() => {
    bridge = new AgentBridge({
      runtimePath: '.',
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      auditLog: jest.fn()
    });
  });

  afterEach(() => {
    bridge.cleanup();
  });

  it('should initialize with valid constraints', () => {
    expect(bridge).toBeDefined();
    expect(bridge.validator).toBeDefined();
    expect(bridge.client).toBeDefined();
  });

  it('should reject invalid constraints on startup', () => {
    expect(() => {
      new AgentBridge({
        runtimePath: '.',
        constraints: {
          files: { canWrite: true }  // HARD VIOLATION
        },
        logger: console
      });
    }).toThrow(ConstraintViolationError);
  });

  it('should get constraint report', () => {
    const report = bridge.getConstraintReport();

    expect(report.constraints).toBeDefined();
    expect(report.summary.canRead).toBe(true);
    expect(report.summary.canWrite).toBe(false);
    expect(report.summary.canExecute).toBe(false);
  });
});

describe('Integration Tests', () => {
  it('demonstrates complete workflow: analysis with constraint enforcement', async () => {
    const validator = new ConstraintValidator({}, console);

    // 1. Validate input path
    expect(() => validator.isFilePathAllowed('src/index.js')).not.toThrow();

    // 2. Block forbidden paths
    expect(() => validator.isFilePathAllowed('.env')).toThrow();

    // 3. Validate skill is allowed
    const skill = validator.canExecuteSkill('code-analysis');
    expect(skill.mode).toBe('read-only');

    // 4. Validate output for secrets
    const safeOutput = { findings: [], metrics: {} };
    expect(() => validator.validateOutput(safeOutput)).not.toThrow();

    // 5. Detect and strip secrets
    const unsafeOutput = { password: 'secret123' };
    expect(() => validator.validateOutput(unsafeOutput)).toThrow();
    const stripped = validator.stripSecrets(unsafeOutput);
    expect(JSON.stringify(stripped)).toContain('[REDACTED]');
  });

  it('should never allow write operations regardless of skill', () => {
    const validator = new ConstraintValidator({}, console);

    expect(validator.constraints.files.canWrite).toBe(false);
    expect(() => validator.canModifyCode()).not.toThrow(); // Proposals OK
  });

  it('should enforce multiple layers of security', () => {
    const validator = new ConstraintValidator({}, console);

    // Layer 1: Hard constraint check
    expect(() => validator.validateHardConstraints()).not.toThrow();

    // Layer 2: File path check
    expect(() => validator.isFilePathAllowed('src/index.js')).not.toThrow();
    expect(() => validator.isFilePathAllowed('.env')).toThrow();

    // Layer 3: Skill check
    expect(() => validator.canExecuteSkill('code-analysis')).not.toThrow();
    expect(() => validator.canExecuteSkill('system-command')).toThrow();

    // Layer 4: Output validation
    const safeOutput = { findings: [] };
    expect(() => validator.validateOutput(safeOutput)).not.toThrow();

    const unsafeOutput = { token: 'secret123' };
    expect(() => validator.validateOutput(unsafeOutput)).toThrow();
  });
});
