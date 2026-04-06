const fs = require('fs');
const path = require('path');

const PROD_FILES = [
  'src/mcp/filesystem-tools.js',
  'template/skills/code-analysis/handler.js',
  'template/skills/security-audit/handler.js',
  'src/mcp-server.js',
  'src/agent-runner.js'
];

PROD_FILES.forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`\n❌ ${file} not found\n`);
    return;
  }

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 ${file}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Lines: ${lines.length}`);

  // Find all functions
  const functions = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(async\s+)?function\s+\w+|^\s*\w+\s*\(.*\)\s*{|^\s*\w+\s*=\s*(async\s*)?\(/.test(line)) {
      const funcMatch = line.match(/(?:function\s+(\w+)|(\w+)\s*=|(\w+)\s*\()/);
      const funcName = funcMatch ? (funcMatch[1] || funcMatch[2] || funcMatch[3]) : '?';
      
      // Count lines until closing brace
      let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      let endLine = i;
      
      if (braceCount > 0) {
        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          endLine = j;
        }
      }

      const funcLines = lines.slice(i, endLine + 1).join('\n');
      const complexity = (funcLines.match(/if\s*\(|for\s*\(|while\s*\(|case\s+|catch|&&|\|\||\?/g) || []).length;
      const length = endLine - i + 1;

      if (length > 30 || complexity > 8) {
        functions.push({
          name: funcName,
          line: i + 1,
          length,
          complexity
        });
      }
    }
  }

  if (functions.length > 0) {
    console.log('\n⚠️  Complex functions:');
    functions.forEach(f => {
      console.log(`  ${f.name} (L${f.line}, ${f.length} lines, CC=${f.complexity})`);
    });
  } else {
    console.log('\n✅ No overly complex functions');
  }
});

console.log('\n' + '='.repeat(60));
