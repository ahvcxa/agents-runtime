"use strict";
/**
 * src/memory/semantic-memory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SemanticMemoryClient — extracted from MemoryStoreClient (SOLID / SRP).
 * Handles semantic event indexing and text-based similarity search.
 * Injected as a dependency into MemoryStoreClient.
 */

class SemanticMemoryClient {
  /**
   * @param {object} semanticCfg  - settings.memory.semantic_events
   * @param {string} agentId
   */
  constructor(semanticCfg, agentId) {
    this._cfg     = semanticCfg ?? {};
    this._agentId = agentId;
    this._store   = new Map(); // key → entry (for in-process semantic search)
  }

  /** Whether semantic event tracking is active */
  get enabled() {
    return Boolean(this._cfg.enabled);
  }

  /**
   * Index a domain event into semantic memory.
   * @param {object} event
   */
  appendEvent(event) {
    if (!this.enabled) return;

    const traceId   = event?.trace_id   ?? "no-trace";
    const messageId = event?.message_id ?? `event-${Date.now()}`;
    const key = `event:${traceId}:${messageId}`;

    this._store.set(key, {
      value: {
        event_type:        event?.event_type,
        trace_id:          traceId,
        parent_message_id: event?.parent_message_id ?? null,
        payload:           event?.payload ?? {},
        timestamp:         event?.timestamp ?? new Date().toISOString(),
      },
      _tags: [
        `event_type:${event?.event_type ?? "unknown"}`,
        `trace_id:${traceId}`,
      ],
      _written_at: new Date().toISOString(),
      _agent:      this._agentId,
    });
  }

  /**
   * Text-based semantic search over indexed events.
   * Falls back to substring matching (no embedding required for in-process).
   * @param {string} query
   * @param {object} [options]
   * @param {number} [options.top_k]
   * @returns {object[]}
   */
  search(query, options = {}) {
    const topK      = options.top_k ?? this._cfg.top_k ?? 5;
    const queryText = String(query ?? "").toLowerCase().trim();
    if (!queryText) return [];

    const rows = [];
    for (const [key, entry] of this._store.entries()) {
      if (!key.startsWith("event:")) continue;
      const serialized = JSON.stringify(entry?.value ?? {}).toLowerCase();
      if (serialized.includes(queryText)) {
        rows.push(entry.value);
      }
      if (rows.length >= topK) break;
    }
    return rows;
  }

  /** Tear down — nothing async needed for in-process */
  shutdown() {
    this._store.clear();
  }
}

module.exports = { SemanticMemoryClient };
