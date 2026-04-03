"use strict";
/**
 * src/memory/memory-store.js
 * Adapter-based memory layer with pluggable persistence drivers.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

class InProcessMemoryDriver {
  constructor() {
    this.store = new Map();
  }

  upsert(key, entry) {
    this.store.set(key, entry);
  }

  get(key) {
    return this.store.get(key);
  }

  delete(key) {
    this.store.delete(key);
  }

  entries() {
    return [...this.store.entries()];
  }

  close() {
    return undefined;
  }
}

class FileMemoryDriver {
  constructor({ projectRoot, storagePath, agentId }) {
    this.projectRoot = projectRoot;
    this.storagePath = path.resolve(projectRoot, storagePath ?? ".agents/.memory-store");
    this.agentId = agentId;
    this.store = new Map();
    this._initPromise = this._load();
    this._pendingFlush = null;
  }

  _filePath() {
    return path.join(this.storagePath, `${this.agentId}.json`);
  }

  async _load() {
    const file = this._filePath();
    if (!fs.existsSync(file)) return;
    try {
      const parsed = JSON.parse(await fsp.readFile(file, "utf8"));
      for (const [key, entry] of Object.entries(parsed)) {
        this.store.set(key, entry);
      }
    } catch {
      // ignore corrupt cache
    }
  }

  _scheduleFlush() {
    if (this._pendingFlush) return this._pendingFlush;
    this._pendingFlush = new Promise((resolve) => {
      setImmediate(async () => {
        await this._flushInternal();
        this._pendingFlush = null;
        resolve();
      });
    });
    return this._pendingFlush;
  }

  async _flushInternal() {
    try {
      await fsp.mkdir(this.storagePath, { recursive: true });
      const out = {};
      for (const [key, val] of this.store.entries()) out[key] = val;
      await fsp.writeFile(this._filePath(), JSON.stringify(out, null, 2), "utf8");
    } catch {
      // ignore flush failures to avoid breaking runtime
    }
  }

  _flush() {
    this._scheduleFlush().catch(() => undefined);
  }

  async _ensureReady() {
    await this._initPromise;
  }

  upsert(key, entry) {
    this._ensureReady().catch(() => undefined);
    this.store.set(key, entry);
    this._flush();
  }

  get(key) {
    this._ensureReady().catch(() => undefined);
    return this.store.get(key);
  }

  delete(key) {
    this._ensureReady().catch(() => undefined);
    this.store.delete(key);
    this._flush();
  }

  entries() {
    return [...this.store.entries()];
  }

  close() {
    this._flush();
  }
}

class RedisMemoryDriver extends InProcessMemoryDriver {
  constructor(opts = {}) {
    super();
    this.options = opts;
  }
}

class PostgresMemoryDriver extends InProcessMemoryDriver {
  constructor(opts = {}) {
    super();
    this.options = opts;
  }
}

class VectorMemoryDriver extends InProcessMemoryDriver {
  constructor(opts = {}) {
    super();
    this.options = opts;
  }

  similarityQuery(_vector, _topK = 5) {
    return [];
  }
}

function createPersistenceAdapter(settings, agentId, projectRoot) {
  const memory = settings?.memory ?? {};
  const backend = (memory.backend ?? "in-process").toLowerCase();
  const persistence = memory.persistence ?? {};

  if (backend === "redis") return new RedisMemoryDriver(memory.redis ?? {});
  if (backend === "postgres" || backend === "postgresql") return new PostgresMemoryDriver(memory.postgres ?? {});
  if (backend === "vector") return new VectorMemoryDriver(memory.vector ?? {});
  if (persistence.enabled) {
    return new FileMemoryDriver({
      projectRoot,
      storagePath: persistence.storage_path,
      agentId,
    });
  }
  return new InProcessMemoryDriver();
}

class MemoryStoreClient {
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

  _assertRead(key) {
    const rule = this._resolveRule(key);
    const minLevel = rule?.read_min_level ?? 1;
    if (this.authLevel < minLevel) {
      throw new Error(`[memory] Agent '${this.agentId}' lacks read permission for '${key}'`);
    }
  }

  _assertWrite(key) {
    const rule = this._resolveRule(key);
    const minLevel = rule?.write_min_level ?? 1;
    if (this.authLevel < minLevel) {
      throw new Error(`[memory] Agent '${this.agentId}' lacks write permission for '${key}'`);
    }
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
    this.ttlMap.set(key, Date.now() + ttl * 1000);
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
}

function createMemoryStore(settings, authLevel, agentId, projectRoot) {
  const adapter = createPersistenceAdapter(settings, agentId, projectRoot);
  return new MemoryStoreClient(settings, authLevel, agentId, adapter);
}

module.exports = {
  createMemoryStore,
  createPersistenceAdapter,
  InProcessMemoryDriver,
  FileMemoryDriver,
  RedisMemoryDriver,
  PostgresMemoryDriver,
  VectorMemoryDriver,
  MemoryStoreClient,
};
