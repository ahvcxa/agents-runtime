const { describe, it, expect, beforeEach } = require('@jest/globals');
const { AgentContextInjector } = require('../src/context/agent-context-injector');

describe('AgentContextInjector', () => {
  let injector;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      audit: jest.fn(),
      warn: jest.fn()
    };

    injector = new AgentContextInjector({ logger: mockLogger });
  });

  describe('populateAgentCapabilities', () => {
    it('should populate capabilities for L1 agent', () => {
      const agent = {
        id: 'observer-agent',
        authorization_level: 1
      };

      const manifest = {
        skills: {
          'code-analysis': { id: 'code-analysis', authorization_required_level: 1, name: 'Code Analysis' },
          'refactor': { id: 'refactor', authorization_required_level: 2, name: 'Refactor' },
          'admin-tool': { id: 'admin-tool', authorization_required_level: 3, name: 'Admin Tool' }
        }
      };

      // Act
      injector.populateAgentCapabilities(agent, manifest);

      // Assert
      expect(agent.capabilities).toBeDefined();
      expect(agent.capabilities.skillCount).toBe(1);
      expect(agent.capabilities.skills[0].id).toBe('code-analysis');
      expect(agent.capabilities.maxConcurrentOperations).toBe(1);
      expect(agent.capabilities.canSpawnSubAgents).toBe(false);
      expect(agent.capabilities.canApproveNetworkRequests).toBe(false);
    });

    it('should populate capabilities for L2 agent', () => {
      const agent = {
        id: 'executor-agent',
        authorization_level: 2
      };

      const manifest = {
        skills: {
          'code-analysis': { id: 'code-analysis', authorization_required_level: 1 },
          'refactor': { id: 'refactor', authorization_required_level: 2 },
          'admin-tool': { id: 'admin-tool', authorization_required_level: 3 }
        }
      };

      // Act
      injector.populateAgentCapabilities(agent, manifest);

      // Assert
      expect(agent.capabilities.skillCount).toBe(2);
      expect(agent.capabilities.skills.map(s => s.id)).toEqual(['code-analysis', 'refactor']);
      expect(agent.capabilities.maxConcurrentOperations).toBe(2);
      expect(agent.capabilities.canSpawnSubAgents).toBe(false);
    });

    it('should populate full capabilities for L3 agent', () => {
      const agent = {
        id: 'orchestrator-agent',
        authorization_level: 3
      };

      const manifest = {
        skills: {
          'code-analysis': { id: 'code-analysis', authorization_required_level: 1 },
          'refactor': { id: 'refactor', authorization_required_level: 2 },
          'admin-tool': { id: 'admin-tool', authorization_required_level: 3 }
        }
      };

      // Act
      injector.populateAgentCapabilities(agent, manifest);

      // Assert
      expect(agent.capabilities.skillCount).toBe(3);
      expect(agent.capabilities.maxConcurrentOperations).toBe(10);
      expect(agent.capabilities.canSpawnSubAgents).toBe(true);
      expect(agent.capabilities.canApproveNetworkRequests).toBe(true);
      expect(agent.capabilities.canModifyPipelines).toBe(true);
    });

    it('should populate memory namespaces correctly', () => {
      const agent = { authorization_level: 2 };
      const manifest = { skills: {} };

      // Act
      injector.populateAgentCapabilities(agent, manifest);

      // Assert
      expect(agent.capabilities.memory.readableNamespaces).toContain('skill:*:cache:*');
      expect(agent.capabilities.memory.writableNamespaces).toContain('agent:{self}:state');
      expect(agent.capabilities.memory.readableNamespaces).not.toContain('pipeline:*');
    });

    it('should audit capability population', () => {
      const agent = { id: 'test', authorization_level: 1 };
      const manifest = { skills: { 'skill1': { authorization_required_level: 1 } } };

      // Act
      injector.populateAgentCapabilities(agent, manifest);

      // Assert
      expect(mockLogger.audit).toHaveBeenCalledWith(expect.objectContaining({
        event: 'AGENT_CAPABILITIES_POPULATED',
        agentId: 'test',
        skillCount: 1,
        authLevel: 1
      }));
    });
  });

  describe('injectSecurityPolicy', () => {
    it('should inject security policy for L1 agent', () => {
      const agent = {
        id: 'observer',
        authorization_level: 1
      };

      const settings = {
        security: {
          forbidden_file_patterns: ['.env*', '*.key'],
          max_input_size: 100000,
          max_output_size: 500000,
          network_allow_list: ['api.example.com']
        }
      };

      // Act
      injector.injectSecurityPolicy(agent, settings);

      // Assert
      expect(agent.metadata.securityPolicy).toBeDefined();
      expect(agent.metadata.securityPolicy.forbiddenFilePatterns).toEqual(['.env*', '*.key']);
      expect(agent.metadata.securityPolicy.maxInputSize).toBe(100000);
      expect(agent.metadata.securityPolicy.requiresNetworkApproval).toBe(true);
      expect(agent.metadata.securityPolicy.readOnlyMode).toBe(false);
    });

    it('should NOT require network approval for L3 agent', () => {
      const agent = { authorization_level: 3 };
      const settings = { security: {} };

      // Act
      injector.injectSecurityPolicy(agent, settings);

      // Assert
      expect(agent.metadata.securityPolicy.requiresNetworkApproval).toBe(false);
    });

    it('should respect read_only flag from agent', () => {
      const agent = { authorization_level: 2, read_only: true };
      const settings = { security: {} };

      // Act
      injector.injectSecurityPolicy(agent, settings);

      // Assert
      expect(agent.metadata.securityPolicy.readOnlyMode).toBe(true);
    });

    it('should use default values when settings empty', () => {
      const agent = { authorization_level: 1 };
      const settings = { security: {} };

      // Act
      injector.injectSecurityPolicy(agent, settings);

      // Assert
      expect(agent.metadata.securityPolicy.maxInputSize).toBe(102400);
      expect(agent.metadata.securityPolicy.maxOutputSize).toBe(1048576);
      expect(agent.metadata.securityPolicy.forbiddenFilePatterns).toEqual([]);
    });

    it('should audit policy injection', () => {
      const agent = { authorization_level: 1 };
      const settings = { security: { forbidden_file_patterns: ['.env*'] } };

      // Act
      injector.injectSecurityPolicy(agent, settings);

      // Assert
      expect(mockLogger.audit).toHaveBeenCalledWith(expect.objectContaining({
        event: 'SECURITY_POLICY_INJECTED',
        forbiddenFilePatterns: 1
      }));
    });
  });

  describe('injectContractToAuditLog', () => {
    it('should inject contract with hash and metadata', () => {
      const agent = { id: 'test-agent' };
      const contract = '# Agent Contract\n\n## Constraints\n- No network access\n- Read-only mode';

      // Act
      injector.injectContractToAuditLog(agent, contract);

      // Assert
      expect(agent.metadata.contract).toBeDefined();
      expect(agent.metadata.contract.hash).toBeDefined();
      expect(agent.metadata.contract.hash).toMatch(/^[a-f0-9]{64}$/); // SHA256
      expect(agent.metadata.contract.loadedAt).toBeDefined();
      expect(agent.metadata.contract.summary).toContain('Agent Contract');
    });

    it('should extract constraints from markdown', () => {
      const agent = { id: 'test' };
      const contract = `
# Agent Contract

## Constraints
- Must not modify files
- Must not execute network requests
- Maximum 100MB memory usage
`;

      // Act
      injector.injectContractToAuditLog(agent, contract);

      // Assert
      expect(agent.metadata.contract.constraints.length).toBeGreaterThan(0);
      expect(agent.metadata.contract.constraints[0]).toContain('not modify');
    });

    it('should extract permissions from markdown', () => {
      const agent = { id: 'test' };
      const contract = `
# Agent Contract

## Permissions
- Read source files
- Generate reports
- Cache analysis results
`;

      // Act
      injector.injectContractToAuditLog(agent, contract);

      // Assert
      expect(agent.metadata.contract.permissions.length).toBeGreaterThan(0);
    });

    it('should handle empty/missing contract gracefully', () => {
      const agent = { id: 'test' };

      // Act & Assert
      expect(() => injector.injectContractToAuditLog(agent, '')).not.toThrow();
      expect(() => injector.injectContractToAuditLog(agent, null)).not.toThrow();
    });

    it('should audit contract injection', () => {
      const agent = { id: 'test' };
      const contract = '# Test Contract';

      // Act
      injector.injectContractToAuditLog(agent, contract);

      // Assert
      expect(mockLogger.audit).toHaveBeenCalledWith(expect.objectContaining({
        event: 'AGENT_CONTRACT_INJECTED'
      }));
    });
  });

  describe('getAccessibleSkills', () => {
    it('should return L1 accessible skills', () => {
      const manifest = {
        skills: {
          'skill1': { id: 'skill1', authorization_required_level: 1, name: 'Skill 1' },
          'skill2': { id: 'skill2', authorization_required_level: 2, name: 'Skill 2' },
          'skill3': { id: 'skill3', authorization_required_level: 3, name: 'Skill 3' }
        }
      };

      // Act
      const skills = injector.getAccessibleSkills(manifest, 1);

      // Assert
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('skill1');
    });

    it('should return skills sorted by ID', () => {
      const manifest = {
        skills: {
          'zebra': { id: 'zebra', authorization_required_level: 1 },
          'alpha': { id: 'alpha', authorization_required_level: 1 },
          'beta': { id: 'beta', authorization_required_level: 1 }
        }
      };

      // Act
      const skills = injector.getAccessibleSkills(manifest, 1);

      // Assert
      expect(skills.map(s => s.id)).toEqual(['alpha', 'beta', 'zebra']);
    });
  });

  describe('getMaxConcurrentOperations', () => {
    it('should return 1 for L1 agent', () => {
      expect(injector.getMaxConcurrentOperations(1)).toBe(1);
    });

    it('should return 2 for L2 agent', () => {
      expect(injector.getMaxConcurrentOperations(2)).toBe(2);
    });

    it('should return 10 for L3 agent', () => {
      expect(injector.getMaxConcurrentOperations(3)).toBe(10);
    });
  });

  describe('getMemoryReadNamespaces', () => {
    it('should return L1 read namespaces', () => {
      const namespaces = injector.getMemoryReadNamespaces(1);

      expect(namespaces).toContain('skill:*:cache:*');
      expect(namespaces).toContain('event:*');
      expect(namespaces.length).toBe(2);
    });

    it('should return L2 read namespaces', () => {
      const namespaces = injector.getMemoryReadNamespaces(2);

      expect(namespaces).toContain('skill:*:cache:*');
      expect(namespaces).toContain('agent:{self}:state');
      expect(namespaces).toContain('event:*');
    });

    it('should return all namespaces for L3', () => {
      const namespaces = injector.getMemoryReadNamespaces(3);

      expect(namespaces).toContain('*');
    });
  });

  describe('getMemoryWriteNamespaces', () => {
    it('should return no namespaces for L1 (read-only)', () => {
      const namespaces = injector.getMemoryWriteNamespaces(1);

      expect(namespaces).toEqual([]);
    });

    it('should return specific namespaces for L2', () => {
      const namespaces = injector.getMemoryWriteNamespaces(2);

      expect(namespaces).toContain('skill:*:cache:*');
      expect(namespaces).toContain('agent:{self}:state');
      expect(namespaces).toContain('event:*');
    });

    it('should return all namespaces for L3', () => {
      const namespaces = injector.getMemoryWriteNamespaces(3);

      expect(namespaces).toContain('*');
    });
  });

  describe('getSummary', () => {
    it('should return comprehensive agent context summary', () => {
      const agent = {
        id: 'test-agent',
        role: 'Observer',
        authorization_level: 1,
        read_only: true,
        metadata: {
          securityPolicy: { requiresNetworkApproval: true },
          contract: { hash: 'abc123' }
        }
      };

      // Act
      const summary = injector.getSummary(agent);

      // Assert
      expect(summary.agentId).toBe('test-agent');
      expect(summary.role).toBe('Observer');
      expect(summary.authLevel).toBe(1);
      expect(summary.readOnly).toBe(true);
      expect(summary.securityPolicy).toBeDefined();
      expect(summary.contract).toBeDefined();
    });
  });

  describe('extractConstraints', () => {
    it('should extract constraints from markdown', () => {
      const markdown = `
# Agent Contract

## Constraints
- No network access
- Read-only filesystem
- Maximum 100MB memory
`;

      // Act
      const constraints = injector.extractConstraints(markdown);

      // Assert
      expect(constraints.length).toBeGreaterThan(0);
      expect(constraints.some(c => c.includes('network'))).toBe(true);
    });

    it('should extract from different constraint sections', () => {
      const markdown = `
## Must Not
- Access sensitive files
- Execute system commands

### Forbidden
- Network calls
- File modifications
`;

      // Act
      const constraints = injector.extractConstraints(markdown);

      // Assert
      expect(constraints.length).toBeGreaterThan(0);
    });
  });

  describe('extractPermissions', () => {
    it('should extract permissions from markdown', () => {
      const markdown = `
## Permissions
- Read source files
- Generate reports
- Cache results

## Capabilities
- Analyze code
- Suggest improvements
`;

      // Act
      const permissions = injector.extractPermissions(markdown);

      // Assert
      expect(permissions.length).toBeGreaterThan(0);
    });
  });
});
