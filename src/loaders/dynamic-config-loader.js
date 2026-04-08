const minimatch = require('minimatch');

/**
 * DynamicConfigLoader - Enforcement layer for .agents configuration
 * 
 * Responsibilities:
 * - Enforce security constraints (input/output size, null bytes, path traversal)
 * - Enforce file read constraints (forbidden patterns)
 * - Validate skill authorization by auth level
 * - Apply memory ACL rules
 * - Bind hooks to agent
 */
class DynamicConfigLoader {
  constructor(agentContext, { logger = console } = {}) {
    this.context = agentContext; // from AgentAwareness
    this.logger = logger;
  }

  /**
   * Bind applicable hooks to agent
   */
  bindHooksToAgent(agent, applicableHooks) {
    if (!agent.hooks) {
      agent.hooks = [];
    }

    for (const hook of applicableHooks) {
      agent.hooks.push(hook);
    }

    this.logger.debug?.('DynamicConfigLoader: hooks bound to agent', {
      agentId: agent.id,
      hookCount: applicableHooks.length
    });
  }

  /**
   * Enforce security constraints for input
   * Checks: input size, null bytes, path traversal
   */
  enforceSecurityConstraints(input, authLevel) {
    const constraints = this.context.getSecurityConstraints(authLevel);

    // Check 1: Null bytes in the input object (before JSON serialization)
    if (constraints.inputSanitization.rejectNullBytes) {
      this.checkNullBytesInObject(input);
    }

    // Check 2: Input size
    const inputStr = JSON.stringify(input);
    const inputSize = Buffer.byteLength(inputStr);

    if (inputSize > constraints.maxInputSize) {
      throw new SecurityViolationError('INPUT_TOO_LARGE', {
        actual: inputSize,
        max: constraints.maxInputSize
      });
    }

    // Check 3: Path traversal patterns in string values
    if (constraints.inputSanitization.checkPathTraversal) {
      this.checkPathTraversalInObject(input);
    }

    this.logger.debug?.('DynamicConfigLoader: security constraints validated', {
      inputSize,
      maxSize: constraints.maxInputSize
    });

    return true;
  }

  /**
   * Check for null bytes in object recursively
   */
  checkNullBytesInObject(obj, visited = new Set()) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    if (visited.has(obj)) {
      return;
    }
    visited.add(obj);

