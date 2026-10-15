/**
 * Health Tracker App - Core Scripts
 * Main application logic and initialization
 */

// Global constants for localStorage keys
const STORAGE_KEYS = {
  GOAL_PREFIX: 'goal_',
  INTAKE_PREFIX: 'intake_',
  HISTORY_PREFIX: 'history_',
  WORKOUT_TYPES: 'workout_types',
  WORKOUT_STATE: 'workout_state',
  WORKOUT_COUNT: 'workout_count',
  WORKOUT_HISTORY: 'workout_history',
  HABITS: 'habits_data',
  REMINDER: 'reminder',
  LAST_RESET_PREFIX: 'last_reset_',
  WORKOUT_AUTORESET: 'workout_autoreset',
  ACTIVE_TAB: 'active_tab'
};

// Keys left behind by features that have been removed: the light theme
// ('theme') and the 30-day backup reminder ('last_export_date'). Nothing reads
// them any more. They are deleted on every launch, which also clears them
// again after restoring an older backup that still carries them.
const RETIRED_KEYS = ['theme', 'last_export_date'];

/**
 * Storage Manager - Handles localStorage operations with error handling
 */
const storageManager = {
  /**
   * Check if localStorage is available
   */
  isAvailable() {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Get storage usage information
   */
  getStorageInfo() {
    if (!this.isAvailable()) return null;
    
    try {
      // Calculate approximate usage
      let totalSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length + key.length;
        }
      }
      
      // Most browsers have 5-10MB localStorage limit
      const estimatedLimit = 5 * 1024 * 1024; // 5MB in bytes
      const usagePercentage = (totalSize / estimatedLimit) * 100;
      
      return {
        used: totalSize,
        percentage: Math.round(usagePercentage),
        isNearLimit: usagePercentage > 80
      };
    } catch (e) {
      return null;
    }
  },

  /**
   * Check if storage is near quota
   */
  isNearQuota() {
    const info = this.getStorageInfo();
    return info && info.isNearLimit;
  },

  /**
   * Read and parse a stored JSON value, surviving corruption.
   *
   * A bare JSON.parse on stored data throws if the value is ever truncated or
   * malformed, and because the trackers are all constructed together, a single
   * bad key used to take down every one of them - leaving an app that rendered
   * but did nothing, with no way back except clearing site data.
   *
   * The bad value is moved aside rather than deleted, so it can still be
   * recovered by hand if it mattered.
   *
   * @param {string} key - localStorage key
   * @param {*} fallback - Value to return when missing or unreadable
   * @returns {*}
   */
  readJSON(key, fallback) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      console.error('Could not read', key, e);
      return fallback;
    }

    if (raw === null || raw === undefined || raw === '') return fallback;

    try {
      const parsed = JSON.parse(raw);
      // null parses fine but is never a valid shape here.
      return parsed === null ? fallback : parsed;
    } catch (e) {
      console.error(`Corrupt data in "${key}" - quarantining it`, e);
      try {
        localStorage.setItem(`${key}__corrupt`, raw);
        localStorage.removeItem(key);
      } catch (quarantineError) {
        console.error('Could not quarantine corrupt value', quarantineError);
      }

      // Told late, but told: the data is gone rather than silently zeroed.
      if (typeof utils !== 'undefined' && utils.showToast) {
        setTimeout(() => {
          utils.showToast(`Some saved ${key} data was unreadable and has been reset.`, 'error', 6000);
        }, 1200);
      }
      return fallback;
    }
  },

  /**
   * Write a JSON value, handling a full quota.
   *
   * @param {string} key
   * @param {*} value
   * @returns {boolean} Whether the write succeeded
   */
  writeJSON(key, value) {
    const serialised = JSON.stringify(value);

    try {
      localStorage.setItem(key, serialised);
      return true;
    } catch (error) {
      const isQuota = error.name === 'QuotaExceededError' ||
                      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                      error.code === 22;

      if (!isQuota) {
        console.error('Could not save', key, error);
        return false;
      }

      // Free what we can and try once more before giving up.
      console.warn('Storage full while saving', key, '- pruning old data');
      this.cleanupOldData();

      try {
        localStorage.setItem(key, serialised);
        utils.showToast('Storage was full. Old history beyond 90 days was removed.', 'warning', 6000);
        return true;
      } catch (retryError) {
        utils.showToast('Storage is full. Export a backup and reset old data.', 'error', 8000);
        return false;
      }
    }
  },

  /**
   * Clean up old data to free space
   */
  cleanupOldData() {
    try {
      // Remove old history entries beyond 90 days.
      // Date keys are YYYY-MM-DD, which compares correctly as a string.
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffString = utils.formatDate(cutoff);

      // Intake trackers: { date: [entries] }
      ['water', 'protein'].forEach(type => {
        const historyKey = STORAGE_KEYS.HISTORY_PREFIX + type;
        const history = JSON.parse(localStorage.getItem(historyKey) || '{}');

        let cleaned = false;
        Object.keys(history).forEach(date => {
          if (date < cutoffString) {
            delete history[date];
            cleaned = true;
          }
        });

        if (cleaned) {
          localStorage.setItem(historyKey, JSON.stringify(history));
        }
      });

      // Workout history: { date: [entries] }. This used to be skipped, so a
      // quota-relief pass left the workout log untouched.
      const workoutHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUT_HISTORY) || '{}');
      let workoutCleaned = false;
      Object.keys(workoutHistory).forEach(date => {
        if (date < cutoffString) {
          delete workoutHistory[date];
          workoutCleaned = true;
        }
      });
      if (workoutCleaned) {
        localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(workoutHistory));
      }

      // Habits: [{ history: { date: status } }]. Usually the largest store,
      // and previously the one this function did least about.
      const habits = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABITS) || '[]');
      let habitsCleaned = false;
      habits.forEach(habit => {
        if (!habit.history) return;
        Object.keys(habit.history).forEach(date => {
          if (date < cutoffString) {
            delete habit.history[date];
            habitsCleaned = true;
          }
        });
      });
      if (habitsCleaned) {
        localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));
      }

      console.log('Cleaned up old data beyond 90 days');
      return true;
    } catch (e) {
      console.error('Error cleaning up data:', e);
      return false;
    }
  }
};

