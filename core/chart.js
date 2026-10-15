/**
 * Daily Tracker - Shared chart helpers
 *
 * Every graph in the app is drawn here. Habits and workouts used to carry
 * their own near-identical copies of the maths, the label formatting and the
 * SVG building - five duplicated methods each - which is how a broken monthly
 * label ended up in both and got fixed in neither. One implementation here.
 */

const chartUtils = {
  // Chart padding, in pixels. padLeft leaves room for the y-axis labels.
  GEOMETRY: { padLeft: 40, padRight: 12, padTop: 18, padBottom: 6 },

  /**
   * The Workout / Habits graph: one bar per real calendar day, week
   * (Monday-Sunday) or month, each the share of its days completed.
   *
   * This replaced a line of rolling windows (each dot = the X days before its
   * date), which could not be read: a weekly line went flat around 29% while
   * hiding which single day was done, and a dot labelled "Nov" covered
   * 16 Oct - 15 Nov. "September: 18 of 30 days" says exactly what it covers.
   *
   * `axis` is the bottom-label style, chosen by the user per period after
   * seeing each one drawn (October 2026):
   * - 'even'    one row: every bar labelled if they fit, otherwise every 2nd,
   *             3rd ... bar counted back from the current one, so the gaps
   *             are always equal (see renderEvenLabels)
   * - 'twoRow'  every bar labelled (day of its Monday), with a second row
   *             naming the month where it changes
   * `label` picks the per-bar text: for a month bucket 'month' ("May") or
   * 'monthYear' ("Nov 25"); for a week bucket 'dayMonth' ("20 Jul") - a
   * one-row week label must name its month.
   * `caption` explains what a bar is, under the graph. The last bar is always
   * the current day / week / month, still in progress, so it is drawn faded
   * in every period and every caption says so.
   */
  BUCKETS: {
    // labelGap 2: all seven day names must show, even on a 320px phone.
    weekly: {
      unit: 'day', count: 7, axis: 'even', labelGap: 2, range: 'Last 7 days',
      caption: 'Each bar = one day. Full bar = done. Today shows, faded, once done.'
    },
    monthly: {
      unit: 'week', count: 5, axis: 'twoRow', range: 'Last 5 weeks',
      caption: 'Each bar = one week (Mon–Sun), labelled by its Monday. Faded bar = this week so far.'
    },
    quarterly: {
      unit: 'week', count: 13, axis: 'even', label: 'dayMonth', range: 'Last 13 weeks',
      caption: 'Each bar = one week (Mon–Sun), labelled by its Monday. Faded bar = this week so far.'
    },
    halfyearly: {
      unit: 'month', count: 6, axis: 'even', label: 'month', range: 'Last 6 months',
      caption: 'Each bar = one calendar month. Faded bar = this month so far.'
    },
    yearly: {
      // labelGap 4: at 10 (or 6), every 2nd month missed fitting a 390px
      // phone by a pixel and fell back to every 3rd - four labels for twelve
      // bars. The real gaps at every 2nd month are 6-8px.
      unit: 'month', count: 12, axis: 'even', label: 'monthYear', labelGap: 4,
      range: 'Last 12 months',
      caption: 'Faded bar = this month so far.'
    }
  },

  /**
   * Calendar buckets for a period, oldest first. The last one always holds
   * today, so it is the one still in progress.
   *
   * Only days up to today, and from `firstKey` on, are counted: the current
   * week or month counts the days so far, and days before tracking started
   * are left out rather than counted as misses. Today counts only once it is
   * done - until then it is not a miss, just not over yet; counting it made
   * every figure dip each morning (the user's call, October 2026). A bucket
   * with no counted days has a null value (no bar).
   *
   * @param {Function} isDoneOnDate - (dateKey) => boolean
   * @param {string} period - A key of BUCKETS; unknown values fall back to weekly
   * @param {string|null} firstKey - First tracked day (YYYY-MM-DD), or null
   * @returns {Array<{date: Date, value: number|null, done: number, total: number,
   *   label: string, group: string, fullLabel: string, bubble: string}>}
   *   label: text under the bar; group: the second-row text (month) for
   *   'twoRow' axes; fullLabel: a label that stands alone ("20 Jul"), for a
   *   comparison line; bubble: the tap text.
   */
  buildBuckets(isDoneOnDate, period, firstKey) {
    const config = this.BUCKETS[period] || this.BUCKETS.weekly;
    const today = utils.startOfToday();
    const todayKey = utils.getCurrentDate();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const buckets = [];

    for (let i = config.count - 1; i >= 0; i--) {
      let start;
      let end;

      if (config.unit === 'day') {
        start = new Date(today);
        start.setDate(today.getDate() - i);
        end = new Date(start);
      } else if (config.unit === 'week') {
        // Monday of this week, then back i weeks.
        start = new Date(today);
        start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7 * i);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
      } else {
        start = new Date(today.getFullYear(), today.getMonth() - i, 1);
        end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      }

      let done = 0;
      let total = 0;
      for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
        const key = utils.formatDate(day);
        if (key > todayKey) break;
        if (firstKey && key < firstKey) continue;
        const isDone = isDoneOnDate(key);
        if (key === todayKey && !isDone) continue;
        total++;
        if (isDone) done++;
      }

      const value = total > 0 ? Math.round((done / total) * 100) : null;
      const current = i === 0;
      const month = months[start.getMonth()];
      const shortYear = String(start.getFullYear()).slice(2);

      let label;
      let group = '';
      let fullLabel;
      let bubble;

      if (config.unit === 'day') {
        label = days[start.getDay()];
        fullLabel = label;
        // Today has a bar (and so a bubble) only once done.
        bubble = current
          ? 'Today: done'
          : `${label} ${start.getDate()} ${month}: ${done ? 'done' : 'not done'}`;
      } else if (config.unit === 'week') {
        fullLabel = `${start.getDate()} ${month}`;
        label = config.label === 'dayMonth' ? fullLabel : String(start.getDate());
        group = month;
        bubble = `Week of ${fullLabel}: ${done} of ${utils.formatDayCount(total)}` +
          `${current ? ' so far' : ''} (${value}%)`;
      } else {
        label = config.label === 'monthYear' ? `${month} ${shortYear}` : month;
        fullLabel = `${month} ${shortYear}`;
        bubble = `${fullMonths[start.getMonth()]} ${start.getFullYear()}: ` +
          `${done} of ${utils.formatDayCount(total)}${current ? ' so far' : ''} (${value}%)`;
      }

      buckets.push({ date: start, value, done, total, label, group, fullLabel, bubble });
    }

    return buckets;
  },

  /**
   * Draw the Workout / Habits graph as calendar bars, with its headline and
   * caption.
   *
   * The headline is the share of all counted days in those bars, so the
   * figure and the bars always describe the same days.
   *
   * @param {Object} options
   * @param {Element} options.chart
   * @param {Element} options.labels
   * @param {Element} options.summary - Headline element
   * @param {Element} [options.caption] - Line under the graph saying what a bar is
   * @param {Function} options.isDone - (dateKey) => boolean
   * @param {string} options.period
   * @param {string|null} options.firstKey - First tracked day
   * @param {string} options.color
   * @param {string} [options.noun] - For the headline caption
   */
  renderCompletionBars({
    chart, labels, summary, caption, isDone, period, firstKey, color, noun = 'days completed'
  }) {
    if (!chart || chart.offsetWidth === 0) return;

    const config = this.BUCKETS[period] || this.BUCKETS.weekly;
    const buckets = this.buildBuckets(isDone, period, firstKey);

    this.renderBarChart({
      chart,
      labels,
      dataPoints: buckets,
      color,
      fixedMax: 100,
      axisSuffix: '%',
      bubbleText: bucket => bucket.bubble,
      fadeLast: true,
      axis: config.axis,
      labelGap: config.labelGap
    });

    const done = buckets.reduce((sum, b) => sum + b.done, 0);
    const total = buckets.reduce((sum, b) => sum + b.total, 0);
    this.renderSummary(summary, config.range, total ? Math.round((done / total) * 100) : null, noun);

    if (caption) caption.textContent = config.caption;
  },

  /**
   * Short date label, "9 Oct". Used for points that carry no label of their
   * own - the water/protein bars and the fallback in the line chart's bubble.
   *
   * @param {Date} date
   * @returns {string}
   */
  formatPeriodLabel(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  },

  /**
   * Build a smooth cubic path through the points.
   *
   * @param {Array<{x: number, y: number}>} coords
   * @returns {string} SVG path data
   */
  buildSmoothPath(coords) {
    if (coords.length === 0) return '';
    if (coords.length === 1) return `M ${coords[0].x},${coords[0].y}`;

    let path = `M ${coords[0].x},${coords[0].y}`;

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const cp = (b.x - a.x) / 3;
      path += ` C ${a.x + cp},${a.y} ${b.x - cp},${b.y} ${b.x},${b.y}`;
    }

    return path;
  },

  /**
   * A smooth path that breaks where a point has no value (y null), rather
   * than joining across it - a workout not done yet today has no point.
   *
   * @param {Array<{x: number, y: number|null}>} coords
   * @returns {string} SVG path data
   */
  buildLinePath(coords) {
    const runs = [[]];
    coords.forEach(coord => {
      if (coord.y === null) runs.push([]);
      else runs[runs.length - 1].push(coord);
    });
    return runs.map(run => this.buildSmoothPath(run)).filter(Boolean).join(' ');
  },

  /**
   * Draw a line chart (0-100%).
   *
   * Only Workout's "All Comparison" view uses this now - one line per
   * workout, since several bars side by side per week would be unreadable.
   * Its points are the same calendar buckets as the bars, carrying their own
   * `label` and `bubble`.
   *
   * Everything - grid, line, points - goes into a single SVG using one
   * coordinate system. The old version drew the line as SVG but the points as
   * absolutely positioned divs, two systems that drifted apart, and put the
   * x-axis labels in a flex row with space-between so they never sat under the
   * points they described.
   *
   * @param {Object} options
   * @param {Element} options.chart - Chart container (position: relative)
   * @param {Element} options.labels - Container for x-axis labels
   * @param {Array<{date: Date, value: number, label?: string, bubble?: string}>} options.dataPoints
   * @param {string} options.color - Line colour
   * @param {string} [options.valueSuffix] - Appended in the fallback tap bubble
   * @param {number} [options.labelGap] - Least space between two bottom
   *   labels, px: pass the period's, so they match its bar graph
   */
  renderLineChart({ chart, labels, dataPoints, color, valueSuffix = '%', labelGap = 10 }) {
    if (!chart || chart.offsetWidth === 0) return;

    chart.innerHTML = '';

    const width = chart.offsetWidth;
    const height = chart.offsetHeight;
    const { padLeft, padRight, padTop, padBottom } = this.GEOMETRY;
    const plotWidth = Math.max(1, width - padLeft - padRight);
    const plotHeight = Math.max(1, height - padTop - padBottom);
    const maxValue = 100;

    const toY = value => padTop + (1 - Math.min(value, maxValue) / maxValue) * plotHeight;
    const toX = index => dataPoints.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + (index / (dataPoints.length - 1)) * plotWidth;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';

    // Grid lines, each with its value beside it as SVG text, so every label
    // sits exactly on its line. The labels used to be a separate HTML column
    // spaced with flexbox, whose padding never matched the SVG's, so "0" and
    // "100" sat several pixels off their lines.
    [0, 25, 50, 75, 100].forEach(value => {
      const y = toY(value);

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', padLeft);
      line.setAttribute('x2', width - padRight);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('opacity', value === 0 ? '0.25' : '0.08');
      svg.appendChild(line);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', padLeft - 6);
      label.setAttribute('y', y);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', 'currentColor');
      label.setAttribute('opacity', '0.6');
      label.textContent = `${value}%`;
      svg.appendChild(label);
    });

    // A null value (today, not done yet) gets no point and breaks the line.
    const coords = dataPoints.map((point, index) => ({
      x: toX(index),
      y: point.value === null ? null : toY(point.value)
    }));

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', this.buildLinePath(coords));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    // A tap bubble, because the old `title` attribute shows nothing on touch.
    const bubble = document.createElement('div');
    bubble.className = 'chart-value-bubble';
    bubble.setAttribute('aria-live', 'polite');

    coords.forEach((coord, index) => {
      const point = dataPoints[index];
      if (coord.y === null) return;

      // Generous invisible hit area - a 4px dot is not a tap target.
      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('cx', coord.x);
      hit.setAttribute('cy', coord.y);
      hit.setAttribute('r', '16');
      hit.setAttribute('fill', 'transparent');
      hit.style.cursor = 'pointer';

      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', coord.x);
      dot.setAttribute('cy', coord.y);
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', color);

      const show = (event) => {
        event.stopPropagation();
        this.showBubble(
          bubble,
          point.bubble || `${this.formatPeriodLabel(point.date)} — ${point.value}${valueSuffix}`,
          coord.x, coord.y, width
        );
      };

      hit.addEventListener('click', show);
      svg.appendChild(hit);
      svg.appendChild(dot);
    });

    // Dismiss the bubble on the next tap anywhere in the chart. Bound to the
    // SVG, which is rebuilt on every render - it used to go on the chart
    // container, which is not, so every redraw added another listener (each
    // holding on to its own discarded bubble) for as long as the app ran.
    svg.addEventListener('click', () => bubble.classList.remove('visible'));

    chart.appendChild(svg);
    chart.appendChild(bubble);

    // Evenly spaced, like the bar graphs it sits beside.
    this.renderEvenLabels({ labels, dataPoints, toX, gap: labelGap });
  },

  /**
   * Draw a bar chart, with an optional dashed goal line.
   *
   * Used by water and protein (daily amounts, scale fitted to the data, goal
   * line) and by habits and workouts (completion %, fixed 0-100% scale, via
   * renderCompletionBars). Same rules as the line chart: bars, grid, goal
   * line and y-axis labels share one SVG and one coordinate system - the
   * labels are SVG text, so each sits exactly on its grid line - x labels are
   * placed at each bar's centre, and tapping a bar shows its value.
   *
   * @param {Object} options
   * @param {Element} options.chart - Chart container (position: relative)
   * @param {Element} options.labels - Container for x-axis labels
   * @param {Array<{date: Date, value: number}>} options.dataPoints - Oldest first
   * @param {string} options.color - Bar colour
   * @param {number} [options.goal] - Value for the goal line; 0 for none
   * @param {string} [options.unit] - Appended in the tap bubble
   * @param {number} [options.fixedMax] - Fixed top of the scale (100 for
   *   percentages) instead of one fitted to the data
   * @param {string} [options.axisSuffix] - Appended to y-axis labels ("%")
   * @param {Function} [options.bubbleText] - (point) => tap bubble text
   * @param {boolean} [options.fadeLast] - Draw the last bar faded: the
   *   current day / week / month, still in progress
   * @param {string} [options.axis] - 'twoRow' labels every bar and names the
   *   month on a second row (points carry `label` and `group`); 'even' is
   *   one row, every nth bar from the last (renderEvenLabels); anything
   *   else is one row, thinned to what fits
   * @param {number} [options.labelGap] - For one-row labels: least space
   *   between two, px (see renderXAxisLabels)
   *
   * A point whose value is null gets no bar and no tap target (a day before
   * tracking started). With fixedMax set, a 0 gets a thin stub on the axis,
   * so "counted, none done" reads differently from "not counted".
   */
  renderBarChart({
    chart, labels, dataPoints, color, goal = 0, unit = '',
    fixedMax = 0, axisSuffix = '', bubbleText = null, fadeLast = false, axis = 'single',
    labelGap = 10
  }) {
    if (!chart || chart.offsetWidth === 0) return;

    chart.innerHTML = '';

    const width = chart.offsetWidth;
    const height = chart.offsetHeight;
    const { padLeft, padRight, padTop, padBottom } = this.GEOMETRY;
    const plotWidth = Math.max(1, width - padLeft - padRight);
    const plotHeight = Math.max(1, height - padTop - padBottom);

    // Four even steps of a round number, tall enough for the highest bar and
    // the goal line - or a fixed scale when given.
    const highest = Math.max(goal, ...dataPoints.map(point => point.value || 0));
    const step = fixedMax ? fixedMax / 4 : this.niceStep(highest / 4);
    const maxValue = step * 4;

    const toY = value => padTop + (1 - Math.min(value, maxValue) / maxValue) * plotHeight;
    const slot = plotWidth / Math.max(1, dataPoints.length);
    const toX = index => padLeft + slot * (index + 0.5);
    const barWidth = Math.min(28, slot * 0.6);
    const baseline = padTop + plotHeight;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';

    // Grid lines, each with its value beside it.
    for (let i = 0; i <= 4; i++) {
      const value = step * i;
      const y = toY(value);

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', padLeft);
      line.setAttribute('x2', width - padRight);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('opacity', i === 0 ? '0.25' : '0.08');
      svg.appendChild(line);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', padLeft - 6);
      label.setAttribute('y', y);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', 'currentColor');
      label.setAttribute('opacity', '0.6');
      label.textContent = this.formatAxisValue(value) + axisSuffix;
      svg.appendChild(label);
    }

    const bubble = document.createElement('div');
    bubble.className = 'chart-value-bubble';
    bubble.setAttribute('aria-live', 'polite');

    dataPoints.forEach((point, index) => {
      // Not counted (before tracking started): nothing to draw or tap.
      if (point.value === null || point.value === undefined) return;

      const x = toX(index);
      // A zero on a fixed scale gets a 3px stub, so it is visibly "none".
      const stub = fixedMax && point.value === 0 ? 3 : 0;
      const top = Math.min(toY(point.value), baseline - stub);

      const bar = document.createElementNS(NS, 'rect');
      bar.setAttribute('x', x - barWidth / 2);
      bar.setAttribute('y', top);
      bar.setAttribute('width', barWidth);
      bar.setAttribute('height', Math.max(0, baseline - top));
      bar.setAttribute('rx', Math.min(3, barWidth / 2));
      bar.setAttribute('fill', color);
      // The current (unfinished) period is faded; so is a zero stub.
      if (fadeLast && index === dataPoints.length - 1) {
        bar.setAttribute('opacity', '0.45');
      } else if (stub) {
        bar.setAttribute('opacity', '0.5');
      }
      svg.appendChild(bar);

      // The whole column is the tap target - a short bar, or a day with
      // nothing logged, would otherwise be impossible to hit.
      const hit = document.createElementNS(NS, 'rect');
      hit.setAttribute('x', x - slot / 2);
      hit.setAttribute('y', padTop);
      hit.setAttribute('width', slot);
      hit.setAttribute('height', plotHeight);
      hit.setAttribute('fill', 'transparent');
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', (event) => {
        event.stopPropagation();
        const amount = Math.round(point.value * 10) / 10;
        const text = bubbleText
          ? bubbleText(point)
          : `${this.formatPeriodLabel(point.date)} — ${amount}${unit ? ` ${unit}` : ''}`;
        this.showBubble(bubble, text, x, top, width);
      });
      svg.appendChild(hit);
    });

    // Drawn after the bars so it stays visible across them.
    if (goal > 0) {
      const y = toY(goal);

      const goalLine = document.createElementNS(NS, 'line');
      goalLine.setAttribute('x1', padLeft);
      goalLine.setAttribute('x2', width - padRight);
      goalLine.setAttribute('y1', y);
      goalLine.setAttribute('y2', y);
      goalLine.setAttribute('stroke', 'currentColor');
      goalLine.setAttribute('stroke-width', '1.5');
      goalLine.setAttribute('stroke-dasharray', '5 4');
      goalLine.setAttribute('opacity', '0.7');
      goalLine.style.pointerEvents = 'none';
      svg.appendChild(goalLine);

      const goalLabel = document.createElementNS(NS, 'text');
      goalLabel.setAttribute('x', width - padRight);
      goalLabel.setAttribute('y', y - 5);
      goalLabel.setAttribute('text-anchor', 'end');
      goalLabel.setAttribute('font-size', '10');
      goalLabel.setAttribute('fill', 'currentColor');
      goalLabel.setAttribute('opacity', '0.7');
      goalLabel.style.pointerEvents = 'none';
      goalLabel.textContent = 'goal';
      svg.appendChild(goalLabel);
    }

    // Any tap that is not on a bar dismisses the bubble. Bound to the SVG,
    // which is rebuilt on every render, so listeners never pile up.
    svg.addEventListener('click', () => bubble.classList.remove('visible'));

    chart.appendChild(svg);
    chart.appendChild(bubble);

    if (axis === 'twoRow') {
      this.renderTwoRowLabels({ labels, dataPoints, toX, slot, fadeLast });
    } else if (axis === 'even') {
      this.renderEvenLabels({ labels, dataPoints, toX, gap: labelGap });
    } else {
      this.renderXAxisLabels({ labels, dataPoints, toX, centreEnds: true, gap: labelGap });
    }
  },

  /**
   * Bottom labels on two rows: every bar labelled on the first (e.g. the day
   * of its week's Monday), and the second naming the group (month) at the
   * bar where it starts, left-aligned to that bar's slot.
   *
   * Every bar keeps its label - they are short, so they fit even at 13 bars
   * on a phone. A group that starts too close to the next one (a month with
   * only its last week on show) gives way to it rather than overlapping.
   *
   * @param {Object} options
   * @param {Element} options.labels
   * @param {Array<{label: string, group: string}>} options.dataPoints
   * @param {Function} options.toX - index => bar centre x
   * @param {number} options.slot - Width of one bar's column
   * @param {boolean} [options.fadeLast] - Dim the current period's label too
   */
  renderTwoRowLabels({ labels, dataPoints, toX, slot, fadeLast = false }) {
    if (!labels) return;

    labels.innerHTML = '';
    labels.classList.add('chart-labels-positioned', 'chart-labels-two-row');

    const GUTTER = 6;
    let previousGroup = null;
    let previousSpan = null;

    dataPoints.forEach((point, index) => {
      const top = document.createElement('span');
      top.textContent = point.label;
      top.style.left = `${toX(index)}px`;
      if (fadeLast && index === dataPoints.length - 1) top.classList.add('chart-label-current');
      labels.appendChild(top);

      if (point.group && point.group !== previousGroup) {
        const group = document.createElement('span');
        group.className = 'chart-label-group';
        group.textContent = point.group;
        group.style.left = `${toX(index) - slot / 2 + 1}px`;
        labels.appendChild(group);

        if (previousSpan &&
            previousSpan.getBoundingClientRect().right + GUTTER > group.getBoundingClientRect().left) {
          previousSpan.remove();
        }
        previousSpan = group;
        previousGroup = point.group;
      }
    });
  },

  /**
   * Show the tap bubble above a point, kept inside the chart.
   *
   * The bubble is centred on its `left` (translateX(-50%)), so above the
   * first or last point it used to hang over the chart's edge. Fading it out
   * does not remove it from layout, so after tapping the last point the
   * history panel could be scrolled sideways for good.
   *
   * @param {Element} bubble
   * @param {string} text
   * @param {number} x - Point's x within the chart
   * @param {number} y - Point's y within the chart
   * @param {number} chartWidth
   */
  showBubble(bubble, text, x, y, chartWidth) {
    bubble.textContent = text;

    const half = bubble.offsetWidth / 2;
    const left = Math.min(Math.max(x, half), chartWidth - half);

    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(0, y - 34)}px`;
    bubble.classList.add('visible');
  },

  /**
   * A round step size (1, 2, 2.5 or 5 times a power of ten) at least `raw`.
   *
   * @param {number} raw
   * @returns {number}
   */
  niceStep(raw) {
    // Nothing to scale against: show 0-100.
    if (!(raw > 0)) return 25;

    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalised = raw / magnitude;

    let factor = 10;
    if (normalised <= 1) factor = 1;
    else if (normalised <= 2) factor = 2;
    else if (normalised <= 2.5) factor = 2.5;
    else if (normalised <= 5) factor = 5;

    return factor * magnitude;
  },

  /**
   * Y-axis value, kept short enough for the axis gutter: 2500 reads "2.5k".
   *
   * @param {number} value
   * @returns {string}
   */
  formatAxisValue(value) {
    if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
    return String(Math.round(value * 100) / 100);
  },

  /**
   * One row of labels, equally spaced: every bar if they all fit, otherwise
   * every 2nd, 3rd ... bar, counted back from the last (current) one.
   *
   * renderXAxisLabels thins greedily from both ends, which can leave an odd
   * gap ("Mar 26" then "Jun 26", two months skipped where every other gap
   * skipped one). Here the smallest step that fits wins, measured rather
   * than guessed, so it adapts to the phone width and the font.
   *
   * @param {Object} options
   * @param {number} [options.gap] - Least space between two labels, px
   */
  renderEvenLabels({ labels, dataPoints, toX, gap = 10 }) {
    if (!labels) return;

    labels.innerHTML = '';
    labels.classList.add('chart-labels-positioned');
    labels.classList.remove('chart-labels-two-row');
    if (dataPoints.length === 0) return;

    const lastIndex = dataPoints.length - 1;
    const box = labels.getBoundingClientRect();

    // Every bar's label, centred under its bar and nudged back inside the
    // box at the ends; hidden until a step is chosen.
    const spans = dataPoints.map((point, index) => {
      const span = document.createElement('span');
      span.textContent = point.label || this.formatPeriodLabel(point.date);
      span.style.left = `${toX(index)}px`;
      span.style.visibility = 'hidden';
      labels.appendChild(span);
      const rect = span.getBoundingClientRect();
      if (rect.left < box.left) {
        span.style.transform = `translateX(calc(-50% + ${box.left - rect.left}px))`;
      } else if (rect.right > box.right) {
        span.style.transform = `translateX(calc(-50% - ${rect.right - box.right}px))`;
      }
      return span;
    });
    const rects = spans.map(span => span.getBoundingClientRect());

    const fits = (step) => {
      for (let index = lastIndex; index - step >= 0; index -= step) {
        if (rects[index - step].right + gap > rects[index].left) return false;
      }
      return true;
    };

    // Up to lastIndex + 1, which keeps only the current label: on a very
    // narrow chart even the first and last alone can collide.
    let step = 1;
    while (step <= lastIndex && !fits(step)) step++;

    // Remove the rest rather than hide them, so a screen reader reads only
    // what is shown.
    spans.forEach((span, index) => {
      if ((lastIndex - index) % step === 0) span.style.visibility = '';
      else span.remove();
    });
  },

  /**
   * Place x-axis labels at their point's exact x position.
   *
   * @param {Object} options
   * @param {boolean} [options.centreEnds] - Centre the first and last labels
   *   under their point too, nudged just enough to stay inside the box. For
   *   bar charts, whose end bars sit in from the edge. Line charts leave this
   *   off: their end points are on the edge, so those labels are aligned
   *   inwards instead.
   * @param {number} [options.gap] - Least space between two labels, px;
   *   closer ones are dropped. Weekly's day names pass 2: each sits centred
   *   under its own bar, and at 10 a 320px phone dropped three of the seven
   *   ("Wed" is 24px wide in a 27px column).
   */
  renderXAxisLabels({ labels, dataPoints, toX, centreEnds = false, gap = 10 }) {
    if (!labels) return;

    labels.innerHTML = '';
    labels.classList.add('chart-labels-positioned');
    // One row - undo a previous two-row render of the same container.
    labels.classList.remove('chart-labels-two-row');
    if (dataPoints.length === 0) return;

    const lastIndex = dataPoints.length - 1;

    // Shift a centred label back inside the box if it pokes past either side.
    const keepInside = (span) => {
      const box = labels.getBoundingClientRect();
      const rect = span.getBoundingClientRect();
      if (rect.left < box.left) {
        span.style.transform = `translateX(calc(-50% + ${box.left - rect.left}px))`;
      } else if (rect.right > box.right) {
        span.style.transform = `translateX(calc(-50% - ${rect.right - box.right}px))`;
      }
      return span;
    };

    const place = (index, transform, before) => {
      const span = document.createElement('span');
      // A point can carry its own label (calendar buckets: "Mon", "Sep").
      span.textContent = dataPoints[index].label || this.formatPeriodLabel(dataPoints[index].date);
      span.style.left = `${toX(index)}px`;
      // Keep the outermost labels inside the box rather than centred on the
      // edge, where they would be clipped.
      if (transform) span.style.transform = transform;
      // Inserted in visual order, so the DOM reads left to right for anything
      // that walks it - a screen reader, or a future caller.
      labels.insertBefore(span, before || null);
      return span;
    };

    // The two ends define the range, so they are always shown.
    const first = centreEnds ? keepInside(place(0, null)) : place(0, 'translateX(0)');
    if (lastIndex === 0) return;
    const last = centreEnds
      ? keepInside(place(lastIndex, null))
      : place(lastIndex, 'translateX(-100%)');

    // Interior labels are kept only if they measurably clear their neighbours.
    //
    // Choosing indices arithmetically (every nth point) is not enough: label
    // width varies with the period and the font, and the always-shown last
    // point can land right next to the last one chosen - which is how
    // "13 Aug" and "27 Aug" ended up printed on top of each other.
    const GUTTER = gap;
    let clearedTo = first.getBoundingClientRect().right;
    const rightLimit = last.getBoundingClientRect().left;

    for (let index = 1; index < lastIndex; index++) {
      const span = place(index, null, last);
      const rect = span.getBoundingClientRect();

      if (rect.left - GUTTER < clearedTo || rect.right + GUTTER > rightLimit) {
        span.remove();
      } else {
        clearedTo = rect.right;
      }
    }
  },

  /**
   * Fill in the headline figure above a chart.
   *
   * @param {Element} element - Summary container
   * @param {string} periodLabel - e.g. "Last 30 days"
   * @param {number|null} value - Percentage, or null to show a caption only
   * @param {string} [noun] - What is being measured
   */
  renderSummary(element, periodLabel, value, noun = 'days completed') {
    if (!element) return;

    element.innerHTML = '';

    if (value === null) {
      const caption = document.createElement('span');
      caption.className = 'chart-summary-caption';
      caption.textContent = `${periodLabel} · % of ${noun}`;
      element.appendChild(caption);
      return;
    }

    const figure = document.createElement('strong');
    figure.className = 'chart-summary-value';
    figure.textContent = `${value}%`;

    const caption = document.createElement('span');
    caption.className = 'chart-summary-caption';
    caption.textContent = `of ${noun} · ${periodLabel}`;

    element.appendChild(figure);
    element.appendChild(caption);
  }
};
