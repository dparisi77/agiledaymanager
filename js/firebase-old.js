/**
 * firebase.js — Agile Day Manager
 * Handles Firebase initialization, Firestore CRUD,
 * real-time listener, and connection UI state.
 * Now using ES6 modules and Firebase SDK (npm).
 */

import { initializeApp, deleteApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

// ── INTERNAL STATE ───────────────────────────────────────
const LS_CONFIG_KEY = "agileFirebaseConfig";
const COLLECTION = "resources";
const USERS_COLL = "users";

let _app = null;
let _db = null;
let _unsubscribe = null;
let _onDataCb = null; // called on every Firestore snapshot
let _syncTimer = null;

// ── SETUP MODAL ──────────────────────────────────────────

/** Show the Firebase setup modal. */
export function showSetupModal() {
  const el = document.getElementById("setupModal");
  if (!el) return;
  const modal = bootstrap.Modal.getOrCreateInstance(el);
  modal.show();
}

/** Hide the Firebase setup modal. */
export function hideSetupModal() {
  const el = document.getElementById("setupModal");
  if (!el) return;
  const modal = bootstrap.Modal.getInstance(el);
  if (modal) modal.hide();
}

/** Pre-fill the setup form from saved localStorage config. */
export function prefillFormFromStorage() {
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
export function prefillFormFromFile() {
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

/** Read config values from the setup form. */
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
export async function connect(cfg, onData) {
  if (!cfg.apiKey || !cfg.projectId) {
    throw new Error("API Key e Project ID sono obbligatori.");
  }

  _onDataCb = onData;

  // Tear down previous Firebase app
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (_app) {
    await deleteApp(_app);
  }

  _app = initializeApp(cfg);
  _db = getFirestore(_app);

  // Test connection
  const q = query(collection(_db, COLLECTION), limit(1));
  await getDocs(q);

  // Persist config
  localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg));

  _startListener();
}

/** Connect using the current form values. */
export async function connectFromForm(onData) {
  const cfg = _readConfigFromForm();
  await connect(cfg, onData);
}

/** Connect using the saved localStorage config. */
export async function connectFromStorage(onData) {
  const saved = localStorage.getItem(LS_CONFIG_KEY);
  if (!saved) throw new Error("Nessuna configurazione salvata.");
  const cfg = JSON.parse(saved);
  await connect(cfg, onData);
}

/** True if a saved config exists in localStorage. */
export function hasSavedConfig() {
  return !!localStorage.getItem(LS_CONFIG_KEY);
}

/** True if Firestore is initialized. */
export function isConnected() {
  return _db !== null;
}

/**
 * Update the data callback and restart the listener.
 */
export function setDataCallback(onData) {
  if (!_db) return; // Not connected
  _onDataCb = onData;
  _startListener();
}

// ── REAL-TIME LISTENER ───────────────────────────────────

function _startListener() {
  if (_unsubscribe) _unsubscribe();

  const q = query(collection(_db, COLLECTION), orderBy("createdAt", "asc"));

  _unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const resources = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        schedule: docSnap.data().schedule || {},
        changes: docSnap.data().changes || {},
      }));
      if (_onDataCb) _onDataCb(resources);
      _hideSyncOverlay();
    },
    (err) => {
      console.error("[Firestore] snapshot error:", err);
      _setConnStatus("error", "Errore sync");
      toast("Errore sincronizzazione Firebase", "error");
    },
  );
}

// ── FIRESTORE CRUD ───────────────────────────────────────

/**
 * Add a new resource document.
 * @param {Object} data
 * @returns {Promise<string>}  new document id
 */
export async function addResource(data) {
  _ensureConnected();
  _showSyncOverlay();
  try {
    const ref = await addDoc(collection(_db, COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    toast("Errore salvataggio: " + e.message, "error");
    _hideSyncOverlay();
    throw e;
  }
}

/**
 * Update specific fields on a resource document.
 * @param {string} id
 * @param {Object} data
 */
export async function updateResource(id, data) {
  _ensureConnected();
  _showSyncOverlay();
  try {
    await updateDoc(doc(_db, COLLECTION, id), data);
  } catch (e) {
    toast("Errore aggiornamento: " + e.message, "error");
    _hideSyncOverlay();
    throw e;
  }
}

/**
 * Delete a resource document.
 * @param {string} id
 */
export async function deleteResource(id) {
  _ensureConnected();
  _showSyncOverlay();
  try {
    await deleteDoc(doc(_db, COLLECTION, id));
  } catch (e) {
    toast("Errore eliminazione: " + e.message, "error");
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
export function setConnected(projectId) {
  _setConnStatus("connected", projectId || "Connesso");
}

/** Update connection indicator to "connecting" state. */
export function setConnecting() {
  _setConnStatus("connecting", "Connessione…");
}

/** Update connection indicator to "error" state. */
export function setError() {
  _setConnStatus("error", "Errore");
}

// ── SETUP ERROR UI ───────────────────────────────────────

export function showSetupError(msg) {
  const el = document.getElementById("setupError");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none");
}

export function hideSetupError() {
  document.getElementById("setupError")?.classList.add("d-none");
}

// ── USER COLLECTION ──────────────────────────────────────

/**
 * Query users by username (case-sensitive exact match).
 * @param {string} username
 * @returns {Promise<QuerySnapshot>}
 */
export async function queryUsers(username) {
  _ensureConnected();
  const q = query(
    collection(_db, USERS_COLL),
    where("username", "==", username),
  );
  return getDocs(q);
}

/**
 * Get all users (for admin user management panel).
 * @returns {Promise<Object[]>}  array of {id, ...data}
 */
export async function getAllUsers() {
  _ensureConnected();
  const q = query(collection(_db, USERS_COLL), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * Add a new user document.
 * @param {Object} data
 */
export async function addUser(data) {
  _ensureConnected();
  await addDoc(collection(_db, USERS_COLL), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

/**
 * Update a user document.
 * @param {string} id
 * @param {Object} data
 */
export async function updateUserDoc(id, data) {
  _ensureConnected();
  await updateDoc(doc(_db, USERS_COLL, id), data);
}

/**
 * Delete a user document.
 * @param {string} id
 */
export async function deleteUserDoc(id) {
  _ensureConnected();
  await deleteDoc(doc(_db, USERS_COLL, id));
}

// ── UI UTILITY: Toast Notification ───────────────────────

let _toastTimer = null;

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'success'|'warning'|'error'} type
 * @param {number} duration  ms
 */
export function toast(msg, type = "success", duration = 3200) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `agile-toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.className = "agile-toast";
  }, duration);
}
