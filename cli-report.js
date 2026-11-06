/**
 * CLI Summary & In-IDE Artifact Reporter for Antigravity IDE
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

// Base paths & cross-platform resolution
const HOME = os.homedir();

function resolveConversationDirs() {
  if (process.env.ANTIGRAVITY_DIR && fs.existsSync(process.env.ANTIGRAVITY_DIR)) {
    return [path.join(process.env.ANTIGRAVITY_DIR, 'conversations')];
  }
  const candidates = [
    path.join(HOME, '.gemini', 'antigravity'),
    path.join(HOME, '.gemini', 'antigravity-ide'),
    path.join(HOME, '.antigravity'),
    path.join(HOME, '.antigravity-ide'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Antigravity') : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Antigravity IDE') : null,
    path.join(HOME, 'Library', 'Application Support', 'Antigravity'),
    path.join(HOME, 'Library', 'Application Support', 'Antigravity IDE'),
    path.join(HOME, '.config', 'antigravity'),
    path.join(HOME, '.config', 'antigravity-ide')
  ].filter(Boolean);

  const dirs = [];
  for (const c of candidates) {
    const convDir = path.join(c, 'conversations');
    if (fs.existsSync(convDir)) {
      dirs.push(convDir);
    }
  }
  return dirs.length > 0 ? dirs : [path.join(HOME, '.gemini', 'antigravity', 'conversations')];
}

const CONVERSATIONS_DIRS = resolveConversationDirs();

const PRICING = {
  'Gemini 4 Argon': { inputPerM: 0.15, cachedPerM: 0.0375, outputPerM: 0.60 },
  'Gemini 3.8 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 3.7 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 3.6 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 3.5 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 3.0 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 2.5 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'Gemini 2.5 Pro': { inputPerM: 1.25, cachedPerM: 0.3125, outputPerM: 5.00 },
  'Claude Sonnet 4.6': { inputPerM: 3.00, cachedPerM: 0.30, outputPerM: 15.00 },
  'Claude 3.7 Sonnet': { inputPerM: 3.00, cachedPerM: 0.30, outputPerM: 15.00 },
  'default': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 }
};

function getRatesForModel(model) {
  if (!model) return PRICING.default;
  if (PRICING[model]) return PRICING[model];
  const lower = model.toLowerCase();
  if (lower.includes('claude')) return PRICING['Claude Sonnet 4.6'];
  if (lower.includes('argon') || lower.includes('gemini 4')) return PRICING['Gemini 4 Argon'];
  if (lower.includes('pro') || lower.includes('ultra')) return PRICING['Gemini 2.5 Pro'];
  return PRICING.default;
}

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

function parseGenMetaModel(buf) {
  if (!buf) return null;
  let pos = 0;
  let modelId = null, modelName = null;
  while (pos < buf.length) {
    const [tagWire, newPos] = decodeVarint(buf, pos);
    if (newPos <= pos) break;
    pos = newPos;
    const wire = tagWire & 7;
    const field = tagWire >> 3;
    if (wire === 2) {
      const [len, dataPos] = decodeVarint(buf, pos);
      pos = dataPos + len;
      if (field === 1 && dataPos + len <= buf.length) {
        const sub = buf.subarray(dataPos, dataPos + len);
        let sPos = 0;
        while (sPos < sub.length) {
          const [sTag, nextSPos] = decodeVarint(sub, sPos);
          if (nextSPos <= sPos) break;
          sPos = nextSPos;
          const sWire = sTag & 7;
          const sField = sTag >> 3;
          if (sWire === 2) {
            const [sLen, sDataPos] = decodeVarint(sub, sPos);
            sPos = sDataPos + sLen;
            if (sDataPos + sLen <= sub.length) {
              if (sField === 19) modelId = sub.subarray(sDataPos, sDataPos + sLen).toString('utf8').trim();
              else if (sField === 21) modelName = sub.subarray(sDataPos, sDataPos + sLen).toString('utf8').trim();
            }
          } else if (sWire === 0) {
            const [, endPos] = decodeVarint(sub, sPos);
            sPos = endPos;
          } else if (sWire === 1) sPos += 8;
          else if (sWire === 5) sPos += 4;
          else break;
        }
      }
    } else if (wire === 0) {
      const [, nextPos] = decodeVarint(buf, pos);
      pos = nextPos;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else break;
  }
  return { modelId, modelName };
}

function detectModel(db) {
  try {
    const rows = db.prepare('SELECT data FROM gen_metadata ORDER BY idx DESC LIMIT 25').all();
    for (const r of rows) {
      if (!r.data) continue;
      const buf = Buffer.from(r.data);
      const parsed = parseGenMetaModel(buf);
      if (parsed && parsed.modelName) {
        const cleaned = parsed.modelName.replace(/\s*\((?:Low|Medium|High|Minimal|Thinking|Fast|Standard)\)$/i, '').trim();
        if (cleaned) return cleaned;
      }
      const str = `${parsed ? parsed.modelId || '' : ''} ${buf.toString('latin1')}`.toLowerCase();
      if (str.includes('gemini-4-argon') || str.includes('gemini 4 argon')) return 'Gemini 4 Argon';
      if (str.includes('gemini-3.8-flash')) return 'Gemini 3.8 Flash';
      if (str.includes('gemini-3.7-flash')) return 'Gemini 3.7 Flash';
      if (str.includes('gemini-3.6-flash')) return 'Gemini 3.6 Flash';
      if (str.includes('gemini-3.5-flash') || str.includes('gemini-default')) return 'Gemini 3.5 Flash';
      if (str.includes('gemini-3-flash')) return 'Gemini 3.0 Flash';
      if (str.includes('gemini-2.5-pro') || str.includes('gemini-pro')) return 'Gemini 2.5 Pro';
      if (str.includes('claude-sonnet-4-6') || str.includes('claude-4')) return 'Claude Sonnet 4.6';
      if (str.includes('claude')) return 'Claude 3.7 Sonnet';
    }
  } catch (e) {}
  return 'Gemini 3.8 Flash';
}

function getTokenMetrics(buf) {
  if (!buf) return null;
  let pos = 0;
  while (pos < buf.length) {
    const [tagWire, newPos] = decodeVarint(buf, pos);
    if (newPos <= pos) break;
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
          if (nextSubPos <= subPos) break;
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
          } else break;
        }
        return { inputTokens, cachedTokens, outputTokens, thinkingTokens };
      }
    } else if (wire === 0) {
      const [, nextPos] = decodeVarint(buf, pos);
      pos = nextPos;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else break;
  }
  return null;
}

const dbFilesById = new Map();
for (const convDir of CONVERSATIONS_DIRS) {
  if (!fs.existsSync(convDir)) continue;
  const files = fs.readdirSync(convDir).filter(f => f.endsWith('.db') && !f.includes('-shm') && !f.includes('-wal'));
  for (const f of files) {
    const id = path.basename(f, '.db');
    const fullPath = path.join(convDir, f);
    try {
      const mtime = fs.statSync(fullPath).mtimeMs;
      const existing = dbFilesById.get(id);
      if (!existing || mtime > existing.mtime) {
        dbFilesById.set(id, { fullPath, mtime });
      }
    } catch (e) {}
  }
}

let totalInput = 0, totalCached = 0, totalOutput = 0, totalThinking = 0;
let totalTurns = 0, sessionCount = 0;
let totalCost = 0, totalUncachedCost = 0;
const modelCounts = {};

for (const { fullPath } of dbFilesById.values()) {
  let db;
  try {
    db = new DatabaseSync(fullPath, { open: true, readOnly: true });
    const model = detectModel(db);
    const rates = getRatesForModel(model);
    const rows = db.prepare('SELECT metadata FROM steps WHERE step_type = 15').all();
    let sInput = 0, sCached = 0, sOutput = 0, sThinking = 0;
    for (const r of rows) {
      const m = getTokenMetrics(r.metadata ? Buffer.from(r.metadata) : null);
      if (m) {
        sInput += m.inputTokens;
        sCached += m.cachedTokens;
        sOutput += m.outputTokens;
        sThinking += m.thinkingTokens;
      }
    }
    if (sInput + sCached + sOutput > 0) {
      sessionCount++;
      totalTurns += rows.length;
      totalInput += sInput;
      totalCached += sCached;
      totalOutput += sOutput;
      totalThinking += sThinking;
      totalCost += (sInput * rates.inputPerM + sCached * rates.cachedPerM + sOutput * rates.outputPerM) / 1_000_000;
      totalUncachedCost += ((sInput + sCached) * rates.inputPerM + sOutput * rates.outputPerM) / 1_000_000;
      modelCounts[model] = (modelCounts[model] || 0) + 1;
    }
  } catch (e) {
  } finally {
    if (db) {
      try { db.close(); } catch (e) {}
    }
  }
}

const totalTokens = totalInput + totalCached + totalOutput;
const hitRate = (totalInput + totalCached) > 0 ? (totalCached / (totalInput + totalCached)) * 100 : 0;
const savings = Math.max(0, totalUncachedCost - totalCost);
const co2Grams = (totalTokens / 1000) * 0.25;

console.log(`\n======================================================`);
console.log(`      ANTIGRAVITY IDE TOKEN & COST INTELLIGENCE       `);
console.log(`======================================================`);
console.log(`  Total Sessions Analyzed:  ${sessionCount.toLocaleString()}`);
console.log(`  Total Agent Turns:        ${totalTurns.toLocaleString()}`);
console.log(`  Models Detected:          ${Object.entries(modelCounts).map(([k, v]) => `${k} (${v})`).join(', ')}`);
console.log(`------------------------------------------------------`);
console.log(`  Fresh Input Tokens:       ${totalInput.toLocaleString().padStart(12)} (${((totalInput/(totalTokens || 1))*100).toFixed(1)}%)`);
console.log(`  Context Cached Tokens:    ${totalCached.toLocaleString().padStart(12)} (${((totalCached/(totalTokens || 1))*100).toFixed(1)}%)`);
console.log(`  Total Output Tokens:      ${totalOutput.toLocaleString().padStart(12)} (${((totalOutput/(totalTokens || 1))*100).toFixed(1)}%)`);
console.log(`    ↳ Thinking Tokens:      ${totalThinking.toLocaleString().padStart(12)} (${((totalThinking/(totalOutput || 1))*100).toFixed(1)}% of output)`);
console.log(`  TOTAL TOKENS:             ${totalTokens.toLocaleString().padStart(12)}`);
console.log(`------------------------------------------------------`);
console.log(`  Prompt Cache Efficiency:  ${hitRate.toFixed(1)}% hit rate`);
console.log(`  Estimated Spend:          $${totalCost.toFixed(2)}`);
console.log(`  Cost Without Caching:     $${totalUncachedCost.toFixed(2)}`);
console.log(`  Prompt Cache Savings:     $${savings.toFixed(2)} saved!`);
console.log(`  CO2 Equivalent:           ${(co2Grams/1000).toFixed(2)} kg CO2e (~${(co2Grams/120).toFixed(1)} km by car)`);
console.log(`    ↳ Methodology Source:   0.25g CO2e / 1k tokens (Google Cloud PUE ~1.10; Patterson et al. / Luccioni et al. 2023)`);
console.log(`======================================================\n`);
