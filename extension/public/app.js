/**
 * Antigravity Token, Cost & Reasoning Dashboard Client
 * High-performance, reactive, standalone dashboard logic.
 */

(function () {
  'use strict';

  // State
  let currentRange = '30d';
  let metricMode = 'tokens'; // 'tokens' | 'cost'
  let searchQuery = '';
  let sortMode = 'date-desc';

  let overviewData = null;
  let seriesData = [];
  let sessionsData = [];

  // DOM Elements
  const refreshBtn = document.getElementById('refreshBtn');
  const rangeGroup = document.getElementById('rangeFilterGroup');
  const chartViewToggle = document.getElementById('chartViewToggle');
  const searchInput = document.getElementById('sessionSearchInput');
  const sortSelect = document.getElementById('sessionSortSelect');
  const sessionsTableBody = document.getElementById('sessionsTableBody');
  const modelsList = document.getElementById('modelsList');

  // Timeline canvas & tooltip
  const canvas = document.getElementById('timelineChart');
  const chartContainer = document.getElementById('timelineChartContainer');
  const tooltip = document.getElementById('chartTooltip');

  // Modal elements
  const modalBackdrop = document.getElementById('sessionModalBackdrop');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalCanvas = document.getElementById('modalTrajectoryChart');

  // Formatting helpers
  function formatNumber(num) {
    if (num === null || num === undefined) return '--';
    return Number(num).toLocaleString();
  }

  function formatCompact(num) {
    if (num === null || num === undefined) return '--';
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k';
    return num.toLocaleString();
  }

  function formatCurrency(val) {
    if (val === null || val === undefined) return '$0.00';
    return '$' + Number(val).toFixed(val < 1 ? 3 : 2);
  }

  function formatCo2(grams) {
    if (grams === null || grams === undefined) return '--';
    if (grams >= 1000) return (grams / 1000).toFixed(2) + ' kg';
    return Number(grams).toFixed(1) + ' g';
  }

  function formatDate(isoStr) {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // API Calls
  async function fetchAllData() {
    refreshBtn.classList.add('spinning');
    try {
      const [overviewRes, seriesRes, sessionsRes] = await Promise.all([
        fetch(`/api/overview?range=${currentRange}`),
        fetch(`/api/series?range=${currentRange}&granularity=day`),
        fetch(`/api/sessions?range=${currentRange}&search=${encodeURIComponent(searchQuery)}`)
      ]);

      if (overviewRes.ok) overviewData = await overviewRes.json();
      if (seriesRes.ok) {
        const s = await seriesRes.json();
        seriesData = s.series || [];
      }
      if (sessionsRes.ok) {
        const sess = await sessionsRes.json();
        sessionsData = sess.sessions || [];
      }

      renderDashboard();
    } catch (err) {
      console.error('Failed to fetch telemetry data:', err);
    } finally {
      setTimeout(() => refreshBtn.classList.remove('spinning'), 400);
    }
  }

  // Render KPIs
  function renderKPIs() {
    if (!overviewData) return;

    const ov = overviewData;

    // Total tokens
    document.getElementById('kpiTotalTokens').textContent = formatCompact(ov.totalTokens);
    document.getElementById('kpiInputTokens').textContent = formatCompact(ov.inputTokens);
    document.getElementById('kpiCachedTokens').textContent = formatCompact(ov.cachedTokens);
    document.getElementById('kpiOutputTokens').textContent = formatCompact(ov.outputTokens);

    // Breakdown bar
    if (ov.totalTokens > 0) {
      const inPct = Math.max(1, (ov.inputTokens / ov.totalTokens) * 100);
      const cacPct = Math.max(1, (ov.cachedTokens / ov.totalTokens) * 100);
      const outPct = Math.max(1, (ov.outputTokens / ov.totalTokens) * 100);
      const segs = document.getElementById('kpiTokenBar').children;
      segs[0].style.width = inPct + '%';
      segs[1].style.width = cacPct + '%';
      segs[2].style.width = outPct + '%';
    }

    // Cache hit rate & savings
    document.getElementById('kpiCacheHitRate').textContent = ov.cacheHitRate + '%';
    document.getElementById('kpiSavingsTag').textContent = `+${formatCurrency(ov.totalSavings)} saved`;
    document.getElementById('kpiCacheProgress').style.width = Math.min(100, ov.cacheHitRate) + '%';
    document.getElementById('kpiCacheDiscount').textContent = Math.round(ov.cacheHitRate * 0.75) + '%';

    // Spend
    document.getElementById('kpiTotalCost').textContent = formatCurrency(ov.totalCost);
    document.getElementById('kpiUncachedCost').textContent = formatCurrency(ov.uncachedCost);
    document.getElementById('kpiGrossCost').textContent = formatCurrency(ov.uncachedCost);
    document.getElementById('kpiNetSavings').textContent = formatCurrency(ov.totalSavings);

    // Thinking
    document.getElementById('kpiThinkingTokens').textContent = formatCompact(ov.thinkingTokens);
    document.getElementById('kpiThinkingRatio').textContent = ov.thinkingRatio + '%';
    document.getElementById('kpiThinkingRatioText').textContent = ov.thinkingRatio + '%';
    document.getElementById('kpiThinkingVol').textContent = formatCompact(ov.thinkingTokens);
    document.getElementById('kpiTextVol').textContent = formatCompact(ov.textTokens);

    // CO2
    document.getElementById('kpiCo2Kg').textContent = (ov.co2Kg < 1 ? (ov.co2Grams + ' g') : (ov.co2Kg + ' kg'));
    document.getElementById('kpiCo2Grams').textContent = formatCompact(ov.co2Grams) + ' g CO₂e';
    if (ov.equivalents) {
      document.getElementById('equivCar').textContent = `🚗 ~${ov.equivalents.carKilometers} km`;
      document.getElementById('equivPhone').textContent = `📱 ~${ov.equivalents.smartphoneCharges} charges`;
      document.getElementById('equivStream').textContent = `🎬 ~${ov.equivalents.streamingHours} hrs video`;
    }

    // Sessions & Turns
    document.getElementById('kpiSessionsCount').textContent = ov.totalSessions;
    document.getElementById('kpiTurnsCount').textContent = formatNumber(ov.totalTurns) + ' turns';
    const avgTurns = ov.totalSessions > 0 ? (ov.totalTurns / ov.totalSessions).toFixed(1) : '0';
    document.getElementById('kpiAvgTurns').textContent = avgTurns;
    document.getElementById('kpiInstallationId').textContent = ov.installationId || '--';
  }

  // Render Models List
  function renderModelsList() {
    modelsList.innerHTML = '';
    if (!overviewData || !overviewData.models || overviewData.models.length === 0) {
      modelsList.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;padding:10px 0;">No model data in window.</div>';
      return;
    }

    for (const m of overviewData.models) {
      const card = document.createElement('div');
      card.className = 'model-row-card';

      const totalModTokens = m.inputTokens + m.cachedTokens + m.outputTokens;
      card.innerHTML = `
        <div class="model-row-top">
          <span class="model-badge-pill">
            <span class="dot dot-cyan"></span>
            ${m.model}
          </span>
          <span class="model-cost-val">${formatCurrency(m.cost)}</span>
        </div>
        <div class="model-row-meta">
          <span>${m.sessionsCount} sessions (${m.turnsCount} turns)</span>
          <span>${formatCompact(totalModTokens)} tokens</span>
        </div>
      `;
      modelsList.appendChild(card);
    }
  }

  // Render Sessions Table
  function renderSessionsTable() {
    sessionsTableBody.innerHTML = '';

    let list = [...sessionsData];

    // Sorting
    list.sort((a, b) => {
      if (sortMode === 'date-desc') return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (sortMode === 'tokens-desc') return b.totalTokens - a.totalTokens;
      if (sortMode === 'cost-desc') return b.cost - a.cost;
      if (sortMode === 'co2-desc') return (b.co2Grams || 0) - (a.co2Grams || 0);
      if (sortMode === 'turns-desc') return b.agentTurns - a.agentTurns;
      return 0;
    });

    if (list.length === 0) {
      sessionsTableBody.innerHTML = `
        <tr>
          <td colspan="11" style="text-align:center;padding:32px;color:var(--text-dim);">
            No Antigravity conversations found matching criteria.
          </td>
        </tr>
      `;
      return;
    }

    for (const s of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-title" title="${escapeHtml(s.title)}">
          ${escapeHtml(s.title)}
        </td>
        <td>
          <span class="table-model-badge">${s.model}</span>
        </td>
        <td>${formatDate(s.updatedAt)}</td>
        <td class="cell-mono">${s.agentTurns}</td>
        <td class="cell-mono">${formatCompact(s.inputTokens)}</td>
        <td class="cell-mono" style="color:#34d399;">${formatCompact(s.cachedTokens)}</td>
        <td class="cell-mono">${formatCompact(s.outputTokens)}</td>
        <td class="cell-mono" style="color:#38bdf8;">${s.cacheHitRate}%</td>
        <td class="cell-mono" style="color:#fb7185;font-weight:600;">${formatCurrency(s.cost)}</td>
        <td class="cell-mono" style="color:#2dd4bf;font-weight:600;">${formatCo2(s.co2Grams)}</td>
        <td>
          <button class="btn-inspect" data-session-id="${s.id}">Inspect</button>
        </td>
      `;
      sessionsTableBody.appendChild(tr);
    }

    // Attach inspect handlers
    sessionsTableBody.querySelectorAll('.btn-inspect').forEach(btn => {
      btn.addEventListener('click', () => {
        openSessionModal(btn.getAttribute('data-session-id'));
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ==========================================================================
  // Interactive Timeline Canvas Chart
  // ==========================================================================
  let chartBars = []; // stored bounds for tooltips

  function renderTimelineChart() {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = chartContainer.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    chartBars = [];

    ctx.clearRect(0, 0, width, height);

    if (seriesData.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No activity recorded in selected timeframe', width / 2, height / 2);
      return;
    }

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Determine scale
    let maxVal = 0;
    for (const d of seriesData) {
      let v = d.totalTokens;
      if (metricMode === 'cost') v = d.cost;
      else if (metricMode === 'co2') v = d.co2Grams || (d.totalTokens / 1000) * 0.25;
      if (v > maxVal) maxVal = v;
    }
    if (maxVal === 0) maxVal = 1;

    // Draw horizontal grid lines
    const gridSteps = 4;
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridSteps; i++) {
      const yVal = (maxVal / gridSteps) * i;
      const y = padding.top + chartH - (i / gridSteps) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      let label = formatCompact(yVal);
      if (metricMode === 'cost') label = formatCurrency(yVal);
      else if (metricMode === 'co2') label = formatCo2(yVal);
      ctx.fillText(label, padding.left - 8, y + 4);
    }

    // Update Footer Legend based on mode
    const legendEl = document.getElementById('chartFooterLegend');
    if (legendEl) {
      if (metricMode === 'cost') {
        legendEl.innerHTML = `
          <span class="leg-pill"><span class="dot" style="background:#f43f5e;"></span> Daily API Spend ($ USD)</span>
        `;
      } else if (metricMode === 'co2') {
        legendEl.innerHTML = `
          <span class="leg-pill"><span class="dot dot-teal"></span> Estimated Daily CO₂e Emissions (0.25g / 1k tokens)</span>
        `;
      } else {
        legendEl.innerHTML = `
          <span class="leg-pill"><span class="dot dot-cyan"></span> Fresh Input</span>
          <span class="leg-pill"><span class="dot dot-emerald"></span> Cached Context</span>
          <span class="leg-pill"><span class="dot dot-purple"></span> Thinking / Reasoning</span>
          <span class="leg-pill"><span class="dot dot-amber"></span> Output Text</span>
        `;
      }
    }

    // Draw bars
    const barSpacing = Math.max(4, chartW / seriesData.length);
    const barWidth = Math.max(6, Math.min(32, barSpacing * 0.65));

    for (let i = 0; i < seriesData.length; i++) {
      const d = seriesData[i];
      const x = padding.left + (i + 0.5) * barSpacing - barWidth / 2;

      if (metricMode === 'cost') {
        const h = (d.cost / maxVal) * chartH;
        const y = padding.top + chartH - h;

        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, '#f43f5e');
        grad.addColorStop(1, '#be123c');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, h);

        chartBars.push({ x, y, width: barWidth, height: h, data: d });
      } else if (metricMode === 'co2') {
        const co2Val = d.co2Grams || (d.totalTokens / 1000) * 0.25;
        const h = (co2Val / maxVal) * chartH;
        const y = padding.top + chartH - h;

        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, '#2dd4bf');
        grad.addColorStop(1, '#0f766e');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, h);

        chartBars.push({ x, y, width: barWidth, height: h, data: d });
      } else {
        // Stacked segments: Fresh Input, Cached, Thinking, Output Text
        const baseH = (val) => (val / maxVal) * chartH;
        let curY = padding.top + chartH;

        const inH = baseH(d.inputTokens);
        const cacH = baseH(d.cachedTokens);
        const thkH = baseH(d.thinkingTokens);
        const outH = baseH(Math.max(0, d.outputTokens - d.thinkingTokens));

        // 1. Cached (Emerald)
        if (cacH > 0) {
          curY -= cacH;
          ctx.fillStyle = '#10b981';
          ctx.fillRect(x, curY, barWidth, cacH);
        }
        // 2. Input (Cyan)
        if (inH > 0) {
          curY -= inH;
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(x, curY, barWidth, inH);
        }
        // 3. Thinking (Purple)
        if (thkH > 0) {
          curY -= thkH;
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(x, curY, barWidth, thkH);
        }
        // 4. Output Text (Amber)
        if (outH > 0) {
          curY -= outH;
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(x, curY, barWidth, outH);
        }

        const totalH = (d.totalTokens / maxVal) * chartH;
        chartBars.push({ x, y: padding.top + chartH - totalH, width: barWidth, height: totalH, data: d });
      }

      // X-axis date labels (show every few bars)
      const step = Math.ceil(seriesData.length / 8);
      if (i % step === 0 || i === seriesData.length - 1) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Outfit, sans-serif';
        ctx.textAlign = 'center';
        const dateShort = d.date.slice(5); // MM-DD
        ctx.fillText(dateShort, x + barWidth / 2, padding.top + chartH + 18);
      }
    }
  }

  // Hover Tooltip
  chartContainer.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let hit = null;
    for (const b of chartBars) {
      if (mouseX >= b.x - 4 && mouseX <= b.x + b.width + 4 && mouseY >= 0 && mouseY <= rect.height) {
        hit = b;
        break;
      }
    }

    if (hit) {
      const d = hit.data;
      const co2Val = d.co2Grams || (d.totalTokens / 1000) * 0.25;
      tooltip.style.display = 'block';
      tooltip.style.left = (hit.x + hit.width / 2 + 10) + 'px';
      tooltip.style.top = Math.max(10, hit.y - 20) + 'px';

      tooltip.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px;border-bottom:1px solid #334155;padding-bottom:4px;">
          ${d.date}
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin:2px 0;">
          <span style="color:#38bdf8;">Input:</span> <strong>${formatCompact(d.inputTokens)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin:2px 0;">
          <span style="color:#10b981;">Cached:</span> <strong>${formatCompact(d.cachedTokens)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin:2px 0;">
          <span style="color:#a855f7;">Thinking:</span> <strong>${formatCompact(d.thinkingTokens)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin:2px 0;">
          <span style="color:#f59e0b;">Output:</span> <strong>${formatCompact(d.outputTokens)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-top:6px;border-top:1px solid #334155;padding-top:4px;">
          <span style="color:#fb7185;">Spend:</span> <strong>${formatCurrency(d.cost)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-top:2px;">
          <span style="color:#2dd4bf;">CO₂e:</span> <strong>${formatCo2(co2Val)}</strong>
        </div>
      `;
    } else {
      tooltip.style.display = 'none';
    }
  });

  chartContainer.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

  // ==========================================================================
  // Session Inspector Modal & Trajectory Chart
  // ==========================================================================
  async function openSessionModal(sessionId) {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const s = await res.json();

      document.getElementById('modalSessionModel').textContent = s.model;
      document.getElementById('modalSessionTitle').textContent = s.title;
      document.getElementById('modalSessionMeta').textContent = `ID: ${s.id} • ${formatDate(s.createdAt)} • ${s.agentTurns} Turns • ${s.toolSteps} Tool Steps`;

      document.getElementById('modalTotalTokens').textContent = formatCompact(s.totalTokens);
      document.getElementById('modalCacheHit').textContent = s.cacheHitRate.toFixed(1) + '%';
      document.getElementById('modalThinkingTokens').textContent = formatCompact(s.thinkingTokens);
      document.getElementById('modalCost').textContent = formatCurrency(s.cost);

      // Render turns table
      const tbody = document.getElementById('modalTurnsTableBody');
      tbody.innerHTML = '';

      if (s.turnsTimeline && s.turnsTimeline.length > 0) {
        for (const t of s.turnsTimeline) {
          const rates = { input: 0.075, cached: 0.01875, output: 0.30 }; // per M
          const turnCost = (t.inputTokens * rates.input + t.cachedTokens * rates.cached + t.outputTokens * rates.output) / 1_000_000;
          const turnTokens = t.inputTokens + t.cachedTokens + t.outputTokens;
          const turnCo2 = (turnTokens / 1000) * 0.25;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>#${t.stepIdx}</td>
            <td>${t.timestamp ? t.timestamp.slice(11, 19) : '--'}</td>
            <td>${formatCompact(t.inputTokens)}</td>
            <td style="color:#34d399;">${formatCompact(t.cachedTokens)}</td>
            <td style="color:#c084fc;">${formatCompact(t.thinkingTokens)}</td>
            <td style="color:#f59e0b;">${formatCompact(Math.max(0, t.outputTokens - t.thinkingTokens))}</td>
            <td style="color:#fb7185;">${formatCurrency(turnCost)}</td>
            <td style="color:#2dd4bf;">${formatCo2(turnCo2)}</td>
          `;
          tbody.appendChild(tr);
        }
      }

      // Draw trajectory chart
      drawTrajectoryChart(s.turnsTimeline || []);

      modalBackdrop.classList.add('open');
    } catch (e) {
      console.error('Failed to open session detail:', e);
    }
  }

  function drawTrajectoryChart(timeline) {
    const ctx = modalCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = modalCanvas.getBoundingClientRect();

    modalCanvas.width = rect.width * dpr;
    modalCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    if (timeline.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Single turn session', w / 2, h / 2);
      return;
    }

    const pad = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    let maxTokens = 0;
    for (const t of timeline) {
      const tot = t.inputTokens + t.cachedTokens;
      if (tot > maxTokens) maxTokens = tot;
    }
    if (maxTokens === 0) maxTokens = 1;

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 3; i++) {
      const yVal = (maxTokens / 3) * i;
      const y = pad.top + chartH - (i / 3) * chartH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
      ctx.fillText(formatCompact(yVal), pad.left - 6, y + 3);
    }

    // Line curve for context growth (input + cached tokens)
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38bdf8';

    for (let i = 0; i < timeline.length; i++) {
      const t = timeline[i];
      const x = pad.left + (i / (timeline.length - 1)) * chartW;
      const val = t.inputTokens + t.cachedTokens;
      const y = pad.top + chartH - (val / maxTokens) * chartH;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    fillGrad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    fillGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Draw dots
    for (let i = 0; i < timeline.length; i++) {
      const t = timeline[i];
      const x = pad.left + (i / (timeline.length - 1)) * chartW;
      const val = t.inputTokens + t.cachedTokens;
      const y = pad.top + chartH - (val / maxTokens) * chartH;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }
  }

  function closeModal() {
    modalBackdrop.classList.remove('open');
  }

  closeModalBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  // CO2 Methodology Modal Handlers
  const co2Backdrop = document.getElementById('co2ModalBackdrop');
  const openCo2ModalBtn = document.getElementById('openCo2ModalBtn');
  const openCo2DetailsBtn = document.getElementById('openCo2DetailsBtn');
  const closeCo2ModalBtn = document.getElementById('closeCo2ModalBtn');

  function openCo2Modal() {
    if (co2Backdrop) co2Backdrop.classList.add('open');
  }
  function closeCo2Modal() {
    if (co2Backdrop) co2Backdrop.classList.remove('open');
  }

  if (openCo2ModalBtn) openCo2ModalBtn.addEventListener('click', openCo2Modal);
  if (openCo2DetailsBtn) openCo2DetailsBtn.addEventListener('click', openCo2Modal);
  if (closeCo2ModalBtn) closeCo2ModalBtn.addEventListener('click', closeCo2Modal);
  if (co2Backdrop) {
    co2Backdrop.addEventListener('click', (e) => {
      if (e.target === co2Backdrop) closeCo2Modal();
    });
  }

  // ==========================================================================
  // Event Listeners & Controls
  // ==========================================================================

  // Range pills
  rangeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    rangeGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.getAttribute('data-range');
    fetchAllData();
  });

  // Chart view toggle (Tokens vs Cost)
  chartViewToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    chartViewToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    metricMode = btn.getAttribute('data-metric');
    renderTimelineChart();
  });

  // Search input
  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      fetchAllData();
    }, 250);
  });

  // Sort select
  sortSelect.addEventListener('change', (e) => {
    sortMode = e.target.value;
    renderSessionsTable();
  });

  // Refresh button
  refreshBtn.addEventListener('click', fetchAllData);

  // Resize listener
  window.addEventListener('resize', () => {
    renderTimelineChart();
  });

  // Auto-refresh every 8 seconds
  setInterval(fetchAllData, 8000);

  // Master Render
  function renderDashboard() {
    renderKPIs();
    renderTimelineChart();
    renderModelsList();
    renderSessionsTable();
  }

  // Initial Load
  fetchAllData();
})();