/**
 * Utility functions
 */
const utils = {
  /**
   * Format date to YYYY-MM-DD format (CRITICAL FIX - was missing)
   * @param {Date} date - Date object to format
   * @returns {string} Date in YYYY-MM-DD format
   */
  formatDate(date) {
    if (!date) return this.getCurrentDate();
    if (typeof date === 'string') return date; // Already formatted
    
    const d = new Date(date);
    return d.getFullYear() + '-' + 
           String(d.getMonth() + 1).padStart(2, '0') + '-' + 
           String(d.getDate()).padStart(2, '0');
  },

  /**
   * Get current date in YYYY-MM-DD format
   * @returns {string} Current date
   */
  getCurrentDate() {
    const today = new Date();
    return today.getFullYear() + '-' + 
           String(today.getMonth() + 1).padStart(2, '0') + '-' + 
           String(today.getDate()).padStart(2, '0');
  },

  /**
   * Get date N days ago in YYYY-MM-DD format
   * @param {number} daysAgo - Number of days ago
   * @returns {string} Date N days ago
   */
  getDateDaysAgo(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.getFullYear() + '-' + 
           String(date.getMonth() + 1).padStart(2, '0') + '-' + 
           String(date.getDate()).padStart(2, '0');
  },

  /**
   * Parse a YYYY-MM-DD storage key into a LOCAL midnight Date.
   *
   * new Date('2026-08-26') is parsed as UTC midnight by spec, which is a
   * different instant from local midnight everywhere except UTC itself.
   * Mixing the two made "is this date in the future?" checks wrong by a day.
   * Every comparison against a date key must go through this.
   *
   * @param {string} dateKey - Date in YYYY-MM-DD format
   * @returns {Date} Local midnight on that date
   */
  parseDateKey(dateKey) {
    if (dateKey instanceof Date) return dateKey;
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return new Date(year, month - 1, day);
  },

  /**
   * "1 day" / "5 days".
   * @param {number} count
   * @returns {string}
   */
  formatDayCount(count) {
    return `${count} ${count === 1 ? 'day' : 'days'}`;
  },

  /**
   * A streak's dates for the Best streaks list: "6/19 - 6/23", or just
   * "6/19" when it starts and ends on the same day.
   * @param {string} startKey - YYYY-MM-DD
   * @param {string} endKey - YYYY-MM-DD
   * @returns {string}
   */
  formatStreakDates(startKey, endKey) {
    const short = key => {
      const date = this.parseDateKey(key);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    };
    return startKey === endKey ? short(startKey) : `${short(startKey)} - ${short(endKey)}`;
  },

  /**
   * Today at local midnight - the reference point for future-date checks.
   * @returns {Date}
   */
  startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  },

  /**
   * Escape a string for safe interpolation into an HTML template.
   *
   * Covers both element content and quoted attribute values - quotes are
   * escaped too, so `value="${utils.escapeHtml(x)}"` cannot be broken out of.
   * Any user-entered text (habit names, reminder titles and notes) must go
   * through this, or be set with textContent instead.
   *
   * @param {*} value - Value to escape
   * @returns {string} HTML-safe string
   */
  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Show a styled confirmation dialog.
   *
   * Replaces window.confirm(), which renders as a browser chrome dialog that
   * looks out of place in an installed PWA (and is suppressed outright in some
   * standalone contexts).
   *
   * Calls are serialised. There is only one modal element, so two overlapping
   * calls used to share it - a single click resolved both promises, one of
   * them with an answer the user never gave.
   *
   * @param {string} message - Body text
   * @param {Object} options - { title, confirmText, danger }
   * @returns {Promise<boolean>} Resolves true when confirmed
   */
  confirm(message, options = {}) {
    const run = () => this._showConfirm(message, options);
    this._confirmChain = (this._confirmChain || Promise.resolve()).then(run, run);
    return this._confirmChain;
  },

  /**
   * Render the confirmation modal. Always go through confirm().
   */
  _showConfirm(message, options = {}) {
    const {
      title = 'Are you sure?',
      confirmText = 'Confirm',
      danger = false
    } = options;

    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const messageEl = document.getElementById('confirm-modal-message');
      const okBtn = document.getElementById('confirm-modal-ok');
      const cancelBtn = document.getElementById('confirm-modal-cancel');

      // If the markup is missing for any reason, fail open rather than
      // silently swallowing a destructive action the user asked for.
      if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
        resolve(window.confirm(message));
        return;
      }

      titleEl.textContent = title;
      messageEl.textContent = message;
      okBtn.textContent = confirmText;
      okBtn.classList.toggle('danger', danger);

      const cleanup = (result) => {
        modal.style.display = 'none';
        okBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKeydown);
        resolve(result);
      };

      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = (e) => {
        if (e.target === modal) cleanup(false);
      };
      const onKeydown = (e) => {
        if (e.key === 'Escape') cleanup(false);
      };

      okBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKeydown);

      modal.style.display = 'flex';
    });
  },

  /**
   * Create and show a toast notification
   */
  showToast(message, type = 'success', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      console.error('Toast container not found');
      return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = document.createElement('i');
    icon.className = 'material-icons-round';
    
    switch (type) {
      case 'success':
        icon.textContent = 'check_circle';
        break;
      case 'warning':
        icon.textContent = 'warning';
        break;
      case 'error':
        icon.textContent = 'error';
        break;
      default:
        icon.textContent = 'info';
    }
    
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode(message));
    toastContainer.appendChild(toast);
    
    // Remove toast after specified duration
    setTimeout(() => {
      toast.classList.add('toast-closing');
      setTimeout(() => {
        if (toast.parentNode) {
          toastContainer.removeChild(toast);
        }
      }, 300);
    }, duration);
    
    // Limit max number of toasts to 3
    const toasts = toastContainer.querySelectorAll('.toast');
    if (toasts.length > 3) {
      toastContainer.removeChild(toasts[0]);
    }
  },

  /**
   * Show a toast with an Undo action.
   *
   * Every tap in this app commits immediately - a mistyped amount, a workout
   * tapped twice, a habit ticked on the wrong day. Without this the only way
   * back is Reset Today, which throws away the rest of the day too.
   *
   * Single level: showing a new undo toast supersedes any previous one.
   *
   * @param {string} message - What just happened
   * @param {Function} onUndo - Called if the user taps Undo
   * @param {number} duration - How long the offer stands, ms
   */
  showUndoToast(message, onUndo, duration = 6000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      console.error('Toast container not found');
      return;
    }

    // Only one undo offer at a time, so Undo is never ambiguous.
    toastContainer.querySelectorAll('.toast.undo-toast').forEach(old => old.remove());

    const toast = document.createElement('div');
    toast.className = 'toast success undo-toast';

    const icon = document.createElement('i');
    icon.className = 'material-icons-round';
    icon.textContent = 'check_circle';

    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;

    const undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo-btn';
    undoBtn.type = 'button';
    undoBtn.textContent = 'UNDO';

    let done = false;
    const dismiss = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      toast.classList.add('toast-closing');
      setTimeout(() => toast.remove(), 300);
    };

    undoBtn.addEventListener('click', () => {
      if (done) return;
      dismiss();
      try {
        onUndo();
      } catch (error) {
        console.error('Undo failed:', error);
        utils.showToast('Could not undo that', 'error');
      }
    });

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(undoBtn);
    toastContainer.appendChild(toast);

    const timer = setTimeout(dismiss, duration);
  }
};

