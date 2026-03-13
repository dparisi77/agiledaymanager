/**
 * firebase.js — Agile Day Manager
 * Handles Firebase initialization, Firestore CRUD,
 * real-time listener, and connection UI state.
 * Depends on: utils.js (loaded first), Firebase compat SDK (CDN).
 */

const FirebaseService = (() => {
  // ── INTERNAL STATE ───────────────────────────────────────
  const LS_CONFIG_KEY = "agileFirebaseConfig";
  const COLLECTION = "resources";

  let _db = null;
  let _unsubscribe = null;
  let _onDataCb = null; // called on every Firestore snapshot
  let _syncTimer = null;

  // ── SETUP MODAL ──────────────────────────────────────────

  /** Show the Firebase setup modal. */
  function showSetupModal() {
    const el = document.getElementById("setupModal");
    if (!el) return;
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
  }

  /** Hide the Firebase setup modal. */
  function hideSetupModal() {
    const el = document.getElementById("setupModal");
    if (!el) return;
    const modal = bootstrap.Modal.getInstance(el);
    if (modal) modal.hide();
  }

  /** Pre-fill the setup form from saved localStorage config. */
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

  /** Pre-fill the setup form from firebase-config.js file. */
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

  /** Read config values from the setup form. */
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

  /**
   * Initialize Firebase with the given config and start Firestore listener.
   * @param {Object} cfg  Firebase config object
   * @param {Function} onData  Callback(resources[]) invoked on each snapshot
   * @returns {Promise<void>}
   */
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
    if (firebase.apps.length) {
      await Promise.all(firebase.apps.map((a) => a.delete()));
    }

    const app = firebase.initializeApp(cfg);
    _db = firebase.firestore(app);

    // Test connection
    await _db.collection(COLLECTION).limit(1).get();

    // Persist config
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg));

    _startListener();
  }

  /** Connect using the current form values. */
  async function connectFromForm(onData) {
    const cfg = _readConfigFromForm();
    await connect(cfg, onData);
  }

  /** Connect using the saved localStorage config. */
  async function connectFromStorage(onData) {
    const saved = localStorage.getItem(LS_CONFIG_KEY);
    if (!saved) throw new Error("Nessuna configurazione salvata.");
    const cfg = JSON.parse(saved);
    await connect(cfg, onData);
  }

  /** True if a saved config exists in localStorage. */
  function hasSavedConfig() {
    return !!localStorage.getItem(LS_CONFIG_KEY);
  }

  /** True if Firestore is initialized. */
  function isConnected() {
    return _db !== null;
  }

  // ── REAL-TIME LISTENER ───────────────────────────────────

  function _startListener() {
    if (_unsubscribe) _unsubscribe();

    _unsubscribe = _db
      .collection(COLLECTION)
      .orderBy("createdAt", "asc")
      .onSnapshot(
        (snapshot) => {
          const resources = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            schedule: doc.data().schedule || {},
            changes: doc.data().changes || {},
          }));
          if (_onDataCb) _onDataCb(resources);
          _hideSyncOverlay();
        },
        (err) => {
          console.error("[Firestore] snapshot error:", err);
          _setConnStatus("error", "Errore sync");
          UI.toast("Errore sincronizzazione Firebase", "error");
        },
      );
  }

  // ── FIRESTORE CRUD ───────────────────────────────────────

  /**
   * Add a new resource document.
   * @param {Object} data
   * @returns {Promise<string>}  new document id
   */
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

  /**
   * Update specific fields on a resource document.
   * @param {string} id
   * @param {Object} data
   */
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

  /**
   * Delete a resource document.
   * @param {string} id
   */
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

  /** Update connection indicator to "connected" state. */
  function setConnected(projectId) {
    _setConnStatus("connected", projectId || "Connesso");
  }

  /** Update connection indicator to "connecting" state. */
  function setConnecting() {
    _setConnStatus("connecting", "Connessione…");
  }

  /** Update connection indicator to "error" state. */
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

  const USERS_COLL = "users";

  /**
   * Query users by username (case-sensitive exact match).
   * @param {string} username
   * @returns {Promise<firebase.firestore.QuerySnapshot>}
   */
  async function queryUsers(username) {
    _ensureConnected();
    return _db.collection(USERS_COLL).where("username", "==", username).get();
  }

  /**
   * Get all users (for admin user management panel).
   * @returns {Promise<Object[]>}  array of {id, ...data}
   */
  async function getAllUsers() {
    _ensureConnected();
    const snap = await _db
      .collection(USERS_COLL)
      .orderBy("createdAt", "asc")
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Add a new user document.
   * @param {Object} data
   */
  async function addUser(data) {
    _ensureConnected();
    await _db.collection(USERS_COLL).add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Update a user document.
   * @param {string} id
   * @param {Object} data
   */
  async function updateUserDoc(id, data) {
    _ensureConnected();
    await _db.collection(USERS_COLL).doc(id).update(data);
  }

  /**
   * Delete a user document.
   * @param {string} id
   */
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

  /**
   * Show a toast notification.
   * @param {string} msg
   * @param {'success'|'warning'|'error'} type
   * @param {number} duration  ms
   */
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

  return { toast };
})();
