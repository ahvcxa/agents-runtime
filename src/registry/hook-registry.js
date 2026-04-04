"use strict";
/**
 * src/registry/hook-registry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads hooks from manifest.json and dispatches them by lifecycle event.
 */

const path = require("path");
const fs   = require("fs");

// ─── Constants ────────────────────────────────────────────────────────────────
/**
 * Lifecycle events a hook can fire on (O(1) lookup).
 * Prevents typo-based misregistrations at boot time.
 */
const ALLOWED_HOOK_EVENTS = new Set([
  "before_filesystem_read",
  "before_network_access",
  "before_skill_execution",
  "after_skill_execution",
  "on_shutdown",
]);

/**
 * Canonical export function names, derived from hook id conventions.
 * Used as a fast lookup before falling back to dynamic inference.
 * Example: "pre-read" → "preReadHook"
 */
const EXPORT_NAMES_MAP = {
  "pre-read":        "preReadHook",
  "pre-skill":       "preSkillHook",
  "post-skill":      "postSkillHook",
  "pre-network":     "preNetworkHook",
  "on-shutdown":     "onShutdownHook",
};

class HookRegistry {
  /**
   * @param {object[]} hookDefs - manifest.json#hooks (with absolutePath resolved)
   * @param {object} logger - StructuredLogger instance
   */
  constructor(hookDefs, logger) {
    this.logger   = logger;
    this._hooks   = new Map(); // hookId → { def, module }
    this._byEvent = new Map(); // fires → [hookId, ...]

    for (const def of hookDefs ?? []) {
      this._register(def);
    }
  }

  _register(def) {
    if (!fs.existsSync(def.absolutePath)) {
      if (def.required) {
        throw new Error(`[hook-registry] Required hook '${def.id}' not found at: ${def.absolutePath}`);
      }
      this.logger?.warn({ event_type: "WARN", message: `Optional hook '${def.id}' not found, skipping.` });
      return;
    }

    let mod;
    try {
      mod = require(def.absolutePath);
    } catch (err) {
      throw new Error(`[hook-registry] Failed to load hook '${def.id}': ${err.message}`);
    }

    this._hooks.set(def.id, { def, mod });

    const event = def.fires;
    if (!this._byEvent.has(event)) this._byEvent.set(event, []);
    this._byEvent.get(event).push(def.id);

    this.logger?.log({
      event_type: "HOOK_FIRE",
      message:    `Registered hook '${def.id}' → fires on '${event}'`,
    });
  }

  /**
   * Dispatch all hooks registered for a lifecycle event.
   * @param {string} lifecycleEvent - e.g. "before_filesystem_read"
   * @param {object} context
   * @returns {Promise<object[]>} Array of results from each hook
   */
  async dispatch(lifecycleEvent, context) {
    const hookIds = this._byEvent.get(lifecycleEvent) ?? [];
    const results = [];

    for (const id of hookIds) {
      const { def, mod } = this._hooks.get(id);
      const exportName = def.export ?? this._inferExportName(id);
      const fn = mod[exportName] ?? mod.default ?? mod;

      if (typeof fn !== "function") {
        this.logger?.error({
          event_type: "ERROR",
          message:    `Hook '${id}' export '${exportName}' is not a function`,
        });
        if (def.required) throw new Error(`Required hook '${id}' export is not callable`);
        continue;
      }

      this.logger?.log({ event_type: "HOOK_FIRE", hook_id: id, lifecycle: lifecycleEvent });

      try {
        const result = await Promise.resolve(fn(context));
        results.push({ hookId: id, result });
      } catch (err) {
        this.logger?.log({
          event_type: err.event_type ?? "ERROR",
          hook_id:    id,
          message:    err.message,
          name:       err.name,
        });
        if (def.required) throw err; // Re-throw — required hook failures are fatal
        results.push({ hookId: id, error: err.message });
      }
    }

    return results;
  }

  /** Infer the export function name from hook id conventions */
  _inferExportName(hookId) {
    // Fast O(1) lookup for known hook ids
    if (EXPORT_NAMES_MAP[hookId]) return EXPORT_NAMES_MAP[hookId];
    // Dynamic fallback: "pre-read" → "preReadHook"
    const parts = hookId.split("-");
    return parts.map((p, i) => i === 0 ? p : p[0].toUpperCase() + p.slice(1)).join("") + "Hook";
  }

  /** Returns list of registered hook IDs */
  list() {
    return [...this._hooks.keys()];
  }
}

module.exports = { HookRegistry };
