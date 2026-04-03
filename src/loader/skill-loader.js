"use strict";
/**
 * src/loader/skill-loader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses SKILL.md files — extracts YAML frontmatter and markdown body.
 */

const fs      = require("fs");
const matter  = require("gray-matter");

/**
 * Load a SKILL.md file and parse its YAML frontmatter.
 * @param {string} skillMdPath - Absolute path to SKILL.md
 * @returns {{ frontmatter: object, content: string }}
 */
function loadSkillMd(skillMdPath) {
  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`[skill-loader] SKILL.md not found at: ${skillMdPath}`);
  }

  const raw = fs.readFileSync(skillMdPath, "utf8");
  const parsed = matter(raw);

  return {
    frontmatter: parsed.data ?? {},
    content:     parsed.content ?? "",
  };
}

/**
 * Validate that a skill frontmatter has the minimum required fields.
 * @param {object} frontmatter
 * @param {string} skillId
 */
function validateSkillFrontmatter(frontmatter, skillId) {
  const required = ["name", "version"];
  const missing = required.filter((k) => !frontmatter[k]);
  if (missing.length > 0) {
    throw new Error(
      `[skill-loader] SKILL.md for '${skillId}' is missing frontmatter fields: ${missing.join(", ")}`
    );
  }
}

module.exports = { loadSkillMd, validateSkillFrontmatter };
