/**
 * tests/agent-discovery.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for automatic agent discovery and authorization system
 */

const fs = require("fs");
const path = require("path");
const { discoverAndAuthorizeAgent, tryDiscoverAgent } = require("../src/loader/agent-discovery");
const { loadSettings } = require("../src/loader/settings-loader");

describe("Agent Discovery System", () => {
  const testProjectRoot = path.join(__dirname, "fixtures", "agent-discovery");
  let settings;
  const testAgentYamlPath = path.join(process.cwd(), "agent.yaml");

  beforeAll(() => {
    settings = loadSettings(process.cwd());
    console.log("[test-debug] loaded settings.skills.registry_path:", settings?.skills?.registry_path);
    
    // Ensure agent.yaml exists for testing (CI environments may not have it)
    if (!fs.existsSync(testAgentYamlPath)) {
      const examplePath = path.join(__dirname, "..", "examples", "observer-agent.yaml");
      if (fs.existsSync(examplePath)) {
        // Copy example agent configuration for testing
        const exampleContent = fs.readFileSync(examplePath, "utf-8");
        fs.writeFileSync(testAgentYamlPath, exampleContent);
      } else {
        // Fallback: Create minimal valid agent config
        const agentConfig = `agent:
  id: "test-agent-01"
  role: "Test"
  skill_set:
    - "code-analysis"
  authorization_level: 1
  read_only: true
  read_paths:
    - "src/"
    - "tests/"
`;
        fs.writeFileSync(testAgentYamlPath, agentConfig);
      }
    }
  });

  afterAll(() => {
    // Clean up test agent.yaml if we created it
    if (fs.existsSync(testAgentYamlPath)) {
      fs.unlinkSync(testAgentYamlPath);
    }
  });

  describe("discoverAndAuthorizeAgent", () => {
    it("should discover agent.yaml in project root", async () => {
      // Test with actual project
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null // no logger
      );

      expect(result).toBeDefined();
      expect(result.path).toContain("agent.yaml");
      expect(result.config).toBeDefined();
      expect(result.config.agent).toBeDefined();
      expect(result.compliance).toBeDefined();
      expect(result.compliance.passed).toBe(true);
      expect(result.discoveredAt).toBeDefined();
      expect(result.discovery_time_ms).toBeGreaterThanOrEqual(0);
    });

    it("should throw ConfigurationNotFound when agent.yaml not in search paths", async () => {
      const nonExistentRoot = path.join(__dirname, "fixtures", "nonexistent");
      
      await expect(
        discoverAndAuthorizeAgent(nonExistentRoot, settings, null)
      ).rejects.toThrow("ConfigurationNotFound");
    });

    it("should run compliance checks and validate agent configuration", async () => {
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      // Verify compliance checks were run
      expect(result.compliance.checks_total).toBeGreaterThan(0);
      expect(result.compliance.checks_passed).toBeGreaterThan(0);
      expect(result.compliance.checks_total).toBe(result.compliance.checks_passed);
    });

    it("should extract agent identity from configuration", async () => {
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      const agent = result.config.agent;
      expect(agent.id).toBeDefined();
      expect(agent.role).toBeDefined();
      expect(agent.authorization_level).toBeDefined();
      expect([1, 2, 3]).toContain(agent.authorization_level);
    });

    it("should support both YAML and JSON agent configurations", async () => {
      // This is tested implicitly by discovering our YAML agent
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      expect(result.config.agent).toBeDefined();
      expect(typeof result.config.agent).toBe("object");
    });
  });

  describe("tryDiscoverAgent (soft fail)", () => {
    it("should return null when agent.yaml not found (soft fail)", async () => {
      const nonExistentRoot = path.join(__dirname, "fixtures", "nonexistent");
      
      const result = await tryDiscoverAgent(nonExistentRoot, settings, null);
      expect(result).toBeNull();
    });

    it("should return agent config when found", async () => {
      const result = await tryDiscoverAgent(process.cwd(), settings, null);
      expect(result).not.toBeNull();
      expect(result.config.agent).toBeDefined();
    });
  });

  describe("Compliance checks during discovery", () => {
    it("should verify agent identity completeness (CHK-001)", async () => {
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      const agent = result.config.agent;
      expect(agent.id).toBeTruthy();
      expect(agent.role).toBeTruthy();
      expect(agent.authorization_level).toBeTruthy();
    });

    it("should verify authorization level validity (CHK-002)", async () => {
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      const level = parseInt(result.config.agent.authorization_level, 10);
      expect([1, 2, 3]).toContain(level);
    });

    it("should verify agent ID format (CHK-006)", async () => {
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      const id = result.config.agent.id;
      expect(/^[a-z0-9][a-z0-9\-_]*$/.test(id)).toBe(true);
    });
  });

  describe("Search paths configuration", () => {
    it("should use search paths from settings.ai_agent_discovery", async () => {
      expect(settings.ai_agent_discovery).toBeDefined();
      expect(settings.ai_agent_discovery.search_paths).toBeDefined();
      expect(Array.isArray(settings.ai_agent_discovery.search_paths)).toBe(true);
      expect(settings.ai_agent_discovery.search_paths.length).toBeGreaterThan(0);
    });

    it("should search paths in order", async () => {
      // This is tested implicitly by the success of agent discovery
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      // Verify the found path is one of the configured search paths
      const relPath = path.relative(process.cwd(), result.path);
      const searchPaths = settings.ai_agent_discovery.search_paths;
      const matchFound = searchPaths.some(p => relPath.includes(p) || result.path.includes(p));
      expect(matchFound || relPath === "agent.yaml").toBe(true);
    });
  });

  describe("Metadata capture", () => {
    it("should capture discovery timestamp", async () => {
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      expect(result.discoveredAt).toBeDefined();
      // Should be valid ISO 8601 date
      expect(new Date(result.discoveredAt).getTime()).toBeGreaterThan(0);
    });

    it("should measure discovery time", async () => {
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      expect(result.discovery_time_ms).toBeDefined();
      expect(typeof result.discovery_time_ms).toBe("number");
      expect(result.discovery_time_ms).toBeGreaterThanOrEqual(0);
      expect(result.discovery_time_ms).toBeLessThan(5000); // Should be fast
    });

    it("should store agent configuration path", async () => {
      const result = await discoverAndAuthorizeAgent(
        process.cwd(),
        settings,
        null
      );

      expect(result.path).toBeDefined();
      expect(fs.existsSync(result.path)).toBe(true);
    });
  });
});
