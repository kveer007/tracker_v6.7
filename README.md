# Daily Tracker v6.7

A personal tracker for water, protein, workouts and habits. It is a small web
app written in plain HTML, CSS and JavaScript, with no build step and no
server. It runs in the browser, stores everything on the device, and is added
to the phone's home screen to be used like an app.

This README is the complete reference for the project. Sections 1-3 explain
what the app is and how it is used; sections 4-13 are the technical reference
for anyone (person or AI) changing the code.

**Contents**

1. [What it does](#1-what-it-does)
2. [Running and publishing](#2-running-and-publishing)
3. [Using it on a phone](#3-using-it-on-a-phone)
4. [Start here: guide for AI assistants and developers](#4-start-here-guide-for-ai-assistants-and-developers)
5. [Project structure and start-up](#5-project-structure-and-start-up)
6. [Page structure (`index.html`)](#6-page-structure-indexhtml)
7. [How data is stored](#7-how-data-is-stored)
8. [How each part works](#8-how-each-part-works)
9. [Styling](#9-styling)
10. [Offline support and reliability](#10-offline-support-and-reliability)
11. [How to make common changes](#11-how-to-make-common-changes)
12. [Rules and design decisions](#12-rules-and-design-decisions)
13. [Testing a change](#13-testing-a-change)
14. [Limitations](#14-limitations)

---

## 1. What it does

| Tab | Tracks | Unit |
|---|---|---|
| **Water** | How much you drink, against a daily goal | ml |
| **Protein** | How much protein you eat, against a daily goal | g |
| **Workout** | Which of your workouts you did, and when | workouts |
| **Habits** | Daily yes / no habits, with streaks | done / not done |

A **Reminders** panel (the bell, top left) handles notifications, and the
**⋮ menu** (top right) holds backup, export and restore.

- **Plain HTML / CSS / JavaScript.** No framework, no npm, no bundler. The
  browser loads the files directly with `<script>` and `<link>` tags.
- **No server, no account.** Everything is saved in the browser's
  `localStorage` on one device. One user; no sharing or syncing.
- **Dark theme only.**
- **Made for phones** (about 360-430 px wide); also works on larger screens
  (content is capped at 500 px wide and centred).

---

## 2. Running and publishing

### Running locally

There is nothing to build. Serve the folder with any static web server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` straight from the
disk (`file://`) does not work fully: offline support and installation need a
web address.

### Publishing on GitHub Pages

1. Upload the **contents** of this folder to a GitHub repository, so
   `index.html` sits at the top level of the repository (not inside a
   subfolder).
2. In the repository: **Settings → Pages → Deploy from a branch →
   `main` / `(root)` → Save**.
3. The app appears at `https://<username>.github.io/<repository>/` within a
   minute or two.

GitHub Pages serves the app from a subfolder of the domain, so **every path
in the project is relative** (`icons/icon-192.png`, never
`/icons/icon-192.png`). A path starting with `/` points at the domain root
and breaks on GitHub Pages while still working locally.

After uploading changed files, the installed app picks them up the next time
it is opened with an internet connection.

---

## 3. Using it on a phone

### iPhone (the owner's phone)

1. Open the app's address in **Safari** itself - not inside WhatsApp,
   Instagram or another app's built-in browser, and not in a Private tab.
2. Tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**.

The home-screen icon comes from `<link rel="apple-touch-icon"
href="icons/icon-192.png?v=8">`, the page's only icon link. A letter on a
grey tile instead of the picture means the iPhone could not download the
icon and is remembering that failure (see *Icons and addresses* below).

**Safari and the home-screen app keep separate data.** Data entered in
Safari does not appear in the home-screen app, which starts empty. Move data
with **⋮ → Backup (JSON)** in one and **⋮ → Restore / Import** in the other.
Safari may delete a website's data if the site is not opened for 7 days;
home-screen apps are not affected, so the home-screen app is the place to use
it.

### Android

Chrome → **⋮ → Add to Home screen → Install**. Android takes the icon from
`manifest.json` (`icons/icon-192.png` and `icons/icon-512.png`).

### One app per address

`manifest.json` deliberately has **no `id`**. Without one, a phone identifies
the app by its address (`start_url`), so every repository (`tracker_v6.6`,
`tracker_v6.7`...) is its own app. A relative `id` such as `"./"` is resolved
against the domain, not the folder: every app on the same GitHub account
that does this (other copies of the tracker, or other projects) would then
count as one app, and Android would refuse to install a second one as
"already installed".

### Icons and addresses

- The icon and manifest addresses end in a version number, `?v=8`: in
  `index.html` (the `apple-touch-icon` and `manifest` links) and in every
  icon `src` in `manifest.json`. A phone remembers an icon download that
  failed - for example when the address was opened while GitHub Pages was
  still publishing a new repository - and keeps showing a letter on a grey
  tile. Raising the number in all those places makes phones download the
  icons again.
- If an iPhone still shows the letter, clear Safari's data for the site:
  **Settings → Apps → Safari → Advanced → Website Data**, find
  `<username>.github.io`, **Delete**. This also deletes the tracker data
  kept in Safari (not in home-screen apps), so back up first.
- After uploading to a new repository, wait until the site is published
  (**Settings → Pages** shows the address) before opening it on a phone.
- Removing an Android home-screen icon does not uninstall the app; leftover
  copies are listed under **Settings → Apps**.
- Phones do not refresh an icon already on the home screen; after an icon
  change, remove the app from the home screen and add it again.
- A new repository means a new address and a new, empty home-screen app:
  back up in the old one, add the new one, restore the backup there.

---

## 4. Start here: guide for AI assistants and developers

**Read this section first, then the sections relevant to the change.**

### About the owner

- The owner is **not a programmer**. Explain in plain language, without code
  jargon.
- For new features or visible changes, describe the plan (ideally with
  choices and a rough sketch of how it will look) and **get agreement before
  building**. For "fix this" requests, fix it and check it works.
- The owner publishes by **uploading files to GitHub by hand**. After every
  change, list exactly which files changed (paths from the project root), and
  call out any new file and the folder it belongs in.
- The owner uses the app on an **iPhone**, added to the home screen. Check
  that changes behave on iPhone Safari (see §13).
- Do not add a build step, npm, a framework or TypeScript.

### The ten things most likely to go wrong

1. **Dates are local `YYYY-MM-DD` strings.** Read them with
   `utils.parseDateKey(key)`, never `new Date(key)` (that is UTC midnight and
   can be the wrong day). Today is `utils.getCurrentDate()`.
2. **Water/protein totals are calculated from the day's entries**, never
   stored and updated separately. A new day starts at zero by itself.
3. **Workout tabs describe a round, not a day** (§8.2). Never rebuild
   `workout_state` / `workout_count` from today's history.
4. **Every path is relative** (§2).
5. **Never draw a chart that is off screen, and never poll for it.** Draw it
   from the tap that opens its panel or tab (§8.5).
6. **Bind each event listener once.** A function that redraws must not add
   listeners to elements it does not recreate (panels, containers,
   `document`).
7. **User text goes in with `textContent`** or through `utils.escapeHtml()`
   (attribute values included) - never raw into `innerHTML`.
8. **New `localStorage` keys must be added to `getAppStorageKeys()`** in
   `core/core-scripts.js`, or backups will not include them.
9. **The page must never become wider than the screen** (§9.4). Never put a
   `transform` (or a transform animation) on an element that contains a
   `position: fixed` panel.
10. **Respect the design decisions in §12.2.** They are the owner's choices.

---

## 5. Project structure and start-up

### Files

```
index.html              All markup: header, four tabs, panels, pop-up windows
manifest.json           App name, icons, colours (used when installing)
service-worker.js       Offline support - must stay at the top level
README.md               This file

core/
  core-scripts.js       STORAGE_KEYS, storageManager, utils, backup / export /
                        restore, app start-up, new-day watcher
  core-styles.css       Design tokens (:root), layout, shared components,
                        panels, pop-ups, messages, phone breakpoints
  ui.js                 Tab switching, panels, water/protein/workout button
                        wiring, the shared "edit a day" window (dayEditor)
  chart.js              chartUtils: every graph in the app
  calendar.js           MonthCalendarStrip: the scrolling month calendar

trackers/  trackers-scripts.js   Tracker class (water AND protein)
           trackers-styles.css
workouts/  workouts-scripts.js   WorkoutTracker class
           workouts-styles.css
habits/    habits-scripts.js     HabitsTracker class
           habits-styles.css
reminders/ reminders-scripts.js  RemindersManager class
           reminders-styles.css
icons/     icon-192.png, icon-512.png
```

### Script load order (bottom of `index.html`) - order matters

```
core/core-scripts.js    STORAGE_KEYS, storageManager, utils, start-up handler
core/ui.js              activateTab, initialize* functions, dayEditor
core/chart.js           chartUtils
core/calendar.js        class MonthCalendarStrip
trackers/trackers-scripts.js    class Tracker
workouts/workouts-scripts.js    class WorkoutTracker
habits/habits-scripts.js        class HabitsTracker
reminders/reminders-scripts.js  class RemindersManager
```

All code is global (no modules). Later files use globals from earlier ones.

### Start-up sequence

1. **Inline script at the top of `<body>`** reads `active_tab` and sets
   `body[data-initial-tab]`, so the saved tab shows before first paint.
2. On `DOMContentLoaded`, `core-scripts.js`:
   1. checks `localStorage` works (if not, replaces the page with an
      explanation);
   2. deletes retired keys (`RETIRED_KEYS`) and checks storage space;
   3. creates the trackers, **each in its own try/catch** so one failure
      does not stop the others:
      ```js
      window.waterTracker   = new Tracker({ type: 'water',   unit: 'ml' });
      window.proteinTracker = new Tracker({ type: 'protein', unit: 'g'  });
      window.workoutTracker = new WorkoutTracker();
      window.habitsTracker  = new HabitsTracker();
      ```
   4. creates `window.remindersManager = new RemindersManager()`;
   5. runs `initializeTabNavigation()` (restores the last tab and removes
      `data-initial-tab`), `initializePanels()`,
      `initializeSettingsPanelEvents()`, `initializeTrackerActions()` for
      water and protein, `initializeWorkoutTrackerActions()`,
      `initializeDataManagement()`;
   6. starts `initializeDayRolloverWatch()`.
3. On `load`, the service worker is registered.

---

## 6. Page structure (`index.html`)

IDs follow the pattern **`<tracker>-<thing>`** (`water-chart`,
`protein-goal`, `workout-history-popup`...). Water and protein have identical
markup apart from the prefix.

```
header
  #reminders-bell-icon              opens the Reminders panel
  #more-options-toggle              opens the ⋮ menu
nav (.tab-btn[data-app])            #water-tab-btn #protein-tab-btn
                                    #workout-tab-btn #habits-tab-btn

section#water-app.app-container     (same structure for #protein-app)
  #water-history-toggle #water-settings-toggle
  #water-circular-progress  #water-total #water-goal-display #water-remaining
  [data-action="water-add"][data-amount]   quick-add buttons
  #water-manual #water-add-manual          custom amount
  #water-reset-daily                       Reset Today
  #water-settings-section.panel            goal (#water-goal, #water-set-goal),
                                           reminder buttons, #water-reset-data
  #water-history-popup.panel
    .tab-button[data-tab]                  inner tabs
    #water-daily-history.tab-content       Daily Summary
    #water-analytics.tab-content           #water-chart-range, #water-chart-summary,
                                           #water-chart, #water-chart-labels

section#workout-app.app-container
  #workout-tabs-container                  workout tabs (built by JS)
  #workout-manage-button #workout-reset-daily
  #workout-settings-section.panel          #workout-autoreset-toggle,
                                           #workout-reset-tabs, #workout-reset-data
  #workout-history-popup.panel
    #workout-daily-history                 #workout-missed-button (static) +
                                           #workout-daily-history-list (built by JS)
    #workout-analytics                     #workout-view-type, #workout-time-period,
                                           #workout-chart-summary, #workout-chart,
                                           #workout-chart-labels, #workout-chart-caption,
                                           #workout-edit-calendar-button,
                                           #workout-calendar-scroll-content,
                                           #workout-streaks

section#habits-app.app-container
  #habits-main-view                        #habits-add-button, #habits-rearrange-button,
                                           #habits-date-selector, #habits-container
  #habits-detail-view                      #habits-back-button, #habits-edit-button,
                                           #habits-delete-button, #graph-time-period,
                                           #habits-chart-summary, #habit-chart,
                                           #habits-chart-labels, #habits-chart-caption,
                                           #habits-edit-calendar-button,
                                           #habits-calendar-scroll-content, #habit-streaks

#reminders-panel                           content built by RemindersManager
#more-options-panel.panel                  #export-data-json, #export-data, #import-file

Pop-up windows (.modal, shown with style.display = 'flex'):
  #add-habit-modal       #habit-name-input, .habits-color-option[data-color],
                         #habits-cancel-button, #habits-confirm-button
  #workout-manage-modal  #new-workout-input, #add-workout-btn, #workout-list
  #workout-missed-modal  #missed-workout-date, #missed-workout-type,
                         #missed-workout-add, #missed-workout-existing
  #edit-day-modal        #edit-day-rows, #edit-day-summary, #edit-day-error,
                         #edit-day-cancel, #edit-day-save
  #confirm-modal         used by utils.confirm()

#toast-container                           messages (utils.showToast)
```

Chart containers (`#water-chart`, `#habit-chart`...) are empty in the markup;
`chartUtils` fills them.

---

## 7. How data is stored

Everything is a `localStorage` string key, declared in `STORAGE_KEYS` at the
top of `core/core-scripts.js`. JSON values are read and written through
`storageManager.readJSON(key, fallback)` / `writeJSON(key, value)`.

| Key | Contents |
|---|---|
| `goal_water`, `goal_protein` | Daily goal, e.g. `"2000"` |
| `history_water`, `history_protein` | `{ "YYYY-MM-DD": [{ amount, timestamp }] }` - every entry; the source of truth |
| `intake_water`, `intake_protein` | Copy of today's total, written for the CSV export only; never read as truth |
| `workout_types` | `["Chest", "Legs"]` - the user's workouts, in order |
| `workout_state` | `{ "Chest": { completed, order } }` - tab state for the current round |
| `workout_count` | `{ "Chest": 2 }` - taps per workout in the current round |
| `workout_history` | `{ "YYYY-MM-DD": [{ type, count, timestamp }] }` - every workout logged |
| `workout_autoreset` | `"true"` / `"false"` (default true) |
| `habits_data` | `[{ name, color, history }]`; `history` is `{ "YYYY-MM-DD": "done" \| "fail" }` |
| `reminders_data` | All reminder settings (§8.4) |
| `active_tab` | `water` / `protein` / `workout` / `habits` |
| `last_reset_<water\|protein\|workout\|habits>` | Last date the tracker checked for a new day |
| `reminder` | Unused older setting, kept so old files still import |
| `<key>__corrupt` | An unreadable value set aside (§10.2) |

`timestamp` values are ISO strings (`new Date().toISOString()`).

### Dates

```js
utils.getCurrentDate()            // today as "YYYY-MM-DD" (local)
utils.formatDate(dateObject)      // a Date → "YYYY-MM-DD" (local)
utils.parseDateKey('2026-10-15')  // → Date at local midnight. ALWAYS use this.
utils.startOfToday()              // today at local midnight
```

Date keys compare correctly as plain strings (`'2026-09-30' < '2026-10-01'`).

---

## 8. How each part works

### 8.1 Water and Protein (`trackers/trackers-scripts.js`, class `Tracker`)

One class, two instances (`type` = `water` / `protein`, `unit` = `ml` / `g`).

**What the user sees**
- Quick-add buttons (water 50 / 100 / 250 / 500 ml, protein 1 / 5 / 10 /
  15 g) and a custom amount box. Each add shows a message with **UNDO** for 6
  seconds.
- A progress ring: today's total against the goal.
- **Reset Today** (main screen) clears today's entries, with undo.
- **Settings:** the goal, goal / interval reminder buttons (§8.4), Reset All
  Data.
- **History panel:**
  - **Daily Summary** - every day with entries, newest first: total and % of
    goal. A **pencil** per day opens the edit window (§8.7) to change amounts
    or remove entries.
  - **Analytics** - bar graph of daily amounts for the last 7 or 30 days, a
    dashed goal line, the average per day and "Goal met on X of N days".
    Past days always count. **Today counts only once its goal is reached**
    (until then the line adds "today counts once reached"); with no goal
    set, today is not counted. Today's bar is drawn faded. Past days are
    judged against the current goal.

**How it works**
- `get totalIntake()` sums today's entries. There is no stored running
  total; `updateDisplay()` writes `intake_<type>` only as a copy.
- Add: `addIntake(amount)` → `saveDailyHistory()` → `updateDisplay()` →
  `refreshHistory()` → `utils.showUndoToast()` (undo = `removeLastEntry()`).
- `refreshHistory()` redraws the Daily Summary only if the history panel is
  open (`isHistoryOpen()`), and the graph only if it is on screen.
- New day: `checkAndResetDailyIntake()` only updates `last_reset_<type>`; it
  deletes nothing. `setupMidnightReset()` runs it at midnight; the global
  new-day watcher (§8.7) covers a phone that slept through midnight.
- Editing a day: `openDayEditor(dateKey)` → rows → `saveDayEdit()` →
  `replaceDayEntries()`; each entry keeps its timestamp.
- Graph: `renderAnalytics()` → `chartUtils.renderBarChart(...)` and
  `renderAnalyticsSummary()`.

### 8.2 Workouts (`workouts/workouts-scripts.js`, class `WorkoutTracker`)

**What the user sees**
- **Manage Workouts** (main screen) adds / deletes workout types. No defaults.
  Deleting removes that workout's history too, with undo.
- **Tabs:** tapping a tab ticks it and logs it ("Chest logged", "(2x today)"
  when tapped again the same day). Ticked tabs move to the bottom. A badge
  shows a count above 1 for the round. Every tap can be undone.
- **Rounds:** the tabs describe a **round**, not a day. A tick stays across
  midnight, so a rotation (Chest Monday, Legs Tuesday...) stays ticked until
  every workout is done. With **auto-reset** on (default), finishing the
  round clears all tabs; with it off, tabs stay ticked and taps log repeats.
- **Reset Today** (main screen) unticks all tabs and clears today's history.
  **Settings:** auto-reset, Reset Tabs (unticks, keeps history), Reset All
  Data.
- **History panel:**
  - **Daily Summary** - **Add Missed Workout** button, then every day with
    workouts, filterable by workout ("Chest: 1 time"). A pencil per day
    opens the edit window to switch an entry to another workout or remove it.
  - **Workout Analytics** - view dropdown (*All Workouts*, *All Comparison*,
    or one workout), period dropdown, the graph (§8.5), the History calendar
    (§8.3) and **Best streaks** (top 3, 2+ consecutive days).

**Add Missed Workout** (`#workout-missed-modal`): pick a date (today or
earlier) and a workout. Past entries are time-stamped at midday on that date
and never change today's tabs; choosing today goes through the normal tap
(`toggleWorkout()`). It lists what is logged that day with ✕ to remove. In
the History calendar, the pencil turns on edit mode and tapping a past day
opens this window for that day, titled "Edit Workouts".

**How it works**
- Tap: `toggleWorkout(type)` snapshots `workoutState` / `workoutCounts`,
  increments the count, marks completed, `saveWorkoutHistory(type)`, then
  either `resetWorkoutTabs()` (all done + auto-reset) or `saveState()` +
  `renderWorkoutTabs()`. Undo = `undoWorkoutTap(type, snapshot)`, which
  removes the history entry and restores the snapshot.
- Any edit to **today's** history (pencil, ✕, undo) calls
  `applyTodayChange(before, after)`, which adjusts only the counts that
  changed and unticks a workout only when its count reaches 0. Other ticks
  in the round are left alone.
- `didWorkout(dateKey, type)` is the single "trained that day?" test (type
  `null` = any workout); the graph and calendar both use it.
- `initializeWorkoutAnalytics()` refreshes the view dropdown's options (it is
  re-run when workouts are added / deleted) and binds listeners once
  (`analyticsListenersBound`).
- Graph: `renderWorkoutGraph()` → `chartUtils.renderCompletionBars(...)`, or
  for *All Comparison* `renderComparisonChart()` (first line via
  `chartUtils.renderLineChart`, others drawn onto the same SVG, plus a
  legend). Colours: `getWorkoutColor(type)` by position in `workoutTypes`.
- Streaks: `calculateWorkoutStreaks()` (2+ consecutive days; per workout,
  any workout, or best per workout for comparison).

### 8.3 Habits (`habits/habits-scripts.js`, class `HabitsTracker`)

**What the user sees**
- **Add** (+): name and one of 21 colours. **Edit** / **Delete** (with undo)
  from the habit's detail view.
- **Main view:** a row per habit; columns are the most recent days (4 on a
  phone; 5 / 6 / 7 at 520 / 700 / 900 px wide). `<` / **Today** / `>` page
  through earlier days.
- **Ticking:** press and **hold a day for 0.6 s**. A quick tap does nothing,
  so scrolling never ticks a day. Moving the finger more than 10 px cancels.
  Each change can be undone.
- **States:** `done` = tick in the habit's colour; `fail` or no record =
  cross. Toggling goes done ↔ fail.
- **Rearrange:** the rearrange button switches the list to drag-and-drop
  ordering (HTML5 drag events).
- **Detail view** (tap a habit's name): graph (§8.5), History calendar, Best
  streaks (top 3 runs of consecutive done days).

**How it works**
- `loadHabits()` repairs records on load; `saveHabits()` saves (with
  storage-full handling).
- Day cells: `renderHabits()` builds the rows; touch/mouse handlers
  `startLongPress()` / `endLongPress()`; status via `nextStatus()`,
  `setHabitStatus()`, `applyDayStatus()`; undo via `offerHabitUndo()`.
- `showHabitDetail(index)` sets `currentHabitIndex` and draws the chart
  (`renderChart()` → `chartUtils.renderCompletionBars`), calendar and
  streaks. Detail buttons are bound once and act on `currentHabitIndex`.
- Colours: `getColorHex(color)` maps names to hex; CSS classes do the rest
  (§11).

**History calendar** (`core/calendar.js`, class `MonthCalendarStrip`, shared
with workouts):

```js
new MonthCalendarStrip({ content, decorateCell: (cell, dateKey, isFuture) => {...} })
strip.render()     // draw from scratch: current month + 3 before, scrolled to now
strip.refresh()    // repaint every day cell, keeping loaded months and scroll
strip.paintCell(c) // repaint one cell
strip.loadMore()   // add 12 older months on the left (the Load More button)
strip.isBuilt / strip.isCurrent
```

- Months run oldest-left to newest-right; each month is the full width of
  the strip and the strip snaps month by month.
- The **scrolling element** is the `.habits-calendar-container` around
  `content`, not `content` itself.
- The caller decides what a day shows through `decorateCell` (add `active`,
  a colour class or `style.backgroundColor`, and `editable`). Today gets a
  blue outline; future days get `future-date`.
- Day taps in edit mode are handled by one listener on `content`
  (`handleCalendarCellClick()` for habits), so months added later work too.
- Both calendars use the same class names; always query cells inside their
  own strip.

### 8.4 Reminders (`reminders/reminders-scripts.js`, class `RemindersManager`)

**What the user sees** (bell icon): a master switch, four built-in reminders
and custom reminders.

| Built-in | Fires |
|---|---|
| `waterAlert` | Once a day at a set time, if the water goal is not met |
| `waterInterval` | Every N minutes within set hours |
| `proteinAlert` | Once a day at a set time, if the protein goal is not met |
| `proteinInterval` | Every N minutes within set hours |

Custom reminders: title, notes, one or more times, repeat (`none` / `daily` /
`weekly` / `monthly` / `yearly`), days, date (for one-off), active hours, and
early alerts (minutes before).

**How it works**
- `this.data` mirrors `reminders_data`; `loadData()` / `saveData()`.
- The panel's inner HTML is rebuilt by `renderPanel()` for the current view
  (`currentView`: `main`, `system`, `add-custom`, `edit-custom`). The panel
  element itself is permanent, so its listeners (`handlePanelChange`,
  `handlePanelClick`) are delegated and bound once in
  `initializeEventListeners()`; per-render elements are wired in
  `attachPanelEventListeners()` / `attachFormEventListeners()`.
- In the reminder form, `data-index` is used by both the times list and the
  alerts list - query within `#times-container` or `#alerts-container`.
- Built-in reminders are switched only through
  `setSystemNotificationEnabled(type, enabled)` (used by the panel and by
  the water/protein settings buttons). A reminder with an empty `days` list
  is never scheduled; enabling fills in all seven days.
- Scheduling: `scheduleAllReminders()` → `scheduleSystemNotification()` /
  `scheduleCustomReminder()` with `setTimeout` / `setInterval`, tracked in
  `activeTimers` / `intervalTimers` and cleared by `clearAllTimers()` /
  `clearCustomReminderTimer(id)`.
- **No timer waits longer than a day** (`REMINDER_MAX_WAIT_MS`); a reminder
  further away waits a day and re-checks. Browser timers fire immediately if
  asked to wait more than ~24.8 days.
- `sendNotification()` uses the service worker's `showNotification()` when a
  worker controls the page (`navigator.serviceWorker.controller`), otherwise
  `new Notification()`.
- Timers only run while the app is open (§14).

Settings shape:

```js
{
  globalEnabled,
  systemNotifications: {
    waterAlert:      { enabled, time, days[], onlyIfGoalNotMet, message },
    waterInterval:   { enabled, interval, activeWindow: {start, end}, days[], onlyIfBelowGoal, message },
    proteinAlert:    { ...as waterAlert },
    proteinInterval: { ...as waterInterval }
  },
  customReminders: [
    { id, title, notes, enabled, repeat, times[], days[], date, alerts[], activeWindow: {start, end} }
  ]
}
```

### 8.5 Graphs (`core/chart.js`, object `chartUtils`)

Every graph is an SVG drawn by `chartUtils`.

| Graph | Used by | Function |
|---|---|---|
| Amount bars + goal line | Water, Protein | `renderBarChart()` |
| Completion bars (% of days done) | Habits, Workouts | `renderCompletionBars()` → `renderBarChart()` |
| Lines (one per workout) | Workout *All Comparison* | `renderLineChart()` |

**Completion periods** - `chartUtils.BUCKETS`:

| Key | Bars | `unit` | Labels (`axis`, `label`) | Example labels |
|---|---|---|---|---|
| `weekly` | 7 | day | `even`, gap 2 | Fri Sat Sun Mon Tue Wed Thu |
| `monthly` | 5 | week | `twoRow` (Monday's date, month underneath) | 14 21 28 5 12 / Sep Oct |
| `quarterly` | 13 | week | `even`, `dayMonth` | 20 Jul · 10 Aug · 31 Aug ... |
| `halfyearly` | 6 | month | `even`, `month` | May Jun Jul Aug Sep Oct |
| `yearly` | 12 | month | `even`, `monthYear`, gap 4 | Dec 25 · Feb 26 · Apr 26 ... |

Each entry also has `range` ("Last 13 weeks") and `caption` (the line shown
under the graph).

**Key functions**

```js
chartUtils.buildBuckets(isDoneOnDate, period, firstKey)
  // → [{ date, value (0-100 or null), done, total, label, group, fullLabel, bubble }]
  // Weeks are Monday-Sunday; the last bucket always contains today.

chartUtils.renderCompletionBars({ chart, labels, summary, caption,
                                  isDone, period, firstKey, color, noun })

chartUtils.renderBarChart({ chart, labels, dataPoints, color, goal, unit,
                            fixedMax, axisSuffix, bubbleText, fadeLast,
                            axis, labelGap })

chartUtils.renderLineChart({ chart, labels, dataPoints, color, labelGap })
chartUtils.renderSummary(element, periodLabel, value, noun)  // headline figure
```

**Counting rules**
- A bar's value = days done ÷ days counted × 100 for that day / week / month.
- **Only days up to today count, and today counts only once done.**
- **Days before `firstKey` are not counted** (`firstKey` = a habit's first
  record, or the first workout ever; today if none). A bucket with no counted
  days has `value: null` and no bar.
- The headline = all done days ÷ all counted days across the bars shown.
- The last bar (the current period) is drawn faded (`fadeLast`).

**Labels**
- `renderEvenLabels()` (`axis: 'even'`) places every label, measures it, and
  keeps every 1st / 2nd / 3rd... label counted back from the newest, choosing
  the smallest step whose labels do not overlap (`labelGap` = minimum gap in
  px). Gaps are always even and the current bar is always labelled.
- `renderTwoRowLabels()` (`axis: 'twoRow'`) labels every bar and writes each
  month once on a second row.
- `renderXAxisLabels()` (water / protein) keeps both end labels and as many
  middle labels as fit.
- *All Comparison* uses the same labels and gap as the bars (Monthly uses
  `fullLabel`, "14 Sep", since a line has no second row). A workout not done
  today has no point for today; `buildLinePath()` stops the line there.

**Drawing rules**
- Bars / lines, grid, goal line and y-axis labels share one SVG and one
  coordinate system (`chartUtils.GEOMETRY` holds the padding). X labels are
  absolutely positioned at each bar's computed x.
- Tapping a bar / point shows a bubble (`showBubble()` keeps it inside the
  chart); the "tap elsewhere to hide" listener is on the SVG, which is
  rebuilt each draw.
- **Only draw what is visible:** every renderer returns early when
  `chart.offsetWidth === 0`. Trackers draw from the tap that opens the panel
  or tab, deferred with `setTimeout(..., 0)` (not `requestAnimationFrame`,
  which does not run while the page is hidden).

### 8.6 Backup, export and restore (`core/core-scripts.js`)

| ⋮ menu option | Function | Result |
|---|---|---|
| **Backup (JSON)** | `exportDataAsJSON()` | Every app key, `{ format: 'daily-tracker-backup', version: 3, exportedAt, data: { key: value } }` |
| **Export as CSV** | `exportData()` → `convertDataToCSV()` | A spreadsheet-friendly subset |
| **Restore / Import** | `importData()` | `.json` → `applyJSONBackup()`; `.csv` → `parseCSVData()` + `applyImportedData()`; then reload |

- Both exports go through `saveFile(filename, content, mimeType)`: on
  iPhone / iPad (`isAppleTouchDevice()`) it opens the **Share sheet** ("Save
  to Files"); elsewhere it downloads. It must be called directly from the tap
  - nothing may be awaited before `navigator.share()`.
- `getAppStorageKeys()` defines which keys belong to the app.
- A JSON restore removes the app's keys and writes back every key in the
  file. A CSV import replaces only the fields the file contains.
- If an import fails, every key is put back as it was (never via
  `localStorage.clear()`).

### 8.7 Shared interface (`core/ui.js`, `core/core-scripts.js`)

- **Tabs:** `activateTab(appType, remember = true)` sets the active button,
  the visible `.app-container` and the saved tab together.
- **Panels** (`.panel`, plus `.reminders-panel`): opened by their toggle
  buttons (`initializePanels()`), closed by `.close-panel` or a tap outside.
  Taps inside a `.modal` or `#toast-container` do not close the panel behind
  them.
- **Edit window** (`dayEditor`):
  ```js
  dayEditor.open({ title, rows, onSave: rows => errorMessageOrNull, summarise: rows => text })
  dayEditor.removeButton(label)   // the ✕ for a row
  createHistoryEditButton(label, onClick)   // the pencil in history lists
  ```
  Rows are `.edit-day-row` elements built by the tracker. `onSave` returns an
  error string to keep the window open, or `null` to close it.
- **Messages:** `utils.showToast(message, type = 'success'|'info'|'warning'|'error',
  duration = 3000)`; `utils.showUndoToast(message, onUndo, duration = 6000)`
  (only one undo message at a time; at most 3 messages shown).
- **Confirmations:** `await utils.confirm(message, { title, confirmText,
  danger })` → `true` / `false`. Calls are queued.
- **Escaping:** `utils.escapeHtml(text)`.
- **New day:** `initializeDayRolloverWatch()` re-checks the date on
  `visibilitychange`, `focus` and `pageshow`, and moves every tracker to the
  new day.
- **Errors:** a global `error` / `unhandledrejection` handler shows a message.

---

## 9. Styling

### 9.1 Files

`core/core-styles.css` holds the tokens, layout, buttons, panels, pop-ups,
messages and the history edit window. Each feature's own CSS file styles its
screens. Everything shared uses the tokens.

### 9.2 Tokens (`:root` in `core/core-styles.css`)

- Tracker colours: `--water-primary` (#2196F3), `--protein-primary`
  (#F44336), `--workout-primary` (#4CAF50), `--habits-primary` (#673AB7),
  each with `-light` / `-dark`; `--neutral-*`.
- Surfaces and text: `--background` (#121212), `--card-bg` (#1E1E1E),
  `--text-primary`, `--text-secondary`, `--border-color`.
- Status: `--success`, `--warning`, `--danger`.
- Sizes: `--spacing-xs/sm/md/lg/xl`, `--radius-sm/md/lg/full`,
  `--shadow-sm/md/lg`, `--header-height`, `--content-max-width` (500px).
- Motion: `--transition-fast`, `--transition-normal`.
- Font: Inter (Google Fonts) and Material Icons Round for icons
  (`<i class="material-icons-round">name</i>`).

### 9.3 Layout and layers

- Phone breakpoints: `@media (max-width: 600px)`, `480px`, `360px` (and one
  `768px`). Phone rules should target specific ids or parent classes, not
  bare shared class names, so they do not leak to other screens.
- `.app-wrapper` uses `env(safe-area-inset-*)` padding (iPhone notch / home
  bar); every breakpoint keeps it.
- **Panels:** `position: fixed`, full height, slide in from the right with
  `transform: translateX(100%)` → `.active { transform: translateX(0) }`.
- **Pop-ups:** `.modal` (full screen, centred `.modal-content`), shown with
  `style.display = 'flex'`.
- **Layers (z-index):** panels 100 (⋮ menu 101) < pop-ups 10000 (content
  10001) < messages 10010. Messages must stay above pop-ups.
- Tab switch animation `fadeIn` is **opacity only**.

### 9.4 Things that must stay true

- **The page is never wider than the screen.** An element with a `transform`
  becomes the positioning box for its `position: fixed` children, so a
  transform on a tab container would place its panels inside the page and
  widen it - which makes the page slide sideways and zoomable. Check:
  `document.documentElement.scrollWidth` equals the screen width while
  switching tabs and opening every panel.
- **No zooming:** `touch-action: manipulation` on every element (`*`) stops
  double-tap zoom; `maximum-scale=1.0` in the viewport tag stops iPhone
  zooming into small text boxes and dropdowns.
- **Habit day cells** prevent text selection and the iPhone callout in CSS
  (`user-select`, `-webkit-touch-callout`), not by cancelling touch events,
  so the page can always scroll.
- A `flex-basis` on buttons in a `.btn-group.vertical` sets their height and
  squashes them; vertical groups stretch on their own.

---

## 10. Offline support and reliability

### 10.1 Service worker (`service-worker.js`)

- Precaches every app file, icons and fonts (`FILES_TO_CACHE`), each file
  separately so one failure does not stop the rest.
- **HTML / JS / CSS: network first** (so updates arrive), cache when offline.
  **Icons and fonts: cache first.**
- Change `CACHE_NAME` whenever `FILES_TO_CACHE` changes. A new file the app
  needs offline must be added to `FILES_TO_CACHE`.
- Must stay at the top level; all paths in it are relative and resolved
  against its scope.
- Also handles `push` and `notificationclick` (ready for a future push
  server).

### 10.2 Reliability

- **Damaged data:** `readJSON()` sets an unreadable value aside as
  `<key>__corrupt`, tells the user, and returns the fallback.
- **Repair on load:** `normaliseHistory()` (trackers, workouts) and
  `loadHabits()` fix or drop malformed records and re-save.
- **Full storage:** `writeJSON()` removes history older than 90 days and
  retries, then reports.
- **Isolation:** each tracker is created in its own try/catch.
- **Visible errors:** uncaught errors show a message.

---

## 11. How to make common changes

| Change | Where |
|---|---|
| Quick-add amounts | `index.html`: the `[data-action="water-add"][data-amount]` / `protein-add` buttons. No JS change. |
| Default goals, texts on screen | `index.html` (static text) or the tracker's JS (messages built in code) |
| A habit colour | 1) `index.html`: a `.habits-color-option[data-color="name"]` in `#add-habit-modal`; 2) `habits/habits-styles.css`: copy every rule for an existing colour (search `.coral`) and change name and hex; 3) `getColorHex()` in `habits-scripts.js` |
| A graph period | `chartUtils.BUCKETS` in `core/chart.js`, plus an `<option>` in both `#workout-time-period` and `#graph-time-period` |
| Graph wording | `BUCKETS[period].caption` / `range`, and the `bubble` texts in `buildBuckets()` |
| A new stored setting | Add the key to `STORAGE_KEYS`, read / write with `storageManager`, and add it to `getAppStorageKeys()` |
| A new file (script, style, icon) | Link it in `index.html` in the right load order, add it to `FILES_TO_CACHE`, change `CACHE_NAME`; tell the owner to upload it into the right folder |
| A new pop-up window | Markup in `index.html` as `<div class="modal" style="display:none"><div class="modal-content">...`; show with `style.display = 'flex'`; bind its buttons once |
| A new panel | Markup `<div class="panel" id="x-panel">` with a `.close-panel` button; add `'toggle-id': 'x-panel'` to `panelToggles` in `initializePanels()` |
| A confirmation | `await utils.confirm(...)`; for destructive actions also offer `utils.showUndoToast()` |
| Colours / spacing | Tokens in `:root` (`core/core-styles.css`) |
| Phones show a letter instead of the icon, or an old icon | Raise the `?v=` number in `index.html` (`apple-touch-icon` and `manifest` links) and in every icon `src` in `manifest.json` (§3) |

---

## 12. Rules and design decisions

### 12.1 Code rules

- Local `YYYY-MM-DD` date keys; `utils.parseDateKey()`, never `new Date(key)`.
- Water / protein totals are calculated from entries, never stored as truth.
- Workout tabs are a round; adjust them with `applyTodayChange()` and
  snapshots, never rebuild them from today's history.
- Saved JSON goes through `storageManager.readJSON()` / `writeJSON()`; new
  keys go in `getAppStorageKeys()`.
- User text: `textContent` or `utils.escapeHtml()`.
- `utils.confirm()`, never `window.confirm()`; destructive actions also offer
  undo.
- Event listeners are bound once; renders must not add listeners to elements
  they do not recreate.
- Graphs and long lists are drawn only when visible, from the tap that shows
  them; never poll.
- Never cancel `touchstart` on content that scrolls.
- Paths are relative. No build tools.
- Keep the page within the screen width (§9.4).

### 12.2 Design decisions (keep unless the owner asks otherwise)

- **Dark theme only.** No light theme, no theme switch.
- **No backup reminder** or other nagging pop-ups; the owner backs up from
  the ⋮ menu when they choose. (Warnings when storage is actually full are
  fine.)
- **No in-app note** about Safari vs home-screen storage.
- **Graph label styles per period** are exactly as in the `BUCKETS` table
  (§8.5) - chosen by the owner; do not unify them.
- **Completion graphs are bars** (calendar day / week / month), with the
  current period faded; *All Comparison* is the only line graph.
- **"Today counts only once done"** in every figure (habits, workouts, water
  and protein).
- **Habit days need a press-and-hold** (0.6 s); a tap does nothing.
- **Workout tabs are rounds**, and workout history shows a per-day count
  ("Chest: 1 time").
- **History calendars** run oldest-left to newest-right and load older
  months only when **Load More History** is pressed (no automatic loading,
  no "loaded" message).
- **Water / protein history** shows every day (Daily Summary) and a graph
  (Analytics) - not a weekly list.
- **Add Missed Workout** sits at the top of the workout Daily Summary.
- **iPhone icon** stays `icons/icon-192.png`, as the page's only icon link;
  icon and manifest addresses carry a `?v=` number (§3). `manifest.json`
  has no `id` (§3).

---

## 13. Testing a change

There are no automated tests; check changes in a real browser.

1. Serve the folder (`python -m http.server 8000`) and open it.
2. **Clear old cached files first**, or you may be testing the old code: in
   the browser's developer tools, unregister the service worker and clear
   site storage caches, then reload (or hard-reload).
3. Use a **phone-sized window** (about 390 × 844; also try 360 and 320 wide).
   Most layout problems only appear under the phone `@media` rules.
4. **Test data:** make a JSON backup with realistic data and restore it via
   ⋮ → Restore / Import (or call `applyJSONBackup(object)` in the console,
   then reload). Use a separate browser profile so real data is not touched.
5. Check the console has no errors.
6. Check the page never scrolls sideways: `document.documentElement.scrollWidth`
   should equal the window width after switching tabs and opening panels.
7. For graphs, check all five periods and the labels at 320 and 390 px.
8. Remember iPhone specifics: text boxes and dropdowns, the Share sheet for
   exports, long-press on habit days, and that Safari and the home-screen
   app have separate storage.

---

## 14. Limitations

- **Reminders only fire while the app is open.** Notifications with the app
  closed need Web Push and a server, which the app does not have. On iPhone,
  Safari tabs cannot show notifications at all; the home-screen app can, but
  only while open.
- **No sync.** Data lives in one browser on one device; clearing website data
  deletes it. The JSON backup is the way to keep a copy.
- **Storage** is `localStorage` (about 5 MB) - many years of normal use.
- **Rearranging habits** uses HTML5 drag-and-drop, which some phones support
  poorly.
