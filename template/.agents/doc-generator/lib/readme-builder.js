"use strict";
/**
 * README builder
 * Creates comprehensive README documentation
 */

function generateReadme(options) {
  const {
    project_root,
    package_json = {},
    findings = []
  } = options;

  const projectName = package_json.name || "Project";
  const description = package_json.description || "A Node.js project";
  const version = package_json.version || "1.0.0";

  let readme = `# ${projectName}\n\n`;
  readme += `> ${description}\n\n`;
  readme += `**Version:** ${version}\n\n`;

  // Overview
  readme += `## Overview\n\n`;
  readme += `${description}\n\n`;
  readme += `### Key Features\n`;
  readme += `- Feature 1\n`;
  readme += `- Feature 2\n`;
  readme += `- Feature 3\n\n`;

  // Installation
  readme += `## Installation\n\n`;
  readme += `\`\`\`bash\n`;
  readme += `npm install\n`;
  readme += `\`\`\`\n\n`;

  // Usage
  readme += `## Usage\n\n`;
  readme += `\`\`\`javascript\n`;
  readme += `const project = require('${projectName}');\n`;
  readme += `// Your code here\n`;
  readme += `\`\`\`\n\n`;

  // Configuration
  if (package_json.config) {
    readme += `## Configuration\n\n`;
    readme += `Configuration can be set via environment variables or config file.\n\n`;
  }

  // API Reference
  readme += `## API Reference\n\n`;
  readme += `See [API.md](./docs/API.md) for detailed API documentation.\n\n`;

  // Testing
  const testCommand = package_json.scripts?.test || "npm test";
  readme += `## Testing\n\n`;
  readme += `\`\`\`bash\n`;
  readme += `${testCommand}\n`;
  readme += `\`\`\`\n\n`;

  // Contributing
  readme += `## Contributing\n\n`;
  readme += `Contributions are welcome! Please follow these guidelines:\n`;
  readme += `1. Fork the repository\n`;
  readme += `2. Create a feature branch\n`;
  readme += `3. Commit your changes\n`;
  readme += `4. Push to the branch\n`;
  readme += `5. Open a pull request\n\n`;

  // License
  const license = package_json.license || "MIT";
  readme += `## License\n\n`;
  readme += `${license}\n`;

  return readme;
}

module.exports = { generateReadme };
