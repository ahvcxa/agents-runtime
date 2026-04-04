"use strict";
/**
 * tests/compliance-validator.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for ComplianceValidator — all check methods in isolation.
 */

const { ComplianceValidator } = require("../src/mcp/validators/compliance-validator");

// Minimal runtime stub
function makeRuntime(extraHooks = [], extraSkills = {}) {
  return {
    listHooks: () => [...extraHooks],
    skillRegistry: {
      load: (skillId, level) => {
        if (extraSkills[skillId] === false) {
          throw new Error(`Skill '${skillId}' not authorized at level ${level}`);
        }
        return { id: skillId };
      },
    },
  };
}

const VALID_PARAMS = {
  agent_id:            "analyzer-01",
  authorization_level: 1,
  skill_set:           ["code-analysis"],
};

describe("ComplianceValidator", () => {
  describe("agent_id validation", () => {
    test("passes for valid agent id", () => {
      const v = new ComplianceValidator();
      const { lines } = v.validate({ ...VALID_PARAMS, runtime: makeRuntime() });
      expect(lines.some(l => l.includes("✅ Agent id format is valid"))).toBe(true);
    });

    test("fails for empty agent id", () => {
      const v = new ComplianceValidator();
      const { passed } = v.validate({
        ...VALID_PARAMS, agent_id: "", runtime: makeRuntime(),
      });
      expect(passed).toBe(false);
    });

    test("fails for id with uppercase letters", () => {
      const v = new ComplianceValidator();
      const { passed } = v.validate({
        ...VALID_PARAMS, agent_id: "MyAgent", runtime: makeRuntime(),
      });
      expect(passed).toBe(false);
    });

    test("passes for id with hyphens and numbers", () => {
      const v = new ComplianceValidator();
      const { passed } = v.validate({
        ...VALID_PARAMS, agent_id: "agent-01-test",
        runtime: makeRuntime(["pre-read", "pre-skill", "post-skill"]),
      });
      expect(passed).toBe(true);
    });
  });

  describe("authorization_level validation", () => {
    test("fails for level 0", () => {
      const v = new ComplianceValidator();
      const { passed } = v.validate({ ...VALID_PARAMS, authorization_level: 0, runtime: makeRuntime() });
      expect(passed).toBe(false);
    });

    test("fails for level 4", () => {
      const v = new ComplianceValidator();
      const { passed } = v.validate({ ...VALID_PARAMS, authorization_level: 4, runtime: makeRuntime() });
      expect(passed).toBe(false);
    });

    test("passes for levels 1, 2, 3", () => {
      const v = new ComplianceValidator();
      for (const level of [1, 2, 3]) {
        const { passed } = v.validate({
          ...VALID_PARAMS, authorization_level: level,
          runtime: makeRuntime(["pre-read", "pre-skill", "post-skill"]),
        });
        expect(passed).toBe(true);
      }
    });

    test("resolves correct role name in output", () => {
      const v = new ComplianceValidator();
      const { lines } = v.validate({ ...VALID_PARAMS, authorization_level: 2, runtime: makeRuntime() });
      expect(lines.some(l => l.includes("Executor"))).toBe(true);
    });
  });

  describe("skill_set validation", () => {
    test("fails for empty skill_set", () => {
      const v = new ComplianceValidator();
      const { passed } = v.validate({ ...VALID_PARAMS, skill_set: [], runtime: makeRuntime() });
      expect(passed).toBe(false);
    });

    test("fails when skill is not authorized", () => {
      const v = new ComplianceValidator();
      const { passed, lines } = v.validate({
        ...VALID_PARAMS,
        skill_set: ["restricted-skill"],
        runtime: makeRuntime([], { "restricted-skill": false }),
      });
      expect(passed).toBe(false);
      expect(lines.some(l => l.includes("❌") && l.includes("restricted-skill"))).toBe(true);
    });
  });

  describe("read_only policy", () => {
    test("level-1 agent is automatically read_only=true", () => {
      const v = new ComplianceValidator();
      const { lines } = v.validate({ ...VALID_PARAMS, authorization_level: 1, runtime: makeRuntime() });
      expect(lines.some(l => l.includes("read_only policy looks valid (true)"))).toBe(true);
    });
  });

  describe("required hooks", () => {
    test("fails when required hook is missing", () => {
      const v = new ComplianceValidator();
      const { passed, lines } = v.validate({
        ...VALID_PARAMS,
        runtime: makeRuntime([]),  // no hooks registered
      });
      expect(passed).toBe(false);
      expect(lines.some(l => l.includes("❌") && l.includes("pre-read"))).toBe(true);
    });

    test("passes when all required hooks are registered", () => {
      const v = new ComplianceValidator();
      const { lines } = v.validate({
        ...VALID_PARAMS,
        runtime: makeRuntime(["pre-read", "pre-skill", "post-skill"]),
      });
      expect(lines.some(l => l.includes("✅") && l.includes("pre-read"))).toBe(true);
      expect(lines.some(l => l.includes("✅") && l.includes("pre-skill"))).toBe(true);
      expect(lines.some(l => l.includes("✅") && l.includes("post-skill"))).toBe(true);
    });
  });

  describe("full compliance flow", () => {
    test("returns passed=true for fully valid config", () => {
      const v = new ComplianceValidator();
      const { passed } = v.validate({
        agent_id:            "analyzer-01",
        authorization_level: 1,
        skill_set:           ["code-analysis"],
        runtime:             makeRuntime(["pre-read", "pre-skill", "post-skill"]),
      });
      expect(passed).toBe(true);
    });

    test("final line reflects overall result", () => {
      const v = new ComplianceValidator();
      const { lines, passed } = v.validate({
        ...VALID_PARAMS,
        runtime: makeRuntime(["pre-read", "pre-skill", "post-skill"]),
      });
      const lastMeaningfulLine = lines.filter(l => l.trim()).pop();
      expect(lastMeaningfulLine).toContain(passed ? "passed" : "failed");
    });
  });
});
