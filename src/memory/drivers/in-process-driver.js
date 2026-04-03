"use strict";
/**
 * src/memory/drivers/in-process-driver.js
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory store driver (no persistence)
 */

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
    this.store.clear();
  }
}

module.exports = InProcessMemoryDriver;
