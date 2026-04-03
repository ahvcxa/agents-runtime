"use strict";
/**
 * src/loader/manifest-loader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads and validates .agents/manifest.json
 */

const fs   = require("fs");
const path = require("path");

const REQUIRED_KEYS = ["spec_version", "entry_points", "hooks", "skills"];

/**
 * Load and validate the agent manifest.
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {object} Parsed manifest object.
 * @throws {Error} If manifest is missing, unparseable, or invalid.
 */
function loadManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, ".agents", "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[manifest-loader] manifest.json not found at: ${manifestPath}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(`[manifest-loader] Failed to parse manifest.json: ${err.message}`);
  }

  const missing = REQUIRED_KEYS.filter((k) => manifest[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`[manifest-loader] manifest.json is missing required keys: ${missing.join(", ")}`);
  }

  // Resolve hook paths to absolute
  manifest.hooks = manifest.hooks.map((hook) => ({
    ...hook,
    absolutePath: path.resolve(projectRoot, hook.path),
  }));

  // Resolve skill paths to absolute
  manifest.skills = manifest.skills.map((skill) => ({
    ...skill,
    absolutePath: path.resolve(projectRoot, skill.path),
  }));

  manifest._projectRoot = projectRoot;
  return manifest;
}

module.exports = { loadManifest };