/**
 * Surface unexpected failures instead of letting them vanish into the console.
 *
 * On a phone there is no console to check, so a thrown error previously just
 * meant a button that quietly stopped working. Throttled, because a loop that
 * throws should not bury the screen in toasts.
 */
(function installGlobalErrorHandler() {
  let lastShown = 0;
  const THROTTLE_MS = 10000;

  const report = (description) => {
    console.error('Unhandled error:', description);

    const now = Date.now();
    if (now - lastShown < THROTTLE_MS) return;
    lastShown = now;

    // utils may not exist yet if this fires during early parsing.
    if (typeof utils !== 'undefined' && utils.showToast) {
      utils.showToast('Something went wrong. Your data is safe - please reopen the app.', 'error', 6000);
    }
  };

  window.addEventListener('error', (event) => {
    report(event.message || event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    report(event.reason);
  });
})();

/**
 * Initialize the application when DOM is fully loaded
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app...');
  
  // Check if localStorage is available. Nothing below can work without it, so
  // this replaces the whole app with an explanation rather than leaving a
  // half-rendered screen behind a dismissed alert().
  if (!storageManager.isAvailable()) {
    const wrapper = document.querySelector('.app-wrapper');
    if (wrapper) {
      wrapper.innerHTML = '';
      const notice = document.createElement('div');
      notice.style.cssText = 'padding: 40px 24px; text-align: center; line-height: 1.6;';

      const heading = document.createElement('h2');
      heading.textContent = 'Storage unavailable';

      const body = document.createElement('p');
      body.textContent =
        'Daily Tracker stores everything on this device using local storage, ' +
        'which your browser has disabled. Private browsing mode and blocked ' +
        'site data are the usual causes.';

      notice.appendChild(heading);
      notice.appendChild(body);
      wrapper.appendChild(notice);
    }
    return;
  }

  // Drop settings that belonged to removed features.
  RETIRED_KEYS.forEach(key => localStorage.removeItem(key));

  // Check if we're near quota
  if (storageManager.isNearQuota()) {
    utils.showToast('Storage space is running low. Consider exporting and clearing old data.', 'warning');
    storageManager.cleanupOldData();
  }

  // Initialize trackers, each isolated from the others.
  //
  // These used to share one try block, so anything thrown while building the
  // water tracker skipped straight past protein, workouts and habits - one
  // unreadable key left the whole app inert. A failure should cost you the
  // tracker it belongs to and nothing more.
  const trackerSetup = [
    ['water', () => { window.waterTracker = new Tracker({ type: 'water', unit: 'ml' }); }],
    ['protein', () => { window.proteinTracker = new Tracker({ type: 'protein', unit: 'g' }); }],
    ['workout', () => { window.workoutTracker = new WorkoutTracker(); }],
    ['habits', () => { window.habitsTracker = new HabitsTracker(); }]
  ];

  const failedTrackers = [];

  trackerSetup.forEach(([name, build]) => {
    try {
      build();
      console.log(`${name} tracker initialized successfully`);
    } catch (error) {
      console.error(`Error initializing ${name} tracker:`, error);
      failedTrackers.push(name);
    }
  });

  if (failedTrackers.length > 0) {
    utils.showToast(
      `Could not load: ${failedTrackers.join(', ')}. The other trackers still work.`,
      'error',
      8000
    );
  } else {
    console.log('All trackers initialized successfully');
  }
  
  // Initialize reminders manager with better error handling
  try {
    console.log('Initializing RemindersManager...');
    window.remindersManager = new RemindersManager();
    
    // Verify initialization was successful
    if (window.remindersManager && typeof window.remindersManager.togglePanel === 'function') {
      console.log('RemindersManager initialized successfully');
    } else {
      throw new Error('RemindersManager initialization incomplete');
    }
  } catch (error) {
    console.error('Error initializing RemindersManager:', error);
    utils.showToast('Error initializing reminders system: ' + error.message, 'error');
    
    // Create minimal fallback
    window.remindersManager = {
      togglePanel: () => console.warn('RemindersManager not available'),
      openPanel: () => console.warn('RemindersManager not available'),
      data: { globalEnabled: false, systemNotifications: {}, customReminders: [] }
    };
  }
  
  // Set up tab navigation with error handling
  try {
    initializeTabNavigation();
    console.log('Tab navigation initialized');
  } catch (error) {
    console.error('Error initializing tab navigation:', error);
  }
  
  // Set up panels (settings, history, more options) with error handling
  try {
    initializePanels();
    console.log('Panels initialized');
  } catch (error) {
    console.error('Error initializing panels:', error);
  }
  
  // NEW: Initialize settings panel events
  try {
    initializeSettingsPanelEvents();
    console.log('Settings panel events initialized');
  } catch (error) {
    console.error('Error initializing settings panel events:', error);
  }
  
  // Set up action buttons for trackers with error handling
  try {
    if (window.waterTracker) {
      initializeTrackerActions(window.waterTracker);
      console.log('Water tracker actions initialized');
    }
    
    if (window.proteinTracker) {
      initializeTrackerActions(window.proteinTracker);
      console.log('Protein tracker actions initialized');
    }
    
    if (window.workoutTracker) {
      initializeWorkoutTrackerActions(window.workoutTracker);
      console.log('Workout tracker actions initialized');
    }
  } catch (error) {
    console.error('Error initializing tracker actions:', error);
  }
  
  // Set up data import/export with error handling
  try {
    initializeDataManagement();
    console.log('Data management initialized');
  } catch (error) {
    console.error('Error initializing data management:', error);
  }
  
  // NEW: Update notification button states after initialization
  try {
    setTimeout(() => {
      if (window.remindersManager && typeof updateNotificationButtonStates === 'function') {
        updateNotificationButtonStates('water');
        updateNotificationButtonStates('protein');
        console.log('Notification button states initialized');
      }
    }, 500); // Small delay to ensure reminders manager is fully ready
  } catch (error) {
    console.error('Error initializing notification button states:', error);
  }

  // Re-check the date whenever the app comes back to the foreground.
  try {
    initializeDayRolloverWatch();
    console.log('Day rollover watch initialized');
  } catch (error) {
    console.error('Error initializing day rollover watch:', error);
  }

  console.log('App initialization complete');
});

/**
 * Re-run each tracker's daily rollover when the app returns to the foreground.
 *
 * The per-tracker midnight setTimeout only fires if the page stays alive.
 * Phones freeze background timers, and an installed PWA is usually resumed
 * rather than reloaded - so without this the app can show yesterday's numbers
 * for the whole of the next day.
 */
function initializeDayRolloverWatch() {
  let lastKnownDate = utils.getCurrentDate();

  const checkForNewDay = () => {
    const currentDate = utils.getCurrentDate();
    if (currentDate === lastKnownDate) return;

    console.log('Day changed from', lastKnownDate, 'to', currentDate);
    lastKnownDate = currentDate;

    [window.waterTracker, window.proteinTracker].forEach(tracker => {
      if (tracker && typeof tracker.checkAndResetDailyIntake === 'function') {
        tracker.checkAndResetDailyIntake();
      }
    });

    if (window.workoutTracker) {
      window.workoutTracker.checkAndResetDailyWorkouts();
      window.workoutTracker.renderWorkoutTabs();
      window.workoutTracker.refreshHistory();
    }

    if (window.habitsTracker) {
      window.habitsTracker.checkAndResetDailyHabits();
      window.habitsTracker.updateDateSelector();
      window.habitsTracker.renderHabits();
      window.habitsTracker.refreshCalendarForNewDay();
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForNewDay();
  });
  window.addEventListener('focus', checkForNewDay);
  window.addEventListener('pageshow', checkForNewDay);
}

/**
 * Initialize data import/export functionality
 */
function initializeDataManagement() {
  const exportBtn = document.getElementById('export-data');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
  }

  const exportJsonBtn = document.getElementById('export-data-json');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', exportDataAsJSON);
  }

  const importFileInput = document.getElementById('import-file');
  if (importFileInput) {
    importFileInput.addEventListener('change', importData);
  }
}

