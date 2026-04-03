"use strict";
/**
 * src/memory/drivers/redis-driver.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Redis-backed persistence driver (scaffold)
 */

const InProcessMemoryDriver = require("./in-process-driver");

class RedisMemoryDriver extends InProcessMemoryDriver {
  constructor(opts = {}) {
    super();
    this.options = opts;
    // TODO: Implement real Redis connection
  }
}

module.exports = RedisMemoryDriver;
