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
  const COEFF_RECOVERY_PENALTY = 3.0; // Double cost for recovery
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

  /**
   * Get the day of week (0-4) for today: 0=Monday, 4=Friday
   * @returns {number}
   */
  function getTodayDayOfWeek() {
    const today = new Date();
    // JS getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
    const jsDay = today.getDay();
    // Convert to 0=Monday, 1=Tuesday, ..., 5=Sunday
    let dayOfWeek = jsDay - 1;
    // If it's Sunday (6 in our system), wrap to -1, but we only care about Mon-Fri (0-4)
    if (dayOfWeek < 0) dayOfWeek = 6; // Sunday: shift to end
    // Return only if it's Mon-Fri (0-4)
    return dayOfWeek <= 4 ? dayOfWeek : -1; // -1 if weekend
  }

  /**
   * Check if it's still possible to change to a given day in the current week.
   * Can't change to a day that has already passed (Mon-Fri only).
   * @param {number} targetDayIndex  0-4 (Monday-Friday)
   * @returns {boolean}  true if change is allowed
   */
  function canChangeToDayInCurrentWeek(targetDayIndex) {
    const todayDay = getTodayDayOfWeek();
    // If today is weekend or unknown, don't allow (shouldn't happen in normal flow)
    if (todayDay < 0) return false;
    // Can only change to days that haven't passed yet
    // e.g., if today is Wednesday (2), can change to 2, 3, 4 (Wed, Thu, Fri)
    return targetDayIndex >= todayDay;
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
   *   - Weeks with a "change": -COEFF_PENALTY (1.5)
   *   - Weeks with a "recovery": -COEFF_RECOVERY_PENALTY (3.0, double cost)
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
        // Recovery: apply double penalty
        coeff = Math.max(COEFF_MIN, coeff - COEFF_RECOVERY_PENALTY);
      } else if (w > start) {
        // Stable week: apply bonus
        coeff = Math.min(COEFF_MAX, coeff + COEFF_BONUS);
      }
    }
    return Math.round(coeff * 10) / 10;
  }

  /**
   * Check if there's an outstanding recovery debt from the previous week.
   * If a change was made in the previous week, a recovery is mandatory in the current week.
   *
   * @param {Object} resource
   * @param {number} currentWeekOffset  current week offset (0 = this week)
   * @returns {Object}  { needsRecovery: boolean, reason: string }
   */
  function checkRecoveryDebt(resource, currentWeekOffset) {
    // No debt in the first week
    if (currentWeekOffset <= 0) {
      return { needsRecovery: false, reason: null };
    }

    // Check if there was a change in the previous week
    const prevWKey = weekKeyForOffset(currentWeekOffset - 1);
    const hadChangeLastWeek = resource.changes[prevWKey] === "change";

    if (!hadChangeLastWeek) {
      return { needsRecovery: false, reason: null };
    }

    // Check if recovery debt has been satisfied for this week
    const currentWKey = weekKeyForOffset(currentWeekOffset);
    const hasRecoveryThisWeek = resource.changes[currentWKey] === "recovery";

    if (hasRecoveryThisWeek) {
      return { needsRecovery: false, reason: null };
    }

    // There's an outstanding recovery debt
    return {
      needsRecovery: true,
      reason: `Hai un debito di recupero dalla settimana precedente. Devi fare un recupero questa settimana.`,
    };
  }

  // ── CHANGE & RECOVERY VALIDATION ────────────────────────

  /**
   * Check if a change/recovery can still be made to a given day.
   * Rules:
   *   - For current week: only until 23:59 of the day BEFORE the target day
   *   - For future weeks: always allowed
   *
   * @param {Date} targetDate  The date in the target week (e.g., the specific day of agile)
   * @returns {boolean}  true if the deadline hasn't passed
   */
  function canStillChangeToDate(targetDate) {
    const now = new Date();

    // Calculate deadline: 23:59 of the day before the target date
    const dayBefore = new Date(targetDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(23, 59, 59, 999);

    return now <= dayBefore;
  }

  /**
   * Count how many agile days (base + changes/recoveries) a resource has in a given week.
   * @param {Object} resource
   * @param {string} wKey  week key like "2025-W22"
   * @returns {number} count of agile days
   */
  function getWeeklyAgileCount(resource, wKey) {
    // Base day counts as 1
    let count = 1;

    // If there's a change or recovery scheduled for this week, that's the 2nd day
    if (resource.schedule[wKey] !== undefined && resource.changes[wKey]) {
      count = 2;
    }

    return count;
  }

  /**
   * Check if a resource already has a recovery scheduled in a given week.
   * @param {Object} resource
   * @param {string} wKey
   * @returns {boolean}
   */
  function hasRecoveryInWeek(resource, wKey) {
    return resource.changes[wKey] === "recovery";
  }

  /**
   * Check if a resource already has a change scheduled in a given week.
   * @param {Object} resource
   * @param {string} wKey
   * @returns {boolean}
   */
  function hasChangeInWeek(resource, wKey) {
    return resource.changes[wKey] === "change";
  }

  /**
   * Check if a day is the same as the base day (no conflict with recovery).
   * @param {number} dayIndex  0-4 (Monday-Friday)
   * @param {number} baseDay   0-4 (Monday-Friday)
   * @returns {boolean}  true if they're the same day
   */
  function isSameDayAsBase(dayIndex, baseDay) {
    return dayIndex === baseDay;
  }

  /**
   * Check if a change is still allowed for the current week:
   * - Can only change to days that HAVEN'T passed yet
   * - Can only change to days AFTER today
   *
   * @param {number} targetDayIndex  0-4 (Monday-Friday)
   * @returns {boolean}
   */
  function canMakeChangeInCurrentWeek(targetDayIndex) {
    const todayDay = getTodayDayOfWeek();
    // If today is weekend or unknown, allow all (shouldn't happen in normal flow)
    if (todayDay < 0) return true;
    // Can only change to days that haven't passed yet (today onwards)
    return targetDayIndex >= todayDay;
  }

  /**
   * Comprehensive validation for requesting a change/recovery.
   * Returns an object with validation result and error messages.
   *
   * @param {Object} resource
   * @param {string} wKey         week key of target week
   * @param {number} newDay       0-4 (Monday-Friday)
   * @param {number} weekOffset   current week offset (0=this week, -1=last week, etc.)
   * @param {string} changeType   "change" or "recovery"
   * @returns {Object}  { valid: boolean, error: string|null }
   */
  function validateAgileChangeRequest(
    resource,
    wKey,
    newDay,
    weekOffset,
    changeType,
  ) {
    // ── Recoveries are only allowed for future weeks ──
    if (changeType === "recovery" && weekOffset === 0) {
      return {
        valid: false,
        error:
          "I recuperi possono essere inseriti solo la settimana successiva, entro e non oltre le 23:59 di domenica.",
      };
    }

    // ── Check deadline (can change until 23:59 of day before) ──
    if (weekOffset === 0) {
      // Current week: need to check deadline
      const weekDates = getWeekDates(weekOffset);
      const targetDate = weekDates[newDay];

      if (!canStillChangeToDate(targetDate)) {
        // Get the day before
        const dayBefore = newDay - 1;
        const dayBeforeName = dayBefore < 0 ? "Domenica" : DAYS[dayBefore];
        return {
          valid: false,
          error: `Non puoi più fare un cambio per ${DAYS[newDay]}. Scadenza alle 23:59 del ${dayBeforeName}.`,
        };
      }
    }

    // ── Check if day already passed (current week only) ──
    if (weekOffset === 0 && !canMakeChangeInCurrentWeek(newDay)) {
      return {
        valid: false,
        error: `${DAYS[newDay]} è già passato. Puoi solo cambiare nei giorni successivi.`,
      };
    }

    // ── Check recovery conflicts with base day ──
    if (
      changeType === "recovery" &&
      isSameDayAsBase(newDay, resource.baseDay)
    ) {
      return {
        valid: false,
        error: `Non puoi fare un recupero su ${DAYS[newDay]}, è il tuo giorno di lavoro agile fisso.`,
      };
    }

    // ── Check if user already has 2 agile days this week ──
    const agileCount = getWeeklyAgileCount(resource, wKey);
    if (agileCount >= 2) {
      const existingChangeType = resource.changes[wKey];
      return {
        valid: false,
        error: `Hai già 2 giorni di agile questa settimana (${DAYS[resource.baseDay]} + ${existingChangeType || "cambio/recupero"}). Massimo 2 per settimana.`,
      };
    }

    // ── For recovery, check if there's already a recovery from a previous week ──
    if (changeType === "recovery") {
      // Check if they already used their mandatory recovery quota
      // For now, we'll allow only 1 recovery per week, but track it
      if (hasRecoveryInWeek(resource, wKey)) {
        return {
          valid: false,
          error: `Hai già un recupero questa settimana.`,
        };
      }
    }

    // ── For change in current week, only allow if day hasn't passed ──
    if (changeType === "change" && weekOffset === 0) {
      if (!canMakeChangeInCurrentWeek(newDay)) {
        return {
          valid: false,
          error: `${DAYS[newDay]} è già passato. Puoi solo cambiare nei giorni che verranno.`,
        };
      }
    }

    return { valid: true, error: null };
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
    COEFF_RECOVERY_PENALTY,
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
    getTodayDayOfWeek,
    canChangeToDayInCurrentWeek,
    // resource
    getAgileDay,
    isChanged,
    isRecovery,
    getChangeType,
    getCoeffAtWeek,
    // recovery debt
    checkRecoveryDebt,
    // change & recovery validation
    canStillChangeToDate,
    getWeeklyAgileCount,
    hasRecoveryInWeek,
    hasChangeInWeek,
    isSameDayAsBase,
    canMakeChangeInCurrentWeek,
    validateAgileChangeRequest,
    // display
    coeffLevel,
    coeffColor,
    getCategory,
  };
})();
