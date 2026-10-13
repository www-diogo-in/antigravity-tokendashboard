/**
 * CLI Summary & In-IDE Artifact Reporter for Antigravity IDE
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

// Base paths & cross-platform resolution
const HOME = os.homedir();

function resolveAntigravityPaths() {
  if (process.env.ANTIGRAVITY_DIR && fs.existsSync(process.env.ANTIGRAVITY_DIR)) {
    return path.join(process.env.ANTIGRAVITY_DIR, 'conversations');
  }
  const candidates = [
    path.join(HOME, '.gemini', 'antigravity-ide'),
    path.join(HOME, '.antigravity-ide'),
    path.join(HOME, '.antigravity'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Antigravity IDE') : null,
    path.join(HOME, 'Library', 'Application Support', 'Antigravity IDE'),
    path.join(HOME, '.config', 'antigravity-ide')
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'conversations'))) {
      return path.join(c, 'conversations');
    }
  }
  return path.join(HOME, '.gemini', 'antigravity-ide', 'conversations');
}

const CONVERSATIONS_DIR = resolveAntigravityPaths();

const PRICING = {
  'Gemini 3.8 Flash': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 },
  'default': { inputPerM: 0.075, cachedPerM: 0.01875, outputPerM: 0.30 }
};

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
          } else break;
        }
        return { inputTokens, cachedTokens, outputTokens, thinkingTokens };
      }
    } else if (wire === 0) {
      const [val, nextPos] = decodeVarint(buf, pos);
      pos = nextPos;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else break;
  }
  return null;
}

let totalInput = 0, totalCached = 0, totalOutput = 0, totalThinking = 0;
let totalTurns = 0, sessionCount = 0;

if (fs.existsSync(CONVERSATIONS_DIR)) {
  const files = fs.readdirSync(CONVERSATIONS_DIR).filter(f => f.endsWith('.db') && !f.includes('-shm') && !f.includes('-wal'));
  for (const f of files) {
    try {
      const db = new DatabaseSync(path.join(CONVERSATIONS_DIR, f), { open: true, readOnly: true });
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
      }
    } catch (e) {}
  }
}

const totalTokens = totalInput + totalCached + totalOutput;
const hitRate = (totalInput + totalCached) > 0 ? (totalCached / (totalInput + totalCached)) * 100 : 0;
const rates = PRICING['Gemini 3.8 Flash'];
const cost = (totalInput * rates.inputPerM + totalCached * rates.cachedPerM + totalOutput * rates.outputPerM) / 1_000_000;
const uncachedCost = ((totalInput + totalCached) * rates.inputPerM + totalOutput * rates.outputPerM) / 1_000_000;
const savings = uncachedCost - cost;
const co2Grams = (totalTokens / 1000) * 0.25;

console.log(`\n======================================================`);
console.log(`      ANTIGRAVITY IDE TOKEN & COST INTELLIGENCE       `);
console.log(`======================================================`);
console.log(`  Total Sessions Analyzed:  ${sessionCount.toLocaleString()}`);
console.log(`  Total Agent Turns:        ${totalTurns.toLocaleString()}`);
console.log(`------------------------------------------------------`);
console.log(`  Fresh Input Tokens:       ${totalInput.toLocaleString().padStart(12)} (${((totalInput/totalTokens)*100).toFixed(1)}%)`);
console.log(`  Context Cached Tokens:    ${totalCached.toLocaleString().padStart(12)} (${((totalCached/totalTokens)*100).toFixed(1)}%)`);
console.log(`  Total Output Tokens:      ${totalOutput.toLocaleString().padStart(12)} (${((totalOutput/totalTokens)*100).toFixed(1)}%)`);
console.log(`    ↳ Thinking Tokens:      ${totalThinking.toLocaleString().padStart(12)} (${((totalThinking/totalOutput)*100).toFixed(1)}% of output)`);
console.log(`  TOTAL TOKENS:             ${totalTokens.toLocaleString().padStart(12)}`);
console.log(`------------------------------------------------------`);
console.log(`  Prompt Cache Efficiency:  ${hitRate.toFixed(1)}% hit rate`);
console.log(`  Estimated Spend:          $${cost.toFixed(2)}`);
console.log(`  Cost Without Caching:     $${uncachedCost.toFixed(2)}`);
console.log(`  Prompt Cache Savings:     $${savings.toFixed(2)} saved!`);
console.log(`  CO2 Equivalent:           ${(co2Grams/1000).toFixed(2)} kg CO2e (~${(co2Grams/120).toFixed(1)} km by car)`);
console.log(`    ↳ Methodology Source:   0.25g CO2e / 1k tokens (Google Cloud PUE ~1.10; Patterson et al. / Luccioni et al. 2023)`);
console.log(`======================================================\n`);
