const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { AgentAwareness, AgentContextLoadError } = require('../src/loaders/agent-awareness');

describe('AgentAwareness', () => {
  let tempDir;
  let agentAwareness;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-awareness-test-'));
    agentAwareness = new AgentAwareness({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } });
  });

  afterEach(() => {
    // Cleanup
    agentAwareness.stopAllWatchers();
    agentAwareness.clearCache();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadAgentContext', () => {
    it('should load manifest, settings, and contract from .agents directory', async () => {
      // Setup
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'manifest.json'),
        JSON.stringify({
          spec_version: '1.0.0',
          entry_points: { contract: '', settings: '', startup_guide: '', ai_agent_guide: '' },
          hooks: { 'pre-read': { id: 'pre-read', lifecycle_event: 'before_filesystem_read' } },
          skills: { 'test-skill': { id: 'test-skill', authorization_required_level: 1 } }
        })
      );

      fs.writeFileSync(
        path.join(agentsDir, 'settings.json'),
        JSON.stringify({
          environment: 'development',
          ai_agent_discovery: {},
          logging: {},
          security: { forbidden_file_patterns: ['.env*'] }
        })
      );

      fs.writeFileSync(
        path.join(agentsDir, 'AGENT_CONTRACT.md'),
        '# Agent Contract\n\nTest contract'
      );

      // Act
      const context = await agentAwareness.loadAgentContext(tempDir);

      // Assert
      expect(context).toBeDefined();
      expect(context.manifest.spec_version).toBe('1.0.0');
      expect(context.settings.environment).toBe('development');
      expect(context.contract).toContain('Agent Contract');
      expect(context.hash).toBeDefined();
      expect(context.loadedAt).toBeDefined();
    });

    it('should cache loaded context with TTL', async () => {
      // Setup
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir);
      fs.writeFileSync(path.join(agentsDir, 'manifest.json'), JSON.stringify({
        spec_version: '1.0.0',
        entry_points: { contract: '', settings: '', startup_guide: '', ai_agent_guide: '' },
        hooks: {},
        skills: {}
      }));
      fs.writeFileSync(path.join(agentsDir, 'settings.json'), JSON.stringify({
        environment: 'development',
        ai_agent_discovery: {},
        logging: {},
        security: {}
      }));

      // Act
      const context1 = await agentAwareness.loadAgentContext(tempDir);
      const context2 = await agentAwareness.loadAgentContext(tempDir);

      // Assert - should return cached copy
      expect(context1).toBe(context2);
    });

    it('should reload cache when reloadCache flag is true', async () => {
      // Setup
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir);
      fs.writeFileSync(path.join(agentsDir, 'manifest.json'), JSON.stringify({
        spec_version: '1.0.0',
        entry_points: { contract: '', settings: '', startup_guide: '', ai_agent_guide: '' },
        hooks: {},
        skills: { 'skill-v1': { id: 'skill-v1' } }
      }));
      fs.writeFileSync(path.join(agentsDir, 'settings.json'), JSON.stringify({
        environment: 'development',
        ai_agent_discovery: {},
        logging: {},
        security: {}
      }));

      const context1 = await agentAwareness.loadAgentContext(tempDir);

      // Modify manifest
      fs.writeFileSync(path.join(agentsDir, 'manifest.json'), JSON.stringify({
        spec_version: '1.0.0',
        entry_points: { contract: '', settings: '', startup_guide: '', ai_agent_guide: '' },
        hooks: {},
        skills: { 'skill-v2': { id: 'skill-v2' } }
      }));

      // Act
      const context2 = await agentAwareness.loadAgentContext(tempDir, { reloadCache: true });

      // Assert
      expect(context2.manifest.skills).toHaveProperty('skill-v2');
      expect(context1.manifest.skills).not.toHaveProperty('skill-v2');
    });

    it('should throw AgentContextLoadError on invalid manifest', async () => {
      // Setup
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir);
      fs.writeFileSync(path.join(agentsDir, 'manifest.json'), '{ invalid json }');
      fs.writeFileSync(path.join(agentsDir, 'settings.json'), JSON.stringify({
        environment: 'development',
        ai_agent_discovery: {},
        logging: {},
        security: {}
      }));

      // Act & Assert
      await expect(agentAwareness.loadAgentContext(tempDir)).rejects.toThrow(AgentContextLoadError);
    });
  });

  describe('getApplicableHooks', () => {
    it('should return hooks applicable to auth level', () => {
      const manifest = {
        hooks: {
          'pre-read': { id: 'pre-read', level_required: 1 },
          'pre-network': { id: 'pre-network', level_required: 2 },
          'admin-hook': { id: 'admin-hook', level_required: 3 }
        }
      };

      // Act & Assert
      const hooks1 = agentAwareness.getApplicableHooks(manifest, 1);
      expect(hooks1).toHaveLength(1);
      expect(hooks1[0].id).toBe('pre-read');

      const hooks2 = agentAwareness.getApplicableHooks(manifest, 2);
      expect(hooks2).toHaveLength(2);

      const hooks3 = agentAwareness.getApplicableHooks(manifest, 3);
      expect(hooks3).toHaveLength(3);
    });

    it('should return empty array if no hooks exist', () => {
      const manifest = {};

      const hooks = agentAwareness.getApplicableHooks(manifest, 1);

      expect(hooks).toEqual([]);
    });
  });

  describe('getSecurityConstraints', () => {
    it('should return security constraints for auth level', () => {
      const settings = {
        security: {
          forbidden_file_patterns: ['.env*', '*.key'],
          forbidden_paths: ['secrets/*'],
          max_input_size: 100000,
          max_output_size: 500000,
          reject_null_bytes: true,
          check_path_traversal: true,
          network_allow_list: ['api.example.com']
        }
      };

      // Act
      const constraints = agentAwareness.getSecurityConstraints(settings, 1);

      // Assert
      expect(constraints.forbiddenFilePatterns).toEqual(['.env*', '*.key']);
      expect(constraints.forbiddenPathPatterns).toEqual(['secrets/*']);
      expect(constraints.maxInputSize).toBe(100000);
      expect(constraints.maxOutputSize).toBe(500000);
      expect(constraints.inputSanitization.rejectNullBytes).toBe(true);
      expect(constraints.allowedNetworkDomains).toEqual(['api.example.com']);
    });

    it('should use defaults if settings not provided', () => {
      // Act
      const constraints = agentAwareness.getSecurityConstraints({}, 1);

      // Assert
      expect(constraints.maxInputSize).toBe(102400);
      expect(constraints.maxOutputSize).toBe(1048576);
      expect(constraints.forbiddenFilePatterns).toEqual([]);
    });
  });

  describe('getMemoryACL', () => {
    it('should return L1 (Observer) read-only ACL', () => {
      const settings = {};

      const acl = agentAwareness.getMemoryACL(settings, 1);

      expect(acl['skill:*:cache:*']).toBe('R');
      expect(acl['event:*']).toBe('R');
      expect(Object.keys(acl).length).toBe(2);
    });

    it('should return L2 (Executor) read-write ACL', () => {
      const settings = {};

      const acl = agentAwareness.getMemoryACL(settings, 2);

      expect(acl['skill:*:cache:*']).toBe('RW');
      expect(acl['agent:{self}:state']).toBe('RW');
      expect(acl['event:*']).toBe('RW');
    });

    it('should return L3 (Orchestrator) full access ACL', () => {
      const settings = {};

      const acl = agentAwareness.getMemoryACL(settings, 3);

      expect(acl['*']).toBe('RWX');
    });

    it('should override defaults with custom rules from settings', () => {
      const settings = {
        memory: {
          acl: {
            1: { 'custom:namespace': 'RW' }
          }
        }
      };

      const acl = agentAwareness.getMemoryACL(settings, 1);

      expect(acl['custom:namespace']).toBe('RW');
      // Original rules should still be there
      expect(acl['skill:*:cache:*']).toBe('R');
    });
  });

  describe('validateManifestSchema', () => {
    it('should validate manifest has required fields', () => {
      const validManifest = {
        spec_version: '1.0.0',
        entry_points: { contract: '', settings: '', startup_guide: '', ai_agent_guide: '' },
        hooks: {},
        skills: {}
      };

      // Act & Assert
      expect(() => agentAwareness.validateManifestSchema(validManifest)).not.toThrow();
    });

    it('should throw if required fields missing', () => {
      const invalidManifest = {
        spec_version: '1.0.0'
        // missing entry_points, hooks, skills
      };

      // Act & Assert
      expect(() => agentAwareness.validateManifestSchema(invalidManifest)).toThrow();
    });

    it('should throw if entry_points incomplete', () => {
      const invalidManifest = {
        spec_version: '1.0.0',
        entry_points: { contract: '' },
        hooks: {},
        skills: {}
      };

      expect(() => agentAwareness.validateManifestSchema(invalidManifest)).toThrow();
    });
  });

  describe('validateSettingsSchema', () => {
    it('should validate settings has required fields', () => {
      const validSettings = {
        environment: 'development',
        ai_agent_discovery: {},
        logging: {},
        security: {}
      };

      // Act & Assert
      expect(() => agentAwareness.validateSettingsSchema(validSettings)).not.toThrow();
    });

    it('should throw if required fields missing', () => {
      const invalidSettings = {
        environment: 'development'
      };

      expect(() => agentAwareness.validateSettingsSchema(invalidSettings)).toThrow();
    });

    it('should throw if environment invalid', () => {
      const invalidSettings = {
        environment: 'staging',
        ai_agent_discovery: {},
        logging: {},
        security: {}
      };

      expect(() => agentAwareness.validateSettingsSchema(invalidSettings)).toThrow();
    });
  });

  describe('hashAgentDir', () => {
    it('should generate hash of .agents directory', () => {
      // Setup
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir);
      fs.writeFileSync(path.join(agentsDir, 'manifest.json'), '{"test": true}');

      // Act
      const hash1 = agentAwareness.hashAgentDir(tempDir);
      const hash2 = agentAwareness.hashAgentDir(tempDir);

      // Assert - same content = same hash
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });

    it('should generate different hash when content changes', () => {
      // Setup
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir);
      fs.writeFileSync(path.join(agentsDir, 'manifest.json'), '{"test": true}');

      const hash1 = agentAwareness.hashAgentDir(tempDir);

      fs.writeFileSync(path.join(agentsDir, 'manifest.json'), '{"test": false}');

      const hash2 = agentAwareness.hashAgentDir(tempDir);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('clearCache', () => {
    it('should clear specific project cache', async () => {
      // Setup
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir);
      fs.writeFileSync(path.join(agentsDir, 'manifest.json'), JSON.stringify({
        spec_version: '1.0.0',
        entry_points: { contract: '', settings: '', startup_guide: '', ai_agent_guide: '' },
        hooks: {},
        skills: {}
      }));
      fs.writeFileSync(path.join(agentsDir, 'settings.json'), JSON.stringify({
        environment: 'development',
        ai_agent_discovery: {},
        logging: {},
        security: {}
      }));

      await agentAwareness.loadAgentContext(tempDir);

      // Act
      agentAwareness.clearCache(tempDir);

      // Assert
      const cache = agentAwareness.cache;
      const cacheKey = agentAwareness.getCacheKey(tempDir);
      expect(cache.has(cacheKey)).toBe(false);
    });

    it('should clear all caches when no project specified', async () => {
      agentAwareness.cache.set('key1', 'value1');
      agentAwareness.cache.set('key2', 'value2');

      // Act
      agentAwareness.clearCache();

      // Assert
      expect(agentAwareness.cache.size).toBe(0);
    });
  });
});
