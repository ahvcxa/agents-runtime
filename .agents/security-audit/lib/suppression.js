"use strict";

/**
 * Suppression Engine - Robust suppression management
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Handles suppression comments in various formats:
 * - OWASP format: // agent-suppress: A01:2021
 * - Key format: // agent-suppress: <suppression_key>
 * - With reason: // agent-suppress: A01:2021 reason="Enforced by custom middleware"
 * 
 * Suppression applies to the line with the comment and the next line.
 */

class SuppressionEngine {
  constructor() {
    this.suppressions = new Map();  // category:line -> { reason, suppressed_at }
    this.suppressedKeys = new Set();
  }

  /**
   * Parse all suppression comments in a file
   */
  parseSuppressions(content) {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/agent-suppress:\s*(\S+)(?:\s+reason=["']([^"']+)["'])?/);

      if (!match) continue;

      const token = match[1];
      const reason = match[2] || "";

      // OWASP format: A01:2021, A02:2021, etc.
      if (token.match(/^A\d{2}:\d{4}$/)) {
        // Suppression applies to this line and the next
        this.suppressions.set(`${token}:${i + 1}`, { reason, suppressed_at: new Date().toISOString() });
        this.suppressions.set(`${token}:${i + 2}`, { reason, suppressed_at: new Date().toISOString() });
      } else {
        // Suppression key format
        this.suppressedKeys.add(token);
      }
    }

    return {
      owasp_suppressions: this.suppressions,
      key_suppressions: this.suppressedKeys,
    };
  }

  /**
   * Check if a finding is suppressed
   */
  isSuppressed(finding) {
    // Check OWASP category suppression
    const lineKey = `${finding.owasp}:${finding.line_start}`;
    if (this.suppressions.has(lineKey)) {
      return {
        suppressed: true,
        method: "owasp_category",
        reason: this.suppressions.get(lineKey).reason,
      };
    }

    // Check suppression key
    if (finding.suppression_key && this.suppressedKeys.has(finding.suppression_key)) {
      return {
        suppressed: true,
        method: "key",
        reason: "",
      };
    }

    return { suppressed: false };
  }

  /**
   * Generate audit trail of suppressions
   */
  getSuppressionAuditTrail() {
    const trail = [];

    for (const [key, data] of this.suppressions.entries()) {
      const [owasp, line] = key.split(":");
      trail.push({
        type: "owasp_category",
        owasp_category: owasp,
        line: parseInt(line),
        reason: data.reason,
        suppressed_at: data.suppressed_at,
      });
    }

    for (const key of this.suppressedKeys) {
      trail.push({
        type: "suppression_key",
        key,
        reason: "",
      });
    }

    return trail;
  }

  /**
   * Get count of active suppressions
   */
  getSuppressionStats() {
    return {
      owasp_suppressions: this.suppressions.size,
      key_suppressions: this.suppressedKeys.size,
      total: this.suppressions.size + this.suppressedKeys.size,
    };
  }
}

module.exports = { SuppressionEngine };
