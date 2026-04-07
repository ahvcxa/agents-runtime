#!/usr/bin/env node
"use strict";
/**
 * bin/agents.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CLI entry point for the agents-runtime engine.
 *
 * Commands:
 *   agents run   --config <agent.yaml> --skill <id> [--input <json>] [--project <dir>]
 *   agents check --config <agent.yaml> [--project <dir>]
 *   agents list  [--project <dir>]
 *   agents events [--project <dir>] [--limit <n>]
 */

const { Command } = require("commander");
const path        = require("path");
const fs          = require("fs");
const yaml        = require("js-yaml");

const { createRuntime }    = require("../src/engine");
const { exportReport }     = require("../src/report/exporter");
const { RunHistoryStore }  = require("../src/diff/run-history-store");
const { compare }          = require("../src/diff/diff-engine");
const { formatTerminal }   = require("../src/diff/diff-formatter");

// Memory system commands
const {
  handleLearn,
  handleMemoryStats,
  handleMemorySearch,
  handleMemoryLanguages,
  handleMemoryExport,
} = require("../.agents/memory-system/cli/commands");

const program = new Command();

// ─── Config Cache Management ───────────────────────────────────────────────────
const CONFIG_CACHE_FILE = ".agents/agents.local.json";

function saveConfigCache(root, config) {
  const cacheFile = path.join(root, CONFIG_CACHE_FILE);
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(config, null, 2));
  } catch {
    // Silently fail - cache is optional
  }
}

function loadConfigCache(root) {
  const cacheFile = path.join(root, CONFIG_CACHE_FILE);
  try {
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    }
  } catch {
    // Silently fail - cache is optional
  }
  return null;
}

// ─── Terminal Colors & Styling ────────────────────────────────────────────────
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

