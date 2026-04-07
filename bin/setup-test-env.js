#!/usr/bin/env node
'use strict';

/**
 * setup-test-env.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Initialize .agents directory from template for testing.
 * This is run during `npm install` (postinstall hook).
 *
 * On CI (shallow clones), .agents/ won't exist because it's in .gitignore.
 * Tests need .agents/security-audit/, .agents/code-analysis/, etc.
 *
 * Solution: Copy template/.agents to .agents so tests can find modules.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, '.agents');
const TEMPLATE_AGENTS = path.join(ROOT, 'template', '.agents');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Main: Setup .agents
try {
  if (!fs.existsSync(AGENTS_DIR)) {
    if (!fs.existsSync(TEMPLATE_AGENTS)) {
      console.error('[setup-test-env] ✗ template/.agents not found');
      process.exit(0); // Don't fail, just warn
    }

    // Copy template/.agents to .agents
    copyDirRecursive(TEMPLATE_AGENTS, AGENTS_DIR);
    console.log('[setup-test-env] ✓ Created .agents from template');
  } else {
    // .agents exists (local development)
    // Do nothing - preserve local state
  }
  
  // Copy settings.json if it doesn't exist
  const settingsFile = path.join(AGENTS_DIR, 'settings.json');
  const templateSettings = path.join(ROOT, 'template', 'settings.json');
  if (!fs.existsSync(settingsFile) && fs.existsSync(templateSettings)) {
    fs.copyFileSync(templateSettings, settingsFile);
    console.log('[setup-test-env] ✓ Copied settings.json to .agents');
  }
  
  // Copy other required subdirectories from template (hooks, helpers, memory-system)
  const subdirs = ['hooks', 'helpers', 'memory-system'];
  for (const subdir of subdirs) {
    const templateSubdir = path.join(ROOT, 'template', subdir);
    const agentSubdir = path.join(AGENTS_DIR, subdir);
    if (fs.existsSync(templateSubdir) && !fs.existsSync(agentSubdir)) {
      copyDirRecursive(templateSubdir, agentSubdir);
      console.log(`[setup-test-env] ✓ Copied ${subdir} to .agents`);
    }
  }
} catch (err) {
  console.error('[setup-test-env] ✗ Error:', err.message);
  // Don't fail postinstall - tests can handle it
  process.exit(0);
}