    for (const value of Object.values(obj)) {
      if (typeof value === 'string' && value.includes('\0')) {
        throw new SecurityViolationError('NULL_BYTE_DETECTED', {
          message: 'Input contains null bytes'
        });
      } else if (typeof value === 'object' && value !== null) {
        this.checkNullBytesInObject(value, visited);
      }
    }
  }

  /**
   * Enforce file read constraints
   * Checks: forbidden file patterns, forbidden path patterns
   */
  enforceFileReadConstraints(filePath, authLevel) {
    const constraints = this.context.getSecurityConstraints(authLevel);

    // Normalize path
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check forbidden file patterns (e.g., .env*, *.key)
    for (const pattern of constraints.forbiddenFilePatterns) {
      if (minimatch(normalizedPath, pattern, { dot: true })) {
        this.logger.audit?.({
          event: 'FORBIDDEN_FILE_ACCESS_BLOCKED',
          filePath,
          pattern,
          authLevel
        });

        throw new SecurityViolationError('FORBIDDEN_FILE_PATTERN', {
          filePath,
          pattern
        });
      }
    }

    // Check forbidden path patterns (e.g., /secrets/*, /private/*)
    for (const pattern of constraints.forbiddenPathPatterns) {
      if (minimatch(normalizedPath, pattern, { dot: true })) {
        this.logger.audit?.({
          event: 'FORBIDDEN_PATH_ACCESS_BLOCKED',
          filePath,
          pattern,
          authLevel
        });

        throw new SecurityViolationError('FORBIDDEN_PATH_PATTERN', {
          filePath,
          pattern
        });
      }
    }

    return true;
  }

  /**
   * Validate skill authorization
   * Checks: skill exists, agent auth level >= required level
   */
  validateSkillAuthorization(skillId, authLevel) {
    const skill = this.context.manifest.skills?.[skillId];

    if (!skill) {
      throw new SkillNotFoundError(skillId);
    }

    const requiredLevel = skill.authorization_required_level || 1;

    if (authLevel < requiredLevel) {
      this.logger.audit?.({
        event: 'SKILL_AUTHORIZATION_DENIED',
        skillId,
        requiredLevel,
        agentAuthLevel: authLevel
      });

      throw new SecurityViolationError('SKILL_AUTHORIZATION_DENIED', {
        skillId,
        required: requiredLevel,
        actual: authLevel
      });
    }

    this.logger.debug?.('DynamicConfigLoader: skill authorization validated', {
      skillId,
      requiredLevel,
      agentAuthLevel: authLevel
    });

    return true;
  }

  /**
   * Apply memory ACL rules
   * Checks: namespace access, operation permission (R/W/X)
   */
  applyMemoryACL(operation, namespace, authLevel) {
    // operation = 'get' | 'set' | 'update' | 'delete'

    const acl = this.context.getMemoryACL(authLevel);

    // Check if namespace is allowed
    const permission = this.getMemoryPermission(namespace, acl);

    if (!permission) {
      this.logger.audit?.({
        event: 'MEMORY_ACCESS_DENIED',
        operation,
        namespace,
        authLevel
      });

      throw new SecurityViolationError('MEMORY_ACCESS_DENIED', {
        namespace,
        authLevel
      });
    }

    // Check operation-specific permissions
    if ((operation === 'set' || operation === 'update') && !permission.includes('W')) {
      this.logger.audit?.({
        event: 'MEMORY_WRITE_DENIED',
        operation,
        namespace,
        authLevel
      });

      throw new SecurityViolationError('MEMORY_WRITE_DENIED', {
        namespace,
        operation
      });
    }

    if (operation === 'delete' && !permission.includes('X')) {
      this.logger.audit?.({
        event: 'MEMORY_DELETE_DENIED',
        namespace,
        authLevel
      });

      throw new SecurityViolationError('MEMORY_DELETE_DENIED', {
        namespace
      });
    }

    this.logger.debug?.('DynamicConfigLoader: memory ACL validated', {
      operation,
      namespace,
      permission
    });

    return true;
  }

  /**
   * Get memory permission for a namespace
   * Supports wildcards: skill:*:cache:*
   */
  getMemoryPermission(namespace, acl) {
    // Exact match
    if (acl[namespace]) {
      return acl[namespace];
    }

    // Wildcard match
    for (const [pattern, perm] of Object.entries(acl)) {
      if (pattern.includes('*')) {
        if (minimatch(namespace, pattern)) {
          return perm;
        }
      }
    }

    return null;
  }

  /**
   * Check for path traversal patterns in object
   */
  checkPathTraversalInObject(obj, visited = new Set()) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Prevent infinite recursion
    if (visited.has(obj)) {
      return;
    }
    visited.add(obj);

    for (const value of Object.values(obj)) {
      if (typeof value === 'string') {
        if (this.hasPathTraversal(value)) {
          throw new SecurityViolationError('PATH_TRAVERSAL_DETECTED', {
            value: value.substring(0, 100) + (value.length > 100 ? '...' : '')
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        this.checkPathTraversalInObject(value, visited);
      }
    }
  }

  /**
   * Detect path traversal patterns
   */
  hasPathTraversal(str) {
    // Check for ../ and similar patterns
    return /(\.\.[\/\\]|%2e%2e|\.\.%5c|\.\.\.|\/\/|\\\\)/.test(str);
  }

  /**
   * Validate output size
   */
  enforceOutputConstraints(output, authLevel) {
    const constraints = this.context.getSecurityConstraints(authLevel);

    const outputStr = JSON.stringify(output);
    const outputSize = Buffer.byteLength(outputStr);

    if (outputSize > constraints.maxOutputSize) {
      throw new SecurityViolationError('OUTPUT_TOO_LARGE', {
        actual: outputSize,
        max: constraints.maxOutputSize
      });
    }

    return true;
  }
}

/**
 * SecurityViolationError - Thrown when security constraints are violated
 */
class SecurityViolationError extends Error {
  constructor(code, details = {}) {
    super(`Security violation: ${code}`);
    this.name = 'SecurityViolationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * SkillNotFoundError - Thrown when skill doesn't exist
 */
class SkillNotFoundError extends Error {
  constructor(skillId) {
    super(`Skill not found: ${skillId}`);
    this.name = 'SkillNotFoundError';
    this.skillId = skillId;
  }
}

module.exports = {
  DynamicConfigLoader,
  SecurityViolationError,
  SkillNotFoundError
};
