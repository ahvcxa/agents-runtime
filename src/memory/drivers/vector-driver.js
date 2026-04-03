"use strict";
/**
 * src/memory/drivers/vector-driver.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vector similarity search driver (scaffold)
 */

const InProcessMemoryDriver = require("./in-process-driver");

class VectorMemoryDriver extends InProcessMemoryDriver {
  constructor(opts = {}) {
    super();
    this.options = opts;
    // TODO: Implement real vector embedding + similarity search
  }

  similarityQuery(_vector, _topK = 5) {
    if (!(this.store instanceof Map)) return [];
    const q = String(_vector ?? "").toLowerCase();
    const out = [];
    for (const [, entry] of this.store.entries()) {
      if (String(entry.value).toLowerCase().includes(q)) out.push(entry);
      if (out.length >= _topK) break;
    }
    return out;
  }
}

module.exports = VectorMemoryDriver;
