"use strict";
/**
 * src/mcp/tool-helpers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared helpers for MCP tool handlers
 */

function sevIcon(sev) {
  return { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🟢", INFO: "ℹ️" }[sev] ?? "⚪";
}

function toToolResponse(text, stream = false) {
  if (!stream) return { content: [{ type: "text", text }] };
  const lines = String(text).split("\n");
  return {
    content: lines.map((line, idx) => ({
      type: "text",
      text: `[chunk ${idx + 1}/${lines.length}] ${line}`,
    })),
  };
}

function formatFindings(findings, summary) {
  if (!findings || findings.length === 0) {
    return "✅ No findings. Code looks clean!";
  }

  const bySev = summary?.by_severity ?? {};
  const header = [
    `📊 **Summary**: ${findings.length} finding(s)`,
    Object.entries(bySev)
      .filter(([, n]) => n > 0)
      .map(([sev, n]) => `${sevIcon(sev)} ${sev}: ${n}`)
      .join("  ·  "),
    `📁 Files scanned: ${summary?.files_scanned ?? "?"}`,
    "",
  ].join("\n");

  const lines = findings.slice(0, 50).map((f) =>
    [
      `${sevIcon(f.severity)} **[${f.severity}]** ${f.principle}`,
      `   📄 ${f.file}:${f.line_start}${f.symbol ? ` (${f.symbol})` : ""}`,
      `   💬 ${f.message}`,
      `   💡 ${f.recommendation}`,
      f.cwe_id ? `   🔗 ${f.cwe_id}${f.owasp_category ? ` · ${f.owasp_category}` : ""}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );

  const footer = findings.length > 50
    ? `\n…and ${findings.length - 50} more findings. Narrow the file scope to see all.`
    : "";

  return header + lines.join("\n\n") + footer;
}

/**
 * Format skill execution result into a tool response
 * @param {object} result - Skill execution result with {success, error, result}
 * @param {function} formatter - Optional formatter for successful results
 * @param {boolean} stream - Whether to stream the response
 * @returns {object} MCP tool response
 */
function formatSkillResult(result, formatter, stream = false) {
  let text;
  if (result.success && formatter) {
    text = formatter(result.result);
  } else if (result.success) {
    text = "✅ Success";
  } else {
    text = `❌ Error: ${result.error ?? result.result?.error ?? "Unknown error"}`;
  }
  return toToolResponse(text, stream);
}

module.exports = {
  sevIcon,
  toToolResponse,
  formatFindings,
  formatSkillResult,
};