/**
 * Every localStorage key this app owns.
 *
 * Used by the JSON backup so a restore is genuinely complete. The CSV format
 * only ever covered a hand-picked subset - notably it omitted the
 * last_reset_* keys, which is what made restoring a backup onto a new device
 * silently discard the current day.
 *
 * @returns {string[]}
 */
function getAppStorageKeys() {
  const exact = [
    STORAGE_KEYS.WORKOUT_TYPES,
    STORAGE_KEYS.WORKOUT_STATE,
    STORAGE_KEYS.WORKOUT_COUNT,
    STORAGE_KEYS.WORKOUT_HISTORY,
    STORAGE_KEYS.WORKOUT_AUTORESET,
    STORAGE_KEYS.HABITS,
    STORAGE_KEYS.REMINDER,
    STORAGE_KEYS.ACTIVE_TAB,
    'reminders_data'
  ];

  const prefixes = [
    STORAGE_KEYS.GOAL_PREFIX,
    STORAGE_KEYS.INTAKE_PREFIX,
    STORAGE_KEYS.HISTORY_PREFIX,
    STORAGE_KEYS.LAST_RESET_PREFIX
  ];

  return Object.keys(localStorage).filter(key =>
    exact.includes(key) || prefixes.some(prefix => key.startsWith(prefix))
  );
}

