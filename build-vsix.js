const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const extSrcDir = path.join(rootDir, 'extension');
const stagingDir = path.join(rootDir, 'dist-vsix');
const extensionDestDir = path.join(stagingDir, 'extension');
const vsixOut = path.join(rootDir, 'antigravity-tokendashboard-1.0.0.vsix');

if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });
fs.mkdirSync(extensionDestDir, { recursive: true });

// Copy extension files
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(extSrcDir, extensionDestDir);

// 1. [Content_Types].xml
const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="html" ContentType="text/html"/>
  <Default Extension="css" ContentType="text/css"/>
</Types>`;
fs.writeFileSync(path.join(stagingDir, '[Content_Types].xml'), contentTypesXml, 'utf8');

// 2. extension.vsixmanifest
const vsixManifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="antigravity-tokendashboard" Version="1.0.0" Publisher="antigravity" />
    <DisplayName>Antigravity Token &amp; Cost Intelligence</DisplayName>
    <Description xml:space="preserve">Native in-IDE Token, Cost, Prompt Cache &amp; CO2e intelligence dashboard for Antigravity IDE.</Description>
    <Tags>Antigravity,Tokens,Cost,Intelligence,Gemini,CO2,Dashboard,Usage</Tags>
    <Categories>Other,Visualization</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.90.0" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace,ui" />
      <Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true" />
      <Property Id="Microsoft.VisualStudio.Services.Branding.Color" Value="#080b12" />
      <Property Id="Microsoft.VisualStudio.Services.Branding.Theme" Value="dark" />
      <Property Id="Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown" Value="true" />
    </Properties>
    <Icon>extension/assets/icon.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/assets/icon.png" Addressable="true" />
  </Assets>
</PackageManifest>`;
fs.writeFileSync(path.join(stagingDir, 'extension.vsixmanifest'), vsixManifest, 'utf8');

if (fs.existsSync(vsixOut)) {
  fs.unlinkSync(vsixOut);
}

const zipOut = path.join(rootDir, 'antigravity-tokendashboard-1.0.0.zip');
if (fs.existsSync(zipOut)) fs.unlinkSync(zipOut);

console.log('Packaging VSIX...');
const zipCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipOut}' -Force; Move-Item -Path '${zipOut}' -Destination '${vsixOut}' -Force"`;
execSync(zipCmd, { stdio: 'inherit' });

console.log('Successfully created VSIX at:', vsixOut);
