/* ── Peace Room — Frontend App v3 ───────────────────── */

// No hardcoded categories — solutions render dynamically from data.activeSolutions

const MOMENTUM_CONFIG = {
  advancing: { icon: '🟢', label: 'Net Positive', cls: 'momentum-advancing' },
  stable:    { icon: '🟡', label: 'Mixed Signals', cls: 'momentum-stable' },
  stalling:  { icon: '🔴', label: 'Net Negative', cls: 'momentum-stalling' },
};

const DIRECTION_LABELS = {
  advancing: 'Advancing',
  stable:    'Stable',
  stalling:  'Stalling',
};

/* ── Helpers ─────────────────────────────────────────── */
function parseDate(dateStr) {
  if (!dateStr) return null;
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Normalize "Wednesday, April 29, 2026 - 10:00" -> "April 29, 2026 10:00"
  const normalized = dateStr
    .replace(/^\w+,?\s*/, '')       // strip day-of-week
    .replace(/\s+-\s+/, ' ');       // replace " - " with space
  d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function formatTime(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return 'recent';
  const now = new Date();
  const diffMs = now - d;
  const diffHrs = diffMs / 3600000;

  if (diffHrs < 1) {
    const mins = Math.floor(diffMs / 60000);
    return mins < 1 ? 'now' : `${mins}m`;
  }
  if (diffHrs < 24) return `${Math.floor(diffHrs)}h`;
  const days = Math.floor(diffHrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatEventTime(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '—';
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/* ── Data Loading ────────────────────────────────────── */
let data = null;
let activityFeedEvents = [];
let feedShowing = 6;

async function loadData() {
  // Try live RSS endpoint first, fall back to static JSON
  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const liveData = await res.json();
    if (liveData.useFallback) throw new Error('RSS unavailable');
    data = liveData;
    renderAll(data);
  } catch (liveErr) {
    console.warn('Live RSS unavailable, falling back to static data:', liveErr);
    try {
      const res = await fetch('solutions.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      renderAll(data);
    } catch (fallbackErr) {
      console.error('Failed to load data:', fallbackErr);
      document.getElementById('momentumSummary').textContent = 'Failed to load data. Retry later.';
    }
  }
}

/* ── Momentum Banner ─────────────────────────────────── */
function renderMomentum(momentum) {
  if (!momentum) return;
  const banner = document.getElementById('momentumBanner');
  const cfg = MOMENTUM_CONFIG[momentum.direction] || MOMENTUM_CONFIG.stable;
  banner.className = `momentum-banner ${cfg.cls}`;
  document.getElementById('momentumIcon').textContent = cfg.icon;
  document.getElementById('momentumLabel').textContent = cfg.label;
  document.getElementById('momentumSummary').textContent = momentum.summary || '';
}

/* ── Activity Feed (global) ──────────────────────────── */
function buildActivityFeed() {
  // Collect all events across all solutions, sort by date desc
  const all = [];
  (data.solutions || []).forEach(sol => {
    (sol.events || []).forEach(ev => {
      all.push({ ...ev, solutionId: sol.id, solutionName: sol.name });
    });
  });
  all.sort((a, b) => new Date(b.date) - new Date(a.date));
  activityFeedEvents = all;
  renderActivityFeed();
}

function renderActivityFeed() {
  const container = document.getElementById('activityFeed');
  const show = activityFeedEvents.slice(0, feedShowing);
  container.innerHTML = '';

  show.forEach(ev => {
    const item = document.createElement('div');
    item.className = `activity-item sentiment-${ev.sentiment || 'neutral'}`;
    item.innerHTML = `
      <span class="activity-time">${formatTime(ev.date)}</span>
      <span class="activity-solution">${ev.solutionId}</span>
      ${ev.link ? `<a href="${ev.link}" target="_blank" rel="noopener" class="activity-link">${ev.text}</a>` : `<span class="activity-text">${ev.text}</span>`}
    `;
    container.appendChild(item);
  });

  // Toggle more
  const moreBtn = document.getElementById('showMoreActivity');
  if (feedShowing >= activityFeedEvents.length) {
    moreBtn.style.display = 'none';
  } else {
    moreBtn.style.display = 'block';
    moreBtn.textContent = `Show ${Math.min(6, activityFeedEvents.length - feedShowing)} more events…`;
  }
}

document.getElementById('showMoreActivity')?.addEventListener('click', () => {
  feedShowing += 6;
  renderActivityFeed();
});

/* ── Solution Cards ──────────────────────────────────── */
function createSolutionCard(solution) {
  const card = document.createElement('div');
  card.className = `solution-card ${solution.direction}`;

  // Top row
  const top = document.createElement('div');
  top.className = 'card-top';
  top.innerHTML = `
    <span class="card-icon">${solution.icon}</span>
    <span class="card-name">${solution.name}</span>
    <span class="card-direction ${solution.direction}">${DIRECTION_LABELS[solution.direction] || solution.direction}</span>
  `;

  // Phase bar
  const phaseBar = document.createElement('div');
  phaseBar.className = 'phase-bar';
  const phases = solution.phases || [];
  const idx = solution.phaseIndex || 0;
  phases.forEach((p, i) => {
    const seg = document.createElement('div');
    seg.className = 'phase-segment' + (i < idx ? ' filled' : '') + (i === idx ? ' current' : '');
    phaseBar.appendChild(seg);
  });
  const plabel = document.createElement('span');
  plabel.className = 'phase-label';
  plabel.textContent = phases[idx] ? `"${phases[idx]}"` : '';
  phaseBar.appendChild(plabel);

  // Metric + summary
  const row = document.createElement('div');
  row.className = 'card-row';
  const kv = solution.keyMetric || {};
  const metric = document.createElement('div');
  metric.className = 'card-metric';
  let valHtml = `${kv.value || '—'}`;
  if (kv.total) valHtml += ` / ${kv.total}`;
  if (kv.unit) valHtml += `<small style="font-size:11px;color:var(--text-muted)"> ${kv.unit}</small>`;
  metric.innerHTML = `<span class="value">${valHtml}</span><span class="label">${kv.label || ''}</span>`;

  const summary = document.createElement('div');
  summary.className = 'card-summary';
  summary.textContent = solution.summary || '';
  row.appendChild(metric);
  row.appendChild(summary);

  // Inline recent events (top 3)
  const eventsDiv = document.createElement('div');
  eventsDiv.className = 'card-events';
  const title = document.createElement('div');
  title.className = 'card-events-title';
  title.textContent = 'Recent';
  eventsDiv.appendChild(title);

  const recent = (solution.events || []).slice(0, 3);
  recent.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'card-event';
    item.innerHTML = `
      <span class="card-event-dot ${ev.sentiment || 'neutral'}"></span>
      <span class="card-event-time">${formatEventTime(ev.date)}</span>
      ${ev.link ? `<a href="${ev.link}" target="_blank" rel="noopener" class="card-event-text">${ev.text}</a>` : `<span class="card-event-text">${ev.text}</span>`}
    `;
    eventsDiv.appendChild(item);
  });

  // Show more toggle
  const total = (solution.events || []).length;
  if (total > 3) {
    const toggle = document.createElement('div');
    toggle.className = 'card-events-toggle';
    toggle.textContent = `+ ${total - 3} more events`;
    toggle.addEventListener('click', () => {
      // Show all events
      const existing = eventsDiv.querySelectorAll('.card-event');
      // Remove existing items
      existing.forEach(el => el.remove());
      const titleEl = eventsDiv.querySelector('.card-events-title');
      const allEvents = solution.events || [];
      allEvents.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'card-event';
        item.innerHTML = `
          <span class="card-event-dot ${ev.sentiment || 'neutral'}"></span>
          <span class="card-event-time">${formatEventTime(ev.date)}</span>
          ${ev.link ? `<a href="${ev.link}" target="_blank" rel="noopener" class="card-event-text">${ev.text}</a>` : `<span class="card-event-text">${ev.text}</span>`}
        `;
        eventsDiv.appendChild(item);
      });
      toggle.remove();
      titleEl.textContent = 'All Events';
    });
    eventsDiv.appendChild(toggle);
  }

  card.appendChild(top);
  card.appendChild(phaseBar);
  card.appendChild(row);
  card.appendChild(eventsDiv);

  // Key Players
  if (solution.stakeholders && solution.stakeholders.length) {
    const playersDiv = document.createElement('div');
    playersDiv.className = 'card-players';
    const pTitle = document.createElement('div');
    pTitle.className = 'card-players-title';
    pTitle.textContent = 'Key Players';
    playersDiv.appendChild(pTitle);

    // Render as comma-separated inline list
    const playersRow = document.createElement('div');
    playersRow.className = 'card-players-row';

    solution.stakeholders.forEach((p, i) => {
      if (i > 0) {
        const comma = document.createElement('span');
        comma.className = 'card-players-sep';
        comma.textContent = ',';
        playersRow.appendChild(comma);
      }
      const link = document.createElement('a');
      link.className = 'card-player-chip';
      link.href = `mailto:${p.email}`;
      link.title = `${p.name} — ${p.org}`;
      link.textContent = p.name;
      playersRow.appendChild(link);
    });
    playersDiv.appendChild(playersRow);
    card.appendChild(playersDiv);
  }

  return card;
}

