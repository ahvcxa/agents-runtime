#!/usr/bin/env node
/**
 * .agents/hooks/pre-interaction.hook.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lifecycle Hook: pre-interaction
 * Fires BEFORE AI agent responds to any user input.
 *
 * Verifies the agent has completed the mandatory startup protocol:
 * 1. Located agent.yaml
 * 2. Parsed agent identity
 * 3. Ran compliance check (exit code 0)
 * 4. Loaded settings
 * 5. Initialized memory
 * 6. Emitted AGENT_INITIALIZED event
 *
 * This hook is MANDATORY for AI agents. It prevents user interaction until
 * the agent has been properly initialized and verified.
 *
 * Vendor-neutral — compatible with any agent runtime.
 *
 * @param {object} context
 * @param {string} context.agent_id     - The agent's unique identifier
 * @param {number} context.auth_level   - Authorization level (1, 2, or 3)
 * @param {boolean} context.initialized - Has startup protocol completed?
 * @param {array} context.startup_errors - Array of initialization errors (if any)
 * @param {object} context.settings     - Parsed .agents/settings.json
 * @param {function} context.log        - Logging function
 * @returns {{ allowed: true }}         or throws Error
 */

class InitializationError extends Error {
  constructor(message) {
    super(message);
    this.name = "InitializationError";
    this.event_type = "STARTUP_FAILURE";
    this.timestamp = new Date().toISOString();
  }
}

function preInteractionHook(context) {
  // Verify context has required fields
  if (!context || typeof context !== "object") {
    throw new InitializationError(
      "Invalid context object passed to preInteractionHook"
    );
  }

  const { agent_id, initialized, startup_errors, log } = context;

  // Check 1: Agent must be initialized
  if (!initialized) {
    const message =
      `[INITIALIZATION_ERROR] Agent '${agent_id}' not initialized. ` +
      `Startup protocol must complete before user interaction. ` +
      `See .agents/agent-startup.md for details.`;

    if (log && typeof log === "function") {
      log({
        timestamp: new Date().toISOString(),
        agent_id: agent_id || "unknown",
        event_type: "STARTUP_FAILURE",
        reason: "Agent not initialized",
        message: message,
      });
    }

    throw new InitializationError(message);
  }

  // Check 2: No startup errors should exist
  if (startup_errors && Array.isArray(startup_errors) && startup_errors.length > 0) {
    const errorList = startup_errors.join("\n  ");
    const message =
      `[INITIALIZATION_ERROR] Agent '${agent_id}' has unresolved startup errors:\n` +
      `  ${errorList}\n` +
      `These errors must be fixed before user interaction is allowed.`;

    if (log && typeof log === "function") {
      log({
        timestamp: new Date().toISOString(),
        agent_id: agent_id || "unknown",
        event_type: "STARTUP_FAILURE",
        reason: "Unresolved startup errors",
        errors: startup_errors,
        message: message,
      });
    }

    throw new InitializationError(message);
  }

  // Check 3: Verify compliance check passed (if available)
  if (context.compliance_check_result) {
    if (context.compliance_check_result.status !== "PASSED") {
      const failedChecks = context.compliance_check_result.details
        .filter((c) => !c.pass)
        .map((c) => `${c.id}: ${c.detail}`)
        .join("\n  ");

      const message =
        `[INITIALIZATION_ERROR] Compliance checks failed for '${agent_id}':\n` +
        `  ${failedChecks}\n` +
        `Run 'node .agents/helpers/compliance-check.js --agent-config ./agent.yaml' to debug.`;

      if (log && typeof log === "function") {
        log({
          timestamp: new Date().toISOString(),
          agent_id: agent_id || "unknown",
          event_type: "STARTUP_FAILURE",
          reason: "Compliance checks failed",
          failed_checks: context.compliance_check_result.details.filter(
            (c) => !c.pass
          ),
        });
      }

      throw new InitializationError(message);
    }
  }

  // All checks passed
  if (log && typeof log === "function") {
    log({
      timestamp: new Date().toISOString(),
      agent_id: agent_id || "unknown",
      event_type: "PRE_INTERACTION_PASSED",
      message: `Agent '${agent_id}' cleared for user interaction`,
    });
  }

  return { allowed: true };
}

module.exports = {
  preInteractionHook,
  InitializationError,
};
