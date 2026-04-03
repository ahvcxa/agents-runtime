"use strict";
/**
 * src/memory/drivers/file-driver.js
 * ─────────────────────────────────────────────────────────────────────────────
 * File-based persistence driver
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const InProcessMemoryDriver = require("./in-process-driver");

class FileMemoryDriver extends InProcessMemoryDriver {
  constructor({ projectRoot, storagePath, agentId }) {
    super();
    this.projectRoot = projectRoot;
    this.storagePath = path.resolve(projectRoot, storagePath ?? ".agents/.memory-store");
    this.agentId = agentId;
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

  close() {
    this._flush();
  }
}

module.exports = FileMemoryDriver;