/**
 * Whether this is an iPhone or iPad (iPadOS reports itself as a Mac, so a Mac
 * with a touch screen counts too).
 * @returns {boolean}
 */
function isAppleTouchDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Hand a file to the user: the Share sheet on iPhone / iPad ("Save to
 * Files"), a download everywhere else.
 *
 * Exports used to be a download link whose blob was revoked 100 ms after the
 * click. iPhone Safari only reads the blob once the user has answered its
 * "Download?" prompt, so by then it was gone and the save failed
 * ("WebKitBlobResource error 1"); in the home-screen app such downloads often
 * do nothing at all. The Share sheet is the dependable route there.
 *
 * Must be called straight from a tap: share() needs that tap, so nothing may
 * be awaited before it.
 *
 * @param {string} filename
 * @param {string} content
 * @param {string} mimeType
 * @returns {Promise<boolean>} true once handed over, false if the user closed
 *   the Share sheet
 */
async function saveFile(filename, content, mimeType) {
  if (isAppleTouchDevice() && navigator.canShare) {
    const file = new File([content], filename, { type: mimeType });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (error) {
        if (error.name === 'AbortError') return false;
        console.warn('Share sheet failed, downloading instead:', error);
      }
    }
  }

  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Kept for a minute, not 100 ms - long enough for any "Download?" prompt.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

/**
 * Export a complete, loss-free backup as JSON.
 */
async function exportDataAsJSON() {
  try {
    const data = {};
    getAppStorageKeys().forEach(key => {
      data[key] = localStorage.getItem(key);
    });

    const backup = {
      format: 'daily-tracker-backup',
      version: 3,
      exportedAt: new Date().toISOString(),
      data
    };

    const saved = await saveFile(
      `daily-tracker-backup-${utils.getCurrentDate()}.json`,
      JSON.stringify(backup, null, 2),
      'application/json'
    );
    if (!saved) return;

    utils.showToast('Full backup exported as JSON!', 'success');
    document.getElementById('more-options-panel').classList.remove('active');
  } catch (error) {
    console.error('JSON export error:', error);
    utils.showToast(`Error exporting backup: ${error.message}`, 'error');
  }
}

/**
 * Restore from a JSON backup.
 *
 * A backup is a complete snapshot, so this replaces the app's keys outright
 * rather than merging field by field.
 *
 * @param {Object} backup - Parsed backup object
 */
function applyJSONBackup(backup) {
  if (!backup || backup.format !== 'daily-tracker-backup' || !backup.data) {
    throw new Error('Not a Daily Tracker backup file.');
  }

  // Clear only the keys this app owns, so anything else on the origin is left
  // alone, then write the snapshot back.
  getAppStorageKeys().forEach(key => localStorage.removeItem(key));

  Object.entries(backup.data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      localStorage.setItem(key, value);
    }
  });
}

/**
 * Export tracking data to CSV file
 */
async function exportData() {
  try {
    const saved = await saveFile(
      `health-tracker-export-${new Date().toISOString().slice(0,10)}.csv`,
      convertDataToCSV(),
      'text/csv'
    );
    if (!saved) return;

    utils.showToast('Data exported successfully as CSV!', 'success');
    document.getElementById('more-options-panel').classList.remove('active');
  } catch (error) {
    console.error('Export error:', error);
    utils.showToast(`Error exporting data: ${error.message}`, 'error');
  }
}

/**
 * Import tracking data from CSV file
 */
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (file.size > 5 * 1024 * 1024) {
    utils.showToast('File is too large. Maximum size is 5MB.', 'error');
    event.target.value = '';
    return;
  }
  
  const isJSON = file.type === 'application/json' || file.name.endsWith('.json');
  const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');

  if (!isJSON && !isCSV) {
    utils.showToast('Invalid file type. Please upload a .json backup or a .csv export.', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      const raw = e.target.result;
      const importedData = isJSON ? null : parseCSVData(raw);

      if (!isJSON && !importedData) {
        throw new Error('Import file is empty or corrupt.');
      }

      // Snapshot every key we might overwrite, so a partial failure can be
      // rolled back key-by-key.
      const backup = {};
      Object.keys(localStorage).forEach(key => {
        backup[key] = localStorage.getItem(key);
      });

      try {
        if (isJSON) {
          applyJSONBackup(JSON.parse(raw));
        } else {
          applyImportedData(importedData);
        }
        utils.showToast('Data imported successfully! Reloading app...', 'success');

        setTimeout(() => location.reload(), 1500);
      } catch (storageError) {
        console.error('Storage error during import:', storageError);

        // Restore by overwriting the keys we touched, and removing any key the
        // import added. Deliberately NOT localStorage.clear() first: if the
        // restore loop then threw partway through, clear() would already have
        // destroyed the only copy of the user's data.
        Object.keys(localStorage).forEach(key => {
          if (!(key in backup)) {
            localStorage.removeItem(key);
          }
        });
        Object.keys(backup).forEach(key => {
          try {
            localStorage.setItem(key, backup[key]);
          } catch (restoreError) {
            console.error('Error restoring key', key, restoreError);
          }
        });

        throw new Error('Error saving imported data. Your previous data has been restored.');
      }
    } catch (error) {
      utils.showToast(`Error importing data: ${error.message}`, 'error');
      console.error('Import error:', error);
    }
    
    event.target.value = '';
  };
  
  reader.onerror = function() {
    utils.showToast('Error reading file. Please try again.', 'error');
    event.target.value = '';
  };
  
  reader.readAsText(file);
}

