/**
 * Daily Tracker - Month calendar strip
 *
 * The scrolling row of month grids under "History", shared by the habit
 * detail view and Workout Analytics so the two cannot drift apart. Habits
 * used to carry this code alone; Workouts got the same calendar in October
 * 2026 and it moved here rather than being copied.
 *
 * Time runs left to right: oldest month on the left, the current month on the
 * right, opened scrolled to the right-hand end. Scrolling left goes back in
 * time. Older months are added ONLY when "Load More History" is pressed -
 * reaching the left edge used to load another year automatically, which the
 * user did not want.
 *
 * What a day's cell shows (done, colour, editable) is up to the caller, via
 * decorateCell; this owns the months, the grids, Load More and the scrolling.
 * The markup and class names are the habits calendar's, styled in
 * habits/habits-styles.css.
 */

// Months shown when the strip is first drawn, before the current one.
const CALENDAR_INITIAL_MONTHS_BACK = 3;

// Months added per press of Load More History.
const CALENDAR_MONTHS_PER_LOAD = 12;

class MonthCalendarStrip {
  /**
   * @param {Object} options
   * @param {Element} options.content - The flex row inside a
   *   .habits-calendar-container
   * @param {Function} options.decorateCell - (cell, dateKey, isFuture) => void.
   *   Called on a freshly reset day cell; marks it up (active, colour,
   *   editable). Read whatever state it needs at call time.
   */
  constructor({ content, decorateCell }) {
    this.content = content;
    this.decorateCell = decorateCell;
    // { year, month } of every month in the strip, oldest first.
    this.months = [];
  }

  /**
   * The element that actually scrolls.
   *
   * The CONTAINER, not the flex row inside it - overflow-x lives on the
   * container, and reading scrollLeft off the inner element always returns 0.
   *
   * @returns {Element|null}
   */
  get scroller() {
    return this.content ? this.content.closest('.habits-calendar-container') : null;
  }

  /**
   * Whether the strip has been drawn at least once.
   * @returns {boolean}
   */
  get isBuilt() {
    return this.months.length > 0 && !!this.content.querySelector('.habits-month-calendar');
  }

  /**
   * Whether the newest month in the strip is the current one. False once a
   * strip left open runs into a new month - redraw it then.
   * @returns {boolean}
   */
  get isCurrent() {
    const newest = this.months[this.months.length - 1];
    const today = new Date();
    return !!newest && newest.year === today.getFullYear() && newest.month === today.getMonth();
  }

  /**
   * Draw the strip from scratch: Load More on the far left, then the recent
   * months oldest first, scrolled to the current month.
   */
  render() {
    if (!this.content) return;

    this.content.innerHTML = '';

    const today = new Date();
    this.months = [];
    for (let i = CALENDAR_INITIAL_MONTHS_BACK; i >= 0; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      this.months.push({ year: monthDate.getFullYear(), month: monthDate.getMonth() });
    }

    // "Load More History" sits at the far LEFT, because that is where older
    // months appear.
    this.content.appendChild(this.createLoadMoreControl());

    // One batch, so the browser lays out once.
    const fragment = document.createDocumentFragment();
    this.months.forEach(({ year, month }) => {
      fragment.appendChild(this.createMonth(new Date(year, month, 1)));
    });
    this.content.appendChild(fragment);

    this.scrollToPresent();
  }

  /**
   * Repaint every day cell from current data, keeping the months loaded and
   * the scroll position. For when the data or the caller's view changes.
   */
  refresh() {
    if (!this.content) return;
    const todayKey = utils.getCurrentDate();
    this.content.querySelectorAll('.habits-calendar-cell[data-date-key]')
      .forEach(cell => this.paintCell(cell, todayKey));
  }

  /**
   * Reset one day cell to plain, then let the caller mark it up.
   *
   * Today's outline and the future-day greying are set here, on every paint,
   * so a strip left open past midnight moves them on the next refresh. (The
   * outline used to be set once, when the month was built.)
   *
   * @param {Element} cell - A cell carrying data-date-key
   * @param {string} [todayKey] - Today's date key, passed in by loops
   */
  paintCell(cell, todayKey = utils.getCurrentDate()) {
    const dateKey = cell.dataset.dateKey;
    // YYYY-MM-DD keys compare correctly as text.
    const isFuture = dateKey > todayKey;

    cell.className = 'habits-calendar-cell' + (isFuture ? ' future-date' : '');
    cell.style.backgroundColor = '';
    cell.style.border = dateKey === todayKey ? '2px solid #2196F3' : '';

    this.decorateCell(cell, dateKey, isFuture);
  }

