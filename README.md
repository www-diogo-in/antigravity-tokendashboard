# Antigravity IDE Token, Cost & CO₂ Intelligence

> **Native in-IDE and standalone real-time token telemetry, cost analytics, and carbon footprint monitor for Google Antigravity IDE.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Antigravity%20IDE%20%7C%20VS%20Code-purple.svg)](https://github.com)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20Node.js)-emerald.svg)](https://nodejs.org)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20On--Device-brightgreen.svg)](#privacy--security-architecture)

---

## 🌟 Overview

Antigravity IDE handles millions of tokens through deep reasoning, code generation, and iterative pair programming. **Antigravity Token Dashboard** gives you immediate, deep visibility into your LLM resource consumption, prompt caching savings, and ecological impact—directly inside your editor and via a high-performance web dashboard.

### Key Capabilities

- ⚡ **6 Live KPI Cards**: Total Tokens, Context Cache Hit Rate, Estimated Spend, Thinking/Reasoning Tokens, CO₂e Carbon Footprint, and Monitored Sessions.
- 🖥️ **Native In-Editor Tab**: Full-page interactive dashboard tab (`Antigravity: Open Token & Cost Dashboard`).
- 📊 **Activity Bar & Sidebar Panel**: Dedicated Token Intelligence view container in the left sidebar with real-time stats and range filtering (`30 Days`, `All Time`, `7 Days`, `Today`).
- 🎯 **Prompt Cache Intelligence**: Quantifies exact dollar savings and cache hit percentages gained through Antigravity's context caching.
- 🌿 **Environmental Impact (CO₂e)**: Tracks session carbon emissions based on Google datacenter PUE (~1.10), clean energy match, and IEA carbon intensity (0.25 gCO₂e per 1,000 tokens).
- 📈 **Stacked Interactive Timeline**: Smooth HTML5 canvas timeline with dynamic toggles between **Tokens**, **Cost ($)**, and **CO₂e (g)**.
- 🔍 **Turn-by-Turn Trajectory Drawer**: Inspect individual agent turns, reasoning tokens, and context window growth curves.
- 🚀 **Zero External Dependencies**: Powered entirely by Node.js built-in modules (`node:sqlite`, `node:http`, `node:fs`).

---

## 🔒 Privacy & Security Architecture

- **100% On-Device & Private**: This extension communicates exclusively with your local machine (`127.0.0.1:3333`).
- **No External Telemetry**: Zero analytics, zero cloud logging, zero external network requests.
- **No API Keys Required**: The dashboard parses session metadata from local SQLite files in `~/.gemini/antigravity-ide/conversations/`. It does not require or touch any API keys.

---

## 📦 In-IDE Extension Installation

### Option A: Install via Pre-built VSIX
1. Download or package `antigravity-tokendashboard-1.0.0.vsix`.
2. Run in terminal:
   ```bash
   antigravity-ide --install-extension antigravity-tokendashboard-1.0.0.vsix
   ```
3. In Antigravity IDE, press `Ctrl+Shift+P` -> `Developer: Reload Window`.

### Option B: Build from Source
```bash
git clone https://github.com/www-diogo-in/antigravity-tokendashboard.git
cd antigravity-tokendashboard
node build-vsix.js
antigravity-ide --install-extension antigravity-tokendashboard-1.0.0.vsix --force
```

---

## 🖥️ Standalone Web Dashboard

You can also run the web dashboard independently in any browser:

```bash
# Start server (listens on http://127.0.0.1:3333)
npm start

# Or launch directly into default browser
npm run open
```

### CLI Terminal Report

Generate an instant ASCII telemetry summary in your console:
```bash
npm run report
```

---

## 🧭 Extension Commands

| Command | Shortcut / Access | Description |
|---|---|---|
| `Antigravity: Open Token & Cost Dashboard` | Status Bar or `Ctrl+Shift+P` | Opens the full telemetry dashboard in an editor tab |
| `Antigravity: Refresh Token Telemetry` | Sidebar button or `Ctrl+Shift+P` | Refreshes all metrics from the local SQLite engine |
| `Antigravity: Restart Token Dashboard Server` | `Ctrl+Shift+P` | Restarts the background SQLite analytics daemon |

---

## 🌿 Methodology & Sources

- **Pricing Models**: Modeled on standard Google Gemini API rates ($0.075 / $0.01875 cache / $0.30 out per 1M tokens for Gemini Flash; $1.25 / $0.3125 / $5.00 for Gemini Pro; Anthropic Claude Sonnet rates for Claude agent sessions).
- **Carbon Intensity**: Calculated at **0.25 gCO₂e per 1,000 tokens** based on peer-reviewed datacenter energy benchmarks (Patterson et al. / Luccioni et al. 2023) combined with Google Cloud's average Power Usage Effectiveness (PUE ~1.10) and 24/7 carbon-free energy grid matching.

---

## 🏪 Visual Studio Marketplace & Open VSX Publishing Guide

To make this extension searchable and installable directly from the **Extensions view (`Ctrl+Shift+X`)** in VS Code and Antigravity IDE:

### 1. Visual Studio Marketplace
1. **Create an Azure DevOps Organization**:
   - Go to [dev.azure.com](https://dev.azure.com) and sign in with your Microsoft account.
2. **Generate a Personal Access Token (PAT)**:
   - In Azure DevOps, click **User settings** (top right) → **Personal access tokens** → **+ New Token**.
   - Set Organization to: `All accessible organizations`.
   - Set Scopes to: **Custom defined** → scroll to **Marketplace** → check **Manage**.
   - Copy the generated token.
3. **Register Publisher Account**:
   - Go to the [Visual Studio Marketplace Management Portal](https://marketplace.visualstudio.com/manage).
   - Click **Create publisher** and enter your Publisher ID (e.g. `diogo` or your organization name).
   - Ensure the `"publisher"` field in `extension/package.json` matches this ID.
4. **Publish**:
   ```bash
   cd extension
   npx @vscode/vsce login <YOUR_PUBLISHER_ID>
   npx @vscode/vsce publish
   ```
   *Or upload the pre-compiled `.vsix` manually through the Marketplace web portal!*

### 2. Open VSX Registry (For Open-Source IDEs & Antigravity)
1. Sign in to [open-vsx.org](https://open-vsx.org) with your GitHub account.
2. Create your Namespace matching your publisher name.
3. Generate an Access Token under your Profile Settings.
4. Publish:
   ```bash
   cd extension
   npx ovsx publish antigravity-tokendashboard.vsix -p <YOUR_OVSX_TOKEN>
   ```

### 3. Automated GitHub Actions CI/CD
This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/release.yml`).
- To create a release automatically, simply tag your commit and push:
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
- To auto-publish to the marketplace upon tagging, add `VS_MARKETPLACE_TOKEN` and `OVSX_PAT` in your GitHub repository's **Settings → Secrets and variables → Actions**.

---

## 💡 Inspiration & Relationship to tokendashboard-frontend

This project was directly inspired by the excellent concept and work in [neuland/tokendashboard-frontend](https://github.com/neuland/tokendashboard-frontend), which originally showcased the value of visualizing LLM token usage patterns.

### How This Project Differs
While inspired by that concept, this project was architected and built from scratch specifically for the **Google Antigravity IDE** ecosystem:

1. **Native In-Editor Extension**: Rather than functioning solely as an external browser app, this project is fully integrated into Antigravity IDE and VS Code as a native extension:
   - Dedicated **Activity Bar sidebar panel** with 6 Live KPI cards and instant range filters.
   - An in-editor **Webview tab** for deep visual analysis.
   - A real-time **Status Bar counter** that stays visible across all files and workspaces.
2. **Direct Antigravity SQLite Engine**: Interfaces directly with Antigravity IDE's local conversation SQLite databases (`~/.gemini/antigravity-ide/conversations/*.db`) using Node's built-in `node:sqlite`, with zero external dependencies and zero cloud logging.
3. **Environmental Impact & CO₂e Telemetry**: Introduces carbon emissions estimations based on Google Cloud datacenter PUE (~1.10), clean energy grid matching, and IEA benchmarks (0.25 gCO₂e per 1,000 tokens), complete with real-world equivalents (kilometers driven, smartphone charges, video streaming hours).
4. **Autonomous Daemon Lifecycle**: Automatically spawns and monitors a local background telemetry daemon with auto-reconnection and zero manual configuration required.
5. **Zero-Dependency Architecture**: Built in pure vanilla JavaScript, HTML5 Canvas, and modern CSS—eliminating heavy framework bundles and external npm dependencies.

---

### 🤖 Author's Note: Built 99% with AI

> **"A note on how this was made:**  
> I am not a professional software developer or programmer. This entire project—from the SQLite telemetry analysis and Protobuf parsing to the custom canvas timeline charts, the in-IDE extension architecture, and the automated packaging—was **99% created with AI** (using Google Antigravity IDE and its agentic pair programming assistant).
>
> It stands as a real-world testament to what modern agentic AI can build when guided by an idea, iterative feedback, and pair programming."

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
