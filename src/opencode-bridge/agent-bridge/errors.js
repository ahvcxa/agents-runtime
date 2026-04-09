/**
 * OpenCode Error Types
 * Comprehensive error hierarchy for agent-bridge operations
 */

class OpenCodeError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      type: this.name,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Constraint violation - User rule broken
 */
class ConstraintViolationError extends OpenCodeError {
  constructor(message, { constraint, value, reason } = {}) {
    super(message, { constraint, value, reason });
    this.isRecoverable = false; // NEVER RECOVER FROM THIS
  }
}

/**
 * Agent skill failed
 */
class SkillExecutionError extends OpenCodeError {
  constructor(message, { skillId, duration, error, logs } = {}) {
    super(message, { skillId, duration, error, logs });
    this.skillId = skillId;
    this.isRecoverable = true; // Retry possible
    this.retryCount = 0;
  }
}

/**
 * Validation failed
 */
class ValidationError extends OpenCodeError {
  constructor(message, { field, expected, actual, rule } = {}) {
    super(message, { field, expected, actual, rule });
    this.isRecoverable = false;
  }
}

/**
 * Parsing failed
 */
class ParseError extends OpenCodeError {
  constructor(message, { data, format, error } = {}) {
    super(message, { data, format, error });
    this.isRecoverable = true; // Fallback possible
  }
}

/**
 * Secret detection
 */
class SecretDetectionError extends OpenCodeError {
  constructor(message, { patterns, findings } = {}) {
    super(message, { patterns, findings });
    this.isRecoverable = true; // Can strip and continue
  }
}

/**
 * Approval rejected
 */
class ApprovalRejectedError extends OpenCodeError {
  constructor(message, { operation, reason, attemptedAction } = {}) {
    super(message, { operation, reason, attemptedAction });
    this.isRecoverable = false; // User said no
  }
}

/**
 * Timeout
 */
class TimeoutError extends OpenCodeError {
  constructor(message, { operation, duration, limit } = {}) {
    super(message, { operation, duration, limit });
    this.isRecoverable = true; // Can retry with longer timeout
  }
}

/**
 * Configuration error
 */
class ConfigurationError extends OpenCodeError {
  constructor(message, { missing, invalid } = {}) {
    super(message, { missing, invalid });
    this.isRecoverable = false;
  }
}

/**
 * Error handler with recovery strategies
 */
class ErrorHandler {
  static handle(error, context = {}) {
    const logger = context.logger || console;

    // Log error
    logger.error(`[${error.name}] ${error.message}`, error.context);

    // Determine action
    if (error instanceof ConstraintViolationError) {
      return this.handleConstraintViolation(error, context);
    } else if (error instanceof SkillExecutionError) {
      return this.handleSkillExecutionError(error, context);
    } else if (error instanceof SecretDetectionError) {
      return this.handleSecretDetection(error, context);
    } else if (error instanceof TimeoutError) {
      return this.handleTimeout(error, context);
    } else if (error instanceof ValidationError) {
      return this.handleValidationError(error, context);
    } else if (error instanceof ParseError) {
      return this.handleParseError(error, context);
    } else {
      return this.handleUnexpectedError(error, context);
    }
  }

  static handleConstraintViolation(error, context) {
    // HARD BLOCK - NEVER PROCEED
    const decision = {
      action: 'BLOCK',
      reason: 'Constraint violation - operation blocked',
      message: `❌ ${error.message}`,
      recoverable: false,
      userMessage: `Operation blocked: violates constraint "${error.context.constraint}"`
    };

    context.auditLog?.('constraint_violation', {
      constraint: error.context.constraint,
      operation: context.operation,
      blocked: true
    });

    return decision;
  }

  static handleSkillExecutionError(error, context) {
    error.retryCount = (error.retryCount || 0) + 1;

    if (error.retryCount < 3) {
      const decision = {
        action: 'RETRY',
        reason: `Skill execution failed, retry ${error.retryCount}/3`,
        message: `⏳ Retrying ${error.skillId}...`,
        recoverable: true,
        retryCount: error.retryCount,
        userMessage: `Skill "${error.skillId}" failed, retrying...`
      };

      return decision;
    } else {
      const decision = {
        action: 'FALLBACK',
        reason: 'Max retries exceeded',
        message: `❌ ${error.skillId} failed after ${error.retryCount} attempts`,
        recoverable: false,
        userMessage: `Skill "${error.skillId}" failed. Try with different parameters or check logs.`
      };

      return decision;
    }
  }

  static handleSecretDetection(error, context) {
    const decision = {
      action: 'STRIP_AND_CONTINUE',
      reason: 'Sensitive data detected and stripped',
      message: `⚠️  Detected sensitive data - automatically redacted`,
      recoverable: true,
      userMessage: `⚠️ Detected and redacted sensitive information from results`,
      dataStripped: true
    };

    context.auditLog?.('secret_detection', {
      patterns: error.context.patterns,
      findings: error.context.findings.length,
      stripped: true
    });

    return decision;
  }

  static handleTimeout(error, context) {
    const decision = {
      action: 'RETRY_WITH_LONGER_TIMEOUT',
      reason: 'Operation timed out',
      message: `⏱️ Operation took too long, retrying with extended timeout`,
      recoverable: true,
      newTimeout: error.context.limit * 2,
      userMessage: `Operation timed out (${error.context.duration}ms). Retrying with longer timeout...`
    };

    return decision;
  }

  static handleValidationError(error, context) {
    const decision = {
      action: 'BLOCK',
      reason: `Validation failed: ${error.message}`,
      message: `❌ Invalid input`,
      recoverable: false,
      userMessage: `Input validation failed: ${error.message}. Check parameters and try again.`,
      details: {
        field: error.context.field,
        expected: error.context.expected,
        actual: error.context.actual
      }
    };

    return decision;
  }

  static handleParseError(error, context) {
    const decision = {
      action: 'FALLBACK_TO_RAW',
      reason: 'Failed to parse structured output',
      message: `⚠️ Could not parse output, using raw format`,
      recoverable: true,
      userMessage: `Skill output in unexpected format - showing raw results`,
      rawData: error.context.data
    };

    context.auditLog?.('parse_error', {
      format: error.context.format,
      error: error.context.error.message
    });

    return decision;
  }

  static handleUnexpectedError(error, context) {
    const decision = {
      action: 'FAIL_SAFE',
      reason: 'Unexpected error occurred',
      message: `❌ Unexpected error: ${error.message}`,
      recoverable: false,
      userMessage: 'An unexpected error occurred. Please check logs and try again.',
      errorDetails: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    };

    context.auditLog?.('unexpected_error', {
      error: error.message,
      stack: error.stack
    });

    return decision;
  }
}

module.exports = {
  // Error classes
  OpenCodeError,
  ConstraintViolationError,
  SkillExecutionError,
  ValidationError,
  ParseError,
  SecretDetectionError,
  ApprovalRejectedError,
  TimeoutError,
  ConfigurationError,

  // Error handler
  ErrorHandler
};