  /**
   * Add another batch of older months on the left.
   *
   * Content added to the left pushes everything right while the browser
   * holds scrollLeft still, so the view is re-positioned in the same frame,
   * with smooth scrolling off: it lands on the newest of the months just
   * added - the one right before what was on screen - so pressing the button
   * visibly does something. (It used to confirm with a toast; the user asked
   * for no pop-up.)
   */
  loadMore() {
    const oldest = this.months[0];
    if (!oldest) return;

    // Oldest first, so they read left to right once inserted.
    const newMonths = [];
    for (let i = CALENDAR_MONTHS_PER_LOAD; i >= 1; i--) {
      const monthDate = new Date(oldest.year, oldest.month - i, 1);
      newMonths.push({ year: monthDate.getFullYear(), month: monthDate.getMonth() });
    }
    this.months = [...newMonths, ...this.months];

    const fragment = document.createDocumentFragment();
    const created = newMonths.map(({ year, month }) => {
      const element = this.createMonth(new Date(year, month, 1));
      fragment.appendChild(element);
      return element;
    });

    // After the Load More control, so it stays pinned to the far left.
    const firstMonth = this.content.querySelector('.habits-month-calendar');
    if (firstMonth) {
      this.content.insertBefore(fragment, firstMonth);
    } else {
      this.content.appendChild(fragment);
    }

    const scroller = this.scroller;
    const target = created[created.length - 1];
    if (scroller && target) {
      const offset = target.getBoundingClientRect().left
        - scroller.getBoundingClientRect().left
        + scroller.scrollLeft;
      const previous = scroller.style.scrollBehavior;
      scroller.style.scrollBehavior = 'auto';
      scroller.scrollLeft = offset;
      scroller.style.scrollBehavior = previous;
    }
  }

  /**
   * Jump to the right-hand end, where the current month is.
   */
  scrollToPresent() {
    const scroller = this.scroller;
    if (!scroller) return;

    const jump = () => {
      // scroll-behavior is smooth on this container; animating the opening
      // jump would show a scenic tour of the history every time.
      const previous = scroller.style.scrollBehavior;
      scroller.style.scrollBehavior = 'auto';
      scroller.scrollLeft = scroller.scrollWidth;
      scroller.style.scrollBehavior = previous;
    };

    jump();
    // Again once layout has settled, since the months may not have been
    // measured at the moment the view was revealed.
    setTimeout(jump, 60);
  }

  /**
   * The "Load More History" button. Rebuilt with the strip, so its listener
   * goes with it.
   * @returns {Element}
   */
  createLoadMoreControl() {
    const container = document.createElement('div');
    container.className = 'habits-load-more-container';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'habits-load-more-button';
    button.textContent = 'Load More History';
    button.addEventListener('click', () => this.loadMore());

    container.appendChild(button);
    return container;
  }

  /**
   * One month: header, Monday-first day labels, then a cell per day.
   * @param {Date} monthDate - Any date in the month
   * @returns {Element}
   */
  createMonth(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    const container = document.createElement('div');
    container.className = 'habits-month-calendar';

    const header = document.createElement('div');
    header.className = 'habits-month-header';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    header.textContent = `${monthNames[month]} ${year}`;
    container.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'habits-calendar-grid';

    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(label => {
      const cell = document.createElement('div');
      cell.className = 'habits-calendar-cell day-label';
      cell.textContent = label;
      grid.appendChild(cell);
    });

    // Blank cells before the 1st, for a Monday-first week.
    const firstDayOfWeek = new Date(year, month, 1).getDay() || 7;
    for (let i = 1; i < firstDayOfWeek; i++) {
      const cell = document.createElement('div');
      cell.className = 'habits-calendar-cell';
      grid.appendChild(cell);
    }

    const todayKey = utils.getCurrentDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.dataset.dateKey = utils.formatDate(new Date(year, month, day));
      cell.textContent = day;

      this.paintCell(cell, todayKey);
      grid.appendChild(cell);
    }

    container.appendChild(grid);
    return container;
  }
}
