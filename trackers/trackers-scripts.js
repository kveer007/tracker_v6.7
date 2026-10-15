/**
 * Health Tracker App - Tracker Class
 * This file contains the Tracker class that handles both water and protein tracking
 */

/**
 * Main Tracker class for both water and protein tracking
 */
class Tracker {
  /**
   * Create a new tracker
   * @param {Object} config - Configuration object
   * @param {string} config.type - Type of tracker (water or protein)
   * @param {string} config.unit - Unit of measurement (ml or g)
   */
  constructor(config) {
    // Basic properties
    this.type = config.type;
    this.unit = config.unit;
    
    // Storage keys
    this.goalKey = `${STORAGE_KEYS.GOAL_PREFIX}${this.type}`;
    this.intakeKey = `${STORAGE_KEYS.INTAKE_PREFIX}${this.type}`;
    this.historyKey = `${STORAGE_KEYS.HISTORY_PREFIX}${this.type}`;
    this.lastResetKey = `${STORAGE_KEYS.LAST_RESET_PREFIX}${this.type}`;
    
    // Track timeout ID to prevent memory leaks
    this.midnightResetTimeout = null;
    
    // Load data from localStorage
    this.goal = parseInt(localStorage.getItem(this.goalKey)) || 0;
    this.dailyHistory = this.normaliseHistory(storageManager.readJSON(this.historyKey, {}));

    // Reconcile any legacy counter that drifted from the history.
    this.migrateLegacyIntake();
    
    // DOM elements
    this.elements = {
      total: document.getElementById(`${this.type}-total`),
      remaining: document.getElementById(`${this.type}-remaining`),
      goalDisplay: document.getElementById(`${this.type}-goal-display`),
      progressCircle: document.getElementById(`${this.type}-progress-circle`),
      goalInput: document.getElementById(`${this.type}-goal`),
      manualInput: document.getElementById(`${this.type}-manual`),
      settingsPanel: document.getElementById(`${this.type}-settings-section`),
      historyPanel: document.getElementById(`${this.type}-history-popup`),
      historyToggle: document.getElementById(`${this.type}-history-toggle`),
      dailyHistoryTab: document.getElementById(`${this.type}-daily-history`),
      // Analytics tab
      chart: document.getElementById(`${this.type}-chart`),
      chartLabels: document.getElementById(`${this.type}-chart-labels`),
      chartSummary: document.getElementById(`${this.type}-chart-summary`),
      chartRange: document.getElementById(`${this.type}-chart-range`)
    };

    // Days shown in the Analytics graph: 7 or 30.
    this.chartDays = 7;

    // Initialize tracker
    this.initializeTracker();
  }