/**
 * Convert application data to CSV format (includes reminders)
 */
function convertDataToCSV() {
  const rows = []; 
  
  const headers = [
    "data_type", "key", "value", "date", "amount", "timestamp", 
    "type", "count", "name", "color", "completed", "order"
  ];
  rows.push(headers.join(","));
  
  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };
  
  const addRow = (dataType, key, value) => {
    const row = new Array(headers.length).fill('');
    row[0] = dataType;
    row[1] = key;
    row[2] = value;
    rows.push(row.map(escapeCSV).join(','));
  };
  
  // Add version info
  addRow("meta", "version", "2.1");
  addRow("meta", "exportDate", new Date().toISOString());
  
  // Process water data
  const waterGoal = localStorage.getItem(STORAGE_KEYS.GOAL_PREFIX + 'water');
  addRow("water", "goal", waterGoal);
  
  const waterIntake = localStorage.getItem(STORAGE_KEYS.INTAKE_PREFIX + 'water');
  addRow("water", "intake", waterIntake);
  
  const waterHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY_PREFIX + 'water') || '{}');
  Object.entries(waterHistory).forEach(([date, entries]) => {
    entries.forEach((entry, index) => {
      const row = new Array(headers.length).fill('');
      row[0] = "water_history";
      row[1] = `${date}_${index}`;
      row[3] = date;
      row[4] = entry.amount;
      row[5] = entry.timestamp;
      rows.push(row.map(escapeCSV).join(','));
    });
  });
  
  // Process protein data
  const proteinGoal = localStorage.getItem(STORAGE_KEYS.GOAL_PREFIX + 'protein');
  addRow("protein", "goal", proteinGoal);
  
  const proteinIntake = localStorage.getItem(STORAGE_KEYS.INTAKE_PREFIX + 'protein');
  addRow("protein", "intake", proteinIntake);
  
  const proteinHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY_PREFIX + 'protein') || '{}');
  Object.entries(proteinHistory).forEach(([date, entries]) => {
    entries.forEach((entry, index) => {
      const row = new Array(headers.length).fill('');
      row[0] = "protein_history";
      row[1] = `${date}_${index}`;
      row[3] = date;
      row[4] = entry.amount;
      row[5] = entry.timestamp;
      rows.push(row.map(escapeCSV).join(','));
    });
  });
  
  // Process workout data
  const workoutTypes = localStorage.getItem(STORAGE_KEYS.WORKOUT_TYPES);
  addRow("workout", "types", workoutTypes);
  
  const workoutState = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUT_STATE) || '{}');
  Object.entries(workoutState).forEach(([type, state]) => {
    const row = new Array(headers.length).fill('');
    row[0] = "workout_state";
    row[1] = type;
    row[6] = type;
    row[10] = state.completed || false;
    row[11] = state.order || 0;
    rows.push(row.map(escapeCSV).join(','));
  });
  
  const workoutCount = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUT_COUNT) || '{}');
  Object.entries(workoutCount).forEach(([type, count]) => {
    const row = new Array(headers.length).fill('');
    row[0] = "workout_count";
    row[1] = type;
    row[6] = type;
    row[7] = count;
    rows.push(row.map(escapeCSV).join(','));
  });
  
  const workoutHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUT_HISTORY) || '{}');
  Object.entries(workoutHistory).forEach(([date, entries]) => {
    entries.forEach((entry, index) => {
      const row = new Array(headers.length).fill('');
      row[0] = "workout_history";
      row[1] = `${date}_${index}`;
      row[3] = date;
      row[5] = entry.timestamp;
      row[6] = entry.type;
      row[7] = entry.count;
      rows.push(row.map(escapeCSV).join(','));
    });
  });
  
  // Process habits data
  const habitsData = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABITS) || '[]');
  habitsData.forEach((habit, habitIndex) => {
    const row = new Array(headers.length).fill('');
    row[0] = "habit";
    row[1] = habitIndex.toString();
    row[8] = habit.name;
    row[9] = habit.color;
    rows.push(row.map(escapeCSV).join(','));
    
    if (habit.history) {
      Object.entries(habit.history).forEach(([date, status]) => {
        const historyRow = new Array(headers.length).fill('');
        historyRow[0] = "habit_history";
        historyRow[1] = `${habitIndex}_${date}`;
        historyRow[2] = status;
        historyRow[3] = date;
        rows.push(historyRow.map(escapeCSV).join(','));
      });
    }
  });
  
  // Process reminders data
  const remindersData = localStorage.getItem('reminders_data');
  if (remindersData) {
    addRow("reminders", "data", remindersData);
  }
  
  // Add settings
  const reminder = localStorage.getItem(STORAGE_KEYS.REMINDER);
  addRow("settings", "reminder", reminder);
  
  return rows.join('\n');
}

