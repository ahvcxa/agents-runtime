const minimatch = require('minimatch');

/**
 * MemoryACL - Memory Access Control List enforcement
 * 
 * Validates agent authorization against memory namespace ACL rules
 * Supports role-based and namespace pattern-based access control
 */
class MemoryACL {
  /**
   * Default ACL by authorization level
   */
  static get DEFAULT_ACL() {
    return {
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
  }

  /**
   * Get permission string for namespace and auth level
   * @param {string} namespace - e.g., 'skill:*:cache:*', 'agent:state'
   * @param {number} authLevel - 1, 2, or 3
   * @returns {string|null} - 'R', 'RW', 'RWX', or null if denied
   */
  static getPermission(namespace, authLevel) {
    if (!Number.isInteger(authLevel) || authLevel < 1 || authLevel > 3) {
      return null;
    }

    const acl = MemoryACL.DEFAULT_ACL[authLevel];
    if (!acl) {
      return null;
    }

    // Exact match first
    if (acl[namespace]) {
      return acl[namespace];
    }

    // Pattern match (wildcard support)
    for (const [pattern, perm] of Object.entries(acl)) {
      if (pattern.includes('*')) {
        // Special case: single '*' matches everything
        if (pattern === '*') {
          return perm;
        }

        // Convert glob pattern to RegExp
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '[^:]*'); // * matches any char except :

        if (new RegExp(`^${regexPattern}$`).test(namespace)) {
          return perm;
        }
      }
    }

    return null; // Denied by default
  }

  /**
   * Check if operation is allowed for namespace and auth level
   * @param {string} operation - 'read', 'write', 'delete'
   * @param {string} namespace
   * @param {number} authLevel
   * @throws {MemoryACLError} if operation not allowed
   */
  static validate(operation, namespace, authLevel) {
    const perm = MemoryACL.getPermission(namespace, authLevel);

    if (!perm) {
      throw new MemoryACLError('ACCESS_DENIED', {
        operation,
        namespace,
        authLevel
      });
    }

    // Validate operation against permission
    if (operation === 'write' && !perm.includes('W')) {
      throw new MemoryACLError('WRITE_DENIED', {
        operation,
        namespace,
        permission: perm
      });
    }

    if (operation === 'delete' && !perm.includes('X')) {
      throw new MemoryACLError('DELETE_DENIED', {
        operation,
        namespace,
        permission: perm
      });
    }

    // Read is always allowed if namespace is accessible (R, RW, RWX all allow read)
    return true;
  }

  /**
   * Get all accessible namespaces for auth level and operation
   * @param {number} authLevel
   * @param {string} operation - 'read' or 'write'
   * @returns {string[]} - Array of accessible namespace patterns
   */
  static getAccessibleNamespaces(authLevel, operation = 'read') {
    const acl = MemoryACL.DEFAULT_ACL[authLevel];
    if (!acl) {
      return [];
    }

    const accessible = [];
    for (const [namespace, perm] of Object.entries(acl)) {
      if (operation === 'read') {
        if (perm.includes('R')) {
          accessible.push(namespace);
        }
      } else if (operation === 'write') {
        if (perm.includes('W')) {
          accessible.push(namespace);
        }
      }
    }

    return accessible;
  }

  /**
   * Check if namespace matches pattern (supports wildcards)
   * @param {string} namespace - Concrete namespace (e.g., 'skill:analysis:cache:result')
   * @param {string} pattern - Pattern (e.g., 'skill:*:cache:*')
   * @returns {boolean}
   */
  static namespaceMatches(namespace, pattern) {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^:]*');

    return new RegExp(`^${regexPattern}$`).test(namespace);
  }

  /**
   * Apply custom ACL rules (override defaults)
   * @param {number} authLevel
   * @param {Object} customRules - { namespace: 'permission' }
   */
  static applyCustomRules(authLevel, customRules) {
    const acl = MemoryACL.DEFAULT_ACL[authLevel];
    if (!acl) {
      return;
    }

    Object.assign(acl, customRules);
  }
}

/**
 * MemoryACLError - Thrown when memory ACL violation occurs
 */
class MemoryACLError extends Error {
  constructor(code, details = {}) {
    super(`Memory ACL violation: ${code}`);
    this.name = 'MemoryACLError';
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  MemoryACL,
  MemoryACLError
};
