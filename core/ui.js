/**
 * Health Tracker App - UI Initialization (UPDATED)
 * This file contains functions for initializing the UI components
 */

/**
 * Switch to a tracker tab.
 *
 * The single path for changing tabs, used by the tab buttons and by the
 * restore-on-launch below, so the button state, the visible panel and the
 * remembered tab can never disagree.
 *
 * @param {string} appType - water | protein | workout | habits
 * @param {boolean} remember - Persist as the tab to reopen on next launch
 */
function activateTab(appType, remember = true) {
  const button = document.querySelector(`.tab-btn[data-app="${appType}"]`);
  const container = document.getElementById(`${appType}-app`);

  // Ignore anything that does not name a real tab, so a stale or hand-edited
  // stored value cannot leave the app with every panel hidden.
  if (!button || !container) {
    console.warn('Unknown tab:', appType);
    return false;
  }

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  button.classList.add('active');

  document.querySelectorAll('.app-container').forEach(c => c.classList.remove('active'));
  container.classList.add('active');

  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, appType);
    } catch (error) {
      // Not worth interrupting the user over - they just lose the memory.
      console.warn('Could not remember active tab:', error);
    }
  }

  return true;
}

/**
 * Reopen whichever tab was showing when the app was last closed.
 *
 * An installed PWA gets torn down and relaunched constantly, and always
 * landing back on Water meant re-navigating every single time.
 */
function restoreLastActiveTab() {
  const savedTab = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);

  // remember: false - restoring is not a user choice, so it must not rewrite
  // the stored value. Nothing saved, or a value that no longer names a tab,
  // keeps the markup's default (Water).
  if (savedTab) {
    activateTab(savedTab, false);
  }

  // Hand control back to the .active class. The pre-paint CSS in
  // core-styles.css hides .app-container.active while this attribute is set,
  // so leaving it on would break every subsequent tab switch.
  document.body.removeAttribute('data-initial-tab');
}

/**
 * Initialize tab navigation
 */
function initializeTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.app);
    });
  });

  // Reopen wherever the user left off.
  restoreLastActiveTab();

  // Inner tab navigation in history popups
  document.querySelectorAll('.tab-button').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const tabId = tabBtn.dataset.tab;
      const tabsContainer = tabBtn.closest('.panel');
      
      // Update active state for buttons
      tabsContainer.querySelectorAll('.tab-button').forEach(b => {
        b.classList.remove('active');
      });
      tabBtn.classList.add('active');
      
      // Show active tab content
      tabsContainer.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // Initialize history tabs
  document.getElementById('water-daily-history').classList.add('active');
  document.getElementById('protein-daily-history').classList.add('active');
  document.getElementById('workout-daily-history').classList.add('active');
}

/**
 * UPDATED: Initialize panels (settings, history, more options) - Updated for reminders
 */
function initializePanels() {
  console.log('Initializing panels with reminders support...');
  
  // UPDATED: Panel toggle buttons (removed notifications-settings-toggle)
  const panelToggles = {
    'water-settings-toggle': 'water-settings-section',
    'water-history-toggle': 'water-history-popup',
    'protein-settings-toggle': 'protein-settings-section',
    'protein-history-toggle': 'protein-history-popup',
    'workout-settings-toggle': 'workout-settings-section',
    'workout-history-toggle': 'workout-history-popup',
    'more-options-toggle': 'more-options-panel'
    // Note: reminders panel is handled by RemindersManager, not here
  };
  
  // Set up panel toggles
  Object.entries(panelToggles).forEach(([toggleId, panelId]) => {
    const toggleBtn = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    
    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', () => {
        console.log(`Panel toggle clicked: ${toggleId} -> ${panelId}`);
        
        // UPDATED: Hide all other panels first (including reminders panel)
        document.querySelectorAll('.panel, .reminders-panel').forEach(p => {
          if (p.id !== panelId) {
            p.classList.remove('active');
          }
        });
        
        // Toggle this panel
        panel.classList.toggle('active');
      });
    } else {
      console.warn(`Panel toggle missing: ${toggleId} or ${panelId}`);
    }
  });
  
  // Close panel buttons
  document.querySelectorAll('.close-panel').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      console.log('Close panel button clicked');
      const panel = closeBtn.closest('.panel, .reminders-panel');
      if (panel) {
        panel.classList.remove('active');
      }
    });
  });
  
  // UPDATED: Close panels when clicking outside - improved to handle reminders panel
  document.addEventListener('click', (event) => {
    // Check if clicked element or its ancestors are panels or toggle buttons
    const isPanel = !!event.target.closest('.panel, .reminders-panel');
    const isToggle = !!event.target.closest('[id$="-toggle"], #reminders-bell-icon');
    const isTogglePressed = Object.keys(panelToggles).some(id => 
      event.target.closest(`#${id}`) !== null
    );
    
    // UPDATED: Also check for reminders bell icon specifically
    const isRemindersBell = !!event.target.closest('#reminders-bell-icon');

    // Pop-up windows and toasts sit on top of whatever panel opened them.
    // Tapping inside one - Save in the history edit window, Undo on a toast -
    // is not a tap outside that panel, and used to close it from under you.
    const isOverlay = !!event.target.closest('.modal, #toast-container');

    // Only close panels if clicked outside any panel and toggle button
    if (!isPanel && !isToggle && !isTogglePressed && !isRemindersBell && !isOverlay) {
      console.log('Clicking outside panels - closing all panels');
      document.querySelectorAll('.panel, .reminders-panel').forEach(panel => {
        panel.classList.remove('active');
      });
    }
  }, true);
  
  console.log('Panels initialization complete');
}

