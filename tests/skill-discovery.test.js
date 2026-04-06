"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const SkillDiscovery = require("../src/loader/skill-discovery");

/**
 * Create a temporary project structure for testing
 */
function mkTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-discovery-test-"));
  const agentsDir = path.join(root, ".agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  return { root, agentsDir };
}

/**
 * Create a test SKILL.md file with frontmatter
 */
function createTestSkill(skillDir, skillId, metadata = {}) {
  fs.mkdirSync(skillDir, { recursive: true });
  
  const defaults = {
    id: skillId,
    version: "1.0.0",
    authorization_required_level: 0,
    bounded_context: "Test",
    read_only: true,
  };
  
  const frontmatter = { ...defaults, ...metadata };
  const yamlLines = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (typeof v === "boolean") return `${k}: ${v}`;
      if (typeof v === "number") return `${k}: ${v}`;
      return `${k}: "${v}"`;
    })
    .join("\n");
  
  const skillMd = `---
${yamlLines}
---

# SKILL: ${skillId}

Test skill description.
`;
  
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd, "utf8");
}

describe("SkillDiscovery", () => {
  describe("discoverSkills()", () => {
    test("discovers a single skill", async () => {
      const { root, agentsDir } = mkTempProject();
      createTestSkill(path.join(agentsDir, "test-skill"), "test-skill");
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const result = await discovery.discoverSkills(root);
      
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].id).toBe("test-skill");
      expect(result.skills[0].version).toBe("1.0.0");
      expect(result.errors).toHaveLength(0);
    });

    test("discovers multiple skills", async () => {
      const { root, agentsDir } = mkTempProject();
      createTestSkill(path.join(agentsDir, "skill-1"), "skill-1");
      createTestSkill(path.join(agentsDir, "skill-2"), "skill-2");
      createTestSkill(path.join(agentsDir, "skill-3"), "skill-3");
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const result = await discovery.discoverSkills(root);
      
      expect(result.skills).toHaveLength(3);
      expect(result.skills.map(s => s.id).sort()).toEqual(["skill-1", "skill-2", "skill-3"]);
    });

    test("returns empty array when no skills found", async () => {
      const { root } = mkTempProject();
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const result = await discovery.discoverSkills(root);
      
      expect(result.skills).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    test("parses optional fields correctly", async () => {
      const { root, agentsDir } = mkTempProject();
      createTestSkill(path.join(agentsDir, "full-skill"), "full-skill", {
        description: "A comprehensive skill",
        bounded_context: "Analysis",
        authorization_required_level: 2,
        read_only: false,
        handler: ".agents/full-skill/handler.js",
        aggregate_root: "Finding",
        output_event: "AnalysisCompleted"
      });
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const result = await discovery.discoverSkills(root);
      const skill = result.skills[0];
      
      expect(skill.description).toBe("A comprehensive skill");
      expect(skill.bounded_context).toBe("Analysis");
      expect(skill.authorization_required_level).toBe(2);
      expect(skill.read_only).toBe(false);
      expect(skill.handler).toBe(".agents/full-skill/handler.js");
      expect(skill.aggregate_root).toBe("Finding");
      expect(skill.output_event).toBe("AnalysisCompleted");
    });

    test("logs validation errors for malformed SKILL.md", async () => {
      const { root, agentsDir } = mkTempProject();
      const skillDir = path.join(agentsDir, "bad-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      
      // Write SKILL.md without version field
      const badSkillMd = `---
id: bad-skill
bounded_context: Test
---

# Bad Skill
`;
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), badSkillMd, "utf8");
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const result = await discovery.discoverSkills(root);
      
      // Should still find the skill but with errors
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]._errors).toBeDefined();
      expect(result.skills[0]._errors.some(e => e.includes("version"))).toBe(true);
    });

    test("skips hidden and node_modules directories", async () => {
      const { root, agentsDir } = mkTempProject();
      
      // Create skill in normal directory
      createTestSkill(path.join(agentsDir, "normal-skill"), "normal-skill");
      
      // Create skill in hidden directory (should be skipped)
      createTestSkill(path.join(agentsDir, ".hidden-skill"), "hidden-skill");
      
      // Create skill in node_modules (should be skipped)
      createTestSkill(path.join(agentsDir, "node_modules", "npm-skill"), "npm-skill");
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const result = await discovery.discoverSkills(root);
      
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].id).toBe("normal-skill");
    });

    test("throws when scan path doesn't exist", async () => {
      const discovery = new SkillDiscovery({
        scanPath: "/nonexistent/path",
        logger: { log: () => {}, warn: () => {} }
      });
      
      await expect(discovery.discoverSkills(".")).rejects.toThrow(
        "Scan path does not exist"
      );
    });

    test("returns discovered_at timestamp", async () => {
      const { root } = mkTempProject();
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const result = await discovery.discoverSkills(root);
      
      expect(result.discovered_at).toBeDefined();
      expect(new Date(result.discovered_at).getTime()).toBeGreaterThan(0);
    });
  });

  describe("compareWithManifest()", () => {
    test("identifies skills in both manifest and discovered", () => {
      const discovered = [
        { id: "skill-1", version: "1.0.0" },
        { id: "skill-2", version: "1.0.0" },
        { id: "skill-3", version: "1.0.0" },
      ];
      
      const manifest = [
        { id: "skill-1" },
        { id: "skill-2" },
        { id: "skill-4" },
      ];
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const comparison = discovery.compareWithManifest(manifest, discovered);
      
      expect(comparison.in_both).toHaveLength(2);
      expect(comparison.in_both.map(s => s.id).sort()).toEqual(["skill-1", "skill-2"]);
    });

    test("identifies unregistered skills (only in discovered)", () => {
      const discovered = [
        { id: "skill-1", version: "1.0.0" },
        { id: "skill-new", version: "1.0.0" },
      ];
      
      const manifest = [
        { id: "skill-1" },
      ];
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const comparison = discovery.compareWithManifest(manifest, discovered);
      
      expect(comparison.only_discovered).toHaveLength(1);
      expect(comparison.only_discovered[0].id).toBe("skill-new");
    });

    test("identifies orphaned skills (only in manifest)", () => {
      const discovered = [
        { id: "skill-1", version: "1.0.0" },
      ];
      
      const manifest = [
        { id: "skill-1" },
        { id: "skill-deleted" },
      ];
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const comparison = discovery.compareWithManifest(manifest, discovered);
      
      expect(comparison.only_manifest).toHaveLength(1);
      expect(comparison.only_manifest[0].id).toBe("skill-deleted");
    });

    test("provides accurate summary counts", () => {
      const discovered = [
        { id: "a", version: "1.0.0" },
        { id: "b", version: "1.0.0" },
        { id: "c", version: "1.0.0" },
      ];
      
      const manifest = [
        { id: "a" },
        { id: "d" },
      ];
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const comparison = discovery.compareWithManifest(manifest, discovered);
      
      expect(comparison.summary.total_discovered).toBe(3);
      expect(comparison.summary.total_in_manifest).toBe(2);
      expect(comparison.summary.unregistered_count).toBe(2);
      expect(comparison.summary.orphaned_count).toBe(1);
    });
  });

  describe("formatForDisplay()", () => {
    test("formats skills for CLI display", () => {
      const skills = [
        {
          id: "code-analysis",
          version: "1.2.0",
          bounded_context: "Analysis",
          read_only: true,
          authorization_required_level: 1,
          description: "Static code analysis"
        }
      ];
      
      const discovery = new SkillDiscovery({
        logger: { log: () => {}, warn: () => {} }
      });
      
      const formatted = discovery.formatForDisplay(skills);
      
      expect(formatted).toHaveLength(1);
      expect(formatted[0]).toEqual({
        id: "code-analysis",
        version: "1.2.0",
        context: "Analysis",
        readOnly: true,
        authLevel: 1,
        description: "Static code analysis"
      });
    });
  });
});
