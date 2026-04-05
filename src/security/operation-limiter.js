"use strict";

class SlidingWindowRateLimiter {
  constructor({ windowMs = 60000, max = 120 } = {}) {
    this.windowMs = Math.max(1000, Number(windowMs) || 60000);
    this.max = Math.max(1, Number(max) || 120);
    this.events = new Map();
  }

  consume(key = "global") {
    const now = Date.now();
    const k = String(key);
    const bucket = this.events.get(k) || [];
    const fresh = bucket.filter((t) => now - t < this.windowMs);
    if (fresh.length >= this.max) {
      const retryAfterMs = this.windowMs - (now - fresh[0]);
      return { ok: false, retry_after_ms: Math.max(1, retryAfterMs) };
    }
    fresh.push(now);
    this.events.set(k, fresh);
    return { ok: true, remaining: this.max - fresh.length };
  }
}

class ConcurrencyLimiter {
  constructor({ maxConcurrent = 4 } = {}) {
    this.maxConcurrent = Math.max(1, Number(maxConcurrent) || 4);
    this.active = 0;
  }

  enter() {
    if (this.active >= this.maxConcurrent) {
      return { ok: false, active: this.active, max: this.maxConcurrent };
    }
    this.active += 1;
    return { ok: true, active: this.active, max: this.maxConcurrent };
  }

  leave() {
    this.active = Math.max(0, this.active - 1);
  }
}

module.exports = {
  SlidingWindowRateLimiter,
  ConcurrencyLimiter,
};
