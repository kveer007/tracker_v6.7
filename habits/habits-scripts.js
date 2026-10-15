/**
 * Health & Habit Tracker App - Habits Functionality
 * This file contains the implementation of the habits tracker functionality
 */

// Day-cell glyphs, shared by the day strip and the toggle handlers.
const HABIT_ICON_DONE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const HABIT_ICON_FAIL = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

/**
 * HabitsTracker class for tracking daily habits
 */
class HabitsTracker {
  /**
   * Create a new habits tracker - FIXED VERSION
   */
  constructor() {
    try {
      // Define storage keys
      this.habitsKey = 'habits_data';
      this.lastResetKey = `${STORAGE_KEYS.LAST_RESET_PREFIX}habits`;
      
      // Initialize variables
      this.habits = [];
      this.selectedColor = 'default';
      this.longPressTimer = null;
      this.currentHabitIndex = -1;
      this.DAYS_TO_SHOW = 4; // replaced by calculateDaysToShow() during init
      this.isRearranging = false;
      this.dragSrcElement = null;
      this.dragSrcIndex = null;
      this.isEditing = false;
      this.isCalendarEditing = false;
      this.calendarStrip = null; // MonthCalendarStrip, set up in initElements()
      this.currentDateOffset = 0;
      this.selectedTimePeriod = 'weekly'; // Default selected time period
      this.midnightResetTimeout = null;
      this.chartObserver = null;
      
      // For touch event handling
      this.longPressContext = null;
      this.touchOrigin = null;
      this.touchMoveHandler = null;
      
      console.log('HabitsTracker: Starting initialization...');
      
      // Load habits data
      this.loadHabits();
      
      // Initialize UI elements with error handling
      try {
        this.initElements();
      } catch (elemError) {
        console.warn('Element initialization failed:', elemError);
      }
      
      // CRITICAL: Always set up modal regardless of other failures
      this.ensureModalWorks();
      
      // Initialize event listeners
      this.initEventListeners();
      
      // Set up core functionality
      this.checkAndResetDailyHabits();
      this.DAYS_TO_SHOW = this.calculateDaysToShow();
      this.updateDateSelector();
      this.renderHabits();

      // Initialize midnight reset
      this.setupMidnightReset();
      
      // Enhanced touch events (with error handling)
      try {
        this.enhanceTouchEvents();
      } catch (touchError) {
        console.warn('Touch events setup failed:', touchError);
      }
      
      console.log('HabitsTracker: Initialization complete');
      
    } catch (error) {
      console.error('HabitsTracker initialization failed:', error);
      // Fallback: ensure modal still works
      this.ensureModalWorks();
    }
  }
  
  /**
   * CRITICAL: Ensure modal always works - NEW METHOD
   */
  ensureModalWorks() {
    // The tracker is constructed from DOMContentLoaded, so the markup is
    // already parsed - no need to defer this.
    const modal = document.getElementById('add-habit-modal');

    if (!modal) {
      console.warn('Habit modal markup missing');
      return;
    }

    // Ensure modal is positioned correctly
    modal.style.position = 'fixed';
    modal.style.zIndex = '10000';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
  }

  /**
   * Unified modal display method - NEW METHOD
   */
  showModal(isEditMode = false) {
    const modal = document.getElementById('add-habit-modal');
    if (!modal) return;
    
    // Set mode
    this.isEditing = isEditMode;
    
    if (isEditMode) {
      // Edit mode
      const habit = this.habits[this.currentHabitIndex];
      if (!habit) return;
      
      document.getElementById('modal-title').textContent = 'Edit Habit';
      document.getElementById('habit-name-input').value = habit.name;
      document.getElementById('habits-confirm-button').textContent = 'Save';
      this.selectColor(habit.color);
    } else {
      // Add mode
      document.getElementById('modal-title').textContent = 'Add New Habit';
      document.getElementById('habit-name-input').value = '';
      document.getElementById('habits-confirm-button').textContent = 'Add';
      this.selectColor('default');
    }
    
    // Show modal
    modal.style.display = 'flex';
    
    // Focus input
    setTimeout(() => {
      document.getElementById('habit-name-input').focus();
    }, 100);
  }
  
  /**
   * Initialize DOM elements
   */
  initElements() {
    // Main views
    this.mainView = document.getElementById('habits-main-view');
    this.detailView = document.getElementById('habits-detail-view');
    
    // Main elements
    this.habitsContainer = document.getElementById('habits-container');
    this.dateSelector = document.getElementById('habits-date-selector');
    
    // Modal elements
    this.addHabitModal = document.getElementById('add-habit-modal');
    this.habitNameInput = document.getElementById('habit-name-input');
    this.modalTitle = document.getElementById('modal-title');
    this.confirmButton = document.getElementById('habits-confirm-button');
    
    // Detail view elements
    this.habitDetailTitle = document.getElementById('habit-detail-title');
    this.habitChart = document.getElementById('habit-chart');
    this.chartLabels = document.getElementById('habits-chart-labels');
    this.calendarScrollContent = document.getElementById('habits-calendar-scroll-content');
    this.habitStreaks = document.getElementById('habit-streaks');

    // The History calendar (core/calendar.js), shared with Workout Analytics.
    if (this.calendarScrollContent) {
      this.calendarStrip = new MonthCalendarStrip({
        content: this.calendarScrollContent,
        decorateCell: (cell, dateKey, isFuture) => this.decorateCalendarCell(cell, dateKey, isFuture)
      });
    }
  }
  
