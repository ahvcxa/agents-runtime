const crypto = require('crypto');

/**
 * AgentContextInjector - AI awareness layer for agent context injection
 * 
 * Responsibilities:
 * - Populate agent capabilities based on manifest
 * - Inject security policy into agent metadata
 * - Inject contract into audit log
 * - Provide audit trail of what agent can/cannot do
 */
class AgentContextInjector {
  constructor({ logger = console } = {}) {
    this.logger = logger;
  }

  /**
   * Inject contract metadata into agent (for audit trail, not for AI)
   */
  injectContractToAuditLog(agent, contract) {
    if (!contract || contract.trim().length === 0) {
      this.logger.warn?.('AgentContextInjector: contract is empty or missing');
      return;
    }

    // Hash contract for integrity checking
    const contractHash = crypto
      .createHash('sha256')
      .update(contract)
      .digest('hex');

    // Extract key sections from markdown
    const constraints = this.extractConstraints(contract);
    const permissions = this.extractPermissions(contract);

    if (!agent.metadata) {
      agent.metadata = {};
    }

    agent.metadata.contract = {
      hash: contractHash,
      loadedAt: Date.now(),
      constraints,
      permissions,
      // Store first 500 chars as summary
      summary: contract.substring(0, 500) + (contract.length > 500 ? '...' : '')
    };

    this.logger.audit?.({
      event: 'AGENT_CONTRACT_INJECTED',
      agentId: agent.id,
      contractHash,
      constraintCount: constraints.length,
      permissionCount: permissions.length
    });

    return agent.metadata.contract;
  }

  /**
   * Populate agent capabilities based on manifest & auth level
   */
  populateAgentCapabilities(agent, manifest) {
    if (!manifest.skills) {
      this.logger.warn?.('AgentContextInjector: manifest has no skills defined');
      return;
    }

    const authLevel = agent.authorization_level || 1;

    // Get accessible skills
    const accessibleSkills = this.getAccessibleSkills(manifest, authLevel);

    // Get max concurrent operations by auth level
    const maxConcurrent = this.getMaxConcurrentOperations(authLevel);

    // Get memory namespaces
    const memory = {
      readableNamespaces: this.getMemoryReadNamespaces(authLevel),
      writableNamespaces: this.getMemoryWriteNamespaces(authLevel)
    };

    if (!agent.capabilities) {
      agent.capabilities = {};
    }

    agent.capabilities = {
      ...agent.capabilities,
      skills: accessibleSkills,
      skillCount: accessibleSkills.length,
      maxConcurrentOperations: maxConcurrent,
      canSpawnSubAgents: authLevel >= 3,
      canApproveNetworkRequests: authLevel >= 3,
      canModifyPipelines: authLevel >= 3,
      memory,
      authLevel
    };

    this.logger.audit?.({
      event: 'AGENT_CAPABILITIES_POPULATED',
      agentId: agent.id,
      skillCount: accessibleSkills.length,
      authLevel,
      maxConcurrent,
      canSpawnSubAgents: authLevel >= 3
    });

    return agent.capabilities;
  }

  /**
   * Inject security policy into agent metadata
   */
  injectSecurityPolicy(agent, settings) {
    const sec = settings.security || {};
    const authLevel = agent.authorization_level || 1;

    const policy = {
      forbiddenFilePatterns: sec.forbidden_file_patterns || [],
      forbiddenPathPatterns: sec.forbidden_paths || [],
      maxInputSize: sec.max_input_size || 102400,
      maxOutputSize: sec.max_output_size || 1048576,
      requiresNetworkApproval: authLevel < 3,
      allowedNetworkDomains: sec.network_allow_list || [],
      inputSanitization: {
        rejectNullBytes: sec.reject_null_bytes !== false,
        checkPathTraversal: sec.check_path_traversal !== false
      },
      readOnlyMode: agent.read_only === true,
      injectedAt: Date.now()
    };

    if (!agent.metadata) {
      agent.metadata = {};
    }

    agent.metadata.securityPolicy = policy;

    this.logger.audit?.({
      event: 'SECURITY_POLICY_INJECTED',
      agentId: agent.id,
      forbiddenFilePatterns: policy.forbiddenFilePatterns.length,
      forbiddenPathPatterns: policy.forbiddenPathPatterns.length,
      requiresNetworkApproval: policy.requiresNetworkApproval,
      readOnlyMode: policy.readOnlyMode
    });

    return policy;
  }