/**
 * Build the pencil button shown on each history entry.
 *
 * @param {string} label - Accessible name, e.g. "Edit water for 2026-10-14"
 * @param {Function} onClick
 * @returns {HTMLButtonElement}
 */
function createHistoryEditButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'history-edit-btn';
  button.setAttribute('aria-label', label);
  button.title = label;

  const icon = document.createElement('i');
  icon.className = 'material-icons-round';
  icon.textContent = 'edit';
  button.appendChild(icon);

  button.addEventListener('click', onClick);
  return button;
}

/**
 * The "edit a day" window behind the history pencil buttons.
 *
 * Shared by water, protein and workouts so all three edit the same way: one
 * row per logged entry, ✕ drops a row, and nothing is written until Save.
 * The caller builds the rows and decides what Save means; this only runs the
 * window.
 *
 * Problems are shown on the window's own error line, next to the fields they
 * are about, rather than as a toast that is gone a few seconds later.
 */
const dayEditor = {
  bound: false,
  onSave: null,
  summarise: null,

  /**
   * @param {Object} options
   * @param {string} options.title
   * @param {Element[]} options.rows - One .edit-day-row per entry, each with a
   *   ✕ from dayEditor.removeButton()
   * @param {Function} options.onSave - (rows) => error message to keep the
   *   window open, or null once the change has been saved
   * @param {Function} [options.summarise] - (rows) => text shown under the
   *   rows, refreshed after every change
   */
  open({ title, rows, onSave, summarise }) {
    const modal = document.getElementById('edit-day-modal');
    const container = document.getElementById('edit-day-rows');
    if (!modal || !container) return;

    this.bind();

    document.getElementById('edit-day-title').textContent = title;
    container.innerHTML = '';
    rows.forEach(row => container.appendChild(row));

    this.onSave = onSave;
    this.summarise = summarise || null;
    this.setError('');
    this.refresh();

    modal.style.display = 'flex';
  },

  close() {
    const modal = document.getElementById('edit-day-modal');
    if (modal) modal.style.display = 'none';

    const container = document.getElementById('edit-day-rows');
    if (container) container.innerHTML = '';

    this.onSave = null;
    this.summarise = null;
  },

  isOpen() {
    const modal = document.getElementById('edit-day-modal');
    return !!modal && modal.style.display === 'flex';
  },

  save() {
    if (!this.onSave) return;

    const error = this.onSave(this.rows());
    if (error) {
      this.setError(error);
      return;
    }
    this.close();
  },

  rows() {
    return Array.from(document.querySelectorAll('#edit-day-rows .edit-day-row'));
  },

  refresh() {
    const summary = document.getElementById('edit-day-summary');
    if (!summary) return;

    const rows = this.rows();
    if (rows.length === 0) {
      summary.textContent = 'Every entry on this day will be removed.';
    } else {
      summary.textContent = this.summarise ? this.summarise(rows) : '';
    }
  },

  setError(message) {
    const error = document.getElementById('edit-day-error');
    if (error) error.textContent = message;
  },

  /**
   * The ✕ at the end of a row. Removing happens in the window only; Save is
   * what commits it.
   * @param {string} label
   * @returns {HTMLButtonElement}
   */
  removeButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'edit-day-remove';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = '<i class="material-icons-round">close</i>';
    return button;
  },

  /**
   * "Today", or a short readable date for any other day.
   * @param {string} dateKey
   * @returns {string}
   */
  formatDay(dateKey) {
    if (dateKey === utils.getCurrentDate()) return 'Today';
    return utils.parseDateKey(dateKey).toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  },

  /**
   * Wire up the window's controls. Once - the rows are swapped on every open,
   * so they are handled by delegation from their container.
   */
  bind() {
    if (this.bound) return;
    this.bound = true;

    const container = document.getElementById('edit-day-rows');

    container.addEventListener('click', (e) => {
      const remove = e.target.closest('.edit-day-remove');
      if (!remove) return;
      const row = remove.closest('.edit-day-row');
      if (row) row.remove();
      this.setError('');
      this.refresh();
    });

    container.addEventListener('input', () => {
      this.setError('');
      this.refresh();
    });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input')) {
        e.preventDefault();
        this.save();
      }
    });

    document.getElementById('edit-day-cancel')
      .addEventListener('click', () => this.close());
    document.getElementById('edit-day-save')
      .addEventListener('click', () => this.save());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }
};

