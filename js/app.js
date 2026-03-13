/**
 * app.js — Agile Day Manager
 * Application state, role-based routing, user actions, render pipeline.
 * Depends on: utils.js, firebase.js, auth.js, dashboard.js
 */

const App = (() => {
  // ── STATE ────────────────────────────────────────────────
  let state = {
    resources: [],
    currentWeekOffset: 0,
    selectedId: null,
    view: "login", // 'login' | 'main' | 'dashboard' | 'users'
    usersList: [],
  };

  // ── INIT ─────────────────────────────────────────────────

  function init() {
    Auth.onAuthChange(_onAuthChange);
    const session = Auth.restoreSession();
    if (session) {
      _afterLogin(session);
    } else {
      _showView("login");
    }
  }

  // ── AUTH FLOW ────────────────────────────────────────────

  async function submitLogin() {
    const username = document.getElementById("loginUsername")?.value.trim();
    const password = document.getElementById("loginPassword")?.value;
    const errEl = document.getElementById("loginError");
    const btn = document.getElementById("loginBtn");

    errEl.classList.add("d-none");
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1"></span>Accesso…';

    const result = await Auth.login(username, password);

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i>Accedi';

    if (!result.ok) {
      errEl.textContent = result.error;
      errEl.classList.remove("d-none");
      const card = document.getElementById("loginCard");
      card?.classList.add("shake");
      setTimeout(() => card?.classList.remove("shake"), 500);
      return;
    }
    _afterLogin(Auth.getSession());
  }

  function logout() {
    Auth.logout();
    state.resources = [];
    state.selectedId = null;
    _showView("login");
  }

  function _onAuthChange(session) {
    if (!session) _showView("login");
  }

  async function _afterLogin(session) {
    _updateUserBar(session);

    // Auto-connect Firebase from saved config or config file
    if (!FirebaseService.isConnected()) {
      let cfg = null;
      let source = null;

      // Try saved localStorage config first
      if (FirebaseService.hasSavedConfig()) {
        try {
          cfg = JSON.parse(localStorage.getItem("agileFirebaseConfig") || "{}");
          source = "localStorage";
        } catch (_) {}
      }

      // Fall back to config file if available
      if (
        !cfg &&
        typeof FIREBASE_CONFIG !== "undefined" &&
        FIREBASE_CONFIG.projectId
      ) {
        cfg = FIREBASE_CONFIG;
        source = "config file";
      }

      // Connect if we have config
      if (cfg && cfg.projectId) {
        try {
          await FirebaseService.connect(cfg, _onFirestoreData);
          FirebaseService.setConnected(cfg.projectId || "Firebase");
          UI.toast(`🔥 Firebase connesso (${source})`, "success", 2000);
        } catch (_) {
          /* will prompt via setup modal */
        }
      }
    }

    if (Auth.isUser() && session.resourceId)
      state.selectedId = session.resourceId;
    _showView("main");
  }

  // ── VIEW ROUTING ─────────────────────────────────────────

  function _showView(viewName) {
    state.view = viewName;
    ["loginView", "mainView", "dashboardView", "usersView"].forEach((id) => {
      document.getElementById(id)?.classList.add("d-none");
    });
    const map = {
      login: "loginView",
      main: "mainView",
      dashboard: "dashboardView",
      users: "usersView",
    };
    document.getElementById(map[viewName])?.classList.remove("d-none");
    _updateNavBar();
    if (viewName === "main") render();
    if (viewName === "dashboard")
      Dashboard.render(state.resources, state.currentWeekOffset);
    if (viewName === "users") _renderUsersPanel();
  }

  function showMain() {
    _showView("main");
  }
  function showDashboard() {
    _showView("dashboard");
  }
  function showUsers() {
    _showView("users");
  }
  function showSetup() {
    FirebaseService.showSetupModal();
  }

  // ── NAV ──────────────────────────────────────────────────

  function _updateUserBar(session) {
    document.getElementById("userBar")?.classList.remove("d-none");
    const un = document.getElementById("navUsername");
    const rl = document.getElementById("navRole");
    if (un) un.textContent = session.username;
    if (rl) {
      rl.textContent = session.role.toUpperCase();
      rl.className = `nav-role-badge nav-role-${session.role}`;
    }
    document
      .getElementById("adminNav")
      ?.classList.toggle("d-none", !Auth.isAdmin());
  }

  function _updateNavBar() {
    const map = {
      navMain: "main",
      navDashboard: "dashboard",
      navUsers: "users",
    };
    Object.entries(map).forEach(([id, view]) =>
      document
        .getElementById(id)
        ?.classList.toggle("active", state.view === view),
    );
  }

  // ── FIREBASE SETUP ───────────────────────────────────────

  async function connectFirebase() {
    const btn = document.getElementById("setupConnectBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1"></span>Connessione…';
    }
    FirebaseService.setConnecting();
    FirebaseService.hideSetupError();
    try {
      await FirebaseService.connectFromForm(_onFirestoreData);
      const pid =
        document.getElementById("cfgProjectId")?.value.trim() || "Firebase";
      FirebaseService.setConnected(pid);
      FirebaseService.hideSetupModal();
      UI.toast("🔥 Firebase connesso!", "success");
    } catch (err) {
      FirebaseService.setError();
      FirebaseService.showSetupError("Errore: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-fire me-1"></i> Connetti a Firebase';
      }
    }
  }

  async function loadSavedConfig() {
    FirebaseService.setConnecting();
    FirebaseService.hideSetupError();
    try {
      await FirebaseService.connectFromStorage(_onFirestoreData);
      const cfg = JSON.parse(
        localStorage.getItem("agileFirebaseConfig") || "{}",
      );
      FirebaseService.setConnected(cfg.projectId || "Firebase");
      FirebaseService.hideSetupModal();
      UI.toast("🔥 Firebase riconnesso", "success");
    } catch (err) {
      FirebaseService.setError();
      FirebaseService.showSetupError("Errore: " + err.message);
    }
  }

  function _onFirestoreData(resources) {
    state.resources = resources;

    // Auto-select user's own resource if not already selected
    if (Auth.isUser() && !state.selectedId) {
      const session = Auth.getSession();
      if (session?.resourceId) {
        const ownResource = resources.find((r) => r.id === session.resourceId);
        if (ownResource) {
          state.selectedId = session.resourceId;
        }
      }
    }

    if (state.view === "main") render();
    if (state.view === "dashboard")
      Dashboard.render(resources, state.currentWeekOffset);
  }

  // ── WEEK NAVIGATION ──────────────────────────────────────

  function prevWeek() {
    state.currentWeekOffset--;
    _weekChanged();
  }
  function nextWeek() {
    state.currentWeekOffset++;
    _weekChanged();
  }
  function _weekChanged() {
    render();
    if (state.view === "dashboard")
      Dashboard.render(state.resources, state.currentWeekOffset);
  }

  // ── RESOURCE ACTIONS ─────────────────────────────────────

  async function removeResource(id) {
    if (!Auth.isAdmin()) {
      UI.toast("Permesso negato", "error");
      return;
    }
    if (state.selectedId === id) state.selectedId = null;
    await FirebaseService.deleteResource(id);
    UI.toast("Risorsa rimossa", "warning");
  }

  function selectResource(id) {
    if (
      Auth.isUser() &&
      Auth.getSession().resourceId &&
      Auth.getSession().resourceId !== id
    ) {
      UI.toast("Puoi gestire solo la tua risorsa", "warning");
      return;
    }
    state.selectedId = state.selectedId === id ? null : id;
    render();
  }

  async function requestChange(id, newDay) {
    if (Auth.isUser() && Auth.getSession().resourceId !== id) {
      UI.toast("Permesso negato", "error");
      return;
    }
    const resource = _getResource(id);
    if (!resource) return;

    const wKey = Utils.weekKey(state.currentWeekOffset);
    const coeff = Utils.getCoeffAtWeek(resource, state.currentWeekOffset);

    if (coeff < Utils.COEFF_THRESHOLD) {
      UI.toast(
        `Coefficiente insufficiente (${coeff}). Minimo: ${Utils.COEFF_THRESHOLD}`,
        "error",
      );
      return;
    }
    if (
      Utils.getAgileDay(resource, wKey) === newDay &&
      !Utils.isChanged(resource, wKey)
    ) {
      UI.toast("Giorno già selezionato", "warning");
      return;
    }
    await FirebaseService.updateResource(id, {
      schedule: { ...resource.schedule, [wKey]: newDay },
      changes: { ...resource.changes, [wKey]: true },
    });
    UI.toast(
      `Cambio → ${Utils.DAYS[newDay]} (−${Utils.COEFF_PENALTY} coeff)`,
      "warning",
    );
  }

  async function removeChange(id) {
    if (Auth.isUser() && Auth.getSession().resourceId !== id) {
      UI.toast("Permesso negato", "error");
      return;
    }
    const resource = _getResource(id);
    if (!resource) return;
    const wKey = Utils.weekKey(state.currentWeekOffset);
    const s = { ...resource.schedule };
    delete s[wKey];
    const c = { ...resource.changes };
    delete c[wKey];
    await FirebaseService.updateResource(id, { schedule: s, changes: c });
    UI.toast("Cambio annullato", "warning");
  }

  // ── USER MANAGEMENT ──────────────────────────────────────

  async function createUser() {
    const username = document.getElementById("newUsername")?.value.trim();
    const password = document.getElementById("newPassword")?.value;
    const role = document.getElementById("newRole")?.value;
    const errEl = document.getElementById("userFormError");
    errEl?.classList.add("d-none");

    // Extra fields only meaningful for 'user' role
    const category =
      document.getElementById("newCategory")?.value || "Developer";
    const baseDay = parseInt(
      document.getElementById("newBaseDay")?.value ?? "0",
    );
    const coeff0 = parseFloat(
      document.getElementById("newCoeff")?.value ?? "5",
    );

    const result = await Auth.createUser({
      username,
      password,
      role,
      category,
      baseDay,
      coeff0,
      createdWeekOffset: state.currentWeekOffset,
    });

    if (!result.ok) {
      if (errEl) {
        errEl.textContent = result.error;
        errEl.classList.remove("d-none");
      }
      return;
    }

    ["newUsername", "newPassword"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const msg =
      role === "user"
        ? `Utente "${username}" creato con risorsa collegata ✓`
        : `Admin "${username}" creato ✓`;
    UI.toast(msg, "success");
    try {
      state.usersList = await FirebaseService.getAllUsers();
    } catch (_) {}
    _renderUsersPanel();
  }

  async function deleteUser(userId) {
    if (userId === Auth.getSession()?.id) {
      UI.toast("Non puoi eliminare te stesso", "error");
      return;
    }
    await Auth.deleteUser(userId);
    UI.toast("Utente eliminato", "warning");
    try {
      state.usersList = await FirebaseService.getAllUsers();
    } catch (_) {}
    _renderUsersPanel();
  }

  function openEditUserModal(userId) {
    const user = state.usersList.find((u) => u.id === userId);
    if (!user) {
      UI.toast("Utente non trovato", "error");
      return;
    }

    // Pre-fill modal with current user data
    const editUsername = document.getElementById("editUsername");
    const editPassword = document.getElementById("editPassword");
    const editRole = document.getElementById("editRole");

    editUsername.value = user.username;
    editPassword.value = "";
    editRole.value = user.role;

    document.getElementById("editUserError").classList.add("d-none");

    // Store user ID for save function
    window._editingUserId = userId;

    // Show modal
    const modal = bootstrap.Modal.getOrCreateInstance(
      document.getElementById("editUserModal"),
    );
    modal.show();
  }

  async function editUser() {
    const userId = window._editingUserId;
    if (!userId) return;

    const username = document.getElementById("editUsername")?.value.trim();
    const password = document.getElementById("editPassword")?.value;
    const role = document.getElementById("editRole")?.value;
    const errEl = document.getElementById("editUserError");

    errEl?.classList.add("d-none");

    const result = await Auth.updateUser(userId, {
      username: username || undefined,
      newPassword: password || undefined,
      role: role || undefined,
    });

    if (!result.ok) {
      errEl.textContent = result.error;
      errEl?.classList.remove("d-none");
      return;
    }

    UI.toast("Utente aggiornato", "success");

    // Close modal and refresh list
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("editUserModal"),
    );
    if (modal) modal.hide();

    try {
      state.usersList = await FirebaseService.getAllUsers();
    } catch (_) {}
    _renderUsersPanel();
  }

  // ── RENDER: USERS PANEL ──────────────────────────────────

  async function _renderUsersPanel() {
    const el = document.getElementById("usersContent");
    if (!el) return;

    if (!FirebaseService.isConnected()) {
      el.innerHTML = `<div class="empty-state"><i class="bi bi-fire d-block mb-2" style="font-size:1.5rem"></i>Firebase non connesso</div>`;
      return;
    }

    try {
      state.usersList = await FirebaseService.getAllUsers();
    } catch (_) {}
    const users = state.usersList;

    // Build table rows
    const rows = users
      .map((u) => {
        const roleBadge = `<span class="badge-role badge-${u.role}">${u.role.toUpperCase()}</span>`;
        const linkedRes = u.resourceId
          ? state.resources.find((r) => r.id === u.resourceId)?.name ||
            "<em>risorsa rimossa</em>"
          : "—";
        const linkedCat = u.resourceId
          ? state.resources.find((r) => r.id === u.resourceId)?.category || ""
          : "";
        const isSelf = u.id === Auth.getSession()?.id;
        const catBadge = linkedCat
          ? `<span class="cat-badge cat-${linkedCat} ms-1">${linkedCat}</span>`
          : "";
        return `<tr>
        <td style="font-family:'Syne',sans-serif;font-weight:600;font-size:0.82rem">${_esc(u.username)}</td>
        <td>${roleBadge}</td>
        <td style="font-size:0.75rem">${linkedRes}${catBadge}</td>
        <td style="text-align:right;">
          ${
            !isSelf
              ? `<button class="btn-edit" title="Modifica" onclick="App.openEditUserModal('${u.id}')" style="margin-right:4px;"><i class="bi bi-pencil"></i></button><button class="btn-remove" onclick="App.deleteUser('${u.id}')">✕</button>`
              : '<span style="color:var(--muted);font-size:0.7rem">(tu)</span>'
          }
        </td>
      </tr>`;
      })
      .join("");

    el.innerHTML = `
      <!-- ── ADD USER FORM ── -->
      <div class="dash-panel mb-4">
        <div class="dash-panel-title"><i class="bi bi-person-plus me-1"></i>Nuovo Utente</div>

        <!-- Credentials row -->
        <div class="row g-2 mb-2">
          <div class="col-12 col-sm-6 col-md-4">
            <label class="form-label">Username</label>
            <input type="text" class="form-control form-control-sm agile-input" id="newUsername" placeholder="mario.rossi" />
          </div>
          <div class="col-12 col-sm-6 col-md-4">
            <label class="form-label">Password</label>
            <div class="input-group input-group-sm">
              <input type="password" class="form-control agile-input" id="newPassword" placeholder="••••••••" />
              <button class="input-group-text agile-input-addon" type="button"
                onclick="const f=document.getElementById('newPassword');f.type=f.type==='password'?'text':'password';this.querySelector('i').className=f.type==='password'?'bi bi-eye':'bi bi-eye-slash'">
                <i class="bi bi-eye"></i>
              </button>
            </div>
          </div>
          <div class="col-12 col-sm-6 col-md-4">
            <label class="form-label">Ruolo</label>
            <select class="form-select form-select-sm agile-input" id="newRole"
              onchange="document.getElementById('userResourceSection').classList.toggle('d-none', this.value !== 'user')">
              <option value="user">👤 User</option>
              <option value="admin">🔑 Admin</option>
            </select>
          </div>
        </div>

        <!-- Resource config — shown only for 'user' role -->
        <div id="userResourceSection" class="user-resource-section">
          <div class="user-resource-header">
            <i class="bi bi-person-workspace me-1"></i>
            Configurazione Risorsa — generata automaticamente per l'utente
          </div>
          <div class="row g-2">
            <div class="col-12 col-sm-6 col-md-4">
              <label class="form-label">Categoria</label>
              <select class="form-select form-select-sm agile-input" id="newCategory">
                <option value="Developer">💻 Developer</option>
                <option value="SysAdmin">🖥️ SysAdmin</option>
                <option value="HelpDesk">🎧 HelpDesk</option>
                <option value="DBA">🗄️ DBA</option>
                <option value="Manager">📋 Manager</option>
              </select>
            </div>
            <div class="col-12 col-sm-6 col-md-4">
              <label class="form-label">Giorno agile base</label>
              <select class="form-select form-select-sm agile-input" id="newBaseDay">
                <option value="0">Lunedì</option>
                <option value="1">Martedì</option>
                <option value="2">Mercoledì</option>
                <option value="3">Giovedì</option>
                <option value="4">Venerdì</option>
              </select>
            </div>
            <div class="col-12 col-sm-6 col-md-4">
              <label class="form-label">Coefficiente iniziale</label>
              <input type="number" class="form-control form-control-sm agile-input" id="newCoeff"
                value="5.0" step="0.1" min="0" max="10" />
            </div>
          </div>
          <div class="user-resource-note mt-2">
            <i class="bi bi-info-circle me-1"></i>
            Il nome della risorsa corrisponderà all'username. Potrai rinominarlo in seguito.
          </div>
        </div>

        <div class="alert alert-danger py-1 mt-2 small d-none" id="userFormError"></div>

        <div class="mt-3">
          <button class="btn btn-agile px-4" onclick="App.createUser()">
            <i class="bi bi-plus-lg me-1"></i>Crea Utente
          </button>
        </div>
      </div>

      <!-- ── USERS TABLE ── -->
      <div class="dash-panel">
        <div class="dash-panel-title"><i class="bi bi-people me-1"></i>Utenti registrati (${users.length})</div>
        ${
          users.length
            ? `
          <div style="overflow-x:auto">
            <table class="dash-table">
              <thead><tr>
                <th>Username</th><th>Ruolo</th><th>Risorsa collegata</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
            : '<div class="empty-state">Nessun utente — crea il primo account sopra</div>'
        }
      </div>`;
  }

  // ── MAIN RENDER ──────────────────────────────────────────

  function render() {
    _renderWeekNav();

    // Auto-select user's resource if available and not yet selected
    if (Auth.isUser() && !state.selectedId) {
      const session = Auth.getSession();
      if (session?.resourceId) {
        const ownResource = state.resources.find(
          (r) => r.id === session.resourceId,
        );
        if (ownResource) {
          state.selectedId = session.resourceId;
        }
      }
    }

    _renderResourceList();
    _renderCalendar();
    _renderDetail();
    // hide admin-only sidebar elements for 'user' role
    document
      .querySelectorAll(".admin-only")
      .forEach((el) => el.classList.toggle("d-none", !Auth.isAdmin()));
  }

  function _renderWeekNav() {
    const dates = Utils.getWeekDates(state.currentWeekOffset);
    const wn = Utils.getWeekNumber(dates[0]);
    const yr = dates[0].getFullYear();
    const lbl = document.getElementById("weekLabel");
    if (lbl)
      lbl.textContent = `Settimana ${wn} · ${Utils.formatDate(dates[0])} – ${Utils.formatDate(dates[4])} ${yr}`;
    const badge = document.getElementById("currentWeekLabel");
    if (badge) badge.textContent = `W${String(wn).padStart(2, "0")} ${yr}`;
  }

  function _renderResourceList() {
    const el = document.getElementById("resourceList");
    const countEl = document.getElementById("resCount");
    const filter = document.getElementById("filterCategory")?.value || "";
    const session = Auth.getSession();
    const resources = filter
      ? state.resources.filter((r) => r.category === filter)
      : state.resources;

    if (countEl) countEl.textContent = state.resources.length;
    if (!el) return;

    if (!resources.length) {
      el.innerHTML = `<div class="empty-state">
        <i class="bi bi-${FirebaseService.isConnected() ? "people" : "fire"} d-block mb-2" style="font-size:1.5rem"></i>
        ${FirebaseService.isConnected() ? "Nessuna risorsa" : "In attesa di Firebase…"}
      </div>`;
      return;
    }

    el.innerHTML = resources
      .map((r) => {
        const coeff = Utils.getCoeffAtWeek(r, state.currentWeekOffset);
        const wKey = Utils.weekKey(state.currentWeekOffset);
        const changed = Utils.isChanged(r, wKey);
        const level = Utils.coeffLevel(coeff);
        const cat = Utils.getCategory(r.category);
        const isOwn = session?.resourceId === r.id;
        const dim =
          Auth.isUser() && !isOwn ? "opacity:0.35;pointer-events:none" : "";

        return `
        <div class="resource-item ${state.selectedId === r.id ? "active" : ""} ${isOwn ? "own-resource" : ""}"
             style="${dim}" onclick="App.selectResource('${r.id}')">
          <div class="overflow-hidden">
            <div class="resource-name">${_esc(r.name)} ${isOwn ? '<span class="own-tag">TU</span>' : ""}</div>
            <div class="resource-sub">
              <span class="cat-badge cat-${r.category}">${cat ? cat.label : r.category}</span>
              · ${Utils.DAYS[r.baseDay]}
            </div>
          </div>
          <div class="d-flex align-items-center gap-1 flex-shrink-0">
            ${changed ? '<i class="bi bi-arrow-left-right" style="color:var(--accent2);font-size:0.7rem"></i>' : ""}
            <span class="coeff-badge coeff-${level}">${coeff.toFixed(1)}</span>
            ${Auth.isAdmin() ? `<button class="btn-remove" onclick="event.stopPropagation();App.removeResource('${r.id}')">✕</button>` : ""}
          </div>
        </div>`;
      })
      .join("");
  }

  function _renderCalendar() {
    const dates = Utils.getWeekDates(state.currentWeekOffset);
    const wKey = Utils.weekKey(state.currentWeekOffset);
    const calBody = document.getElementById("calBody");
    if (!calBody) return;

    const dayMap = Array.from({ length: 5 }, () => []);
    state.resources.forEach((r) =>
      dayMap[Utils.getAgileDay(r, wKey)].push({
        r,
        changed: Utils.isChanged(r, wKey),
      }),
    );

    calBody.innerHTML = dates
      .map((d, i) => {
        const today = Utils.isToday(d);
        const dayName = Utils.DAYS[i];
        const chips = dayMap[i]
          .map(({ r, changed }) => {
            const canEditChip =
              Auth.isAdmin() || Auth.getSession()?.resourceId === r.id;
            return `<div class="chip ${changed ? "chip-changed" : "chip-agile"}">
          <span>${_esc(r.name.split(" ")[0])}</span>
          ${changed && canEditChip ? `<span class="chip-remove" onclick="App.removeChange('${r.id}')">×</span>` : ""}
        </div>`;
          })
          .join("");
        return `<div class="col cal-cell ${chips ? "agile-day" : ""} ${today ? "today" : ""}">
        <div class="day-header">
          <div class="day-name">${dayName}</div>
          <div class="day-num">${Utils.formatDate(d)}${today ? " ●" : ""}</div>
        </div>
        ${chips}
      </div>`;
      })
      .join("");
  }

  function _renderDetail() {
    const el = document.getElementById("detailPanel");
    if (!el) return;

    if (!state.selectedId) {
      el.innerHTML = `<div class="empty-state"><i class="bi bi-cursor d-block mb-2" style="font-size:1.5rem"></i>Seleziona una risorsa</div>`;
      return;
    }

    const r = _getResource(state.selectedId);
    if (!r) {
      state.selectedId = null;
      _renderDetail();
      return;
    }

    const wKey = Utils.weekKey(state.currentWeekOffset);
    const coeff = Utils.getCoeffAtWeek(r, state.currentWeekOffset);
    const coeffPct =
      ((coeff - Utils.COEFF_MIN) / (Utils.COEFF_MAX - Utils.COEFF_MIN)) * 100;
    const agileDay = Utils.getAgileDay(r, wKey);
    const changed = Utils.isChanged(r, wKey);
    const canChange = coeff >= Utils.COEFF_THRESHOLD;
    const cat = Utils.getCategory(r.category);
    const canEdit = Auth.isAdmin() || Auth.getSession()?.resourceId === r.id;
    const totalChanges = Object.values(r.changes).filter(Boolean).length;

    let histHTML = "";
    for (let wo = r.createdWeekOffset; wo <= state.currentWeekOffset; wo++) {
      const wk = Utils.weekKeyForOffset(wo);
      const wDates = Utils.getWeekDates(wo);
      const aD = r.schedule[wk] !== undefined ? r.schedule[wk] : r.baseDay;
      const chg = r.changes[wk];
      const c = Utils.getCoeffAtWeek(r, wo);
      const col =
        c >= 7 ? "var(--accent)" : c >= 4 ? "var(--accent2)" : "var(--accent3)";
      histHTML =
        `<tr>
        <td style="color:var(--muted)">${Utils.formatDate(wDates[0])}–${Utils.formatDate(wDates[4])}</td>
        <td>${Utils.DAYS[aD]}</td>
        <td><span class="tag ${chg ? "tag-change" : "tag-stable"}">${chg ? "CAMBIO" : "STABILE"}</span></td>
        <td style="color:${col}">${c.toFixed(1)}</td>
      </tr>` + histHTML;
    }

    const dayBtns = Utils.DAYS.map((_, i) => {
      const isCurrent =
        (agileDay === i && !changed) || (changed && r.schedule[wKey] === i);
      return `<button class="day-btn ${isCurrent ? "selected" : ""}"
        onclick="App.requestChange('${r.id}', ${i})"
        ${(agileDay === i && !changed) || !canEdit ? "disabled" : ""}>
        ${Utils.DAYS_SHORT[i]}</button>`;
    }).join("");

    el.innerHTML = `
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
          <div style="font-family:'Syne',sans-serif;font-weight:700;color:var(--accent);font-size:0.9rem">${Utils.DAYS[agileDay]}</div>
          ${changed ? '<div style="font-size:0.62rem;color:var(--accent2)"><i class="bi bi-arrow-left-right me-1"></i>Cambiato</div>' : ""}
        </div>
      </div>
      <div class="row g-2 mb-3">
        ${[
          ["Coefficiente", coeff.toFixed(1), Utils.coeffColor(coeff)],
          ["Tot. cambi", totalChanges, "amber"],
          [
            "Cambio libero",
            canChange ? "SÌ" : "NO",
            canChange ? "green" : "red",
          ],
          [
            "Settimana",
            Utils.getWeekNumber(Utils.getWeekStart(state.currentWeekOffset)),
            "",
          ],
        ]
          .map(
            ([l, v, c]) => `<div class="col-6 col-sm-3"><div class="stat-box">
            <div class="stat-label">${l}</div><div class="stat-value ${c}">${v}</div>
          </div></div>`,
          )
          .join("")}
      </div>
      <div class="coeff-track mb-3">
        <div class="coeff-track-header">
          <span class="coeff-track-label">Livello Coefficiente</span>
          <span class="coeff-track-value">${coeff.toFixed(1)} / ${Utils.COEFF_MAX}</span>
        </div>
        <div class="coeff-bar"><div class="coeff-fill" style="width:${coeffPct}%"></div></div>
      </div>
      <div class="change-form mb-3">
        <div class="change-form-title"><i class="bi bi-calendar-event me-1"></i>Richiedi Cambio — Settimana Corrente</div>
        <div class="days-selector mb-2">${dayBtns}</div>
        ${changed && canEdit ? `<button class="btn btn-sm btn-outline-danger" onclick="App.removeChange('${r.id}')"><i class="bi bi-x-lg me-1"></i>Annulla cambio</button>` : ""}
        ${!canChange ? `<div class="mt-2" style="font-size:0.7rem;color:var(--accent3)"><i class="bi bi-exclamation-triangle me-1"></i>Coefficiente insufficiente (min. ${Utils.COEFF_THRESHOLD})</div>` : ""}
        ${!canEdit ? `<div class="mt-2" style="font-size:0.7rem;color:var(--muted)"><i class="bi bi-lock me-1"></i>Puoi modificare solo la tua risorsa</div>` : ""}
      </div>
      ${
        histHTML
          ? `<div>
        <div class="panel-title mb-2"><i class="bi bi-clock-history me-1"></i>Storico Settimane</div>
        <div style="overflow-x:auto"><table class="history-table">
          <thead><tr><th>Settimana</th><th>Giorno Agile</th><th>Stato</th><th>Coeff.</th></tr></thead>
          <tbody>${histHTML}</tbody>
        </table></div>
      </div>`
          : ""
      }`;
  }

  function _getResource(id) {
    return state.resources.find((r) => r.id === id) || null;
  }
  function _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    submitLogin,
    logout,
    connectFirebase,
    loadSavedConfig,
    showSetup,
    prevWeek,
    nextWeek,
    removeResource,
    selectResource,
    requestChange,
    removeChange,
    createUser,
    deleteUser,
    openEditUserModal,
    editUser,
    showMain,
    showDashboard,
    showUsers,
    render,
  };
})();