  /**
   * Get skills accessible to agent by auth level
   */
  getAccessibleSkills(manifest, authLevel) {
    const skills = manifest.skills || {};
    const accessible = [];

    for (const [skillId, skillDef] of Object.entries(skills)) {
      const requiredLevel = skillDef.authorization_required_level || 1;

      if (authLevel >= requiredLevel) {
        accessible.push({
          id: skillId,
          name: skillDef.name || skillId,
          requiredLevel,
          readOnly: skillDef.read_only || false,
          description: skillDef.description || ''
        });
      }
    }

    return accessible.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Get max concurrent operations by auth level
   */
  getMaxConcurrentOperations(authLevel) {
    // More restricted for lower auth levels
    return {
      1: 1,    // Observer: 1 operation at a time
      2: 2,    // Executor: 2 concurrent
      3: 10    // Orchestrator: 10 concurrent
    }[authLevel] || 1;
  }

  /**
   * Get memory namespaces agent can read
   */
  getMemoryReadNamespaces(authLevel) {
    const l1 = ['skill:*:cache:*', 'event:*'];
    const l2 = [...l1, 'agent:{self}:state'];
    const l3 = ['*'];

    return {
      1: l1,
      2: l2,
      3: l3
    }[authLevel] || l1;
  }

  /**
   * Get memory namespaces agent can write
   */
  getMemoryWriteNamespaces(authLevel) {
    const l1 = []; // Observer cannot write
    const l2 = ['skill:*:cache:*', 'agent:{self}:state', 'event:*'];
    const l3 = ['*'];

    return {
      1: l1,
      2: l2,
      3: l3
    }[authLevel] || l1;
  }

  /**
   * Extract constraint rules from markdown contract
   */
  extractConstraints(markdown) {
    const constraints = [];

    // Look for constraint sections (e.g., ### Constraints, ## Must Not)
    const constraintPatterns = [
      /###\s+Constraints?\s*\n([\s\S]*?)(?=###|##|$)/i,
      /##\s+Constraints?\s*\n([\s\S]*?)(?=##|###|$)/i,
      /##\s+Must\s+Not\s*\n([\s\S]*?)(?=##|###|$)/i,
      /##\s+Forbidden\s*\n([\s\S]*?)(?=##|###|$)/i
    ];

    for (const pattern of constraintPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        const text = match[1];
        // Extract bullet points
        const bullets = text.match(/^[-*+]\s+(.+?)$/gm) || [];
        for (const bullet of bullets) {
          const cleaned = bullet.replace(/^[-*+]\s+/, '').trim();
          if (cleaned && !constraints.includes(cleaned)) {
            constraints.push(cleaned);
          }
        }
      }
    }

    return constraints;
  }

  /**
   * Extract permissions from markdown contract
   */
  extractPermissions(markdown) {
    const permissions = [];

    // Look for permission/capability sections
    const permissionPatterns = [
      /###\s+Permissions?\s*\n([\s\S]*?)(?=###|##|$)/i,
      /##\s+Permissions?\s*\n([\s\S]*?)(?=##|###|$)/i,
      /##\s+Can\s+[\w\s]+\s*\n([\s\S]*?)(?=##|###|$)/i,
      /##\s+Capabilities?\s*\n([\s\S]*?)(?=##|###|$)/i
    ];

    for (const pattern of permissionPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        const text = match[1];
        // Extract bullet points
        const bullets = text.match(/^[-*+]\s+(.+?)$/gm) || [];
        for (const bullet of bullets) {
          const cleaned = bullet.replace(/^[-*+]\s+/, '').trim();
          if (cleaned && !permissions.includes(cleaned)) {
            permissions.push(cleaned);
          }
        }
      }
    }

    return permissions;
  }

  /**
   * Get comprehensive agent context summary
   */
  getSummary(agent) {
    return {
      agentId: agent.id,
      role: agent.role,
      authLevel: agent.authorization_level,
      readOnly: agent.read_only || false,
      capabilities: agent.capabilities || {},
      securityPolicy: agent.metadata?.securityPolicy || {},
      contract: agent.metadata?.contract || {},
      injectedAt: agent.metadata?.securityPolicy?.injectedAt || null
    };
  }
}

module.exports = {
  AgentContextInjector
};