/**
 * UPDATED: Initialize tracker actions for a specific tracker
 * @param {Tracker} tracker - Tracker instance
 */
function initializeTrackerActions(tracker) {
  const type = tracker.type;
  
  // Set up quick add buttons
  document.querySelectorAll(`[data-action="${type}-add"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = parseInt(btn.dataset.amount);
      if (!isNaN(amount) && amount > 0) {
        tracker.addIntake(amount);
      }
    });
  });
  
  // Set up manual add button
  const addManualBtn = document.getElementById(`${type}-add-manual`);
  if (addManualBtn) {
    addManualBtn.addEventListener('click', () => {
      tracker.addManualIntake();
    });
  }
  
  // Set up enter key for manual input
  const manualInput = document.getElementById(`${type}-manual`);
  if (manualInput) {
    manualInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        tracker.addManualIntake();
      }
    });
  }
  
  // Set goal button
  const setGoalBtn = document.getElementById(`${type}-set-goal`);
  if (setGoalBtn) {
    setGoalBtn.addEventListener('click', () => {
      tracker.setGoal();
    });
  }
  
  // Reset daily button
  const resetDailyBtn = document.getElementById(`${type}-reset-daily`);
  if (resetDailyBtn) {
    resetDailyBtn.addEventListener('click', async () => {
      const confirmed = await utils.confirm(
        `This clears today's ${type} entries and sets the counter back to zero. Earlier days are kept.`,
        { title: `Reset today's ${type}?`, confirmText: 'Reset' }
      );
      if (confirmed) {
        const removed = tracker.resetDailyIntake();
        utils.showUndoToast(`Today's ${type} intake has been reset.`, () => {
          tracker.restoreDailyIntake(removed);
          utils.showToast(`Today's ${type} entries restored.`, 'info');
        });
      }
    });
  }

  // Reset all data button
  const resetDataBtn = document.getElementById(`${type}-reset-data`);
  if (resetDataBtn) {
    resetDataBtn.addEventListener('click', async () => {
      const confirmed = await utils.confirm(
        `This deletes ALL ${type} tracking data, including your full history. This cannot be undone.`,
        { title: `Delete all ${type} data?`, confirmText: 'Delete everything', danger: true }
      );
      if (confirmed) {
        tracker.resetAllData();
      }
    });
  }
  
  // NEW: Goal Reminder Button
  const goalReminderBtn = document.getElementById(`${type}-goal-reminder-btn`);
  if (goalReminderBtn) {
    goalReminderBtn.addEventListener('click', () => {
      toggleGoalReminderButton(type);
    });
  }
  
  // NEW: Interval Reminder Button (only for water)
  if (type === 'water') {
    const intervalReminderBtn = document.getElementById(`${type}-interval-reminder-btn`);
    if (intervalReminderBtn) {
      intervalReminderBtn.addEventListener('click', () => {
        toggleIntervalReminderButton(type);
      });
    }
  }
  
  // NEW: More Options Button
  const moreOptionsBtn = document.getElementById(`${type}-more-options-btn`);
  if (moreOptionsBtn) {
    moreOptionsBtn.addEventListener('click', () => {
      openRemindersPanelForTracker(type);
    });
  }
  
  // Initialize button states
  updateNotificationButtonStates(type);
  
  // Initial history refresh
  tracker.refreshHistory();
}

