/**
 * Antigravity Token, Cost & CO2 Intelligence Extension
 * Native in-IDE Extension for Google Antigravity IDE
 */

const vscode = require('vscode');
const http = require('http');
const path = require('path');
const child_process = require('child_process');

let currentPanel = null;
let statusBarItem = null;
let pollTimer = null;
let serverProcess = null;
const SERVER_PORT = 3333;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

/**
 * Checks if the telemetry server daemon is responding.
 */
function isServerRunning(port = SERVER_PORT) {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/api/overview?range=30d`, { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Fetches JSON from local server API.
 */
function fetchServerJson(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`${SERVER_URL}${endpoint}`, { timeout: 4000 }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Server returned HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Spawns server background process if not already running.
 */
async function ensureServerRunning(context) {
  const running = await isServerRunning();
  if (running) return true;

  const serverScript = path.join(context.extensionPath, 'server.js');
  try {
    serverProcess = child_process.spawn('node', [serverScript], {
      cwd: context.extensionPath,
      detached: true,
      stdio: 'ignore'
    });
    serverProcess.unref();

    // Poll until server is ready
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 300));
      if (await isServerRunning()) return true;
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start Antigravity Token Dashboard server: ${err.message}`);
  }
  return false;
}

/**
 * Formats token count (e.g. 243,423,344 -> 243.4M)
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  return num.toLocaleString();
}

/**
 * Updates status bar telemetry display (defaults to Last 30 Days).
 */
