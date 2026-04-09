/**
 * Constraint Validator
 * Enforces user constraints at every decision point
 * This is the core security layer of OpenCode + agents-runtime integration
 */

const {
  ConstraintViolationError,
  ValidationError,
  SecretDetectionError
} = require('./errors');

class ConstraintValidator {
  constructor(constraints = {}, logger = console) {
    this.constraints = this.normalizeConstraints(constraints);
    this.logger = logger;
    this.violations = [];
  }

  /**
   * Normalize and validate constraint structure
   */
  normalizeConstraints(constraints) {
    return {
      files: {
        canRead: constraints.files?.canRead ?? true,
        canWrite: constraints.files?.canWrite ?? false,
        canDelete: constraints.files?.canDelete ?? false,
        forbiddenPatterns: constraints.files?.forbiddenPatterns ?? [
          '.env*',
          'secrets/',
          'credentials/',
          '.git/**',
          'node_modules/**',
          'dist/**',
          'build/**'
        ]
      },
      network: {
        canMakeRequests: constraints.network?.canMakeRequests ?? false,
        allowedDomains: constraints.network?.allowedDomains ?? [],
        methods: constraints.network?.methods ?? ['GET'],
        timeout: constraints.network?.timeout ?? 5000
      },
      codeChanges: {
        canModify: constraints.codeChanges?.canModify ?? false,
        canPropose: constraints.codeChanges?.canPropose ?? true,
        requiresApproval: constraints.codeChanges?.requiresApproval ?? true
      },
      execution: {
        canExecute: constraints.execution?.canExecute ?? false,
        canSpawnProcesses: constraints.execution?.canSpawnProcesses ?? false,
        canAccessEnv: constraints.execution?.canAccessEnv ?? false
      },
      data: {
        canAccessSecrets: constraints.data?.canAccessSecrets ?? false,
        canAccessPII: constraints.data?.canAccessPII ?? false,
        canAccessAuth: constraints.data?.canAccessAuth ?? false
      }
    };
  }

  /**
   * HARD CHECK: Validate that dangerous operations are blocked
   * This is non-negotiable
   */
  validateHardConstraints() {
    const errors = [];

    // Write must be false
    if (this.constraints.files.canWrite === true) {
      errors.push('CRITICAL: canWrite=true is forbidden. OpenCode is read-only.');
    }

    // Execute must be false
    if (this.constraints.execution.canExecute === true) {
      errors.push('CRITICAL: canExecute=true is forbidden. No shell access.');
    }

    // Secrets must be false
    if (this.constraints.data.canAccessSecrets === true) {
      errors.push('CRITICAL: canAccessSecrets=true is forbidden. Security risk.');
    }

    if (errors.length > 0) {
      throw new ConstraintViolationError(
        'Hard constraint violation detected',
        { constraint: 'hard-constraints', violations: errors }
      );
    }

    this.logger.debug('✓ Hard constraints validated');
    return true;
  }

  /**
   * Check if a file path is allowed to be read
   */
  isFilePathAllowed(filePath) {
    if (!this.constraints.files.canRead) {
      throw new ConstraintViolationError(
        'File read not allowed',
        { constraint: 'files.canRead', value: filePath }
      );
    }

    // Check against forbidden patterns
    const forbidden = this.constraints.files.forbiddenPatterns;
    for (const pattern of forbidden) {
      if (this.matchesPattern(filePath, pattern)) {
        throw new ConstraintViolationError(
          `File path matches forbidden pattern: ${pattern}`,
          { constraint: 'forbidden-patterns', value: filePath, pattern }
        );
      }
    }

    // Check for path traversal
    if (filePath.includes('..') || filePath.includes('./..')) {
      throw new ConstraintViolationError(
        'Path traversal detected',
        { constraint: 'path-traversal', value: filePath }
      );
    }

    return true;
  }

  /**
   * Check if a code modification is allowed
   */
  canModifyCode() {
    if (!this.constraints.codeChanges.canPropose) {
      throw new ConstraintViolationError(
        'Code modification not allowed',
        { constraint: 'codeChanges.canPropose', value: false }
      );
    }

    // If modification is allowed, it requires approval
    if (this.constraints.codeChanges.requiresApproval) {
      return { allowed: true, requiresApproval: true };
    }

    return { allowed: true, requiresApproval: false };
  }

  /**
   * Check if a network request is allowed
   */
  isNetworkRequestAllowed(domain, method = 'GET') {
    if (!this.constraints.network.canMakeRequests) {
      throw new ConstraintViolationError(
        'Network requests not allowed',
        { constraint: 'network.canMakeRequests', value: false }
      );
    }

    // Check if domain is in whitelist
    if (this.constraints.network.allowedDomains.length > 0) {
      const allowed = this.constraints.network.allowedDomains.some(
        d => domain === d || domain.endsWith(d)
      );

      if (!allowed) {
        throw new ConstraintViolationError(
          `Domain not in whitelist: ${domain}`,
          { constraint: 'allowed-domains', value: domain, allowed: this.constraints.network.allowedDomains }
        );
      }
    }

    // Check method
    if (!this.constraints.network.methods.includes(method)) {
      throw new ConstraintViolationError(
        `HTTP method not allowed: ${method}`,
        { constraint: 'network-methods', value: method, allowed: this.constraints.network.methods }
      );
    }

    return true;
  }