  /**
   * Coerce stored history into the shape the rest of the class expects:
   * { 'YYYY-MM-DD': [ { amount: number, timestamp: string } ] }
   *
   * Totals, charts and the history panel all read those fields directly, so a
   * single malformed entry - a string amount, a missing array, a stray key -
   * would otherwise throw partway through a render.
   *
   * @param {*} raw
   * @returns {Object}
   */
  normaliseHistory(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const clean = {};

    Object.entries(raw).forEach(([date, entries]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(entries)) return;

      const validEntries = entries
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({
          amount: Number(entry.amount) || 0,
          timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString()
        }))
        .filter(entry => entry.amount > 0);

      if (validEntries.length > 0) clean[date] = validEntries;
    });

    return clean;
  }

  /**
   * Today's total, derived from the logged entries.
   *
   * This used to be a separate stored counter kept in step with the history by
   * hand, which drifted apart the moment anything reset one without the other
   * (Reset Today zeroed the counter but left the entries, so the counter said
   * 0 while the weekly summary still showed the full day). One source of truth
   * makes that impossible.
   *
   * @returns {number} Sum of today's entries
   */
  get totalIntake() {
    const entries = this.dailyHistory[utils.getCurrentDate()] || [];
    return entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  }

  /**
   * Fold a pre-existing standalone counter into today's history.
   *
   * Older versions stored the running total separately. If that value is
   * larger than what the entries account for, the difference is real intake
   * the user logged, so it is preserved as a single entry rather than dropped.
   */
  migrateLegacyIntake() {
    const storedTotal = parseInt(localStorage.getItem(this.intakeKey));
    if (!storedTotal || isNaN(storedTotal) || storedTotal <= 0) return;

    const today = utils.getCurrentDate();
    const lastReset = localStorage.getItem(this.lastResetKey);

    // The stored counter only ever described today. If it is stale, drop it.
    if (lastReset && lastReset !== today) return;

    const entries = this.dailyHistory[today] || [];
    const loggedTotal = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const missing = storedTotal - loggedTotal;

    if (missing > 0) {
      if (!this.dailyHistory[today]) this.dailyHistory[today] = [];
      this.dailyHistory[today].push({
        amount: missing,
        timestamp: new Date().toISOString()
      });
      storageManager.writeJSON(this.historyKey, this.dailyHistory);
      console.log(`Migrated ${missing} ${this.unit} of legacy ${this.type} intake into history`);
    }
  }

  /**
   * Initialize tracker
   */
  initializeTracker() {
    // Set up circular progress
    if (this.elements.progressCircle) {
      const circleLength = 2 * Math.PI * 45;
      this.elements.progressCircle.style.strokeDasharray = `${circleLength}`;
      this.elements.progressCircle.style.strokeDashoffset = `${circleLength}`;
    }
    
    // Update display
    this.updateDisplay();
    
    // Check for daily reset
    this.checkAndResetDailyIntake();
    
    // Set up auto-reset at midnight
    this.setupMidnightReset();

    this.initializeAnalytics();
  }

  /**
   * Wire up the Analytics tab of the history panel. Bound once.
   */
  initializeAnalytics() {
    if (this.elements.chartRange) {
      this.elements.chartRange.addEventListener('change', (e) => {
        this.chartDays = Number(e.target.value) || 7;
        this.renderAnalytics();
      });
    }

    // The Daily Summary and the graph are only drawn while on screen, so they
    // are drawn from the taps that reveal them: opening the history panel
    // (both), or its Analytics tab (the graph).
    if (this.elements.historyToggle) {
      this.elements.historyToggle.addEventListener('click', () => this.renderHistoryIfVisible());
    }

    const analyticsTabButton = document.querySelector(`[data-tab="${this.type}-analytics"]`);
    if (analyticsTabButton) {
      analyticsTabButton.addEventListener('click', () => this.renderAnalyticsIfVisible());
    }
  }

  /**
   * Draw the Daily Summary and the graph once the panel has opened.
   *
   * Deferred, because this handler runs before the one that actually opens
   * the panel - at click time it is still closed. setTimeout rather than
   * requestAnimationFrame, which does not fire while the page is not being
   * rendered.
   */
  renderHistoryIfVisible() {
    setTimeout(() => {
      if (this.isHistoryOpen()) this.showDailyHistory();
      this.renderAnalytics();
    }, 0);
  }

  /**
   * Draw the graph once its tab has been revealed. Deferred for the same
   * reason as renderHistoryIfVisible().
   */
  renderAnalyticsIfVisible() {
    setTimeout(() => this.renderAnalytics(), 0);
  }

  /**
   * Bar graph of daily amounts over the chosen range, with the goal line,
   * plus the average and goal-met count above it.
   */
  renderAnalytics() {
    const chart = this.elements.chart;

    // Off screen (closed panel, other tab) - drawn when it is revealed.
    if (!chart || chart.offsetWidth === 0) return;

    const dataPoints = [];
    for (let i = this.chartDays - 1; i >= 0; i--) {
      const date = utils.startOfToday();
      date.setDate(date.getDate() - i);
      const entries = this.dailyHistory[utils.formatDate(date)] || [];
      dataPoints.push({
        date,
        value: entries.reduce((sum, entry) => sum + entry.amount, 0)
      });
    }

    // The tracker's own colour token, so the graph matches its buttons.
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${this.type}-primary`).trim();

    // Today's bar is faded: the day is still in progress, as in the habit
    // and workout graphs.
    chartUtils.renderBarChart({
      chart,
      labels: this.elements.chartLabels,
      dataPoints,
      color,
      goal: this.goal,
      unit: this.unit,
      fadeLast: true
    });

    this.renderAnalyticsSummary(dataPoints);
  }

  /**
   * The figures above the graph: average a day, and days the goal was met.
   *
   * Every past day in the range counts, including days with nothing logged.
   * Today counts only once its goal is met - until then it is not over yet,
   * and counting it dragged both figures down every morning (the user's
   * call, October 2026, as for habits and workouts). With no goal set, today
   * never counts. Past days are judged against the current goal - history
   * does not record what the goal was at the time.
   *
   * @param {Array<{date: Date, value: number}>} dataPoints - Oldest first,
   *   ending today
   */
  renderAnalyticsSummary(dataPoints) {
    const element = this.elements.chartSummary;
    if (!element) return;

    element.innerHTML = '';

    const today = dataPoints[dataPoints.length - 1];
    const todayCounts = this.goal > 0 && today.value >= this.goal;
    const counted = todayCounts ? dataPoints : dataPoints.slice(0, -1);

    const days = counted.length;
    const total = counted.reduce((sum, point) => sum + point.value, 0);
    const average = days ? Math.round(total / days) : 0;

    const figure = document.createElement('strong');
    figure.className = 'chart-summary-value';
    figure.textContent = `${average} ${this.unit}`;

    const caption = document.createElement('span');
    caption.className = 'chart-summary-caption';
    caption.textContent = `average a day · Last ${dataPoints.length} days`;

    const goalLine = document.createElement('span');
    goalLine.className = 'chart-summary-caption chart-summary-line';
    if (this.goal > 0) {
      const met = counted.filter(point => point.value >= this.goal).length;
      goalLine.textContent = `Goal met on ${met} of ${days} days` +
        (todayCounts ? '' : ' · today counts once reached');
    } else {
      goalLine.textContent = 'Set a daily goal in Settings to see how often you reach it.';
    }

    element.appendChild(figure);
    element.appendChild(caption);
    element.appendChild(goalLine);
  }

  /**
   * Update the display with current data
   */
  updateDisplay() {
    // Update total
    if (this.elements.total) {
      this.elements.total.textContent = this.totalIntake;
    }
    
    // Update goal display
    if (this.elements.goalDisplay) {
      this.elements.goalDisplay.textContent = this.goal;
    }
    
    // Update remaining
    if (this.elements.remaining) {
      const remaining = this.goal > this.totalIntake ? this.goal - this.totalIntake : 0;
      this.elements.remaining.textContent = remaining;
    }
    
    // Update progress visualization
    this.updateProgressVisualization();
    
    // Save to localStorage
    localStorage.setItem(this.intakeKey, this.totalIntake);
  }

  /**
   * Update the progress visualization (circular progress)
   */
  updateProgressVisualization() {
    if (!this.elements.progressCircle) return;
    
    // Calculate progress percentage
    let progress = this.goal > 0 ? (this.totalIntake / this.goal) * 100 : 0;
    progress = Math.min(progress, 100); // Cap at 100%
    
    // Calculate circle values
    const circleLength = 2 * Math.PI * 45;
    const offset = circleLength - (progress / 100) * circleLength;
    
    // Update circle
    this.elements.progressCircle.style.strokeDashoffset = offset;
  }
  
  /**
   * Set the daily goal
   */
  setGoal() {
    const inputGoal = parseInt(this.elements.goalInput.value);
    
    if (isNaN(inputGoal) || inputGoal <= 0) {
      utils.showToast('Please enter a valid goal (a positive number).', 'error');
      return;
    }
    
    this.goal = inputGoal;
    localStorage.setItem(this.goalKey, this.goal);
    this.updateDisplay();
    // The history's "% of daily goal" and the graph's goal line follow it.
    this.refreshHistory();

    utils.showToast(`${this.type.charAt(0).toUpperCase() + this.type.slice(1)} goal set to ${this.goal} ${this.unit}`, 'success');
    
    // Close the settings panel
    this.elements.settingsPanel.classList.remove('active');
  }
  
  /**
   * Add intake amount
   * @param {number} amount - Amount to add
   */
  addIntake(amount) {
    if (amount <= 0) return;

    // Logging the entry is what changes the total - see the totalIntake getter.
    this.saveDailyHistory(amount);
    this.updateDisplay();
    this.refreshHistory();

    utils.showUndoToast(`Added ${amount} ${this.unit} of ${this.type}`, () => {
      this.removeLastEntry();
      utils.showToast(`Removed ${amount} ${this.unit}`, 'info');
    });
  }

  /**
   * Drop today's most recent entry. Backs the Undo action.
   */
  removeLastEntry() {
    const today = utils.getCurrentDate();
    const entries = this.dailyHistory[today];
    if (!entries || entries.length === 0) return;

    entries.pop();
    if (entries.length === 0) delete this.dailyHistory[today];

    storageManager.writeJSON(this.historyKey, this.dailyHistory);
    this.updateDisplay();
    this.refreshHistory();
  }
  
  /**
   * Add manually entered intake
   */
  addManualIntake() {
    const amount = parseInt(this.elements.manualInput.value);
    
    if (!isNaN(amount) && amount > 0) {
      this.addIntake(amount);
      this.elements.manualInput.value = '';
    } else {
      utils.showToast(`Please enter a positive number.`, 'error');
    }
  }
  
  /**
   * Save intake to daily history
   * @param {number} amount - Amount to save
   */
  saveDailyHistory(amount) {
    const currentDate = utils.formatDate(new Date());
    
    if (!this.dailyHistory[currentDate]) {
      this.dailyHistory[currentDate] = [];
    }
    
    this.dailyHistory[currentDate].push({
      amount,
      timestamp: new Date().toISOString()
    });
    
    storageManager.writeJSON(this.historyKey, this.dailyHistory);
  }
  
  /**
   * Refresh history displays
   */
  refreshHistory() {
    // The Daily Summary lists every day ever logged - thousands of elements
    // after a few years - so it is only drawn while the history panel is
    // open; opening the panel draws it (renderHistoryIfVisible). Redrawing it
    // behind a closed panel on every tap cost ~17 ms a tap with three years
    // of data on a desktop, several times that on a phone.
    if (this.isHistoryOpen()) this.showDailyHistory();
    this.renderAnalytics();
  }

  /**
   * Whether the history panel is showing.
   * @returns {boolean}
   */
  isHistoryOpen() {
    return !!this.elements.historyPanel && this.elements.historyPanel.classList.contains('active');
  }
  
  /**
   * Check if daily intake needs to be reset
   */
  checkAndResetDailyIntake() {
    const currentDate = utils.getCurrentDate();
    const lastResetDate = localStorage.getItem(this.lastResetKey);

    if (lastResetDate === currentDate) return;

    // Deliberately does NOT delete anything.
    //
    // Now that the total is derived from today's entries, a new day resets
    // itself: there are no entries under the new date, so the total is
    // already 0. Calling resetDailyIntake() here destroyed real data in the
    // one case where the marker was missing but the entries were not -
    // restoring a backup onto a fresh device, which wiped the current day.
    localStorage.setItem(this.lastResetKey, currentDate);
    this.updateDisplay();
    this.refreshHistory();
  }
  
  /**
   * Setup automatic reset at midnight
   */
  setupMidnightReset() {
    // Clear any existing timeout to prevent memory leaks
    if (this.midnightResetTimeout) {
      clearTimeout(this.midnightResetTimeout);
    }
    
    // Calculate time until next midnight
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const midnight = new Date(tomorrow.setHours(0, 0, 0, 0));
    const msUntilMidnight = midnight - now;
    
    // Set timeout for midnight reset
    this.midnightResetTimeout = setTimeout(() => {
      this.checkAndResetDailyIntake();
      this.setupMidnightReset(); // Set up next day's reset
    }, msUntilMidnight);
  }
  
  /**
   * Reset daily intake
   */
  resetDailyIntake() {
    // Clear today's entries. The displayed total is derived from them, so
    // clearing the entries is what resets the counter - and it keeps the
    // history panel and the counter telling the same story.
    const today = utils.getCurrentDate();
    const removed = this.dailyHistory[today];

    delete this.dailyHistory[today];
    storageManager.writeJSON(this.historyKey, this.dailyHistory);

    this.updateDisplay();
    this.refreshHistory();

    return removed;
  }

  /**
   * Put back a day's entries that resetDailyIntake() removed.
   * @param {Array} entries
   */
  restoreDailyIntake(entries) {
    if (!entries || entries.length === 0) return;

    this.dailyHistory[utils.getCurrentDate()] = entries;
    storageManager.writeJSON(this.historyKey, this.dailyHistory);

    this.updateDisplay();
    this.refreshHistory();
  }
  
  /**
   * Show the Daily Summary: every day with something logged, newest first.
   */
  showDailyHistory() {
    if (!this.elements.dailyHistoryTab) return;

    this.elements.dailyHistoryTab.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // All of them. This used to stop at the 7 most recent ("Weekly Summary");
    // the user wants the whole record. YYYY-MM-DD sorts correctly as text.
    const dates = Object.keys(this.dailyHistory).sort((a, b) => b.localeCompare(a));
    
    if (dates.length === 0) {
      const noData = document.createElement('p');
      noData.textContent = 'No history data available.';
      fragment.appendChild(noData);
    } else {
      dates.forEach(date => {
        const entries = this.dailyHistory[date];
        const totalAmount = entries.reduce((sum, entry) => sum + entry.amount, 0);
        
        const dayEntry = document.createElement('div');
        dayEntry.className = 'day-entry';

        // Date line, with the pencil that opens this day for editing.
        const header = document.createElement('div');
        header.className = 'day-entry-header';

        const dateText = document.createElement('b');
        dateText.textContent = date;
        header.appendChild(dateText);

        header.appendChild(createHistoryEditButton(
          `Edit ${this.type} for ${date}`,
          () => this.openDayEditor(date)
        ));
        dayEntry.appendChild(header);

        const totalText = document.createElement('p');
        totalText.textContent = `Total: ${totalAmount} ${this.unit}`;
        dayEntry.appendChild(totalText);
        
        const goalPercent = document.createElement('p');
        const percentage = this.goal > 0 ? Math.round((totalAmount / this.goal) * 100) : 0;
        goalPercent.textContent = `${percentage}% of daily goal`;
        dayEntry.appendChild(goalPercent);
        
        fragment.appendChild(dayEntry);
      });
    }

    // Only fill in the content. Which tab is showing is the user's choice and
    // belongs to the tab buttons - forcing it here used to yank the panel back
    // to the first tab every time an entry was added, while the other tab's
    // button stayed highlighted.
    this.elements.dailyHistoryTab.appendChild(fragment);
  }

  /**
   * Open a day's entries in the edit window (the history pencil buttons).
   *
   * Amounts can be changed and entries removed. Each entry keeps the time it
   * was logged.
   *
   * @param {string} dateKey
   */
  openDayEditor(dateKey) {
    const entries = this.dailyHistory[dateKey] || [];
    if (entries.length === 0) {
      utils.showToast('Nothing is logged on that day.', 'info');
      return;
    }

    const rows = entries.map((entry, index) => {
      const row = document.createElement('div');
      row.className = 'edit-day-row';
      // Which stored entry this row edits. Rows can be removed, so position
      // in the window is not enough.
      row.dataset.index = index;

      const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const timeLabel = document.createElement('span');
      timeLabel.className = 'edit-day-time';
      timeLabel.textContent = time;

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.inputMode = 'decimal';
      input.className = 'edit-day-amount';
      input.value = entry.amount;
      input.setAttribute('aria-label', `Amount logged at ${time}`);

      const unit = document.createElement('span');
      unit.className = 'edit-day-unit';
      unit.textContent = this.unit;

      row.appendChild(timeLabel);
      row.appendChild(input);
      row.appendChild(unit);
      row.appendChild(dayEditor.removeButton(`Remove the ${time} entry`));
      return row;
    });

    dayEditor.open({
      title: `Edit ${this.type} · ${dayEditor.formatDay(dateKey)}`,
      rows,
      summarise: (currentRows) => {
        const total = currentRows.reduce(
          (sum, row) => sum + (Number(row.querySelector('.edit-day-amount').value) || 0), 0
        );
        // Rounded for display, so 0.1 + 0.2 does not read as 0.30000000000000004.
        return `Total: ${Math.round(total * 100) / 100} ${this.unit}`;
      },
      onSave: (currentRows) => this.saveDayEdit(dateKey, entries, currentRows)
    });
  }

  /**
   * Apply the edit window's rows to a day.
   *
   * @param {string} dateKey
   * @param {Array} original - The day's entries when the window opened
   * @param {Element[]} rows - The rows left in the window
   * @returns {string|null} An error to show in the window, or null when done
   */
  saveDayEdit(dateKey, original, rows) {
    const updated = [];

    for (const row of rows) {
      const raw = row.querySelector('.edit-day-amount').value.trim();
      const amount = Number(raw);

      if (raw === '' || !Number.isFinite(amount) || amount <= 0) {
        return 'Each amount must be more than 0. Use ✕ to remove an entry.';
      }

      const source = original[Number(row.dataset.index)];
      updated.push({ amount, timestamp: source.timestamp });
    }

    const unchanged = updated.length === original.length &&
      updated.every((entry, i) => entry.amount === original[i].amount);
    if (unchanged) return null;

    // Copied, so Undo puts back exactly what was there.
    const previous = original.map(entry => ({ ...entry }));
    this.replaceDayEntries(dateKey, updated);

    const name = this.type.charAt(0).toUpperCase() + this.type.slice(1);
    const day = dateKey === utils.getCurrentDate() ? 'today' : dayEditor.formatDay(dateKey);

    utils.showUndoToast(`${name} for ${day} updated`, () => {
      this.replaceDayEntries(dateKey, previous);
      utils.showToast(`${name} for ${day} put back`, 'info');
    });

    return null;
  }

  /**
   * Replace one day's entries, then refresh everything that shows them.
   * Today's total is derived from history, so the ring follows on its own.
   *
   * @param {string} dateKey
   * @param {Array} entries - Empty removes the day
   */
  replaceDayEntries(dateKey, entries) {
    if (entries.length > 0) {
      this.dailyHistory[dateKey] = entries;
    } else {
      delete this.dailyHistory[dateKey];
    }

    storageManager.writeJSON(this.historyKey, this.dailyHistory);
    this.updateDisplay();
    this.refreshHistory();
  }

  /**
   * Reset all data for this tracker
   */
  resetAllData() {
    localStorage.removeItem(this.goalKey);
    localStorage.removeItem(this.intakeKey);
    localStorage.removeItem(this.historyKey);
    localStorage.removeItem(this.lastResetKey);
    
    utils.showToast(`All ${this.type} tracking data has been reset.`, 'warning');
    
    // Reload the page to reset all instances
    setTimeout(() => location.reload(), 1500);
  }
}