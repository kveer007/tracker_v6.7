/**
 * Health Tracker App - Reminders Management System (UPDATED)
 * 
 * FEATURES:
 * - Goal alerts without time windows (daily check only)
 * - Interval reminders with active hours only
 * - Multiple times support for custom reminders
 * - Manual expansion for system notifications
 * - Inline toggles for custom reminders
 * - FIXED: Expand button positioning to prevent overlap with toggle
 */

// The longest a reminder timer waits before re-checking (one day). See
// scheduleCustomReminder: setTimeout fires at once past ~24.8 days.
const REMINDER_MAX_WAIT_MS = 24 * 60 * 60 * 1000;

class RemindersManager {
  constructor() {
    // Configuration
    this.remindersKey = 'reminders_data';
    this.currentView = 'main';
    this.editingReminderId = null;
    this.activeTimers = new Map();
    this.intervalTimers = new Map();
    
    // NEW: Track expansion state of system notifications
    this.expandedSystemNotifications = new Set();
    
    // Legacy notification keys for migration
    this.legacyNotificationKeys = {
      global: 'notifications_enabled',
      waterAlert: 'notification_water',
      waterInterval: 'notification_water_interval_enabled',
      proteinAlert: 'notification_protein'
    };
    
    // Default data structure - only 4 specific notification types
    this.defaultData = {
      globalEnabled: false,
      systemNotifications: {
        waterAlert: {
          enabled: false,
          time: "20:00",
          days: [],
          onlyIfGoalNotMet: true,
          message: "Don't forget your daily water goal!"
        },
        waterInterval: {
          enabled: false,
          interval: 120,
          activeWindow: { start: "08:00", end: "22:00" },
          days: [],
          onlyIfBelowGoal: true,
          message: "Time to drink water!"
        },
        proteinAlert: {
          enabled: false,
          time: "20:00",
          days: [],
          onlyIfGoalNotMet: true,
          message: "Check your protein intake for today"
        },
        proteinInterval: {
          enabled: false,
          interval: 120,
          activeWindow: { start: "08:00", end: "22:00" },
          days: [],
          onlyIfBelowGoal: true,
          message: "Time to get your protein!"
        }
      },
      customReminders: []
    };
    
    // Initialize
    this.loadData();
    this.initializeElements();
    this.initializeEventListeners();
    this.migrateFromLegacyNotifications();
    this.scheduleAllReminders();
    
    console.log('RemindersManager initialized successfully');
    console.log('Initial data:', this.data);
  }
  
  /**
   * Load reminders data from localStorage
   */
  loadData() {
    try {
      const stored = localStorage.getItem(this.remindersKey);
      if (stored) {
        // Deep copy the defaults. A spread is shallow, so
        // this.data.systemNotifications used to BE defaultData.systemNotifications
        // - every settings change mutated the defaults, and any later fallback
        // to them handed back the user's edited state instead of a clean slate.
        this.data = { ...this.cloneDefaults(), ...JSON.parse(stored) };

        // Ensure all system notifications exist with proper structure
        this.data.systemNotifications = {
          ...this.cloneDefaults().systemNotifications,
          ...this.data.systemNotifications
        };
        
        // Clean up any invalid notification types
        const validTypes = ['waterAlert', 'waterInterval', 'proteinAlert', 'proteinInterval'];
        Object.keys(this.data.systemNotifications).forEach(key => {
          if (!validTypes.includes(key)) {
            delete this.data.systemNotifications[key];
          } else {
            // Ensure days array exists
            if (!Array.isArray(this.data.systemNotifications[key].days)) {
              this.data.systemNotifications[key].days = [];
            }
            // Add activeWindow only for interval types
            if (key.includes('Interval') && !this.data.systemNotifications[key].activeWindow) {
              this.data.systemNotifications[key].activeWindow = { start: "08:00", end: "22:00" };
            }
            // Remove activeWindow from alert types (they don't need it)
            if (key.includes('Alert') && this.data.systemNotifications[key].activeWindow) {
              delete this.data.systemNotifications[key].activeWindow;
            }
          }
        });
        
        // Ensure custom reminders have proper structure
        this.data.customReminders.forEach(reminder => {
          if (!reminder.activeWindow) {
            reminder.activeWindow = { start: "00:00", end: "23:59" };
          }
          // Convert single time to times array if needed
          if (reminder.time && !reminder.times) {
            reminder.times = [reminder.time];
            delete reminder.time;
          }
          if (!reminder.times || !Array.isArray(reminder.times)) {
            reminder.times = ['12:00'];
          }
          // alerts was not normalised here, so an imported or hand-edited
          // reminder without it threw inside scheduleCustomReminder - and
          // because that throw escaped scheduleAllReminders, every reminder
          // after it in the list was silently lost too.
          if (!Array.isArray(reminder.alerts) || reminder.alerts.length === 0) {
            reminder.alerts = [0];
          }
          if (!reminder.repeat) {
            reminder.repeat = 'daily';
          }
          if (!Array.isArray(reminder.days)) {
            reminder.days = [];
          }
        });
      } else {
        this.data = this.cloneDefaults();
      }
      console.log('Loaded reminders data:', this.data);
    } catch (error) {
      console.error('Error loading reminders data:', error);
      this.data = this.cloneDefaults();
    }
  }

  /**
   * A fresh deep copy of the default data, safe to mutate.
   * @returns {Object}
   */
  cloneDefaults() {
    return typeof structuredClone === 'function'
      ? structuredClone(this.defaultData)
      : JSON.parse(JSON.stringify(this.defaultData));
  }
  
  /**
   * Save reminders data to localStorage
   */
  saveData() {
    try {
      localStorage.setItem(this.remindersKey, JSON.stringify(this.data));
      console.log('Saved reminders data:', this.data);
    } catch (error) {
      console.error('Error saving reminders data:', error);
      utils.showToast('Error saving reminders data', 'error');
    }
  }
  
  /**
   * Initialize DOM elements
   */
  initializeElements() {
    this.elements = {};
    this.elements.bellIcon = document.getElementById('reminders-bell-icon');
    this.elements.remindersPanel = document.getElementById('reminders-panel');
    this.elements.globalToggle = document.getElementById('global-reminders-toggle');
  }
  
  /**
   * Initialize event listeners
   */
  initializeEventListeners() {
    // Bell icon click
    if (this.elements.bellIcon) {
      this.elements.bellIcon.addEventListener('click', () => {
        console.log('Bell icon clicked');
        this.togglePanel();
      });
    }

    // Delegated listeners on the panel itself, which survives every
    // re-render of its contents - so these are bound once, here.
    //
    // They used to be added from attachPanelEventListeners(), which runs on
    // every render. After a few screens one tap ran its handler several
    // times: flipping one system switch fired it six times (six toasts), and
    // one ✕ on a reminder time removed that time AND the next, because the
    // second run found the next row renumbered into the same slot.
    if (this.elements.remindersPanel) {
      this.elements.remindersPanel.addEventListener('change', (e) => this.handlePanelChange(e));
      this.elements.remindersPanel.addEventListener('click', (e) => this.handlePanelClick(e));
    }
  }

  /**
   * Switches and setting inputs in the System Reminders view.
   * @param {Event} e
   */
  handlePanelChange(e) {
    if (e.target.matches('.system-notification-toggle')) {
      const type = e.target.dataset.type;
      console.log('System notification toggle:', type, e.target.checked);
      this.toggleSystemNotification(type, e.target.checked);
    }

    if (e.target.matches('.system-setting-input')) {
      const type = e.target.dataset.type;
      const setting = e.target.dataset.setting;
      const value = e.target.value;
      console.log('System setting changed:', type, setting, value);
      this.updateSystemNotificationSetting(type, setting, value);
    }
  }

  /**
   * The ✕ buttons on reminder times and alerts in the custom reminder form.
   * @param {Event} e
   */
  handlePanelClick(e) {
    const removeTimeBtn = e.target.closest('.remove-time-btn');
    if (removeTimeBtn) {
      this.removeTime(parseInt(removeTimeBtn.dataset.index));
      return;
    }

    const removeAlertBtn = e.target.closest('.remove-alert-btn');
    if (removeAlertBtn) {
      this.removeAlertTime(parseInt(removeAlertBtn.dataset.index));
    }
  }
  
