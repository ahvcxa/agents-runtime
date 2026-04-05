"use strict";

const path = require("path");
const fs = require("fs");

const { SqliteMemoryProvider } = require("../src/memory/providers/sqlite-memory-provider");
const { createMemoryProvider } = require("../src/memory/providers/memory-provider-factory");

const HAS_NODE_SQLITE = (() => {
  try {
    require("node:sqlite");
    return true;
  } catch {
    return false;
  }
})();

describe("SqliteMemoryProvider", () => {
  const fixtureRoot = path.resolve(__dirname, "fixtures/project");
  const dbPath = path.resolve(fixtureRoot, ".agents/.test-cognitive-memory.sqlite");

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
    try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
  });

  (HAS_NODE_SQLITE ? test : test.skip)("stores and retrieves long-term memory in sqlite", async () => {
    const provider = new SqliteMemoryProvider({ project_root: fixtureRoot, sqlite_path: dbPath });
    await provider.init();

    await provider.store("lt:1", { name: "alice" }, { text: "alice profile" });
    const row = await provider.retrieve("lt:1", { namespace: "long_term" });
    expect(row.value).toEqual({ name: "alice" });

    await provider.shutdown();
  });

  (HAS_NODE_SQLITE ? test : test.skip)("supports semantic search", async () => {
    const provider = new SqliteMemoryProvider({ project_root: fixtureRoot, sqlite_path: dbPath });
    await provider.init();
    await provider.store("a", { t: "oauth" }, { text: "oauth refresh token rotation" });
    await provider.store("b", { t: "docker" }, { text: "docker cpu limit" });

    const hits = await provider.semanticSearch("oauth", { top_k: 2 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].key).toBe("a");

    await provider.shutdown();
  });

  test("factory creates sqlite provider when configured", () => {
    const provider = createMemoryProvider({
      _projectRoot: fixtureRoot,
      runtime: {
        cognitive_memory: {
          provider: "sqlite",
          sqlite_path: dbPath,
        },
      },
    });
    expect(provider.constructor.name).toBe("SqliteMemoryProvider");
  });
});