async function updateStatusBar() {
  if (!statusBarItem) return;
  try {
    const t = await fetchServerJson('/api/overview?range=30d');
    if (!t) return;

    const tokens = formatNumber(t.totalTokens || 0);
    const cost = '$' + (t.totalCost || 0).toFixed(2);
    const co2 = (t.co2Kg || 0).toFixed(1) + 'kg CO₂e';
    const hitRate = (t.cacheHitRate || 0).toFixed(1) + '%';

    statusBarItem.text = `$(dashboard) ${tokens} (30d) | ${cost} | ${co2}`;
    
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;
    md.appendMarkdown(`### ⚡ Antigravity Token & Cost Intelligence (Last 30 Days)\n\n`);
    md.appendMarkdown(`- **Period:** \`Last 30 Days\`\n`);
    md.appendMarkdown(`- **Total Tokens:** \`${(t.totalTokens || 0).toLocaleString()}\` (${tokens})\n`);
    md.appendMarkdown(`- **Cached Tokens:** \`${(t.cachedTokens || 0).toLocaleString()}\` (${hitRate} hit rate)\n`);
    md.appendMarkdown(`- **Estimated Spend:** \`$${(t.totalCost || 0).toFixed(2)}\` *(Saved $${(t.totalSavings || 0).toFixed(2)} via cache)*\n`);
    md.appendMarkdown(`- **Carbon Footprint:** \`${(t.co2Kg || 0).toFixed(2)} kg CO₂e\` (${(t.co2Grams || 0).toFixed(0)}g)\n`);
    md.appendMarkdown(`- **Thinking Tokens:** \`${(t.thinkingTokens || 0).toLocaleString()}\` (${(t.thinkingRatio || 0).toFixed(1)}% of output)\n`);
    md.appendMarkdown(`- **Active Sessions:** \`${t.totalSessions || 0}\` sessions (${(t.totalTurns || 0).toLocaleString()} turns)\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`[👉 **Click to Open Full Dashboard Tab**](command:antigravity.openTokenDashboard)\n\n`);
    md.appendMarkdown(`[🔄 Refresh Telemetry](command:antigravity.refreshTokenTelemetry) • [⚡ Restart Server](command:antigravity.restartTokenServer)`);

    statusBarItem.tooltip = md;
    statusBarItem.show();
  } catch (err) {
    statusBarItem.text = `$(dashboard) Token Intel (Offline)`;
    statusBarItem.tooltip = 'Click to launch Antigravity Token Intelligence Server';
    statusBarItem.show();
  }
}

/**
 * Creates or reveals the full-page webview tab.
 */
async function openDashboardPanel(context) {
  await ensureServerRunning(context);

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'antigravityTokenDashboard',
    'Antigravity Token & Cost Intelligence',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableCommandUris: true
    }
  );

  const iconPath = vscode.Uri.file(path.join(context.extensionPath, 'assets', 'icon.svg'));
  currentPanel.iconPath = iconPath;

  currentPanel.webview.html = getWebviewHtml();

  currentPanel.onDidDispose(() => {
    currentPanel = null;
  }, null, context.subscriptions);
}

/**
 * Webview HTML wrapping the live dashboard.
 */
function getWebviewHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:* http://localhost:*; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Antigravity Token & Cost Intelligence</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #080b12;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      flex: 1;
      display: block;
    }
    .loader-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #080b12;
      color: #94a3b8;
      z-index: 100;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(59, 130, 246, 0.15);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      margin-bottom: 18px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loaded .loader-overlay {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .badge {
      font-size: 11px;
      padding: 3px 8px;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.25);
      color: #60a5fa;
      border-radius: 999px;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="loader" class="loader-overlay">
      <div class="spinner"></div>
      <div style="font-size: 15px; font-weight: 600; color: #f8fafc; letter-spacing: -0.01em;">
        Loading Antigravity Token Intelligence...
      </div>
      <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
        Connecting to local Antigravity telemetry engine (127.0.0.1:${SERVER_PORT})
      </div>
      <div class="badge">IDE Native Extension</div>
    </div>
    <iframe id="dashFrame" src="${SERVER_URL}" onload="document.body.classList.add('loaded')"></iframe>
  </div>
  <script>
    const frame = document.getElementById('dashFrame');
    let attempts = 0;
    const checkTimer = setInterval(() => {
      attempts++;
      if (document.body.classList.contains('loaded') || attempts > 12) {
        clearInterval(checkTimer);
        document.body.classList.add('loaded');
      } else {
        frame.src = '${SERVER_URL}?_r=' + Date.now();
      }
    }, 1200);
  </script>
</body>
</html>`;
}

/**
 * Webview Sidebar Provider for Activity Bar with All 6 Live KPI Cards
 */
class TokenDashboardSidebarProvider {
  constructor(context) {
    this.context = context;
    this.view = null;
    this.currentRange = '30d';
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getSidebarHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'openFullTab':
          vscode.commands.executeCommand('antigravity.openTokenDashboard');
          break;
        case 'ready':
          if (message.range) this.currentRange = message.range;
          this.updateSidebarData(this.currentRange);
          break;
        case 'changeRange':
          this.currentRange = message.range || '30d';
          this.updateSidebarData(this.currentRange);
          break;
        case 'refresh':
          this.updateSidebarData(this.currentRange);
          vscode.commands.executeCommand('antigravity.refreshTokenTelemetry');
          break;
      }
    });

    // Provide initial data
    this.updateSidebarData(this.currentRange);
  }

  async updateSidebarData(range = '30d') {
    if (!this.view) return;
    try {
      const [overview, sessionsData] = await Promise.all([
        fetchServerJson(`/api/overview?range=${range}`),
        fetchServerJson(`/api/sessions?range=${range}`).catch(() => ({ sessions: [] }))
      ]);
      overview.range = range;
      overview.recentSessions = (sessionsData.sessions || []).slice(0, 8);
      this.view.webview.postMessage({
        type: 'DATA_UPDATE',
        data: overview
      });
    } catch (e) {
      this.view.webview.postMessage({
        type: 'DATA_ERROR',
        error: e.message
      });
    }
  }

  getSidebarHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src http://127.0.0.1:* http://localhost:*; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--vscode-sideBar-background, #080c14);
      color: var(--vscode-sideBar-foreground, #cbd5e1);
      padding: 12px 10px;
      font-size: 11px;
      line-height: 1.4;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .title {
      font-weight: 700;
      font-size: 12px;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pill {
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      font-weight: 600;
    }

    /* Range Pill Filter */
    .range-bar {
      display: flex;
      gap: 4px;
      margin-bottom: 10px;
      background: rgba(255, 255, 255, 0.03);
      padding: 3px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .range-btn {
      flex: 1;
      padding: 4px 2px;
      background: transparent;
      border: none;
      color: #94a3b8;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s;
    }
    .range-btn:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.05);
    }
    .range-btn.active {
      background: #2563eb;
      color: #ffffff;
      box-shadow: 0 1px 4px rgba(37, 99, 235, 0.4);
    }

    /* Primary CTA */
    .btn-open {
      width: 100%;
      padding: 9px 12px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
      transition: all 0.2s;
      margin-bottom: 12px;
    }
    .btn-open:hover {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      transform: translateY(-1px);
    }

    /* 6 KPI Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 12px;
    }
    .card {
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 8px 7px;
      transition: border-color 0.2s, background 0.2s;
      position: relative;
      overflow: hidden;
    }
    .card:hover {
      border-color: rgba(59, 130, 246, 0.4);
      background: rgba(255, 255, 255, 0.04);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .card-label {
      font-size: 9px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      font-weight: 600;
    }
    .card-tag {
      font-size: 8px;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 600;
    }
    .tag-saved { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .tag-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .tag-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; }

    .card-val {
      font-size: 15px;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .card-val.tokens { color: #818cf8; }
    .card-val.cache { color: #34d399; }
    .card-val.cost { color: #38bdf8; }
    .card-val.reasoning { color: #c084fc; }
    .card-val.co2 { color: #2dd4bf; }
    .card-val.sessions { color: #93c5fd; }

    .card-sub {
      font-size: 8.5px;
      color: #64748b;
      margin-top: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Recent Sessions */
    .section-title {
      font-size: 10px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-refresh {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 9px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .btn-refresh:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }
    .session-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 5px;
      padding: 6px 8px;
      margin-bottom: 5px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .session-item:hover {
      background: rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.3);
      transform: translateX(1px);
    }
    .session-name {
      font-weight: 600;
      font-size: 10.5px;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session-meta {
      display: flex;
      justify-content: space-between;
      color: #64748b;
      font-size: 9px;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>⚡ Token Intelligence</span>
      <span class="pill" id="live-indicator">Live</span>
    </div>
  </div>

  <!-- Range Filter Pills -->
  <div class="range-bar">
    <button class="range-btn active" data-r="30d" onclick="setRange('30d')">30 Days</button>
    <button class="range-btn" data-r="all" onclick="setRange('all')">All Time</button>
    <button class="range-btn" data-r="7d" onclick="setRange('7d')">7 Days</button>
    <button class="range-btn" data-r="today" onclick="setRange('today')">Today</button>
  </div>

  <button class="btn-open" onclick="openFull()">
    <span>🚀 Open Full Dashboard Tab</span>
  </button>

  <!-- 6 Live KPI Cards Grid -->
  <div class="cards-grid">
    <!-- 1. Total Tokens -->
    <div class="card" onclick="openFull()">
      <div class="card-top">
        <span class="card-label">Total Tokens</span>
        <span class="card-tag tag-blue">Volume</span>
      </div>
      <div class="card-val tokens" id="kpi-tokens">243.4M</div>
      <div class="card-sub" id="kpi-tokens-sub">215.7M cache • 26.1M in</div>
    </div>

    <!-- 2. Cache Efficiency -->
    <div class="card" onclick="openFull()">
      <div class="card-top">
        <span class="card-label">Cache Hit Rate</span>
        <span class="card-tag tag-saved" id="kpi-saved-tag">+$21.57</span>
      </div>
      <div class="card-val cache" id="kpi-cache">89.2%</div>
      <div class="card-sub" id="kpi-cache-sub">Prompt cache discount</div>
    </div>

    <!-- 3. Estimated Spend -->
    <div class="card" onclick="openFull()">
      <div class="card-top">
        <span class="card-label">Est. Spend</span>
        <span class="card-tag tag-blue">Gemini</span>
      </div>
      <div class="card-val cost" id="kpi-cost">$6.34</div>
      <div class="card-sub" id="kpi-cost-sub">vs $27.90 without cache</div>
    </div>

    <!-- 4. Thinking & Reasoning -->
    <div class="card" onclick="openFull()">
      <div class="card-top">
        <span class="card-label">Reasoning</span>
        <span class="card-tag tag-purple" id="kpi-think-tag">52.3%</span>
      </div>
      <div class="card-val reasoning" id="kpi-reasoning">872k</div>
      <div class="card-sub" id="kpi-reasoning-sub">Thinking tokens</div>
    </div>

    <!-- 5. Estimated CO2e -->
    <div class="card" onclick="openFull()">
      <div class="card-top">
        <span class="card-label">CO₂e Footprint</span>
        <span class="card-tag tag-saved">IEA/PUE</span>
      </div>
      <div class="card-val co2" id="kpi-co2">60.9 kg</div>
      <div class="card-sub" id="kpi-co2-sub">~7,332 phone charges</div>
    </div>

    <!-- 6. Activity Sessions -->
    <div class="card" onclick="openFull()">
      <div class="card-top">
        <span class="card-label">Sessions</span>
        <span class="card-tag tag-blue">IDE</span>
      </div>
      <div class="card-val sessions" id="kpi-sessions">17</div>
      <div class="card-sub" id="kpi-sessions-sub">1,980 agent turns</div>
    </div>
  </div>

  <div class="section-title">
    <span id="sessions-heading">Recent Sessions (30d)</span>
    <button class="btn-refresh" onclick="refresh()">
      <span>🔄</span> Refresh
    </button>
  </div>
  <div id="sessions-list">
    <div style="color: #64748b; font-size: 10px; text-align: center; padding: 10px;">Loading sessions...</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentRange = '30d';

    function openFull() {
      vscode.postMessage({ command: 'openFullTab' });
    }

    function setRange(range) {
      currentRange = range;
      document.querySelectorAll('.range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-r') === range);
      });
      document.getElementById('sessions-heading').innerText = 'Recent Sessions (' + range + ')';
      loadDataDirect(range);
      vscode.postMessage({ command: 'changeRange', range: range });
    }

    function refresh() {
      loadDataDirect(currentRange);
      vscode.postMessage({ command: 'refresh', range: currentRange });
    }

    function formatNum(n) {
      if (n === null || n === undefined) return '0';
      if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
      return n ? n.toLocaleString() : '0';
    }

    function updateUI(d) {
      if (!d) return;
      // 1. Total Tokens
      document.getElementById('kpi-tokens').innerText = formatNum(d.totalTokens);
      document.getElementById('kpi-tokens-sub').innerText = 
        formatNum(d.cachedTokens) + ' cache • ' + formatNum(d.inputTokens) + ' in';

      // 2. Cache Efficiency
      const hitRate = (d.cacheHitRate || 0).toFixed(1);
      document.getElementById('kpi-cache').innerText = hitRate + '%';
      document.getElementById('kpi-saved-tag').innerText = '+$' + (d.totalSavings || 0).toFixed(2);
      document.getElementById('kpi-cache-sub').innerText = (d.totalSavings > 0)
        ? 'Saved $' + (d.totalSavings || 0).toFixed(2) + ' via cache'
        : 'Prompt cache hit rate';

      // 3. Estimated Spend
      document.getElementById('kpi-cost').innerText = '$' + (d.totalCost || 0).toFixed(2);
      document.getElementById('kpi-cost-sub').innerText = (d.uncachedCost)
        ? 'vs $' + (d.uncachedCost || 0).toFixed(2) + ' without cache'
        : 'Gemini API pricing';

      // 4. Thinking & Reasoning
      document.getElementById('kpi-reasoning').innerText = formatNum(d.thinkingTokens || 0);
      document.getElementById('kpi-think-tag').innerText = (d.thinkingRatio || 0).toFixed(1) + '%';
      document.getElementById('kpi-reasoning-sub').innerText = 
        (d.thinkingRatio || 0).toFixed(1) + '% of model output';

      // 5. Estimated CO2e
      const kg = (d.co2Kg || 0);
      document.getElementById('kpi-co2').innerText = (kg < 1)
        ? (d.co2Grams || 0).toFixed(0) + ' g'
        : kg.toFixed(1) + ' kg';
      if (d.equivalents) {
        document.getElementById('kpi-co2-sub').innerText = '~' + d.equivalents.smartphoneCharges + ' phone charges';
      }

      // 6. Activity Sessions
      document.getElementById('kpi-sessions').innerText = d.totalSessions || 0;
      document.getElementById('kpi-sessions-sub').innerText = (d.totalTurns || 0).toLocaleString() + ' agent turns';

      // Recent Sessions
      const list = document.getElementById('sessions-list');
      list.innerHTML = '';
      const sessions = d.recentSessions || [];
      if (sessions.length === 0) {
        list.innerHTML = '<div style="color: #64748b; font-size: 10px; text-align: center; padding: 8px;">No sessions in selected window.</div>';
        return;
      }

      sessions.slice(0, 6).forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-item';
        item.onclick = openFull;
        item.innerHTML = \`
          <div class="session-name">\${s.title || 'Session ' + (s.id ? s.id.slice(0, 8) : '')}</div>
          <div class="session-meta">
            <span>\${formatNum(s.totalTokens)} tokens</span>
            <span>$\${(s.cost || 0).toFixed(2)} • \${(s.co2Grams || 0).toFixed(0)}g CO₂e</span>
          </div>
        \`;
        list.appendChild(item);
      });
    }

    // Direct fetch from local daemon for instant, zero-lag load
    async function loadDataDirect(range) {
      try {
        const [ovRes, sessRes] = await Promise.all([
          fetch('http://127.0.0.1:3333/api/overview?range=' + range),
          fetch('http://127.0.0.1:3333/api/sessions?range=' + range)
        ]);
        if (ovRes.ok && sessRes.ok) {
          const ov = await ovRes.json();
          const sess = await sessRes.json();
          ov.recentSessions = sess.sessions || [];
          updateUI(ov);
          return;
        }
      } catch (err) {
        // Fallback to extension host message if direct fetch encounters issues
      }
    }

    // Listen for extension host updates
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'DATA_UPDATE') {
        updateUI(msg.data);
      }
    });

    // Notify extension host on load and load initial 30d data immediately
    vscode.postMessage({ command: 'ready', range: '30d' });
    loadDataDirect('30d');

    // Auto-poll every 15 seconds
    setInterval(() => loadDataDirect(currentRange), 15000);
  </script>
</body>
</html>`;
  }
}

