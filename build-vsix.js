const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const rootDir = __dirname;
const extDir = path.join(rootDir, 'extension');
const vsixOut = path.join(rootDir, 'antigravity-tokendashboard-1.0.0.vsix');

// Copy LICENSE to extension folder
fs.copyFileSync(path.join(rootDir, 'LICENSE'), path.join(extDir, 'LICENSE'));

console.log('Packaging extension using official @vscode/vsce tool...');
execSync(`cmd /c "cd /d ${extDir} && npx -y @vscode/vsce package --no-dependencies --out ${vsixOut}"`, {
  stdio: 'inherit'
});

console.log('Successfully created official Marketplace-compliant VSIX at:', vsixOut);
