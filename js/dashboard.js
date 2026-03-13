/**
 * dashboard.js — Agile Day Manager
 * Admin dashboard: aggregates and renders analytics.
 *
 * Metrics:
 *   1. Changes per week (current year) — bar chart via Canvas API
 *   2. Changes per resource (all time + current year) — ranked table
 *   3. KPI cards: total changes this year, most active week, most changing resource
 *
 * Depends on: utils.js  (no Firebase dependency — works on in-memory resources[])
 */

const Dashboard = (() => {

  // ── AGGREGATION ──────────────────────────────────────────

  /**
   * Build a map  weekKey → changeCount  for the given year.
   * @param {Object[]} resources
   * @param {number}   year
   * @returns {Map<string, number>}
   */
  function changesPerWeek(resources, year) {
    const map = new Map();

    // Pre-fill all ISO weeks of the year (W01–W52/53)
    const weeksInYear = _isoWeeksInYear(year);
    for (let w = 1; w <= weeksInYear; w++) {
      map.set(`${year}-W${String(w).padStart(2, '0')}`, 0);
    }

    resources.forEach(r => {
      Object.entries(r.changes).forEach(([wk, changed]) => {
        if (!changed) return;
        if (!wk.startsWith(String(year))) return;
        if (map.has(wk)) map.set(wk, map.get(wk) + 1);
      });
    });

    return map;
  }

  /**
   * Build per-resource stats sorted by total changes desc.
   * @param {Object[]} resources
   * @param {number}   year
   * @returns {Object[]}  { id, name, category, totalChanges, yearChanges, coeffNow, weekOffset }
   */
  function changesPerResource(resources, year, currentWeekOffset) {
    return resources
      .map(r => {
        const totalChanges = Object.values(r.changes).filter(Boolean).length;
        const yearChanges  = Object.entries(r.changes)
          .filter(([wk, v]) => v && wk.startsWith(String(year)))
          .length;
        const coeffNow = Utils.getCoeffAtWeek(r, currentWeekOffset);
        return { id: r.id, name: r.name, category: r.category, totalChanges, yearChanges, coeffNow };
      })
      .sort((a, b) => b.totalChanges - a.totalChanges);
  }

  /**
   * KPI summary for the given year.
   * @param {Object[]} resources
   * @param {number}   year
   * @param {number}   currentWeekOffset
   */
  function kpis(resources, year, currentWeekOffset) {
    const weekMap  = changesPerWeek(resources, year);
    const perRes   = changesPerResource(resources, year, currentWeekOffset);

    const totalYear  = [...weekMap.values()].reduce((s, v) => s + v, 0);
    const totalAll   = resources.reduce((s, r) => s + Object.values(r.changes).filter(Boolean).length, 0);

    let peakWeek = '—'; let peakCount = 0;
    weekMap.forEach((v, k) => { if (v > peakCount) { peakCount = v; peakWeek = k; } });

    const topResource = perRes[0] || null;

    // Current week changes
    const currentWKey   = Utils.weekKey(currentWeekOffset);
    const currentChanges = resources.filter(r => r.changes[currentWKey]).length;

    return { totalYear, totalAll, peakWeek, peakCount, topResource, currentChanges };
  }

  // ── RENDER ───────────────────────────────────────────────

  /**
   * Full dashboard render into #dashboardContent.
   * @param {Object[]} resources
   * @param {number}   currentWeekOffset
   */
  function render(resources, currentWeekOffset) {
    const el = document.getElementById('dashboardContent');
    if (!el) return;

    const year    = new Date().getFullYear();
    const weekMap = changesPerWeek(resources, year);
    const perRes  = changesPerResource(resources, year, currentWeekOffset);
    const kpi     = kpis(resources, year, currentWeekOffset);

    el.innerHTML = _renderKPIs(kpi, year) +
                   _renderWeekChart(weekMap, year) +
                   _renderResourceTable(perRes, year);

    // Draw chart after DOM insertion
    requestAnimationFrame(() => _drawBarChart(weekMap));
  }

  // ── KPI CARDS ────────────────────────────────────────────

  function _renderKPIs(kpi, year) {
    const cards = [
      {
        icon: 'bi-arrow-left-right',
        label: `Cambi ${year}`,
        value: kpi.totalYear,
        color: 'amber',
      },
      {
        icon: 'bi-infinity',
        label: 'Cambi totali (storico)',
        value: kpi.totalAll,
        color: 'green',
      },
      {
        icon: 'bi-calendar-week',
        label: 'Settimana più attiva',
        value: kpi.peakWeek === '—' ? '—' : `${kpi.peakWeek} <small style="font-size:0.6rem">(${kpi.peakCount})</small>`,
        color: 'accent2',
        raw: true,
      },
      {
        icon: 'bi-person-exclamation',
        label: 'Risorsa più attiva',
        value: kpi.topResource ? `${kpi.topResource.name} <small style="font-size:0.6rem">(${kpi.topResource.totalChanges})</small>` : '—',
        color: 'red',
        raw: true,
      },
      {
        icon: 'bi-calendar2-check',
        label: 'Cambi settimana corrente',
        value: kpi.currentChanges,
        color: kpi.currentChanges > 0 ? 'amber' : 'muted',
      },
    ];

    const cardsHTML = cards.map(c => `
      <div class="col-6 col-md-4 col-xl">
        <div class="dash-kpi-card">
          <i class="bi ${c.icon} dash-kpi-icon"></i>
          <div class="dash-kpi-label">${c.label}</div>
          <div class="dash-kpi-value dash-color-${c.color}">
            ${c.raw ? c.value : c.value}
          </div>
        </div>
      </div>
    `).join('');

    return `<div class="row g-3 mb-4">${cardsHTML}</div>`;
  }

  // ── BAR CHART ────────────────────────────────────────────

  function _renderWeekChart(weekMap, year) {
    return `
      <div class="dash-panel mb-4">
        <div class="dash-panel-title">
          <i class="bi bi-bar-chart-line me-1"></i>
          Cambi per Settimana — ${year}
        </div>
        <div style="position:relative; height:220px;">
          <canvas id="weekBarChart"></canvas>
        </div>
        <div class="dash-chart-legend mt-2">
          <span class="dash-legend-dot" style="background:var(--accent2)"></span>
          N° cambi per settimana ISO
        </div>
      </div>
    `;
  }

  function _drawBarChart(weekMap) {
    const canvas = document.getElementById('weekBarChart');
    if (!canvas) return;

    const ctx    = canvas.getContext('2d');
    const labels = [...weekMap.keys()].map(k => k.replace(/\d{4}-/, ''));
    const data   = [...weekMap.values()];
    const maxVal = Math.max(...data, 1);

    // Size canvas to container
    const container = canvas.parentElement;
    canvas.width    = container.clientWidth  || 800;
    canvas.height   = container.clientHeight || 220;

    const W  = canvas.width;
    const H  = canvas.height;
    const PL = 36, PR = 12, PT = 16, PB = 36;
    const chartW = W - PL - PR;
    const chartH = H - PT - PB;

    ctx.clearRect(0, 0, W, H);

    const BAR_COUNT = labels.length;
    const barW      = Math.max(2, (chartW / BAR_COUNT) * 0.72);
    const gap       = chartW / BAR_COUNT;

    // Grid lines
    const gridLines = 4;
    ctx.font = '9px IBM Plex Mono, monospace';
    ctx.fillStyle = '#64748b';
    for (let i = 0; i <= gridLines; i++) {
      const y     = PT + chartH - (i / gridLines) * chartH;
      const label = Math.round((i / gridLines) * maxVal);
      ctx.strokeStyle = 'rgba(42,42,62,0.9)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL + chartW, y); ctx.stroke();
      ctx.fillText(label, 2, y + 3);
    }

    // Bars
    data.forEach((val, i) => {
      const x    = PL + i * gap + (gap - barW) / 2;
      const barH = (val / maxVal) * chartH;
      const y    = PT + chartH - barH;

      // Gradient fill
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      if (val === 0) {
        grad.addColorStop(0, 'rgba(42,42,62,0.5)');
        grad.addColorStop(1, 'rgba(42,42,62,0.2)');
      } else {
        grad.addColorStop(0, 'rgba(245,158,11,0.9)');
        grad.addColorStop(1, 'rgba(245,158,11,0.3)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, Math.max(barH, 2), [3, 3, 0, 0]);
      ctx.fill();

      // Value label on top
      if (val > 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 9px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(val, x + barW / 2, y - 3);
      }

      // X-axis label (every 4 weeks to avoid clutter)
      if (i % 4 === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '8px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barW / 2, H - 4);
      }
    });
  }

  // ── RESOURCE TABLE ───────────────────────────────────────

  function _renderResourceTable(perRes, year) {
    if (!perRes.length) {
      return `<div class="dash-panel">
        <div class="dash-panel-title"><i class="bi bi-table me-1"></i>Cambi per Risorsa</div>
        <div class="empty-state">Nessuna risorsa</div>
      </div>`;
    }

    const maxChanges = Math.max(...perRes.map(r => r.totalChanges), 1);

    const rows = perRes.map((r, idx) => {
      const barPct   = Math.round((r.totalChanges / maxChanges) * 100);
      const cat      = Utils.getCategory(r.category);
      const cLevel   = Utils.coeffLevel(r.coeffNow);
      const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;

      return `
        <tr>
          <td class="text-center" style="color:var(--muted);width:36px">${rankIcon}</td>
          <td>
            <div style="font-family:'Syne',sans-serif;font-weight:600;font-size:0.82rem">${_esc(r.name)}</div>
            <div class="mt-1"><span class="cat-badge cat-${r.category}">${cat ? cat.label : r.category}</span></div>
          </td>
          <td class="text-center">
            <span class="coeff-badge coeff-${cLevel}">${r.coeffNow.toFixed(1)}</span>
          </td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="dash-mini-bar-track flex-grow-1">
                <div class="dash-mini-bar-fill" style="width:${barPct}%"></div>
              </div>
              <span style="font-family:'Syne',sans-serif;font-weight:700;color:var(--accent2);min-width:24px;text-align:right">
                ${r.totalChanges}
              </span>
            </div>
          </td>
          <td class="text-center" style="color:${r.yearChanges > 0 ? 'var(--accent2)' : 'var(--muted)'}">
            <strong>${r.yearChanges}</strong>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="dash-panel">
        <div class="dash-panel-title">
          <i class="bi bi-table me-1"></i>
          Cambi per Risorsa
          <span class="dash-year-badge ms-2">${year}</span>
        </div>
        <div style="overflow-x:auto">
          <table class="dash-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Risorsa</th>
                <th>Coeff.</th>
                <th>Cambi totali</th>
                <th>${year}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── HELPERS ──────────────────────────────────────────────

  function _isoWeeksInYear(year) {
    // A year has 53 ISO weeks if Dec 28 is a Thursday
    const dec28 = new Date(year, 11, 28);
    return dec28.getDay() === 4 ? 53 : 52;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── PUBLIC ───────────────────────────────────────────────
  return { render, changesPerWeek, changesPerResource, kpis };

})();