/**
 * Extension Activation
 */
async function activate(context) {
  // 1. Initialize Status Bar Item (defaults to Last 30 Days)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'antigravity.openTokenDashboard';
  statusBarItem.text = `$(dashboard) Token Intel (30d)...`;
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 2. Register Activity Bar Sidebar Provider
  const sidebarProvider = new TokenDashboardSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'antigravity.tokenDashboardSidebar',
      sidebarProvider
    )
  );

  // 3. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.openTokenDashboard', () => {
      openDashboardPanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.refreshTokenTelemetry', async () => {
      await updateStatusBar();
      sidebarProvider.updateSidebarData(sidebarProvider.currentRange);
      vscode.window.showInformationMessage('Antigravity Token & Cost telemetry refreshed.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.restartTokenServer', async () => {
      vscode.window.showInformationMessage('Restarting Antigravity Token Intelligence daemon...');
      if (serverProcess) {
        try { serverProcess.kill(); } catch (e) {}
        serverProcess = null;
      }
      await ensureServerRunning(context);
      await updateStatusBar();
      sidebarProvider.updateSidebarData(sidebarProvider.currentRange);
      vscode.window.showInformationMessage('Antigravity Token Intelligence daemon restarted on 127.0.0.1:3333.');
    })
  );

  // 4. Initial server check and start background polling
  ensureServerRunning(context).then(() => {
    updateStatusBar();
    sidebarProvider.updateSidebarData('30d');
  });

  pollTimer = setInterval(() => {
    updateStatusBar();
    sidebarProvider.updateSidebarData(sidebarProvider.currentRange);
  }, 25000);

  context.subscriptions.push({
    dispose: () => {
      if (pollTimer) clearInterval(pollTimer);
    }
  });
}

function deactivate() {
  if (pollTimer) clearInterval(pollTimer);
  if (serverProcess) {
    try { serverProcess.kill(); } catch (e) {}
  }
}

exports.activate = activate;
exports.deactivate = deactivate;
