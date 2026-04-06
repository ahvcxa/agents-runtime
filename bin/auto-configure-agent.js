#!/usr/bin/env node
"use strict";
/**
 * bin/auto-configure-agent.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatically configures agent.yaml based on detected project structure.
 * This runs after setup creates agent.yaml from a template.
 *
 * Usage:
 *   node bin/auto-configure-agent.js /path/to/agent.yaml /project/root
 */

const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// Path Detection
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"]);
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".agents",
  "dist",
  "build",
  ".next",
  "out",
  ".turbo",
  ".vuepress",
  "coverage",
  ".nyc_output",
  "venv",
  "__pycache__",
  ".env",
  ".env.local",
  ".DS_Store",
  ".idea",
  ".vscode",
]);

function isSourceFile(filePath) {
  return SUPPORTED_EXTS.has(path.extname(filePath).toLowerCase());
}

function dirContainsSourceFiles(dirPath, depth = 2) {
  if (!fs.existsSync(dirPath)) return false;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (EXCLUDED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && isSourceFile(fullPath)) {
        return true;
      }

      if (entry.isDirectory() && depth > 0) {
        if (dirContainsSourceFiles(fullPath, depth - 1)) {
          return true;
        }
      }
    }
  } catch (e) {
    return false;
  }

  return false;
}

function detectSourceDirs(projectRoot) {
  const detected = [];

  // Check src/* subdirectories (for fullstack projects like GesturesFast)
  const srcPath = path.join(projectRoot, "src");
  if (fs.existsSync(srcPath)) {
    try {
      const entries = fs.readdirSync(srcPath, { withFileTypes: true });
      let srcHasFiles = false;

      for (const entry of entries) {
        if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(entry.name)) continue;

        if (entry.isDirectory()) {
          const subDirPath = path.join(srcPath, entry.name);
          if (dirContainsSourceFiles(subDirPath)) {
            detected.push(`src/${entry.name}/`);
          }
        } else if (entry.isFile() && isSourceFile(path.join(srcPath, entry.name))) {
          srcHasFiles = true;
        }
      }

      if (srcHasFiles && detected.length === 0) {
        detected.push("src/");
      }
    } catch (e) {
      // Ignore
    }
  }

  // Check common source directory patterns (only if no src/ found)
  if (detected.length === 0) {
    const patterns = ["lib", "source", "app", "components", "pages", "scripts", "server", "client"];

    for (const pattern of patterns) {
      const dirPath = path.join(projectRoot, pattern);
      if (dirContainsSourceFiles(dirPath)) {
        detected.push(pattern + "/");
      }
    }
  }

  // Check root level files
  if (detected.length === 0) {
    const rootFiles = ["index.js", "index.ts", "app.js", "app.ts", "main.js", "main.ts"];
    for (const file of rootFiles) {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath) && isSourceFile(filePath)) {
        detected.push(file);
        break;
      }
    }
  }

  // Always include package.json if not already there
  const pkgPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(pkgPath) && !detected.includes("package.json")) {
    detected.push("package.json");
  }

  // Remove duplicates and sort
  const unique = [...new Set(detected)].sort();

  return unique;
}

// ─────────────────────────────────────────────────────────────────────────────
// YAML Parsing & Building
// ─────────────────────────────────────────────────────────────────────────────

function parseYaml(content) {
  const lines = content.split("\n");
  const agent = {};
  let inAgent = false;
  let arrayKey = null;
  let arrayIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.match(/^agent:\s*$/)) {
      inAgent = true;
      continue;
    }

    if (!inAgent) continue;

    // Exit agent block
    if (inAgent && line.match(/^\S/) && !line.match(/^agent:/)) {
      break;
    }

    // Detect array items (lines starting with -)
    const arrayMatch = line.match(/^\s*-\s+(.+)$/);
    if (arrayMatch && arrayKey) {
      const value = arrayMatch[1].trim().replace(/^["']|["']$/g, "");
      if (!agent[arrayKey]) agent[arrayKey] = [];
      agent[arrayKey].push(value);
      continue;
    }

    // Parse key: value pairs
    const kvMatch = line.match(/^\s*(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();

      // Array declaration (key: followed by items on next lines)
      if (value === "" || value.startsWith("[")) {
        arrayKey = key;
        if (value.startsWith("[")) {
          // Inline array
          try {
            agent[key] = JSON.parse(value);
          } catch (e) {
            agent[key] = [];
          }
          arrayKey = null;
        } else {
          agent[key] = [];
        }
        continue;
      }

      arrayKey = null;

      // Skip read_paths (we'll rebuild it)
      if (key === "read_paths") continue;

      // Parse value type
      if (value === "true") {
        agent[key] = true;
      } else if (value === "false") {
        agent[key] = false;
      } else if (value.match(/^\d+$/)) {
        agent[key] = parseInt(value, 10);
      } else {
        agent[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  return agent;
}

function buildYaml(agent, detectedPaths) {
  const keyOrder = ["id", "role", "skill_set", "authorization_level", "read_only", "read_paths"];
  const written = new Set();

  let yaml = "# ─────────────────────────────────────────────────────────────\n";
  yaml += "# Auto-configured agent (project paths detected automatically)\n";
  yaml += "# Generated: " + new Date().toISOString() + "\n";
  yaml += "# ─────────────────────────────────────────────────────────────\n";
  yaml += "agent:\n";

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

  // Remaining keys
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

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const agentYamlPath = process.argv[2];
const projectRoot = process.argv[3];

if (!agentYamlPath || !projectRoot) {
  console.error("Usage: node auto-configure-agent.js <agent.yaml> <project-root>");
  process.exit(1);
}

if (!fs.existsSync(agentYamlPath)) {
  console.error(`Error: agent.yaml not found at ${agentYamlPath}`);
  process.exit(1);
}

if (!fs.existsSync(projectRoot)) {
  console.error(`Error: Project root not found at ${projectRoot}`);
  process.exit(1);
}

try {
  // Read current agent.yaml
  const content = fs.readFileSync(agentYamlPath, "utf8");
  const agent = parseYaml(content);

  // Detect paths
  const detectedPaths = detectSourceDirs(projectRoot);

  if (detectedPaths.length === 0) {
    // No paths detected, keep template defaults
    process.exit(0);
  }

  // Build new YAML with detected paths
  const newYaml = buildYaml(agent, detectedPaths);

  // Write back
  fs.writeFileSync(agentYamlPath, newYaml, "utf8");
  console.log(`  ${detectedPaths.length} source path(s) detected and configured`);
  process.exit(0);
} catch (e) {
  // Silently fail - don't break setup
  process.exit(0);
}
