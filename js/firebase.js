/**
 * firebase.js — Agile Day Manager
 * Handles Firebase initialization, Firestore CRUD,
 * real-time listener, and connection UI state.
 * Uses Firebase Compat SDK (via CDN) for stability.
 */

const FirebaseService = (() => {
  // ── INTERNAL STATE ───────────────────────────────────────
  const LS_CONFIG_KEY = "agileFirebaseConfig";
  const COLLECTION = "resources";
  const USERS_COLL = "users";

  let _app = null;
  let _db = null;
  let _unsubscribe = null;
  let _onDataCb = null; // called on every Firestore snapshot
  let _syncTimer = null;
  let _listenerActive = false; // Track if the real-time listener is active

  // ── SETUP MODAL ──────────────────────────────────────────

  function showSetupModal() {
    const el = document.getElementById("setupModal");
    if (!el) return;
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
  }

  function hideSetupModal() {
    const el = document.getElementById("setupModal");
    if (!el) return;
    const modal = bootstrap.Modal.getInstance(el);
    if (modal) modal.hide();
  }

  function prefillFormFromStorage() {
    const saved = localStorage.getItem(LS_CONFIG_KEY);
    if (!saved) return false;

    try {
      const cfg = JSON.parse(saved);
      _setInput("cfgApiKey", cfg.apiKey);
      _setInput("cfgAuthDomain", cfg.authDomain);
      _setInput("cfgProjectId", cfg.projectId);
      _setInput("cfgStorageBucket", cfg.storageBucket);
      _setInput("cfgMessagingSenderId", cfg.messagingSenderId);
      _setInput("cfgAppId", cfg.appId);
      return true;
    } catch (e) {
      return false;
    }
  }

  function prefillFormFromFile() {
    if (typeof FIREBASE_CONFIG === "undefined") return false;

    try {
      _setInput("cfgApiKey", FIREBASE_CONFIG.apiKey);
      _setInput("cfgAuthDomain", FIREBASE_CONFIG.authDomain);
      _setInput("cfgProjectId", FIREBASE_CONFIG.projectId);
      _setInput("cfgStorageBucket", FIREBASE_CONFIG.storageBucket);
      _setInput("cfgMessagingSenderId", FIREBASE_CONFIG.messagingSenderId);
      _setInput("cfgAppId", FIREBASE_CONFIG.appId);
      return true;
    } catch (e) {
      return false;
    }
  }

  function _setInput(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.value = value;
  }

  function _readConfigFromForm() {
    return {
      apiKey: _val("cfgApiKey"),
      authDomain: _val("cfgAuthDomain"),
      projectId: _val("cfgProjectId"),
      storageBucket: _val("cfgStorageBucket"),
      messagingSenderId: _val("cfgMessagingSenderId"),
      appId: _val("cfgAppId"),
    };
  }

  function _val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  // ── CONNECTION ───────────────────────────────────────────

  async function connect(cfg, onData) {
    if (!cfg.apiKey || !cfg.projectId) {
      throw new Error("API Key e Project ID sono obbligatori.");
    }

    _onDataCb = onData;

    // Tear down previous Firebase app
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
    if (firebase.apps.length > 0) {
      await Promise.all(firebase.apps.map((a) => a.delete()));
    }

    _app = firebase.initializeApp(cfg);
    _db = firebase.firestore(_app);

    // Test connection
    try {
      await _db.collection(COLLECTION).limit(1).get();
    } catch (err) {
      throw new Error("Connessione a Firestore fallita: " + err.message);
    }

    // Persist config
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg));

    _startListener();
  }

  async function connectFromForm(onData) {
    const cfg = _readConfigFromForm();
    await connect(cfg, onData);
  }

  async function connectFromStorage(onData) {
    const saved = localStorage.getItem(LS_CONFIG_KEY);
    if (!saved) throw new Error("Nessuna configurazione salvata.");
    const cfg = JSON.parse(saved);
    await connect(cfg, onData);
  }

  function hasSavedConfig() {
    return !!localStorage.getItem(LS_CONFIG_KEY);
  }

  function isConnected() {
    return _db !== null && _listenerActive;
  }

  function setDataCallback(onData) {
    if (!_db) return;
    _onDataCb = onData;
    _startListener();
  }

  // ── REAL-TIME LISTENER ───────────────────────────────────

  function _startListener() {
    if (_unsubscribe) _unsubscribe();
    _listenerActive = false;

    // First, try to set up listener with orderBy
    try {
      _unsubscribe = _db
        .collection(COLLECTION)
        .orderBy("createdAt", "asc")
        .onSnapshot(
          (snapshot) => {
            const resources = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
              schedule: docSnap.data().schedule || {},
              changes: docSnap.data().changes || {},
            }));
            if (_onDataCb) _onDataCb(resources);
            _hideSyncOverlay();
            _setConnStatus("connected", "Sincronizzato");
          },
          (err) => {
            console.error("[Firestore] snapshot error with orderBy:", err);
            // If orderBy fails (e.g., missing index or field), retry without orderBy
            _startListenerFallback();
          },
        );
      // Mark listener as active after successfully registering the callback
      _listenerActive = true;
    } catch (err) {
      console.error("[Firestore] Error setting up orderBy listener:", err);
      _startListenerFallback();
    }
  }

  function _startListenerFallback() {
    // Fallback: try without orderBy
    try {
      _unsubscribe = _db.collection(COLLECTION).onSnapshot(
        (snapshot) => {
          const resources = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
            schedule: docSnap.data().schedule || {},
            changes: docSnap.data().changes || {},
          }));
          if (_onDataCb) _onDataCb(resources);
          _hideSyncOverlay();
          _setConnStatus("connected", "Sincronizzato");
        },
        (err) => {
          console.error("[Firestore] snapshot error:", err);
          _listenerActive = false;
          _setConnStatus("error", "Errore sync");
          UI.toast("Errore sincronizzazione Firebase", "error");
        },
      );
      // Mark listener as active after successfully registering the callback
      _listenerActive = true;
    } catch (err) {
      console.error("[Firestore] Fallback listener also failed:", err);
      _listenerActive = false;
      _setConnStatus("error", "Errore sync");
      UI.toast("Errore sincronizzazione Firebase", "error");
    }
  }

  // ── FIRESTORE CRUD ───────────────────────────────────────

  async function addResource(data) {
    _ensureConnected();
    _showSyncOverlay();
    try {
      const ref = await _db.collection(COLLECTION).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return ref.id;
    } catch (e) {
      UI.toast("Errore salvataggio: " + e.message, "error");
      _hideSyncOverlay();
      throw e;
    }
  }

  async function updateResource(id, data) {
    _ensureConnected();
    _showSyncOverlay();
    try {
      await _db.collection(COLLECTION).doc(id).update(data);
    } catch (e) {
      UI.toast("Errore aggiornamento: " + e.message, "error");
      _hideSyncOverlay();
      throw e;
    }
  }

  async function deleteResource(id) {
    _ensureConnected();
    _showSyncOverlay();
    try {
      await _db.collection(COLLECTION).doc(id).delete();
    } catch (e) {
      UI.toast("Errore eliminazione: " + e.message, "error");
      _hideSyncOverlay();
      throw e;
    }
  }

  function _ensureConnected() {
    if (!_db) throw new Error("Firebase non connesso.");
  }

  // ── UI STATE HELPERS ─────────────────────────────────────

  function _showSyncOverlay() {
    clearTimeout(_syncTimer);
    document.getElementById("syncOverlay")?.classList.add("show");
  }

  function _hideSyncOverlay() {
    _syncTimer = setTimeout(() => {
      document.getElementById("syncOverlay")?.classList.remove("show");
    }, 400);
  }

  function _setConnStatus(status, label) {
    const dot = document.getElementById("connDot");
    const lbl = document.getElementById("connLabel");
    if (dot) dot.className = "conn-dot " + status;
    if (lbl) lbl.textContent = label;
  }

  function setConnected(projectId) {
    _setConnStatus("connected", projectId || "Connesso");
  }

  function setConnecting() {
    _setConnStatus("connecting", "Connessione…");
  }

  function setError() {
    _setConnStatus("error", "Errore");
  }

  // ── SETUP ERROR UI ───────────────────────────────────────

  function showSetupError(msg) {
    const el = document.getElementById("setupError");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("d-none");
  }

  function hideSetupError() {
    document.getElementById("setupError")?.classList.add("d-none");
  }

  // ── USER COLLECTION ──────────────────────────────────────

  async function queryUsers(username) {
    _ensureConnected();
    return _db.collection(USERS_COLL).where("username", "==", username).get();
  }

  async function getAllUsers() {
    _ensureConnected();
    const snap = await _db
      .collection(USERS_COLL)
      .orderBy("createdAt", "asc")
      .get();
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  }

  async function addUser(data) {
    _ensureConnected();
    await _db.collection(USERS_COLL).add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function updateUserDoc(id, data) {
    _ensureConnected();
    await _db.collection(USERS_COLL).doc(id).update(data);
  }

  async function deleteUserDoc(id) {
    _ensureConnected();
    await _db.collection(USERS_COLL).doc(id).delete();
  }

  // ── PUBLIC API ───────────────────────────────────────────
  return {
    showSetupModal,
    hideSetupModal,
    prefillFormFromStorage,
    prefillFormFromFile,
    hasSavedConfig,
    isConnected,
    setDataCallback,
    connect,
    connectFromForm,
    connectFromStorage,
    addResource,
    updateResource,
    deleteResource,
    // users
    queryUsers,
    getAllUsers,
    addUser,
    updateUserDoc,
    deleteUserDoc,
    // ui
    setConnected,
    setConnecting,
    setError,
    showSetupError,
    hideSetupError,
  };
})();

