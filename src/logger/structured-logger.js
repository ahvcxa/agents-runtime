"use strict";
/**
 * src/logger/structured-logger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured JSONL logger. Writes to .agents/logs/agent-{date}.jsonl
 * Respects verbosity_mode and redaction rules from settings.json.
 */

const fs   = require("fs");
const path = require("path");

// ─── Constants ─────────────────────────────────────────────────────────────────
/**
 * ANSI color codes for terminal output.
 * Used for colorized console logging.
 */
const ANSI_COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

/** Format today's date as YYYY-MM-DD */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Redact sensitive fields from a log payload */
function redact(obj, patterns, replacement = "[REDACTED]", _depth = 0) {
  const MAX_DEPTH = 10;
  if (_depth >= MAX_DEPTH) return "[MAX_DEPTH_EXCEEDED]";
  if (!obj || typeof obj !== "object") return obj;
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    const lower = key.toLowerCase();
    if (patterns.some((p) => lower.includes(p))) {
      result[key] = replacement;
    } else if (typeof result[key] === "object" && result[key] !== null) {
      result[key] = redact(result[key], patterns, replacement, _depth + 1);
    }
  }
  return result;
}

class StructuredLogger {
  /**
   * @param {object} settings - Parsed settings.json
   * @param {string} projectRoot
   */
  constructor(settings, projectRoot) {
    this.settings    = settings?.logging ?? {};
    this.projectRoot = projectRoot;

    const mode        = this.settings.verbosity_mode ?? "standard";
    const modes       = this.settings.modes ?? {};
    this.allowedTypes = new Set(modes[mode]?.allowed_event_types ?? [
      "FATAL", "SECURITY_VIOLATION", "ERROR", "WARN",
      "SKILL_START", "SKILL_END", "HOOK_FIRE", "AUDIT",
    ]);

    this.redactionPatterns  = settings?.logging?.redaction?.enabled
      ? (settings.logging.redaction.patterns ?? [])
      : [];
    this.redactionReplacement = settings?.logging?.redaction?.replacement ?? "[REDACTED]";

    // Resolve log file path
    const rawPath    = this.settings.output_path ?? ".agents/logs/agent-{date}.jsonl";
    const resolved   = rawPath.replace("{date}", today());
    this.logFilePath = path.resolve(projectRoot, resolved);

    // Ensure log directory exists
    fs.mkdirSync(path.dirname(this.logFilePath), { recursive: true });
  }

  /**
   * Write a structured log entry.
   * @param {object} entry
   * @param {string} entry.event_type
   * @param {string} [entry.agent_id]
   */
  log(entry) {
    if (!this.allowedTypes.has(entry.event_type)) return;

    const sanitized = redact(
      { timestamp: new Date().toISOString(), ...entry },
      this.redactionPatterns,
      this.redactionReplacement
    );

    const line = JSON.stringify(sanitized) + "\n";

    // Console output (colorized)
     const prefix = `[${sanitized.event_type}]`;
     if (entry.event_type === "SECURITY_VIOLATION" || entry.event_type === "FATAL") {
       process.stderr.write(`${ANSI_COLORS.red}${prefix}${ANSI_COLORS.reset} ${JSON.stringify(entry)}\n`);
     } else if (entry.event_type === "ERROR" || entry.event_type === "WARN") {
       process.stderr.write(`${ANSI_COLORS.yellow}${prefix}${ANSI_COLORS.reset} ${JSON.stringify(entry)}\n`);
     } else {
       process.stdout.write(`${ANSI_COLORS.cyan}${prefix}${ANSI_COLORS.reset} ${JSON.stringify(entry)}\n`);
     }

    // File output
    try {
      fs.appendFileSync(this.logFilePath, line, "utf8");
    } catch (err) {
      process.stderr.write(`[logger] Failed to write log: ${err.message}\n`);
    }
  }

  /** Convenience wrappers */
  info(payload)  { this.log({ event_type: "INFO",   ...payload }); }
  warn(payload)  { this.log({ event_type: "WARN",   ...payload }); }
  error(payload) { this.log({ event_type: "ERROR",  ...payload }); }
  audit(payload) { this.log({ event_type: "AUDIT",  ...payload }); }
}

module.exports = { StructuredLogger };
