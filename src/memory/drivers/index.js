"use strict";
/**
 * src/memory/drivers/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence driver factory
 */

const InProcessMemoryDriver = require("./in-process-driver");
const FileMemoryDriver = require("./file-driver");
const RedisMemoryDriver = require("./redis-driver");
const PostgresMemoryDriver = require("./postgres-driver");
const VectorMemoryDriver = require("./vector-driver");

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

module.exports = {
  createPersistenceAdapter,
  InProcessMemoryDriver,
  FileMemoryDriver,
  RedisMemoryDriver,
  PostgresMemoryDriver,
  VectorMemoryDriver,
};
