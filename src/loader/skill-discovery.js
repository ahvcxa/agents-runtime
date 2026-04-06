"use strict";
/**
 * src/loader/skill-discovery.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous skill discovery system.
 * 
 * Scans .agents/ directory for SKILL.md files, parses frontmatter,
 * and returns comprehensive skill metadata.
 * 
 * Features:
 *   - Filesystem scanning with safety checks
 *   - YAML frontmatter parsing
 *   - Schema validation
 *   - Comprehensive error handling with detailed logging
 *   - Sorted results for deterministic behavior
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

/**
 * SkillDiscovery — Autonomous skill discovery engine
 */
class SkillDiscovery {
  constructor(options = {}) {
    this.scanPath = options.scanPath || ".agents";
    this.pattern = options.pattern || "SKILL.md";
    this.logger = options.logger || console;
  }

  /**
   * Discover all skills by scanning filesystem for SKILL.md files.
   * 
   * @param {string} projectRoot - Absolute or relative path to project root
   * @returns {Promise<Array>} Array of skill metadata objects
   * @throws {Error} If scan path doesn't exist or is inaccessible
   * 
   * Returns array of:
   * {
   *   id: string,
   *   version: string,
   *   path: string (relative to project root),
   *   authorization_required_level: number,
   *   bounded_context: string,
   *   read_only: boolean,
   *   aggregate_root?: string,
   *   handler?: string,
   *   description?: string,
   *   _errors?: Array (validation errors, if any)
   * }
   */
  async discoverSkills(projectRoot = ".") {
    const fullScanPath = path.resolve(projectRoot, this.scanPath);
    const skills = [];
    const errors = [];

    // Step 1: Validate scan path exists
    if (!fs.existsSync(fullScanPath)) {
      throw new Error(
        `[skill-discovery] Scan path does not exist: ${fullScanPath}`
      );
    }

    if (!fs.statSync(fullScanPath).isDirectory()) {
      throw new Error(
        `[skill-discovery] Scan path is not a directory: ${fullScanPath}`
      );
    }

    this.logger.log(`[skill-discovery] Scanning: ${fullScanPath}`);

    // Step 2: Recursively find all SKILL.md files
    const skillFiles = this._findSkillFiles(fullScanPath);
    this.logger.log(
      `[skill-discovery] Found ${skillFiles.length} SKILL.md file(s)`
    );

    // Step 3: Parse each SKILL.md file
    for (const skillPath of skillFiles) {
      try {
        const skill = this._parseSkillFile(skillPath, projectRoot);
        skills.push(skill);
      } catch (err) {
        errors.push({
          file: skillPath,
          error: err.message,
        });
        this.logger.warn(`[skill-discovery] Failed to parse ${skillPath}: ${err.message}`);
      }
    }

    // Step 4: Sort by skill ID for deterministic order
    skills.sort((a, b) => a.id.localeCompare(b.id));

    // Step 5: Log summary
    if (errors.length > 0) {
      this.logger.warn(
        `[skill-discovery] ${errors.length} error(s) encountered during discovery`
      );
    }

    this.logger.log(
      `[skill-discovery] Successfully discovered ${skills.length} skill(s)`
    );

    return {
      skills,
      errors,
      discovered_at: new Date().toISOString(),
    };
  }

  /**
   * Compare discovered skills with manifest.json skills.
   * 
   * @param {Array} manifestSkills - Skills array from manifest.json
   * @param {Array} discoveredSkills - Skills array from discovery
   * @returns {Object} Comparison result with categories
   */
  compareWithManifest(manifestSkills = [], discoveredSkills = []) {
    const manifestIds = new Set(manifestSkills.map(s => s.id));
    const discoveredIds = new Set(discoveredSkills.map(s => s.id));

    const inBoth = discoveredSkills.filter(s => manifestIds.has(s.id));
    const onlyInDiscovered = discoveredSkills.filter(s => !manifestIds.has(s.id));
    const onlyInManifest = manifestSkills.filter(s => !discoveredIds.has(s.id));

    return {
      in_both: inBoth,
      only_discovered: onlyInDiscovered,
      only_manifest: onlyInManifest,
      summary: {
        total_discovered: discoveredSkills.length,
        total_in_manifest: manifestSkills.length,
        unregistered_count: onlyInDiscovered.length,
        orphaned_count: onlyInManifest.length,
      },
    };
  }

  /**
   * Private: Recursively find all SKILL.md files
   */
  _findSkillFiles(dirPath, results = []) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip hidden directories and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      if (entry.isDirectory()) {
        this._findSkillFiles(fullPath, results);
      } else if (entry.name === this.pattern) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /**
   * Private: Parse a single SKILL.md file
   */
  _parseSkillFile(skillPath, projectRoot) {
    // Read and parse YAML frontmatter
    const raw = fs.readFileSync(skillPath, "utf8");
    const parsed = matter(raw);
    const frontmatter = parsed.data ?? {};

    // Infer skill ID from directory name if not in frontmatter
    const skillDir = path.dirname(skillPath);
    const skillId = frontmatter.id || path.basename(skillDir);

    // Validate required fields
    const validationErrors = this._validateFrontmatter(frontmatter, skillId);

    // Build skill metadata object
    const skill = {
      id: skillId,
      version: frontmatter.version || "0.0.0",
      path: path.relative(projectRoot, skillPath),
      authorization_required_level: frontmatter.authorization_required_level ?? 0,
      bounded_context: frontmatter.bounded_context || "Unknown",
      read_only: frontmatter.read_only ?? true,
    };

    // Optional fields
    if (frontmatter.aggregate_root) {
      skill.aggregate_root = frontmatter.aggregate_root;
    }
    if (frontmatter.handler) {
      skill.handler = frontmatter.handler;
    }
    if (frontmatter.description) {
      skill.description = frontmatter.description;
    }
    if (frontmatter.output_event) {
      skill.output_event = frontmatter.output_event;
    }

    // Attach validation errors if any
    if (validationErrors.length > 0) {
      skill._errors = validationErrors;
    }

    return skill;
  }

  /**
   * Private: Validate frontmatter against schema
   */
  _validateFrontmatter(frontmatter, skillId) {
    const errors = [];

    if (!frontmatter.version) {
      errors.push(`Missing required field: 'version'`);
    }

    if (!frontmatter.bounded_context) {
      errors.push(`Missing recommended field: 'bounded_context'`);
    }

    if (typeof frontmatter.authorization_required_level !== "number") {
      errors.push(
        `Invalid 'authorization_required_level': must be a number (0-3)`
      );
    }

    return errors;
  }

  /**
   * Format discovered skills for display in setup wizard
   */
  formatForDisplay(skills) {
    return skills.map(skill => ({
      id: skill.id,
      version: skill.version,
      context: skill.bounded_context,
      readOnly: skill.read_only,
      authLevel: skill.authorization_required_level,
      description: skill.description || "(no description)",
    }));
  }
}

module.exports = SkillDiscovery;
