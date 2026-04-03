"use strict";
/**
 * src/events/event-bus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * EventEmitter-based domain event bus.
 * Connects postSkillHook's emit() to subscribed handlers.
 */

const { EventEmitter } = require("events");
const { v4: uuidv4 }   = (() => {
  // Use crypto.randomUUID if available (Node 14.17+), else simple fallback
  try { return require("crypto"); } catch { return { randomUUID: () => Math.random().toString(36).slice(2) }; }
})();

// Simple UUID generator that works without external deps
function generateId() {
  try {
    return require("crypto").randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

class EventBus extends EventEmitter {
  constructor(logger) {
    super();
    this.logger   = logger;
    this._history = []; // Keep last 1000 events
  }

  /**
   * Emit a domain event onto the bus.
   * @param {object} domainEvent
   * @param {string} domainEvent.event_type
   * @param {string} domainEvent.from
   * @param {string} [domainEvent.to]
   * @param {string} [domainEvent.context_boundary]
   * @param {object} [domainEvent.payload]
   */
  dispatch(domainEvent) {
    const envelope = {
      message_id:       generateId(),
      schema_version:   "1.0",
      timestamp:        new Date().toISOString(),
      ttl_seconds:      300,
      to:               "broadcast",
      ...domainEvent,
    };

    this._history.push(envelope);
    if (this._history.length > 1000) this._history.shift();

    this.logger?.log({ event_type: "DOMAIN_EVENT", ...envelope });

    // Emit to typed listeners and wildcard listeners
    this.emit(envelope.event_type, envelope);
    this.emit("*", envelope);

    return envelope;
  }

  /**
   * Subscribe to a domain event type.
   * @param {string} eventType - e.g. "AnalysisCompleted" or "*" for all
   * @param {Function} handler
   */
  subscribe(eventType, handler) {
    this.on(eventType, handler);
  }

  /** Get recent event history */
  history(limit = 50) {
    return this._history.slice(-limit);
  }
}

module.exports = { EventBus };
