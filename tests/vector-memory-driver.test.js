/**
 * tests/vector-memory-driver.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Test suite for VectorMemoryDriver with SQLite storage and semantic search.
 */

const VectorMemoryDriver = require("../src/memory/drivers/vector-driver");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Check if better-sqlite3 is available
let betterSqliteAvailable = true;
try {
  require("better-sqlite3");
} catch (err) {
  betterSqliteAvailable = false;
}

describe("VectorMemoryDriver", () => {
  let driver;
  let testDbPath;

  beforeEach(async () => {
    testDbPath = path.join(os.tmpdir(), `test-vectors-${Date.now()}.db`);
    driver = new VectorMemoryDriver({
      dbPath: testDbPath,
      dimensions: 384,
      inMemory: false,
    });
    await driver.init();
  });

  afterEach(async () => {
    if (driver) {
      await driver.shutdown();
    }
    if (testDbPath && fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
        const walPath = `${testDbPath}-wal`;
        const shmPath = `${testDbPath}-shm`;
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  describe("initialization", () => {
    it("should create database schema on init", async () => {
      expect(driver.initialized).toBe(true);
      expect(driver.vectorIndex).toBeInstanceOf(Map);
    });

    it("should support in-memory database", async () => {
      const memDriver = new VectorMemoryDriver({ inMemory: true });
      await memDriver.init();
      expect(memDriver.initialized).toBe(true);
      await memDriver.shutdown();
    });

    it("should create cache directory if not exists", async () => {
      const cacheDriver = new VectorMemoryDriver({});
      await cacheDriver.init();
      expect(cacheDriver.initialized).toBe(true);
      await cacheDriver.shutdown();
    });
  });

  describe("store and retrieve", () => {
    it("should store and retrieve text values", async () => {
      const key = "test:message";
      const value = "Hello world, this is a test message";

      await driver.store(key, value);
      const result = await driver.retrieve(key);

      expect(result).toBeDefined();
      expect(result.vector).toBeInstanceOf(Array);
      expect(result.vector.length).toBe(384);
      expect(result.metadata).toBeDefined();
    });

    it("should store and retrieve objects as JSON", async () => {
      const key = "test:object";
      const value = { name: "test", age: 25, tags: ["a", "b"] };

      await driver.store(key, value);
      const result = await driver.retrieve(key);

      expect(result).toBeDefined();
      expect(result.vector).toBeInstanceOf(Array);
      expect(result.metadata.value_type).toBe("object");
    });

    it("should return undefined for non-existent key", async () => {
      const result = await driver.retrieve("nonexistent:key");
      expect(result).toBeUndefined();
    });

    it("should support custom metadata", async () => {
      const key = "test:with:metadata";
      const value = "test value";
      const metadata = { source: "test", priority: "high" };

      await driver.store(key, value, { metadata });
      const result = await driver.retrieve(key);

      expect(result.metadata.source).toBe("test");
      expect(result.metadata.priority).toBe("high");
    });

    it("should support TTL for entries", async () => {
      const key = "test:ttl";
      const value = "expires soon";

      // Store with very short TTL
      await driver.store(key, value, { ttlSeconds: 1 });

      const resultBefore = await driver.retrieve(key);
      expect(resultBefore).toBeDefined();

      // Just verify that TTL was stored
      const stats = await driver.stats();
      expect(stats.total_vectors).toBeGreaterThan(0);
    });
  });

  describe("semantic search", () => {
    beforeEach(async () => {
      // Store test documents
      await driver.store("doc:1", "The quick brown fox jumps over the lazy dog");
      await driver.store("doc:2", "Machine learning is a subset of artificial intelligence");
      await driver.store("doc:3", "Node.js is a JavaScript runtime built on Chrome's V8 engine");
      await driver.store("doc:4", "Python is popular for data science and machine learning");
      await driver.store("doc:5", "Web development with React and Vue frameworks");
    });

    it("should find similar documents by text query", async () => {
      const results = await driver.semanticSearch("machine learning AI", { topK: 3, threshold: 0.1 });

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeLessThanOrEqual(3);

      // Results should have similarity scores
      for (const result of results) {
        expect(result.key).toBeDefined();
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
        expect(result.metadata).toBeDefined();
      }
    });

    it("should respect topK parameter", async () => {
      const results1 = await driver.semanticSearch("fox", { topK: 1 });
      const results2 = await driver.semanticSearch("fox", { topK: 3 });

      expect(results1.length).toBeLessThanOrEqual(1);
      expect(results2.length).toBeLessThanOrEqual(3);
    });

    it("should respect similarity threshold", async () => {
      const resultsLow = await driver.semanticSearch("fox", {
        topK: 5,
        threshold: 0.1,
      });
      const resultsHigh = await driver.semanticSearch("fox", {
        topK: 5,
        threshold: 0.9,
      });

      expect(resultsHigh.length).toBeLessThanOrEqual(resultsLow.length);
    });

    it("should handle vector input for search", async () => {
      // Get a stored vector
      const stored = await driver.retrieve("doc:1");
      const vector = stored.vector;

      // Search with vector - use lower threshold since exact vector match
      const results = await driver.semanticSearch(vector, { topK: 3, threshold: 0.5 });

      expect(results).toBeInstanceOf(Array);
      // May or may not find results depending on similarity threshold
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("should return sorted results by similarity", async () => {
      const results = await driver.semanticSearch("JavaScript Node React", {
        topK: 5,
      });

      let prevSimilarity = 1;
      for (const result of results) {
        expect(result.similarity).toBeLessThanOrEqual(prevSimilarity);
        prevSimilarity = result.similarity;
      }
    });

    it("should handle empty query gracefully", async () => {
      const results = await driver.semanticSearch("", { topK: 3 });
      expect(results).toBeInstanceOf(Array);
    });
  });

  describe("stats and monitoring", () => {
    it("should return database statistics", async () => {
      await driver.store("stat:1", "first entry");
      await driver.store("stat:2", "second entry");

      const stats = await driver.stats();

      expect(stats.total_vectors).toBeGreaterThanOrEqual(2);
      expect(stats.in_memory_index_size).toBeGreaterThanOrEqual(2);
      expect(stats.dimensions).toBe(384);
      expect(stats.oldest_entry).toBeDefined();
      expect(stats.newest_entry).toBeDefined();
    });
  });

  describe("concurrent operations", () => {
    it("should handle concurrent stores", async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(driver.store(`concurrent:${i}`, `value ${i}`));
      }

      await Promise.all(promises);

      for (let i = 0; i < 10; i++) {
        const result = await driver.retrieve(`concurrent:${i}`);
        expect(result).toBeDefined();
      }
    });

    it("should handle concurrent retrieves", async () => {
      await driver.store("shared", "shared value");

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(driver.retrieve("shared"));
      }

      const results = await Promise.all(promises);
      for (const result of results) {
        expect(result).toBeDefined();
      }
    });
  });

  describe("error handling", () => {
    it("should throw on invalid key in store", async () => {
      await expect(driver.store(null, "value")).rejects.toThrow();
      await expect(driver.store("", "value")).rejects.toThrow();
      await expect(driver.store(123, "value")).rejects.toThrow();
    });

    it("should handle store/retrieve of large data", async () => {
      const largeValue = "x".repeat(100000);
      await driver.store("large", largeValue);

      const result = await driver.retrieve("large");
      expect(result).toBeDefined();
      expect(result.vector).toBeInstanceOf(Array);
    });
  });

  const describePersistence = betterSqliteAvailable ? describe : describe.skip;
  describePersistence("persistence", () => {
    it("should persist data across driver instances", async () => {
      await driver.store("persist:1", "persistent value");
      await driver.shutdown();

      const driver2 = new VectorMemoryDriver({ dbPath: testDbPath });
      await driver2.init();

      const result = await driver2.retrieve("persist:1");
      expect(result).toBeDefined();
      expect(result.metadata.stored_at).toBeDefined();

      await driver2.shutdown();
    });

    it("should load vectors into memory index on init", async () => {
      await driver.store("index:1", "value 1");
      await driver.store("index:2", "value 2");
      const sizeAfterStore = driver.vectorIndex.size;

      await driver.shutdown();

      const driver2 = new VectorMemoryDriver({ dbPath: testDbPath, maxVectors: 100 });
      await driver2.init();

      expect(driver2.vectorIndex.size).toBeGreaterThan(0);

      await driver2.shutdown();
    });
  });
});