/**
 * Parse CSV data and import to app (includes reminders)
 */
function parseCSVData(csvData) {
  const rows = csvData.split(/\r?\n/);
  if (rows.length < 2) throw new Error('Invalid CSV file format');
  
  const headers = parseCSVRow(rows[0]);
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[header] = index;
  });
  
  // Initialize data structure (includes reminders)
  const importedData = {
    version: "2.1",
    exportDate: new Date().toISOString(),
    water: { goal: null, intake: null, history: {} },
    protein: { goal: null, intake: null, history: {} },
    workout: { types: [], state: {}, count: {}, history: {} },
    habits: { data: [] },
    reminders: { data: null },
    settings: { reminder: null }
  };

  // Which fields the file actually carried.
  //
  // Presence has to be tracked separately from value, because applying the
  // import by truthiness gets it wrong in both directions: an empty goal cell
  // ("" is falsy) left the old goal in place, while an absent habits section
  // still produced "[]" (truthy) and wiped every habit.
  const present = {
    waterGoal: false, waterIntake: false, waterHistory: false,
    proteinGoal: false, proteinIntake: false, proteinHistory: false,
    workoutTypes: false, workoutState: false, workoutCount: false, workoutHistory: false,
    habits: false,
    reminders: false,
    reminder: false
  };

  // Process each data row
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].trim()) continue;
    
    const row = parseCSVRow(rows[i]);
    const dataType = row[headerMap.data_type];
    const key = row[headerMap.key];
    const value = row[headerMap.value];
    
    switch (dataType) {
      case 'meta':
        if (key === 'version') importedData.version = value;
        if (key === 'exportDate') importedData.exportDate = value;
        break;
        
      case 'water':
        if (key === 'goal') { importedData.water.goal = value; present.waterGoal = true; }
        if (key === 'intake') { importedData.water.intake = value; present.waterIntake = true; }
        break;
        
      case 'water_history':
        const waterDate = row[headerMap.date];
        const waterAmount = parseFloat(row[headerMap.amount]);
        const waterTimestamp = row[headerMap.timestamp];
        
        present.waterHistory = true;
        if (!importedData.water.history[waterDate]) {
          importedData.water.history[waterDate] = [];
        }
        
        importedData.water.history[waterDate].push({
          amount: waterAmount,
          timestamp: waterTimestamp
        });
        break;
        
      case 'protein':
        if (key === 'goal') { importedData.protein.goal = value; present.proteinGoal = true; }
        if (key === 'intake') { importedData.protein.intake = value; present.proteinIntake = true; }
        break;
        
      case 'protein_history':
        const proteinDate = row[headerMap.date];
        const proteinAmount = parseFloat(row[headerMap.amount]);
        const proteinTimestamp = row[headerMap.timestamp];
        
        present.proteinHistory = true;
        if (!importedData.protein.history[proteinDate]) {
          importedData.protein.history[proteinDate] = [];
        }
        
        importedData.protein.history[proteinDate].push({
          amount: proteinAmount,
          timestamp: proteinTimestamp
        });
        break;
        
      case 'workout':
        if (key === 'types') { importedData.workout.types = JSON.parse(value || '[]'); present.workoutTypes = true; }
        break;
        
      case 'workout_state':
        const workoutType = row[headerMap.type];
        const completed = row[headerMap.completed] === 'true';
        const order = parseInt(row[headerMap.order]) || 0;
        
        present.workoutState = true;
        importedData.workout.state[workoutType] = {
          completed: completed,
          order: order
        };
        break;
        
      case 'workout_count':
        const countType = row[headerMap.type];
        const count = parseInt(row[headerMap.count]);
        
        present.workoutCount = true;
        importedData.workout.count[countType] = count;
        break;
        
      case 'workout_history':
        const workoutDate = row[headerMap.date];
        const entryType = row[headerMap.type];
        const entryCount = parseInt(row[headerMap.count]);
        const entryTimestamp = row[headerMap.timestamp];
        
        present.workoutHistory = true;
        if (!importedData.workout.history[workoutDate]) {
          importedData.workout.history[workoutDate] = [];
        }
        
        importedData.workout.history[workoutDate].push({
          type: entryType,
          count: entryCount,
          timestamp: entryTimestamp
        });
        break;
        
      case 'habit':
        present.habits = true;
        const habitIndex = parseInt(key);
        const habitName = row[headerMap.name];
        const habitColor = row[headerMap.color];
        
        while (importedData.habits.data.length <= habitIndex) {
          importedData.habits.data.push({ history: {} });
        }
        
        importedData.habits.data[habitIndex] = {
          name: habitName,
          color: habitColor,
          history: importedData.habits.data[habitIndex].history || {}
        };
        break;
        
      case 'habit_history':
        present.habits = true;
        const [habitIdx, historyDate] = key.split('_');
        const status = value;
        
        const idx = parseInt(habitIdx);
        while (importedData.habits.data.length <= idx) {
          importedData.habits.data.push({ history: {} });
        }
        
        if (!importedData.habits.data[idx].history) {
          importedData.habits.data[idx].history = {};
        }
        
        importedData.habits.data[idx].history[historyDate] = status;
        break;
        
      case 'reminders':
        if (key === 'data') { importedData.reminders.data = value; present.reminders = true; }
        break;
        
      case 'settings':
        // Older exports also carry a "theme" row. The light theme has been
        // removed, so that row is ignored.
        if (key === 'reminder') { importedData.settings.reminder = value; present.reminder = true; }
        break;
    }
  }
  
  return {
    version: importedData.version,
    exportDate: importedData.exportDate,
    present,
    water: {
      goal: importedData.water.goal,
      intake: importedData.water.intake,
      history: JSON.stringify(importedData.water.history)
    },
    protein: {
      goal: importedData.protein.goal,
      intake: importedData.protein.intake,
      history: JSON.stringify(importedData.protein.history)
    },
    workout: {
      types: JSON.stringify(importedData.workout.types),
      state: JSON.stringify(importedData.workout.state),
      count: JSON.stringify(importedData.workout.count),
      history: JSON.stringify(importedData.workout.history)
    },
    habits: {
      data: JSON.stringify(importedData.habits.data)
    },
    reminders: {
      data: importedData.reminders.data
    },
    settings: importedData.settings
  };
}