/* ── Render All ──────────────────────────────────────── */
function renderAll(data) {
  renderMomentum(data.overallMomentum);

  // Update timestamp
  if (data.lastUpdated) {
    const ts = document.getElementById('lastUpdated');
    ts.textContent = `Updated ${formatTime(data.lastUpdated)} ago`;
  }

  // Activity feed
  buildActivityFeed();

  // Solution cards — all active solutions in a single grid
  const grid = document.getElementById('solutionsGrid');
  if (grid) grid.innerHTML = '';
  const activeIds = data.activeSolutions || data.solutions.map(s => s.id);
  (data.solutions || [])
    .filter(solution => activeIds.includes(solution.id))
    .sort((a, b) => b.keyMetric.value - a.keyMetric.value)
    .slice(0, 8)
    .forEach(solution => {
      const card = createSolutionCard(solution);
      if (grid) grid.appendChild(card);
    });
}

/* ── Boot ────────────────────────────────────────────── */
loadData();

// Auto-refresh every 15 minutes (browser caches 3h, so this catches new data)
const REFRESH_INTERVAL = 15 * 60 * 1000;
setInterval(() => {
  console.log('[Peace Room] Auto-refreshing…');
  loadData();
}, REFRESH_INTERVAL);

// Version tag
const vt = document.getElementById('versionTag');
if (vt) vt.textContent = 'v0.3.0';
