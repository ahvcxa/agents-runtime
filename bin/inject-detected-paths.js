#!/usr/bin/env node
"use strict";
/**
 * bin/inject-detected-paths.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Injects auto-detected source paths into agent.yaml
 * Preserves all other configuration while updating read_paths
 *
 * Usage:
 *   node bin/inject-detected-paths.js /path/to/agent.yaml '["src/", "lib/"]'
 */

const fs = require("fs");
const path = require("path");

function loadYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const result = { agent: {} };
    let inAgent = false;
    let readPathsStart = -1;
    let readPathsEnd = -1;
    let currentIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if we're entering the agent: block
      if (line.match(/^agent:\s*$/)) {
        inAgent = true;
        currentIndent = 0;
        continue;
      }

      if (!inAgent) continue;

      // Check if we're leaving the agent block
      if (inAgent && line.match(/^\S/) && !line.match(/^agent:/)) {
        inAgent = false;
        break;
      }

      // Parse key-value pairs
      const kvMatch = line.match(/^\s*(\w+):\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        const value = kvMatch[2].trim();

        // Skip read_paths, we'll inject it later
        if (key === "read_paths") {
          readPathsStart = i;
          // Find where read_paths ends
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].match(/^\s*-\s/) || lines[j].match(/^\s+"/)) {
              readPathsEnd = j;
            } else if (lines[j].match(/^\s+\w+:/) || lines[j].match(/^\S/)) {
              break;
            }
          }
          continue;
        }

        // Parse YAML values
        if (value === "true") {
          result.agent[key] = true;
        } else if (value === "false") {
          result.agent[key] = false;
        } else if (value.match(/^\d+$/)) {
          result.agent[key] = parseInt(value, 10);
        } else if (value.startsWith("[")) {
          // Parse inline array
          try {
            result.agent[key] = JSON.parse(value);
          } catch (e) {
            result.agent[key] = value.replace(/^["']|["']$/g, "");
          }
        } else {
          result.agent[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    }

    return { agent: result.agent, readPathsRange: [readPathsStart, readPathsEnd] };
  } catch (e) {
    console.error(`Error parsing YAML: ${e.message}`);
    return null;
  }
}

function buildYaml(agent, detectedPaths) {
  let yaml = "# ─────────────────────────────────────────────────────────────\n";
  yaml += "# Auto-generated agent configuration\n";
  yaml += "# Generated: " + new Date().toISOString() + "\n";
  yaml += "# ─────────────────────────────────────────────────────────────\n";
  yaml += "agent:\n";

  // Write agent properties in order
  const keyOrder = ["id", "role", "skill_set", "authorization_level", "read_only", "read_paths"];
  const written = new Set();

  for (const key of keyOrder) {
    if (!(key in agent)) continue;
    written.add(key);

    if (key === "skill_set") {
      yaml += `  skill_set:\n`;
      const skills = Array.isArray(agent[key]) ? agent[key] : [agent[key]];
      for (const skill of skills) {
        yaml += `    - "${skill}"\n`;
      }
    } else if (key === "read_paths") {
      yaml += `  read_paths:\n`;
      for (const readPath of detectedPaths) {
        yaml += `    - "${readPath}"\n`;
      }
    } else {
      const value = agent[key];
      if (typeof value === "boolean") {
        yaml += `  ${key}: ${value}\n`;
      } else if (typeof value === "number") {
        yaml += `  ${key}: ${value}\n`;
      } else {
        yaml += `  ${key}: "${value}"\n`;
      }
    }
  }

  // Write any remaining keys not in keyOrder
  for (const [key, value] of Object.entries(agent)) {
    if (written.has(key)) continue;

    if (typeof value === "boolean") {
      yaml += `  ${key}: ${value}\n`;
    } else if (typeof value === "number") {
      yaml += `  ${key}: ${value}\n`;
    } else {
      yaml += `  ${key}: "${value}"\n`;
    }
  }

  return yaml;
}

// Main
if (require.main === module) {
  const agentYamlPath = process.argv[2];
  const detectedPathsJson = process.argv[3];

  if (!agentYamlPath || !detectedPathsJson) {
    console.error("Usage: node inject-detected-paths.js <agent.yaml> '<json-paths>'");
    console.error("Example: node inject-detected-paths.js agent.yaml '[\"src/\", \"lib/\"]'");
    process.exit(1);
  }

  if (!fs.existsSync(agentYamlPath)) {
    console.error(`Error: agent.yaml not found: ${agentYamlPath}`);
    process.exit(1);
  }

  let detectedPaths;
  try {
    detectedPaths = JSON.parse(detectedPathsJson);
    if (!Array.isArray(detectedPaths)) {
      throw new Error("Paths must be an array");
    }
  } catch (e) {
    console.error(`Error parsing paths JSON: ${e.message}`);
    process.exit(1);
  }

  // Load and parse YAML
  const parsed = loadYaml(agentYamlPath);
  if (!parsed) {
    console.error("Failed to parse agent.yaml");
    process.exit(1);
  }

  // Build new YAML with detected paths
  const newYaml = buildYaml(parsed.agent, detectedPaths);

  // Write back
  try {
    fs.writeFileSync(agentYamlPath, newYaml, "utf8");
    console.log(`✓ Updated ${agentYamlPath} with ${detectedPaths.length} detected path(s)`);
    console.log(`  Paths: ${detectedPaths.join(", ")}`);
    process.exit(0);
  } catch (e) {
    console.error(`Error writing agent.yaml: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { loadYaml, buildYaml };
