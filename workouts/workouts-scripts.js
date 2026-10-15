/**
 * Health Tracker App - Workout Tracker
 * This file contains the implementation of the workout tracker functionality with dynamic workout management
 */

/**
 * WorkoutTracker class for tracking workout exercises
 */
class WorkoutTracker {
    /**
     * Create a new workout tracker
     */
    constructor() {
        // Define storage keys
        this.stateKey = 'workout_state';
        this.historyKey = 'workout_history';
        this.countKey = 'workout_count';
        this.workoutTypesKey = 'workout_types'; // NEW: Custom workout types storage
        this.lastResetKey = `${STORAGE_KEYS.LAST_RESET_PREFIX}workout`;
        
        // Load custom workout types or use defaults
        this.loadWorkoutTypes();
        
        // Load data from localStorage
        this.workoutState = storageManager.readJSON(this.stateKey, null) ||
          this.workoutTypes.reduce((acc, type) => {
            acc[type] = { completed: false, order: this.workoutTypes.indexOf(type) };
            return acc;
          }, {});
        
        this.workoutCounts = storageManager.readJSON(this.countKey, null) ||
          this.workoutTypes.reduce((acc, type) => {
            acc[type] = 0;
            return acc;
          }, {});
      
        this.workoutHistory = this.normaliseHistory(storageManager.readJSON(this.historyKey, {}));
        
        // Set DOM elements
        this.elements = {
            tabsContainer: document.getElementById('workout-tabs-container'),
            historyPanel: document.getElementById('workout-history-popup'),
            // The filter and day list inside the Daily Summary tab. Not the
            // tab itself, which also holds the Add Missed Workout button and
            // must keep it across re-renders.
            dailyHistoryTab: document.getElementById('workout-daily-history-list'),
            // Analytics elements
            analyticsTab: document.getElementById('workout-analytics'),
            workoutChart: document.getElementById('workout-chart'),
            chartLabels: document.getElementById('workout-chart-labels'),
            workoutStreaks: document.getElementById('workout-streaks'),
            viewTypeSelect: document.getElementById('workout-view-type'),
            timePeriodSelect: document.getElementById('workout-time-period'),
            calendarContent: document.getElementById('workout-calendar-scroll-content'),
            calendarEditButton: document.getElementById('workout-edit-calendar-button'),
            // NEW: Management elements
            manageButton: document.getElementById('workout-manage-button'),
            manageModal: document.getElementById('workout-manage-modal'),
            newWorkoutInput: document.getElementById('new-workout-input'),
            addWorkoutBtn: document.getElementById('add-workout-btn'),
            workoutList: document.getElementById('workout-list'),
            manageCancelBtn: document.getElementById('workout-manage-cancel')
        };
        
        // Default analytics settings
        this.selectedWorkoutView = 'all';
        this.selectedTimePeriod = 'weekly';
        this.selectedHistoryFilter = 'all';
        this.analyticsListenersBound = false;
        this.midnightResetTimeout = null;
        this.chartObserver = null;

        // History calendar (core/calendar.js), built with the analytics.
        this.calendarStrip = null;
        this.isCalendarEditing = false;

        // Initialize tracker
        this.initializeTracker();
    }
    
    /**
 * Load workout types from localStorage or set defaults
 */
    loadWorkoutTypes() {
      const storedTypes = storageManager.readJSON(this.workoutTypesKey, null);

      if (Array.isArray(storedTypes)) {
        // Names are used as object keys, rendered, and matched against history,
        // so anything that is not a non-empty string is dropped rather than
        // left to surface as "undefined" in the tab strip.
        this.workoutTypes = storedTypes.filter(
          type => typeof type === 'string' && type.trim().length > 0
        );

        if (this.workoutTypes.length !== storedTypes.length) {
          console.warn('Dropped malformed workout types on load');
          this.saveWorkoutTypes();
        }
      } else {
        // Start with empty workout types - no defaults
        this.workoutTypes = [];
        this.saveWorkoutTypes();
      }
    }

    /**
     * Coerce stored history into:
     * { 'YYYY-MM-DD': [ { type: string, count: number, timestamp: string } ] }
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
                .filter(entry => entry && typeof entry === 'object' && typeof entry.type === 'string')
                .map(entry => ({
                    type: entry.type,
                    count: Number(entry.count) || 1,
                    timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString()
                }));

            if (validEntries.length > 0) clean[date] = validEntries;
        });

        return clean;
    }
    
    /**
     * Save workout types to localStorage
     */
    saveWorkoutTypes() {
        storageManager.writeJSON(this.workoutTypesKey, this.workoutTypes);
    }
    
    /**
     * Initialize tracker
     */
    initializeTracker() {
        // Check for daily reset
        this.checkAndResetDailyWorkouts();
        
        // Set up auto-reset at midnight
        this.setupMidnightReset();
        
        // Render workout tabs
        this.renderWorkoutTabs();
        
        // Update display
        this.updateDisplay();
        
        // Initialize workout analytics
        this.initializeWorkoutAnalytics();
        
        // NEW: Initialize management functionality
        this.initializeManagement();
    }
    