  /**
   * NEW: Toggle system notification expansion
   */
  toggleSystemNotificationExpansion(type) {
    console.log('toggleSystemNotificationExpansion called:', type);
    
    if (this.expandedSystemNotifications.has(type)) {
      this.expandedSystemNotifications.delete(type);
    } else {
      this.expandedSystemNotifications.add(type);
    }
    
    // Update the specific system notification display
    this.updateSystemNotificationExpansion(type);
  }
  
  /**
   * NEW: Update system notification expansion without full re-render
   */
  updateSystemNotificationExpansion(type) {
    console.log('updateSystemNotificationExpansion called:', type);
    
    const card = document.querySelector(`.system-notification-card.${type}`);
    if (!card) return;
    
    const expandBtn = card.querySelector('.system-expand-btn');
    const settings = card.querySelector('.system-notification-settings');
    
    if (!expandBtn || !settings) return;
    
    const isExpanded = this.expandedSystemNotifications.has(type);
    
    if (isExpanded) {
      expandBtn.classList.add('expanded');
      settings.classList.add('expanded');
    } else {
      expandBtn.classList.remove('expanded');
      settings.classList.remove('expanded');
    }
    
    console.log('Updated expansion for', type, 'expanded:', isExpanded);
  }
  
  /**
   * Toggle system notification day - Global method accessible from HTML
   */
  toggleSystemDay(type, day) {
    console.log('toggleSystemDay called:', type, day);
    
    if (!this.data.systemNotifications[type]) {
      console.error('Unknown notification type:', type);
      return;
    }
    
    const days = this.data.systemNotifications[type].days || [];
    console.log('Current days for', type, ':', days);
    
    const dayIndex = days.indexOf(day);
    
    if (dayIndex === -1) {
      // Add day
      days.push(day);
      console.log('Added day', day, 'to', type);
    } else {
      // Prevent removing if it's the last day
      if (days.length === 1) {
        utils.showToast('At least one day must be selected', 'warning');
        return;
      }
      // Remove day  
      days.splice(dayIndex, 1);
      console.log('Removed day', day, 'from', type);
    }
    
    this.data.systemNotifications[type].days = days;
    this.saveData();
    this.scheduleAllReminders();
    
    // Update button appearance immediately
    const button = document.querySelector(`[data-day="${day}"][data-type="${type}"]`);
    if (button) {
      if (days.includes(day)) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
      console.log('Updated button appearance for day', day, 'active:', days.includes(day));
    } else {
      console.warn('Could not find button for day', day, 'type', type);
    }
    
    console.log('Final days for', type, ':', this.data.systemNotifications[type].days);
  }
  
  /**
   * Toggle custom reminder day - Global method accessible from HTML
   */
  toggleCustomDay(day) {
    console.log('toggleCustomDay called:', day);
    const button = document.querySelector(`[data-day="${day}"]:not([data-type])`);
    if (button) {
      button.classList.toggle('active');
      console.log('Toggled custom day button for day', day, 'active:', button.classList.contains('active'));
    }
  }
  
  /**
   * Toggle custom time management
   */
  addTime() {
    const timesContainer = document.getElementById('times-container');
    if (!timesContainer) return;
    
    const timeCount = timesContainer.querySelectorAll('.time-item').length;
    if (timeCount >= 10) {
      utils.showToast('Maximum 10 times allowed per reminder', 'warning');
      return;
    }
    
    const newTime = document.createElement('div');
    newTime.className = 'time-item';
    newTime.dataset.index = timeCount;
    newTime.innerHTML = `
      <input type="time" 
             class="reminder-time-input" 
             value="12:00"
             data-index="${timeCount}">
      ${timeCount > 0 ? `<button type="button" class="remove-time-btn" data-index="${timeCount}">
        <i class="material-icons-round">close</i>
      </button>` : ''}
    `;
    
    timesContainer.appendChild(newTime);
  }
  
  /**
   * Remove time from custom reminder
   */
  removeTime(index) {
    // Scoped to the times container. A bare [data-index="N"] matches the
    // alert rows and the inner inputs too - they all reuse the same indices -
    // so the unscoped version returned whichever came first in the document.
    const timeItem = document.querySelector(`#times-container .time-item[data-index="${index}"]`);
    if (timeItem && timeItem.classList.contains('time-item')) {
      timeItem.remove();
      
      // Reindex remaining times
      document.querySelectorAll('.time-item').forEach((item, i) => {
        item.dataset.index = i;
        const input = item.querySelector('.reminder-time-input');
        const removeBtn = item.querySelector('.remove-time-btn');
        if (input) input.dataset.index = i;
        if (removeBtn) removeBtn.dataset.index = i;
        
        // Hide remove button for first item
        if (removeBtn) {
          removeBtn.style.display = i === 0 ? 'none' : 'flex';
        }
      });
    }
  }
  
  /**
   * Render the entire reminders panel based on current view
   */
  renderPanel() {
    if (!this.elements.remindersPanel) {
      console.error('Reminders panel not found');
      return;
    }
    
    console.log('Rendering panel, current view:', this.currentView);
    
    switch (this.currentView) {
      case 'main':
        this.renderMainView();
        break;
      case 'system':
        this.renderSystemRemindersView();
        break;
      case 'add-custom':
        this.renderCustomReminderModal(false);
        break;
      case 'edit-custom':
        this.renderCustomReminderModal(true);
        break;
      default:
        this.renderMainView();
    }
    
    // Attach event listeners
    this.attachPanelEventListeners();
  }
  
  /**
   * UPDATED: Render main reminders view - removed description
   */
  renderMainView() {
    const html = `
      <div class="panel-header">
        <h3>🔔 Reminders</h3>
        <button class="close-panel icon-btn" aria-label="Close">
          <i class="material-icons-round">close</i>
        </button>
      </div>
      
      <!-- Global Toggle Section -->
      <div class="global-reminders-section">
        <div class="global-reminders-header">
          <div class="global-reminders-title">
            <i class="material-icons-round">notifications</i>
            Enable Reminders
          </div>
          <label class="reminder-toggle-switch">
            <input type="checkbox" id="global-reminders-toggle" ${this.data.globalEnabled ? 'checked' : ''}>
            <span class="reminder-toggle-slider"></span>
          </label>
        </div>
      </div>
      
      <!-- System Reminders Button -->
      <div class="reminders-category">
        <button class="system-reminders-btn" id="system-reminders-btn">
          <div class="system-reminders-info">
            <i class="material-icons-round">settings</i>
            <div class="system-reminders-text">
              <span class="system-reminders-title">System Reminders</span>
              <span class="system-reminders-count">${this.getActiveSystemRemindersCount()} active</span>
            </div>
          </div>
          <i class="material-icons-round">chevron_right</i>
        </button>
      </div>
      
      <!-- Custom Reminders Section -->
      <div class="reminders-category">
        <div class="reminders-category-header">
          <h4>Custom Reminders</h4>
          <span class="reminders-count">${this.data.customReminders.length}</span>
        </div>
        
        ${this.renderCustomRemindersList()}
        
        <button class="add-reminder-btn" id="add-custom-reminder">
          <i class="material-icons-round">add</i>
          Add Reminder
        </button>
      </div>
    `;
    
    this.elements.remindersPanel.innerHTML = html;
  }
  
