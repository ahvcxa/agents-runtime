"use strict";
/**
 * .agents/memory-system/cli/commands.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Command handlers for /learn and /memory-* slash commands
 *
 * Exported: Command handler functions
 */

const { ProjectMemoryStore } = require("../core/project-memory-store");
const path = require("path");

/**
 * /learn command handler
 * Performs full or incremental scan of project
 */
async function handleLearn(options = {}) {
  const {
    projectRoot = process.cwd(),
    refresh = false,
    force = false,
    verbose = false,
    languages = null,
  } = options;

  try {
    const store = new ProjectMemoryStore(projectRoot);

    let memory;

    if (force || !refresh) {
      // Full scan
      if (verbose) console.log("[/learn] Starting full project scan...");
      memory = await store.scan({ languages });
      console.log(`✓ Memory scan completed in ${memory.metadata.scan_duration_ms}ms`);
    } else {
      // Incremental refresh
      if (verbose) console.log("[/learn] Starting incremental update...");
      memory = await store.incrementalUpdate();
      console.log(`✓ Memory updated in ${memory.metadata.scan_duration_ms}ms`);
    }

    // Summary output
    console.log("\n📊 Memory Summary:");
    console.log(`   Languages: ${memory.metadata.languages_detected.join(", ")}`);
    console.log(`   Total files: ${memory.structure.total_files || 0}`);
    console.log(`   Total lines: ${memory.structure.total_lines || 0}`);
    console.log(`   Last scan: ${new Date(memory.metadata.scan_date).toLocaleString()}`);

    return {
      success: true,
      memory,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`✗ /learn failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * /memory-stats command handler
 * Shows memory statistics
 */
async function handleMemoryStats(options = {}) {
  const { projectRoot = process.cwd(), language = null } = options;

  try {
    const store = new ProjectMemoryStore(projectRoot);
    const stats = store.getStats();

    if (!stats) {
      console.log("⚠ No memory found. Run '/learn' first.");
      return { success: false, error: "Memory not found" };
    }

    if (language) {
      // Language-specific stats
      const memory = store.loadMemory();
      if (!memory || !memory.structure.by_language[language]) {
        console.log(`⚠ No data for language: ${language}`);
        return { success: false };
      }

      const langFiles = memory.structure.by_language[language];
      console.log(`\n📊 ${language.toUpperCase()} Statistics:`);
      console.log(`   Files: ${langFiles.length}`);
      console.log(
        `   Total LOC: ${langFiles.reduce((sum, f) => sum + (f.loc || 0), 0)}`
      );
      console.log(
        `   Avg complexity: ${(
          langFiles.reduce((sum, f) => sum + (f.complexity || 0), 0) /
          (langFiles.length || 1)
        ).toFixed(2)}`
      );
    } else {
      // Global stats
      console.log("\n📊 Project Memory Statistics:");
      console.log(`   Languages: ${stats.languages.join(", ")}`);
      console.log(`   Total files: ${stats.total_files}`);
      console.log(`   Indexed symbols: ${stats.indexed_symbols}`);
      console.log(`   Last scan: ${new Date(stats.last_scan).toLocaleString()}`);
      console.log(`   Scan duration: ${stats.scan_duration_ms}ms`);
    }

    return { success: true, stats };
  } catch (error) {
    console.error(`✗ /memory-stats failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * /memory-search command handler
 * Searches project memory
 */
async function handleMemorySearch(query, options = {}) {
  const { projectRoot = process.cwd(), language = null, limit = 10 } = options;

  if (!query || query.trim().length === 0) {
    console.error("⚠ Search query required");
    return { success: false };
  }

  try {
    const store = new ProjectMemoryStore(projectRoot);
    const results = store.search(query, {
      language,
      limit,
    });

    if (results.length === 0) {
      console.log(`⚠ No results found for: "${query}"`);
      return { success: true, results: [] };
    }

    console.log(`\n🔍 Search Results for "${query}":\n`);
    for (let i = 0; i < Math.min(results.length, limit); i++) {
      const result = results[i];
      console.log(`${i + 1}. ${result.text || result.symbol || "Unknown"}`);
      if (result.docType) console.log(`   Type: ${result.docType}`);
      if (result.file) console.log(`   File: ${result.file}`);
      if (result.language) console.log(`   Language: ${result.language}`);
    }

    return { success: true, results, count: results.length };
  } catch (error) {
    console.error(`✗ /memory-search failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * /memory-languages command handler
 * Lists detected languages
 */
async function handleMemoryLanguages(options = {}) {
  const { projectRoot = process.cwd() } = options;

  try {
    const store = new ProjectMemoryStore(projectRoot);
    const memory = store.loadMemory();

    if (!memory) {
      console.log("⚠ No memory found. Run '/learn' first.");
      return { success: false };
    }

    const languages = memory.metadata.languages_detected;

    console.log("\n🌍 Detected Languages:\n");
    for (const lang of languages) {
      const files = memory.structure.by_language[lang];
      const loc = files ? files.reduce((sum, f) => sum + (f.loc || 0), 0) : 0;
      console.log(`   ${lang}: ${files?.length || 0} files, ${loc} lines`);
    }

    return {
      success: true,
      languages,
      count: languages.length,
    };
  } catch (error) {
    console.error(`✗ /memory-languages failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * /memory-export command handler
 * Exports memory to various formats
 */
async function handleMemoryExport(format = "json", options = {}) {
  const { projectRoot = process.cwd(), output = null } = options;

  try {
    const store = new ProjectMemoryStore(projectRoot);
    const memory = store.loadMemory();

    if (!memory) {
      console.log("⚠ No memory found. Run '/learn' first.");
      return { success: false };
    }

    let data;

    if (format === "json") {
      data = JSON.stringify(memory, null, 2);
    } else if (format === "text") {
      data = this.formatAsText(memory);
    } else {
      console.error(`✗ Unsupported format: ${format}`);
      return { success: false };
    }

    console.log(data);
    console.log(`\n✓ Exported as ${format}`);

    return { success: true, format };
  } catch (error) {
    console.error(`✗ /memory-export failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Formats memory as text output
 * @private
 */
function formatAsText(memory) {
  let output = `PROJECT MEMORY REPORT
${"=".repeat(50)}

SCAN INFO:
  Date: ${memory.metadata.scan_date}
  Languages: ${memory.metadata.languages_detected.join(", ")}
  Duration: ${memory.metadata.scan_duration_ms}ms

STRUCTURE:
  Total Files: ${memory.structure.total_files}
  Total Lines: ${memory.structure.total_lines}

`;

  if (memory.dependencies) {
    output += `DEPENDENCIES:\n`;
    for (const [lang, deps] of Object.entries(memory.dependencies)) {
      const depCount = Object.keys(deps.direct || {}).length;
      output += `  ${lang}: ${depCount} packages\n`;
    }
  }

  return output;
}

module.exports = {
  handleLearn,
  handleMemoryStats,
  handleMemorySearch,
  handleMemoryLanguages,
  handleMemoryExport,
};