    /**
     * NEW: Initialize workout management functionality
     */
    initializeManagement() {
        if (!this.elements.manageButton || !this.elements.manageModal) return;
        
        // Manage button click
        this.elements.manageButton.addEventListener('click', () => {
            this.showManageModal();
        });
        
        // Add workout button
        this.elements.addWorkoutBtn.addEventListener('click', () => {
            this.addNewWorkout();
        });
        
        // Cancel button
        this.elements.manageCancelBtn.addEventListener('click', () => {
            this.hideManageModal();
        });
        
        // Enter key on input
        this.elements.newWorkoutInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addNewWorkout();
            }
        });
        
        // Close modal on backdrop click
        this.elements.manageModal.addEventListener('click', (e) => {
            if (e.target === this.elements.manageModal) {
                this.hideManageModal();
            }
        });
    }
    
    /**
     * Wire up the "Add Missed Workout" flow.
     *
     * Bound once, from initializeWorkoutAnalytics' one-time block.
     */
    initializeMissedWorkout() {
        const openBtn = document.getElementById('workout-missed-button');
        const modal = document.getElementById('workout-missed-modal');
        if (!openBtn || !modal) return;

        openBtn.addEventListener('click', () => this.showMissedWorkoutModal());

        document.getElementById('missed-workout-close')
            ?.addEventListener('click', () => this.hideMissedWorkoutModal());

        document.getElementById('missed-workout-add')
            ?.addEventListener('click', () => this.addMissedWorkout());

        // Re-list that day's entries whenever the date changes.
        document.getElementById('missed-workout-date')
            ?.addEventListener('change', () => this.renderMissedWorkoutDay());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideMissedWorkoutModal();
        });
    }

    /**
     * Open the backdating modal.
     *
     * The Add Missed Workout button at the top of the Daily Summary opens it
     * on today. The History calendar, in edit mode, opens it on the tapped
     * day as "Edit Workouts" - the same window, since adding and removing a
     * day's workouts is exactly what it does.
     *
     * @param {string} [dateKey] - Day to show; today when omitted
     * @param {string} [title]
     */
    showMissedWorkoutModal(dateKey = utils.getCurrentDate(), title = 'Add Missed Workout') {
        if (this.workoutTypes.length === 0) {
            utils.showToast('Add a workout first, then you can backdate it.', 'warning');
            return;
        }

        const modal = document.getElementById('workout-missed-modal');
        const dateInput = document.getElementById('missed-workout-date');
        const typeSelect = document.getElementById('missed-workout-type');
        if (!modal || !dateInput || !typeSelect) return;

        const titleElement = document.getElementById('missed-workout-title');
        if (titleElement) titleElement.textContent = title;

        typeSelect.innerHTML = '';
        this.workoutTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        });

        dateInput.value = dateKey;
        // Logging a workout you have not done yet is never what you meant.
        dateInput.max = utils.getCurrentDate();

        this.renderMissedWorkoutDay();

        // Opened from the history panel, which stays open behind it - taps
        // inside a pop-up do not close panels - so closing the window returns
        // to the history.
        modal.style.display = 'flex';
    }

    hideMissedWorkoutModal() {
        const modal = document.getElementById('workout-missed-modal');
        if (modal) modal.style.display = 'none';
    }

    /**
     * List what is already logged on the selected day, each removable.
     */
    renderMissedWorkoutDay() {
        const dateInput = document.getElementById('missed-workout-date');
        const container = document.getElementById('missed-workout-existing');
        const title = document.getElementById('missed-workout-day-title');
        if (!dateInput || !container) return;

        const dateKey = dateInput.value;
        container.innerHTML = '';

        if (title) {
            title.textContent = dateKey === utils.getCurrentDate()
                ? 'Logged today'
                : `Logged on ${utils.parseDateKey(dateKey).toLocaleDateString(undefined, {
                      weekday: 'short', day: 'numeric', month: 'short'
                  })}`;
        }

        const entries = this.workoutHistory[dateKey] || [];

        if (entries.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'missed-workout-empty';
            empty.textContent = 'Nothing logged on this day yet.';
            container.appendChild(empty);
            return;
        }

        entries.forEach((entry, index) => {
            const row = document.createElement('div');
            row.className = 'missed-workout-row';

            const name = document.createElement('span');
            name.textContent = entry.type;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'missed-workout-remove';
            removeBtn.innerHTML = '<i class="material-icons-round">close</i>';
            removeBtn.title = `Remove ${entry.type}`;
            removeBtn.addEventListener('click', () => this.removeHistoryEntry(dateKey, index));

            row.appendChild(name);
            row.appendChild(removeBtn);
            container.appendChild(row);
        });
    }

    /**
     * Record a workout on a past day.
     */
    addMissedWorkout() {
        const dateKey = document.getElementById('missed-workout-date')?.value;
        const type = document.getElementById('missed-workout-type')?.value;

        if (!dateKey || !type) {
            utils.showToast('Pick a date and a workout', 'error');
            return;
        }

        if (utils.parseDateKey(dateKey) > utils.startOfToday()) {
            utils.showToast('That day has not happened yet', 'error');
            return;
        }

        if (!this.workoutTypes.includes(type)) {
            utils.showToast('That workout no longer exists', 'error');
            return;
        }

        // Today goes through the normal tap path, so the tab state, the count
        // badge and the history cannot end up disagreeing about today.
        if (dateKey === utils.getCurrentDate()) {
            this.toggleWorkout(type);
            this.renderMissedWorkoutDay();
            return;
        }

        if (!this.workoutHistory[dateKey]) this.workoutHistory[dateKey] = [];

        const sameTypeToday = this.workoutHistory[dateKey].filter(e => e.type === type).length;

        this.workoutHistory[dateKey].push({
            type,
            count: sameTypeToday + 1,
            // Midday on the chosen date, not "now" - otherwise the entry
            // claims a time it did not happen, and anything reading the
            // timestamp back would place it on the wrong day.
            timestamp: (() => {
                const d = utils.parseDateKey(dateKey);
                d.setHours(12, 0, 0, 0);
                return d.toISOString();
            })()
        });

        storageManager.writeJSON(this.historyKey, this.workoutHistory);

        // Backdating must not touch today's tabs.
        this.refreshHistory();
        this.renderMissedWorkoutDay();

        const readable = utils.parseDateKey(dateKey).toLocaleDateString(undefined, {
            weekday: 'short', day: 'numeric', month: 'short'
        });
        const addedIndex = this.workoutHistory[dateKey].length - 1;

        utils.showUndoToast(`${type} added to ${readable}`, () => {
            this.removeHistoryEntry(dateKey, addedIndex, { silent: true });
        });
    }

    /**
     * Remove one history entry from a given day.
     *
     * @param {string} dateKey
     * @param {number} index
     * @param {Object} [options] - { silent } to skip the undo offer
     */
    removeHistoryEntry(dateKey, index, options = {}) {
        const entries = this.workoutHistory[dateKey];
        if (!entries || !entries[index]) return;

        const before = [...entries];
        const [removed] = entries.splice(index, 1);
        if (entries.length === 0) delete this.workoutHistory[dateKey];

        storageManager.writeJSON(this.historyKey, this.workoutHistory);

        // If today changed, today's tabs have to follow.
        if (dateKey === utils.getCurrentDate()) {
            this.applyTodayChange(before, this.workoutHistory[dateKey] || []);
            this.renderWorkoutTabs();
        }

        this.refreshHistory();
        this.renderMissedWorkoutDay();

        if (options.silent) {
            utils.showToast(`Removed ${removed.type}`, 'info');
            return;
        }

        utils.showUndoToast(`Removed ${removed.type}`, () => {
            const beforeUndo = [...(this.workoutHistory[dateKey] || [])];
            if (!this.workoutHistory[dateKey]) this.workoutHistory[dateKey] = [];
            this.workoutHistory[dateKey].splice(
                Math.min(index, this.workoutHistory[dateKey].length), 0, removed
            );
            storageManager.writeJSON(this.historyKey, this.workoutHistory);

            if (dateKey === utils.getCurrentDate()) {
                this.applyTodayChange(beforeUndo, this.workoutHistory[dateKey]);
                this.renderWorkoutTabs();
            }

            this.refreshHistory();
            this.renderMissedWorkoutDay();
        });
    }

    /**
     * Open a day's workouts in the edit window (the history pencil buttons).
     *
     * Each logged workout can be switched to a different one or removed.
     * Adding a forgotten workout stays with Add Missed Workout.
     *
     * @param {string} dateKey
     */
    openDayEditor(dateKey) {
        const entries = this.workoutHistory[dateKey] || [];
        if (entries.length === 0) {
            utils.showToast('Nothing is logged on that day.', 'info');
            return;
        }

        const rows = entries.map((entry, index) => {
            const row = document.createElement('div');
            row.className = 'edit-day-row';
            // Which stored entry this row edits. Rows can be removed, so
            // position in the window is not enough.
            row.dataset.index = index;

            const select = document.createElement('select');
            select.className = 'edit-day-workout';
            select.setAttribute('aria-label', `Workout ${index + 1}`);

            // Every current workout, plus this entry's own name if it is no
            // longer in the list (an imported entry, say), so opening the
            // window never quietly changes what was logged.
            const names = this.workoutTypes.includes(entry.type)
                ? this.workoutTypes
                : [...this.workoutTypes, entry.type];

            names.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            });
            select.value = entry.type;

            row.appendChild(select);
            row.appendChild(dayEditor.removeButton(`Remove ${entry.type}`));
            return row;
        });

        dayEditor.open({
            title: `Edit workouts · ${dayEditor.formatDay(dateKey)}`,
            rows,
            summarise: (currentRows) =>
                `${currentRows.length} workout${currentRows.length === 1 ? '' : 's'} logged`,
            onSave: (currentRows) => this.saveDayEdit(dateKey, entries, currentRows)
        });
    }

    /**
     * Apply the edit window's rows to a day.
     *
     * @param {string} dateKey
     * @param {Array} original - The day's entries when the window opened
     * @param {Element[]} rows - The rows left in the window
     * @returns {null} Always closes; there is nothing to get wrong in a dropdown
     */
    saveDayEdit(dateKey, original, rows) {
        const updated = rows.map(row => ({
            type: row.querySelector('.edit-day-workout').value,
            count: 0,
            timestamp: original[Number(row.dataset.index)].timestamp
        }));

        const unchanged = updated.length === original.length &&
            updated.every((entry, i) => entry.type === original[i].type);
        if (unchanged) return null;

        // count is the entry's position among that day's entries of the same
        // workout, as addMissedWorkout records it. Switching or removing an
        // entry changes those positions.
        const seen = {};
        updated.forEach(entry => {
            seen[entry.type] = (seen[entry.type] || 0) + 1;
            entry.count = seen[entry.type];
        });

        // Copied, so Undo puts back exactly what was there.
        const previous = original.map(entry => ({ ...entry }));
        this.replaceDayEntries(dateKey, updated);

        const day = dateKey === utils.getCurrentDate() ? 'today' : dayEditor.formatDay(dateKey);
        utils.showUndoToast(`Workouts for ${day} updated`, () => {
            this.replaceDayEntries(dateKey, previous);
            utils.showToast(`Workouts for ${day} put back`, 'info');
        });

        return null;
    }

    /**
     * Replace one day's workouts, then refresh everything that shows them.
     *
     * @param {string} dateKey
     * @param {Array} entries - Empty removes the day
     */
    replaceDayEntries(dateKey, entries) {
        const before = this.workoutHistory[dateKey] || [];

        if (entries.length > 0) {
            this.workoutHistory[dateKey] = entries;
        } else {
            delete this.workoutHistory[dateKey];
        }

        storageManager.writeJSON(this.historyKey, this.workoutHistory);

        // Today's tabs and count badges follow what changed today.
        if (dateKey === utils.getCurrentDate()) {
            this.applyTodayChange(before, entries);
            this.renderWorkoutTabs();
        }

        this.refreshHistory();
    }

    /**
     * Move the tabs and counts by what an edit to today's history changed.
     *
     * The tabs describe the current round, which can span several days, so
     * they are adjusted by the difference - one Legs entry removed today
     * takes one off Legs' count, and unticks it only if that leaves none -
     * and workouts the edit did not touch are left alone. This used to
     * rebuild every tab from today's history, which unticked everything done
     * on an earlier day of the round.
     *
     * @param {Array} before - Today's entries before the edit
     * @param {Array} after - Today's entries after it
     */
    applyTodayChange(before, after) {
        const tally = entries => entries.reduce((counts, entry) => {
            counts[entry.type] = (counts[entry.type] || 0) + 1;
            return counts;
        }, {});
        const was = tally(before);
        const now = tally(after);

        this.workoutTypes.forEach((type, order) => {
            const delta = (now[type] || 0) - (was[type] || 0);
            if (delta === 0) return;

            const count = Math.max(0, (Number(this.workoutCounts[type]) || 0) + delta);
            this.workoutCounts[type] = count;
            if (!this.workoutState[type]) {
                this.workoutState[type] = { completed: false, order };
            }
            this.workoutState[type].completed = count > 0;
        });

        this.saveState();
    }

    /**
     * NEW: Show manage workouts modal
     */
    showManageModal() {
        this.renderWorkoutList();
        this.elements.manageModal.style.display = 'flex';
        this.elements.newWorkoutInput.focus();
    }
    
    /**
     * NEW: Hide manage workouts modal
     */
    hideManageModal() {
        this.elements.manageModal.style.display = 'none';
        this.elements.newWorkoutInput.value = '';
    }
    
    /**
     * NEW: Render current workout list in modal
     */
    renderWorkoutList() {
        if (!this.elements.workoutList) return;
        
        this.elements.workoutList.innerHTML = '';
        
        if (this.workoutTypes.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.textContent = 'No workouts added yet.';
            emptyMsg.style.color = 'var(--text-secondary)';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.style.padding = 'var(--spacing-md)';
            this.elements.workoutList.appendChild(emptyMsg);
            return;
        }
        
        this.workoutTypes.forEach((type, index) => {
            const workoutItem = document.createElement('div');
            workoutItem.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: var(--spacing-sm) var(--spacing-md);
                margin-bottom: var(--spacing-xs);
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-sm);
            `;
            
            const workoutName = document.createElement('span');
            workoutName.textContent = type;
            workoutName.style.color = 'var(--text-primary)';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '<i class="material-icons-round">delete</i>';
            deleteBtn.style.cssText = `
                background: var(--danger);
                color: white;
                border: none;
                border-radius: var(--radius-sm);
                padding: var(--spacing-xs);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
            `;
            deleteBtn.title = `Delete ${type}`;
            
            deleteBtn.addEventListener('click', () => {
                this.deleteWorkout(index);
            });
            
            workoutItem.appendChild(workoutName);
            workoutItem.appendChild(deleteBtn);
            this.elements.workoutList.appendChild(workoutItem);
        });
    }
    
    /**
     * NEW: Add new workout type
     */
    addNewWorkout() {
        const workoutName = this.elements.newWorkoutInput.value.trim();
        
        if (!workoutName) {
            utils.showToast('Please enter a workout name', 'error');
            return;
        }
        
        // Check if workout already exists
        if (this.workoutTypes.includes(workoutName)) {
            utils.showToast('This workout already exists', 'error');
            return;
        }
        
        // Add to workout types
        this.workoutTypes.push(workoutName);
        this.saveWorkoutTypes();
        
        // Initialize state for new workout
        this.workoutState[workoutName] = { 
            completed: false, 
            order: this.workoutTypes.length - 1 
        };
        this.workoutCounts[workoutName] = 0;
        
        // Save updated state
        this.saveState();
        
        // Update UI
        this.renderWorkoutTabs();
        this.renderWorkoutList();
        this.initializeWorkoutAnalytics(); // Refresh analytics dropdown
        
        // Clear input
        this.elements.newWorkoutInput.value = '';
        
        utils.showToast(`Added ${workoutName} workout`, 'success');
    }
    
    /**
     * NEW: Delete workout type
     */
    async deleteWorkout(index) {
        const workoutName = this.workoutTypes[index];

        const confirmed = await utils.confirm(
            `"${workoutName}" and all of its recorded history will be removed. This cannot be undone.`,
            { title: 'Delete this workout?', confirmText: 'Delete', danger: true }
        );

        if (confirmed) {
            // Snapshot enough to put it back if the deletion was a mistake.
            const snapshot = {
                name: workoutName,
                index,
                state: this.workoutState[workoutName],
                count: this.workoutCounts[workoutName],
                history: {}
            };

            // Remove from workout types
            this.workoutTypes.splice(index, 1);
            this.saveWorkoutTypes();

            // Remove from state and counts
            delete this.workoutState[workoutName];
            delete this.workoutCounts[workoutName];

            // Remove from history, keeping what was removed
            Object.keys(this.workoutHistory).forEach(date => {
                const removed = this.workoutHistory[date].filter(entry => entry.type === workoutName);
                if (removed.length > 0) snapshot.history[date] = removed;

                this.workoutHistory[date] = this.workoutHistory[date].filter(entry => entry.type !== workoutName);
                if (this.workoutHistory[date].length === 0) {
                    delete this.workoutHistory[date];
                }
            });

            // Save updated data
            this.saveState();
            storageManager.writeJSON(this.historyKey, this.workoutHistory);

            // Update UI
            this.renderWorkoutTabs();
            this.renderWorkoutList();
            this.initializeWorkoutAnalytics(); // Refresh analytics dropdown
            this.refreshHistory();

            utils.showUndoToast(`Deleted ${workoutName}`, () => this.restoreWorkout(snapshot));
        }
    }

    /**
     * Put back a workout deleted by deleteWorkout(), history included.
     * @param {Object} snapshot
     */
    restoreWorkout(snapshot) {
        if (!snapshot || this.workoutTypes.includes(snapshot.name)) return;

        this.workoutTypes.splice(
            Math.min(snapshot.index, this.workoutTypes.length),
            0,
            snapshot.name
        );
        this.saveWorkoutTypes();

        this.workoutState[snapshot.name] = snapshot.state ||
            { completed: false, order: this.workoutTypes.indexOf(snapshot.name) };
        this.workoutCounts[snapshot.name] = snapshot.count || 0;

        Object.entries(snapshot.history).forEach(([date, entries]) => {
            if (!this.workoutHistory[date]) this.workoutHistory[date] = [];
            this.workoutHistory[date].push(...entries);
        });

        this.saveState();
        storageManager.writeJSON(this.historyKey, this.workoutHistory);

        this.renderWorkoutTabs();
        this.renderWorkoutList();
        this.initializeWorkoutAnalytics();
        this.refreshHistory();

        utils.showToast(`Restored ${snapshot.name}`, 'success');
    }
    
    /**
     * Render workout tabs in the container
     */
    renderWorkoutTabs() {
        if (!this.elements.tabsContainer) return;
        
        this.elements.tabsContainer.innerHTML = '';
        
        if (this.workoutTypes.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = `
                text-align: center;
                padding: var(--spacing-xl);
                color: var(--text-secondary);
            `;
            emptyMsg.innerHTML = `
                <p style="margin-bottom: var(--spacing-md);">No workouts added yet</p>
                <p style="font-size: 0.9rem;">Use "Manage Workouts" button to add your first workout</p>
            `;
            this.elements.tabsContainer.appendChild(emptyMsg);
            return;
        }
        
        // Sort workout types by completed status and then by order
        const sortedWorkouts = Object.entries(this.workoutState)
        .filter(([type]) => this.workoutTypes.includes(type)) // Only include current workout types
        .sort(([, a], [, b]) => {
            // Completed workouts go to the bottom
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            // Otherwise, maintain original order
            return a.order - b.order;
        })
        .map(([type]) => type);
        
        // Create tabs for each workout type
        sortedWorkouts.forEach(type => {
            const tab = document.createElement('button');
            tab.className = `workout-tab ${this.workoutState[type].completed ? 'completed' : ''}`;
            tab.dataset.type = type;
            
            const icon = document.createElement('i');
            icon.className = 'material-icons-round';
            icon.textContent = this.workoutState[type].completed ? 'check_circle' : 'radio_button_unchecked';
            
            const text = document.createElement('span');
            text.textContent = type;
            
            // Add count badge if clicked more than once
            if (this.workoutCounts[type] > 1) {
                const badge = document.createElement('span');
                badge.className = 'count-badge';
                badge.textContent = this.workoutCounts[type];
                tab.appendChild(badge);
            }
            
            tab.appendChild(icon);
            tab.appendChild(text);
            
            // Add click event
            tab.addEventListener('click', () => this.toggleWorkout(type));
            
            this.elements.tabsContainer.appendChild(tab);
        });
    }
    
    /**
     * Toggle workout completion status
     * @param {string} type - Workout type
     */
    toggleWorkout(type) {
        // The tabs exactly as they were, for Undo (see undoWorkoutTap).
        const snapshot = {
            state: JSON.parse(JSON.stringify(this.workoutState)),
            counts: { ...this.workoutCounts }
        };

        // Increase count. Guarded because an imported workout_state can name a
        // type that workout_count has no entry for, and undefined + 1 is NaN.
        this.workoutCounts[type] = (Number(this.workoutCounts[type]) || 0) + 1;

        if (!this.workoutState[type]) {
            this.workoutState[type] = { completed: false, order: this.workoutTypes.indexOf(type) };
        }

        // Update completion status
        this.workoutState[type].completed = true;

        // Record in history
        this.saveWorkoutHistory(type);

        // Check if all workouts are completed. Only current workout types
        // count - workoutState can retain stale keys from an import, and one
        // of those would keep this false forever.
        const allCompleted = this.workoutTypes.length > 0 &&
            this.workoutTypes.every(t => this.workoutState[t] && this.workoutState[t].completed);

        // Auto-reset is now optional.
        //
        // When it is on, finishing the set immediately clears every tab and
        // zeroes the counts - which means the count badge (shown at count > 1)
        // can never appear, and with a single workout the tab never even looks
        // ticked. Turning it off makes tapping an already-done workout log a
        // repeat, which is what the badge was built to show.
        if (allCompleted && this.isAutoResetEnabled()) {
            this.resetWorkoutTabs();
            utils.showUndoToast('All workouts done - tabs reset.', () => this.undoWorkoutTap(type, snapshot));
        } else {
            // Save state and update display
            this.saveState();
            this.renderWorkoutTabs();
            this.refreshHistory();

            // Counted from today's history. workoutCounts is the round's
            // count, and a round can span days - so "(2x today)" was shown
            // for a workout done once yesterday and once today.
            const today = this.workoutHistory[utils.getCurrentDate()] || [];
            const todayCount = today.filter(entry => entry.type === type).length;
            const suffix = todayCount > 1 ? ` (${todayCount}x today)` : '';
            utils.showUndoToast(`${type} logged${suffix}`, () => this.undoWorkoutTap(type, snapshot));
        }
    }

    /**
     * Whether finishing every workout clears the tabs automatically.
     * Defaults to on, preserving the previous behaviour.
     * @returns {boolean}
     */
    isAutoResetEnabled() {
        return localStorage.getItem(STORAGE_KEYS.WORKOUT_AUTORESET) !== 'false';
    }

    /**
     * Turn auto-reset on or off.
     * @param {boolean} enabled
     */
    setAutoResetEnabled(enabled) {
        localStorage.setItem(STORAGE_KEYS.WORKOUT_AUTORESET, enabled ? 'true' : 'false');
    }

    /**
     * Undo a workout tap: drop that tap's history entry and put the tabs and
     * counts back exactly as they were before it.
     *
     * The tabs describe the current round, which can span several days - a
     * workout ticked yesterday stays ticked until every one is done. Undo
     * used to rebuild them from TODAY's history alone, so it also unticked
     * everything done on earlier days, and undoing the tap that finished a
     * round left every tab blank instead of putting the round back.
     *
     * @param {string} type
     * @param {{state: Object, counts: Object}} snapshot - Taken just before the tap
     */
    undoWorkoutTap(type, snapshot) {
        const today = utils.getCurrentDate();
        const entries = this.workoutHistory[today] || [];

        // Find the last entry of this type and drop it.
        for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i].type === type) {
                entries.splice(i, 1);
                break;
            }
        }
        if (entries.length === 0) {
            delete this.workoutHistory[today];
        }
        storageManager.writeJSON(this.historyKey, this.workoutHistory);

        // Merged rather than replaced, so a workout added since the tap keeps
        // its tab.
        this.workoutState = { ...this.workoutState, ...snapshot.state };
        this.workoutCounts = { ...this.workoutCounts, ...snapshot.counts };

        this.saveState();
        this.renderWorkoutTabs();
        this.refreshHistory();

        utils.showToast(`${type} tap undone`, 'info');
    }
    
    /**
     * Save the current state to localStorage
     */
    saveState() {
        storageManager.writeJSON(this.stateKey, this.workoutState);
        storageManager.writeJSON(this.countKey, this.workoutCounts);
    }
    
    /**
     * Reset workout tabs (but keep history)
     */
    resetWorkoutTabs() {
        // Reset workout state
        this.workoutTypes.forEach(type => {
            if (this.workoutState[type]) {
                this.workoutState[type].completed = false;
                this.workoutState[type].order = this.workoutTypes.indexOf(type);
            }
        });
        
        // Reset workout counts
        this.workoutTypes.forEach(type => {
            this.workoutCounts[type] = 0;
        });
        
        // Save and update display
        this.saveState();
        this.renderWorkoutTabs();
        this.refreshHistory();
    }
    
    /**
     * Save workout to daily history
     * @param {string} type - Workout type
     */
    saveWorkoutHistory(type) {
        const currentDate = utils.formatDate(new Date());
        
        if (!this.workoutHistory[currentDate]) {
            this.workoutHistory[currentDate] = [];
        }
        
        this.workoutHistory[currentDate].push({
            type,
            count: this.workoutCounts[type],
            timestamp: new Date().toISOString()
        });
        
        storageManager.writeJSON(this.historyKey, this.workoutHistory);
    }
    
    /**
     * Refresh history displays
     */
    refreshHistory() {
        // NOTE: there was also a showCurrentWorkouts() here, rendering into
        // #workout-current-exercises. That element does not exist in the markup
        // (the workout history panel only has Daily Summary and Analytics), so
        // the method never rendered anything. Removed along with the method.

        // The Daily Summary lists every day ever logged, so it is only drawn
        // while the history panel is open; opening the panel draws it. It
        // used to be rebuilt behind a closed panel on every workout tap.
        if (this.isHistoryOpen()) this.showDailyHistory();
        this.renderWorkoutAnalytics();
    }

    /**
     * Whether the history panel is showing.
     * @returns {boolean}
     */
    isHistoryOpen() {
        return !!this.elements.historyPanel && this.elements.historyPanel.classList.contains('active');
    }
    
  /**
 * Enhanced showDailyHistory method with simple workout type filtering
 * Add this to the WorkoutTracker class in workouts-scripts.js
 */

/**
 * Show daily history with workout type filtering (simplified version)
 */
showDailyHistory() {
    if (!this.elements.dailyHistoryTab) return;
    
    this.elements.dailyHistoryTab.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    // Create simple filter dropdown
    const filterContainer = document.createElement('div');
    filterContainer.style.cssText = `
        margin-bottom: var(--spacing-md);
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
    `;
    
    // Workout type filter label
    const filterLabel = document.createElement('label');
    filterLabel.textContent = 'Filter by type:';
    filterLabel.style.cssText = `
        font-size: 0.9rem;
        color: var(--text-secondary);
        font-weight: 500;
    `;
    
    // Workout type filter
    const workoutSelect = document.createElement('select');
    workoutSelect.id = 'workout-type-filter';
    workoutSelect.style.cssText = `
        padding: var(--spacing-sm) var(--spacing-md);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--card-bg);
        color: var(--text-primary);
        font-size: 0.9rem;
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23F39C12' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
        background-position: right 8px center;
        background-repeat: no-repeat;
        background-size: 12px;
        padding-right: 32px;
        min-width: 150px;
    `;
    
    // Add options to workout select
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Workouts';
    workoutSelect.appendChild(allOption);
    
    this.workoutTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        workoutSelect.appendChild(option);
    });

    // This dropdown is rebuilt on every refresh, so restore the previous
    // choice - otherwise the filter snapped back to "All Workouts" every time
    // a workout was tapped.
    const savedFilter = this.selectedHistoryFilter || 'all';
    workoutSelect.value = Array.from(workoutSelect.options)
        .some(option => option.value === savedFilter) ? savedFilter : 'all';

    filterContainer.appendChild(filterLabel);
    filterContainer.appendChild(workoutSelect);
    fragment.appendChild(filterContainer);
    
    // History container
    const historyContainer = document.createElement('div');
    historyContainer.id = 'workout-filtered-history';
    fragment.appendChild(historyContainer);
    
    // Function to apply filters and render history
    const renderFilteredHistory = () => {
        const selectedType = workoutSelect.value;
        
        historyContainer.innerHTML = '';
        
        // Get all dates sorted (most recent first)
        let dates = Object.keys(this.workoutHistory).sort((a, b) => b.localeCompare(a));
        
        // Filter out empty days and apply workout type filter
        const filteredDates = dates.filter(date => {
            const entries = this.workoutHistory[date] || [];
            
            // Skip days with no workouts
            if (entries.length === 0) return false;
            
            // If specific workout type selected, check if that type was done
            if (selectedType !== 'all') {
                return entries.some(entry => entry.type === selectedType);
            }
            
            return true;
        });
        
        // Render filtered history using original simple layout
        if (filteredDates.length === 0) {
            const noData = document.createElement('p');
            noData.textContent = 'No workout history available.';
            historyContainer.appendChild(noData);
        } else {
            filteredDates.forEach(date => {
                const entries = this.workoutHistory[date];
                
                const dayEntry = document.createElement('div');
                dayEntry.className = 'day-entry';

                // Date line, with the pencil that opens this day for editing.
                const header = document.createElement('div');
                header.className = 'day-entry-header';

                const dateText = document.createElement('b');
                dateText.textContent = date;
                header.appendChild(dateText);

                header.appendChild(createHistoryEditButton(
                    `Edit workouts for ${date}`,
                    () => this.openDayEditor(date)
                ));
                dayEntry.appendChild(header);
                
                // Filter entries by selected type if applicable
                let displayEntries = entries;
                if (selectedType !== 'all') {
                    displayEntries = entries.filter(entry => entry.type === selectedType);
                }
                
                // Group workouts by type (original logic)
                const workoutsByType = {};
                displayEntries.forEach(entry => {
                    if (!workoutsByType[entry.type]) {
                        workoutsByType[entry.type] = 0;
                    }
                    workoutsByType[entry.type] += 1;
                });
                
                // Show workout summary (original format)
                const workoutSummary = document.createElement('p');
                const typeCount = Object.keys(workoutsByType).length;
                workoutSummary.textContent = `Completed workouts: ${typeCount} ${typeCount === 1 ? 'type' : 'types'}`;
                dayEntry.appendChild(workoutSummary);
                
                // List each workout type (original format)
                const workoutList = document.createElement('ul');
                workoutList.style.paddingLeft = '20px';
                workoutList.style.marginTop = '5px';
                
                Object.entries(workoutsByType).forEach(([type, count]) => {
                    const workoutItem = document.createElement('li');
                    workoutItem.textContent = `${type}: ${count} ${count === 1 ? 'time' : 'times'}`;
                    workoutList.appendChild(workoutItem);
                });
                
                dayEntry.appendChild(workoutList);
                historyContainer.appendChild(dayEntry);
            });
        }
    };
    
    // Event listener for filter
    workoutSelect.addEventListener('change', () => {
        // Remember the choice so the next refresh does not discard it.
        this.selectedHistoryFilter = workoutSelect.value;
        renderFilteredHistory();
    });

    // Initial render
    renderFilteredHistory();

    // Only fill in the content - which tab is showing is the user's choice.
    this.elements.dailyHistoryTab.appendChild(fragment);
}
    
    /**
     * Check if daily workouts need to be reset
     */
    checkAndResetDailyWorkouts() {
        const currentDate = utils.formatDate(new Date());
        const lastResetDate = localStorage.getItem(this.lastResetKey);
        
        // Only record the date check, but don't reset unless all workouts are completed
        if (lastResetDate !== currentDate) {
            // Just update the last reset date without resetting workouts
            localStorage.setItem(this.lastResetKey, currentDate);
            
            this.preserveTodaysWorkoutData();
        }
    }
    
    /**
     * Helper function to preserve workout data across days
     */
    preserveTodaysWorkoutData() {
        // Instead of removing today's history, we'll keep what we have
        // and just update the internal tracking date
        const currentDate = utils.formatDate(new Date());
        
        // Make sure current date's data structure exists
        if (!this.workoutHistory[currentDate]) {
            this.workoutHistory[currentDate] = [];
            storageManager.writeJSON(this.historyKey, this.workoutHistory);
        }
    }

    /**
     * Setup automatic reset at midnight
     */
    setupMidnightReset() {
        // Clear any existing timeout so repeated calls cannot stack timers
        if (this.midnightResetTimeout) {
            clearTimeout(this.midnightResetTimeout);
        }

        // Calculate time until next midnight
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const midnight = new Date(tomorrow.setHours(0, 0, 0, 0));
        const msUntilMidnight = midnight - now;

        // Set timeout for midnight reset. This only fires while the page is
        // alive; initializeDayRolloverWatch() in core-scripts.js covers the
        // case where the app was backgrounded across midnight.
        this.midnightResetTimeout = setTimeout(() => {
            this.checkAndResetDailyWorkouts();
            // Moves an open graph and calendar on to the new day.
            this.refreshHistory();
            this.setupMidnightReset(); // Set up next day's reset
        }, msUntilMidnight);
    }
    
    /**
     * Reset daily workouts and remove today's history
     */
    resetDailyWorkouts() {
        // Reset workout tabs
        this.resetWorkoutTabs();
        
        // Remove today's history
        const currentDate = utils.formatDate(new Date());
        if (this.workoutHistory[currentDate]) {
            delete this.workoutHistory[currentDate];
            storageManager.writeJSON(this.historyKey, this.workoutHistory);
        }
    }
    
    /**
     * Reset all data for this tracker
     */
    resetAllData() {
        localStorage.removeItem(this.stateKey);
        localStorage.removeItem(this.countKey);
        localStorage.removeItem(this.historyKey);
        localStorage.removeItem(this.workoutTypesKey); // NEW: Also remove custom workout types
        localStorage.removeItem(this.lastResetKey);
        
        utils.showToast('All workout tracking data has been reset.', 'warning');
        
        // Reload the page to reset all instances
        setTimeout(() => location.reload(), 1500);
    }
    
    /**
     * Update display
     */
    updateDisplay() {
        this.renderWorkoutTabs();
        this.refreshHistory();
    }

    /**
     * Initialize workout analytics
     */
    initializeWorkoutAnalytics() {
        // Populate workout type options in dropdown
        if (this.elements.viewTypeSelect) {
            const previousSelection = this.elements.viewTypeSelect.value;

            // Clear any existing options after the first two (All and Comparison)
            while (this.elements.viewTypeSelect.options.length > 2) {
                this.elements.viewTypeSelect.remove(2);
            }

            // Add individual workout options.
            // The value is the workout name verbatim. It used to be lowercased
            // and then title-cased back when reading it, which only round-trips
            // for single lowercase words - "Push Ups" came back as "Push ups"
            // and matched nothing, so the chart and streaks read as all zeros.
            this.workoutTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                this.elements.viewTypeSelect.appendChild(option);
            });

            // Restore the selection if that workout still exists.
            const stillExists = Array.from(this.elements.viewTypeSelect.options)
                .some(option => option.value === previousSelection);
            this.elements.viewTypeSelect.value = stillExists ? previousSelection : 'all';
            this.selectedWorkoutView = this.elements.viewTypeSelect.value;
        }

        // Bind the dropdowns once. This method is re-run whenever a workout is
        // added or deleted (to refresh the options), and re-adding the
        // listeners each time meant one change event fired N renders.
        if (!this.analyticsListenersBound) {
            if (this.elements.viewTypeSelect) {
                this.elements.viewTypeSelect.addEventListener('change', (e) => {
                    this.selectedWorkoutView = e.target.value;
                    this.renderWorkoutAnalytics();
                });
            }

            if (this.elements.timePeriodSelect) {
                this.elements.timePeriodSelect.addEventListener('change', (e) => {
                    this.selectedTimePeriod = e.target.value;
                    this.renderWorkoutAnalytics();
                });
            }

            // Draw the analytics when they are actually revealed. Rendering is
            // skipped while the panel is closed, so these are what make the
            // chart appear.
            const historyToggle = document.getElementById('workout-history-toggle');
            if (historyToggle) {
                historyToggle.addEventListener('click', () => this.renderAnalyticsIfVisible(true));
            }

            const analyticsTab = document.querySelector('[data-tab="workout-analytics"]');
            if (analyticsTab) {
                analyticsTab.addEventListener('click', () => this.renderAnalyticsIfVisible());
            }

            this.initializeMissedWorkout();
            this.initializeCalendar();

            this.analyticsListenersBound = true;
        }

        // Initialize view
        this.renderWorkoutAnalytics();
    }
    
    /**
     * Render workout analytics (graph and streaks)
     */
    renderWorkoutAnalytics() {
        const chartContainer = this.elements.workoutChart;

        // Skip entirely while the analytics panel is off screen.
        //
        // This is called from refreshHistory(), so it ran on every workout tap
        // - and the old "retry in 100ms" fallback below never stopped, because
        // a closed panel is never going to gain a width on its own. Each tap
        // started another parallel loop on top of the last, so the app sat
        // there recomputing consistency scores hundreds of times a second
        // forever, for a chart nobody was looking at.
        if (chartContainer && chartContainer.offsetWidth === 0) return;

        this.renderWorkoutGraph();
        this.renderWorkoutStreaks();
        this.renderWorkoutCalendar();
    }

    /**
     * Set up the History calendar and its pencil. Bound once, from
     * initializeWorkoutAnalytics' one-time block.
     */
    initializeCalendar() {
        const content = this.elements.calendarContent;
        if (!content) return;

        this.calendarStrip = new MonthCalendarStrip({
            content,
            decorateCell: (cell, dateKey, isFuture) => this.decorateCalendarCell(cell, dateKey, isFuture)
        });

        if (this.elements.calendarEditButton) {
            this.elements.calendarEditButton.addEventListener('click', () => this.toggleCalendarEdit());
        }

        // Day taps, for every month the strip ever holds - including ones
        // added later by Load More.
        content.addEventListener('click', (e) => {
            if (!this.isCalendarEditing) return;
            const cell = e.target.closest('.habits-calendar-cell.editable');
            if (!cell || !cell.dataset.dateKey) return;
            this.showMissedWorkoutModal(cell.dataset.dateKey, 'Edit Workouts');
        });
    }

    /**
     * Mark up one calendar day: filled in on days with a workout (the one
     * picked in the view dropdown, or any for All / Comparison), and tappable
     * while edit mode is on.
     *
     * @param {Element} cell
     * @param {string} dateKey
     * @param {boolean} isFuture
     */
    decorateCalendarCell(cell, dateKey, isFuture) {
        const type = this.selectedWorkoutView === 'all' || this.selectedWorkoutView === 'comparison'
            ? null
            : this.selectedWorkoutView;

        if (this.didWorkout(dateKey, type)) {
            cell.classList.add('active');
            cell.style.backgroundColor = this.getWorkoutColor(type);
        }

        if (this.isCalendarEditing && !isFuture) {
            cell.classList.add('editable');
        }
    }

    /**
     * Draw the calendar, or repaint it if it is already drawn.
     *
     * Repainting keeps the months loaded and where it is scrolled, so a
     * workout logged or edited while it is open does not throw the view back
     * to the current month.
     *
     * @param {boolean} [rebuild] - Start over from the current month
     */
    renderWorkoutCalendar(rebuild = false) {
        if (!this.calendarStrip) return;

        // Also rebuilt when left open into a new month, which it would
        // otherwise not show until reopened.
        if (rebuild || !this.calendarStrip.isBuilt || !this.calendarStrip.isCurrent) {
            this.calendarStrip.render();
        } else {
            this.calendarStrip.refresh();
        }
    }

    /**
     * Switch calendar edit mode on or off. While on, tapping a past day opens
     * it in the Add Missed Workout window, titled "Edit Workouts", to add or
     * remove workouts.
     *
     * @param {boolean} [on] - Force a state; toggles when omitted
     */
    toggleCalendarEdit(on) {
        this.isCalendarEditing = typeof on === 'boolean' ? on : !this.isCalendarEditing;

        if (this.elements.calendarEditButton) {
            this.elements.calendarEditButton.classList.toggle('active', this.isCalendarEditing);
        }

        if (this.calendarStrip && this.calendarStrip.isBuilt) this.calendarStrip.refresh();
    }

    /**
     * Whether a workout was logged on a day.
     *
     * @param {string} dateKey
     * @param {string|null} type - A workout name, or null for any workout
     * @returns {boolean}
     */
    didWorkout(dateKey, type) {
        const entries = this.workoutHistory[dateKey] || [];
        return type ? entries.some(entry => entry.type === type) : entries.length > 0;
    }

    /**
     * Draw the analytics if they are on screen.
     *
     * Called when the panel or the Analytics tab is opened. A ResizeObserver
     * looks like the natural fit here but is not: an element inside a
     * display:none ancestor has no box to observe, and going from hidden to
     * shown does not reliably deliver a callback - so the chart simply never
     * drew. Hooking the events that reveal it is both simpler and dependable.
     *
     * @param {boolean} [withSummary] - Also draw the Daily Summary (opening
     *   the panel, as opposed to switching to the Analytics tab)
     */
    renderAnalyticsIfVisible(withSummary = false) {
        // Deferred past the current task, because this handler is registered
        // before the one that actually opens the panel - so at click time the
        // chart still has no width.
        //
        // setTimeout rather than requestAnimationFrame: rAF does not fire
        // while the page is not being rendered, which would leave the chart
        // blank on a backgrounded or non-compositing tab.
        setTimeout(() => {
            // Opening the panel also draws the Daily Summary, which is not
            // kept up to date while the panel is closed (see refreshHistory).
            if (withSummary && this.isHistoryOpen()) this.showDailyHistory();

            if (this.elements.workoutChart && this.elements.workoutChart.offsetWidth > 0) {
                this.renderWorkoutGraph();
                this.renderWorkoutStreaks();

                // Opened afresh: the calendar starts at the current month,
                // with edit mode off - as the habit calendar does.
                this.isCalendarEditing = false;
                if (this.elements.calendarEditButton) {
                    this.elements.calendarEditButton.classList.remove('active');
                }
                this.renderWorkoutCalendar(true);
            }
        }, 0);
    }


    
    /**
     * Render workout graph: calendar bars (chartUtils.renderCompletionBars),
     * or one line per workout for "All Comparison".
     */
    renderWorkoutGraph() {
        const chartContainer = this.elements.workoutChart;
        if (!chartContainer) return;

        // Still off screen - renderAnalyticsIfVisible() will draw it when the
        // panel is opened.
        if (chartContainer.offsetWidth === 0) return;

        const summaryEl = document.getElementById('workout-chart-summary');
        const captionEl = document.getElementById('workout-chart-caption');
        const period = this.selectedTimePeriod;
        const config = chartUtils.BUCKETS[period] || chartUtils.BUCKETS.weekly;

        // Days before the first workout ever logged are not counted, so the
        // graph does not open with months of 0% from before tracking began.
        // Nothing logged yet: count from today.
        const firstKey = Object.keys(this.workoutHistory).sort()[0] || utils.getCurrentDate();

        if (this.selectedWorkoutView === 'comparison') {
            // Several workouts side by side would be unreadable as bars, so
            // this stays one line per workout - over the same calendar
            // buckets as the bars, minus any from before tracking began.
            // Points take the bars' own label, so both views read the same -
            // except under two-row labels (Monthly), whose "14" needs its
            // month on a second row a line does not have: there they take
            // the stand-alone "14 Sep".
            //
            // Every line must keep the same points, so they share x
            // positions. Buckets from before tracking began are null for
            // every type and dropped; the current one is kept even if null
            // for some types (today counts only once done), and the line
            // simply stops short of it.
            const series = this.workoutTypes.map(type => chartUtils.buildBuckets(
                dateKey => this.didWorkout(dateKey, type), period, firstKey
            ));
            const lastIndex = config.count - 1;
            const keep = (bucket, index) => index === lastIndex ||
                series.some(buckets => buckets[index].value !== null);
            const byType = {};
            this.workoutTypes.forEach((type, typeIndex) => {
                byType[type] = series[typeIndex]
                    .filter(keep)
                    .map(bucket => ({
                        ...bucket,
                        label: config.axis === 'twoRow' ? bucket.fullLabel : bucket.label,
                        bubble: `${type} · ${bucket.bubble}`
                    }));
            });
            this.renderComparisonChart(byType, chartContainer, config.labelGap);
            // No single figure makes sense across several workouts.
            chartUtils.renderSummary(summaryEl, config.range, null, 'days trained');
            if (captionEl) {
                const unit = { day: 'one day', week: 'one week (Mon–Sun)', month: 'one calendar month' }[config.unit];
                captionEl.textContent = `Each point = ${unit}. The last point is still in progress.`;
            }
            return;
        }

        const type = this.selectedWorkoutView === 'all' ? null : this.selectedWorkoutView;

        chartUtils.renderCompletionBars({
            chart: chartContainer,
            labels: this.elements.chartLabels,
            summary: summaryEl,
            caption: captionEl,
            isDone: dateKey => this.didWorkout(dateKey, type),
            period,
            firstKey,
            color: this.getWorkoutColor(type),
            noun: type ? `days with ${type}` : 'days trained'
        });
    }

    /**
     * Overlay one line per workout type, with a legend.
     *
     * @param {number} [labelGap] - The period's label gap, so the bottom
     *   labels match its bar graph's (chartUtils.BUCKETS)
     */
    renderComparisonChart(seriesByType, container, labelGap) {
        const types = Object.keys(seriesByType);
        if (types.length === 0) return;

        // Draw the first type through the shared renderer to lay down the
        // grid, axes and labels, then overlay the rest onto the same SVG so
        // every line shares one coordinate system.
        chartUtils.renderLineChart({
            chart: container,
            labels: this.elements.chartLabels,
            dataPoints: seriesByType[types[0]],
            color: this.getWorkoutColor(types[0], 0),
            labelGap
        });

        const svg = container.querySelector('svg');
        if (!svg) return;

        const { padLeft, padRight, padTop, padBottom } = chartUtils.GEOMETRY;
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        const plotWidth = Math.max(1, width - padLeft - padRight);
        const plotHeight = Math.max(1, height - padTop - padBottom);
        const NS = 'http://www.w3.org/2000/svg';

        const legend = document.createElement('div');
        legend.className = 'workout-chart-legend';

        types.forEach((type, typeIndex) => {
            const color = this.getWorkoutColor(type, typeIndex);
            const points = seriesByType[type];

            if (typeIndex > 0) {
                // y null: not done yet today - no point, and the line stops.
                const coords = points.map((point, i) => ({
                    x: points.length === 1
                        ? padLeft + plotWidth / 2
                        : padLeft + (i / (points.length - 1)) * plotWidth,
                    y: point.value === null
                        ? null
                        : padTop + (1 - Math.min(point.value, 100) / 100) * plotHeight
                }));

                const path = document.createElementNS(NS, 'path');
                path.setAttribute('d', chartUtils.buildLinePath(coords));
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', color);
                path.setAttribute('stroke-width', '2.5');
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                svg.appendChild(path);

                coords.forEach(coord => {
                    if (coord.y === null) return;
                    const dot = document.createElementNS(NS, 'circle');
                    dot.setAttribute('cx', coord.x);
                    dot.setAttribute('cy', coord.y);
                    dot.setAttribute('r', '4');
                    dot.setAttribute('fill', color);
                    svg.appendChild(dot);
                });
            }

            const item = document.createElement('div');
            item.className = 'workout-legend-item';

            const swatch = document.createElement('span');
            swatch.className = 'workout-color-swatch';
            swatch.style.backgroundColor = color;

            const name = document.createElement('span');
            name.textContent = type;

            item.appendChild(swatch);
            item.appendChild(name);
            legend.appendChild(item);
        });

        container.appendChild(legend);
    }
    

    

    

    

    

    

    
    /**
     * Get color for workout
     * @param {string} type - Workout type (optional)
     * @param {number} index - Index for color selection (optional)
     * @returns {string} - Color hex code
     */
    getWorkoutColor(type, index) {
        // Predefined color palette for different workout types
        const colors = [
            '#FF5042', // coral (chest)
            '#5B6EF7', // royalblue (back)
            '#B96CDA', // purple (shoulders)
            '#58B5F0', // skyblue (biceps)
            '#4AD6B8', // seagreen (triceps)
            '#FF7B29', // tangerine (abs)
            '#4CAF50', // green (legs)
            '#FFD54F', // amber (extra)
            '#9C27B0', // purple (extra)
            '#FF9800', // orange (extra)
            '#795548', // brown (extra)
            '#607D8B'  // blue grey (extra)
        ];
        
        // If specific workout type is provided
        if (type) {
            const typeIndex = this.workoutTypes.indexOf(type);
            if (typeIndex >= 0) {
                return colors[typeIndex % colors.length];
            }
            return colors[index % colors.length];
        }
        
        // Default workout color (if no type provided)
        return '#4CAF50'; // workout primary color
    }
    
    /**
     * Calculate and render workout streaks
     */
    renderWorkoutStreaks() {
        if (!this.elements.workoutStreaks) return;
        
        this.elements.workoutStreaks.innerHTML = '';
        
        // Calculate streaks based on consistency
        const streaks = this.calculateWorkoutStreaks();
        
        // Show top 3 streaks
        const topStreaks = streaks.slice(0, 3);
        
        if (topStreaks.length === 0) {
            const noStreaks = document.createElement('p');
            noStreaks.textContent = 'No streaks recorded yet.';
            this.elements.workoutStreaks.appendChild(noStreaks);
            return;
        }
        
        // Create streak bars
        topStreaks.forEach(streak => {
            const streakBar = document.createElement('div');
            streakBar.className = 'workout-streak-bar';
            
            const dateRange = document.createElement('div');
            dateRange.className = 'workout-streak-date';
            dateRange.textContent = utils.formatStreakDates(streak.start, streak.end);

            const streakVisual = document.createElement('div');
            streakVisual.className = `workout-streak-visual`;
            const days = utils.formatDayCount(streak.length);

            // Set color based on workout type if available
            if (streak.type) {
                const typeIndex = this.workoutTypes.indexOf(streak.type);
                streakVisual.style.backgroundColor = this.getWorkoutColor(streak.type, typeIndex);

                // Add type name for comparison view
                streakVisual.textContent = this.selectedWorkoutView === 'comparison'
                    ? `${streak.type}: ${days}`
                    : days;
            } else {
                streakVisual.textContent = days;
            }
            
            streakBar.appendChild(dateRange);
            streakBar.appendChild(streakVisual);
            
            this.elements.workoutStreaks.appendChild(streakBar);
        });
    }
    
    /**
     * Calculate workout streaks based on consistency
     * @returns {Array} Array of streak objects
     */
    calculateWorkoutStreaks() {
        // Get all workout dates in ascending order
        const sortedDates = Object.keys(this.workoutHistory).sort();
        const streaks = [];
        
        if (this.selectedWorkoutView === 'all') {
            // Calculate streaks for any workout
            let currentStreak = null;
            
            sortedDates.forEach(date => {
                const entries = this.workoutHistory[date];
                if (!entries || entries.length === 0) {
                    // No workouts on this day, end streak
                    if (currentStreak && currentStreak.length > 1) {
                        streaks.push(currentStreak);
                    }
                    currentStreak = null;
                    return;
                }
                
                if (!currentStreak) {
                    // Start new streak
                    currentStreak = { start: date, end: date, length: 1 };
                } else {
                    // Check if this date is consecutive
                    const lastDate = utils.parseDateKey(currentStreak.end);
                    const nextDay = new Date(lastDate);
                    nextDay.setDate(lastDate.getDate() + 1);
                    const currentDate = utils.parseDateKey(date);
                    
                    if (currentDate.getTime() === nextDay.getTime()) {
                        // Consecutive day, extend streak
                        currentStreak.end = date;
                        currentStreak.length++;
                    } else {
                        // Non-consecutive, save streak and start new one.
                        // A streak is 2+ days, as everywhere else here - a
                        // lone day used to slip through this branch only.
                        if (currentStreak.length > 1) streaks.push(currentStreak);
                        currentStreak = { start: date, end: date, length: 1 };
                    }
                }
            });
            
            // Add final streak if exists
            if (currentStreak && currentStreak.length > 1) {
                streaks.push(currentStreak);
            }
            
        } else if (this.selectedWorkoutView === 'comparison') {
            // Show top streak for each workout type
            this.workoutTypes.forEach(type => {
                const typeStreak = this.calculateWorkoutTypeStreak(type);
                if (typeStreak && typeStreak.length > 1) {
                    streaks.push({
                        ...typeStreak,
                        type: type
                    });
                }
            });
            
        } else {
            // Individual workout type - the dropdown value is the stored name.
            const typeStreaks = this.calculateAllWorkoutTypeStreaks(this.selectedWorkoutView);
            streaks.push(...typeStreaks);
        }
        
        return streaks.sort((a, b) => b.length - a.length);
    }
    
    /**
     * Calculate streaks for specific workout type
     * @param {string} type - Workout type
     * @returns {Object|null} Best streak object or null
     */
    calculateWorkoutTypeStreak(type) {
        const sortedDates = Object.keys(this.workoutHistory).sort();
        let bestStreak = null;
        let currentStreak = null;
        
        sortedDates.forEach(date => {
            const entries = this.workoutHistory[date] || [];
            const hasWorkout = entries.some(entry => entry.type === type);
            
            if (!hasWorkout) {
                // No workout of this type, end streak
                if (currentStreak && currentStreak.length > 1) {
                    if (!bestStreak || currentStreak.length > bestStreak.length) {
                        bestStreak = currentStreak;
                    }
                }
                currentStreak = null;
                return;
            }
            
            if (!currentStreak) {
                // Start new streak
                currentStreak = { start: date, end: date, length: 1 };
            } else {
                // Check if consecutive
                const lastDate = utils.parseDateKey(currentStreak.end);
                const nextDay = new Date(lastDate);
                nextDay.setDate(lastDate.getDate() + 1);
                const currentDate = utils.parseDateKey(date);
                
                if (currentDate.getTime() === nextDay.getTime()) {
                    // Consecutive, extend streak
                    currentStreak.end = date;
                    currentStreak.length++;
                } else {
                    // Non-consecutive, save if best (and 2+ days)
                    if (currentStreak.length > 1 &&
                        (!bestStreak || currentStreak.length > bestStreak.length)) {
                        bestStreak = currentStreak;
                    }
                    currentStreak = { start: date, end: date, length: 1 };
                }
            }
        });
        
        // Check final streak
        if (currentStreak && currentStreak.length > 1) {
            if (!bestStreak || currentStreak.length > bestStreak.length) {
                bestStreak = currentStreak;
            }
        }
        
        return bestStreak;
    }
    
    /**
     * Calculate all streaks for a specific workout type
     * @param {string} type - Workout type
     * @returns {Array} Array of streak objects
     */
    calculateAllWorkoutTypeStreaks(type) {
        const sortedDates = Object.keys(this.workoutHistory).sort();
        const streaks = [];
        let currentStreak = null;
        
        sortedDates.forEach(date => {
            const entries = this.workoutHistory[date] || [];
            const hasWorkout = entries.some(entry => entry.type === type);
            
            if (!hasWorkout) {
                // No workout of this type, end streak
                if (currentStreak && currentStreak.length > 1) {
                    streaks.push(currentStreak);
                }
                currentStreak = null;
                return;
            }
            
            if (!currentStreak) {
                // Start new streak
                currentStreak = { start: date, end: date, length: 1 };
            } else {
                // Check if consecutive
                const lastDate = utils.parseDateKey(currentStreak.end);
                const nextDay = new Date(lastDate);
                nextDay.setDate(lastDate.getDate() + 1);
                const currentDate = utils.parseDateKey(date);
                
                if (currentDate.getTime() === nextDay.getTime()) {
                    // Consecutive, extend streak
                    currentStreak.end = date;
                    currentStreak.length++;
                } else {
                    // Non-consecutive, save (if 2+ days) and start new
                    if (currentStreak.length > 1) streaks.push(currentStreak);
                    currentStreak = { start: date, end: date, length: 1 };
                }
            }
        });
        
        // Add final streak if exists
        if (currentStreak && currentStreak.length > 1) {
            streaks.push(currentStreak);
        }
        
        return streaks;
    }
}