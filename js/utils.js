/**
 * utils.js — Agile Day Manager
 * Pure utility functions: date/week helpers, coefficient algorithm,
 * category helpers, formatting. No side-effects, no DOM access.
 */

const Utils = (() => {
  // ── CONSTANTS ────────────────────────────────────────────
  const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];
  const DAYS_SHORT = ["LUN", "MAR", "MER", "GIO", "VEN"];

  const COEFF_BONUS = 0.5;
  const COEFF_PENALTY = 1.5;
  const COEFF_MIN = 0.0;
  const COEFF_MAX = 10.0;
  const COEFF_THRESHOLD = 5.0;

  const CATEGORIES = [
    { value: "Developer", label: "💻 Developer", css: "Developer" },
    { value: "SysAdmin", label: "🖥️ SysAdmin", css: "SysAdmin" },
    { value: "HelpDesk", label: "🎧 HelpDesk", css: "HelpDesk" },
    { value: "DBA", label: "🗄️ DBA", css: "DBA" },
    { value: "Manager", label: "📋 Manager", css: "Manager" },
  ];

  // ── DATE HELPERS (native implementation) ──────────────────

  /**
   * Get the Monday Date of the week containing the given date.
   * @param {Date} d
   * @returns {Date}
   */
  function _getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  /**
   * Get ISO week number (1-53).
   * @param {Date} d
   * @returns {number}
   */
  function _getISOWeek(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 4 - (date.getDay() || 7));
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return weekNumber;
  }

  // ── WEEK HELPERS ─────────────────────────────────────────

  /**
   * Returns the Monday Date of the week at `offset` weeks from today.
   * @param {number} offset
   * @returns {Date}
   */
  function getWeekStart(offset = 0) {
    const today = new Date();
    const monday = _getMonday(today);
    const result = new Date(monday);
    result.setDate(result.getDate() + offset * 7);
    return result;
  }

  /**
   * Returns an array of 5 Date objects (Mon–Fri) for the given week offset.
   * @param {number} offset
   * @returns {Date[]}
   */
  function getWeekDates(offset = 0) {
    const mon = getWeekStart(offset);
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  /**
   * ISO week number (1-53) for a given Date.
   * @param {Date} d
   * @returns {number}
   */
  function getWeekNumber(d) {
    return _getISOWeek(d);
  }

  /**
   * String key like "2025-W22" for a given week offset.
   * @param {number} offset
   * @returns {string}
   */
  function weekKey(offset = 0) {
    const d = getWeekStart(offset);
    const year = d.getFullYear();
    const week = _getISOWeek(d);
    const wn = String(week).padStart(2, "0");
    return `${year}-W${wn}`;
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
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
  }

  /**
   * True if Date d is today.
   * @param {Date} d
   * @returns {boolean}
   */
  function isToday(d) {
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
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
    return resource.changes[wKey] === "change";
  }

  /**
   * True if a recovery was recorded for this resource in the given week.
   * @param {Object} resource
   * @param {string} wKey
   * @returns {boolean}
   */
  function isRecovery(resource, wKey) {
    return resource.changes[wKey] === "recovery";
  }

  /**
   * Get the type of change for this week: "change" | "recovery" | undefined
   * @param {Object} resource
   * @param {string} wKey
   * @returns {string|undefined}
   */
  function getChangeType(resource, wKey) {
    return resource.changes[wKey];
  }

  /**
   * Replay coefficient history from resource creation up to targetOffset.
   * Rules:
   *   - First week (creation): no bonus/penalty
   *   - Subsequent stable weeks (no change, no recovery): +COEFF_BONUS
   *   - Weeks with a "change": -COEFF_PENALTY
   *   - Weeks with a "recovery": no bonus, no penalty (neutral)
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
      const changeType = resource.changes[wk];

      if (changeType === "change") {
        // Change: apply penalty
        coeff = Math.max(COEFF_MIN, coeff - COEFF_PENALTY);
      } else if (changeType === "recovery") {
        // Recovery: no bonus, no penalty (neutral)
        // coeff stays the same
      } else if (w > start) {
        // Stable week: apply bonus
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
    if (c >= 7) return "high";
    if (c >= 4) return "mid";
    return "low";
  }

  /**
   * CSS utility class for stat-value coloring.
   * @param {number} c
   * @returns {'green'|'amber'|'red'}
   */
  function coeffColor(c) {
    if (c >= 7) return "green";
    if (c >= 4) return "amber";
    return "red";
  }

  /**
   * Find category metadata by value.
   * @param {string} value
   * @returns {Object|undefined}
   */
  function getCategory(value) {
    return CATEGORIES.find((c) => c.value === value);
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
    isRecovery,
    getChangeType,
    getCoeffAtWeek,
    // display
    coeffLevel,
    coeffColor,
    getCategory,
  };
})();
