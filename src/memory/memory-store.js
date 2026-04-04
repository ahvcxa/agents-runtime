"use strict";
/**
 * src/memory/memory-store.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Memory store client with adapter-based persistence
 * Delegates to pluggable drivers (in-process, file, redis, postgres, vector)
 */

const { createPersistenceAdapter } = require("./drivers");

class MemoryStoreClient {
  // Constants
  static MS_PER_SECOND = 1000;
  static DEFAULT_READ_MIN_LEVEL = 1;
  static DEFAULT_WRITE_MIN_LEVEL = 1;

  constructor(settings, authLevel, agentId, adapter) {
    this.settings = settings?.memory ?? {};
    this.authLevel = authLevel;
    this.agentId = agentId;
    this.adapter = adapter;
    this.tagIndex = new Map();
    this.ttlMap = new Map();
  }

  _resolveRule(key) {
    const rules = this.settings?.access_control?.rules ?? [];
    for (const rule of rules) {
      const pattern = rule.namespace_pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, ".*");
      if (new RegExp(`^${pattern}$`).test(key)) return rule;
    }
    return null;
  }

  _assertAuthLevel(key, operation) {
    const rule = this._resolveRule(key);
    const minLevel = operation === "write" 
      ? rule?.write_min_level ?? 1
      : rule?.read_min_level ?? 1;
    if (this.authLevel < minLevel) {
      throw new Error(`[memory] Agent '${this.agentId}' lacks ${operation} permission for '${key}'`);
    }
  }

  _assertRead(key) {
    this._assertAuthLevel(key, "read");
  }

  _assertWrite(key) {
    this._assertAuthLevel(key, "write");
  }

  _isExpired(key) {
    const expiry = this.ttlMap.get(key);
    return expiry !== undefined && Date.now() > expiry;
  }

  _indexTags(key, tags) {
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag).add(key);
    }
  }

  _unindexTags(key, tags = []) {
    for (const tag of tags) {
      this.tagIndex.get(tag)?.delete(key);
      if ((this.tagIndex.get(tag)?.size ?? 0) === 0) this.tagIndex.delete(tag);
    }
  }

  set(key, value, options = {}) {
    this._assertWrite(key);
    const ttl = options.ttl_seconds ?? this.settings.ttl_default_seconds ?? 3600;
    const tags = options.tags ?? [];
     const entry = {
       value,
       _tags: tags,
       _written_at: new Date().toISOString(),
       _agent: this.agentId,
     };
     const existing = this.adapter.get(key);
     if (existing?._tags) this._unindexTags(key, existing._tags);
     this._indexTags(key, tags);
     this.ttlMap.set(key, Date.now() + ttl * MemoryStoreClient.MS_PER_SECOND);
     this.adapter.upsert(key, entry);
   }

  get(key) {
    this._assertRead(key);
    if (this._isExpired(key)) {
      this.delete(key);
      return undefined;
    }
    const entry = this.adapter.get(key);
    return entry?.value;
  }

  delete(key) {
    this._assertWrite(key);
    const entry = this.adapter.get(key);
    if (entry?._tags) this._unindexTags(key, entry._tags);
    this.ttlMap.delete(key);
    this.adapter.delete(key);
  }

  queryByTags(tags, options = {}) {
    const limit = options.limit ?? 500;
    if (!tags.length) return [];
    const candidates = new Set(this.tagIndex.get(tags[0]) ?? []);
    for (let i = 1; i < tags.length; i++) {
      const set = this.tagIndex.get(tags[i]) ?? new Set();
      for (const key of candidates) if (!set.has(key)) candidates.delete(key);
    }
    const out = [];
    for (const key of candidates) {
      if (out.length >= limit) break;
      if (this._isExpired(key)) continue;
      if (this.adapter.store instanceof Map) {
        const entry = this.adapter.store.get(key);
        if (entry) out.push({ key, value: entry.value, tags: entry._tags });
      }
    }
    return out;
  }

  stats() {
    const totalKeys = this.adapter.store instanceof Map ? this.adapter.store.size : 0;
    return {
      total_keys: totalKeys,
      total_tags: this.tagIndex.size,
      backend: this.settings.backend ?? "in-process",
    };
  }

  shutdown() {
    this.adapter.close();
  }

  appendSemanticEvent(event) {
    const semanticCfg = this.settings?.semantic_events ?? {};
    if (!semanticCfg.enabled) return;

    const traceId = event?.trace_id ?? "no-trace";
    const messageId = event?.message_id ?? `event-${Date.now()}`;
    const key = `event:${traceId}:${messageId}`;
    this.adapter.upsert(key, {
      value: {
        event_type: event?.event_type,
        trace_id: traceId,
        parent_message_id: event?.parent_message_id ?? null,
        payload: event?.payload ?? {},
        timestamp: event?.timestamp ?? new Date().toISOString(),
      },
      _tags: [
        `event_type:${event?.event_type ?? "unknown"}`,
        `trace_id:${traceId}`,
      ],
      _written_at: new Date().toISOString(),
      _agent: this.agentId,
    });
  }

  semanticSearch(query, options = {}) {
    // Input validation — reject non-string or empty queries early
    if (typeof query !== "string" || query.trim().length === 0) {
      throw new Error("[memory] semanticSearch query must be a non-empty string");
    }
    const semanticCfg = this.settings?.semantic_events ?? {};
    const topK = options.top_k ?? semanticCfg.top_k ?? 5;
    const queryText = query.toLowerCase();

    if (typeof this.adapter.similarityQuery === "function") {
      return this.adapter.similarityQuery(queryText, topK);
    }

    if (!(this.adapter.store instanceof Map)) return [];
    const rows = [];
    for (const [key, entry] of this.adapter.store.entries()) {
      if (!key.startsWith("event:")) continue;
      const serialized = JSON.stringify(entry?.value ?? {}).toLowerCase();
      if (serialized.includes(queryText)) {
        rows.push(entry.value);
      }
      if (rows.length >= topK) break;
    }
    return rows;
  }
}

function createMemoryStore(settings, authLevel, agentId, projectRoot) {
  const adapter = createPersistenceAdapter(settings, agentId, projectRoot);
  return new MemoryStoreClient(settings, authLevel, agentId, adapter);
}

module.exports = {
  createMemoryStore,
  createPersistenceAdapter,
  MemoryStoreClient,
};
