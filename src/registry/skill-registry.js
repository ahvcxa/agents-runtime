"use strict";
/**
 * src/registry/skill-registry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Indexes skills from manifest.json. Lazily loads SKILL.md frontmatter.
 */

const path = require("path");
const fs   = require("fs");
const { loadSkillMd, validateSkillFrontmatter } = require("../loader/skill-loader");

class SkillRegistry {
  /**
   * @param {object[]} skillDefs - manifest.json#skills (with absolutePath resolved)
   * @param {object} settings
   * @param {object} logger
   */
  constructor(skillDefs, settings, logger) {
    this.settings = settings;
    this.logger   = logger;
    this._index   = new Map(); // skill_id → { def, frontmatter?, content? }

    for (const def of skillDefs ?? []) {
      this._index.set(def.id, { def, loaded: false });
    }

    // Auto-discover additional skills from filesystem if enabled
    if (settings?.skills?.auto_discover) {
      this._autoDiscover(settings._projectRoot);
    }
  }

  /** Auto-discover SKILL.md files not already in manifest */
  _autoDiscover(projectRoot) {
    if (!projectRoot) return;
    const registryPath = path.join(projectRoot, ".agents", "skills");
    if (!fs.existsSync(registryPath)) return;

    const dirs = fs.readdirSync(registryPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const skillDir of dirs) {
      if (this._index.has(skillDir)) continue; // already registered via manifest
      
      // Validate skill directory name (CWE-22: Path Traversal prevention)
      if (!skillDir.match(/^[a-z0-9][a-z0-9_-]*$/i)) {
        this.logger?.warn({ event_type: "WARN", message: `Invalid skill directory name: '${skillDir}' (skipped)` });
        continue;
      }
      
      // Check for path traversal attacks
      const skillMdPath = path.join(registryPath, skillDir, "SKILL.md");
      const resolved = path.resolve(skillMdPath);
      const base = path.resolve(registryPath);
      if (!resolved.startsWith(base)) {
        this.logger?.warn({ event_type: "WARN", message: `Path traversal detected in skill directory: '${skillDir}' (skipped)` });
        continue;
      }
      
      if (fs.existsSync(skillMdPath)) {
        this._index.set(skillDir, {
          def: {
            id:           skillDir,
            path:         path.join(".agents", "skills", skillDir, "SKILL.md"),
            absolutePath: skillMdPath,
            version:      "unknown",
            read_only:    true,
          },
          loaded: false,
        });
        this.logger?.info({ event_type: "INFO", message: `Auto-discovered skill: '${skillDir}'` });
      }
    }
  }

  /**
   * Get a skill by ID. Lazily loads the SKILL.md if not already loaded.
   * @param {string} skillId
   * @returns {object|null}
   */
  getSkill(skillId) {
    const record = this._index.get(skillId);
    if (!record) return null;

    if (!record.loaded) {
      try {
        const { frontmatter, content } = loadSkillMd(record.def.absolutePath);
        validateSkillFrontmatter(frontmatter, skillId);
        record.frontmatter = { ...record.def, ...frontmatter }; // merge manifest def + SKILL.md frontmatter
        record.content     = content;
        record.loaded      = true;
        this.logger?.info({ event_type: "INFO", message: `Loaded SKILL.md for '${skillId}'` });
      } catch (err) {
        this.logger?.error({ event_type: "ERROR", message: err.message });
        return null;
      }
    }

    return { ...record.frontmatter, content: record.content };
  }

  /**
   * List all registered skills (without loading SKILL.md).
   * @returns {object[]}
   */
  listSkills() {
    return [...this._index.entries()].map(([id, rec]) => ({
      id,
      path:      rec.def.path,
      version:   rec.def.version ?? "unknown",
      read_only: rec.def.read_only ?? true,
      loaded:    rec.loaded,
      bounded_context:          rec.def.bounded_context,
      authorization_required_level: rec.def.authorization_required_level ?? 1,
    }));
  }

  /** Check if an agent's auth level satisfies a skill's requirement */
  canExecute(skillId, authLevel) {
    const record = this._index.get(skillId);
    if (!record) return false;
    const required = record.def.authorization_required_level ?? 1;
    return authLevel >= required;
  }

  /**
   * Load and authorize a skill in one call.
   * @param {string} skillId
   * @param {number} authLevel
   * @returns {object}
   */
  load(skillId, authLevel) {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill '${skillId}' is not registered`);
    }
    if (!this.canExecute(skillId, authLevel)) {
      const required = skill.authorization_required_level ?? 1;
      throw new Error(`Skill '${skillId}' requires authorization level ${required}`);
    }
    return skill;
  }
}

module.exports = { SkillRegistry };