  /**
   * Initialize event listeners - FIXED VERSION
   */
  initEventListeners() {
    // Every one of these is bound exactly once, here. The detail-view buttons
    // read this.currentHabitIndex when clicked, so they do not need rebinding
    // per habit - which is what the old clone-and-replace dance was working
    // around, at the cost of silently discarding any other listener on those
    // nodes.
    const bind = (id, handler) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', handler);
      } else {
        console.warn(`Habits: missing element #${id}`);
      }
    };

    bind('habits-add-button', () => this.showModal(false));
    bind('habits-rearrange-button', () => this.toggleRearrange());
    bind('habits-cancel-button', () => this.closeModal());
    bind('habits-confirm-button', () => this.handleModalConfirm());
    bind('habits-back-button', () => this.showMainView());
    bind('habits-edit-button', () => this.showModal(true));
    bind('habits-delete-button', () => this.deleteCurrentHabit());
    bind('habits-edit-calendar-button', () => this.toggleCalendarEdit());

    // Day taps in calendar edit mode, for every month the strip ever holds.
    if (this.calendarScrollContent) {
      this.calendarScrollContent.addEventListener('click', (e) => this.handleCalendarCellClick(e));
    }

    // Color selection
    document.querySelectorAll('.habits-color-option').forEach(option => {
      option.addEventListener('click', () => this.selectColor(option.dataset.color));
    });
    
    // Enter key on input
    this.habitNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleModalConfirm();
      }
    });
    
    // Close modal when clicking backdrop
    const modal = document.getElementById('add-habit-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal();
        }
      });
    }
    
    // Add time period selector event listener
    const timePeriodSelector = document.getElementById('graph-time-period');
    if (timePeriodSelector) {
      timePeriodSelector.addEventListener('change', (e) => {
        this.selectedTimePeriod = e.target.value;
        // Re-render the chart with the new time period if a habit is selected
        if (this.currentHabitIndex >= 0) {
          this.renderChart(this.habits[this.currentHabitIndex]);
        }
      });
    }
  }
  
  /**
   * Enhanced touch event handling for better mobile experience
   */
  enhanceTouchEvents() {
    // NOTE: there used to be a document-wide touchstart listener here that
    // called preventDefault() on any touch starting on a habit day. That
    // stopped text selection during a long-press, but it also stopped the
    // page scrolling whenever a drag began on a tick or cross - most of the
    // habit list. Selection is now prevented in CSS instead (user-select and
    // -webkit-touch-callout on .habit-day), and a drag of more than 10px
    // cancels the long-press (startLongPress), so scrolling never ticks a day.

    // Block context menu on habit days. Without the touchstart block above,
    // Android raises one on a long-press; cancelling it keeps the touch going
    // so the 600 ms long-press can finish.
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.habit-day')) {
        e.preventDefault();
      }
    });
    
    // Clear any ongoing longpress when page is scrolled
    document.addEventListener('scroll', () => {
      this.endLongPress();
    }, { passive: true });
    
    // Recalculate how many days fit whenever the viewport changes shape.
    const relayout = () => {
      const days = this.calculateDaysToShow();
      const changed = days !== this.DAYS_TO_SHOW;
      this.DAYS_TO_SHOW = days;

      // Always re-run the alignment pass; only redraw the grid if the column
      // count actually changed.
      if (changed) {
        this.updateDateSelector();
        this.renderHabits();
      } else {
        this.alignDateItemsWithHabitDays();
      }
    };

    window.addEventListener('orientationchange', () => setTimeout(relayout, 300));

    // Debounced, because resize fires continuously while a window is dragged.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(relayout, 150);
    });
  }
  
  /**
   * Get date key for storage
   * @param {Date} date - Date to format
   * @returns {string} Formatted date
   */
  getDateKey(date) {
    return utils.formatDate(date);
  }

  /**
   * Retry drawing the chart shortly, for the case where the detail view has
   * only just been shown and layout has not settled.
   *
   * Bounded, unlike the old open-ended 100ms retry: if the chart is still not
   * on screen after a few frames, nobody is looking at it and the next call to
   * showHabitDetail() will draw it.
   *
   * @param {Object} habit
   */
  deferChartRender(habit) {
    if (this.chartRetries === undefined) this.chartRetries = 0;
    if (this.chartRetries >= 5) {
      this.chartRetries = 0;
      return;
    }

    this.chartRetries++;
    // setTimeout, not requestAnimationFrame - rAF does not fire while the page
    // is not being rendered, which would leave the chart permanently blank.
    setTimeout(() => {
      if (this.habitChart && this.habitChart.offsetWidth > 0) {
        this.chartRetries = 0;
        this.renderChart(habit);
      } else {
        this.deferChartRender(habit);
      }
    }, 50);
  }

  /**
   * Next status in the tap cycle: a plain toggle between done and not done.
   *
   * A day with no record reads as not done, exactly like an explicit miss -
   * so unticking a day puts a cross back rather than blanking the square.
   *
   * @param {string|undefined} current
   * @returns {string} Next status
   */
  nextStatus(current) {
    return current === 'done' ? 'fail' : 'done';
  }

  /**
   * Write a status into a habit's history.
   *
   * A null status removes the key entirely. Nothing in the tap cycle does
   * that - it exists so Undo can restore a day that had no record before.
   *
   * @param {Object} habit
   * @param {string} dateKey
   * @param {string|null} status
   */
  setHabitStatus(habit, dateKey, status) {
    if (!habit.history) habit.history = {};

    if (status === null) {
      delete habit.history[dateKey];
    } else {
      habit.history[dateKey] = status;
    }
  }

  /**
   * Paint a day cell to match a status. One place, so the day strip and both
   * toggle handlers can never drift apart.
   *
   * @param {Element} element
   * @param {string|undefined|null} status
   * @param {string} color - Habit colour class
   * @param {Date|string} date - For the accessible label
   */
  applyDayStatus(element, status, color, date) {
    element.classList.remove('done', 'fail');
    if (color) element.classList.remove(color);

    let label;
    if (status === 'done') {
      element.classList.add('done');
      if (color) element.classList.add(color);
      element.innerHTML = HABIT_ICON_DONE;
      label = 'Completed';
    } else {
      // Anything that is not done - an explicit miss or no record at all -
      // shows a cross.
      element.classList.add('fail');
      element.innerHTML = HABIT_ICON_FAIL;
      label = 'Not completed';
    }

    const readable = date instanceof Date
      ? date.toLocaleDateString()
      : utils.parseDateKey(date).toLocaleDateString();
    element.setAttribute('aria-label', `${label} on ${readable}`);
  }

  /**
   * How many days fit in the habit strip at the current viewport width.
   *
   * Was a fixed 4 regardless of screen, so a landscape phone or a tablet
   * showed the same four columns with the rest of the row empty.
   *
   * @returns {number}
   */
  calculateDaysToShow() {
    const width = window.innerWidth;
    if (width >= 900) return 7;
    if (width >= 700) return 6;
    if (width >= 520) return 5;
    return 4;
  }
  