/**
 * Parse a single CSV row, handling quoted values correctly
 */
function parseCSVRow(row) {
  const result = [];
  let insideQuotes = false;
  let currentValue = '';
  let i = 0;
  
  while (i < row.length) {
    const char = row[i];
    
    if (char === '"') {
      if (i + 1 < row.length && row[i + 1] === '"') {
        currentValue += '"';
        i += 2;
        continue;
      }
      
      insideQuotes = !insideQuotes;
      i++;
      continue;
    }
    
    if (char === ',' && !insideQuotes) {
      result.push(currentValue);
      currentValue = '';
      i++;
      continue;
    }
    
    currentValue += char;
    i++;
  }
  
  result.push(currentValue);
  return result;
}

/**
 * Apply imported data with reminders support
 */
function applyImportedData(data) {
  try {
    console.log('Applying imported data...');

    // Every field below is applied on PRESENCE, not on truthiness. A field the
    // file carried replaces what is stored, even if its value is empty; a
    // field the file omitted is left alone. Mixing those two rules is what
    // made a partial CSV wipe every habit while keeping a stale water goal.
    const present = data.present || {};

    // Apply water data
    if (data.water) {
      if (present.waterGoal) localStorage.setItem(STORAGE_KEYS.GOAL_PREFIX + 'water', data.water.goal || '');
      if (present.waterIntake) localStorage.setItem(STORAGE_KEYS.INTAKE_PREFIX + 'water', data.water.intake || '0');
      if (present.waterHistory) localStorage.setItem(STORAGE_KEYS.HISTORY_PREFIX + 'water', data.water.history);
    }

    // Apply protein data
    if (data.protein) {
      if (present.proteinGoal) localStorage.setItem(STORAGE_KEYS.GOAL_PREFIX + 'protein', data.protein.goal || '');
      if (present.proteinIntake) localStorage.setItem(STORAGE_KEYS.INTAKE_PREFIX + 'protein', data.protein.intake || '0');
      if (present.proteinHistory) localStorage.setItem(STORAGE_KEYS.HISTORY_PREFIX + 'protein', data.protein.history);
    }

    // Apply workout data
    if (data.workout) {
      if (present.workoutTypes) localStorage.setItem(STORAGE_KEYS.WORKOUT_TYPES, data.workout.types);
      if (present.workoutState) localStorage.setItem(STORAGE_KEYS.WORKOUT_STATE, data.workout.state);
      if (present.workoutCount) localStorage.setItem(STORAGE_KEYS.WORKOUT_COUNT, data.workout.count);
      if (present.workoutHistory) localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, data.workout.history);
    }

    // Apply habits data
    if (present.habits && data.habits && data.habits.data) {
      localStorage.setItem(STORAGE_KEYS.HABITS, data.habits.data);
    }

    // A CSV restore carries the current day's entries, so clear the rollover
    // markers: leaving them stale would make the trackers treat the imported
    // day as already reset.
    if (present.waterHistory) localStorage.setItem(STORAGE_KEYS.LAST_RESET_PREFIX + 'water', utils.getCurrentDate());
    if (present.proteinHistory) localStorage.setItem(STORAGE_KEYS.LAST_RESET_PREFIX + 'protein', utils.getCurrentDate());

    // Apply reminders data
    if (present.reminders && data.reminders && data.reminders.data) {
      console.log('Applying reminders data:', data.reminders.data);
      localStorage.setItem('reminders_data', data.reminders.data);
      
      // Reload reminders manager data if it exists
      if (window.remindersManager && typeof window.remindersManager.loadData === 'function') {
        try {
          window.remindersManager.loadData();
          window.remindersManager.scheduleAllReminders();
          console.log('Reminders data reloaded');
        } catch (error) {
          console.error('Error reloading reminders data:', error);
        }
      }
    }
    
    // Apply settings
    if (data.settings) {
      if (present.reminder) localStorage.setItem(STORAGE_KEYS.REMINDER, data.settings.reminder || '');
    }
    
    console.log('Data import completed successfully');
  } catch (error) {
    console.error('Error applying imported data:', error);
    throw error;
  }
}

/**
 * Register service worker for PWA support
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Relative path on purpose. The app is served from a GitHub Pages project
    // subpath, where '/service-worker.js' would resolve to the domain root and
    // 404. A relative path also keeps the worker's scope at the app root.
    navigator.serviceWorker.register('service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registered with scope:', registration.scope);
      })
      .catch(error => {
        // Offline support is optional, so this stays quiet for the user.
        console.warn('ServiceWorker registration failed:', error);
      });
  });
}