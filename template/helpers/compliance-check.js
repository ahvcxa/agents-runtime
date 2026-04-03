#!/usr/bin/env node
/**
 * .agents/helpers/compliance-check.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Startup Compliance Validator
 * Vendor-neutral — compatible with any agent runtime.
 *
 * Every agent MUST run this utility before executing any skill.
 *
 * Exit codes:
 *   0  — All checks passed. Agent may proceed.
 *   1  — One or more checks failed. Agent MUST NOT proceed.
 *
 * Usage:
 *   node .agents/helpers/compliance-check.js --agent-config ./agent.yaml
 */

const fs   = require("fs");
const path = require("path");

const RED    = (s) => `\x1b[31m${s}\x1b[0m`;
const GREEN  = (s) => `\x1b[32m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;

function loadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (e) { return null; }
}

function loadYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const result  = {};
    const agentBlock = content.match(/agent:\s*([\s\S]*?)(?:\n\S|$)/);
    if (!agentBlock) return null;
    const lines = agentBlock[1].split("\n").filter(Boolean);
    lines.forEach((line) => {
      const match = line.match(/^\s*(\w+):\s*(.+)/);
      if (match) result[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    });
    return { agent: result };
  } catch (e) { return null; }
}

function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*\//g, "(.+/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`(^|/)${escaped}(/|$)`, "i");
}

const checks = [
  {
    id: "CHK-001",
    name: "Agent identity declaration completeness",
    run(agentConfig) {
      const required = ["id", "role", "authorization_level"];
      const agent    = agentConfig?.agent ?? {};
      const missing  = required.filter((k) => agent[k] === undefined || agent[k] === "");
      if (missing.length > 0) return { pass: false, detail: `Missing required fields: ${missing.join(", ")}` };
      return { pass: true };
    },
  },
  {
    id: "CHK-002",
    name: "Authorization level is a valid integer (1, 2, or 3)",
    run(agentConfig) {
      const level = parseInt(agentConfig?.agent?.authorization_level, 10);
      if (![1, 2, 3].includes(level))
        return { pass: false, detail: `authorization_level must be 1, 2, or 3. Got: '${agentConfig?.agent?.authorization_level}'` };
      return { pass: true };
    },
  },
  {
    id: "CHK-003",
    name: "Read-only agents must have authorization_level = 1",
    run(agentConfig) {
      const agent = agentConfig?.agent ?? {};
      const readOnly = agent.read_only === "true" || agent.read_only === true;
      if (readOnly && parseInt(agent.authorization_level, 10) > 1)
        return { pass: false, detail: "An agent declared as read_only:true cannot have authorization_level > 1." };
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
      if (missing.length > 0) return { pass: false, detail: `Skills not found in registry: ${missing.join(", ")}` };
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
          if (patternToRegex(pattern).test(p)) violations.push(`'${p}' matches forbidden pattern '${pattern}'`);
        }
      }
      if (violations.length > 0) return { pass: false, detail: `Forbidden read paths declared:\n  ${violations.join("\n  ")}` };
      return { pass: true };
    },
  },
  {
    id: "CHK-006",
    name: "Agent ID does not contain whitespace or special characters",
    run(agentConfig) {
      const id = agentConfig?.agent?.id ?? "";
      if (!/^[a-z0-9][a-z0-9\-_]*$/.test(id))
        return { pass: false, detail: `Agent ID '${id}' is invalid. Use lowercase alphanumeric, hyphens, and underscores only.` };
      return { pass: true };
    },
  },
  {
    id: "CHK-007",
    name: "settings.json is present and parseable",
    run(_agentConfig, settings) {
      if (!settings) return { pass: false, detail: ".agents/settings.json is missing or unparseable." };
      return { pass: true };
    },
  },
];

function run() {
  console.log(BOLD("\nAgent Compliance Validator\n") + "─".repeat(50));

  const configArgIndex = process.argv.indexOf("--agent-config");
  const agentConfigPath = configArgIndex >= 0 ? process.argv[configArgIndex + 1] : null;

  if (!agentConfigPath) {
    console.error(RED("Error: --agent-config <path> is required."));
    process.exit(1);
  }

  const settingsPath = ".agents/settings.json";
  const settings     = loadJson(settingsPath);
  const agentConfig  = agentConfigPath.endsWith(".json") ? loadJson(agentConfigPath) : loadYaml(agentConfigPath);

  if (!agentConfig) {
    console.error(RED(`Error: Could not parse agent config at '${agentConfigPath}'.`));
    process.exit(1);
  }

  console.log(`Agent config : ${agentConfigPath}`);
  console.log(`Settings     : ${settingsPath}`);
  console.log(`Agent ID     : ${agentConfig?.agent?.id ?? "(unknown)"}\n`);

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    let result;
    try { result = check.run(agentConfig, settings); }
    catch (e) { result = { pass: false, detail: `Check threw unexpected error: ${e.message}` }; }

    if (result.pass) {
      console.log(`${GREEN("✓")}  [${check.id}] ${check.name}`);
      passed++;
    } else {
      console.log(`${RED("✗")}  [${check.id}] ${check.name}`);
      console.log(`   ${YELLOW("→")} ${result.detail}`);
      failed++;
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log(`Results: ${GREEN(passed + " passed")}, ${failed > 0 ? RED(failed + " failed") : "0 failed"}\n`);

  if (failed > 0) {
    console.error(RED("COMPLIANCE FAILURE — Agent MUST NOT proceed.\n"));
    process.exit(1);
  } else {
    console.log(GREEN("All checks passed. Agent may proceed.\n"));
    process.exit(0);
  }
}

run();
