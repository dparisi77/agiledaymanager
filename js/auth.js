/**
 * auth.js — Agile Day Manager
 * Manages user authentication, roles, and session persistence.
 *
 * Architecture:
 *   - Users are stored in Firestore collection "users" by admin.
 *   - Passwords are stored as SHA-256 hex hashes (no plaintext).
 *   - Session is kept in sessionStorage (cleared on tab close).
 *   - Two roles:  "admin" | "user"
 *
 * Admin can:  manage Firebase config, add/remove resources, view dashboard.
 * User can:   change their own agile day only.
 *
 * Depends on: utils.js, firebase.js
 */

const Auth = (() => {

  const SESSION_KEY    = 'agileSession';
  const USERS_COLL     = 'users';
  const DEFAULT_ADMIN  = { username: 'admin', password: 'admin2024', role: 'admin' };

  let _session = null;   // { id, username, role, resourceId|null }
  let _onAuthChange = null;

  // ── SESSION ─────────────────────────────────────────────

  function getSession() { return _session; }
  function isLoggedIn()  { return _session !== null; }
  function isAdmin()     { return _session?.role === 'admin'; }
  function isUser()      { return _session?.role === 'user'; }

  /** Restore session from sessionStorage on page load. */
  function restoreSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) _session = JSON.parse(raw);
    } catch (_) { _session = null; }
    return _session;
  }

  function _saveSession(data) {
    _session = data;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function logout() {
    _session = null;
    sessionStorage.removeItem(SESSION_KEY);
    if (_onAuthChange) _onAuthChange(null);
  }

  /** Register a callback invoked whenever auth state changes. */
  function onAuthChange(cb) { _onAuthChange = cb; }

  // ── CRYPTO ──────────────────────────────────────────────

  async function hashPassword(password) {
    const enc    = new TextEncoder().encode(password);
    const buf    = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ── LOGIN ────────────────────────────────────────────────

  /**
   * Attempt login against Firestore users collection.
   * Falls back to default admin if no users exist yet.
   *
   * @param {string} username
   * @param {string} password  (plaintext, hashed here)
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function login(username, password) {
    if (!username || !password) {
      return { ok: false, error: 'Username e password obbligatori.' };
    }

    const hash = await hashPassword(password);

    // Try Firestore first
    if (FirebaseService.isConnected()) {
      try {
        const snap = await FirebaseService.queryUsers(username);
        if (!snap.empty) {
          const doc  = snap.docs[0];
          const data = doc.data();
          if (data.passwordHash !== hash) {
            return { ok: false, error: 'Credenziali non valide.' };
          }
          const session = {
            id:         doc.id,
            username:   data.username,
            role:       data.role,
            resourceId: data.resourceId || null,
          };
          _saveSession(session);
          if (_onAuthChange) _onAuthChange(session);
          return { ok: true };
        }
      } catch (e) {
        console.warn('[Auth] Firestore query failed, using fallback:', e);
      }
    }

    // Default admin fallback (useful before first setup)
    if (username === DEFAULT_ADMIN.username) {
      const defaultHash = await hashPassword(DEFAULT_ADMIN.password);
      if (hash === defaultHash) {
        const session = { id: 'default-admin', username, role: 'admin', resourceId: null };
        _saveSession(session);
        if (_onAuthChange) _onAuthChange(session);
        return { ok: true };
      }
    }

    return { ok: false, error: 'Credenziali non valide.' };
  }

  // ── USER MANAGEMENT (admin only) ─────────────────────────

  /**
   * Create a new user in Firestore.
   * @param {Object} opts
   * @param {string} opts.username
   * @param {string} opts.password   plaintext
   * @param {'admin'|'user'} opts.role
   * @param {string|null} opts.resourceId   link to resource doc id
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function createUser({ username, password, role, resourceId = null }) {
    if (!FirebaseService.isConnected()) return { ok: false, error: 'Firebase non connesso.' };
    if (!username || !password)          return { ok: false, error: 'Campi obbligatori mancanti.' };

    // Check uniqueness
    const existing = await FirebaseService.queryUsers(username);
    if (!existing.empty) return { ok: false, error: `Username "${username}" già esistente.` };

    const passwordHash = await hashPassword(password);
    await FirebaseService.addUser({ username, passwordHash, role, resourceId, createdAt: null });
    return { ok: true };
  }

  /**
   * Delete a user from Firestore.
   * @param {string} userId  Firestore document id
   */
  async function deleteUser(userId) {
    if (!FirebaseService.isConnected()) throw new Error('Firebase non connesso.');
    await FirebaseService.deleteUserDoc(userId);
  }

  /**
   * Change password for a user.
   * @param {string} userId
   * @param {string} newPassword  plaintext
   */
  async function changePassword(userId, newPassword) {
    const hash = await hashPassword(newPassword);
    await FirebaseService.updateUserDoc(userId, { passwordHash: hash });
  }

  // ── PUBLIC ───────────────────────────────────────────────
  return {
    getSession,
    isLoggedIn,
    isAdmin,
    isUser,
    restoreSession,
    logout,
    onAuthChange,
    login,
    createUser,
    deleteUser,
    changePassword,
    hashPassword,
  };

})();
