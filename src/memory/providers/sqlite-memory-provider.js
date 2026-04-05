"use strict";

const path = require("path");
const fs = require("fs");
const { IMemoryProvider } = require("../../core/contracts/memory-provider.contract");

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function termFrequency(tokens) {
  const map = new Map();
  for (const token of tokens) map.set(token, (map.get(token) || 0) + 1);
  return map;
}

function cosineScore(textA, textB) {
  const a = termFrequency(tokenize(textA));
  const b = termFrequency(tokenize(textB));
  if (a.size === 0 || b.size === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const [, val] of a.entries()) magA += val * val;
  for (const [, val] of b.entries()) magB += val * val;
  for (const [term, aval] of a.entries()) {
    dot += aval * (b.get(term) || 0);
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

class SqliteMemoryProvider extends IMemoryProvider {
  constructor(config = {}) {
    super(config);
    this.config = config;
    this.db = null;
  }

  _dbPath() {
    const projectRoot = this.config.project_root || process.cwd();
    const custom = this.config.sqlite_path;
    if (custom) {
      return path.isAbsolute(custom) ? custom : path.resolve(projectRoot, custom);
    }
    return path.resolve(projectRoot, ".agents", ".cognitive-memory.sqlite");
  }

  async init() {
    if (!DatabaseSync) {
      throw new Error("node:sqlite is unavailable in this Node runtime");
    }
    const dbPath = this._dbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS session_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        mem_key TEXT NOT NULL,
        role TEXT,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS long_term_memory (
        mem_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        text_content TEXT NOT NULL,
        metadata_json TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_sid_created ON session_memory(session_id, created_at);
    `);
  }

  async store(key, value, options = {}) {
    if (!this.db) throw new Error("SqliteMemoryProvider is not initialized");
    const namespace = options.namespace || "long_term";
    const now = new Date().toISOString();

    if (namespace === "session") {
      const sessionId = options.session_id || "default";
      const role = options.role || "system";
      this.db.prepare(
        `INSERT INTO session_memory (session_id, mem_key, role, value_json, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(sessionId, key, role, JSON.stringify(value), now);
      return;
    }

    const text = options.text || JSON.stringify(value);
    const metadata = options.metadata || {};
    this.db.prepare(
      `INSERT INTO long_term_memory (mem_key, value_json, text_content, metadata_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(mem_key) DO UPDATE SET
         value_json=excluded.value_json,
         text_content=excluded.text_content,
         metadata_json=excluded.metadata_json,
         updated_at=excluded.updated_at`
    ).run(key, JSON.stringify(value), text, JSON.stringify(metadata), now);
  }

  async retrieve(key, options = {}) {
    if (!this.db) throw new Error("SqliteMemoryProvider is not initialized");
    const namespace = options.namespace || "long_term";

    if (namespace === "session") {
      const sessionId = options.session_id || "default";
      const rows = this.db.prepare(
        `SELECT mem_key, role, value_json, created_at
         FROM session_memory
         WHERE session_id = ?
         ORDER BY id ASC`
      ).all(sessionId);

      const mapped = rows.map((r) => ({
        key: r.mem_key,
        role: r.role,
        value: JSON.parse(r.value_json),
        timestamp: r.created_at,
      }));
      return key === "*" ? mapped : mapped.filter((r) => r.key === key);
    }

    const row = this.db.prepare(
      `SELECT mem_key, value_json, text_content, metadata_json, updated_at
       FROM long_term_memory WHERE mem_key = ?`
    ).get(key);
    if (!row) return undefined;
    return {
      key: row.mem_key,
      value: JSON.parse(row.value_json),
      text: row.text_content,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      timestamp: row.updated_at,
    };
  }

  async semanticSearch(query, options = {}) {
    if (!this.db) throw new Error("SqliteMemoryProvider is not initialized");
    const topK = options.top_k || 5;
    const rows = this.db.prepare(
      `SELECT mem_key, value_json, text_content, metadata_json, updated_at
       FROM long_term_memory`
    ).all();

    const scored = rows
      .map((r) => ({
        key: r.mem_key,
        value: JSON.parse(r.value_json),
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
        timestamp: r.updated_at,
        score: cosineScore(query, r.text_content),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  async shutdown() {
    try {
      this.db?.close?.();
    } catch {
      // no-op
    }
    this.db = null;
  }
}

module.exports = { SqliteMemoryProvider, cosineScore };
