"use strict";
/**
 * src/loader/agent-compliance-checker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent configuration compliance checks
 * Reusable module that can be called from agent-discovery.js and CLI
 */

const fs   = require("fs");
const path = require("path");

/**
 * Convert glob pattern to regex
 */
function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*\//g, "(.+/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`(^|/)${escaped}(/|$)`, "i");
}

/**
 * Compliance check definitions
 */
const COMPLIANCE_CHECKS = [
  {
    id: "CHK-001",
    name: "Agent identity declaration completeness",
    run(agentConfig) {
      const required = ["id", "role", "authorization_level"];
      const agent    = agentConfig?.agent ?? {};
      const missing  = required.filter((k) => agent[k] === undefined || agent[k] === "");
      if (missing.length > 0) {
        return {
          pass: false,
          detail: `Missing required fields: ${missing.join(", ")}`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "CHK-002",
    name: "Authorization level is a valid integer (1, 2, or 3)",
    run(agentConfig) {
      const level = parseInt(agentConfig?.agent?.authorization_level, 10);
      if (![1, 2, 3].includes(level)) {
        return {
          pass: false,
          detail: `authorization_level must be 1, 2, or 3. Got: '${agentConfig?.agent?.authorization_level}'`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "CHK-003",
    name: "Read-only agents must have authorization_level = 1",
    run(agentConfig) {
      const agent = agentConfig?.agent ?? {};
      const readOnly = agent.read_only === "true" || agent.read_only === true;
      if (readOnly && parseInt(agent.authorization_level, 10) > 1) {
        return {
          pass: false,
          detail: "An agent declared as read_only:true cannot have authorization_level > 1.",
        };
      }
      return { pass: true };
    },
  },
  {
    id: "CHK-004",
    name: "Declared skills exist in registry",
    run(agentConfig, settings) {
      const skillSets    = agentConfig?.agent?.skill_set ?? [];
      const skills       = Array.isArray(skillSets) ? skillSets : [skillSets];
      const registryPath = settings?.skills?.registry_path ?? ".agents/skills/";
      const missing = skills.filter(
        (skill) => !fs.existsSync(path.join(registryPath, skill, "SKILL.md"))
      );
      if (missing.length > 0) {
        return {
          pass: false,
          detail: `Skills not found in registry: ${missing.join(", ")}`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "CHK-005",
    name: "No forbidden file patterns in declared read paths",
    run(agentConfig, settings) {
      const declaredPaths = agentConfig?.agent?.read_paths ?? [];
      const forbidden     = settings?.security?.forbidden_file_patterns ?? [];
      const violations    = [];
      for (const p of declaredPaths) {
        for (const pattern of forbidden) {
          if (patternToRegex(pattern).test(p)) {
            violations.push(`'${p}' matches forbidden pattern '${pattern}'`);
          }
        }
      }
      if (violations.length > 0) {
        return {
          pass: false,
          detail: `Forbidden read paths declared:\n  ${violations.join("\n  ")}`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "CHK-006",
    name: "Agent ID does not contain whitespace or special characters",
    run(agentConfig) {
      const id = agentConfig?.agent?.id ?? "";
      if (!/^[a-z0-9][a-z0-9\-_]*$/.test(id)) {
        return {
          pass: false,
          detail: `Agent ID '${id}' is invalid. Use lowercase alphanumeric, hyphens, and underscores only.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "CHK-007",
    name: "settings.json is present and parseable",
    run(_agentConfig, settings) {
      if (!settings) {
        return {
          pass: false,
          detail: ".agents/settings.json is missing or unparseable.",
        };
      }
      return { pass: true };
    },
  },
];

/**
 * Run all compliance checks on agent configuration
 * @param {object} agentConfig - Agent configuration
 * @param {object} settings - Runtime settings
 * @param {object} logger - Optional structured logger
 * @returns {Promise<object>} { passed, checks_passed, checks_total, failures }
 */
async function runComplianceChecks(agentConfig, settings, logger) {
  const failures = [];
  let passed = 0;

  for (const check of COMPLIANCE_CHECKS) {
    let result;
    try {
      result = check.run(agentConfig, settings);
    } catch (err) {
      result = {
        pass: false,
        detail: `Check threw unexpected error: ${err.message}`,
      };
    }

     if (result.pass) {
       passed++;
       if (logger) {
         logger.info({
           message: `[compliance-checker] Check passed`,
           check_id: check.id,
           check_name: check.name,
         });
       }
     } else {
       failures.push({
         id: check.id,
         name: check.name,
         detail: result.detail,
       });
       if (logger) {
         logger.warn({
           message: `[compliance-checker] Check failed`,
           check_id: check.id,
           check_name: check.name,
           detail: result.detail,
         });
       }
     }
  }

  return {
    passed: failures.length === 0,
    checks_passed: passed,
    checks_total: COMPLIANCE_CHECKS.length,
    failures,
  };
}

module.exports = {
  runComplianceChecks,
  COMPLIANCE_CHECKS,
  patternToRegex,
};
