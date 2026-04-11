"use strict";
/**
 * Changelog generator
 * Creates CHANGELOG.md from git history
 */

function generateChangelog(gitHistory = []) {
  if (!gitHistory || gitHistory.length === 0) {
    return "";
  }

  let changelog = `# Changelog\n\n`;
  changelog += `All notable changes to this project will be documented in this file.\n\n`;

  // Group by version
  const versions = {};
  for (const commit of gitHistory) {
    const version = commit.version || "Unreleased";
    if (!versions[version]) {
      versions[version] = [];
    }
    versions[version].push(commit);
  }

  // Generate entries
  for (const [version, commits] of Object.entries(versions)) {
    changelog += `## [${version}]\n\n`;

    // Group by type
    const added = commits.filter(c => c.type === "feat");
    const fixed = commits.filter(c => c.type === "fix");
    const changed = commits.filter(c => c.type === "refactor");

    if (added.length > 0) {
      changelog += `### Added\n`;
      for (const commit of added) {
        changelog += `- ${commit.message}\n`;
      }
      changelog += "\n";
    }

    if (fixed.length > 0) {
      changelog += `### Fixed\n`;
      for (const commit of fixed) {
        changelog += `- ${commit.message}\n`;
      }
      changelog += "\n";
    }

    if (changed.length > 0) {
      changelog += `### Changed\n`;
      for (const commit of changed) {
        changelog += `- ${commit.message}\n`;
      }
      changelog += "\n";
    }
  }

  return changelog;
}

module.exports = { generateChangelog };
