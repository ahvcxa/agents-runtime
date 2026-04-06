"use strict";
/**
 * src/memory/drivers/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence driver factory
 */

const InProcessMemoryDriver = require("./in-process-driver");
const FileMemoryDriver = require("./file-driver");
const VectorMemoryDriver = require("./vector-driver");

function createPersistenceAdapter(settings, agentId, projectRoot) {
  const memory = settings?.memory ?? {};
  const backend = (memory.backend ?? "in-process").toLowerCase();
  const persistence = memory.persistence ?? {};

  if (backend === "redis") {
    throw new Error("Redis driver not yet implemented. Use in-process or file-based persistence.");
  }
  if (backend === "postgres" || backend === "postgresql") {
    throw new Error("PostgreSQL driver not yet implemented. Use in-process or file-based persistence.");
  }
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

module.exports = {
  createPersistenceAdapter,
  InProcessMemoryDriver,
  FileMemoryDriver,
  VectorMemoryDriver,
};
