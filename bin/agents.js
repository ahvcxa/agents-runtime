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

const { createRuntime } = require("../src/engine");

const program = new Command();

program
  .name("agents")
  .description("Vendor-neutral AI agent runtime CLI")
  .version("1.0.0");

// ─── Shared option ───────────────────────────────────────────────────────────
function projectRoot(opts) {
  return path.resolve(opts.project ?? process.cwd());
}

function loadAgentConfig(configPath) {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    console.error(`\x1b[31mError:\x1b[0m Agent config not found: ${abs}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(abs, "utf8");
  try {
    return yaml.load(raw);
  } catch {
    try { return JSON.parse(raw); } catch {
      console.error(`\x1b[31mError:\x1b[0m Cannot parse agent config (expected YAML or JSON): ${abs}`);
      process.exit(1);
    }
  }
}

// ─── agents run ──────────────────────────────────────────────────────────────
program
  .command("run")
  .description("Run a skill for an agent through the full lifecycle pipeline")
  .requiredOption("-c, --config <path>", "Path to agent YAML/JSON config")
  .requiredOption("-s, --skill <id>",    "Skill ID to execute")
  .option("-i, --input <json>",   "JSON input payload", "{}")
  .option("-p, --project <dir>",  "Project root (default: cwd)")
  .option("-v, --verbose",        "Verbose logging")
  .action(async (opts) => {
    const root        = projectRoot(opts);
    const agentConfig = loadAgentConfig(opts.config);
    let   input;
    try   { input = JSON.parse(opts.input); }
    catch { console.error(`\x1b[31mError:\x1b[0m --input must be valid JSON`); process.exit(1); }

    try {
      const runtime = await createRuntime({
        projectRoot: root,
        verbosity:   opts.verbose ? "verbose" : undefined,
      });

      const { success, result, duration_ms } = await runtime.runAgent(agentConfig, opts.skill, input);

      console.log("\n\x1b[1m─── Skill Result ───────────────────────────────────────\x1b[0m");
      console.log(JSON.stringify(result, null, 2));
      console.log(`\n\x1b[1mStatus:\x1b[0m ${success ? "\x1b[32mSUCCESS\x1b[0m" : "\x1b[31mFAILED\x1b[0m"} (${duration_ms}ms)`);

      await runtime.shutdown();
      process.exit(success ? 0 : 1);
    } catch (err) {
      console.error(`\x1b[31m[ERROR]\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

// ─── agents check ────────────────────────────────────────────────────────────
program
  .command("check")
  .description("Run compliance check for an agent config (no skill execution)")
  .requiredOption("-c, --config <path>", "Path to agent YAML/JSON config")
  .option("-p, --project <dir>",  "Project root (default: cwd)")
  .action(async (opts) => {
    const root        = projectRoot(opts);
    const agentConfig = loadAgentConfig(opts.config);

    try {
      const runtime = await createRuntime({ projectRoot: root });
      const runner  = runtime.runner;
      await runner._runComplianceCheck(agentConfig);
      console.log("\x1b[32m✓ Compliance check passed.\x1b[0m");
      await runtime.shutdown();
      process.exit(0);
    } catch (err) {
      console.error(`\x1b[31m✗ Compliance check failed:\x1b[0m\n${err.message}`);
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
      console.error(`\x1b[31m[ERROR]\x1b[0m ${err.message}`);
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
      console.error(`\x1b[31m[ERROR]\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
