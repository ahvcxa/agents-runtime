"use strict";
/**
 * src/memory/memory-store.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Adapter wrapping CrossAgentMemoryClient with optional JSON persistence.
 * Bridges the existing helper with the runtime engine.
 */

const fs   = require("fs");
const path = require("path");

// Import the existing memory-client helper from the template
// At runtime, the engine resolves the path from the projectRoot.
function createMemoryStore(settings, authLevel, agentId, projectRoot) {
  // Always use the built-in implementation (fixed pattern matching).
  // The template's memory-client.js is a reference implementation;
  // the runtime uses its own corrected version.
  const CrossAgentMemoryClient = buildFallbackMemoryClient();


  const client = new CrossAgentMemoryClient(settings, authLevel, agentId);

  // Restore persisted state if enabled
  const persist = settings?.memory?.persistence;
  if (persist?.enabled) {
    const storePath = path.resolve(projectRoot, persist.storage_path ?? ".agents/.memory-store");
    const storeFile = path.join(storePath, `${agentId}.json`);
    if (fs.existsSync(storeFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(storeFile, "utf8"));
        for (const [key, entry] of Object.entries(data)) {
          if (Date.now() < entry._expiry) {
            client.store.set(key, entry);
          }
        }
      } catch { /* ignore corrupt files */ }
    }

    // Auto-flush on interval
    const flushInterval = (persist.flush_interval_seconds ?? 60) * 1000;
    client._persistTimer = setInterval(() => flushMemory(client, storePath, agentId), flushInterval);
    client._persistTimer.unref?.(); // Don't block process exit
    client._storePath = storePath;
    client._agentId   = agentId;
  }

  return client;
}

function flushMemory(client, storePath, agentId) {
  try {
    fs.mkdirSync(storePath, { recursive: true });
    const data = {};
    for (const [key, entry] of client.store.entries()) {
      const expiry = client.ttlMap.get(key);
      if (!expiry || Date.now() < expiry) {
        data[key] = { ...entry, _expiry: expiry };
      }
    }
    const storeFile = path.join(storePath, `${agentId}.json`);
    fs.writeFileSync(storeFile, JSON.stringify(data, null, 2), "utf8");
  } catch { /* ignore */ }
}

/** Inline fallback if the template's memory-client is not present */
function buildFallbackMemoryClient() {
  return class FallbackMemoryClient {
    constructor(settings, authLevel, agentId) {
      this.settings  = settings?.memory ?? {};
      this.authLevel = authLevel;
      this.agentId   = agentId;
      this.store     = new Map();
      this.tagIndex  = new Map();
      this.ttlMap    = new Map();
    }

    _resolveRule(key) {
      const rules = this.settings?.access_control?.rules ?? [];
      for (const rule of rules) {
        // Use `.*` for `*` so multi-segment keys match (e.g. skill:id:cache:invocation:agent:ts → skill:*:cache:*)
        const pattern = rule.namespace_pattern
          .replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, ".*");
        if (new RegExp(`^${pattern}$`).test(key)) return rule;
      }
      return null;
    }

    _assertRead(key) {
      const rule = this._resolveRule(key);
      const minLevel = rule?.read_min_level ?? 1;
      if (this.authLevel < minLevel)
        throw new Error(`[memory] Agent '${this.agentId}' lacks read permission for '${key}'`);
    }

    _assertWrite(key) {
      const rule = this._resolveRule(key);
      const minLevel = rule?.write_min_level ?? 1;
      if (this.authLevel < minLevel)
        throw new Error(`[memory] Agent '${this.agentId}' lacks write permission for '${key}'`);
    }

    _isExpired(key) {
      const expiry = this.ttlMap.get(key);
      return expiry !== undefined && Date.now() > expiry;
    }

    _deleteInternal(key) {
      const entry = this.store.get(key);
      if (entry?._tags) for (const tag of entry._tags) this.tagIndex.get(tag)?.delete(key);
      this.store.delete(key);
      this.ttlMap.delete(key);
    }

    set(key, value, options = {}) {
      this._assertWrite(key);
      const ttl  = options.ttl_seconds ?? this.settings.ttl_default_seconds ?? 3600;
      const tags = options.tags ?? [];
      const entry = { value, _tags: tags, _written_at: new Date().toISOString(), _agent: this.agentId };
      this.store.set(key, entry);
      this.ttlMap.set(key, Date.now() + ttl * 1000);
      for (const tag of tags) {
        if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
        this.tagIndex.get(tag).add(key);
      }
    }

    get(key) {
      this._assertRead(key);
      if (this._isExpired(key)) { this._deleteInternal(key); return undefined; }
      return this.store.get(key)?.value;
    }

    delete(key) { this._assertWrite(key); this._deleteInternal(key); }

    queryByTags(tags, options = {}) {
      const limit = options.limit ?? 500;
      if (!tags.length) return [];
      const candidates = new Set(this.tagIndex.get(tags[0]) ?? []);
      for (let i = 1; i < tags.length; i++) {
        const set = this.tagIndex.get(tags[i]) ?? new Set();
        for (const k of candidates) if (!set.has(k)) candidates.delete(k);
      }
      const results = [];
      for (const key of candidates) {
        if (results.length >= limit) break;
        if (this._isExpired(key)) { this._deleteInternal(key); continue; }
        const entry = this.store.get(key);
        if (entry) results.push({ key, value: entry.value, tags: entry._tags });
      }
      return results;
    }

    stats() {
      return { total_keys: this.store.size, total_tags: this.tagIndex.size };
    }
  };
}

module.exports = { createMemoryStore, flushMemory };
