const { describe, it, expect, beforeEach } = require('@jest/globals');
const { DynamicConfigLoader, SecurityViolationError, SkillNotFoundError } = require('../src/loaders/dynamic-config-loader');

describe('DynamicConfigLoader', () => {
  let agentContext;
  let configLoader;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      audit: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    agentContext = {
      manifest: {
        skills: {
          'code-analysis': { id: 'code-analysis', authorization_required_level: 1 },
          'refactor': { id: 'refactor', authorization_required_level: 2 },
          'admin-tool': { id: 'admin-tool', authorization_required_level: 3 }
        }
      },
      settings: {
        security: {
          forbidden_file_patterns: ['.env*', '**/*.key', '**/*.pem'],
          forbidden_paths: ['secrets/*', 'private/*'],
          max_input_size: 102400,
          max_output_size: 1048576,
          reject_null_bytes: true,
          check_path_traversal: true,
          network_allow_list: ['api.example.com']
        }
      },
      getSecurityConstraints: jest.fn(authLevel => ({
        forbiddenFilePatterns: ['.env*', '**/*.key', '**/*.pem'],
        forbiddenPathPatterns: ['secrets/*', 'private/*'],
        maxInputSize: 102400,
        maxOutputSize: 1048576,
        inputSanitization: { rejectNullBytes: true, checkPathTraversal: true },
        requiresNetworkApproval: authLevel < 3,
        allowedNetworkDomains: ['api.example.com']
      })),
      getMemoryACL: jest.fn(authLevel => {
        const acl = {
          1: { 'skill:*:cache:*': 'R', 'event:*': 'R' },
          2: { 'skill:*:cache:*': 'RW', 'agent:{self}:state': 'RW', 'event:*': 'RW' },
          3: { '*': 'RWX' }
        };
        return acl[authLevel];
      })
    };

    configLoader = new DynamicConfigLoader(agentContext, { logger: mockLogger });
  });

  describe('enforceSecurityConstraints', () => {
    it('should pass for valid input', () => {
      const input = { filePath: 'src/index.js', content: 'console.log("test")' };

      // Act & Assert
      expect(() => configLoader.enforceSecurityConstraints(input, 1)).not.toThrow();
    });

    it('should throw INPUT_TOO_LARGE when input exceeds max size', () => {
      const input = { data: 'x'.repeat(102401) }; // exceeds 102400

      // Act & Assert
      expect(() => configLoader.enforceSecurityConstraints(input, 1))
        .toThrow(SecurityViolationError);
      expect(() => configLoader.enforceSecurityConstraints(input, 1))
        .toThrow(SecurityViolationError);

      try {
        configLoader.enforceSecurityConstraints(input, 1);
      } catch (err) {
        expect(err.code).toBe('INPUT_TOO_LARGE');
        expect(err.details.max).toBe(102400);
      }
    });

    it('should throw NULL_BYTE_DETECTED when input contains null bytes', () => {
      const input = { data: 'test\0value' };

      // Act & Assert
      expect(() => configLoader.enforceSecurityConstraints(input, 1))
        .toThrow(SecurityViolationError);

      try {
        configLoader.enforceSecurityConstraints(input, 1);
      } catch (err) {
        expect(err.code).toBe('NULL_BYTE_DETECTED');
      }
    });

    it('should throw PATH_TRAVERSAL_DETECTED when input contains traversal patterns', () => {
      const input = { filePath: '../../etc/passwd' };

      // Act & Assert
      expect(() => configLoader.enforceSecurityConstraints(input, 1))
        .toThrow(SecurityViolationError);

      try {
        configLoader.enforceSecurityConstraints(input, 1);
      } catch (err) {
        expect(err.code).toBe('PATH_TRAVERSAL_DETECTED');
      }
    });
  });

  describe('enforceFileReadConstraints', () => {
    it('should allow reading non-forbidden files', () => {
      // Act & Assert
      expect(() => configLoader.enforceFileReadConstraints('src/index.js', 1)).not.toThrow();
      expect(() => configLoader.enforceFileReadConstraints('tests/test.js', 2)).not.toThrow();
    });

    it('should block reading .env files', () => {
      // Act & Assert
      expect(() => configLoader.enforceFileReadConstraints('.env', 1))
        .toThrow(SecurityViolationError);

      try {
        configLoader.enforceFileReadConstraints('.env.local', 1);
      } catch (err) {
        expect(err.code).toBe('FORBIDDEN_FILE_PATTERN');
      }
    });

    it('should block reading .key and .pem files', () => {
      expect(() => configLoader.enforceFileReadConstraints('certs/private.key', 1))
        .toThrow(SecurityViolationError);

      expect(() => configLoader.enforceFileReadConstraints('certs/cert.pem', 1))
        .toThrow(SecurityViolationError);
    });

    it('should block reading forbidden paths', () => {
      expect(() => configLoader.enforceFileReadConstraints('secrets/db-password.txt', 1))
        .toThrow(SecurityViolationError);

      expect(() => configLoader.enforceFileReadConstraints('private/api-keys.json', 1))
        .toThrow(SecurityViolationError);
    });

    it('should audit blocked access attempts', () => {
      try {
        configLoader.enforceFileReadConstraints('.env', 2);
      } catch (err) {
        // Expected
      }

      expect(mockLogger.audit).toHaveBeenCalledWith(expect.objectContaining({
        event: 'FORBIDDEN_FILE_ACCESS_BLOCKED',
        authLevel: 2
      }));
    });
  });

  describe('validateSkillAuthorization', () => {
    it('should allow L1 agent to execute L1 skill', () => {
      // Act & Assert
      expect(() => configLoader.validateSkillAuthorization('code-analysis', 1)).not.toThrow();
    });

    it('should allow L2 agent to execute L1 and L2 skills', () => {
      // Act & Assert
      expect(() => configLoader.validateSkillAuthorization('code-analysis', 2)).not.toThrow();
      expect(() => configLoader.validateSkillAuthorization('refactor', 2)).not.toThrow();
    });

    it('should allow L3 agent to execute any skill', () => {
      // Act & Assert
      expect(() => configLoader.validateSkillAuthorization('code-analysis', 3)).not.toThrow();
      expect(() => configLoader.validateSkillAuthorization('refactor', 3)).not.toThrow();
      expect(() => configLoader.validateSkillAuthorization('admin-tool', 3)).not.toThrow();
    });

    it('should deny L1 agent executing L2 skill', () => {
      // Act & Assert
      expect(() => configLoader.validateSkillAuthorization('refactor', 1))
        .toThrow(SecurityViolationError);

      try {
        configLoader.validateSkillAuthorization('refactor', 1);
      } catch (err) {
        expect(err.code).toBe('SKILL_AUTHORIZATION_DENIED');
        expect(err.details.required).toBe(2);
        expect(err.details.actual).toBe(1);
      }
    });

    it('should throw SkillNotFoundError for non-existent skill', () => {
      // Act & Assert
      expect(() => configLoader.validateSkillAuthorization('nonexistent', 1))
        .toThrow(SkillNotFoundError);
    });

    it('should audit authorization denials', () => {
      try {
        configLoader.validateSkillAuthorization('admin-tool', 1);
      } catch (err) {
        // Expected
      }

      expect(mockLogger.audit).toHaveBeenCalledWith(expect.objectContaining({
        event: 'SKILL_AUTHORIZATION_DENIED'
      }));
    });
  });

  describe('applyMemoryACL', () => {
    it('should allow L1 agent to read skill cache', () => {
      // Act & Assert
      expect(() => configLoader.applyMemoryACL('get', 'skill:analysis:cache:result', 1)).not.toThrow();
    });

    it('should deny L1 agent write to skill cache', () => {
      // Act & Assert
      expect(() => configLoader.applyMemoryACL('set', 'skill:analysis:cache:result', 1))
        .toThrow(SecurityViolationError);

      try {
        configLoader.applyMemoryACL('set', 'skill:analysis:cache:result', 1);
      } catch (err) {
        expect(err.code).toBe('MEMORY_WRITE_DENIED');
      }
    });

    it('should allow L2 agent to read and write skill cache', () => {
      // Act & Assert
      expect(() => configLoader.applyMemoryACL('get', 'skill:analysis:cache:result', 2)).not.toThrow();
      expect(() => configLoader.applyMemoryACL('set', 'skill:analysis:cache:result', 2)).not.toThrow();
    });

    it('should deny L1 access to namespaces they cannot access', () => {
      // Act & Assert
      expect(() => configLoader.applyMemoryACL('get', 'agent:orchestrator:state', 1))
        .toThrow(SecurityViolationError);
    });

    it('should allow L3 agent full access to all namespaces', () => {
      // Act & Assert
      expect(() => configLoader.applyMemoryACL('get', 'any:namespace:here', 3)).not.toThrow();
      expect(() => configLoader.applyMemoryACL('set', 'any:namespace:here', 3)).not.toThrow();
      expect(() => configLoader.applyMemoryACL('delete', 'any:namespace:here', 3)).not.toThrow();
    });

    it('should audit memory access denials', () => {
      try {
        configLoader.applyMemoryACL('set', 'skill:cache:result', 1);
      } catch (err) {
        // Expected
      }

      expect(mockLogger.audit).toHaveBeenCalled();
    });
  });

  describe('enforceOutputConstraints', () => {
    it('should pass for valid output', () => {
      const output = { result: 'test output', data: [1, 2, 3] };

      expect(() => configLoader.enforceOutputConstraints(output, 1)).not.toThrow();
    });

    it('should throw OUTPUT_TOO_LARGE when output exceeds max size', () => {
      const output = { data: 'x'.repeat(1048577) }; // exceeds 1048576

      expect(() => configLoader.enforceOutputConstraints(output, 1))
        .toThrow(SecurityViolationError);

      try {
        configLoader.enforceOutputConstraints(output, 1);
      } catch (err) {
        expect(err.code).toBe('OUTPUT_TOO_LARGE');
      }
    });
  });

  describe('hasPathTraversal', () => {
    it('should detect ../ patterns', () => {
      expect(configLoader.hasPathTraversal('../../etc/passwd')).toBe(true);
      expect(configLoader.hasPathTraversal('src/../../../etc/passwd')).toBe(true);
    });

    it('should detect %2e%2e (encoded) patterns', () => {
      expect(configLoader.hasPathTraversal('%2e%2e/etc/passwd')).toBe(true);
    });

    it('should detect ..\\ patterns', () => {
      expect(configLoader.hasPathTraversal('..\\windows\\system32')).toBe(true);
    });

    it('should not flag normal paths', () => {
      expect(configLoader.hasPathTraversal('src/index.js')).toBe(false);
      expect(configLoader.hasPathTraversal('dist/out.js')).toBe(false);
    });
  });

  describe('bindHooksToAgent', () => {
    it('should bind hooks to agent', () => {
      const agent = { id: 'test-agent', hooks: [] };
      const hooks = [
        { id: 'pre-read', event: 'before_filesystem_read' },
        { id: 'pre-network', event: 'before_network_access' }
      ];

      // Act
      configLoader.bindHooksToAgent(agent, hooks);

      // Assert
      expect(agent.hooks).toHaveLength(2);
      expect(agent.hooks[0].id).toBe('pre-read');
      expect(agent.hooks[1].id).toBe('pre-network');
    });

    it('should append hooks to existing hooks array', () => {
      const agent = { id: 'test-agent', hooks: [{ id: 'existing' }] };
      const newHooks = [{ id: 'new' }];

      // Act
      configLoader.bindHooksToAgent(agent, newHooks);

      // Assert
      expect(agent.hooks).toHaveLength(2);
      expect(agent.hooks[0].id).toBe('existing');
      expect(agent.hooks[1].id).toBe('new');
    });

    it('should create hooks array if it does not exist', () => {
      const agent = { id: 'test-agent' };
      const hooks = [{ id: 'hook1' }];

      // Act
      configLoader.bindHooksToAgent(agent, hooks);

      // Assert
      expect(agent.hooks).toBeDefined();
      expect(agent.hooks).toHaveLength(1);
    });
  });

  describe('getMemoryPermission', () => {
    it('should match exact namespace', () => {
      const acl = { 'skill:cache': 'R', 'event:*': 'RW' };

      const perm = configLoader.getMemoryPermission('skill:cache', acl);

      expect(perm).toBe('R');
    });

    it('should match wildcard patterns', () => {
      const acl = { 'skill:*:cache:*': 'RW' };

      const perm1 = configLoader.getMemoryPermission('skill:analysis:cache:result', acl);
      const perm2 = configLoader.getMemoryPermission('skill:audit:cache:findings', acl);

      expect(perm1).toBe('RW');
      expect(perm2).toBe('RW');
    });

    it('should return null for non-matching namespace', () => {
      const acl = { 'skill:*:cache:*': 'RW' };

      const perm = configLoader.getMemoryPermission('unknown:namespace', acl);

      expect(perm).toBeNull();
    });
  });
});
