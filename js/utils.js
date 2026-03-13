/**
 * utils.js — Agile Day Manager
 * Pure utility functions: date/week helpers, coefficient algorithm,
 * category helpers, formatting. No side-effects, no DOM access.
 */

const Utils = (() => {

  // ── CONSTANTS ────────────────────────────────────────────
  const DAYS       = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì'];
  const DAYS_SHORT = ['LUN','MAR','MER','GIO','VEN'];

  const COEFF_BONUS     = 0.5;
  const COEFF_PENALTY   = 1.5;
  const COEFF_MIN       = 0.0;
  const COEFF_MAX       = 10.0;
  const COEFF_THRESHOLD = 5.0;

  const CATEGORIES = [
    { value: 'Developer', label: '💻 Developer', css: 'Developer' },
    { value: 'SysAdmin',  label: '🖥️ SysAdmin',  css: 'SysAdmin'  },
    { value: 'HelpDesk',  label: '🎧 HelpDesk',  css: 'HelpDesk'  },
    { value: 'DBA',       label: '🗄️ DBA',       css: 'DBA'       },
    { value: 'Manager',   label: '📋 Manager',   css: 'Manager'   },
  ];

  // ── WEEK HELPERS ─────────────────────────────────────────

  /**
   * Returns the Monday Date of the week at `offset` weeks from today.
   * @param {number} offset
   * @returns {Date}
   */
  function getWeekStart(offset = 0) {
    const now  = new Date();
    const day  = now.getDay(); // 0 = Sun
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon  = new Date(now);
    mon.setDate(diff);
    mon.setHours(0, 0, 0, 0);
    mon.setDate(mon.getDate() + offset * 7);
    return mon;
  }

  /**
   * Returns an array of 5 Date objects (Mon–Fri) for the given week offset.
   * @param {number} offset
   * @returns {Date[]}
   */
  function getWeekDates(offset = 0) {
    const mon = getWeekStart(offset);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  }

  /**
   * ISO week number (1-53) for a given Date.
   * @param {Date} d
   * @returns {number}
   */
  function getWeekNumber(d) {
    const date   = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * String key like "2025-W22" for a given week offset.
   * @param {number} offset
   * @returns {string}
   */
  function weekKey(offset = 0) {
    const d  = getWeekStart(offset);
    const wn = String(getWeekNumber(d)).padStart(2, '0');
    return `${d.getFullYear()}-W${wn}`;
  }

  /**
   * weekKey computed from an absolute offset value
   * (same as weekKey but allows calling with arbitrary absolute offsets).
   * @param {number} offset
   * @returns {string}
   */
  const weekKeyForOffset = weekKey;

  /**
   * Format a Date as "DD/MM".
   * @param {Date} d
   * @returns {string}
   */
  function formatDate(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * True if Date d is today.
   * @param {Date} d
   * @returns {boolean}
   */
  function isToday(d) {
    const t = new Date();
    return (
      d.getDate()     === t.getDate()  &&
      d.getMonth()    === t.getMonth() &&
      d.getFullYear() === t.getFullYear()
    );
  }

  // ── RESOURCE HELPERS ─────────────────────────────────────

  /**
   * Get the agile day index for a resource in a given week.
   * Falls back to baseDay if no override exists.
   * @param {Object} resource
   * @param {string} wKey
   * @returns {number}
   */
  function getAgileDay(resource, wKey) {
    return resource.schedule[wKey] !== undefined
      ? resource.schedule[wKey]
      : resource.baseDay;
  }

  /**
   * True if a change was recorded for this resource in the given week.
   * @param {Object} resource
   * @param {string} wKey
   * @returns {boolean}
   */
  function isChanged(resource, wKey) {
    return !!resource.changes[wKey];
  }

  /**
   * Replay coefficient history from resource creation up to targetOffset.
   * Rules:
   *   - First week (creation): no bonus/penalty
   *   - Subsequent stable weeks: +COEFF_BONUS
   *   - Weeks with a change: -COEFF_PENALTY
   *   - Clamped to [COEFF_MIN, COEFF_MAX]
   *
   * @param {Object} resource
   * @param {number} targetOffset
   * @returns {number}  rounded to 1 decimal
   */
  function getCoeffAtWeek(resource, targetOffset) {
    let coeff = resource.coeff0;
    const start = resource.createdWeekOffset;

    for (let w = start; w <= targetOffset; w++) {
      const wk = weekKeyForOffset(w);
      if (resource.changes[wk]) {
        coeff = Math.max(COEFF_MIN, coeff - COEFF_PENALTY);
      } else if (w > start) {
        coeff = Math.min(COEFF_MAX, coeff + COEFF_BONUS);
      }
    }
    return Math.round(coeff * 10) / 10;
  }

  // ── DISPLAY HELPERS ──────────────────────────────────────

  /**
   * CSS class suffix for a coefficient value.
   * @param {number} c
   * @returns {'high'|'mid'|'low'}
   */
  function coeffLevel(c) {
    if (c >= 7) return 'high';
    if (c >= 4) return 'mid';
    return 'low';
  }

  /**
   * CSS utility class for stat-value coloring.
   * @param {number} c
   * @returns {'green'|'amber'|'red'}
   */
  function coeffColor(c) {
    if (c >= 7) return 'green';
    if (c >= 4) return 'amber';
    return 'red';
  }

  /**
   * Find category metadata by value.
   * @param {string} value
   * @returns {Object|undefined}
   */
  function getCategory(value) {
    return CATEGORIES.find(c => c.value === value);
  }

  // ── PUBLIC API ───────────────────────────────────────────
  return {
    DAYS,
    DAYS_SHORT,
    COEFF_BONUS,
    COEFF_PENALTY,
    COEFF_MIN,
    COEFF_MAX,
    COEFF_THRESHOLD,
    CATEGORIES,
    // week
    getWeekStart,
    getWeekDates,
    getWeekNumber,
    weekKey,
    weekKeyForOffset,
    formatDate,
    isToday,
    // resource
    getAgileDay,
    isChanged,
    getCoeffAtWeek,
    // display
    coeffLevel,
    coeffColor,
    getCategory,
  };

})();
