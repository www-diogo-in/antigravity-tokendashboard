const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const rootDir = __dirname;
const extDir = path.join(rootDir, 'extension');
const pkgPath = path.join(extDir, 'package.json');

// Ensure LICENSE is present in extension folder
fs.copyFileSync(path.join(rootDir, 'LICENSE'), path.join(extDir, 'LICENSE'));

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

console.log(`=== Packaging Antigravity IDE Token, CO2e and Cost Dashboard v${version} ===\n`);

// 1. Build for Open VSX (publisher: www-diogo-in)
console.log('--> [1/2] Building for Open VSX Registry (publisher: www-diogo-in)...');
pkg.publisher = 'www-diogo-in';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const openVsxOut = path.join(rootDir, `www-diogo-in.antigravity-tokendashboard-${version}.vsix`);
execSync(`cmd /c "cd /d ${extDir} && npx -y @vscode/vsce package --no-dependencies --out ${openVsxOut}"`, {
  stdio: 'inherit'
});
console.log(`[OK] Created Open VSX package: www-diogo-in.antigravity-tokendashboard-${version}.vsix\n`);

// 2. Build for VS Code Marketplace (publisher: HashtagPub)
console.log('--> [2/2] Building for VS Code Marketplace (publisher: HashtagPub)...');
pkg.publisher = 'HashtagPub';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const vsMarketplaceOut = path.join(rootDir, `HashtagPub.antigravity-tokendashboard-${version}.vsix`);
execSync(`cmd /c "cd /d ${extDir} && npx -y @vscode/vsce package --no-dependencies --out ${vsMarketplaceOut}"`, {
  stdio: 'inherit'
});
console.log(`[OK] Created VS Code Marketplace package: HashtagPub.antigravity-tokendashboard-${version}.vsix`);

// Also copy HashtagPub package as the default generic package
const genericOut = path.join(rootDir, `antigravity-tokendashboard-${version}.vsix`);
fs.copyFileSync(vsMarketplaceOut, genericOut);
console.log(`[OK] Copied to generic name: antigravity-tokendashboard-${version}.vsix (publisher: HashtagPub)\n`);

// Ensure package.json remains committed with publisher: HashtagPub
pkg.publisher = 'HashtagPub';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log('=== All VSIX packages built successfully! ===');
console.log('• For Open VSX:          www-diogo-in.antigravity-tokendashboard-' + version + '.vsix');
console.log('• For VS Marketplace:    HashtagPub.antigravity-tokendashboard-' + version + '.vsix');
console.log('• Generic (VS Code):     antigravity-tokendashboard-' + version + '.vsix');
