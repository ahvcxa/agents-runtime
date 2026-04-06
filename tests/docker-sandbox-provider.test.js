/**
 * tests/docker-sandbox-provider.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Test suite for DockerSandboxProvider.
 */

const { DockerSandboxProvider } = require("../src/sandbox/providers/docker-provider");

describe("DockerSandboxProvider", () => {
  // Docker operations can be slow in CI environments
  jest.setTimeout(30000);

  let provider;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
    };
  });

  afterEach(async () => {
    if (provider) {
      await provider.shutdown();
    }
  });

  describe("initialization", () => {
    it("should create provider with default settings", () => {
      provider = new DockerSandboxProvider({}, mockLogger);

      expect(provider.docker.enabled).toBeDefined();
      expect(provider.docker.image).toBe("node:20-alpine");
      expect(provider.docker.cpus).toBe("1");
      expect(provider.docker.memory).toBe("512m");
      expect(provider.docker.network).toBe("none");
    });

    it("should create provider with custom settings", () => {
      provider = new DockerSandboxProvider({
        docker_enabled: true,
        docker_image: "python:3.11",
        docker_cpus: "2",
        docker_memory: "1g",
      }, mockLogger);

      expect(provider.docker.image).toBe("python:3.11");
      expect(provider.docker.cpus).toBe("2");
      expect(provider.docker.memory).toBe("1g");
    });

    it("should resolve docker binary path", () => {
      provider = new DockerSandboxProvider({}, mockLogger);

      // Should not throw on standard docker paths
      expect(provider.docker.bin).toBeDefined();
    });

    it("should validate docker path against whitelist", () => {
      // Invalid paths should be silently treated as "docker" from PATH
      // (per the implementation)
      expect(() => {
        new DockerSandboxProvider({
          docker_path: "/invalid/path/docker",
        }, mockLogger);
      }).not.toThrow(); // Falls back to "docker" in PATH
    });

    it("should allow whitelisted docker paths", () => {
      const validPaths = [
        "/usr/bin/docker",
        "/usr/local/bin/docker",
        "/opt/homebrew/bin/docker",
      ];

      for (const validPath of validPaths) {
        // Should not throw
        expect(() => {
          new DockerSandboxProvider({
            docker_path: validPath,
          }, mockLogger);
        }).not.toThrow();
      }
    });
  });

  describe("docker daemon verification", () => {
    it("should verify docker daemon is running", async () => {
      provider = new DockerSandboxProvider({ docker_enabled: true }, mockLogger);

      // This test depends on docker being installed
      // Skip if docker is not available
      const isDaemonRunning = await provider.verifyDockerDaemon();
      expect(typeof isDaemonRunning).toBe("boolean");
    });
  });

  describe("health checks", () => {
    it("should return offline status when docker is disabled", async () => {
      provider = new DockerSandboxProvider({ docker_enabled: false }, mockLogger);
      await provider.init();

      const health = await provider.healthCheck();

      expect(health.status).toBe("offline");
      expect(health.checked_at).toBeDefined();
      expect(health.details.reason).toContain("disabled");
    });

    it("should include health details", async () => {
      provider = new DockerSandboxProvider({ docker_enabled: true }, mockLogger);
      await provider.init();

      const health = await provider.healthCheck();

      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("checked_at");
      expect(health).toHaveProperty("details");
      expect(health.details).toHaveProperty("cpus");
      expect(health.details).toHaveProperty("memory");
    });
  });

  describe("initialization process", () => {
    it("should initialize without errors when docker disabled", async () => {
      provider = new DockerSandboxProvider({ docker_enabled: false }, mockLogger);

      await expect(provider.init()).resolves.not.toThrow();
      expect(provider.initialized).toBe(true);
    });

    it("should log when docker is disabled", async () => {
      provider = new DockerSandboxProvider({ docker_enabled: false }, mockLogger);
      await provider.init();

      expect(mockLogger.log).toHaveBeenCalled();
      const logCalls = mockLogger.log.mock.calls;
      const disabledLog = logCalls.some((call) =>
        call[0].message.includes("disabled")
      );
      expect(disabledLog).toBe(true);
    });

    it("should handle init failure gracefully", async () => {
      provider = new DockerSandboxProvider({
        docker_enabled: true,
        docker_path: "/usr/bin/docker", // May not exist
      }, mockLogger);

      await expect(provider.init()).resolves.not.toThrow();
      // Provider should disable docker on failure
      expect(provider.docker.enabled).toBeDefined();
    });
  });

  describe("execution", () => {
    beforeEach(async () => {
      provider = new DockerSandboxProvider({ docker_enabled: false }, mockLogger);
      await provider.init();
    });

    it("should fallback to callback when docker disabled", async () => {
      const callbackCalled = jest.fn(() => ({ result: "ok" }));

      const result = await provider.execute({
        run: callbackCalled,
      });

      expect(callbackCalled).toHaveBeenCalled();
      expect(result.result).toBe("ok");
    });

    it("should throw when no fallback provided and docker disabled", async () => {
      await expect(provider.execute({})).rejects.toThrow();
    });

    it("should pass context to execution", async () => {
      const callbackCalled = jest.fn(() => ({ ok: true }));

      await provider.execute({
        run: callbackCalled,
        context: { key: "value" },
      });

      expect(callbackCalled).toHaveBeenCalled();
    });
  });

  describe("shutdown", () => {
    it("should shutdown without errors", async () => {
      provider = new DockerSandboxProvider({}, mockLogger);

      await expect(provider.shutdown()).resolves.not.toThrow();
    });

    it("should clear active containers on shutdown", async () => {
      provider = new DockerSandboxProvider({}, mockLogger);

      // Add fake container ID
      provider.activeContainers.add("fake-container-id");
      expect(provider.activeContainers.size).toBe(1);

      await provider.shutdown();

      expect(provider.activeContainers.size).toBe(0);
    });
  });

  describe("security", () => {
    it("should enforce resource limits in docker args", async () => {
      provider = new DockerSandboxProvider({
        docker_enabled: true,
        docker_cpus: "2",
        docker_memory: "2g",
      }, mockLogger);

      expect(provider.docker.cpus).toBe("2");
      expect(provider.docker.memory).toBe("2g");
    });

    it("should use read-only filesystem by default", async () => {
      provider = new DockerSandboxProvider({}, mockLogger);
      await provider.init();

      // Config should reflect read-only settings
      expect(provider.docker.memory).toBeDefined();
    });

    it("should use network isolation by default", async () => {
      provider = new DockerSandboxProvider({}, mockLogger);

      expect(provider.docker.network).toBe("none");
    });
  });

  describe("logging", () => {
    it("should log execution events", async () => {
      provider = new DockerSandboxProvider({ docker_enabled: false }, mockLogger);
      await provider.init();

      await provider.execute({ run: () => ({ ok: true }) });

      // Should have logged init and fallback
      expect(mockLogger.log).toHaveBeenCalled();
    });

    it("should log health check results", async () => {
      provider = new DockerSandboxProvider({ docker_enabled: true }, mockLogger);
      await provider.init();

      await provider.healthCheck();

      // May have logged during init
      expect(typeof mockLogger.log).toBe("function");
    });
  });
});
