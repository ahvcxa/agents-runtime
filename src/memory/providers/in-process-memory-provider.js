"use strict";

const { IMemoryProvider } = require("../../core/contracts/memory-provider.contract");

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function termFrequency(tokens) {
  const map = new Map();
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
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
    const bval = b.get(term) || 0;
    dot += aval * bval;
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

class InProcessMemoryProvider extends IMemoryProvider {
  constructor(config = {}) {
    super(config);
    this.sessions = new Map();
    this.longTerm = new Map();
  }

  async init() {}

  async store(key, value, options = {}) {
    const namespace = options.namespace || "long_term";
    if (namespace === "session") {
      const sessionId = options.session_id || "default";
      if (!this.sessions.has(sessionId)) this.sessions.set(sessionId, []);
      this.sessions.get(sessionId).push({
        key,
        value,
        role: options.role || "system",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.longTerm.set(key, {
      key,
      value,
      text: options.text || JSON.stringify(value),
      metadata: options.metadata || {},
      timestamp: new Date().toISOString(),
    });
  }

  async retrieve(key, options = {}) {
    const namespace = options.namespace || "long_term";
    if (namespace === "session") {
      const sessionId = options.session_id || "default";
      const rows = this.sessions.get(sessionId) || [];
      return rows.filter((r) => r.key === key || key === "*");
    }
    return this.longTerm.get(key);
  }

  async semanticSearch(query, options = {}) {
    const topK = options.top_k || 5;
    const scored = [];

    for (const item of this.longTerm.values()) {
      const score = cosineScore(query, item.text);
      if (score > 0) {
        scored.push({
          key: item.key,
          score,
          value: item.value,
          metadata: item.metadata,
          timestamp: item.timestamp,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async shutdown() {
    this.sessions.clear();
    this.longTerm.clear();
  }
}

module.exports = { InProcessMemoryProvider, cosineScore };
