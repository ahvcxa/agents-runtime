"use strict";
/**
 * src/loader/settings-loader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads .agents/settings.json and merges defaults.
 */

const fs   = require("fs");
const path = require("path");

const DEFAULTS = {
  runtime: {
    environment: "development",
    max_concurrent_agents: 4,
    agent_timeout_seconds: 120,
    graceful_shutdown_timeout_seconds: 15,
    heartbeat_interval_seconds: 10,
    sandbox: {
      strategy: "process",
      docker_enabled: false,
      docker_image: "node:20-alpine",
      docker_cpus: "1",
      docker_memory: "256m",
      wasm_module_path: "",
    },
    mcp_client: {
      enabled: false,
      auto_discover: true,
      servers: [],
      retry: {
        max_attempts: 2,
        base_delay_ms: 100,
        breaker_threshold: 3,
        breaker_cooldown_ms: 10000,
      },
    },
    cognitive_memory: {
      provider: "in-process",
      sqlite_path: ".agents/.cognitive-memory.sqlite",
      short_term_enabled: true,
      long_term_enabled: true,
      retrieval_top_k: 5,
    },
    hitl: {
      enabled: true,
      require_explicit_approval: true,
      require_approval_token: true,
      token_ttl_seconds: 300,
      high_risk_patterns: [
        "rm -rf",
        "curl | sh",
        "wget | bash",
      ],
    },
    observability: {
      enabled: true,
      exporter: "noop",
      cost_tracking: true,
      timeout_ms: 5000,
      exporters: {
        langsmith: { endpoint: "", api_key: "" },
        phoenix: { endpoint: "", api_key: "" },
        helicone: { endpoint: "", api_key: "" },
      },
    },
  },
  logging: {
    output_path: ".agents/logs/agent-{date}.jsonl",
    rotation: "daily",
    max_retained_days: 30,
    verbosity_mode: "standard",
    modes: {
      silent: { allowed_event_types: ["FATAL", "SECURITY_VIOLATION"] },
      standard: {
        allowed_event_types: [
          "FATAL", "SECURITY_VIOLATION", "ERROR", "WARN",
          "SKILL_START", "SKILL_END", "HOOK_FIRE", "AUDIT", "INFO",
        ],
      },
      verbose: {
        allowed_event_types: [
          "FATAL", "SECURITY_VIOLATION", "ERROR", "WARN",
          "SKILL_START", "SKILL_END", "HOOK_FIRE", "AUDIT",
          "INFO", "DEBUG", "MEMORY_READ", "MEMORY_WRITE", "DOMAIN_EVENT",
        ],
      },
      audit_only: { allowed_event_types: ["AUDIT", "SECURITY_VIOLATION"] },
    },
  },
  security: {
    forbidden_file_patterns: [".env", ".env.*", "*.env", "*.pem", "*.key"],
    allowed_endpoints: [],
    input_sanitization: {
      enabled: true,
      max_input_length: 100000,
      reject_null_bytes: true,
      reject_path_traversal: true,
    },
  },
  memory: {
    enabled: true,
    backend: "in-process",
    redis: {},
    postgres: {},
    vector: {},
    semantic_events: {
      enabled: false,
      top_k: 5,
    },
    max_size_mb: 256,
    ttl_default_seconds: 3600,
    eviction_policy: "lru",
    indexes: {
      key_value: { enabled: true },
      tag_based: { enabled: true, max_result_set: 500 },
    },
  },
  skills: {
    registry_path: ".agents/skills/",
    auto_discover: true,
  },
};

/**
 * Deep merge two objects. `override` takes precedence.
 */
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override ?? {})) {
    if (
      typeof override[key] === "object" &&
      override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === "object" &&
      base[key] !== null
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * Load settings.json and merge with defaults.
 * @param {string} projectRoot
 * @returns {object}
 */
function loadSettings(projectRoot) {
  const settingsPath = path.join(projectRoot, ".agents", "settings.json");

  if (!fs.existsSync(settingsPath)) {
    console.warn(`[settings-loader] settings.json not found at ${settingsPath}. Using defaults.`);
    return { ...DEFAULTS, _projectRoot: projectRoot };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (err) {
    throw new Error(`[settings-loader] Failed to parse settings.json: ${err.message}`);
  }

  const merged = deepMerge(DEFAULTS, raw);
  merged._projectRoot = projectRoot;
  return merged;
}

module.exports = { loadSettings, deepMerge };
