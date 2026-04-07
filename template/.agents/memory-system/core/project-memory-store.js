"use strict";
/**
 * .agents/memory-system/core/project-memory-store.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Main orchestrator for project memory system
 * Coordinates scanning, indexing, and persistence
 *
 * Exported: ProjectMemoryStore class
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { detectLanguages } = require("./language-detector");
const { ChangeDetector } = require("./change-detector");
const { MemoryIndex } = require("./memory-index");

class ProjectMemoryStore {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.memoryDir = path.join(projectRoot, ".agents/memory");
    this.options = options;

    this.changeDetector = new ChangeDetector(projectRoot);
    this.memoryIndex = new MemoryIndex();

    // In-memory cache
    this.memory = null;
    this.lastScan = null;
  }

  /**
   * Performs full project scan
   * @param {Object} options - {languages: string[], plugins: Map}
   * @returns {Promise<Object>} Complete memory structure
   */
  async scan(options = {}) {
    const startTime = Date.now();

    try {
      // 1. Detect languages
      const languages = options.languages || (await detectLanguages(this.projectRoot));

      // 2. Run scanners
      const [structureScanner, dependencyScanner, capabilityScanner, configScanner] =
        await Promise.all([
          this.loadScanner("structure"),
          this.loadScanner("dependency"),
          this.loadScanner("capability"),
          this.loadScanner("config"),
        ]);

      // Execute scans in parallel where possible
      const [structure, dependencies, capabilities, config] = await Promise.all([
        structureScanner ? structureScanner.scan(this.projectRoot) : {},
        dependencyScanner ? dependencyScanner.scan(this.projectRoot, languages) : {},
        capabilityScanner ? capabilityScanner.scan(this.projectRoot, languages) : {},
        configScanner ? configScanner.scan(this.projectRoot) : {},
      ]);

      // 3. Create indexes
      const tempMemory = { structure, dependencies, capabilities, config };
      const indexes = this.memoryIndex.buildIndexes(tempMemory);

      // 4. Build final memory structure
      const memory = {
        metadata: {
          version: "2.0.0",
          languages_detected: languages.sort(),
          scan_date: new Date().toISOString(),
          scan_duration_ms: Date.now() - startTime,
          project_hash: this.calculateProjectHash(),
        },
        structure: structure || {},
        dependencies: dependencies || {},
        capabilities: capabilities || {},
        config: config || {},
        indexes,
      };

      // 5. Persist to disk
      this.persistMemory(memory);

      // 6. Record in change log
      this.changeDetector.appendChangeLog({
        type: "full_scan",
        languages: languages,
        files_scanned: structure?.total_files || 0,
        git_commit_hash: this.getGitCommitHash(),
      });

      this.memory = memory;
      this.lastScan = Date.now();

      return memory;
    } catch (error) {
      throw new Error(`[ProjectMemoryStore] Scan failed: ${error.message}`);
    }
  }

  /**
   * Performs incremental update (delta scan)
   * @returns {Promise<Object>} Updated memory structure
   */
  async incrementalUpdate() {
    const startTime = Date.now();

    try {
      // Load current memory
      const memory = this.loadMemory();
      if (!memory) {
        // No previous scan, do full scan
        return this.scan();
      }

      // Detect what changed
      const changes = await this.changeDetector.detectChanges();

      if (
        changes.modified.length === 0 &&
        changes.added.length === 0 &&
        changes.deleted.length === 0
      ) {
        // No changes, return existing memory
        return memory;
      }

      // Get appropriate scanner
      const scanner = await this.loadScanner("dependency");
      if (!scanner) return memory;

      // Re-scan only changed files
      const changedFiles = [
        ...new Set([
          ...changes.modified,
          ...changes.added,
          ...changes.deleted,
        ]),
      ];

      // Update dependencies (most critical for delta)
      const updatedDeps = scanner
        ? await scanner.scanPartial(this.projectRoot, changedFiles)
        : null;

      if (updatedDeps) {
        memory.dependencies = updatedDeps;
      }

      // Rebuild indexes
      memory.indexes = this.memoryIndex.buildIndexes(memory);

      // Update metadata
      memory.metadata.scan_date = new Date().toISOString();
      memory.metadata.scan_duration_ms = Date.now() - startTime;

      // Persist
      this.persistMemory(memory);

      // Log change
      this.changeDetector.appendChangeLog({
        type: "incremental_scan",
        changes_detected: changes.modified.length + changes.added.length,
        git_commit_hash: this.getGitCommitHash(),
      });

      this.memory = memory;
      this.lastScan = Date.now();

      return memory;
    } catch (error) {
      // On error, fall back to full scan
      console.warn(
        `[ProjectMemoryStore] Incremental update failed, falling back to full scan: ${error.message}`
      );
      return this.scan();
    }
  }

  /**
   * Loads memory from persistent storage
   * @returns {Object|null} Memory structure or null if not found
   */
  loadMemory() {
    if (this.memory) return this.memory; // Return cached

    try {
      const metadataPath = path.join(this.memoryDir, "metadata.json");
      if (!fs.existsSync(metadataPath)) return null;

      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      const structure = this.loadJsonFile("structure.json");
      const dependencies = this.loadJsonFile("dependencies.json");
      const capabilities = this.loadJsonFile("capabilities.json");
      const indexes = this.loadJsonFile("indexes.json");

      this.memory = {
        metadata,
        structure,
        dependencies,
        capabilities,
        indexes,
      };

      return this.memory;
    } catch {
      return null;
    }
  }

  /**
   * Searches memory
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} Search results
   */
  search(query, options = {}) {
    const memory = this.loadMemory();
    if (!memory || !this.memoryIndex) return [];

    return this.memoryIndex.search(query, options);
  }

  /**
   * Gets memory statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const memory = this.loadMemory();
    if (!memory) return null;

    return {
      last_scan: memory.metadata.scan_date,
      languages: memory.metadata.languages_detected,
      total_files: memory.structure.total_files || 0,
      indexed_symbols: memory.indexes?.symbols?.total || 0,
      scan_duration_ms: memory.metadata.scan_duration_ms,
    };
  }

  /**
   * Persists memory to disk
   * @private
   */
  persistMemory(memory) {
    try {
      fs.mkdirSync(this.memoryDir, { recursive: true });

      // Write metadata
      fs.writeFileSync(
        path.join(this.memoryDir, "metadata.json"),
        JSON.stringify(memory.metadata, null, 2)
      );

      // Write structure
      if (memory.structure) {
        fs.writeFileSync(
          path.join(this.memoryDir, "structure.json"),
          JSON.stringify(memory.structure, null, 2)
        );
      }

      // Write dependencies
      if (memory.dependencies) {
        fs.writeFileSync(
          path.join(this.memoryDir, "dependencies.json"),
          JSON.stringify(memory.dependencies, null, 2)
        );
      }

      // Write capabilities
      if (memory.capabilities) {
        fs.writeFileSync(
          path.join(this.memoryDir, "capabilities.json"),
          JSON.stringify(memory.capabilities, null, 2)
        );
      }

      // Write indexes
      if (memory.indexes) {
        fs.writeFileSync(
          path.join(this.memoryDir, "indexes.json"),
          JSON.stringify(memory.indexes, null, 2)
        );
      }
    } catch (error) {
      throw new Error(`[ProjectMemoryStore] Failed to persist memory: ${error.message}`);
    }
  }

  /**
   * Loads a JSON file from memory directory
   * @private
   */
  loadJsonFile(filename) {
    try {
      const filePath = path.join(this.memoryDir, filename);
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  /**
   * Loads a scanner dynamically
   * @private
   */
  async loadScanner(type) {
    try {
      const scannerPath = path.join(
        __dirname,
        "../scanners",
        `${type}-scanner.js`
      );
      if (!fs.existsSync(scannerPath)) return null;
      const { default: Scanner } = require(scannerPath);
      return new Scanner();
    } catch {
      return null;
    }
  }

  /**
   * Calculates project hash for change detection
   * @private
   */
  calculateProjectHash() {
    const files = this.getSourceFiles();
    const hashes = files.map((f) => {
      try {
        const content = fs.readFileSync(f, "utf8");
        return crypto.createHash("md5").update(content).digest("hex");
      } catch {
        return "";
      }
    });

    return crypto
      .createHash("md5")
      .update(hashes.join(""))
      .digest("hex")
      .slice(0, 12);
  }

  /**
   * Gets git commit hash
   * @private
   */
  getGitCommitHash() {
    try {
      const { execSync } = require("child_process");
      return execSync("git rev-parse HEAD", {
        cwd: this.projectRoot,
        encoding: "utf8",
      }).trim();
    } catch {
      return null;
    }
  }

  /**
   * Gets source files (for hashing)
   * @private
   */
  getSourceFiles() {
    const files = [];

    function walk(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.name.startsWith(".") ||
            [
              "node_modules",
              "vendor",
              "dist",
              "build",
              "coverage",
              ".agents",
            ].includes(entry.name)
          ) {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (/\.(js|ts|py|go|rs|java|rb|php)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch {
        // Ignore errors
      }
    }

    walk(this.projectRoot);
    return files;
  }
}

module.exports = { ProjectMemoryStore };