/**
 * Update date selector with days to show
 */
updateDateSelector() {
  if (!this.dateSelector) return;
  
  this.dateSelector.innerHTML = '';
  
  // Create date-navigation container with fixed width
  const navContainer = document.createElement('div');
  navContainer.className = 'date-navigation';
  
  // Add 'show-navigation' class if we've navigated away from today
  if (this.currentDateOffset > 0) {
    navContainer.classList.add('show-navigation');
  }
  
  // Create back button
  const backButton = document.createElement('button');
  backButton.className = 'date-nav-button date-nav-back';
  backButton.innerHTML = '&lt;';
  backButton.title = "Show earlier dates";
  backButton.addEventListener('click', () => {
    this.currentDateOffset += 1; // CHANGED: from this.DAYS_TO_SHOW to 1
    // Add the show-navigation class to reveal other buttons
    document.querySelector('.date-navigation').classList.add('show-navigation');
    this.updateDateSelector();
    this.renderHabits();
  });
  
  // Create "Today" button - masked initially
  const todayButton = document.createElement('button');
  todayButton.className = 'date-nav-button today-button';
  todayButton.textContent = 'Today';
  todayButton.title = "Return to today";
  todayButton.addEventListener('click', () => {
    this.currentDateOffset = 0;
    // Remove the show-navigation class when returning to today
    document.querySelector('.date-navigation').classList.remove('show-navigation');
    this.updateDateSelector();
    this.renderHabits();
  });
  
  // Create forward button - masked initially, and disabled when on latest dates
  const forwardButton = document.createElement('button');
  forwardButton.className = 'date-nav-button date-nav-forward';
  forwardButton.innerHTML = '&gt;';
  forwardButton.title = "Show later dates";
  
  // Disable forward button when on latest dates
  if (this.currentDateOffset <= 0) {
    forwardButton.disabled = true;
    forwardButton.classList.add('disabled');
  }
  
  forwardButton.addEventListener('click', () => {
    this.currentDateOffset = Math.max(0, this.currentDateOffset - 1); // CHANGED: from this.DAYS_TO_SHOW to 1
    
    // If we've returned to today, hide navigation
    if (this.currentDateOffset === 0) {
      document.querySelector('.date-navigation').classList.remove('show-navigation');
    }
    
    this.updateDateSelector();
    this.renderHabits();
  });
  
  // Add all buttons to navigation container
  navContainer.appendChild(backButton);
  navContainer.appendChild(todayButton);
  navContainer.appendChild(forwardButton);
  
  // Create wrapper for navigation and dates
  const dateDisplayWrapper = document.createElement('div');
  dateDisplayWrapper.className = 'date-display-wrapper';
  
  // Create dates container
  const datesContainer = document.createElement('div');
  datesContainer.className = 'dates-container';
  
  // Calculate dates based on offset
  const today = new Date();
  
  for (let i = this.DAYS_TO_SHOW - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i - this.currentDateOffset);
    
    const dateElement = document.createElement('div');
    dateElement.className = 'date-item';
    
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    dateElement.innerHTML = `
      <div class="day-name">${days[date.getDay()]}</div>
      <div class="day-number">${date.getDate()}</div>
    `;
    
    datesContainer.appendChild(dateElement);
  }
  
  // Add date navigation and dates to the wrapper
  dateDisplayWrapper.appendChild(navContainer);
  dateDisplayWrapper.appendChild(datesContainer);
  
  // Add wrapper to main selector
  this.dateSelector.appendChild(dateDisplayWrapper);
  
  // Ensure equal width distribution of date items to match habit days
  this.alignDateItemsWithHabitDays();
}

/**
 * Align date items with habit days for perfect alignment
 */
alignDateItemsWithHabitDays() {
  // Using setTimeout to ensure the DOM has been updated
  setTimeout(() => {
    const dateItems = document.querySelectorAll('.date-item');
    const habitDays = document.querySelectorAll('.habit-day');
    
    if (dateItems.length > 0 && habitDays.length > 0) {
      // Get the first habit's days for measurements
      const firstHabitDays = Array.from(habitDays).slice(0, this.DAYS_TO_SHOW);
      
      // Apply widths to match
      dateItems.forEach((item, index) => {
        if (firstHabitDays[index]) {
          const habitDayWidth = firstHabitDays[index].offsetWidth;
          item.style.width = `${habitDayWidth}px`;
        }
      });
    }
  }, 0);
}

  /**
 * Load habits from localStorage
 */
