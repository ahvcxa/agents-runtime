"use strict";
/**
 * API documentation generator
 * Creates API documentation from JSDoc data
 */

function generateApiDocs(jsDocData) {
  if (!jsDocData || jsDocData.length === 0) {
    return "";
  }

  let apiDocs = `# API Reference\n\n`;

  // Group by type
  const classes = jsDocData.filter(d => d.type === "class");
  const functions = jsDocData.filter(d => d.type === "function");

  // Classes section
  if (classes.length > 0) {
    apiDocs += `## Classes\n\n`;
    for (const cls of classes) {
      apiDocs += `### ${cls.name}\n\n`;
      apiDocs += `\`\`\`\n${cls.jsDoc}\n\`\`\`\n\n`;
    }
  }

  // Functions section
  if (functions.length > 0) {
    apiDocs += `## Functions\n\n`;
    for (const func of functions) {
      apiDocs += `### ${func.name}()\n\n`;
      apiDocs += `\`\`\`\n${func.jsDoc}\n\`\`\`\n\n`;
    }
  }

  return apiDocs;
}

module.exports = { generateApiDocs };
