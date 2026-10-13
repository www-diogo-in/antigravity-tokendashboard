/**
 * Antigravity Token, Cost & Carbon Dashboard Server
 * Native intelligence dashboard for Google Antigravity IDE.
 * Zero external dependencies: uses Node.js standard libraries.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { exec } = require('node:child_process');

const PORT = parseInt(process.env.PORT || '3333', 10);
const HOST = '127.0.0.1';

// Base paths
const HOME = os.homedir();
const ANTIGRAVITY_DIR = path.join(HOME, '.gemini', 'antigravity-ide');
const CONVERSATIONS_DIR = path.join(ANTIGRAVITY_DIR, 'conversations');
const BRAIN_DIR = path.join(ANTIGRAVITY_DIR, 'brain');
const INSTALLATION_FILE = path.join(ANTIGRAVITY_DIR, 'installation_id');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Pricing per 1,000,000 tokens (USD)
const PRICING = {
  'Gemini 3.8 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 3.7 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 2.5 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 2.5 Pro': { inputPerM: 1.25, cachedPerM: 0.3125, outputPerM: 5.00 },
  'Gemini 1.5 Pro': { inputPerM: 1.25, cachedPerM: 0.3125, outputPerM: 5.00 },
  'Claude 3.7 Sonnet': { inputPerM: 3.00, cachedPerM: 0.30, outputPerM: 15.00 },
  'Claude': { inputPerM: 3.00, cachedPerM: 0.30, outputPerM: 15.00 },
  'default': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 }
};

// In-memory cache for parsed sessions to make requests instant
const sessionCache = new Map();
let lastScanTime = 0;

function decodeVarint(buf, offset) {
  let res = 0, shift = 0;
  while (offset < buf.length) {
    const b = buf[offset++];
    res += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
    if (!(b & 0x80)) break;
  }
  return [res, offset];
}

function getTimestamp(buf) {
  if (!buf || buf.length < 5) return null;
  if (buf[0] === 10) {
    const [len, posAfter] = decodeVarint(buf, 1);
    let pos = posAfter;
    const end = Math.min(buf.length, posAfter + len);
    while (pos < end) {
      const [tagWire, newPos] = decodeVarint(buf, pos);
      pos = newPos;
      const wire = tagWire & 7;
      const field = tagWire >> 3;
      if (wire === 0) {
        const [val, nextPos] = decodeVarint(buf, pos);
        pos = nextPos;
        if (field === 1) return val; // seconds
      } else if (wire === 2) {
        const [subLen, nextPos] = decodeVarint(buf, pos);
        pos = nextPos + subLen;
      } else {
        break;
      }
    }
  }
  return null;
}

function getTokenMetrics(buf) {
  if (!buf) return null;
  let pos = 0;
  while (pos < buf.length) {
    const [tagWire, newPos] = decodeVarint(buf, pos);
    pos = newPos;
    const wire = tagWire & 7;
    const field = tagWire >> 3;
    if (wire === 2) {
      const [len, dataPos] = decodeVarint(buf, pos);
      pos = dataPos + len;
      if (field === 9) {
        const sub = buf.subarray(dataPos, dataPos + len);
        let subPos = 0;
        let inputTokens = 0, cachedTokens = 0, outputTokens = 0, thinkingTokens = 0;
        while (subPos < sub.length) {
          const [sTag, nextSubPos] = decodeVarint(sub, subPos);
          subPos = nextSubPos;
          const sWire = sTag & 7;
          const sField = sTag >> 3;
          if (sWire === 0) {
            const [val, endPos] = decodeVarint(sub, subPos);
            subPos = endPos;
            if (sField === 2) inputTokens = val;
            else if (sField === 3) outputTokens = val;
            else if (sField === 5) cachedTokens = val;
            else if (sField === 9) thinkingTokens = val;
          } else if (sWire === 2) {
            const [sLen, endPos] = decodeVarint(sub, subPos);
            subPos = endPos + sLen;
          } else {
            break;
          }
        }
        return { inputTokens, cachedTokens, outputTokens, thinkingTokens };
      }
    } else if (wire === 0) {
      const [val, nextPos] = decodeVarint(buf, pos);
      pos = nextPos;
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else {
      break;
    }
  }
  return null;
}

function detectModel(db) {
  try {
    const rows = db.prepare('SELECT data FROM gen_metadata LIMIT 10').all();
    for (const r of rows) {
      if (!r.data) continue;
      const str = Buffer.from(r.data).toString('latin1');
      if (str.includes('gemini-3.8-flash')) return 'Gemini 3.8 Flash';
      if (str.includes('gemini-3.7-flash')) return 'Gemini 3.7 Flash';
      if (str.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
      if (str.includes('gemini-2.5-pro') || str.includes('gemini-1.5-pro')) return 'Gemini 2.5 Pro';
      if (str.includes('claude-3-7-sonnet') || str.includes('claude-sonnet')) return 'Claude 3.7 Sonnet';
      if (str.includes('claude')) return 'Claude';
    }
  } catch (e) {}
  return 'Gemini 3.8 Flash';
}

function getInstallationId() {
  try {
    if (fs.existsSync(INSTALLATION_FILE)) {
      return fs.readFileSync(INSTALLATION_FILE, 'utf8').trim();
    }
  } catch (e) {}
  return 'local-user';
}

function extractPromptTitle(id, db) {
  // First attempt: read transcript.jsonl
  try {
    const tPath = path.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl');
    if (fs.existsSync(tPath)) {
      const firstLine = fs.readFileSync(tPath, 'utf8').split('\n')[0];
      if (firstLine) {
        const obj = JSON.parse(firstLine);
        if (obj.content) {
          const m = obj.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
          if (m) {
            return m[1].trim().replace(/\r?\n+/g, ' ').slice(0, 100);
          }
          return obj.content.trim().slice(0, 100);
        }
      }
    }
  } catch (e) {}

  // Fallback: examine step 0 in db
  try {
    const r = db.prepare('SELECT step_payload FROM steps WHERE idx = 0').get();
    if (r && r.step_payload) {
      const str = Buffer.from(r.step_payload).toString('utf8');
      const m = str.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
      if (m) {
        return m[1].trim().replace(/\r?\n+/g, ' ').slice(0, 100);
      }
      const words = str.replace(/[^\x20-\x7E]/g, ' ').split(/\s+/).filter(w => w.length > 2);
      if (words.length > 3) {
        return words.slice(3, 18).join(' ').slice(0, 100);
      }
    }
  } catch (e) {}

  return `Conversation ${id.slice(0, 8)}`;
}

function parseSession(dbFile) {
  const id = path.basename(dbFile, '.db');
  const dbPath = path.join(CONVERSATIONS_DIR, dbFile);

  const stats = fs.statSync(dbPath);
  const mtime = stats.mtimeMs;

  const cached = sessionCache.get(id);
  if (cached && cached.mtime === mtime) {
    return cached.data;
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  } catch (e) {
    return cached ? cached.data : null;
  }

  const model = detectModel(db);
  const title = extractPromptTitle(id, db);

  const rows = db.prepare('SELECT idx, metadata, step_type FROM steps ORDER BY idx ASC').all();
  let firstTs = null;
  let lastTs = null;
  let inputTokens = 0;
  let cachedTokens = 0;
  let outputTokens = 0;
  let thinkingTokens = 0;
  let agentTurns = 0;
  let toolSteps = 0;

  const turnsTimeline = [];

  for (const r of rows) {
    const ts = getTimestamp(r.metadata ? Buffer.from(r.metadata) : null);
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }

    if (r.step_type === 15) { // PLANNER_RESPONSE turn
      agentTurns++;
      const metrics = getTokenMetrics(r.metadata ? Buffer.from(r.metadata) : null);
      if (metrics) {
        inputTokens += metrics.inputTokens;
        cachedTokens += metrics.cachedTokens;
        outputTokens += metrics.outputTokens;
        thinkingTokens += metrics.thinkingTokens;

        turnsTimeline.push({
          stepIdx: r.idx,
          timestamp: ts ? new Date(ts * 1000).toISOString() : null,
          inputTokens: metrics.inputTokens,
          cachedTokens: metrics.cachedTokens,
          outputTokens: metrics.outputTokens,
          thinkingTokens: metrics.thinkingTokens
        });
      }
    } else if (r.step_type > 15 && r.step_type < 98) {
      toolSteps++;
    }
  }

  const rates = PRICING[model] || PRICING.default;
  const actualCost = (inputTokens * rates.inputPerM + cachedTokens * rates.cachedPerM + outputTokens * rates.outputPerM) / 1_000_000;
  const uncachedCost = ((inputTokens + cachedTokens) * rates.inputPerM + outputTokens * rates.outputPerM) / 1_000_000;
  const savings = Math.max(0, uncachedCost - actualCost);
  const totalTokens = inputTokens + cachedTokens + outputTokens;
  const co2Grams = (totalTokens / 1000) * 0.25;

  const data = {
    id,
    title,
    model,
    createdAt: firstTs ? new Date(firstTs * 1000).toISOString() : new Date(stats.birthtimeMs).toISOString(),
    updatedAt: lastTs ? new Date(lastTs * 1000).toISOString() : new Date(mtime).toISOString(),
    totalSteps: rows.length,
    agentTurns,
    toolSteps,
    inputTokens,
    cachedTokens,
    outputTokens,
    thinkingTokens,
    textTokens: Math.max(0, outputTokens - thinkingTokens),
    totalTokens,
    cacheHitRate: totalTokens > 0 ? ((cachedTokens / (inputTokens + cachedTokens || 1)) * 100) : 0,
    cost: actualCost,
    uncachedCost,
    savings,
    co2Grams,
    turnsTimeline
  };

  sessionCache.set(id, { mtime, data });
  return data;
}

function scanAllSessions() {
  if (!fs.existsSync(CONVERSATIONS_DIR)) return [];
  const files = fs.readdirSync(CONVERSATIONS_DIR).filter(f => f.endsWith('.db') && !f.includes('-shm') && !f.includes('-wal'));
  const results = [];
  for (const f of files) {
    const s = parseSession(f);
    if (s && s.totalTokens > 0) {
      results.push(s);
    }
  }
  lastScanTime = Date.now();
  return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function filterByRange(sessions, range) {
  if (!range || range === 'all') return sessions;
  const now = Date.now();
  let ms = 0;
  if (range === 'today' || range === '24h') ms = 24 * 3600 * 1000;
  else if (range === '7d') ms = 7 * 24 * 3600 * 1000;
  else if (range === '30d') ms = 30 * 24 * 3600 * 1000;
  else return sessions;

  return sessions.filter(s => (now - new Date(s.updatedAt).getTime()) <= ms);
}

// REST API Handlers
function handleApiOverview(req, res, url) {
  const range = url.searchParams.get('range') || 'all';
  const allSessions = scanAllSessions();
  const sessions = filterByRange(allSessions, range);

  let inputTokens = 0;
  let cachedTokens = 0;
  let outputTokens = 0;
  let thinkingTokens = 0;
  let textTokens = 0;
  let totalCost = 0;
  let uncachedCost = 0;
  let totalSavings = 0;
  let co2Grams = 0;
  let totalTurns = 0;

  const modelBreakdown = {};

  for (const s of sessions) {
    inputTokens += s.inputTokens;
    cachedTokens += s.cachedTokens;
    outputTokens += s.outputTokens;
    thinkingTokens += s.thinkingTokens;
    textTokens += s.textTokens;
    totalCost += s.cost;
    uncachedCost += s.uncachedCost;
    totalSavings += s.savings;
    co2Grams += s.co2Grams;
    totalTurns += s.agentTurns;

    if (!modelBreakdown[s.model]) {
      modelBreakdown[s.model] = {
        model: s.model,
        sessionsCount: 0,
        turnsCount: 0,
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        cost: 0
      };
    }
    const m = modelBreakdown[s.model];
    m.sessionsCount++;
    m.turnsCount += s.agentTurns;
    m.inputTokens += s.inputTokens;
    m.cachedTokens += s.cachedTokens;
    m.outputTokens += s.outputTokens;
    m.cost += s.cost;
  }

  const totalTokens = inputTokens + cachedTokens + outputTokens;
  const cacheHitRate = (inputTokens + cachedTokens) > 0
    ? (cachedTokens / (inputTokens + cachedTokens)) * 100
    : 0;

  const thinkingRatio = outputTokens > 0
    ? (thinkingTokens / outputTokens) * 100
    : 0;

  const response = {
    installationId: getInstallationId(),
    range,
    totalSessions: sessions.length,
    totalTurns,
    totalTokens,
    inputTokens,
    cachedTokens,
    outputTokens,
    thinkingTokens,
    textTokens,
    cacheHitRate: Math.round(cacheHitRate * 10) / 10,
    thinkingRatio: Math.round(thinkingRatio * 10) / 10,
    totalCost: Math.round(totalCost * 1000) / 1000,
    uncachedCost: Math.round(uncachedCost * 1000) / 1000,
    totalSavings: Math.round(totalSavings * 1000) / 1000,
    co2Grams: Math.round(co2Grams * 10) / 10,
    co2Kg: Math.round((co2Grams / 1000) * 100) / 100,
    equivalents: {
      carKilometers: Math.round((co2Grams / 120) * 10) / 10,
      smartphoneCharges: Math.round(co2Grams / 8.3),
      streamingHours: Math.round((co2Grams / 36) * 10) / 10
    },
    models: Object.values(modelBreakdown).sort((a, b) => b.cost - a.cost),
    pricingTable: PRICING
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

function handleApiSeries(req, res, url) {
  const range = url.searchParams.get('range') || 'all';
  const granularity = url.searchParams.get('granularity') || 'day';
  const allSessions = scanAllSessions();
  const sessions = filterByRange(allSessions, range);

  const buckets = {};

  for (const s of sessions) {
    for (const t of s.turnsTimeline) {
      if (!t.timestamp) continue;
      const d = new Date(t.timestamp);
      let key;
      if (granularity === 'hour') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }

      if (!buckets[key]) {
        buckets[key] = {
          date: key,
          inputTokens: 0,
          cachedTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
          totalTokens: 0,
          cost: 0,
          turns: 0
        };
      }

      const b = buckets[key];
      b.inputTokens += t.inputTokens;
      b.cachedTokens += t.cachedTokens;
      b.outputTokens += t.outputTokens;
      b.thinkingTokens += t.thinkingTokens;
      b.totalTokens += t.inputTokens + t.cachedTokens + t.outputTokens;
      b.turns += 1;

      const rates = PRICING[s.model] || PRICING.default;
      b.cost += (t.inputTokens * rates.inputPerM + t.cachedTokens * rates.cachedPerM + t.outputTokens * rates.outputPerM) / 1_000_000;
    }
  }

  const series = Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
  let cumulativeTokens = 0;
  let cumulativeCost = 0;
  let cumulativeCo2 = 0;
  for (const item of series) {
    cumulativeTokens += item.totalTokens;
    cumulativeCost += item.cost;
    item.co2Grams = Math.round((item.totalTokens / 1000) * 0.25 * 10) / 10;
    cumulativeCo2 += item.co2Grams;
    item.cumulativeTokens = cumulativeTokens;
    item.cumulativeCost = Math.round(cumulativeCost * 1000) / 1000;
    item.cumulativeCo2 = Math.round(cumulativeCo2 * 10) / 10;
    item.cost = Math.round(item.cost * 10000) / 10000;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ granularity, series }));
}

function handleApiSessions(req, res, url) {
  const range = url.searchParams.get('range') || 'all';
  const query = (url.searchParams.get('search') || '').toLowerCase();
  const allSessions = scanAllSessions();
  let sessions = filterByRange(allSessions, range);

  if (query) {
    sessions = sessions.filter(s =>
      s.title.toLowerCase().includes(query) ||
      s.id.toLowerCase().includes(query) ||
      s.model.toLowerCase().includes(query)
    );
  }

  const response = sessions.map(s => ({
    id: s.id,
    title: s.title,
    model: s.model,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    agentTurns: s.agentTurns,
    toolSteps: s.toolSteps,
    inputTokens: s.inputTokens,
    cachedTokens: s.cachedTokens,
    outputTokens: s.outputTokens,
    thinkingTokens: s.thinkingTokens,
    totalTokens: s.totalTokens,
    cacheHitRate: Math.round(s.cacheHitRate * 10) / 10,
    cost: Math.round(s.cost * 1000) / 1000,
    savings: Math.round(s.savings * 1000) / 1000,
    co2Grams: Math.round(s.co2Grams * 10) / 10
  }));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ total: response.length, sessions: response }));
}

function handleApiSessionDetail(req, res, id) {
  const dbFile = `${id}.db`;
  if (!fs.existsSync(path.join(CONVERSATIONS_DIR, dbFile))) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Session not found' }));
  }

  const session = parseSession(dbFile);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(session));
}

// Serve Static Files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        return res.end('Internal Server Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

// Main HTTP Dispatcher
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/overview') {
    return handleApiOverview(req, res, parsedUrl);
  }
  if (pathname === '/api/series') {
    return handleApiSeries(req, res, parsedUrl);
  }
  if (pathname === '/api/sessions') {
    return handleApiSessions(req, res, parsedUrl);
  }
  if (pathname.startsWith('/api/sessions/')) {
    const id = pathname.replace('/api/sessions/', '');
    return handleApiSessionDetail(req, res, id);
  }
  if (pathname === '/api/refresh' || pathname === '/api/notify-hook') {
    sessionCache.clear();
    scanAllSessions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', reloadedAt: new Date().toISOString() }));
  }

  // Fallback to static assets
  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`=======================================================`);
  console.log(`  Antigravity Token & Cost Dashboard is running!`);
  console.log(`  URL: ${url}`);
  console.log(`  Monitoring: ${CONVERSATIONS_DIR}`);
  console.log(`=======================================================`);

  if (process.argv.includes('--open')) {
    const startCmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
    exec(startCmd);
  }
});