  /**
   * UPDATED: Attach event listeners to panel elements - added expand button support
   */
  attachPanelEventListeners() {
    console.log('Attaching panel event listeners for view:', this.currentView);
    
    // Close panel button
    const closeBtn = this.elements.remindersPanel.querySelector('.close-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        console.log('Close button clicked');
        this.closePanel();
      });
    }
    
    // Back button
    const backBtn = document.getElementById('back-to-main');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        console.log('Back button clicked');
        this.backToMain();
      });
    }
    
    // Global toggle
    this.elements.globalToggle = document.getElementById('global-reminders-toggle');
    if (this.elements.globalToggle) {
      this.elements.globalToggle.addEventListener('change', (e) => {
        console.log('Global toggle changed:', e.target.checked);
        if (e.target.checked) {
          this.requestNotificationPermission();
        } else {
          this.data.globalEnabled = false;
          this.saveData();
          this.clearAllTimers();
          utils.showToast('All reminders disabled', 'info');
        }
      });
    }
    
    // System reminders button
    const systemBtn = document.getElementById('system-reminders-btn');
    if (systemBtn) {
      systemBtn.addEventListener('click', () => {
        console.log('System reminders button clicked');
        this.showSystemReminders();
      });
    }
    
    // Add custom reminder button
    const addBtn = document.getElementById('add-custom-reminder');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        console.log('Add custom reminder button clicked');
        this.showAddCustomReminderModal();
      });
    }
    
    // Save reminder button
    const saveBtn = document.getElementById('save-reminder');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        console.log('Save reminder button clicked');
        this.saveCustomReminder();
      });
    }
    
    // Delete reminder button
    const deleteBtn = document.getElementById('delete-reminder');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        console.log('Delete reminder button clicked');
        this.deleteCustomReminder();
      });
    }
    
    // NEW: System notification expand buttons
    document.querySelectorAll('.system-expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const type = btn.dataset.type;
        console.log('System expand button clicked:', type);
        this.toggleSystemNotificationExpansion(type);
      });
    });
    
    // System switches and the ✕ buttons are handled by the delegated
    // listeners bound once in initializeEventListeners().

    // Form interactions
    this.attachFormEventListeners();
  }
  
  /**
   * Handle system notification setting updates
   */
  updateSystemNotificationSetting(type, setting, value) {
    if (!this.data.systemNotifications[type]) return;
    
    if (setting === 'time') {
      this.data.systemNotifications[type].time = value;
    } else if (setting === 'interval') {
      this.data.systemNotifications[type].interval = parseInt(value);
    } else if (setting === 'startTime') {
      this.data.systemNotifications[type].activeWindow.start = value;
    } else if (setting === 'endTime') {
      this.data.systemNotifications[type].activeWindow.end = value;
    }
    
    this.saveData();
    this.scheduleAllReminders();
    
    const settingName = setting === 'startTime' ? 'start time' : 
                       setting === 'endTime' ? 'end time' : setting;
    utils.showToast(`${this.getSystemNotificationTitle(type)} ${settingName} updated`, 'success');
  }
  
  /**
   * Open reminders panel
   */
  openPanel() {
    if (!this.elements.remindersPanel) {
      console.error('Cannot open panel - reminders panel not found');
      return;
    }
    
    console.log('Opening reminders panel');
    
    // Close any other open panels
    document.querySelectorAll('.panel').forEach(panel => {
      if (panel !== this.elements.remindersPanel) {
        panel.classList.remove('active');
      }
    });
    
    this.currentView = 'main';
    this.elements.remindersPanel.classList.add('active');
    this.renderPanel();
  }
  
  /**
   * Close reminders panel
   */
  closePanel() {
    console.log('Closing reminders panel');
    if (this.elements.remindersPanel) {
      this.elements.remindersPanel.classList.remove('active');
    }
    this.currentView = 'main';
    this.editingReminderId = null;
    // Reset expansion state when closing
    this.expandedSystemNotifications.clear();
  }
  
  /**
   * Toggle reminders panel
   */
  togglePanel() {
    if (!this.elements.remindersPanel) {
      console.error('Reminders panel not found');
      return;
    }
    
    const isActive = this.elements.remindersPanel.classList.contains('active');
    console.log('Toggle panel - currently active:', isActive);
    
    if (isActive) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }
  
  /**
   * Show system reminders panel
   */
  showSystemReminders() {
    console.log('Showing system reminders');
    this.currentView = 'system';
    this.renderPanel();
  }
  
  /**
   * Show add custom reminder modal
   */
  showAddCustomReminderModal() {
    console.log('Showing add custom reminder modal');
    this.currentView = 'add-custom';
    this.editingReminderId = null;
    this.renderPanel();
    
    // Focus title input
    setTimeout(() => {
      const titleInput = document.getElementById('reminder-title');
      if (titleInput) titleInput.focus();
    }, 100);
  }
  
  /**
   * Edit custom reminder
   */
  editCustomReminder(id) {
    console.log('Editing custom reminder:', id);
    this.currentView = 'edit-custom';
    this.editingReminderId = id;
    this.renderPanel();
    
    // Focus title input
    setTimeout(() => {
      const titleInput = document.getElementById('reminder-title');
      if (titleInput) titleInput.focus();
    }, 100);
  }
  
  /**
   * Back to main view
   */
  backToMain() {
    console.log('Going back to main view');
    this.currentView = 'main';
    this.editingReminderId = null;
    this.expandedSystemNotifications.clear(); // Reset expansion state
    this.renderPanel();
  }
  
  /**
   * Get active system reminders count
   */
  getActiveSystemRemindersCount() {
    return Object.values(this.data.systemNotifications).filter(notif => notif.enabled).length;
  }
  
  /**
   * Render custom reminders list
   */
  renderCustomRemindersList() {
    if (this.data.customReminders.length === 0) {
      return `
        <div class="empty-reminders">
          <div class="empty-reminders-icon">
            <i class="material-icons-round">alarm_off</i>
          </div>
          <p>No custom reminders yet</p>
        </div>
      `;
    }
    
    return this.data.customReminders.map(reminder => 
      this.renderCustomReminderItem(reminder)
    ).join('');
  }
  
  /**
   * UPDATED: Render custom reminder item with inline toggle in header
   */
  renderCustomReminderItem(reminder) {
    const scheduleText = this.getCustomReminderScheduleText(reminder);
    const nextAlert = this.getNextAlertText(reminder);
    const timeWindowText = `Active: ${reminder.activeWindow?.start || '00:00'} - ${reminder.activeWindow?.end || '23:59'}`;
    const timesText = reminder.times && reminder.times.length > 1 ? 
      `Times: ${reminder.times.join(', ')}` : 
      `Time: ${reminder.times ? reminder.times[0] : '12:00'}`;
    
    return `
      <div class="custom-reminder-item ${reminder.enabled ? 'enabled' : 'disabled'}">
        <div class="custom-reminder-main" onclick="window.remindersManager.editCustomReminder('${reminder.id}')">
          <div class="custom-reminder-info">
            <h4 class="reminder-title">${utils.escapeHtml(reminder.title)}</h4>
            <p class="reminder-schedule">${scheduleText}</p>
            <p class="reminder-times">${timesText}</p>
            <p class="reminder-time-window">${timeWindowText}</p>
            ${nextAlert ? `<p class="reminder-next">${nextAlert}</p>` : ''}
            ${reminder.notes ? `<p class="reminder-notes">${utils.escapeHtml(reminder.notes)}</p>` : ''}
          </div>
          <div class="custom-reminder-header-controls">
            <label class="reminder-toggle-switch" onclick="event.stopPropagation();">
              <input type="checkbox" 
                     ${reminder.enabled ? 'checked' : ''}
                     data-reminder-id="${reminder.id}"
                     class="custom-reminder-toggle"
                     onchange="window.remindersManager.toggleCustomReminder('${reminder.id}', this.checked)">
              <span class="reminder-toggle-slider"></span>
            </label>
            <i class="material-icons-round">chevron_right</i>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Get schedule text for custom reminder
   */
  getCustomReminderScheduleText(reminder) {
    let repeatText = '';
    
    switch (reminder.repeat) {
      case 'none':
        // parseDateKey, not new Date(): a YYYY-MM-DD string parses as UTC
        // midnight, which reads as the day before anywhere west of UTC.
        repeatText = reminder.date ? `Once on ${utils.parseDateKey(reminder.date).toLocaleDateString()}` : 'One time';
        break;
      case 'daily':
        repeatText = 'Daily';
        break;
      case 'weekly':
        repeatText = reminder.days && reminder.days.length > 0 ? this.getDaysText(reminder.days) : 'Weekly';
        break;
      case 'monthly':
        repeatText = 'Monthly';
        break;
      case 'yearly':
        repeatText = 'Yearly';
        break;
      default:
        repeatText = 'Custom';
    }
    
    return repeatText;
  }
  
  /**
   * Get next alert text
   */
  getNextAlertText(reminder) {
    if (!reminder.enabled) return null;
    
    const nextTrigger = this.calculateNextTrigger(reminder);
    if (!nextTrigger) return null;
    
    const now = new Date();
    const diffMs = nextTrigger.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `Next: in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `Next: in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else {
      return 'Next: soon';
    }
  }
  
  /**
   * Calculate next trigger time for a reminder with multiple times support
   */
  calculateNextTrigger(reminder) {
    const now = new Date();
    const times = reminder.times || ['12:00'];
    
    // For one-time reminders
    if (reminder.repeat === 'none' && reminder.date) {
      // Local midnight on that date - new Date('YYYY-MM-DD') is UTC midnight.
      const reminderDate = utils.parseDateKey(reminder.date);
      let nextTrigger = null;
      
      // Check all times for this date
      times.forEach(timeStr => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const triggerTime = new Date(reminderDate);
        triggerTime.setHours(hours, minutes, 0, 0);
        
        if (triggerTime > now && this.isTimeInActiveWindow(triggerTime, reminder.activeWindow)) {
          if (!nextTrigger || triggerTime < nextTrigger) {
            nextTrigger = triggerTime;
          }
        }
      });
      
      return nextTrigger;
    }
    
    // For repeating reminders, find the next occurrence
    let nextTrigger = null;
    const daysToCheck = 7; // Check next 7 days
    
    for (let dayOffset = 0; dayOffset < daysToCheck; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + dayOffset);
      
      // Check if this day matches the repeat pattern
      if (!this.isDayMatchingPattern(checkDate, reminder)) {
        continue;
      }
      
      // Check all times for this day
      times.forEach(timeStr => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const triggerTime = new Date(checkDate);
        triggerTime.setHours(hours, minutes, 0, 0);
        
        if (triggerTime > now && this.isTimeInActiveWindow(triggerTime, reminder.activeWindow)) {
          if (!nextTrigger || triggerTime < nextTrigger) {
            nextTrigger = triggerTime;
          }
        }
      });
      
      // If we found a trigger for today/tomorrow, we can stop looking
      if (nextTrigger && dayOffset <= 1) {
        break;
      }
    }
    
    return nextTrigger;
  }
  
  /**
   * Check if a date matches the reminder's repeat pattern
   */
  isDayMatchingPattern(date, reminder) {
    // parseDateKey, not new Date(): reminder.date comes from an <input
    // type="date"> as YYYY-MM-DD, which new Date() reads as UTC midnight.
    // West of UTC that lands on the previous day, so a monthly reminder set
    // for the 1st fired on the 28th.
    const anchor = reminder.date ? utils.parseDateKey(reminder.date) : new Date();

    switch (reminder.repeat) {
      case 'daily':
        return true;
      case 'weekly':
        return reminder.days && reminder.days.includes(date.getDay());
      case 'monthly':
        return date.getDate() === anchor.getDate();
      case 'yearly':
        return date.getMonth() === anchor.getMonth() &&
               date.getDate() === anchor.getDate();
      default:
        return false;
    }
  }
  
  /**
   * Check if a time is within the active window
   */
  isTimeInActiveWindow(dateTime, activeWindow) {
    if (!activeWindow || !activeWindow.start || !activeWindow.end) {
      return true; // No window restrictions
    }
    
    const timeMinutes = dateTime.getHours() * 60 + dateTime.getMinutes();
    const startMinutes = this.timeStringToMinutes(activeWindow.start);
    const endMinutes = this.timeStringToMinutes(activeWindow.end);
    
    // Handle case where end time is before start time (spans midnight)
    if (endMinutes < startMinutes) {
      return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
    } else {
      return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
    }
  }
  
  /**
   * Get days text for weekly reminders
   */
  getDaysText(days) {
    if (!days || days.length === 0) return 'No days selected';
    if (days.length === 7) return 'Daily';
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map(day => dayNames[day]).join(', ');
  }
  
  /**
   * Render system reminders sub-view
   */
  renderSystemRemindersView() {
    const html = `
      <div class="panel-header">
        <button class="back-btn icon-btn" id="back-to-main">
          <i class="material-icons-round">arrow_back</i>
        </button>
        <h3>System Reminders</h3>
        <div></div>
      </div>
      
      ${this.renderSystemNotifications()}
    `;
    
    this.elements.remindersPanel.innerHTML = html;
  }
  
  /**
   * UPDATED: Render system notifications with expand button in header controls
   */
  renderSystemNotifications() {
    return Object.entries(this.data.systemNotifications).map(([type, notification]) => {
      const title = this.getSystemNotificationTitle(type);
      const description = this.getSystemNotificationDescription(type);
      const isExpanded = this.expandedSystemNotifications.has(type);
      
      return `
        <div class="system-notification-card ${type} ${notification.enabled ? 'enabled' : ''}">
          <div class="system-notification-header">
            <div class="system-notification-info">
              <div class="system-notification-icon">
                <i class="material-icons-round">${this.getSystemNotificationIcon(type)}</i>
              </div>
              <div class="system-notification-details">
                <h4>${title}</h4>
                <p class="system-notification-summary">${description}</p>
              </div>
            </div>
            <div class="system-notification-controls">
              <!-- UPDATED: Expand button is now first in controls, before toggle -->
              <button class="system-expand-btn ${isExpanded ? 'expanded' : ''}" 
                      data-type="${type}"
                      title="Expand settings"
                      style="opacity: ${notification.enabled ? '1' : '0.3'}; pointer-events: ${notification.enabled ? 'all' : 'none'};">
                <i class="material-icons-round">keyboard_arrow_down</i>
              </button>
              <label class="reminder-toggle-switch">
                <input type="checkbox" 
                       class="system-notification-toggle"
                       data-type="${type}"
                       ${notification.enabled ? 'checked' : ''}>
                <span class="reminder-toggle-slider"></span>
              </label>
            </div>
          </div>
          
          <div class="system-notification-settings ${isExpanded ? 'expanded' : ''}">
            ${this.renderSystemNotificationSettings(type, notification)}
          </div>
        </div>
      `;
    }).join('');
  }
  
  /**
   * Get system notification icon
   */
  getSystemNotificationIcon(type) {
    switch (type) {
      case 'waterAlert': return 'water_drop';
      case 'waterInterval': return 'schedule';
      case 'proteinAlert': return 'restaurant';
      case 'proteinInterval': return 'timer';
      default: return 'notifications';
    }
  }
  
  /**
   * Get system notification title
   */
  getSystemNotificationTitle(type) {
    switch (type) {
      case 'waterAlert': return 'Water Goal Alert';
      case 'waterInterval': return 'Water Reminders';
      case 'proteinAlert': return 'Protein Goal Alert';
      case 'proteinInterval': return 'Protein Reminders';
      default: return 'Unknown Notification';
    }
  }
  
  /**
   * Get system notification description
   */
  getSystemNotificationDescription(type) {
    switch (type) {
      case 'waterAlert': return 'Daily reminder to check your water intake';
      case 'waterInterval': return 'Regular reminders to drink water';
      case 'proteinAlert': return 'Daily reminder to check your protein intake';
      case 'proteinInterval': return 'Regular reminders to get protein';
      default: return 'System notification';
    }
  }
  
  /**
   * Render system notification settings - simplified per requirements
   */
  renderSystemNotificationSettings(type, notification) {
    let settingsHtml = ``;
    
    // Goal alerts: Only time and days (no time window)
    if (type.includes('Alert')) {
      settingsHtml += `
        <div class="setting-row">
          <label>Time</label>
          <input type="time" 
                 value="${notification.time || '20:00'}"
                 data-type="${type}"
                 data-setting="time"
                 class="system-setting-input">
        </div>
      `;
    }
    
    // Interval reminders: Only interval, active hours, and days (no fixed time)
    if (type.includes('Interval')) {
      settingsHtml += `
        <div class="setting-row">
          <label>Interval</label>
          <select data-type="${type}" data-setting="interval" class="system-setting-input">
            <option value="60" ${notification.interval === 60 ? 'selected' : ''}>1 hour</option>
            <option value="120" ${notification.interval === 120 ? 'selected' : ''}>2 hours</option>
            <option value="180" ${notification.interval === 180 ? 'selected' : ''}>3 hours</option>
            <option value="240" ${notification.interval === 240 ? 'selected' : ''}>4 hours</option>
          </select>
        </div>
        
        <div class="setting-row time-window-row">
          <label>Active Hours</label>
          <div class="time-window-inputs">
            <input type="time" 
                   value="${notification.activeWindow?.start || '08:00'}"
                   data-type="${type}"
                   data-setting="startTime"
                   class="system-setting-input time-window-input"
                   title="Start time">
            <span class="time-window-separator">to</span>
            <input type="time" 
                   value="${notification.activeWindow?.end || '22:00'}"
                   data-type="${type}"
                   data-setting="endTime"
                   class="system-setting-input time-window-input"
                   title="End time">
          </div>
        </div>
      `;
    }
    
    // Add days selector for all types
    settingsHtml += `
        <div class="setting-row">
          <label>Days</label>
          ${this.renderSystemDaysSelector(type, notification.days)}
        </div>
    `;
    
    return settingsHtml;
  }
  
  /**
   * Render days selector for system notifications with direct onclick
   */
  renderSystemDaysSelector(type, selectedDays = []) {
    console.log('Rendering system days selector for', type, 'with selected days:', selectedDays);
    
    const days = [
      { value: 1, label: 'Mon' },
      { value: 2, label: 'Tue' },
      { value: 3, label: 'Wed' },
      { value: 4, label: 'Thu' },
      { value: 5, label: 'Fri' },
      { value: 6, label: 'Sat' },
      { value: 0, label: 'Sun' }
    ];
    
    return `
      <div class="days-selector">
        ${days.map(day => `
          <button class="day-toggle ${selectedDays.includes(day.value) ? 'active' : ''}" 
                  type="button"
                  data-day="${day.value}"
                  data-type="${type}"
                  onclick="window.remindersManager.toggleSystemDay('${type}', ${day.value})">
            ${day.label}
          </button>
        `).join('')}
      </div>
    `;
  }
  
  /**
   * Render days selector for custom reminders with direct onclick
   */
  renderCustomDaysSelector(selectedDays = []) {
    console.log('Rendering custom days selector with selected days:', selectedDays);
    
    const days = [
      { value: 1, label: 'Mon' },
      { value: 2, label: 'Tue' },
      { value: 3, label: 'Wed' },
      { value: 4, label: 'Thu' },
      { value: 5, label: 'Fri' },
      { value: 6, label: 'Sat' },
      { value: 0, label: 'Sun' }
    ];
    
    return `
      <div class="days-selector">
        ${days.map(day => `
          <button class="day-toggle ${selectedDays.includes(day.value) ? 'active' : ''}" 
                  type="button"
                  data-day="${day.value}"
                  onclick="window.remindersManager.toggleCustomDay(${day.value})">
            ${day.label}
          </button>
        `).join('')}
      </div>
    `;
  }
  
  /**
   * UPDATED: Toggle system notification - with expand button visibility control
   */
  toggleSystemNotification(type, enabled) {
    console.log('Toggling system notification:', type, enabled);

    // Shared with the water/protein settings panels, so both agree on
    // defaults and both actually schedule.
    const config = this.setSystemNotificationEnabled(type, enabled);
    if (!config) return;

    // Keep the day buttons in step with any days that were just filled in.
    if (enabled) {
      const card = document.querySelector(`.system-notification-card.${type}`);
      if (card) {
        card.querySelectorAll(`[data-day][data-type="${type}"]`).forEach(button => {
          button.classList.toggle('active', config.days.includes(Number(button.dataset.day)));
        });
      }
    }

    // Update expand button visibility without full re-render
    const card = document.querySelector(`.system-notification-card.${type}`);
    if (card) {
      const expandBtn = card.querySelector('.system-expand-btn');
      if (expandBtn) {
        if (enabled) {
          card.classList.add('enabled');
          expandBtn.style.opacity = '1';
          expandBtn.style.pointerEvents = 'all';
        } else {
          card.classList.remove('enabled');
          expandBtn.style.opacity = '0.3';
          expandBtn.style.pointerEvents = 'none';
          // Also collapse if it was expanded
          if (this.expandedSystemNotifications.has(type)) {
            this.expandedSystemNotifications.delete(type);
            this.updateSystemNotificationExpansion(type);
          }
        }
      }
    }
    
    const titleText = this.getSystemNotificationTitle(type);
    utils.showToast(`${titleText} ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'info');
  }
  
  /**
   * Toggle custom reminder enabled state
   */
  toggleCustomReminder(id, enabled) {
    console.log('Toggling custom reminder:', id, enabled);
    
    const reminder = this.data.customReminders.find(r => r.id === id);
    if (reminder) {
      reminder.enabled = enabled;
      this.saveData();
      
      if (enabled && this.data.globalEnabled) {
        this.scheduleCustomReminder(reminder);
        utils.showToast(`Reminder "${reminder.title}" enabled`, 'success');
      } else {
        this.clearCustomReminderTimer(id);
        utils.showToast(`Reminder "${reminder.title}" disabled`, 'info');
      }
      
      // Update the display item class
      const reminderItem = document.querySelector(`[data-reminder-id="${id}"]`)?.closest('.custom-reminder-item');
      if (reminderItem) {
        if (enabled) {
          reminderItem.classList.remove('disabled');
          reminderItem.classList.add('enabled');
        } else {
          reminderItem.classList.remove('enabled');
          reminderItem.classList.add('disabled');
        }
      }
    }
  }
  
  /**
   * Request notification permission
   */
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      utils.showToast('Your browser does not support notifications', 'error');
      if (this.elements.globalToggle) this.elements.globalToggle.checked = false;
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        this.data.globalEnabled = true;
        this.saveData();
        this.scheduleAllReminders();
        utils.showToast('Reminders enabled successfully!', 'success');
        
        // Send test notification
        setTimeout(() => {
          this.sendNotification('Reminders Active', 'Your reminders are now working!');
        }, 500);
      } else {
        this.data.globalEnabled = false;
        if (this.elements.globalToggle) this.elements.globalToggle.checked = false;
        utils.showToast('Notification permission denied', 'warning');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      if (this.elements.globalToggle) this.elements.globalToggle.checked = false;
      utils.showToast('Error enabling notifications', 'error');
    }
  }
  
  /**
   * Send notification
   */
  sendNotification(title, message, icon = 'icons/icon-192.png') {
    if (!this.data.globalEnabled || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const options = {
      body: message,
      icon: icon,
      badge: icon,
      tag: 'daily-tracker',
      requireInteraction: false
    };

    // Prefer the service worker registration. Installed web apps on iOS only
    // support this form - `new Notification()` throws there.
    //
    // The check is on .controller (an active worker actually controlling this
    // page), NOT on .ready. `.ready` is a Promise, so it is always truthy, and
    // when no worker is registered it never settles - which meant neither the
    // .then nor the .catch ever ran and no notification was shown at all.
    // The race guarantees the fallback stays reachable.
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Service worker not ready in time')), 2000)
      );

      Promise.race([navigator.serviceWorker.ready, timeout])
        .then(registration => registration.showNotification(title, options))
        .catch(error => {
          console.warn('Service worker notification failed, falling back:', error);
          this.sendNotificationFallback(title, options);
        });
      return;
    }

    this.sendNotificationFallback(title, options);
  }

  /**
   * Direct Notification constructor, for browsers without a service worker.
   */
  sendNotificationFallback(title, options) {
    try {
      const notification = new Notification(title, options);
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }
  
  /**
   * Clear all active timers
   */
  clearAllTimers() {
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.intervalTimers.forEach(timer => clearInterval(timer));
    this.activeTimers.clear();
    this.intervalTimers.clear();
  }
  
  /**
   * Clear custom reminder timer
   */
  clearCustomReminderTimer(id) {
    const keysToRemove = [];
    this.activeTimers.forEach((timer, timerId) => {
      if (timerId.startsWith(`custom_${id}_`)) {
        clearTimeout(timer);
        keysToRemove.push(timerId);
      }
    });
    keysToRemove.forEach(k => this.activeTimers.delete(k));
  }
  
  /**
   * Schedule all reminders
   */
  scheduleAllReminders() {
    // Always clear first. Returning before this meant that disabling reminders
    // left the previously scheduled timers running.
    this.clearAllTimers();

    if (!this.data.globalEnabled) return;

    // Each reminder is scheduled in isolation. One malformed entry used to
    // throw out of this loop and take every remaining reminder with it.
    Object.keys(this.data.systemNotifications).forEach(key => {
      try {
        const notification = this.data.systemNotifications[key];
        if (notification.enabled && notification.days && notification.days.length > 0) {
          this.scheduleSystemNotification(key);
        }
      } catch (error) {
        console.error('Failed to schedule system notification', key, error);
      }
    });

    // Schedule custom reminders
    this.data.customReminders.forEach(reminder => {
      try {
        if (reminder.enabled) {
          this.scheduleCustomReminder(reminder);
        }
      } catch (error) {
        console.error('Failed to schedule reminder', reminder && reminder.id, error);
      }
    });
  }

  /**
   * Enable or disable a system notification.
   *
   * The single place this happens. The reminders panel and the water/protein
   * settings panels both toggle the same four notifications, and they used to
   * do it through separate code paths that disagreed - one defaulted to
   * weekdays, the other to all seven days, and only one of them filled the
   * days in at all (so the other silently scheduled nothing).
   *
   * @param {string} type - waterAlert | waterInterval | proteinAlert | proteinInterval
   * @param {boolean} enabled
   * @returns {Object|null} The updated config
   */
  setSystemNotificationEnabled(type, enabled) {
    const config = this.data.systemNotifications[type];
    if (!config) {
      console.error('Unknown notification type:', type);
      return null;
    }

    config.enabled = enabled;

    // A reminder with no days selected is never scheduled, so enabling one
    // has to guarantee it has days.
    if (enabled && (!Array.isArray(config.days) || config.days.length === 0)) {
      config.days = [0, 1, 2, 3, 4, 5, 6];
    }

    this.saveData();
    this.scheduleAllReminders();
    return config;
  }

  /**
   * Human-readable schedule for a system notification, e.g. "20:00 daily".
   *
   * @param {string} type
   * @returns {string}
   */
  describeSystemNotification(type) {
    const config = this.data.systemNotifications[type];
    if (!config) return '';

    const days = this.formatDaysList(config.days || []);

    if (type.includes('Interval')) {
      const hours = (config.interval || 120) / 60;
      const every = hours >= 1 ? `${hours}h` : `${config.interval}m`;
      const window = config.activeWindow
        ? ` ${config.activeWindow.start}-${config.activeWindow.end}`
        : '';
      return `every ${every}${window}, ${days}`;
    }

    return `${config.time || '20:00'} ${days}`;
  }

  /**
   * Describe a set of weekday numbers compactly.
   * @param {number[]} days
   * @returns {string}
   */
  formatDaysList(days) {
    if (!days || days.length === 0) return 'no days';
    if (days.length === 7) return 'daily';
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'weekdays';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'weekends';

    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return [...days].sort((a, b) => a - b).map(d => names[d]).join(' ');
  }
  
  /**
   * Schedule system notification
   */
  scheduleSystemNotification(type) {
    const notification = this.data.systemNotifications[type];
    if (!notification || !notification.enabled || !notification.days || notification.days.length === 0) return;
    
    console.log('Scheduling system notification:', type);
    
    if (type.includes('Interval')) {
      this.scheduleIntervalReminder(type);
    } else {
      this.scheduleTimeBasedNotification(type, {
        time: notification.time,
        days: notification.days,
        callback: () => this.triggerGoalCheckAlert(type)
      });
    }
  }
  
  /**
   * Schedule interval notifications
   */
  scheduleIntervalReminder(type) {
    const config = this.data.systemNotifications[type];
    if (!config.enabled || !config.days || config.days.length === 0) return;
    
    const intervalMs = config.interval * 60 * 1000;

    const checkAndSchedule = () => {
      const now = new Date();
      const currentDay = now.getDay();

      // Check day and time window
      const dayMatch = config.days.includes(currentDay);
      const timeMatch = this.isTimeInActiveWindow(now, config.activeWindow);

      if (dayMatch && timeMatch) {
        this.triggerIntervalReminder(type);
      }
    };

    // Align the first tick to the wall clock rather than to whenever the page
    // happened to load. Without this, every reload restarted the countdown -
    // so a 2-hour reminder could go a whole day without firing on a device
    // that opens and closes the app frequently.
    const now = new Date();
    const msSinceMidnight =
      now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;
    const msToNextSlot = intervalMs - (msSinceMidnight % intervalMs);

    const alignmentTimer = setTimeout(() => {
      checkAndSchedule();
      const timer = setInterval(checkAndSchedule, intervalMs);
      this.intervalTimers.set(type, timer);
    }, msToNextSlot);

    // Tracked so clearAllTimers can cancel it before it ever fires.
    this.activeTimers.set(`interval_align_${type}`, alignmentTimer);
  }
  
  /**
   * Schedule time-based notification with daily repetition
   */
  scheduleTimeBasedNotification(timerId, config) {
    const scheduleNext = () => {
      const now = new Date();
      const [hours, minutes] = config.time.split(':').map(Number);
      
      let nextTrigger = new Date();
      nextTrigger.setHours(hours, minutes, 0, 0);
      
      if (nextTrigger <= now) {
        nextTrigger.setDate(nextTrigger.getDate() + 1);
      }
      
      while (!config.days.includes(nextTrigger.getDay())) {
        nextTrigger.setDate(nextTrigger.getDate() + 1);
      }
      
      const delay = nextTrigger.getTime() - now.getTime();
      
      const timer = setTimeout(() => {
        config.callback();
        scheduleNext();
      }, delay);
      
      this.activeTimers.set(timerId, timer);
    };
    
    scheduleNext();
  }
  
  /**
   * Convert time string to minutes since midnight
   */
  timeStringToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  /**
   * Trigger goal check alert
   */
  triggerGoalCheckAlert(type) {
    if (type === 'waterAlert') {
      this.checkWaterGoalAndAlert();
    } else if (type === 'proteinAlert') {
      this.checkProteinGoalAndAlert();
    }
  }
  
  /**
   * Check water goal and send alert if needed
   */
  checkWaterGoalAndAlert() {
    if (!window.waterTracker) return;

    const config = this.data.systemNotifications.waterAlert;
    const goal = window.waterTracker.goal;
    const total = window.waterTracker.totalIntake;

    if (goal <= 0) return;

    const goalMet = total >= goal;

    // onlyIfGoalNotMet is a real setting - when it is off, the user wants the
    // daily nudge either way.
    if (goalMet && config.onlyIfGoalNotMet !== false) return;

    const remaining = Math.max(0, goal - total);
    const message = config.message ||
      (goalMet
        ? `Nice - you hit your ${goal}ml water goal today.`
        : `You're ${remaining}ml short of your daily water goal. Time to hydrate!`);

    this.sendNotification('Water Intake Alert', message);
  }
  
  /**
   * Check protein goal and send alert if needed
   */
  checkProteinGoalAndAlert() {
    if (!window.proteinTracker) return;

    const config = this.data.systemNotifications.proteinAlert;
    const goal = window.proteinTracker.goal;
    const total = window.proteinTracker.totalIntake;

    if (goal <= 0) return;

    const goalMet = total >= goal;
    if (goalMet && config.onlyIfGoalNotMet !== false) return;

    const remaining = Math.max(0, goal - total);
    const message = config.message ||
      (goalMet
        ? `Nice - you hit your ${goal}g protein goal today.`
        : `You're ${remaining}g short of your daily protein goal. Time to fuel up!`);

    this.sendNotification('Protein Intake Alert', message);
  }
  
  /**
   * Trigger interval reminder
   */
  triggerIntervalReminder(type) {
    const config = this.data.systemNotifications[type];
    const trackerType = type === 'waterInterval' ? 'water' : 'protein';
    const tracker = trackerType === 'water' ? window.waterTracker : window.proteinTracker;

    // Honour the "only if below goal" setting. It was stored and shown in the
    // settings UI but never actually read, so these reminders kept firing all
    // day after the goal had already been hit.
    if (config.onlyIfBelowGoal && tracker && tracker.goal > 0 && tracker.totalIntake >= tracker.goal) {
      console.log(`Skipping ${type}: goal already met`);
      return;
    }

    const defaultMessage = type === 'waterInterval' ?
      'Time to drink some water! Stay hydrated.' :
      'Time to get some protein! Fuel your body.';

    this.sendNotification(
      `${trackerType.charAt(0).toUpperCase() + trackerType.slice(1)} Reminder`,
      config.message || defaultMessage
    );
  }
  
  /**
   * Schedule custom reminder with multiple times support
   */
  scheduleCustomReminder(reminder) {
    const times = reminder.times || ['12:00'];
    
    times.forEach(timeStr => {
      const nextTrigger = this.calculateNextTriggerForTime(reminder, timeStr);
      if (!nextTrigger) return;
      
      console.log('Scheduling custom reminder:', reminder.title, 'for time', timeStr, 'at', nextTrigger);
      
      reminder.alerts.forEach(alertMinutes => {
        const alertTime = new Date(nextTrigger.getTime() - (alertMinutes * 60 * 1000));
        const now = new Date();
        
        if (alertTime > now) {
          const delay = alertTime.getTime() - now.getTime();
          const timerId = `custom_${reminder.id}_${timeStr}_${alertMinutes}`;

          // Cancel whatever was already registered under this id. The callback
          // below re-schedules the whole reminder, so without this the Map
          // entry was overwritten while the old setTimeout kept running -
          // leaking timers and firing duplicate notifications.
          const existing = this.activeTimers.get(timerId);
          if (existing) clearTimeout(existing);

          // More than a day away: wake in a day and work it out again, rather
          // than firing. setTimeout cannot wait longer than ~24.8 days - a
          // longer delay fires at once - and since the callback below
          // re-schedules, a one-time reminder set further ahead than that
          // fired non-stop (37 times in half a second) while the app was open.
          if (delay > REMINDER_MAX_WAIT_MS) {
            const recheck = setTimeout(() => {
              this.activeTimers.delete(timerId);
              this.scheduleCustomReminder(reminder);
            }, REMINDER_MAX_WAIT_MS);
            this.activeTimers.set(timerId, recheck);
            return;
          }

          const timer = setTimeout(() => {
            this.activeTimers.delete(timerId);
            // Double-check time window before sending
            if (this.isTimeInActiveWindow(new Date(), reminder.activeWindow)) {
              this.triggerCustomReminder(reminder, alertMinutes);
            }
            this.scheduleCustomReminder(reminder);
          }, delay);

          this.activeTimers.set(timerId, timer);
        }
      });
    });
  }
  
  /**
   * Calculate next trigger for a specific time
   */
  calculateNextTriggerForTime(reminder, timeStr) {
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // For one-time reminders. A missing date falls back to today rather than
    // dropping through to the repeating branch, where isDayMatchingPattern
    // returns false for 'none' - which left the reminder enabled in the UI
    // with nothing ever scheduled.
    if (reminder.repeat === 'none') {
      const reminderDate = reminder.date ? utils.parseDateKey(reminder.date) : new Date();
      reminderDate.setHours(hours, minutes, 0, 0);

      if (reminderDate > now && this.isTimeInActiveWindow(reminderDate, reminder.activeWindow)) {
        return reminderDate;
      }
      return null;
    }

    // For repeating reminders
    const daysToCheck = 7; // Check next 7 days
    
    for (let dayOffset = 0; dayOffset < daysToCheck; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + dayOffset);
      checkDate.setHours(hours, minutes, 0, 0);
      
      if (checkDate <= now) continue; // Skip past times
      
      if (this.isDayMatchingPattern(checkDate, reminder) && 
          this.isTimeInActiveWindow(checkDate, reminder.activeWindow)) {
        return checkDate;
      }
    }
    
    return null;
  }
  
  /**
   * Trigger custom reminder
   */
  triggerCustomReminder(reminder, alertMinutes) {
    let title = reminder.title;
    let message = reminder.notes || reminder.title;
    
    if (alertMinutes > 0) {
      const timeText = alertMinutes >= 60 ? 
        `${Math.floor(alertMinutes / 60)} hour${Math.floor(alertMinutes / 60) > 1 ? 's' : ''}` :
        `${alertMinutes} minute${alertMinutes > 1 ? 's' : ''}`;
      message = `Reminder in ${timeText}: ${message}`;
    }
    
    this.sendNotification(title, message);
  }
  
  /**
   * Migrate from legacy notifications
   */
  migrateFromLegacyNotifications() {
    let migrated = false;
    
    Object.entries(this.legacyNotificationKeys).forEach(([newKey, legacyKey]) => {
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue !== null) {
        migrated = true;
        
        switch (newKey) {
          case 'global':
            this.data.globalEnabled = legacyValue === 'true';
            break;
            
          case 'waterAlert':
          case 'proteinAlert':
            if (this.data.systemNotifications[newKey]) {
              this.data.systemNotifications[newKey].enabled = legacyValue === 'true';
              if (legacyValue === 'true' && this.data.systemNotifications[newKey].days.length === 0) {
                this.data.systemNotifications[newKey].days = [1, 2, 3, 4, 5];
              }
            }
            break;
            
          case 'waterInterval':
            if (this.data.systemNotifications[newKey]) {
              this.data.systemNotifications[newKey].enabled = legacyValue === 'true';
              if (legacyValue === 'true' && this.data.systemNotifications[newKey].days.length === 0) {
                this.data.systemNotifications[newKey].days = [1, 2, 3, 4, 5];
              }
            }
            
            const interval = localStorage.getItem('notification_water_interval');
            if (interval && !isNaN(parseInt(interval))) {
              this.data.systemNotifications.waterInterval.interval = parseInt(interval);
            }
            break;
        }
      }
    });
    
    if ('Notification' in window && Notification.permission === 'granted') {
      this.data.globalEnabled = true;
      migrated = true;
    }
    
    if (migrated) {
      this.saveData();
      Object.values(this.legacyNotificationKeys).forEach(key => {
        localStorage.removeItem(key);
      });
      console.log('Migrated legacy notification settings to reminders system');
    }
  }
  
  /**
   * Attach form event listeners
   */
  attachFormEventListeners() {
    // Repeat dropdown change
    const repeatSelect = document.getElementById('reminder-repeat');
    if (repeatSelect) {
      repeatSelect.addEventListener('change', (e) => {
        const weeklyDaysGroup = document.getElementById('weekly-days-group');
        if (weeklyDaysGroup) {
          weeklyDaysGroup.style.display = e.target.value === 'weekly' ? 'block' : 'none';
        }
      });
    }
    
    // Add time button (a fresh element each render, so binding it here is
    // once per element)
    const addTimeBtn = document.getElementById('add-time-btn');
    if (addTimeBtn) {
      addTimeBtn.addEventListener('click', () => {
        this.addTime();
      });
    }

    // Add alert button
    const addAlertBtn = document.getElementById('add-alert-btn');
    if (addAlertBtn) {
      addAlertBtn.addEventListener('click', () => {
        this.addAlertTime();
      });
    }

    // The ✕ buttons on times and alerts are handled by handlePanelClick(),
    // bound once in initializeEventListeners().
  }
  
  /**
   * Add alert time
   */
  addAlertTime() {
    const container = document.getElementById('alerts-container');
    if (!container) return;
    
    const alertCount = container.querySelectorAll('.alert-item').length;
    if (alertCount >= 5) {
      utils.showToast('Maximum 5 alerts allowed per reminder', 'warning');
      return;
    }
    
    const newAlert = document.createElement('div');
    newAlert.className = 'alert-item';
    newAlert.dataset.index = alertCount;
    newAlert.innerHTML = `
      <select class="alert-select" data-index="${alertCount}">
        <option value="0">At time of reminder</option>
        <option value="5">5 minutes before</option>
        <option value="15">15 minutes before</option>
        <option value="30">30 minutes before</option>
        <option value="60">1 hour before</option>
        <option value="120">2 hours before</option>
        <option value="1440">1 day before</option>
      </select>
      <button type="button" class="remove-alert-btn" data-index="${alertCount}">
        <i class="material-icons-round">close</i>
      </button>
    `;
    
    container.appendChild(newAlert);
  }
  
  /**
   * Remove alert time
   */
  removeAlertTime(index) {
    // Scoped to the alerts container. Unscoped, this matched the time row
    // with the same index first, failed the class check, and silently did
    // nothing - so alert rows could not be removed while two times existed.
    const alertItem = document.querySelector(`#alerts-container .alert-item[data-index="${index}"]`);
    if (alertItem && alertItem.classList.contains('alert-item')) {
      alertItem.remove();
      
      // Reindex remaining alerts
      document.querySelectorAll('.alert-item').forEach((item, i) => {
        item.dataset.index = i;
        item.querySelector('.alert-select').dataset.index = i;
        const removeBtn = item.querySelector('.remove-alert-btn');
        if (removeBtn) {
          removeBtn.dataset.index = i;
        }
      });
    }
  }
  
  /**
   * Save custom reminder with multiple times support
   */
  saveCustomReminder() {
    const title = document.getElementById('reminder-title')?.value?.trim();
    const date = document.getElementById('reminder-date')?.value;
    const repeat = document.getElementById('reminder-repeat')?.value;
    const notes = document.getElementById('reminder-notes')?.value?.trim();
    
    // Get time window values
    const startTime = document.getElementById('custom-start-time')?.value || '00:00';
    const endTime = document.getElementById('custom-end-time')?.value || '23:59';
    
    if (!title) {
      utils.showToast('Please enter a reminder title', 'error');
      return;
    }
    
    // Get all times
    const times = [];
    document.querySelectorAll('#times-container .reminder-time-input').forEach(input => {
      const time = input.value;
      if (time && !times.includes(time)) {
        times.push(time);
      }
    });
    
    if (times.length === 0) {
      utils.showToast('Please set at least one time', 'error');
      return;
    }
    
    // Validate time window
    if (startTime === endTime) {
      utils.showToast('Start time and end time cannot be the same', 'error');
      return;
    }
    
    // A one-time reminder needs a date. Without one it used to save happily,
    // show as enabled, and never schedule anything.
    if (repeat === 'none' && !date) {
      utils.showToast('Please pick a date for a one-time reminder', 'error');
      return;
    }

    if (repeat === 'none' && utils.parseDateKey(date) < utils.startOfToday()) {
      utils.showToast('That date has already passed', 'error');
      return;
    }

    // Get selected days for weekly repeat
    let days = [];
    if (repeat === 'weekly') {
      const activeDayToggles = document.querySelectorAll('.day-toggle.active:not([data-type])');
      days = Array.from(activeDayToggles).map(toggle => parseInt(toggle.dataset.day));
      if (days.length === 0) {
        utils.showToast('Please select at least one day for weekly reminders', 'error');
        return;
      }
    }
    
    // Get alert times
    const alerts = [];
    document.querySelectorAll('.alert-select').forEach(select => {
      alerts.push(parseInt(select.value));
    });
    
    // Create or update reminder
    const reminderData = {
      title,
      times, // Use times array instead of single time
      repeat,
      alerts,
      notes,
      enabled: true,
      days: repeat === 'weekly' ? days : [],
      date: repeat === 'none' && date ? date : null,
      activeWindow: { start: startTime, end: endTime }
    };
    
    if (this.currentView === 'edit-custom' && this.editingReminderId) {
      // Update existing reminder
      const index = this.data.customReminders.findIndex(r => r.id === this.editingReminderId);
      if (index !== -1) {
        this.data.customReminders[index] = {
          ...this.data.customReminders[index],
          ...reminderData
        };
        utils.showToast('Reminder updated', 'success');
      }
    } else {
      // Add new reminder
      reminderData.id = this.generateUniqueId();
      this.data.customReminders.push(reminderData);
      utils.showToast('Reminder created', 'success');
    }
    
    // Save and reschedule
    this.saveData();
    this.scheduleAllReminders();
    
    // Go back to main view
    this.backToMain();
  }
  
  /**
   * Delete custom reminder
   */
  async deleteCustomReminder() {
    if (!this.editingReminderId) return;

    const confirmed = await utils.confirm(
      'This reminder will be removed and will stop firing.',
      { title: 'Delete this reminder?', confirmText: 'Delete', danger: true }
    );

    if (confirmed) {
      const index = this.data.customReminders.findIndex(r => r.id === this.editingReminderId);
      if (index !== -1) {
        this.clearCustomReminderTimer(this.editingReminderId);
        this.data.customReminders.splice(index, 1);
        this.saveData();
        utils.showToast('Reminder deleted', 'warning');
        this.backToMain();
      }
    }
  }
  
  /**
   * Generate unique ID for reminders
   */
  generateUniqueId() {
    return 'reminder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  /**
   * Render custom reminder modal with multiple times support
   */
  renderCustomReminderModal(isEdit = false) {
    const reminder = isEdit && this.editingReminderId ? 
      this.data.customReminders.find(r => r.id === this.editingReminderId) : null;
    
    const html = `
      <div class="panel-header">
        <button class="back-btn icon-btn" id="back-to-main">
          <i class="material-icons-round">arrow_back</i>
        </button>
        <h3>${isEdit ? 'Edit' : 'New'} Reminder</h3>
        ${isEdit ? `<button class="delete-reminder-btn icon-btn" id="delete-reminder">
          <i class="material-icons-round">delete</i>
        </button>` : '<div></div>'}
      </div>
      
      <div class="custom-reminder-form">
        <!-- Title -->
        <div class="form-group">
          <input type="text" 
                 id="reminder-title" 
                 class="reminder-title-input" 
                 placeholder="Reminder title"
                 value="${reminder ? utils.escapeHtml(reminder.title) : ''}"
                 maxlength="100">
        </div>
        
        <!-- Date & Time -->
        <div class="form-group">
          <label class="form-label">Date & Time</label>
          <div class="date-time-group">
            <input type="date" 
                   id="reminder-date" 
                   class="reminder-date-input"
                   value="${reminder && reminder.date ? reminder.date : ''}">
          </div>
        </div>
        
        <!-- Multiple Times -->
        <div class="form-group">
          <label class="form-label">Times</label>
          <div class="times-container" id="times-container">
            ${this.renderTimesList(reminder ? reminder.times : ['12:00'])}
          </div>
          <button type="button" class="add-time-btn" id="add-time-btn">
            <i class="material-icons-round">add</i> Add Time
          </button>
        </div>
        
        <!-- Active Hours -->
        <div class="form-group">
          <label class="form-label">Active Hours</label>
          <div class="time-window-group">
            <input type="time" 
                   id="custom-start-time" 
                   class="reminder-time-input"
                   value="${reminder && reminder.activeWindow ? reminder.activeWindow.start : '00:00'}"
                   title="Start time">
            <span class="time-window-separator">to</span>
            <input type="time" 
                   id="custom-end-time" 
                   class="reminder-time-input"
                   value="${reminder && reminder.activeWindow ? reminder.activeWindow.end : '23:59'}"
                   title="End time">
          </div>
          <p class="form-help-text">Set the time range when you want to receive this reminder</p>
        </div>
        
        <!-- Repeat -->
        <div class="form-group">
          <label class="form-label">Repeat</label>
          <select id="reminder-repeat" class="reminder-repeat-select">
            <option value="none" ${!reminder || reminder.repeat === 'none' ? 'selected' : ''}>Never</option>
            <option value="daily" ${reminder && reminder.repeat === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${reminder && reminder.repeat === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="monthly" ${reminder && reminder.repeat === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="yearly" ${reminder && reminder.repeat === 'yearly' ? 'selected' : ''}>Yearly</option>
          </select>
        </div>
        
        <!-- Days (for weekly repeat) -->
        <div class="form-group" id="weekly-days-group" style="display: ${reminder && reminder.repeat === 'weekly' ? 'block' : 'none'}">
          <label class="form-label">Days</label>
          ${this.renderCustomDaysSelector(reminder ? reminder.days : [])}
        </div>
        
        <!-- Alert Times -->
        <div class="form-group">
          <label class="form-label">Alert</label>
          <div class="alerts-container" id="alerts-container">
            ${this.renderAlertsList(reminder ? reminder.alerts : [0])}
          </div>
          <button type="button" class="add-alert-btn" id="add-alert-btn">
            <i class="material-icons-round">add</i> Add Alert
          </button>
        </div>
        
        <!-- Notes -->
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea id="reminder-notes" 
                    class="reminder-notes-input" 
                    placeholder="Additional details..."
                    maxlength="500">${reminder ? utils.escapeHtml(reminder.notes || '') : ''}</textarea>
        </div>
        
        <!-- Save Button -->
        <button class="save-reminder-btn" id="save-reminder">
          ${isEdit ? 'Update' : 'Save'} Reminder
        </button>
      </div>
    `;
    
    this.elements.remindersPanel.innerHTML = html;
  }
  
  /**
   * Render times list for multiple times
   */
  renderTimesList(times) {
    return times.map((time, index) => `
      <div class="time-item" data-index="${index}">
        <input type="time" 
               class="reminder-time-input" 
               value="${time}"
               data-index="${index}">
        ${times.length > 1 ? `<button type="button" class="remove-time-btn" data-index="${index}">
          <i class="material-icons-round">close</i>
        </button>` : ''}
      </div>
    `).join('');
  }
  
  /**
   * Render alerts list for form
   */
  renderAlertsList(alerts) {
    return alerts.map((minutes, index) => `
      <div class="alert-item" data-index="${index}">
        <select class="alert-select" data-index="${index}">
          <option value="0" ${minutes === 0 ? 'selected' : ''}>At time of reminder</option>
          <option value="5" ${minutes === 5 ? 'selected' : ''}>5 minutes before</option>
          <option value="15" ${minutes === 15 ? 'selected' : ''}>15 minutes before</option>
          <option value="30" ${minutes === 30 ? 'selected' : ''}>30 minutes before</option>
          <option value="60" ${minutes === 60 ? 'selected' : ''}>1 hour before</option>
          <option value="120" ${minutes === 120 ? 'selected' : ''}>2 hours before</option>
          <option value="1440" ${minutes === 1440 ? 'selected' : ''}>1 day before</option>
        </select>
        ${alerts.length > 1 ? `<button type="button" class="remove-alert-btn" data-index="${index}">
          <i class="material-icons-round">close</i>
        </button>` : ''}
      </div>
    `).join('');
  }
}