/**
 * NEW: Toggle goal reminder button state
 */
function toggleGoalReminderButton(type) {
  if (!window.remindersManager) {
    utils.showToast('Reminders system not available', 'error');
    return;
  }
  
  const reminderType = type === 'water' ? 'waterAlert' : 'proteinAlert';
  const currentState = window.remindersManager.data.systemNotifications[reminderType]?.enabled || false;
  const newState = !currentState;
  
  if (newState && !window.remindersManager.data.globalEnabled) {
    // Enable global reminders first
    window.remindersManager.requestNotificationPermission().then(() => {
      if (window.remindersManager.data.globalEnabled) {
        setupGoalAlert(type, true);
        updateNotificationButtonStates(type);
      }
    });
  } else {
    setupGoalAlert(type, newState);
    updateNotificationButtonStates(type);
  }
}

/**
 * NEW: Toggle interval reminder button state (water only)
 */
function toggleIntervalReminderButton(type) {
  if (!window.remindersManager) {
    utils.showToast('Reminders system not available', 'error');
    return;
  }
  
  const reminderType = type === 'water' ? 'waterInterval' : 'proteinInterval';
  const currentState = window.remindersManager.data.systemNotifications[reminderType]?.enabled || false;
  const newState = !currentState;
  
  if (newState && !window.remindersManager.data.globalEnabled) {
    // Enable global reminders first
    window.remindersManager.requestNotificationPermission().then(() => {
      if (window.remindersManager.data.globalEnabled) {
        setupIntervalReminder(type, true);
        updateNotificationButtonStates(type);
      }
    });
  } else {
    setupIntervalReminder(type, newState);
    updateNotificationButtonStates(type);
  }
}

/**
 * NEW: Open reminders panel for specific tracker
 */
function openRemindersPanelForTracker(type) {
  if (!window.remindersManager) {
    utils.showToast('Reminders system not available', 'error');
    return;
  }
  
  // Close current settings panel
  const settingsPanel = document.getElementById(`${type}-settings-section`);
  if (settingsPanel) {
    settingsPanel.classList.remove('active');
  }
  
  // Open reminders panel and navigate to system reminders
  window.remindersManager.openPanel();
  
  // After a short delay, navigate to system reminders view
  setTimeout(() => {
    window.remindersManager.showSystemReminders();
  }, 100);
}

/**
 * NEW: Update notification button states based on current settings
 */
function updateNotificationButtonStates(type) {
  if (!window.remindersManager) return;
  
  // The status line shows the actual schedule, not just ON. This panel has no
  // day or time picker of its own, so "ON" alone told you nothing about when
  // the reminder would fire - which is half of why the two reminder UIs were
  // confusing to use together.
  const applyState = (btnId, statusId, reminderType) => {
    const btn = document.getElementById(btnId);
    const status = document.getElementById(statusId);
    if (!btn || !status) return;

    const isEnabled = window.remindersManager.data.systemNotifications[reminderType]?.enabled || false;

    btn.classList.toggle('active', isEnabled);
    status.textContent = isEnabled
      ? window.remindersManager.describeSystemNotification(reminderType)
      : 'OFF';
  };

  applyState(
    `${type}-goal-reminder-btn`,
    `${type}-goal-status`,
    type === 'water' ? 'waterAlert' : 'proteinAlert'
  );

  // Interval reminders only have a button on the water panel.
  if (type === 'water') {
    applyState('water-interval-reminder-btn', 'water-interval-status', 'waterInterval');
  }
}

/**
 * UPDATED: Setup goal alert reminder (updated to refresh button states)
 */
function setupGoalAlert(type, enable) {
  const reminderType = type === 'water' ? 'waterAlert' : 'proteinAlert';
  const reminderTitle = type === 'water' ? 'Water Goal Alert' : 'Protein Goal Alert';

  // Delegated to RemindersManager so this panel and the reminders panel share
  // one code path - they used to disagree about default days, and only one of
  // them filled them in at all.
  const config = window.remindersManager.setSystemNotificationEnabled(reminderType, enable);
  if (!config) return;

  const action = enable ? 'enabled' : 'disabled';
  const schedule = enable ? ` (${window.remindersManager.describeSystemNotification(reminderType)})` : '';
  utils.showToast(`${reminderTitle} ${action}${schedule}`, enable ? 'success' : 'info');
}

