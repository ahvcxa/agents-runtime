"use strict";
/**
 * src/loader/agent-discovery.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatic agent.yaml discovery and authorization module
 * 
 * Vendor-neutral implementation:
 * - Searches for agent.yaml in configurable search paths
 * - Parses YAML/JSON configuration
 * - Runs compliance checks
 * - Returns validated agent configuration with metadata
 * 
 * Used by: AgentRuntime.init() and all external callers
 */

const fs   = require("fs");
const path = require("path");
const yaml = require("js-yaml");

/**
 * Discovers agent.yaml and runs authorization checks
 * @param {string} projectRoot - Project root directory
 * @param {object} settings - Runtime settings (from settings.json)
 * @param {object} logger - Optional structured logger
 * @returns {Promise<object>} { path, config, compliance, discoveredAt }
 * @throws {Error} If agent not found or compliance check fails
 */
async function discoverAndAuthorizeAgent(projectRoot, settings, logger) {
  const startTime = Date.now();
  
  // 1. Build search paths (from settings or defaults)
  const searchPathsConfig = settings?.ai_agent_discovery?.search_paths || [
    "./agent.yaml",
    "../agent.yaml",
    "../../agent.yaml",
  ];
  
  const searchPaths = searchPathsConfig.map((p) => 
    path.resolve(projectRoot, p)
  );

  if (logger) {
    logger.info({
      message: "[agent-discovery] Starting agent discovery",
      project_root: projectRoot,
      search_paths: searchPaths,
    });
  }

  // 2. Search for agent.yaml
  let agentPath = null;
  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      agentPath = searchPath;
      break;
    }
  }

  // 3. Handle not found
  if (!agentPath) {
    const errorMsg = `[agent-discovery] ConfigurationNotFound: agent.yaml not found in search paths: ${searchPathsConfig.join(", ")}`;
    if (logger) {
      logger.error({
        event_type: "ERROR",
        message: errorMsg,
        search_paths: searchPathsConfig,
      });
    }
    throw new Error(errorMsg);
  }

   if (logger) {
     logger.info({
       message: "[agent-discovery] Agent configuration file located",
       agent_path: agentPath,
     });
   }

  // 4. Parse YAML/JSON
  let agentConfig;
  try {
    const content = fs.readFileSync(agentPath, "utf8");
    
    // Try YAML first
    try {
      agentConfig = yaml.load(content);
    } catch (yamlErr) {
      // Fall back to JSON
      agentConfig = JSON.parse(content);
    }
  } catch (err) {
    const errorMsg = `[agent-discovery] Failed to parse agent configuration: ${err.message}`;
    if (logger) {
      logger.error({
        event_type: "ERROR",
        message: errorMsg,
        agent_path: agentPath,
        error: err.message,
      });
    }
    throw new Error(errorMsg);
  }

   if (logger) {
     logger.info({
       message: "[agent-discovery] Agent configuration parsed successfully",
       agent_id: agentConfig?.agent?.id,
       agent_role: agentConfig?.agent?.role,
       authorization_level: agentConfig?.agent?.authorization_level,
     });
   }

  // 5. Run compliance checks
  let compliance;
  try {
    // Import compliance check helper
    const { runComplianceChecks } = require("./agent-compliance-checker");
    
    compliance = await runComplianceChecks(
      agentConfig,
      settings,
      logger
    );

    if (!compliance.passed) {
      const errorMsg = `[agent-discovery] STARTUP_FAILURE: Agent failed compliance check`;
      if (logger) {
        logger.error({
          event_type: "ERROR",
          message: errorMsg,
          agent_id: agentConfig?.agent?.id,
          failed_checks: compliance.failures,
        });
      }
      throw new Error(errorMsg);
    }
  } catch (err) {
    if (err.message.includes("STARTUP_FAILURE")) {
      throw err;
    }
    const errorMsg = `[agent-discovery] Compliance check error: ${err.message}`;
    if (logger) {
      logger.error({
        event_type: "ERROR",
        message: errorMsg,
        error: err.message,
      });
    }
    throw new Error(errorMsg);
  }

  const discoveryTime = Date.now() - startTime;

  const result = {
    path: agentPath,
    config: agentConfig,
    compliance: {
      passed: true,
      checks_passed: compliance.checks_passed,
      checks_total: compliance.checks_total,
    },
    discoveredAt: new Date().toISOString(),
    discovery_time_ms: discoveryTime,
  };

   if (logger) {
     logger.info({
       message: "[agent-discovery] Agent discovery completed successfully",
       agent_id: agentConfig?.agent?.id,
       discovery_time_ms: discoveryTime,
     });
   }

  return result;
}

/**
 * Attempt agent discovery, but return null if not found (soft fail)
 * Used when auto-discovery is optional
 */
async function tryDiscoverAgent(projectRoot, settings, logger) {
  try {
    return await discoverAndAuthorizeAgent(projectRoot, settings, logger);
  } catch (err) {
    if (logger) {
      logger.warn({
        event_type: "WARN",
        message: "[agent-discovery] Agent discovery failed (soft fail)",
        error: err.message,
      });
    }
    return null;
  }
}

module.exports = {
  discoverAndAuthorizeAgent,
  tryDiscoverAgent,
};
