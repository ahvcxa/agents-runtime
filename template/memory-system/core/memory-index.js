"use strict";
/**
 * .agents/memory-system/core/memory-index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates and maintains searchable indexes over project memory data
 * Supports: full-text search, by-language filtering, tag-based queries
 *
 * Exported: MemoryIndex class
 */

class MemoryIndex {
  constructor() {
    // Full-text index: token -> [file, symbol, line]
    this.fullTextIndex = new Map();

    // Language index: language -> [items]
    this.languageIndex = new Map();

    // File index: filename -> metadata
    this.fileIndex = new Map();

    // Symbol index: symbol_name -> {language, file, type}
    this.symbolIndex = new Map();

    // Tag index: tag -> [items]
    this.tagIndex = new Map();
  }

  /**
   * Builds indexes from memory data
   * @param {Object} memory - Memory data structure
   * @returns {Object} Complete index data
   */
  buildIndexes(memory) {
    this.reset();

    if (memory.structure) {
      this.indexStructure(memory.structure);
    }

    if (memory.capabilities) {
      this.indexCapabilities(memory.capabilities);
    }

    if (memory.dependencies) {
      this.indexDependencies(memory.dependencies);
    }

    return this.export();
  }

  /**
   * Indexes file structure for fast lookups
   * @param {Object} structure - File structure data
   */
  indexStructure(structure) {
    const walk = (files, lang = "") => {
      for (const file of files || []) {
        const key = `${file.path}`;
        this.fileIndex.set(key, {
          path: file.path,
          language: lang,
          type: file.type,
          loc: file.loc,
          complexity: file.complexity,
        });

        // Add to full-text index
        this.addToFullText(file.path, "file");

        // Add to language index
        if (lang) {
          if (!this.languageIndex.has(lang)) {
            this.languageIndex.set(lang, []);
          }
          this.languageIndex.get(lang).push(key);
        }
      }
    };

    // Index files by language
    if (structure.by_language) {
      for (const [lang, files] of Object.entries(structure.by_language)) {
        walk(files, lang);
      }
    }
  }

  /**
   * Indexes exported functions, classes, and symbols
   * @param {Object} capabilities - Capability data by language
   */
  indexCapabilities(capabilities) {
    for (const [language, data] of Object.entries(capabilities)) {
      if (!data) continue;

      // Index exports
      if (data.exports) {
        for (const exp of data.exports) {
          const key = `${language}:${exp.name}`;
          this.symbolIndex.set(key, {
            name: exp.name,
            type: "export",
            language,
            file: exp.file,
            line: exp.line,
          });

          this.addToFullText(exp.name, `export:${language}`);
          this.addTag(language, key);
        }
      }

      // Index functions
      if (data.functions) {
        for (const fn of data.functions) {
          const key = `${language}:${fn.name}`;
          this.symbolIndex.set(key, {
            name: fn.name,
            type: "function",
            language,
            file: fn.file,
            line: fn.line,
            params: fn.params,
          });

          this.addToFullText(fn.name, `function:${language}`);
          this.addTag(language, key);
        }
      }

      // Index classes
      if (data.classes) {
        for (const cls of data.classes) {
          const key = `${language}:${cls.name}`;
          this.symbolIndex.set(key, {
            name: cls.name,
            type: "class",
            language,
            file: cls.file,
            line: cls.line,
            methods: cls.methods,
          });

          this.addToFullText(cls.name, `class:${language}`);
          this.addTag(language, key);
        }
      }
    }
  }

  /**
   * Indexes dependencies by language
   * @param {Object} dependencies - Dependency data by language
   */
  indexDependencies(dependencies) {
    for (const [language, data] of Object.entries(dependencies)) {
      if (!data) continue;

      if (data.direct) {
        for (const [pkgName, version] of Object.entries(data.direct)) {
          const key = `${language}:${pkgName}`;
          this.addToFullText(pkgName, `dependency:${language}`);
          this.addTag(`dep:${language}`, key);
        }
      }
    }
  }

  /**
   * Searches across all indexes
   * @param {string} query - Search query
   * @param {Object} options - Search options {language, type, limit}
   * @returns {Array} Search results
   */
  search(query, options = {}) {
    const { language = null, type = null, limit = 50 } = options;
    const results = [];

    // Tokenize query
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    // Search in full-text index
    for (const token of tokens) {
      for (const [indexToken, docs] of this.fullTextIndex) {
        if (indexToken.includes(token)) {
          for (const doc of docs) {
            // Filter by language if specified
            if (language && doc.language !== language) continue;

            results.push({
              score: this.calculateScore(token, indexToken),
              ...doc,
            });
          }
        }
      }
    }

    // Filter by type if specified
    if (type) {
      const filtered = results.filter((r) => r.docType === type);
      results.length = 0;
      results.push(...filtered);
    }

    // Deduplicate and sort by score
    const unique = new Map();
    for (const result of results) {
      const key = JSON.stringify(result);
      if (!unique.has(key)) {
        unique.set(key, result);
      }
    }

    return Array.from(unique.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
  }

  /**
   * Gets all symbols of a specific language
   * @param {string} language - Language name
   * @returns {Array} Symbols in that language
   */
  getLanguageSymbols(language) {
    const results = [];
    for (const [key, symbol] of this.symbolIndex) {
      if (symbol.language === language) {
        results.push(symbol);
      }
    }
    return results;
  }

  /**
   * Gets all files for a specific language
   * @param {string} language - Language name
   * @returns {Array} Files in that language
   */
  getLanguageFiles(language) {
    const keys = this.languageIndex.get(language) || [];
    return keys
      .map((key) => this.fileIndex.get(key))
      .filter((f) => f !== undefined);
  }

  /**
   * Adds text to full-text index
   * @private
   */
  addToFullText(text, docType) {
    const token = text.toLowerCase();
    if (!this.fullTextIndex.has(token)) {
      this.fullTextIndex.set(token, []);
    }
    this.fullTextIndex.get(token).push({ text, docType });
  }

  /**
   * Adds tag to tag index
   * @private
   */
  addTag(tag, value) {
    if (!this.tagIndex.has(tag)) {
      this.tagIndex.set(tag, []);
    }
    this.tagIndex.get(tag).push(value);
  }

  /**
   * Calculates relevance score
   * @private
   */
  calculateScore(query, indexed) {
    if (indexed === query) return 100; // Exact match
    if (indexed.startsWith(query)) return 80; // Prefix match
    if (indexed.includes(query)) return 50; // Contains
    return 10; // Partial match
  }

  /**
   * Resets all indexes
   * @private
   */
  reset() {
    this.fullTextIndex.clear();
    this.languageIndex.clear();
    this.fileIndex.clear();
    this.symbolIndex.clear();
    this.tagIndex.clear();
  }

  /**
   * Exports indexes as serializable object
   * @returns {Object} Exported indexes
   */
  export() {
    return {
      full_text: Array.from(this.fullTextIndex.entries()).map(([k, v]) => ({
        token: k,
        count: v.length,
      })),
      languages: Array.from(this.languageIndex.entries()).map(([k, v]) => ({
        language: k,
        count: v.length,
      })),
      symbols: {
        total: this.symbolIndex.size,
        types: {
          export: Array.from(this.symbolIndex.values()).filter(
            (s) => s.type === "export"
          ).length,
          function: Array.from(this.symbolIndex.values()).filter(
            (s) => s.type === "function"
          ).length,
          class: Array.from(this.symbolIndex.values()).filter(
            (s) => s.type === "class"
          ).length,
        },
      },
      files: {
        total: this.fileIndex.size,
      },
    };
  }
}

module.exports = { MemoryIndex };
