"use strict";

/**
 * .agents/orchestrator/lib/output-projector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Projection and normalization helpers for orchestrator outputs
 */

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

/**
 * Apply output projection for a skill
 * @param {string} skillId
 * @param {object|null} projectionConfig
 * @param {any} output
 * @returns {any}
 */
function applyOutputProjection(skillId, projectionConfig, output) {
  if (!projectionConfig || typeof output !== 'object' || output === null) {
    return output;
  }

  const projectionPaths = projectionConfig[skillId] || projectionConfig.default;
  if (!Array.isArray(projectionPaths) || projectionPaths.length === 0) {
    return output;
  }

  const projected = {};
  for (const path of projectionPaths) {
    const value = getPathValue(output, path);
    if (value !== undefined) {
      setPathValue(projected, path, cloneValue(value));
    }
  }

  return projected;
}

/**
 * Normalize and dedupe findings
 * @param {object[]} findings
 * @returns {object[]}
 */
function normalizeAndDedupeFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const finding of findings) {
    if (!finding || typeof finding !== 'object') {
      continue;
    }

    const item = { ...finding };
    item.severity = normalizeSeverity(item.severity);
    const fingerprint = fingerprintFinding(item);

    if (seen.has(fingerprint)) {
      continue;
    }

    seen.add(fingerprint);
    normalized.push(item);
  }

  return normalized.sort((a, b) => {
    const aIndex = SEVERITY_ORDER.indexOf(a.severity);
    const bIndex = SEVERITY_ORDER.indexOf(b.severity);

    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }

    const aFile = String(a.file || '');
    const bFile = String(b.file || '');
    return aFile.localeCompare(bFile);
  });
}

function normalizeSeverity(value) {
  const normalized = String(value || '').toUpperCase();
  return SEVERITY_ORDER.includes(normalized) ? normalized : 'INFO';
}

function fingerprintFinding(finding) {
  const parts = [
    String(finding.skill || ''),
    String(finding.id || ''),
    String(finding.type || ''),
    String(finding.rule || ''),
    String(finding.file || ''),
    String(finding.line_start || finding.line || ''),
    String(finding.message || ''),
    String(finding.severity || '')
  ];

  return parts.join('|').toLowerCase();
}

function getPathValue(source, path) {
  const segments = String(path || '').split('.').filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  let value = source;
  for (const segment of segments) {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    value = value[segment];
  }

  return value;
}

function setPathValue(target, path, value) {
  const segments = String(path || '').split('.').filter(Boolean);
  if (segments.length === 0) {
    return;
  }

  let cursor = target;
  for (let idx = 0; idx < segments.length - 1; idx++) {
    const segment = segments[idx];
    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  cursor[segments[segments.length - 1]] = value;
}

function cloneValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (typeof value === 'object') {
    const cloned = {};
    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = cloneValue(entry);
    }
    return cloned;
  }

  return value;
}

module.exports = {
  applyOutputProjection,
  normalizeAndDedupeFindings,
  normalizeSeverity,
  fingerprintFinding
};