  /**
   * Check if a skill can be executed
   */
  canExecuteSkill(skillId) {
    // Blocked skills
    const BLOCKED_SKILLS = [
      'system-command',  // No shell access
      'file-operations/delete',  // No deletion
      'file-operations/write'  // No writing
    ];

    if (BLOCKED_SKILLS.includes(skillId)) {
      throw new ConstraintViolationError(
        `Skill "${skillId}" is blocked`,
        { constraint: 'blocked-skills', value: skillId }
      );
    }

    // Only L1 (Observer) skills allowed
    const ALLOWED_SKILLS = {
      'code-analysis': { level: 1, mode: 'read-only' },
      'security-audit': { level: 1, mode: 'read-only' },
      'file-operations': { level: 1, mode: 'read-only' },
      'http-request': { level: 1, mode: 'read-only' },
      'logging': { level: 1, mode: 'read-only' },
      'data-transform': { level: 1, mode: 'read-only' },
      'refactor': { level: 2, mode: 'propose-only' }  // Only proposals
    };

    const skill = ALLOWED_SKILLS[skillId];
    if (!skill) {
      throw new ConstraintViolationError(
        `Unknown skill: ${skillId}`,
        { constraint: 'unknown-skill', value: skillId }
      );
    }

    return skill;
  }

  /**
   * Validate output doesn't contain secrets
   */
  validateOutput(output) {
    if (typeof output !== 'object') return true;

    const SECRET_PATTERNS = [
      {
        name: 'password',
        regex: /password[:\s]*['"]?[^'"\s,}]*['":]?/gi
      },
      {
        name: 'api-key',
        regex: /api[_-]?key[:\s]*['"]?[^'"\s,}]*['":]?/gi
      },
      {
        name: 'token',
        regex: /token[:\s]*['"]?[^'"\s,}]*['":]?/gi
      },
      {
        name: 'secret',
        regex: /secret[:\s]*['"]?[^'"\s,}]*['":]?/gi
      },
      {
        name: 'bearer',
        regex: /bearer\s+[\w\-_.]+/gi
      },
      {
        name: 'aws-key',
        regex: /AKIA[0-9A-Z]{16}/g
      },
      {
        name: 'private-key',
        regex: /-----BEGIN\s+(PRIVATE|RSA)\s+KEY/gi
      }
    ];

    const findings = [];
    const outputStr = JSON.stringify(output);

    for (const pattern of SECRET_PATTERNS) {
      const matches = outputStr.match(pattern.regex);
      if (matches && matches.length > 0) {
        // Filter out false positives
        const validMatches = matches.filter(m => m.length > 8);
        if (validMatches.length > 0) {
          findings.push({
            type: pattern.name,
            count: validMatches.length,
            examples: validMatches.slice(0, 2)
          });
        }
      }
    }

    if (findings.length > 0) {
      this.logger.error('🚨 SECURITY: Secrets detected in output!', findings);
      throw new SecretDetectionError(
        'Sensitive data detected in output',
        { patterns: findings, findings }
      );
    }

    return true;
  }

  /**
   * Strip secrets from output
   */
  stripSecrets(output) {
    let result = typeof output === 'string' ? output : JSON.stringify(output);

    const SECRET_PATTERNS = [
      /password[:\s]*['"]?[^'"\s,}]*['":]?/gi,
      /api[_-]?key[:\s]*['"]?[^'"\s,}]*['":]?/gi,
      /token[:\s]*['"]?[^'"\s,}]*['":]?/gi,
      /secret[:\s]*['"]?[^'"\s,}]*['":]?/gi,
      /bearer\s+[\w\-_.]+/gi,
      /AKIA[0-9A-Z]{16}/g,
      /-----BEGIN\s+(PRIVATE|RSA)\s+KEY[\s\S]*?-----END\s+(PRIVATE|RSA)\s+KEY/g
    ];

    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }

    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  /**
   * Validate approval is required for operation
   */
  requiresApproval(operationType) {
    const REQUIRES_APPROVAL = [
      'refactor',
      'code-modification',
      'file-deletion',
      'external-api-call'
    ];

    return REQUIRES_APPROVAL.includes(operationType);
  }

  /**
   * Check if execution time is reasonable
   */
  isExecutionTimeAcceptable(duration, skillId) {
    const TIMEOUT_LIMITS = {
      'code-analysis': 30000,
      'security-audit': 30000,
      'file-operations': 5000,
      'http-request': 10000,
      'logging': 5000,
      'data-transform': 5000,
      'refactor': 30000,
      default: 30000
    };

    const limit = TIMEOUT_LIMITS[skillId] || TIMEOUT_LIMITS.default;
    return duration < limit;
  }

  /**
   * Generate constraint report for audit
   */
  getConstraintReport() {
    return {
      timestamp: new Date().toISOString(),
      constraints: this.constraints,
      violations: this.violations,
      summary: {
        canRead: this.constraints.files.canRead,
        canWrite: this.constraints.files.canWrite,
        canExecute: this.constraints.execution.canExecute,
        canMakeNetworkRequests: this.constraints.network.canMakeRequests,
        forbiddenPathCount: this.constraints.files.forbiddenPatterns.length,
        hardConstraintsViolated: this.violations.length > 0
      }
    };
  }

  /**
   * Helper: match path against pattern (supports wildcards)
   */
  matchesPattern(path, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }
}

module.exports = ConstraintValidator;