/**
 * UPDATED: Setup interval reminder (updated to refresh button states)
 */
function setupIntervalReminder(type, enable) {
  const reminderType = type === 'water' ? 'waterInterval' : 'proteinInterval';
  const reminderTitle = type === 'water' ? 'Water Interval Reminders' : 'Protein Interval Reminders';
  
  // Same shared path as setupGoalAlert.
  const config = window.remindersManager.setSystemNotificationEnabled(reminderType, enable);
  if (!config) return;

  const action = enable ? 'enabled' : 'disabled';
  const schedule = enable ? ` (${window.remindersManager.describeSystemNotification(reminderType)})` : '';
  utils.showToast(`${reminderTitle} ${action}${schedule}`, enable ? 'success' : 'info');
}

/**
 * NEW: Initialize settings panel events to update button states when panels are opened
 */
function initializeSettingsPanelEvents() {
  // Update button states when settings panels are opened
  const waterSettingsBtn = document.getElementById('water-settings-toggle');
  const proteinSettingsBtn = document.getElementById('protein-settings-toggle');
  
  if (waterSettingsBtn) {
    waterSettingsBtn.addEventListener('click', () => {
      setTimeout(() => updateNotificationButtonStates('water'), 100);
    });
  }
  
  if (proteinSettingsBtn) {
    proteinSettingsBtn.addEventListener('click', () => {
      setTimeout(() => updateNotificationButtonStates('protein'), 100);
    });
  }
}

/**
 * Initialize workout tracker actions - UPDATED VERSION
 * @param {WorkoutTracker} tracker - WorkoutTracker instance
 */
function initializeWorkoutTrackerActions(tracker) {
  // NOTE: the Manage Workouts modal (manage button, add button, cancel button,
  // Enter key, backdrop click) is wired up by WorkoutTracker.initializeManagement().
  // Binding it here as well made every click fire twice, so adding a workout
  // showed "Added X" immediately followed by "This workout already exists".
  // Only the settings-panel buttons below belong to this function.

  // Auto-reset preference
  const autoResetToggle = document.getElementById('workout-autoreset-toggle');
  if (autoResetToggle) {
    autoResetToggle.checked = tracker.isAutoResetEnabled();
    autoResetToggle.addEventListener('change', (e) => {
      tracker.setAutoResetEnabled(e.target.checked);
      utils.showToast(
        e.target.checked
          ? 'Tabs will reset once every workout is done'
          : 'Tabs stay ticked - tap again to log a repeat',
        'info'
      );
    });
  }

  // Reset tabs only button
  const resetTabsBtn = document.getElementById('workout-reset-tabs');
  if (resetTabsBtn) {
    resetTabsBtn.addEventListener('click', () => {
      tracker.resetWorkoutTabs();
      utils.showToast('Workout tabs have been reset.', 'warning');

      // Close the settings panel
      document.getElementById('workout-settings-section').classList.remove('active');
    });
  }

  // Reset daily button
  const resetDailyBtn = document.getElementById('workout-reset-daily');
  if (resetDailyBtn) {
    resetDailyBtn.addEventListener('click', async () => {
      const confirmed = await utils.confirm(
        "This clears both the workout tabs and today's workout history. Earlier days are kept.",
        { title: "Reset today's workouts?", confirmText: 'Reset' }
      );
      if (confirmed) {
        tracker.resetDailyWorkouts();
        utils.showToast("Today's workout data has been reset.", 'warning');
      }
    });
  }

  // Reset all data button
  const resetDataBtn = document.getElementById('workout-reset-data');
  if (resetDataBtn) {
    resetDataBtn.addEventListener('click', async () => {
      const confirmed = await utils.confirm(
        'This deletes ALL workout data, including your workout list and full history. This cannot be undone.',
        { title: 'Delete all workout data?', confirmText: 'Delete everything', danger: true }
      );
      if (confirmed) {
        tracker.resetAllData();
      }
    });
  }

  // Initial history refresh
  tracker.refreshHistory();
}