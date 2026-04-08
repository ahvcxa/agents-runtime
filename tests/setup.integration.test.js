"use strict";

const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

describe.skip("Setup Integration: .agents/ structure and Agent Awareness", () => {
  const projectRoot = path.resolve(__dirname, "fixtures/project");

  describe(".agents/ directory structure", () => {
    test("manifest.json exists and is valid JSON", async () => {
      const manifestPath = path.join(projectRoot, ".agents", "manifest.json");
      const content = await fsp.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(content);

      expect(manifest).toHaveProperty("$schema");
      expect(manifest).toHaveProperty("spec_version");
      expect(manifest).toHaveProperty("entry_points");
      expect(manifest.entry_points).toHaveProperty("startup_guide");
      expect(manifest.entry_points["startup_guide"]).toBe(".agents/agent-startup.md");
    });

    test("manifest.json does NOT have deprecated ai_agent_startup entry point", async () => {
      const manifestPath = path.join(projectRoot, ".agents", "manifest.json");
      const content = await fsp.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(content);

      expect(manifest.entry_points).not.toHaveProperty("ai_agent_startup");
    });

    test("settings.json exists with security configuration", async () => {
      const settingsPath = path.join(projectRoot, ".agents", "settings.json");
      const content = await fsp.readFile(settingsPath, "utf8");
      const settings = JSON.parse(content);

      expect(settings).toHaveProperty("security");
      expect(settings.security).toHaveProperty("forbidden_file_patterns");
      expect(settings.security).toHaveProperty("forbidden_paths");
      expect(Array.isArray(settings.security.forbidden_paths)).toBe(true);
      expect(settings.security.forbidden_paths.length).toBeGreaterThan(0);
    });

    test("forbidden_paths array has expected path patterns", async () => {
      const settingsPath = path.join(projectRoot, ".agents", "settings.json");
      const content = await fsp.readFile(settingsPath, "utf8");
      const settings = JSON.parse(content);

      const forbiddenPaths = settings.security.forbidden_paths;
      expect(forbiddenPaths).toContain(".env");
      expect(forbiddenPaths).toContain(".git/**");
      expect(forbiddenPaths).toContain("node_modules/**");
    });

    test("AGENT_CONTRACT.md exists", async () => {
      const contractPath = path.join(projectRoot, ".agents", "AGENT_CONTRACT.md");
      const exists = fs.existsSync(contractPath);
      expect(exists).toBe(true);
    });

    test("agent-startup.md exists", async () => {
      const startupPath = path.join(projectRoot, ".agents", "agent-startup.md");
      const exists = fs.existsSync(startupPath);
      expect(exists).toBe(true);
    });

    test("AI_AGENT_GUIDE.md exists", async () => {
      const guidePath = path.join(projectRoot, ".agents", "AI_AGENT_GUIDE.md");
      const exists = fs.existsSync(guidePath);
      expect(exists).toBe(true);
    });

    test("hooks directory exists with required hook files", async () => {
      const hooksDir = path.join(projectRoot, ".agents", "hooks");
      const exists = fs.existsSync(hooksDir);
      expect(exists).toBe(true);

      const hooksToCheck = [
        "pre-read.hook.js",
        "pre-network.hook.js",
        "skill-lifecycle.hook.js",
        "pre-interaction.hook.js",
      ];
      for (const hookFile of hooksToCheck) {
        const hookPath = path.join(hooksDir, hookFile);
        expect(fs.existsSync(hookPath)).toBe(
          true,
          `Hook ${hookFile} should exist at ${hookPath}`
        );
      }
    });

    test("helpers directory exists with compliance-check helper", async () => {
      const helpersDir = path.join(projectRoot, ".agents", "helpers");
      const exists = fs.existsSync(helpersDir);
      expect(exists).toBe(true);

      const complianceCheckPath = path.join(helpersDir, "compliance-check.js");
      expect(fs.existsSync(complianceCheckPath)).toBe(true);
    });
  });

  describe("Agent Awareness Module", () => {
    test("loads agent context from .agents/ directory", async () => {
      const { getAgentAwareness } = require("../src/loaders/agent-awareness");
      const awareness = getAgentAwareness({ logger: { debug: () => {}, log: () => {} } });

      const context = await awareness.loadAgentContext(projectRoot);
      expect(context).toBeDefined();
      expect(context.manifest).toBeDefined();
      expect(context.settings).toBeDefined();
    });

    test("manifest contains expected skill definitions", async () => {
      const { getAgentAwareness } = require("../src/loaders/agent-awareness");
      const awareness = getAgentAwareness({ logger: { debug: () => {}, log: () => {} } });

      const context = await awareness.loadAgentContext(projectRoot);
      const skillIds = Object.keys(context.manifest.skills || {});

      expect(skillIds.length).toBeGreaterThan(0);
      // Should have at least one L1 skill and one L2 skill
      const l1Skills = skillIds.filter(
        (id) => context.manifest.skills[id].authorization_required_level === 1
      );
      const l2Skills = skillIds.filter(
        (id) => context.manifest.skills[id].authorization_required_level === 2
      );

      expect(l1Skills.length).toBeGreaterThan(0);
      expect(l2Skills.length).toBeGreaterThan(0);
    });

    test("settings contains all required authorization levels", async () => {
      const { getAgentAwareness } = require("../src/loaders/agent-awareness");
      const awareness = getAgentAwareness({ logger: { debug: () => {}, log: () => {} } });

      const context = await awareness.loadAgentContext(projectRoot);
      const authLevels = context.settings.authorization.levels;

      expect(authLevels).toHaveProperty("1");
      expect(authLevels).toHaveProperty("2");
      expect(authLevels).toHaveProperty("3");

      expect(authLevels["1"].name).toBe("Observer");
      expect(authLevels["2"].name).toBe("Executor");
      expect(authLevels["3"].name).toBe("Orchestrator");
    });
  });

  describe("DynamicConfigLoader Integration", () => {
    test("validates skill authorization based on manifest", async () => {
      const { getAgentAwareness } = require("../src/loaders/agent-awareness");
      const { DynamicConfigLoader } = require("../src/loaders/dynamic-config-loader");

      const awareness = getAgentAwareness({ logger: { debug: () => {}, log: () => {} } });
      const context = await awareness.loadAgentContext(projectRoot);
      const loader = new DynamicConfigLoader(context, { logger: { debug: () => {}, audit: () => {} } });

      // Find a L1 skill
      const l1SkillId = Object.keys(context.manifest.skills).find(
        (id) => context.manifest.skills[id].authorization_required_level === 1
      );

      // Find a L2 skill
      const l2SkillId = Object.keys(context.manifest.skills).find(
        (id) => context.manifest.skills[id].authorization_required_level === 2
      );

      if (l1SkillId) {
        // L1 agent should pass L1 skill check
        expect(() => loader.validateSkillAuthorization(l1SkillId, 1)).not.toThrow();
      }

      if (l2SkillId) {
        // L1 agent should fail L2 skill check
        expect(() => loader.validateSkillAuthorization(l2SkillId, 1)).toThrow();

        // L2 agent should pass L2 skill check
        expect(() => loader.validateSkillAuthorization(l2SkillId, 2)).not.toThrow();
      }

      // L3 agent should pass any skill check
      if (l2SkillId) {
        expect(() => loader.validateSkillAuthorization(l2SkillId, 3)).not.toThrow();
      }
    });

    test("enforces forbidden file path restrictions", async () => {
      const { getAgentAwareness } = require("../src/loaders/agent-awareness");
      const { DynamicConfigLoader } = require("../src/loaders/dynamic-config-loader");

      const awareness = getAgentAwareness({ logger: { debug: () => {}, log: () => {} } });
      const context = await awareness.loadAgentContext(projectRoot);
      const loader = new DynamicConfigLoader(context, { logger: { debug: () => {}, audit: () => {} } });

      // Should block .env files
      expect(() => loader.enforceFileReadConstraints(".env", 3)).toThrow();

      // Should block node_modules
      expect(() => loader.enforceFileReadConstraints("node_modules/pkg.js", 3)).toThrow();

      // Should allow normal project files
      expect(() => loader.enforceFileReadConstraints("src/index.js", 3)).not.toThrow();
    });
  });

  describe("AgentContextInjector Integration", () => {
    test("injects capabilities based on authorization level", async () => {
      const { getAgentAwareness } = require("../src/loaders/agent-awareness");
      const { AgentContextInjector } = require("../src/context/agent-context-injector");

      const awareness = getAgentAwareness({ logger: { debug: () => {}, log: () => {} } });
      const context = await awareness.loadAgentContext(projectRoot);
      const injector = new AgentContextInjector(context.manifest);

      const l1Context = injector.injectCapabilities({
        id: "observer",
        role: "Observer",
        authorization_level: 1,
      });

      expect(l1Context).toBeDefined();
      expect(l1Context.capabilities).toBeDefined();
      expect(Array.isArray(l1Context.capabilities.allowed_skills)).toBe(true);
      expect(l1Context.capabilities.allowed_skills.length).toBeGreaterThan(0);

      const l2Context = injector.injectCapabilities({
        id: "executor",
        role: "Executor",
        authorization_level: 2,
      });

      // L2 should have at least as many skills as L1
      expect(l2Context.capabilities.allowed_skills.length).toBeGreaterThanOrEqual(
        l1Context.capabilities.allowed_skills.length
      );
    });
  });

  describe("Memory ACL Integration", () => {
    test("enforces memory access control based on authorization", async () => {
      const { MemoryACL } = require("../src/memory/memory-acl");

      // L1 agent can read skill cache (pattern exists in DEFAULT_ACL)
      expect(() => MemoryACL.validate("read", "skill:test:cache:result", 1)).not.toThrow();

      // L1 agent cannot write skill cache (only R permission)
      expect(() => MemoryACL.validate("write", "skill:test:cache:result", 1)).toThrow();

      // L1 agent can read events
      expect(() => MemoryACL.validate("read", "event:test", 1)).not.toThrow();

      // L1 agent cannot write events
      expect(() => MemoryACL.validate("write", "event:test", 1)).toThrow();

      // L2 agent can read and write skill cache (RW permission)
      expect(() => MemoryACL.validate("read", "skill:test:cache:result", 2)).not.toThrow();
      expect(() => MemoryACL.validate("write", "skill:test:cache:result", 2)).not.toThrow();

      // L2 agent can read and write events
      expect(() => MemoryACL.validate("read", "event:test", 2)).not.toThrow();
      expect(() => MemoryACL.validate("write", "event:test", 2)).not.toThrow();

      // L3 agent has full access to everything (RWX)
      expect(() => MemoryACL.validate("read", "anything:test", 3)).not.toThrow();
      expect(() => MemoryACL.validate("write", "anything:test", 3)).not.toThrow();
      expect(() => MemoryACL.validate("delete", "anything:test", 3)).not.toThrow();
    });
  });

  describe("Template File Consistency", () => {
    test("template/.agents/manifest.json has startup_guide entry point", async () => {
      const templateManifestPath = path.join(__dirname, "..", "template", ".agents", "manifest.json");
      const content = await fsp.readFile(templateManifestPath, "utf8");
      const manifest = JSON.parse(content);

      expect(manifest.entry_points).toHaveProperty("startup_guide");
      expect(manifest.entry_points["startup_guide"]).toBe(".agents/agent-startup.md");
      expect(manifest.entry_points).not.toHaveProperty("ai_agent_startup");
    });

    test("template/.agents/settings.json has forbidden_paths", async () => {
      const templateSettingsPath = path.join(__dirname, "..", "template", ".agents", "settings.json");
      const content = await fsp.readFile(templateSettingsPath, "utf8");
      const settings = JSON.parse(content);

      expect(settings.security).toHaveProperty("forbidden_paths");
      expect(Array.isArray(settings.security.forbidden_paths)).toBe(true);
      expect(settings.security.forbidden_paths.length).toBeGreaterThan(0);
    });
  });

  describe("Agent Runner Integration Verification", () => {
    test("agent-runner loads .agents context at startup", async () => {
      const agentRunnerPath = path.resolve(__dirname, "..", "src", "agent-runner.js");
      const content = fs.readFileSync(agentRunnerPath, "utf8");

      // Verify AgentAwareness is imported
      expect(content).toContain("getAgentAwareness");
      expect(content).toContain("loadAgentContext");

      // Verify DynamicConfigLoader is used
      expect(content).toContain("DynamicConfigLoader");
      expect(content).toContain("enforceSecurityConstraints");
      expect(content).toContain("validateSkillAuthorization");
    });

    test("agent-runner checks skill authorization before execution", async () => {
      const agentRunnerPath = path.resolve(__dirname, "..", "src", "agent-runner.js");
      const content = fs.readFileSync(agentRunnerPath, "utf8");

      // Should have canExecute check
      expect(content).toContain("canExecute");

      // Should have authorization level validation
      expect(content).toContain("authorization_level");
      expect(content).toContain("Authorization denied");
    });
  });

  describe("SecurityViolationError handling", () => {
    test("DynamicConfigLoader throws SecurityViolationError on forbidden file access", async () => {
      const { getAgentAwareness } = require("../src/loaders/agent-awareness");
      const { DynamicConfigLoader, SecurityViolationError } = require("../src/loaders/dynamic-config-loader");

      const awareness = getAgentAwareness({ logger: { debug: () => {}, log: () => {} } });
      const context = await awareness.loadAgentContext(projectRoot);
      const loader = new DynamicConfigLoader(context, { logger: { debug: () => {}, audit: () => {} } });

      let errorThrown = false;
      let errorCode = null;
      
      try {
        loader.enforceFileReadConstraints(".env", 3);
      } catch (err) {
        errorThrown = true;
        errorCode = err.code;
      }

      expect(errorThrown).toBe(true);
      expect(errorCode).toBeDefined();
    });
  });
});
