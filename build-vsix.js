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

const publishers = ['www-diogo-in', 'HashtagPub'];

for (const pub of publishers) {
  console.log(`--> Building VSIX for publisher: [${pub}]...`);
  pkg.publisher = pub;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  const outFileName = `${pub}.antigravity-tokendashboard-${version}.vsix`;
  const outPath = path.join(rootDir, outFileName);

  execSync(`cmd /c "cd /d ${extDir} && npx -y @vscode/vsce package --no-dependencies --out ${outPath}"`, {
    stdio: 'inherit'
  });

  console.log(`[OK] Successfully created: ${outFileName}`);

  if (pub === 'www-diogo-in') {
    // Also copy to default un-namespaced name
    const genericName = `antigravity-tokendashboard-${version}.vsix`;
    fs.copyFileSync(outPath, path.join(rootDir, genericName));
    console.log(`[OK] Created copy: ${genericName}`);
  }
  console.log('');
}

// Reset package.json publisher back to www-diogo-in as default
pkg.publisher = 'www-diogo-in';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log('=== All VSIX packages built successfully! ===');