loadHabits() {
  const storedHabits = storageManager.readJSON(this.habitsKey, null);

  if (!Array.isArray(storedHabits)) {
    // Start with empty habits array - no defaults
    this.habits = [];
    return;
  }

  // Normalise on the way in, so nothing downstream has to defend itself.
  //
  // Rendering reads habit.name, habit.color and habit.history directly. A
  // record missing any of them - from an old version, a hand-edited backup, a
  // partial write - used to throw mid-render and leave the tab blank. Repair
  // what is repairable and drop what is not.
  const repaired = [];
  let changed = false;

  storedHabits.forEach(habit => {
    if (!habit || typeof habit !== 'object' || Array.isArray(habit)) {
      changed = true;
      return;
    }

    const clean = {
      name: typeof habit.name === 'string' && habit.name.trim() ? habit.name : 'Untitled habit',
      color: typeof habit.color === 'string' && habit.color ? habit.color : 'default',
      history: {}
    };

    if (clean.name !== habit.name || clean.color !== habit.color) changed = true;

    // History must be a flat map of date key -> 'done' | 'fail'.
    if (habit.history && typeof habit.history === 'object' && !Array.isArray(habit.history)) {
      Object.entries(habit.history).forEach(([date, status]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          changed = true;
          return;
        }
        if (status === 'done' || status === 'fail') {
          clean.history[date] = status;
        } else {
          changed = true;
        }
      });
    } else if (habit.history !== undefined) {
      changed = true;
    }

    repaired.push(clean);
  });

  this.habits = repaired;

  if (changed) {
    console.warn('Repaired malformed habit records on load');
    this.saveHabits();
  }
}
  
  /**
   * Save habits to localStorage with storage quota handling
   */
  saveHabits() {
    // Check if we're low on storage space
    if (storageManager && storageManager.isNearQuota && storageManager.isNearQuota()) {
      // Try to clean up old data
      const cleaned = storageManager.cleanupOldData();
      
      if (!cleaned) {
        utils.showToast('Storage space is running low. Old habit history may be archived.', 'warning');
        
        // Keep only last 30 days of history for each habit
        this.habits.forEach(habit => {
          if (habit.history) {
            const dates = Object.keys(habit.history).sort();
            if (dates.length > 30) {
              const datesToRemove = dates.slice(0, dates.length - 30);
              datesToRemove.forEach(date => {
                delete habit.history[date];
              });
            }
          }
        });
      }
    }
    
    try {
      localStorage.setItem(this.habitsKey, JSON.stringify(this.habits));
    } catch (error) {
      // Handle storage errors
      if (error.name === 'QuotaExceededError' || 
          error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
          error.code === 22) {
        utils.showToast('Not enough storage space. Some habit history may be lost.', 'error');
        
        // Aggressive cleanup - remove all history except current month
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        this.habits.forEach(habit => {
          if (habit.history) {
            Object.keys(habit.history).forEach(dateKey => {
              const date = utils.parseDateKey(dateKey);
              if (date.getMonth() !== currentMonth || date.getFullYear() !== currentYear) {
                delete habit.history[dateKey];
              }
            });
          }
        });
        
        // Try again
        try {
          localStorage.setItem(this.habitsKey, JSON.stringify(this.habits));
        } catch (error2) {
          // Last resort - only keep today's data
          const today = utils.formatDate(new Date());
          
          this.habits.forEach(habit => {
            const todayStatus = habit.history && habit.history[today];
            habit.history = {};
            if (todayStatus) {
              habit.history[today] = todayStatus;
            }
          });
          
          try {
            localStorage.setItem(this.habitsKey, JSON.stringify(this.habits));
            utils.showToast('Storage space critically low. Only today\'s data kept.', 'error');
          } catch (error3) {
            utils.showToast('Unable to save habits data. Please export your data.', 'error');
          }
        }
      } else {
        utils.showToast(`Error saving habits: ${error.message}`, 'error');
      }
    }
  }
  
  /**
   * Enhanced long press handling with better touch support
   */
  startLongPress(habitIndex, dateKey, event, element) {
    // Clear any previous longpress
    this.endLongPress();
    
    // Store context for cleanup
    this.longPressContext = {
      element: element,
      timer: null
    };
    
    // Add visual feedback
    element.classList.add('longpress');
    
    // Set touch origin for better UX
    if (event.type === 'touchstart' && event.touches && event.touches[0]) {
      this.touchOrigin = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    }
    
    // Mouse only: stops a press-and-drag selecting text. Never on touch -
    // cancelling touchstart is what stopped the page scrolling from a cell.
    if (event.type === 'mousedown' && event.preventDefault) {
      event.preventDefault();
    }

    // Add touchmove listener to detect movement and cancel longpress if needed
    const touchMoveHandler = (moveEvent) => {
      if (moveEvent.touches && moveEvent.touches[0] && this.touchOrigin) {
        const touch = moveEvent.touches[0];
        const deltaX = Math.abs(touch.clientX - this.touchOrigin.x);
        const deltaY = Math.abs(touch.clientY - this.touchOrigin.y);
        
        // If moved more than 10px, cancel longpress
        if (deltaX > 10 || deltaY > 10) {
          this.endLongPress();
          document.removeEventListener('touchmove', touchMoveHandler);
        }
      }
    };
    
    document.addEventListener('touchmove', touchMoveHandler);
    
    // Store reference for cleanup
    this.touchMoveHandler = touchMoveHandler;
    
    // Start longpress timer
    this.longPressContext.timer = setTimeout(() => {
      // Get the habit
      const habit = this.habits[habitIndex];
      if (!habit) return;
      
      // Cycle status
      const previousStatus = habit.history ? habit.history[dateKey] : undefined;
      const newStatus = this.nextStatus(previousStatus);
      this.setHabitStatus(habit, dateKey, newStatus);

      // Update the cell appearance directly instead of re-rendering
      this.applyDayStatus(element, newStatus, habit.color, dateKey);

      // Save changes
      this.saveHabits();
      this.offerHabitUndo(habit, dateKey, previousStatus, element);

      // Add haptic feedback if available
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50); // Short vibration for feedback
      }
      
      // Clean up event listeners
      document.removeEventListener('touchmove', touchMoveHandler);
      
      // Add a slight delay before removing visual feedback
      setTimeout(() => {
        if (element) {
          element.classList.remove('longpress');
        }
      }, 200);
    }, 600); // Slightly longer delay for better UX (600ms instead of 500ms)
  }
  
  /**
   * Enhanced end long press with better cleanup
   */
  endLongPress(event) {
    // Cancelling touchend stops the browser following a tap with emulated
    // mouse events, whose mousedown would start a second long-press. Only
    // when allowed: a touchend that ends a scroll is not cancelable, and
    // trying anyway logs a console warning.
    if (event && event.cancelable && event.preventDefault) {
      event.preventDefault();
    }

    // Clear timer
    if (this.longPressContext && this.longPressContext.timer) {
      clearTimeout(this.longPressContext.timer);
      this.longPressContext.timer = null;
    }
    
    // Remove visual feedback
    if (this.longPressContext && this.longPressContext.element) {
      this.longPressContext.element.classList.remove('longpress');
    }
    
    // Clean up touchmove listener
    if (this.touchMoveHandler) {
      document.removeEventListener('touchmove', this.touchMoveHandler);
      this.touchMoveHandler = null;
    }
    
    // Reset context
    this.longPressContext = null;
    this.touchOrigin = null;
  }
  
  /**
   * Handle click events on habit days (separate from longpress)
   * This allows for accessibility with standard clicks too
   */
  handleHabitDayClick(habitIndex, dateKey, element) {
    // Only trigger on regular clicks, not as part of longpress
    if (this.longPressTimer) return;
    
    const habit = this.habits[habitIndex];
    if (!habit) return;

    const previousStatus = habit.history ? habit.history[dateKey] : undefined;
    const newStatus = this.nextStatus(previousStatus);
    this.setHabitStatus(habit, dateKey, newStatus);

    // Update the UI directly
    this.applyDayStatus(element, newStatus, habit.color, dateKey);

    // Save changes
    this.saveHabits();
    this.offerHabitUndo(habit, dateKey, previousStatus, element);
  }

  /**
   * Offer to put a habit day back the way it was.
   *
   * @param {Object} habit
   * @param {string} dateKey
   * @param {string|undefined} previousStatus
   * @param {Element} element - Cell to repaint on undo
   */
  offerHabitUndo(habit, dateKey, previousStatus, element) {
    const readable = utils.parseDateKey(dateKey).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric'
    });

    utils.showUndoToast(`${habit.name} - ${readable}`, () => {
      this.setHabitStatus(habit, dateKey, previousStatus === undefined ? null : previousStatus);
      this.saveHabits();

      // The cell may have been re-rendered since; fall back to a full redraw.
      if (element && element.isConnected) {
        this.applyDayStatus(element, previousStatus, habit.color, dateKey);
      } else {
        this.renderHabits();
      }

      if (this.currentHabitIndex >= 0 && this.habits[this.currentHabitIndex] === habit) {
        this.renderChart(habit);
        this.renderStreaks(habit);
      }
    });
  }
  
  /**
   * Modified function for rendering habits to use new event handling
   */
  renderHabits() {
    if (!this.habitsContainer) return;
    
    this.habitsContainer.innerHTML = '';
    this.habitsContainer.className = this.isRearranging ? 'rearranging' : '';
    
    // Handle empty habits
    if (this.habits.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-habits-message';
      emptyMessage.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
          <p style="font-size: 18px; margin-bottom: 20px;">No habits yet</p>
          <p style="font-size: 14px; margin-bottom: 30px;">Tap the + button to add your first habit</p>
          <button class="action-btn habits" 
                  style="display: inline-block; font-size: 16px;"
                  onclick="window.habitsTracker.showModal(false)">
              Add Habit
          </button>
        </div>
      `;
      this.habitsContainer.appendChild(emptyMessage);
      return;
    }
    
    // Create habit elements
    this.habits.forEach((habit, index) => {
      const habitElement = document.createElement('div');
      habitElement.className = `habit-item ${habit.color}`;
      habitElement.setAttribute('data-index', index);
      
      if (this.isRearranging) {
        habitElement.setAttribute('draggable', 'true');
        habitElement.addEventListener('dragstart', e => this.handleDragStart(e, habitElement, index));
        habitElement.addEventListener('dragover', e => this.handleDragOver(e, habitElement));
        habitElement.addEventListener('dragleave', e => this.handleDragLeave(e, habitElement));
        habitElement.addEventListener('drop', e => this.handleDrop(e, habitElement, index));
        habitElement.addEventListener('dragend', e => this.handleDragEnd(e, habitElement));
      }
      
      // Build habit grid
      let habitGrid = '';
      const today = new Date();
      
      for (let i = this.DAYS_TO_SHOW - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i - this.currentDateOffset);
        const dateKey = this.getDateKey(date);
        
        // Done or not done. No record reads the same as an explicit miss.
        const status = habit.history[dateKey];

        let className = 'fail';
        let symbol = HABIT_ICON_FAIL;
        let label = 'Not completed';

        if (status === 'done') {
          className = `done ${habit.color}`;
          symbol = HABIT_ICON_DONE;
          label = 'Completed';
        }

        habitGrid += `
          <div class="habit-day ${className}"
               data-date="${dateKey}"
               data-habit="${index}"
               role="button"
               tabindex="0"
               aria-label="${label} on ${date.toLocaleDateString()}">
            ${symbol}
          </div>
        `;
      }
      
      habitElement.innerHTML = `
        <div class="habit-name-section">
          <div class="drag-handle">⋮⋮⋮</div>
          <div class="circle"></div>
          <div class="name"></div>
        </div>
        <div class="habit-grid-section">
          <div class="habit-grid">${habitGrid}</div>
        </div>
      `;

      // The name is user input, so it goes in as text, never as markup.
      // Interpolating it into the template above meant a habit called
      // "Run < 5km" rendered broken, and an imported CSV could inject and run
      // arbitrary HTML.
      habitElement.querySelector('.name').textContent = habit.name;

      this.habitsContainer.appendChild(habitElement);
    });
    
    // Add event listeners for habit names and days
    if (!this.isRearranging) {
      document.querySelectorAll('.habit-name-section .name').forEach((nameElement, index) => {
        nameElement.addEventListener('click', () => this.showHabitDetail(index));
        
        // Add keyboard accessibility
        nameElement.setAttribute('tabindex', '0');
        nameElement.setAttribute('role', 'button');
        nameElement.setAttribute('aria-label', `View details for ${this.habits[index].name}`);
        nameElement.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.showHabitDetail(index);
          }
        });
      });
      
      document.querySelectorAll('.habit-day').forEach(dayElement => {
        const habitIndex = parseInt(dayElement.dataset.habit);
        const dateKey = dayElement.dataset.date;
        
        // Touch events for longpress
        dayElement.addEventListener('touchstart', (e) => this.startLongPress(habitIndex, dateKey, e, dayElement));
        dayElement.addEventListener('touchend', (e) => this.endLongPress(e));
        dayElement.addEventListener('touchcancel', (e) => this.endLongPress(e));
        
        // Mouse events for longpress
        dayElement.addEventListener('mousedown', (e) => this.startLongPress(habitIndex, dateKey, e, dayElement));
        dayElement.addEventListener('mouseup', (e) => this.endLongPress(e));
        dayElement.addEventListener('mouseleave', (e) => this.endLongPress(e));
        
        // Keyboard accessibility
        dayElement.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.handleHabitDayClick(habitIndex, dateKey, dayElement);
          }
        });
      });
    }
  }
  
  /**
   * Close modal
   */
  closeModal() {
    const modal = document.getElementById('add-habit-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.selectedColor = 'default';
    this.isEditing = false;
  }
  
  /**
   * Select color for habit
   * @param {string} color - Color to select
   */
  selectColor(color) {
    this.selectedColor = color;
    document.querySelectorAll('.habits-color-option').forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.color === color) {
        option.classList.add('selected');
      }
    });
  }
  
  /**
   * Handle modal confirm button click
   */
  handleModalConfirm() {
    if (this.isEditing) {
      this.editHabit();
    } else {
      this.addHabit();
    }
  }
  
  /**
   * Add a new habit
   */
  addHabit() {
    const habitName = this.habitNameInput.value.trim();
    
    if (!habitName) {
      utils.showToast('Please enter a habit name', 'error');
      return;
    }
    
    this.habits.push({
      name: habitName,
      color: this.selectedColor,
      history: {}
    });
    
    this.saveHabits();
    this.renderHabits();
    this.closeModal();
  }
  
  /**
   * Edit existing habit
   */
  editHabit() {
    const habitName = this.habitNameInput.value.trim();
    
    if (!habitName) {
      utils.showToast('Please enter a habit name', 'error');
      return;
    }
    
    this.habits[this.currentHabitIndex].name = habitName;
    this.habits[this.currentHabitIndex].color = this.selectedColor;
    
    this.saveHabits();
    this.closeModal();
    this.showHabitDetail(this.currentHabitIndex);
  }
  
  /**
   * Toggle rearrange mode
   */
  toggleRearrange() {
    this.isRearranging = !this.isRearranging;
    
    // Toggle active class on rearrange button
    const rearrangeButton = document.getElementById('habits-rearrange-button');
    if (rearrangeButton) {
      if (this.isRearranging) {
        rearrangeButton.classList.add('active');
      } else {
        rearrangeButton.classList.remove('active');
      }
    }
    
    this.renderHabits();
  }
  
  /**
   * Handle drag start event
   * @param {Event} e - Event object
   * @param {Element} element - Element being dragged
   * @param {number} index - Index of the habit
   */
  handleDragStart(e, element, index) {
    this.dragSrcElement = element;
    this.dragSrcIndex = index;
    
    // Firefox needs data to be set
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    
    element.classList.add('dragging');
    
    // Make it work in Firefox
    setTimeout(() => {
      element.style.opacity = '0.5';
    }, 0);
  }
  
  /**
   * Handle drag over event
   * @param {Event} e - Event object
   * @param {Element} element - Element being dragged over
   */
  handleDragOver(e, element) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    element.classList.add('drag-over');
    return false;
  }
  
  /**
   * Handle drag leave event
   * @param {Event} e - Event object
   * @param {Element} element - Element being dragged from
   */
  handleDragLeave(e, element) {
    element.classList.remove('drag-over');
  }
  
  /**
   * Handle drop event
   * @param {Event} e - Event object
   * @param {Element} element - Element being dropped on
   * @param {number} index - Index of the habit
   */
  handleDrop(e, element, index) {
    e.preventDefault();
    e.stopPropagation();
    
    element.classList.remove('drag-over');
    
    if (this.dragSrcElement !== element) {
      const dropIndex = index;
      
      // Reorder habits array
      const draggedHabit = this.habits[this.dragSrcIndex];
      this.habits.splice(this.dragSrcIndex, 1);
      this.habits.splice(dropIndex, 0, draggedHabit);
      
      this.saveHabits();
      this.renderHabits();
    }
    
    return false;
  }
  
  /**
   * Handle drag end event
   * @param {Event} e - Event object
   * @param {Element} element - Element that was dragged
   */
  handleDragEnd(e, element) {
    element.classList.remove('dragging');
    element.style.opacity = '1';
    
    // Clean up
    document.querySelectorAll('.habit-item').forEach(item => {
      item.classList.remove('drag-over');
    });
  }
  
  /**
   * Show habit detail view - FIXED VERSION
   */
  showHabitDetail(index) {
    this.currentHabitIndex = index;
    const habit = this.habits[index];
    this.isCalendarEditing = false;
    
    // Update UI visibility
    this.mainView.style.display = 'none';
    this.detailView.style.display = 'block';
    
    // Set habit title
    this.habitDetailTitle.textContent = habit.name;
    
    // Apply color theme
    this.applyColorThemeToDetailView(habit.color);
    
    // The edit, delete and calendar-edit buttons are bound once in
    // initEventListeners() and act on this.currentHabitIndex, which was set
    // above - so there is nothing to rewire here.

    // Leaving calendar edit mode on means the next habit opens with stale
    // per-cell click handlers still attached to the old habit.
    const calendarEditButton = document.getElementById('habits-edit-calendar-button');
    if (calendarEditButton) {
      calendarEditButton.classList.remove('active');
    }

    // Set time period selector to match the current selection
    const timePeriodSelector = document.getElementById('graph-time-period');
    if (timePeriodSelector) {
      timePeriodSelector.value = this.selectedTimePeriod;
    }
    
    // Render visualizations
    this.renderChart(habit);
    this.renderCalendar();
    this.renderStreaks(habit);
  }
  
  /**
   * Apply color theme to detail view
   * @param {string} color - Color to apply
   */
  applyColorThemeToDetailView(color) {
    const buttons = [
      document.getElementById('habits-edit-button'),
      document.getElementById('habits-delete-button'),
      document.getElementById('habits-back-button')
    ];

    // Reset everything first, including the buttons. The button reset used to
    // live only inside the branch below, so opening a coloured habit and then
    // a default-coloured one left the previous habit's colour on the buttons.
    this.habitDetailTitle.style.color = 'white';
    document.querySelectorAll('.habits-section-title').forEach(title => {
      title.className = 'habits-section-title';
    });
    buttons.forEach(button => {
      if (button) button.className = 'icon-btn';
    });

    // Apply specific color if not default
    if (color !== 'default') {
      const colorHex = this.getColorHex(color);
      this.habitDetailTitle.style.color = colorHex;
      document.querySelectorAll('.habits-section-title').forEach(title => {
        title.className = `habits-section-title ${color}`;
      });
      buttons.forEach(button => {
        if (button) button.classList.add(color);
      });
    }
  }
  

  
  /**
   * Draw the habit's graph: one bar per calendar day / week / month
   * (chartUtils.renderCompletionBars), with its headline and caption.
   * @param {Object} habit - Habit object to render chart for
   */
  renderChart(habit) {
    const chartContainer = this.habitChart;
    if (!chartContainer) return;

    // Wait to be told the chart has a size rather than polling for it.
    // The old 100ms retry never terminated while the detail view was closed.
    if (chartContainer.offsetWidth === 0) {
      this.deferChartRender(habit);
      return;
    }

    // Days before the habit's first record are not counted, so a habit
    // started last month does not show months of 0%. A habit with nothing
    // recorded yet counts from today.
    const keys = Object.keys(habit.history || {}).sort();

    chartUtils.renderCompletionBars({
      chart: chartContainer,
      labels: this.chartLabels,
      summary: document.getElementById('habits-chart-summary'),
      caption: document.getElementById('habits-chart-caption'),
      isDone: dateKey => habit.history[dateKey] === 'done',
      period: this.selectedTimePeriod,
      firstKey: keys[0] || utils.getCurrentDate(),
      color: this.getColorHex(habit.color)
    });
  }









  /**
   * Get hex code for a habit color
   * @param {string} color - Color name
   * @returns {string} - Hex color code
   */
  getColorHex(color) {
    const colorMap = {
      'red': '#FF0000',
      'coral': '#FF5042',
      'pink': '#FF4A8D',
      'lightpink': '#FFC8F0',
      'purple': '#B96CDA',
      'navy': '#334C77',
      'skyblue': '#58B5F0',
      'royalblue': '#5B6EF7',
      'blue': '#2196F3',
      'teal': '#40BBD4',
      'lightblue': '#77D1F3',
      'lightgreen': '#5DD959',
      'green': '#4CAF50',
      'darkgreen': '#159D82',
      'seagreen': '#4AD6B8',
      'yellow': '#FFDE0A',
      'orange': '#FF9F29',
      'tangerine': '#FF7B29',
      'darkorange': '#E25C28',
      'gray': '#A5A5A5',
      'default': '#673AB7' // Use habits-primary as default
    };
    
    return colorMap[color] || colorMap.default;
  }
  
  /**
   * Delete current habit
   */
  async deleteCurrentHabit() {
    const indexToDelete = this.currentHabitIndex;
    const habit = this.habits[indexToDelete];
    if (!habit) return;

    const confirmed = await utils.confirm(
      `"${habit.name}" and all of its recorded history will be deleted. This cannot be undone.`,
      { title: 'Delete this habit?', confirmText: 'Delete', danger: true }
    );

    if (!confirmed) return;

    // Keep the whole habit so the deletion can be undone, history included.
    const [removed] = this.habits.splice(indexToDelete, 1);
    this.saveHabits();
    this.currentHabitIndex = -1;
    this.showMainView();

    utils.showUndoToast(`Deleted "${removed.name}"`, () => {
      this.habits.splice(Math.min(indexToDelete, this.habits.length), 0, removed);
      this.saveHabits();
      this.renderHabits();
      utils.showToast(`Restored "${removed.name}"`, 'success');
    });
  }
  
  /**
   * Show main view
   */
  showMainView() {
    this.mainView.style.display = 'block';
    this.detailView.style.display = 'none';
    this.renderHabits();
  }

/**
 * Draw the History calendar for the open habit.
 *
 * The strip itself - months, Load More, scrolling - is the shared
 * MonthCalendarStrip in core/calendar.js; this habit's ticks go in through the
 * decorateCell callback set up in initElements().
 */
renderCalendar() {
  if (this.calendarStrip) this.calendarStrip.render();
}

/**
 * Bring an open History calendar up to date after the date changes: move
 * today's outline, or redraw if a new month has started. Called by the day
 * rollover watch in core-scripts.js.
 */
refreshCalendarForNewDay() {
  const detailOpen = this.detailView && this.detailView.style.display === 'block';
  if (!detailOpen || !this.calendarStrip || !this.calendarStrip.isBuilt) return;

  if (this.calendarStrip.isCurrent) {
    this.calendarStrip.refresh();
  } else {
    this.calendarStrip.render();
  }
}

/**
 * Mark up one calendar day for the open habit: ticked days in the habit's
 * colour, and tappable while calendar edit mode is on.
 *
 * @param {Element} cell
 * @param {string} dateKey
 * @param {boolean} isFuture
 */
decorateCalendarCell(cell, dateKey, isFuture) {
  const habit = this.habits[this.currentHabitIndex];

  if (habit && habit.history[dateKey] === 'done') {
    cell.classList.add('active');
    if (habit.color) cell.classList.add(habit.color);
  }

  if (this.isCalendarEditing && !isFuture) {
    cell.classList.add('editable');
  }
}

/**
 * Toggle a day from the History calendar, in calendar edit mode.
 *
 * Handled by one listener on the strip, bound once in initEventListeners().
 * It used to attach a listener to every cell when edit mode was switched on
 * and clone the cells to strip them again - so months added by Load More
 * while editing looked tappable but had no listener at all.
 *
 * @param {Event} event
 */
handleCalendarCellClick(event) {
  if (!this.isCalendarEditing) return;

  const cell = event.target.closest('.habits-calendar-cell.editable');
  if (!cell || !cell.dataset.dateKey) return;

  const habit = this.habits[this.currentHabitIndex];
  if (!habit) return;

  const dateKey = cell.dataset.dateKey;
  const previousStatus = habit.history ? habit.history[dateKey] : undefined;
  this.setHabitStatus(habit, dateKey, this.nextStatus(previousStatus));
  this.saveHabits();

  // Repaint just this cell, then the figures that depend on it.
  this.calendarStrip.paintCell(cell);
  this.renderChart(habit);
  this.renderStreaks(habit);
}

/**
 * Switch calendar edit mode on or off.
 */
toggleCalendarEdit() {
  this.isCalendarEditing = !this.isCalendarEditing;

  const editButton = document.getElementById('habits-edit-calendar-button');
  if (editButton) editButton.classList.toggle('active', this.isCalendarEditing);

  // Repaint so past days gain or lose the editable look. Months stay loaded
  // and the scroll position stays put.
  if (this.calendarStrip) this.calendarStrip.refresh();
}

/**
 * Render streaks for habit
 * @param {Object} habit - Habit object
 */
renderStreaks(habit) {
  if (!this.habitStreaks) return;
  
  this.habitStreaks.innerHTML = '';
  
  // Calculate streaks
  const streaks = this.calculateStreaks(habit.history);
  
  // Show top 3 streaks
  const topStreaks = streaks.slice(0, 3);
  
  if (topStreaks.length === 0) {
    const noStreaks = document.createElement('p');
    noStreaks.textContent = 'No streaks recorded yet.';
    this.habitStreaks.appendChild(noStreaks);
    return;
  }
  
  // Create streak bars
  topStreaks.forEach(streak => {
    const streakBar = document.createElement('div');
    streakBar.className = 'habits-streak-bar';
    
    // Local-midnight dates (parseDateKey inside), so the range matches the
    // days actually ticked rather than sliding a day west of UTC.
    const dateRange = document.createElement('div');
    dateRange.className = 'habits-streak-date';
    dateRange.textContent = utils.formatStreakDates(streak.start, streak.end);
    
    const streakVisual = document.createElement('div');
    streakVisual.className = `habits-streak-visual ${habit.color}`;
    
    // For light colors, use dark text
    if (['yellow', 'lightpink', 'lightgreen', 'lightblue', 'default'].includes(habit.color)) {
      streakVisual.classList.add('text-dark');
    }
    
    streakVisual.textContent = utils.formatDayCount(streak.length);
    
    streakBar.appendChild(dateRange);
    streakBar.appendChild(streakVisual);
    
    this.habitStreaks.appendChild(streakBar);
  });
}

/**
 * Calculate streaks from habit history
 * @param {Object} history - Habit history
 * @returns {Array} - Array of streak objects
 */
calculateStreaks(history) {
  const sortedDates = Object.entries(history)
    .filter(([date, status]) => status === 'done')
    .map(([date]) => date)
    .sort();
  
  const streaks = [];
  let currentStreak = null;
  
  sortedDates.forEach(date => {
    const currentDate = utils.parseDateKey(date);
    
    if (!currentStreak) {
      currentStreak = { start: date, end: date, length: 1 };
    } else {
      const lastDate = utils.parseDateKey(currentStreak.end);
      const nextDay = new Date(lastDate);
      nextDay.setDate(lastDate.getDate() + 1);
      
      if (currentDate.getTime() === nextDay.getTime()) {
        currentStreak.end = date;
        currentStreak.length++;
      } else {
        streaks.push(currentStreak);
        currentStreak = { start: date, end: date, length: 1 };
      }
    }
  });
  
  if (currentStreak) {
    streaks.push(currentStreak);
  }
  
  return streaks.sort((a, b) => b.length - a.length);
}

/**
 * Check if daily habits need to be reset
 */
checkAndResetDailyHabits() {
  const currentDate = utils.formatDate(new Date());
  const lastResetDate = localStorage.getItem(this.lastResetKey);
  
  if (lastResetDate !== currentDate) {
    // Nothing to reset, just update the last reset date
    localStorage.setItem(this.lastResetKey, currentDate);
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

  // Only fires while the page stays alive; initializeDayRolloverWatch() in
  // core-scripts.js handles the app being resumed after midnight.
  this.midnightResetTimeout = setTimeout(() => {
    this.checkAndResetDailyHabits();
    this.updateDateSelector();
    this.renderHabits();
    this.refreshCalendarForNewDay();
    this.setupMidnightReset(); // Set up next day's reset
  }, msUntilMidnight);
}
}