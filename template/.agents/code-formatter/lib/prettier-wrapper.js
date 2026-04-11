"use strict";
/**
 * Prettier wrapper
 * Formats code using Prettier
 */

function formatWithPrettier(content, filePath) {
  // Simple prettier-like formatting
  // In production, would use actual prettier package
  
  let formatted = content;

  // Remove trailing whitespace
  formatted = formatted.split("\n").map(line => line.trimRight()).join("\n");

  // Normalize indentation to 2 spaces
  formatted = formatted.replace(/^\t+/gm, (match) => {
    return "  ".repeat(match.length);
  });

  // Add newline at end of file if missing
  if (formatted && !formatted.endsWith("\n")) {
    formatted += "\n";
  }

  // Remove multiple blank lines
  formatted = formatted.replace(/\n\n\n+/g, "\n\n");

  return formatted;
}

module.exports = { formatWithPrettier };
