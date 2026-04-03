"use strict";
/**
 * src/events/event-bus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * EventEmitter-based domain event bus.
 * Connects postSkillHook's emit() to subscribed handlers.
 */

const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");

// Simple UUID generator that works without external deps
function generateId() {
  try {
    return randomUUID();
  } catch {
    // Fallback if crypto module unavailable (should not happen in modern Node.js 15+)
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2);
    return `${timestamp}-${random}`;
  }
}

class EventBus extends EventEmitter {
  constructor(logger, options = {}) {
    super();
    this.logger   = logger;
    this._history = []; // Keep last 1000 events
    this._semanticMemory = options.semanticMemory ?? null;
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
      parent_message_id: domainEvent?.parent_message_id ?? null,
      trace_id:         domainEvent?.trace_id ?? generateId(),
      schema_version:   "1.0",
      timestamp:        new Date().toISOString(),
      ttl_seconds:      300,
      to:               "broadcast",
      ...domainEvent,
    };

    this._history.push(envelope);
    if (this._history.length > 1000) this._history.shift();

    this.logger?.log({ event_type: "DOMAIN_EVENT", ...envelope });
    this._semanticMemory?.appendSemanticEvent?.(envelope);

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

  sendMessage(message) {
    return this.dispatch({
      event_type: "AgentMessage",
      ...message,
    });
  }

  delegateTask(fromAgentId, toAgentId, task) {
    return this.dispatch({
      event_type: "TaskDelegated",
      from: fromAgentId,
      to: toAgentId,
      context_boundary: "Orchestration",
      payload: {
        task_id: generateId(),
        task,
        status: "delegated",
      },
    });
  }

  /** Get recent event history */
  history(limit = 50) {
    return this._history.slice(-limit);
  }

  semanticHistory(query, topK = 5) {
    return this._semanticMemory?.semanticSearch?.(query, { top_k: topK }) ?? [];
  }
}

module.exports = { EventBus };
