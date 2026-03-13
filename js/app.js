/**
 * app.js — Agile Day Manager
 * Application state, user actions, and full render pipeline.
 * Depends on: utils.js, firebase.js (loaded before this file).
 */

const App = (() => {

  // ── STATE ────────────────────────────────────────────────
  let state = {
    resources:           [],   // synced from Firestore
    currentWeekOffset:   0,    // 0 = current week
    selectedId:          null, // currently selected resource id
  };

  // ── INIT ─────────────────────────────────────────────────

  /** Called on DOMContentLoaded. */
  function init() {
    // Render static UI before Firebase
    render();

    // Pre-fill setup form and show "use saved" button if config exists
    const hasSaved = FirebaseService.prefillFormFromStorage();
    if (hasSaved) {
      document.getElementById('setupSavedBtn')?.classList.remove('d-none');
    }

    // Show setup modal on first load
    FirebaseService.showSetupModal();
  }

  // ── FIREBASE SETUP ACTIONS ───────────────────────────────

  /** Called by the "Connetti" button in the setup modal. */
  async function connectFirebase() {
    const btn = document.getElementById('setupConnectBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Connessione…'; }

    FirebaseService.setConnecting();
    FirebaseService.hideSetupError();

    try {
      await FirebaseService.connectFromForm(_onFirestoreData);

      const projectId = document.getElementById('cfgProjectId')?.value.trim() || 'Connesso';
      FirebaseService.setConnected(projectId);
      FirebaseService.hideSetupModal();

      document.getElementById('addBtn').disabled = false;
      UI.toast('🔥 Firebase connesso!', 'success');

    } catch (err) {
      FirebaseService.setError();
      FirebaseService.showSetupError('Errore: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-fire me-1"></i> Connetti a Firebase'; }
    }
  }

  /** Called by the "Usa configurazione salvata" button. */
  async function loadSavedConfig() {
    const btn = document.getElementById('setupConnectBtn');
    if (btn) { btn.disabled = true; }
    FirebaseService.setConnecting();
    FirebaseService.hideSetupError();

    try {
      await FirebaseService.connectFromStorage(_onFirestoreData);

      const projectId = document.getElementById('cfgProjectId')?.value.trim() || 'Connesso';
      FirebaseService.setConnected(projectId);
      FirebaseService.hideSetupModal();

      document.getElementById('addBtn').disabled = false;
      UI.toast('🔥 Firebase riconnesso', 'success');

    } catch (err) {
      FirebaseService.setError();
      FirebaseService.showSetupError('Errore: ' + err.message);
      if (btn) btn.disabled = false;
    }
  }

  /** Show setup modal from the connection indicator. */
  function showSetup() {
    FirebaseService.showSetupModal();
  }

  /** Firestore snapshot callback — updates state and re-renders. */
  function _onFirestoreData(resources) {
    state.resources = resources;
    render();
  }

  // ── WEEK NAVIGATION ──────────────────────────────────────

  function prevWeek() { state.currentWeekOffset--; render(); }
  function nextWeek() { state.currentWeekOffset++; render(); }

  // ── RESOURCE ACTIONS ─────────────────────────────────────

  /** Add a new resource from the sidebar form. */
  async function addResource() {
    if (!FirebaseService.isConnected()) {
      UI.toast('Prima connetti Firebase', 'error');
      return;
    }

    const name     = document.getElementById('inputName')?.value.trim();
    const category = document.getElementById('inputCategory')?.value;
    const baseDay  = parseInt(document.getElementById('inputBaseDay')?.value ?? '0');
    const coeff0   = parseFloat(document.getElementById('inputCoeff')?.value ?? '5');

    if (!name) { UI.toast('Inserisci un nome', 'warning'); return; }

    const resource = {
      name,
      category:           category || 'Developer',
      baseDay,
      coeff0:             Math.min(Utils.COEFF_MAX, Math.max(Utils.COEFF_MIN, coeff0)),
      createdWeekOffset:  state.currentWeekOffset,
      schedule:           {},
      changes:            {},
    };

    // Clear form
    const nameEl = document.getElementById('inputName');
    if (nameEl) nameEl.value = '';

    await FirebaseService.addResource(resource);
    UI.toast(`${name} aggiunto/a ✓`, 'success');
  }

  /** Delete a resource by Firestore document id. */
  async function removeResource(id) {
    if (state.selectedId === id) state.selectedId = null;
    await FirebaseService.deleteResource(id);
    UI.toast('Risorsa rimossa', 'warning');
  }

  /** Toggle resource selection in the sidebar list. */
  function selectResource(id) {
    state.selectedId = (state.selectedId === id) ? null : id;
    render();
  }

  /** Request a day change for a resource in the current week. */
  async function requestChange(id, newDay) {
    const resource = _getResource(id);
    if (!resource) return;

    const wKey  = Utils.weekKey(state.currentWeekOffset);
    const coeff = Utils.getCoeffAtWeek(resource, state.currentWeekOffset);

    if (coeff < Utils.COEFF_THRESHOLD) {
      UI.toast(`Coefficiente insufficiente (${coeff}). Minimo: ${Utils.COEFF_THRESHOLD}`, 'error');
      return;
    }

    const currentDay = Utils.getAgileDay(resource, wKey);
    if (newDay === currentDay && !Utils.isChanged(resource, wKey)) {
      UI.toast('Giorno già selezionato come agile', 'warning');
      return;
    }

    const updatedSchedule = { ...resource.schedule, [wKey]: newDay };
    const updatedChanges  = { ...resource.changes,  [wKey]: true  };

    await FirebaseService.updateResource(id, {
      schedule: updatedSchedule,
      changes:  updatedChanges,
    });

    UI.toast(`Cambio → ${Utils.DAYS[newDay]} (−${Utils.COEFF_PENALTY} coeff)`, 'warning');
  }

  /** Remove a day-change for a resource in the current week. */
  async function removeChange(id) {
    const resource = _getResource(id);
    if (!resource) return;

    const wKey = Utils.weekKey(state.currentWeekOffset);

    const updatedSchedule = { ...resource.schedule };
    const updatedChanges  = { ...resource.changes  };
    delete updatedSchedule[wKey];
    delete updatedChanges[wKey];

    await FirebaseService.updateResource(id, {
      schedule: updatedSchedule,
      changes:  updatedChanges,
    });

    UI.toast('Cambio annullato', 'warning');
  }

  // ── INTERNAL HELPERS ─────────────────────────────────────

  function _getResource(id) {
    return state.resources.find(r => r.id === id) || null;
  }

  function _filteredResources() {
    const filter = document.getElementById('filterCategory')?.value || '';
    if (!filter) return state.resources;
    return state.resources.filter(r => r.category === filter);
  }

  // ── RENDER PIPELINE ──────────────────────────────────────

  function render() {
    _renderWeekNav();
    _renderResourceList();
    _renderCalendar();
    _renderDetail();
  }

  // ── RENDER: WEEK NAV ─────────────────────────────────────

  function _renderWeekNav() {
    const dates = Utils.getWeekDates(state.currentWeekOffset);
    const wn    = Utils.getWeekNumber(dates[0]);
    const yr    = dates[0].getFullYear();

    const labelEl = document.getElementById('weekLabel');
    if (labelEl) {
      labelEl.textContent = `Settimana ${wn} · ${Utils.formatDate(dates[0])} – ${Utils.formatDate(dates[4])} ${yr}`;
    }

    const badgeEl = document.getElementById('currentWeekLabel');
    if (badgeEl) {
      badgeEl.textContent = `W${String(wn).padStart(2, '0')} ${yr}`;
    }
  }

  // ── RENDER: RESOURCE LIST ─────────────────────────────────

  function _renderResourceList() {
    const el       = document.getElementById('resourceList');
    const countEl  = document.getElementById('resCount');
    const resources = _filteredResources();

    if (countEl) countEl.textContent = state.resources.length;

    if (!resources.length) {
      el.innerHTML = `<div class="empty-state">
        <i class="bi bi-${FirebaseService.isConnected() ? 'people' : 'fire'} fs-4 d-block mb-2"></i>
        ${FirebaseService.isConnected() ? 'Nessuna risorsa' : 'In attesa di Firebase…'}
      </div>`;
      return;
    }

    el.innerHTML = resources.map(r => {
      const coeff   = Utils.getCoeffAtWeek(r, state.currentWeekOffset);
      const wKey    = Utils.weekKey(state.currentWeekOffset);
      const changed = Utils.isChanged(r, wKey);
      const level   = Utils.coeffLevel(coeff);
      const cat     = Utils.getCategory(r.category);

      return `
        <div class="resource-item ${state.selectedId === r.id ? 'active' : ''}"
             onclick="App.selectResource('${r.id}')">
          <div class="overflow-hidden">
            <div class="resource-name">${_esc(r.name)}</div>
            <div class="resource-sub">
              <span class="cat-badge cat-${r.category}">${cat ? cat.label : r.category}</span>
              · ${Utils.DAYS[r.baseDay]}
            </div>
          </div>
          <div class="d-flex align-items-center gap-1 flex-shrink-0">
            ${changed ? '<i class="bi bi-arrow-left-right" style="color:var(--accent2);font-size:0.7rem"></i>' : ''}
            <span class="coeff-badge coeff-${level}">${coeff.toFixed(1)}</span>
            <button class="btn-remove" onclick="event.stopPropagation();App.removeResource('${r.id}')" title="Rimuovi">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── RENDER: CALENDAR ─────────────────────────────────────

  function _renderCalendar() {
    const dates     = Utils.getWeekDates(state.currentWeekOffset);
    const wKey      = Utils.weekKey(state.currentWeekOffset);
    const calBody   = document.getElementById('calBody');
    if (!calBody) return;

    // Build day → resources map
    const dayMap = Array.from({ length: 5 }, () => []);
    state.resources.forEach(r => {
      const day     = Utils.getAgileDay(r, wKey);
      const changed = Utils.isChanged(r, wKey);
      dayMap[day].push({ r, changed });
    });

    calBody.innerHTML = dates.map((d, i) => {
      const today = Utils.isToday(d);
      const chips = dayMap[i].map(({ r, changed }) => `
        <div class="chip ${changed ? 'chip-changed' : 'chip-agile'}">
          <span>${_esc(r.name.split(' ')[0])}</span>
          ${changed
            ? `<span class="chip-remove" onclick="App.removeChange('${r.id}')" title="Annulla cambio">×</span>`
            : ''}
        </div>
      `).join('');

      return `
        <div class="col cal-cell ${chips ? 'agile-day' : ''} ${today ? 'today' : ''}">
          <div class="day-num">${Utils.formatDate(d)}${today ? ' ●' : ''}</div>
          ${chips}
        </div>
      `;
    }).join('');
  }

  // ── RENDER: DETAIL PANEL ─────────────────────────────────

  function _renderDetail() {
    const el = document.getElementById('detailPanel');
    if (!el) return;

    if (!state.selectedId) {
      el.innerHTML = `<div class="empty-state">
        <i class="bi bi-cursor fs-4 d-block mb-2"></i>
        Seleziona una risorsa per vedere i dettagli
      </div>`;
      return;
    }

    const r = _getResource(state.selectedId);
    if (!r) { state.selectedId = null; _renderDetail(); return; }

    const wKey      = Utils.weekKey(state.currentWeekOffset);
    const coeff     = Utils.getCoeffAtWeek(r, state.currentWeekOffset);
    const coeffPct  = ((coeff - Utils.COEFF_MIN) / (Utils.COEFF_MAX - Utils.COEFF_MIN)) * 100;
    const agileDay  = Utils.getAgileDay(r, wKey);
    const changed   = Utils.isChanged(r, wKey);
    const canChange = coeff >= Utils.COEFF_THRESHOLD;
    const cat       = Utils.getCategory(r.category);

    const totalChanges = Object.values(r.changes).filter(Boolean).length;

    // History rows (newest first)
    let historyHTML = '';
    for (let wo = r.createdWeekOffset; wo <= state.currentWeekOffset; wo++) {
      const wk     = Utils.weekKeyForOffset(wo);
      const wDates = Utils.getWeekDates(wo);
      const aD     = r.schedule[wk] !== undefined ? r.schedule[wk] : r.baseDay;
      const chg    = r.changes[wk];
      const c      = Utils.getCoeffAtWeek(r, wo);
      const color  = c >= 7 ? 'var(--accent)' : c >= 4 ? 'var(--accent2)' : 'var(--accent3)';

      historyHTML = `
        <tr>
          <td style="color:var(--muted)">${Utils.formatDate(wDates[0])}–${Utils.formatDate(wDates[4])}</td>
          <td>${Utils.DAYS[aD]}</td>
          <td><span class="tag ${chg ? 'tag-change' : 'tag-stable'}">${chg ? 'CAMBIO' : 'STABILE'}</span></td>
          <td style="color:${color}">${c.toFixed(1)}</td>
        </tr>
      ` + historyHTML;
    }

    // Day selector buttons
    const dayBtns = Utils.DAYS.map((day, i) => {
      const isCurrentBase    = (agileDay === i && !changed);
      const isCurrentChanged = (changed && r.schedule[wKey] === i);
      return `
        <button class="day-btn ${isCurrentBase || isCurrentChanged ? 'selected' : ''}"
          onclick="App.requestChange('${r.id}', ${i})"
          ${isCurrentBase ? 'disabled title="Giorno attuale"' : ''}>
          ${Utils.DAYS_SHORT[i]}
        </button>
      `;
    }).join('');

    el.innerHTML = `
      <!-- Header -->
      <div class="d-flex align-items-start justify-content-between mb-3 gap-2">
        <div>
          <div class="detail-name">${_esc(r.name)}</div>
          <div class="detail-role d-flex align-items-center gap-2 mt-1">
            <span class="cat-badge cat-${r.category}">${cat ? cat.label : r.category}</span>
            · Giorno base: ${Utils.DAYS[r.baseDay]}
          </div>
          <div style="font-size:0.58rem;color:var(--muted);margin-top:4px">ID: ${r.id}</div>
        </div>
        <div class="text-end flex-shrink-0">
          <div style="font-size:0.62rem;color:var(--muted)">Agile oggi</div>
          <div style="font-family:'Syne',sans-serif;font-weight:700;color:var(--accent);font-size:0.9rem">
            ${Utils.DAYS[agileDay]}
          </div>
          ${changed ? '<div style="font-size:0.62rem;color:var(--accent2)"><i class="bi bi-arrow-left-right me-1"></i>Cambiato</div>' : ''}
        </div>
      </div>

      <!-- Stats -->
      <div class="row g-2 mb-3">
        <div class="col-6 col-sm-3">
          <div class="stat-box">
            <div class="stat-label">Coefficiente</div>
            <div class="stat-value ${Utils.coeffColor(coeff)}">${coeff.toFixed(1)}</div>
          </div>
        </div>
        <div class="col-6 col-sm-3">
          <div class="stat-box">
            <div class="stat-label">Tot. cambi</div>
            <div class="stat-value amber">${totalChanges}</div>
          </div>
        </div>
        <div class="col-6 col-sm-3">
          <div class="stat-box">
            <div class="stat-label">Cambio libero</div>
            <div class="stat-value ${canChange ? 'green' : 'red'}">${canChange ? 'SÌ' : 'NO'}</div>
          </div>
        </div>
        <div class="col-6 col-sm-3">
          <div class="stat-box">
            <div class="stat-label">Settimana</div>
            <div class="stat-value">${Utils.getWeekNumber(Utils.getWeekStart(state.currentWeekOffset))}</div>
          </div>
        </div>
      </div>

      <!-- Coefficient bar -->
      <div class="coeff-track mb-3">
        <div class="coeff-track-header">
          <span class="coeff-track-label">Livello Coefficiente</span>
          <span class="coeff-track-value">${coeff.toFixed(1)} / ${Utils.COEFF_MAX}</span>
        </div>
        <div class="coeff-bar">
          <div class="coeff-fill" style="width:${coeffPct}%"></div>
        </div>
      </div>

      <!-- Change request -->
      <div class="change-form mb-3">
        <div class="change-form-title">
          <i class="bi bi-calendar-event me-1"></i>
          Richiedi Cambio Giorno — Settimana Corrente
        </div>
        <div class="days-selector mb-2">${dayBtns}</div>
        ${changed
          ? `<button class="btn btn-sm btn-outline-danger" onclick="App.removeChange('${r.id}')">
               <i class="bi bi-x-lg me-1"></i>Annulla cambio
             </button>`
          : ''}
        ${!canChange
          ? `<div class="mt-2" style="font-size:0.7rem;color:var(--accent3)">
               <i class="bi bi-exclamation-triangle me-1"></i>
               Coefficiente insufficiente. Minimo: ${Utils.COEFF_THRESHOLD}
             </div>`
          : ''}
      </div>

      <!-- History -->
      ${historyHTML ? `
      <div class="mt-2">
        <div class="panel-title mb-2">
          <i class="bi bi-clock-history me-1"></i> Storico Settimane
        </div>
        <div style="overflow-x:auto">
          <table class="history-table">
            <thead>
              <tr>
                <th>Settimana</th>
                <th>Giorno Agile</th>
                <th>Stato</th>
                <th>Coeff.</th>
              </tr>
            </thead>
            <tbody>${historyHTML}</tbody>
          </table>
        </div>
      </div>
      ` : ''}
    `;
  }

  // ── UTILS ────────────────────────────────────────────────

  /** Escape HTML special chars to prevent XSS. */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── BOOTSTRAP ON DOM READY ───────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  // ── PUBLIC API ───────────────────────────────────────────
  return {
    // Firebase setup
    connectFirebase,
    loadSavedConfig,
    showSetup,
    // Navigation
    prevWeek,
    nextWeek,
    // Resource actions
    addResource,
    removeResource,
    selectResource,
    requestChange,
    removeChange,
    // Render (exposed for filter onChange)
    render,
  };

})();
