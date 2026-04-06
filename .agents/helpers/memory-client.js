/**
 * .agents/helpers/memory-client.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-Agent Memory Client
 * Vendor-neutral — compatible with any agent runtime.
 *
 * Provides a typed, access-controlled interface to the cross-agent memory
 * subsystem defined in .agents/settings.json.
 */

class CrossAgentMemoryClient {
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
      const pattern = rule.namespace_pattern
        .replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^:]*");
      if (new RegExp(`^${pattern}$`).test(key)) return rule;
    }
    return null;
  }

  _assertRead(key) {
    const rule = this._resolveRule(key);
    const minLevel = rule?.read_min_level ?? 1;
    if (this.authLevel < minLevel)
      throw new Error(`[memory] Agent '${this.agentId}' (level ${this.authLevel}) lacks read permission for '${key}' (requires level ${minLevel})`);
  }

  _assertWrite(key) {
    const rule = this._resolveRule(key);
    const minLevel = rule?.write_min_level ?? 2;
    if (this.authLevel < minLevel)
      throw new Error(`[memory] Agent '${this.agentId}' (level ${this.authLevel}) lacks write permission for '${key}' (requires level ${minLevel})`);
  }

  _isExpired(key) {
    const expiry = this.ttlMap.get(key);
    if (expiry === undefined) return false;
    return Date.now() > expiry;
  }

  _purgeExpired(key) {
    if (this._isExpired(key)) { this._deleteInternal(key); return true; }
    return false;
  }

  _deleteInternal(key) {
    const entry = this.store.get(key);
    if (entry?._tags) {
      for (const tag of entry._tags) this.tagIndex.get(tag)?.delete(key);
    }
    this.store.delete(key);
    this.ttlMap.delete(key);
  }

  /**
   * Write a value to memory.
   * @param {string} key
   * @param {any} value
   * @param {object} [options]
   * @param {number} [options.ttl_seconds]
   * @param {string[]} [options.tags]
   */
  set(key, value, options = {}) {
    this._assertWrite(key);
    const ttl  = options.ttl_seconds ?? this.settings.ttl_default_seconds ?? 3600;
    const tags = options.tags ?? [];
    const maxSizeKb  = this.settings.indexes?.key_value?.max_value_size_kb ?? 64;
    const serialized = JSON.stringify(value);
    if (serialized.length > maxSizeKb * 1024)
      throw new Error(`[memory] Value for key '${key}' exceeds max size (${maxSizeKb} KB)`);
    const entry = { value, _tags: tags, _written_at: new Date().toISOString(), _agent: this.agentId };
    this.store.set(key, entry);
    this.ttlMap.set(key, Date.now() + ttl * 1000);
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag).add(key);
    }
  }

  /** @param {string} key @returns {any|undefined} */
  get(key) {
    this._assertRead(key);
    if (this._purgeExpired(key)) return undefined;
    return this.store.get(key)?.value;
  }

  /** @param {string} key */
  delete(key) {
    this._assertWrite(key);
    this._deleteInternal(key);
  }

  /**
   * Query by tag intersection (AND semantics).
   * @param {string[]} tags
   * @param {object} [options]
   * @param {number} [options.limit]
   * @returns {{ key: string, value: any, tags: string[] }[]}
   */
  queryByTags(tags, options = {}) {
    if (!this.settings.indexes?.tag_based?.enabled)
      throw new Error("[memory] Tag-based index is disabled in settings.json");
    const limit = options.limit ?? this.settings.indexes?.tag_based?.max_result_set ?? 500;
    const sortedTags = [...tags].sort((a, b) => (this.tagIndex.get(a)?.size ?? 0) - (this.tagIndex.get(b)?.size ?? 0));
    if (sortedTags.length === 0) return [];
    const candidate_keys = new Set(this.tagIndex.get(sortedTags[0]) ?? []);
    for (let i = 1; i < sortedTags.length; i++) {
      const tagSet = this.tagIndex.get(sortedTags[i]) ?? new Set();
      for (const key of candidate_keys) { if (!tagSet.has(key)) candidate_keys.delete(key); }
    }
    const results = [];
    for (const key of candidate_keys) {
      if (results.length >= limit) break;
      if (this._purgeExpired(key)) continue;
      this._assertRead(key);
      const entry = this.store.get(key);
      if (entry) results.push({ key, value: entry.value, tags: entry._tags });
    }
    return results;
  }

  /** @returns {object} */
  stats() {
    return {
      total_keys:  this.store.size,
      total_tags:  this.tagIndex.size,
      backend:     this.settings.backend ?? "in-process",
      max_size_mb: this.settings.max_size_mb ?? 256,
    };
  }
}

module.exports = { CrossAgentMemoryClient };