function logSuccess(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function logError(msg) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function logInfo(msg) {
  console.log(`${colors.blue}ⓘ${colors.reset} ${msg}`);
}

function logWarn(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function sanitizeErrorMessage(err) {
  const raw = String(err?.message || "Unknown error");
  return raw.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

/**
 * User-friendly error messages for common issues
 */
function getUserFriendlyErrorMessage(code, err, context = {}) {
  const msg = err?.message || "";

  const suggestions = {
    AGENT_CONFIG_NOT_FOUND: {
      title: "Agent configuration not found",
      suggestion: `Run 'npm run setup' to create agent.yaml interactively, or use:\n    bash setup-agents.sh . --agent fullstack`,
    },
    AGENT_CONFIG_PARSE_FAILED: {
      title: "Cannot parse agent configuration",
      suggestion: `Check your agent.yaml syntax:\n    - Use spaces, not tabs for indentation\n    - Make sure all colons and quotes are balanced\n    - Try: cat agent.yaml | head -20`,
    },
    INVALID_INPUT_JSON: {
      title: "Invalid JSON input",
      suggestion: `For quick commands, don't use --input:\n    agents analyze src/\n    agents audit src/\n\nFor advanced usage, ensure valid JSON:\n    agents run --input '{"files":["src/"]}'`,
    },
    RUN_COMMAND_FAILED: {
      title: "Skill execution failed",
      suggestion: `Try these steps:\n    1. agents check --config agent.yaml\n    2. agents analyze src/ --verbose\n    3. Check .agents/logs/ for details`,
    },
    ANALYZE_COMMAND_FAILED: {
      title: "Code analysis failed",
      suggestion: `Make sure paths exist and are readable:\n    agents analyze src/\n    agents analyze src/ lib/ tests/\n\nWith verbose output:\n    agents analyze src/ --verbose`,
    },
    AUDIT_COMMAND_FAILED: {
      title: "Security audit failed",
      suggestion: `Try:\n    agents audit src/\n    agents audit src/ --verbose\n    agents audit src/ --export report.json`,
    },
    COMPLIANCE_CHECK_FAILED: {
      title: "Compliance check failed",
      suggestion: `Your agent configuration has issues:\n    1. agents check (auto-detects config)\n    2. agents check --config agent.yaml\n    3. Review agent.yaml for syntax errors`,
    },
    LIST_COMMAND_FAILED: {
      title: "Failed to list skills",
      suggestion: `Make sure .agents/ folder exists:\n    ls -la .agents/\n    npm run setup`,
    },
    DIFF_NO_RUNS: {
      title: `No analysis runs found for skill '${context.skill}'`,
      suggestion: `Run the analysis first:\n    agents analyze src/\n    agents diff --skill code-analysis`,
    },
    DIFF_BASELINE_MISSING: {
      title: "Need at least 2 runs to compare",
      suggestion: `Run the skill twice:\n    agents analyze src/\n    agents analyze src/  (second time)\n    agents diff --skill code-analysis`,
    },
  };

  return suggestions[code] || {
    title: sanitizeErrorMessage(err),
    suggestion: "Check .agents/logs/ for detailed error information",
  };
}

function logCliError(code, err, details = {}) {
  console.log("");
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const userMsg = getUserFriendlyErrorMessage(code, err, details);

  logError(userMsg.title);
  console.log(`\n${colors.gray}${userMsg.suggestion}${colors.reset}\n`);

  // Only show JSON in production or with verbose
  if (isProd || process.argv.includes("--verbose")) {
    const payload = {
      level: "error",
      code,
      message: sanitizeErrorMessage(err),
      ...details,
    };
    if (!isProd && err?.stack) {
      payload.stack = String(err.stack).split("\n").slice(0, 5).join("\n");
    }
    console.error(JSON.stringify(payload));
  }
}

program
  .name("agents")
  .description("Vendor-neutral AI agent runtime CLI")
  .version("2.0.0")
  .hook("preAction", (thisCommand) => {
    // Auto-save config to cache for future commands
    if (thisCommand.opts().config) {
      const root = projectRoot(thisCommand.opts());
      const configPath = path.resolve(thisCommand.opts().config);
      saveConfigCache(root, { config_path: configPath });
    }
  });

// ─── Shared option ───────────────────────────────────────────────────────────
function projectRoot(opts) {
  return path.resolve(opts.project ?? process.cwd());
}

function loadAgentConfig(configPath, root) {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    logCliError("AGENT_CONFIG_NOT_FOUND", new Error(`Agent config not found: ${abs}`), { config_path: abs });
    process.exit(1);
  }
  const raw = fs.readFileSync(abs, "utf8");
  try {
    return yaml.load(raw);
  } catch {
    try { return JSON.parse(raw); } catch {
      logCliError("AGENT_CONFIG_PARSE_FAILED", new Error(`Cannot parse agent config: ${abs}`), { config_path: abs });
      process.exit(1);
    }
  }
}

/**
 * Find agent.yaml or load from cache
 */
function findAgentConfig(root) {
  // Try standard locations first
  const candidates = [
    path.join(root, "agent.yaml"),
    path.join(root, "agent.yml"),
    path.join(root, ".agents", "agent.yaml"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Try cache
  const cached = loadConfigCache(root);
  if (cached?.config_path && fs.existsSync(cached.config_path)) {
    return cached.config_path;
  }

  return null;
}

// ─── agents run ──────────────────────────────────────────────────────────────
program
  .command("run")
  .description("Run a skill for an agent through the full lifecycle pipeline")
  .requiredOption("-c, --config <path>", "Path to agent YAML/JSON config")
  .requiredOption("-s, --skill <id>",    "Skill ID to execute")
  .option("-i, --input <json>",   "JSON input payload", "{}")
  .option("-p, --project <dir>",  "Project root (default: cwd)")
  .option("-e, --export <path>",  "Export result to file (.json/.html/.pdf)")
  .option("-f, --format <type>",  "Export format override: json|html|pdf")
  .option("-v, --verbose",        "Verbose logging")
  .option("--diff",               "Show diff vs. previous run after execution")
  .option("--baseline <ref>",     "Baseline for diff: index (0=latest) or git SHA prefix (default: 1=second-latest)")
  .action(async (opts) => {
    const root        = projectRoot(opts);
    const agentConfig = loadAgentConfig(opts.config);
    let   input;
    try   { input = JSON.parse(opts.input); }
    catch (err) {
      logCliError("INVALID_INPUT_JSON", err, { flag: "--input" });
      process.exit(1);
    }

    try {
      const runtime = await createRuntime({
        projectRoot: root,
        verbosity:   opts.verbose ? "verbose" : undefined,
      });

      const { success, result, duration_ms } = await runtime.runAgent(agentConfig, opts.skill, input);

      console.log("\n\x1b[1m─── Skill Result ───────────────────────────────────────\x1b[0m");
      console.log(JSON.stringify(result, null, 2));
      console.log(`\n\x1b[1mStatus:\x1b[0m ${success ? "\x1b[32mSUCCESS\x1b[0m" : "\x1b[31mFAILED\x1b[0m"} (${duration_ms}ms)`);

      if (opts.export) {
        const inferred = (opts.export.split(".").pop() || "json").toLowerCase();
        const format = opts.format ?? inferred;
        const exportedPath = exportReport({
          result: { success, result, duration_ms, skill: opts.skill, project: root },
          outputPath: opts.export,
          format,
        });
        console.log(`\x1b[36m[EXPORT]\x1b[0m Report written: ${exportedPath}`);
      }

      // ── Diff output ──────────────────────────────────────────────────────────
      if (opts.diff && success) {
        const historyStore = new RunHistoryStore(root);
        // Wait a tick for the async save in agent-runner to flush
        await new Promise(r => setTimeout(r, 200));
        const baselineRef = opts.baseline !== undefined
          ? (isNaN(Number(opts.baseline)) ? opts.baseline : Number(opts.baseline))
          : 1;
        const { current, baseline } = await historyStore.loadPair(opts.skill, { baselineRef });
        if (!baseline) {
          console.log("\x1b[33m[diff]\x1b[0m No previous run found — run the skill again to see a diff.");
        } else {
          const currentFindings  = current?.result?.findings  ?? [];
          const baselineFindings = baseline?.result?.findings ?? [];
          const diff = compare(baselineFindings, currentFindings);
          console.log(formatTerminal(diff, {
            current:  { git_sha: current?.git_sha,  timestamp: current?.timestamp },
            baseline: { git_sha: baseline?.git_sha, timestamp: baseline?.timestamp },
          }));
        }
      }

      await runtime.shutdown();
      process.exit(success ? 0 : 1);
    } catch (err) {
      logCliError("RUN_COMMAND_FAILED", err, { command: "run", skill: opts.skill });
      process.exit(1);
    }
  });

// ─── agents analyze ──────────────────────────────────────────────────────────
// Simplified command: agents analyze src/ [--config path] [--project dir]
program
  .command("analyze [paths...]")
  .description("Quickly analyze code (simplified: agents analyze src/ tests/)")
  .option("-c, --config <path>", "Path to agent config (auto-detected if omitted)")
  .option("-p, --project <dir>", "Project root (default: cwd)")
  .option("-e, --export <path>", "Export result to file (.json/.html/.pdf)")
  .option("-v, --verbose",       "Verbose logging")
  .option("--diff",              "Show diff vs. previous run")
  .action(async (paths, opts) => {
    const root = projectRoot(opts);
    
    if (!paths || paths.length === 0) {
      logError("Please specify paths to analyze: agents analyze src/ tests/");
      process.exit(1);
    }

    // Find config
    let configPath = opts.config;
    if (!configPath) {
      configPath = findAgentConfig(root);
      if (!configPath) {
        logError("No agent config found. Run 'npm run setup' or specify with --config");
        process.exit(1);
      }
      logInfo(`Using config: ${path.relative(root, configPath)}`);
    }

    const agentConfig = loadAgentConfig(configPath, root);

    try {
      const runtime = await createRuntime({
        projectRoot: root,
        verbosity: opts.verbose ? "verbose" : undefined,
      });

      const { success, result, duration_ms } = await runtime.runAgent(
        agentConfig,
        "code-analysis",
        {
          files: paths,
          project_root: root,
        }
      );

      console.log("");
      if (success) {
        logSuccess(`Analysis completed in ${duration_ms}ms`);
        const findings = result?.findings || [];
        console.log(`Found ${findings.length} findings:\n`);

        // Group by severity
        const bySeverity = {};
        findings.forEach((f) => {
          const sev = f.severity || "INFO";
          if (!bySeverity[sev]) bySeverity[sev] = [];
          bySeverity[sev].push(f);
        });

        const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
        for (const severity of severityOrder) {
          if (bySeverity[severity]) {
            console.log(`${colors.bright}${severity}${colors.reset} (${bySeverity[severity].length})`);
            bySeverity[severity].slice(0, 5).forEach((f) => {
              console.log(`  ${colors.gray}${f.file}:${f.line_start}${colors.reset} — ${f.message}`);
            });
            if (bySeverity[severity].length > 5) {
              console.log(`  ${colors.gray}... and ${bySeverity[severity].length - 5} more${colors.reset}`);
            }
          }
        }
      } else {
        logError("Analysis failed");
      }

      if (opts.export) {
        const inferred = (opts.export.split(".").pop() || "json").toLowerCase();
        const format = opts.format ?? inferred;
        const exportedPath = exportReport({
          result: { success, result, duration_ms, skill: "code-analysis", project: root },
          outputPath: opts.export,
          format,
        });
        logSuccess(`Report exported: ${exportedPath}`);
      }

      await runtime.shutdown();
      process.exit(success ? 0 : 1);
    } catch (err) {
      logCliError("ANALYZE_COMMAND_FAILED", err, { command: "analyze", paths });
      process.exit(1);
    }
  });

// ─── agents audit ────────────────────────────────────────────────────────────
// Simplified command: agents audit src/ [--config path] [--project dir]
program
  .command("audit [paths...]")
  .description("Quick security audit (simplified: agents audit src/ .env.example)")
  .option("-c, --config <path>", "Path to agent config (auto-detected if omitted)")
  .option("-p, --project <dir>", "Project root (default: cwd)")
  .option("-e, --export <path>", "Export result to file")
  .option("-v, --verbose",       "Verbose logging")
  .action(async (paths, opts) => {
    const root = projectRoot(opts);

    if (!paths || paths.length === 0) {
      logError("Please specify paths to audit: agents audit src/ .env.example");
      process.exit(1);
    }

    // Find config
    let configPath = opts.config;
    if (!configPath) {
      configPath = findAgentConfig(root);
      if (!configPath) {
        logError("No agent config found. Run 'npm run setup' or specify with --config");
        process.exit(1);
      }
      logInfo(`Using config: ${path.relative(root, configPath)}`);
    }

    const agentConfig = loadAgentConfig(configPath, root);

    try {
      const runtime = await createRuntime({
        projectRoot: root,
        verbosity: opts.verbose ? "verbose" : undefined,
      });

      const { success, result, duration_ms } = await runtime.runAgent(
        agentConfig,
        "security-audit",
        {
          files: paths,
          project_root: root,
        }
      );

      console.log("");
      if (success) {
        logSuccess(`Security audit completed in ${duration_ms}ms`);
        const findings = result?.findings || [];
        console.log(`Found ${findings.length} security issues:\n`);

        // Group by OWASP category
        const byCategory = {};
        findings.forEach((f) => {
          const cat = f.owasp_category || "OTHER";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(f);
        });

        Object.entries(byCategory)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([category, items]) => {
            console.log(`${colors.bright}${category}${colors.reset} (${items.length})`);
            items.slice(0, 3).forEach((f) => {
              const sevColor =
                f.severity === "CRITICAL"
                  ? colors.red
                  : f.severity === "HIGH"
                  ? colors.yellow
                  : colors.gray;
              console.log(
                `  ${sevColor}[${f.severity}]${colors.reset} ${f.file}:${f.line_start} — ${f.message}`
              );
            });
            if (items.length > 3) {
              console.log(`  ${colors.gray}... and ${items.length - 3} more${colors.reset}`);
            }
          });
      } else {
        logError("Security audit failed");
      }

      if (opts.export) {
        const inferred = (opts.export.split(".").pop() || "json").toLowerCase();
        const format = opts.format ?? inferred;
        const exportedPath = exportReport({
          result: { success, result, duration_ms, skill: "security-audit", project: root },
          outputPath: opts.export,
          format,
        });
        logSuccess(`Report exported: ${exportedPath}`);
      }

      await runtime.shutdown();
      process.exit(success ? 0 : 1);
    } catch (err) {
      logCliError("AUDIT_COMMAND_FAILED", err, { command: "audit", paths });
      process.exit(1);
    }
  });

// ─── agents check ────────────────────────────────────────────────────────────
program
  .command("check")
  .description("Run compliance check for an agent config (no skill execution)")
  .option("-c, --config <path>", "Path to agent YAML/JSON config (auto-detected if omitted)")
  .option("-p, --project <dir>",  "Project root (default: cwd)")
  .option("-v, --verbose", "Show detailed error information")
  .action(async (opts) => {
    const root        = projectRoot(opts);

    // Auto-detect config if not provided
    let configPath = opts.config;
    if (!configPath) {
      configPath = findAgentConfig(root);
      if (!configPath) {
        logError("No agent config found. Run 'npm run setup' or specify with --config");
        process.exit(1);
      }
      logInfo(`Using config: ${path.relative(root, configPath)}`);
    }

    const agentConfig = loadAgentConfig(configPath, root);

    try {
      const runtime = await createRuntime({ projectRoot: root });
      const runner  = runtime.runner;
      await runner._runComplianceCheck(agentConfig);
      logSuccess("Compliance check passed.");
      await runtime.shutdown();
      process.exit(0);
    } catch (err) {
      if (opts.verbose) {
        console.error("\n[DETAILED ERROR]", err);
        console.error(err.stack);
      }
      logCliError("COMPLIANCE_CHECK_FAILED", err, { command: "check" });
      process.exit(1);
    }
  });

// ─── agents list ─────────────────────────────────────────────────────────────
program
  .command("list")
  .description("List all registered skills and hooks in the project")
  .option("-p, --project <dir>", "Project root (default: cwd)")
  .action(async (opts) => {
    const root = projectRoot(opts);

    try {
      const runtime = await createRuntime({ projectRoot: root });

      console.log("\n\x1b[1m─── Registered Skills ─────────────────────────────────\x1b[0m");
      const skills = runtime.listSkills();
      if (skills.length === 0) {
        console.log("  (none)");
      } else {
        for (const s of skills) {
          const lvl = s.authorization_required_level ?? 1;
          const ro  = s.read_only ? " [read-only]" : "";
          console.log(`  \x1b[36m${s.id}\x1b[0m  v${s.version}  auth≥${lvl}${ro}`);
          console.log(`    ${s.path}`);
        }
      }

      console.log("\n\x1b[1m─── Registered Hooks ───────────────────────────────────\x1b[0m");
      const hooks = runtime.listHooks();
      if (hooks.length === 0) {
        console.log("  (none)");
      } else {
        for (const h of hooks) console.log(`  \x1b[35m${h}\x1b[0m`);
      }

      console.log();
      await runtime.shutdown();
      process.exit(0);
    } catch (err) {
      logCliError("LIST_COMMAND_FAILED", err, { command: "list" });
      process.exit(1);
    }
  });

// ─── agents events ───────────────────────────────────────────────────────────
program
  .command("events")
  .description("Show recent domain event history")
  .option("-p, --project <dir>", "Project root (default: cwd)")
  .option("-n, --limit <number>", "Number of events to show", "20")
  .action(async (opts) => {
    const root = projectRoot(opts);
    try {
      const runtime = await createRuntime({ projectRoot: root });
      const history = runtime.eventHistory(parseInt(opts.limit, 10));

      console.log(`\n\x1b[1m─── Event History (last ${opts.limit}) ─────────────────────\x1b[0m`);
      if (history.length === 0) {
        console.log("  (no events yet)");
      } else {
        for (const e of history) {
          console.log(`  \x1b[33m${e.event_type}\x1b[0m  from=${e.from}  ts=${e.timestamp}`);
        }
      }
      console.log();
      await runtime.shutdown();
      process.exit(0);
    } catch (err) {
      logCliError("EVENTS_COMMAND_FAILED", err, { command: "events" });
      process.exit(1);
    }
  });

// ─── agents diff ─────────────────────────────────────────────────────────────
program
  .command("diff")
  .description("Compare the two most recent runs of a skill (no execution)")
  .requiredOption("-s, --skill <id>",    "Skill ID to diff")
  .option("-p, --project <dir>",         "Project root (default: cwd)")
  .option("-n, --baseline <ref>",        "Baseline ref: index or git SHA prefix (default: 1)")
  .option("--json",                      "Output raw diff as JSON")
  .action(async (opts) => {
    const root  = projectRoot(opts);
    const store = new RunHistoryStore(root);

    const baselineRef = opts.baseline !== undefined
      ? (isNaN(Number(opts.baseline)) ? opts.baseline : Number(opts.baseline))
      : 1;

    const { current, baseline } = await store.loadPair(opts.skill, { baselineRef });

    if (!current) {
      logCliError("DIFF_NO_RUNS", new Error(`No runs found for skill '${opts.skill}'`), {
        command: "diff",
        skill: opts.skill,
      });
      process.exit(1);
    }
    if (!baseline) {
      logCliError("DIFF_BASELINE_MISSING", new Error("Only one run found; baseline unavailable"), {
        command: "diff",
        skill: opts.skill,
      });
      process.exit(1);
    }

    const currentFindings  = current?.result?.findings  ?? [];
    const baselineFindings = baseline?.result?.findings ?? [];
    const diff = compare(baselineFindings, currentFindings);

    if (opts.json) {
      console.log(JSON.stringify({ current, baseline, diff }, null, 2));
    } else {
      console.log(formatTerminal(diff, {
        current:  { git_sha: current?.git_sha,  timestamp: current?.timestamp },
        baseline: { git_sha: baseline?.git_sha, timestamp: baseline?.timestamp },
      }));
    }

    process.exit(diff.summary.regressed ? 1 : 0);
  });

// ─── agents learn ────────────────────────────────────────────────────────────────
program
  .command("learn")
  .description("Learn project structure and build memory for context")
  .option("-p, --project <dir>",   "Project root (default: cwd)")
  .option("-r, --refresh",         "Incremental update instead of full scan")
  .option("-f, --force",           "Force full rescan")
  .option("-v, --verbose",         "Verbose output")
  .option("--languages <list>",    "Comma-separated languages to scan (default: all detected)")
  .action(async (opts) => {
    try {
      const projectRoot = opts.project || process.cwd();
      const languages = opts.languages ? opts.languages.split(",") : null;

      const result = await handleLearn({
        projectRoot,
        refresh: opts.refresh || false,
        force: opts.force || false,
        verbose: opts.verbose || false,
        languages,
      });

      process.exit(result.success ? 0 : 1);
    } catch (err) {
      logCliError("LEARN_COMMAND_FAILED", err, { command: "learn" });
      process.exit(1);
    }
  });

// ─── agents memory:stats ─────────────────────────────────────────────────────────
program
  .command("memory:stats")
  .description("Show memory statistics")
  .option("-p, --project <dir>",   "Project root (default: cwd)")
  .option("--language <lang>",     "Show stats for specific language")
  .action(async (opts) => {
    try {
      const result = await handleMemoryStats({
        projectRoot: opts.project || process.cwd(),
        language: opts.language,
      });

      process.exit(result.success ? 0 : 1);
    } catch (err) {
      logCliError("MEMORY_STATS_FAILED", err, { command: "memory:stats" });
      process.exit(1);
    }
  });

// ─── agents memory:search ────────────────────────────────────────────────────────
program
  .command("memory:search <query>")
  .description("Search project memory")
  .option("-p, --project <dir>",   "Project root (default: cwd)")
  .option("--language <lang>",     "Filter by language")
  .option("--limit <n>",           "Max results (default: 10)")
  .action(async (query, opts) => {
    try {
      const result = await handleMemorySearch(query, {
        projectRoot: opts.project || process.cwd(),
        language: opts.language,
        limit: parseInt(opts.limit) || 10,
      });

      process.exit(result.success ? 0 : 1);
    } catch (err) {
      logCliError("MEMORY_SEARCH_FAILED", err, { command: "memory:search" });
      process.exit(1);
    }
  });

// ─── agents memory:languages ─────────────────────────────────────────────────────
program
  .command("memory:languages")
  .description("List detected languages in project")
  .option("-p, --project <dir>",   "Project root (default: cwd)")
  .action(async (opts) => {
    try {
      const result = await handleMemoryLanguages({
        projectRoot: opts.project || process.cwd(),
      });

      process.exit(result.success ? 0 : 1);
    } catch (err) {
      logCliError("MEMORY_LANGUAGES_FAILED", err, { command: "memory:languages" });
      process.exit(1);
    }
  });

// ─── agents memory:export ────────────────────────────────────────────────────────
program
  .command("memory:export [format]")
  .description("Export memory to various formats (json, text)")
  .option("-p, --project <dir>",   "Project root (default: cwd)")
  .option("-o, --output <file>",   "Output file (optional)")
  .action(async (format, opts) => {
    try {
      const result = await handleMemoryExport(format || "json", {
        projectRoot: opts.project || process.cwd(),
        output: opts.output,
      });

      process.exit(result.success ? 0 : 1);
    } catch (err) {
      logCliError("MEMORY_EXPORT_FAILED", err, { command: "memory:export" });
      process.exit(1);
    }
  });

program.parse(process.argv);