/**
 * UI utility — toast notification.
 * Separated here (not in app.js) so firebase.js can call it for errors.
 */
const UI = (() => {
  let _timer = null;

  function toast(msg, type = "success", duration = 3200) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = `agile-toast show ${type}`;
    clearTimeout(_timer);
    _timer = setTimeout(() => {
      el.className = "agile-toast";
    }, duration);
  }

  /**
   * Show a dialog with custom buttons.
   * @param {string} message  The message to display
   * @param {Object} options  Config with { buttons: [{label, value, class}, ...] }
   * @returns {Promise<string|null>}  The value of the clicked button, or null if cancelled
   */
  function confirm(message, options = {}) {
    return new Promise((resolve) => {
      const { buttons = [] } = options;

      // Create modal HTML
      const modal = document.createElement("div");
      modal.className = "confirm-modal-overlay";

      const content = `
        <div class="confirm-modal">
          <div class="confirm-title">${message}</div>
          <div class="confirm-buttons">
            ${buttons
              .map(
                (btn) =>
                  `<button class="btn ${btn.class || "btn-primary"}" 
                     data-value="${btn.value}" 
                     ${btn.disabled ? "disabled" : ""}>
                    ${btn.label}
                  </button>`,
              )
              .join("")}
          </div>
        </div>
      `;
      modal.innerHTML = content;

      // Handle button clicks
      modal.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          resolve(btn.dataset.value || null);
          modal.remove();
        });
      });

      // Handle ESC key
      const escHandler = (e) => {
        if (e.key === "Escape") {
          resolve(null);
          modal.remove();
          document.removeEventListener("keydown", escHandler);
        }
      };
      document.addEventListener("keydown", escHandler);

      document.body.appendChild(modal);
    });
  }

  return { toast, confirm };
})();
