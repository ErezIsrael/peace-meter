/* ── Peace Room — Frontend App v3 ───────────────────── */

const CATEGORIES = {
  active:     ['ceasefire', 'hostages', 'aid'],
  regional:   ['abraham-accords'],
  structural: ['governance', 'infrastructure'],
};

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
function formatTime(dateStr) {
  const d = new Date(dateStr);
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
  const d = new Date(dateStr);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/* ── Data Loading ────────────────────────────────────── */
let data = null;
let activityFeedEvents = [];
let feedShowing = 6;

async function loadData() {
  try {
    const res = await fetch('solutions.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    renderAll(data);
  } catch (err) {
    console.error('Failed to load data:', err);
    document.getElementById('momentumSummary').textContent = 'Failed to load data. Retry later.';
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
      <span class="activity-text">${ev.text}</span>
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
      <span class="card-event-text">${ev.text}</span>
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
          <span class="card-event-text">${ev.text}</span>
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

  // Solution cards
  const containers = {
    active:     document.getElementById('activeSolutions'),
    regional:   document.getElementById('regionalSolutions'),
    structural: document.getElementById('structuralSolutions'),
  };
  Object.values(containers).forEach(el => { if (el) el.innerHTML = ''; });

  const activeIds = data.activeSolutions || data.solutions.map(s => s.id);
  (data.solutions || []).forEach(solution => {
    if (!activeIds.includes(solution.id)) return;  // skip inactive categories
    const card = createSolutionCard(solution);
    let category = 'structural';
    for (const [cat, ids] of Object.entries(CATEGORIES)) {
      if (ids.includes(solution.id)) { category = cat; break; }
    }
    const container = containers[category];
    if (container) container.appendChild(card);
  });
}

/* ── Boot ────────────────────────────────────────────── */
loadData();
