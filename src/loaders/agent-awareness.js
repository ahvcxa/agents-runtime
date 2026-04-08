const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

/**
 * AgentAwareness - Foundation layer for .agents configuration discovery & management
 * 
 * Responsibilities:
 * - Load .agents/manifest.json and settings.json
 * - Cache with TTL (30s dev, 300s prod)
 * - Get applicable hooks, security constraints, memory ACL by auth level
 * - Watch for .agents/ file changes and reload
 * - Validate manifest & settings schemas
 */
class AgentAwareness extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cache = new Map();
    this.watchers = new Map();
    this.isDev = process.env.NODE_ENV !== 'production';
    this.cacheTTL = options.cacheTTL || (this.isDev ? 30000 : 300000); // 30s dev, 5min prod
    this.watchDebounce = options.watchDebounce || (this.isDev ? 1000 : 30000);
    this.logger = options.logger || console;
  }

  /**
   * Load .agents context (manifest, settings, contract)
   * Uses cache with TTL to reduce file I/O
   */
  async loadAgentContext(projectRoot, { reloadCache = false } = {}) {
    const cacheKey = this.getCacheKey(projectRoot);

    // Check cache
    if (!reloadCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.loadedAt < this.cacheTTL) {
        return cached;
      }
    }

    try {
      // Load manifest
      const manifestPath = path.join(projectRoot, '.agents', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      this.validateManifestSchema(manifest);

      // Normalize skills from array to object format for DynamicConfigLoader
      if (Array.isArray(manifest.skills)) {
        const skillsObj = {};
        manifest.skills.forEach(skill => {
          skillsObj[skill.id] = skill;
        });
        manifest.skills = skillsObj;
      }

      // Load settings
      const settingsPath = path.join(projectRoot, '.agents', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      this.validateSettingsSchema(settings);

      // Load contract (optional, but recommended)
      let contract = '';
      const contractPath = path.join(projectRoot, '.agents', 'AGENT_CONTRACT.md');
      if (fs.existsSync(contractPath)) {
        contract = fs.readFileSync(contractPath, 'utf8');
      }

      const agentContext = {
        manifest,
        settings,
        contract,
        projectRoot,
        loadedAt: Date.now(),
        hash: this.hashAgentDir(projectRoot),
        // Bind methods for easy access
        getApplicableHooks: (authLevel) => this.getApplicableHooks(manifest, authLevel),
        getSecurityConstraints: (authLevel) => this.getSecurityConstraints(settings, authLevel),
        getMemoryACL: (authLevel) => this.getMemoryACL(settings, authLevel)
      };

      // Cache it
      this.cache.set(cacheKey, agentContext);

      this.logger.debug?.('AgentAwareness: context loaded', {
        projectRoot,
        manifestVersion: manifest.spec_version,
        environment: settings.environment
      });

      return agentContext;
    } catch (err) {
      this.logger.error?.('AgentAwareness: failed to load context', {
        projectRoot,
        error: err.message
      });
      throw new AgentContextLoadError(
        `Failed to load .agents context from ${projectRoot}`,
        { cause: err }
      );
    }
  }

  /**
   * Get hooks applicable to an agent by auth level
   */
  getApplicableHooks(manifest, authLevel) {
    if (!manifest.hooks) return [];

    return Object.values(manifest.hooks)
      .filter(hook => {
        const requiredLevel = hook.level_required || 1;
        return authLevel >= requiredLevel;
      })
      .map(hook => ({
        id: hook.id,
        event: hook.lifecycle_event,
        handler: hook.handler,
        critical: hook.critical || false,
        authLevel: hook.level_required || 1
      }));
  }

  /**
   * Get security constraints for auth level
   */
  getSecurityConstraints(settings, authLevel) {
    const sec = settings.security || {};

    return {
      forbiddenFilePatterns: sec.forbidden_file_patterns || [],
      forbiddenPathPatterns: sec.forbidden_paths || [],
      maxInputSize: sec.max_input_size || 102400, // 100KB
      maxOutputSize: sec.max_output_size || 1048576, // 1MB
      requiresNetworkApproval: authLevel < 3,
      allowedNetworkDomains: sec.network_allow_list || [],
      inputSanitization: {
        rejectNullBytes: sec.reject_null_bytes !== false,
        checkPathTraversal: sec.check_path_traversal !== false
      }
    };
  }

  /**
   * Get memory ACL rules for auth level
   * Returns namespace -> permission mapping
   */
  getMemoryACL(settings, authLevel) {
    // Define default ACL by auth level
    const defaultACL = {
      1: { // Observer (L1) - Read-only
        'skill:*:cache:*': 'R',
        'event:*': 'R'
      },
      2: { // Executor (L2) - Read-Write
        'skill:*:cache:*': 'RW',
        'agent:{self}:state': 'RW',
        'event:*': 'RW'
      },
      3: { // Orchestrator (L3) - Full access
        '*': 'RWX'
      }
    };

    // Override with settings if provided
    const customACL = settings.memory?.acl?.[authLevel];
    if (customACL) {
      return { ...defaultACL[authLevel], ...customACL };
    }

    return defaultACL[authLevel] || defaultACL[1];
  }

  /**
   * Start watching .agents/ directory for changes
   * Returns unsubscribe function
   */
  startWatchingConfigChanges(projectRoot, onChangeCallback) {
    const agentsDir = path.join(projectRoot, '.agents');

    // Debounce wrapper
    let debounceTimer = null;
    const debouncedChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          // Reload cache
          const newContext = await this.loadAgentContext(projectRoot, { reloadCache: true });
          this.emit('config-reloaded', { projectRoot, context: newContext });
          
          if (onChangeCallback) {
            await onChangeCallback(newContext);
          }

          this.logger.info?.('AgentAwareness: config reloaded', { projectRoot });
        } catch (err) {
          this.logger.error?.('AgentAwareness: config reload failed', {
            projectRoot,
            error: err.message
          });
          this.emit('config-reload-error', { projectRoot, error: err });
        }
      }, this.watchDebounce);
    };

    try {
      const watcher = fs.watch(agentsDir, { recursive: true }, (eventType, filename) => {
        // Only watch json/md files
        if (filename && (filename.endsWith('.json') || filename.endsWith('.md'))) {
          debouncedChange();
        }
      });

      this.watchers.set(projectRoot, watcher);

      this.logger.debug?.('AgentAwareness: watching .agents directory', { projectRoot });

      // Return unsubscribe function
      return () => {
        clearTimeout(debounceTimer);
        watcher.close();
        this.watchers.delete(projectRoot);
        this.logger.debug?.('AgentAwareness: stopped watching', { projectRoot });
      };
    } catch (err) {
      this.logger.warn?.('AgentAwareness: failed to watch directory', {
        projectRoot,
        error: err.message
      });
      return () => {}; // No-op unsubscribe
    }
  }

  /**
   * Validate manifest.json against expected schema
   */
  validateManifestSchema(manifest) {
    const required = ['spec_version', 'entry_points', 'hooks', 'skills'];
    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Manifest missing required field: ${field}`);
      }
    }

    // Validate entry_points - check if key exists (not if value is truthy)
    const requiredEntries = ['contract', 'settings', 'startup_guide', 'ai_agent_guide'];
    for (const entry of requiredEntries) {
      if (!(entry in manifest.entry_points)) {
        throw new Error(`Manifest missing entry_point: ${entry}`);
      }
    }

    return true;
  }

  /**
   * Validate settings.json against expected schema
   */
  validateSettingsSchema(settings) {
    const required = ['environment', 'ai_agent_discovery', 'logging', 'security'];
    for (const field of required) {
      if (!settings[field]) {
        throw new Error(`Settings missing required field: ${field}`);
      }
    }

    // Validate environment
    if (!['development', 'production'].includes(settings.environment)) {
      throw new Error(`Invalid environment: ${settings.environment}`);
    }

    return true;
  }

  /**
   * Hash .agents directory content to detect changes
   */
  hashAgentDir(projectRoot) {
    const agentsDir = path.join(projectRoot, '.agents');
    if (!fs.existsSync(agentsDir)) {
      return null;
    }

    try {
      const hash = crypto.createHash('sha256');
      const files = ['manifest.json', 'settings.json', 'AGENT_CONTRACT.md'];

      for (const file of files) {
        const filePath = path.join(agentsDir, file);
        if (fs.existsSync(filePath)) {
          hash.update(fs.readFileSync(filePath));
        }
      }

      return hash.digest('hex');
    } catch (err) {
      this.logger.warn?.('AgentAwareness: failed to hash .agents dir', {
        projectRoot,
        error: err.message
      });
      return null;
    }
  }

  /**
   * Get cache key for a project
   */
  getCacheKey(projectRoot) {
    return `agent-context:${projectRoot}`;
  }

  /**
   * Clear cache for a project (or all if not specified)
   */
  clearCache(projectRoot = null) {
    if (projectRoot) {
      const cacheKey = this.getCacheKey(projectRoot);
      this.cache.delete(cacheKey);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Stop all watchers
   */
  stopAllWatchers() {
    for (const [projectRoot, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch (err) {
        this.logger.warn?.('AgentAwareness: error closing watcher', {
          projectRoot,
          error: err.message
        });
      }
    }
    this.watchers.clear();
  }

  /**
   * Shutdown
   */
  async shutdown() {
    this.stopAllWatchers();
    this.clearCache();
    this.removeAllListeners();
  }
}

/**
 * Custom error for agent context loading failures
 */
class AgentContextLoadError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'AgentContextLoadError';
    this.cause = cause;
  }
}

/**
 * Singleton instance
 */
let singleton = null;

function getAgentAwareness(options = {}) {
  if (!singleton) {
    singleton = new AgentAwareness(options);
  }
  return singleton;
}

module.exports = {
  AgentAwareness,
  AgentContextLoadError,
  getAgentAwareness
};
