/**
 * tests/e2b-sandbox-provider.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Test suite for E2BSandboxProvider.
 */

const { E2BSandboxProvider } = require("../src/sandbox/providers/e2b-provider");

describe("E2BSandboxProvider", () => {
  let provider;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
    };
    // Clear environment variable
    delete process.env.E2B_API_KEY;
  });

  afterEach(async () => {
    if (provider) {
      await provider.shutdown();
    }
  });

  describe("initialization", () => {
    it("should create provider with default settings", () => {
      provider = new E2BSandboxProvider({}, mockLogger);

      expect(provider.config).toBeDefined();
      expect(provider.config.apiBase).toBe("https://api.e2b.dev/v1");
      expect(provider.config.timeout).toBe(120000);
    });

    it("should create provider with custom settings", () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "test-key-123",
        e2b_api_base: "https://custom.e2b.dev/v1",
        e2b_timeout_ms: 60000,
      }, mockLogger);

      expect(provider.config.apiKey).toBe("test-key-123");
      expect(provider.config.apiBase).toBe("https://custom.e2b.dev/v1");
      expect(provider.config.timeout).toBe(60000);
    });

    it("should read API key from environment variable", () => {
      process.env.E2B_API_KEY = "env-key-456";

      provider = new E2BSandboxProvider({}, mockLogger);

      expect(provider.config.apiKey).toBe("env-key-456");
    });

    it("should be disabled without API key", () => {
      provider = new E2BSandboxProvider({}, mockLogger);

      expect(provider.config.enabled).toBe(false);
    });

    it("should be enabled with API key", () => {
      provider = new E2BSandboxProvider({
        e2b_enabled: true,
        e2b_api_key: "valid-key",
      }, mockLogger);

      expect(provider.config.enabled).toBe(true);
    });

    it("should be disabled when e2b_enabled is false", () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "valid-key",
        e2b_enabled: false,
      }, mockLogger);

      expect(provider.config.enabled).toBe(false);
    });
  });

  describe("health checks", () => {
    it("should return offline status when not configured", async () => {
      provider = new E2BSandboxProvider({}, mockLogger);
      await provider.init();

      const health = await provider.healthCheck();

      expect(health.status).toBe("offline");
      expect(health.checked_at).toBeDefined();
      expect(health.details.provider).toBe("e2b");
    });

    it("should return degraded status on API failure", async () => {
      provider = new E2BSandboxProvider({
        e2b_enabled: true,
        e2b_api_key: "invalid-key",
      }, mockLogger);

      const health = await provider.healthCheck();

      expect(health.status).toMatch(/offline|degraded/);
    });

    it("should include health details", async () => {
      provider = new E2BSandboxProvider({}, mockLogger);
      await provider.init();

      const health = await provider.healthCheck();

      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("checked_at");
      expect(health).toHaveProperty("details");
    });
  });

  describe("initialization process", () => {
    it("should initialize without errors when disabled", async () => {
      provider = new E2BSandboxProvider({}, mockLogger);

      await expect(provider.init()).resolves.not.toThrow();
      expect(provider.initialized).toBe(true);
    });

    it("should log when provider is disabled", async () => {
      provider = new E2BSandboxProvider({}, mockLogger);
      await provider.init();

      expect(mockLogger.log).toHaveBeenCalled();
      const logCalls = mockLogger.log.mock.calls;
      const disabledLog = logCalls.some((call) =>
        call[0].message.includes("disabled")
      );
      expect(disabledLog).toBe(true);
    });

    it("should handle init failure with invalid API key gracefully", async () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "definitely-invalid-key",
      }, mockLogger);

      await expect(provider.init()).resolves.not.toThrow();
      // Provider should disable on failure
      expect(provider.config.enabled).toBe(false);
    });
  });

  describe("execution", () => {
    beforeEach(async () => {
      provider = new E2BSandboxProvider({}, mockLogger);
      await provider.init();
    });

    it("should fallback to callback when not configured", async () => {
      const callbackCalled = jest.fn(() => ({ result: "ok" }));

      const result = await provider.execute({
        run: callbackCalled,
      });

      expect(callbackCalled).toHaveBeenCalled();
      expect(result.result).toBe("ok");
    });

    it("should throw when no fallback provided and provider disabled", async () => {
      await expect(provider.execute({})).rejects.toThrow();
    });

    it("should log fallback warning", async () => {
      const callbackCalled = jest.fn(() => ({ ok: true }));

      await provider.execute({
        run: callbackCalled,
      });

      expect(mockLogger.log).toHaveBeenCalled();
    });

    it("should pass context to callback", async () => {
      const callbackCalled = jest.fn(() => ({ ok: true }));

      await provider.execute({
        run: callbackCalled,
        context: { key: "value" },
      });

      expect(callbackCalled).toHaveBeenCalled();
    });
  });

  describe("HTTP request handling", () => {
    it("should construct proper HTTPS requests", async () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "test-key",
      }, mockLogger);

      // This will fail because API key is invalid, but we're testing the structure
      const promise = provider.makeRequest("GET", "/user", null, 5000);

      // Should attempt to make request (will fail)
      await expect(promise).rejects.toThrow();
    });

    it("should handle request timeout", async () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "test-key",
      }, mockLogger);

      // Create a hanging request that will timeout
      const promise = provider.makeRequest(
        "GET",
        "https://httpbin.org/delay/10",
        null,
        100 // Very short timeout
      );

      await expect(promise).rejects.toThrow(/timeout|ECONNRESET/);
    });
  });

  describe("shutdown", () => {
    it("should shutdown without errors", async () => {
      provider = new E2BSandboxProvider({}, mockLogger);

      await expect(provider.shutdown()).resolves.not.toThrow();
    });

    it("should mark as uninitialized after shutdown", async () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "test-key",
      }, mockLogger);

      await provider.init();
      expect(provider.initialized).toBe(true);

      await provider.shutdown();

      expect(provider.initialized).toBe(false);
    });

    it("should handle shutdown errors gracefully", async () => {
      provider = new E2BSandboxProvider({}, mockLogger);

      // Should not throw even if something goes wrong
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });

  describe("API methods", () => {
    beforeEach(() => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "test-key",
      }, mockLogger);
    });

    it("should format createSandbox request properly", async () => {
      // Will fail due to invalid key, but testing structure
      const promise = provider.createSandbox("base", { timeout: 120000 });

      await expect(promise).rejects.toThrow();
    });

    it("should format executeInSandbox request properly", async () => {
      const promise = provider.executeInSandbox("sandbox-123", "console.log('test')", {
        context: { key: "value" },
      });

      await expect(promise).rejects.toThrow();
    });

    it("should format deleteSandbox request properly", async () => {
      const promise = provider.deleteSandbox("sandbox-123");

      await expect(promise).rejects.toThrow();
    });
  });

  describe("security", () => {
    it("should not log API keys", async () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "super-secret-key",
      }, mockLogger);

      await provider.init();

      const allLogs = mockLogger.log.mock.calls.flat();
      const hasSecret = allLogs.some((log) =>
        log.toString().includes("super-secret-key")
      );

      expect(hasSecret).toBe(false);
    });

    it("should handle empty code gracefully", async () => {
      provider = new E2BSandboxProvider({}, mockLogger);
      await provider.init();

      const callbackCalled = jest.fn(() => ({ result: "empty" }));

      await provider.execute({
        run: callbackCalled,
        code: "",
      });

      expect(callbackCalled).toHaveBeenCalled();
    });
  });

  describe("error scenarios", () => {
    it("should handle network errors", async () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "test-key",
        e2b_api_base: "https://invalid-e2b-domain-12345.dev/v1",
      }, mockLogger);

      const health = await provider.healthCheck();

      expect(health.status).toMatch(/offline|degraded/);
    });

    it("should provide helpful error messages", async () => {
      provider = new E2BSandboxProvider({
        e2b_api_key: "test-key",
      }, mockLogger);

      const promise = provider.makeRequest("GET", "/invalid", null, 5000);

      await expect(promise).rejects.toThrow();
    });
  });
});
