/* ── Peace Meter — Frontend App (no dependencies) ──────── */
/* VERSION: 2.3.1 */

const APP_VERSION = '2.3.1'; // 2026-05-20: Pair fallback scores + status indicators
const GAUGE_PATH_LEN = 251.2; // arc length for SVG gauge
const UPDATE_INTERVAL = 15 * 60 * 1000; // 15 min
const STALE_THRESHOLD = 10 * 60 * 1000; // 10 min — refresh sooner if stale
const CACHE_KEY = 'pm-cache';
const MAX_RETRY = 3;
const RETRY_DELAY = [1000, 2000, 4000]; // L1: exponential backoff

/* ── Language toggle ──────────────────────────────────── */
function toggleLang() {
  const next = currentLang === 'en' ? 'he' : 'en';
  setLanguage(next);
  document.getElementById('langToggle').textContent = next === 'en' ? 'א' : 'En';
  // re-render everything in new language
  lastData && renderAll(lastData);
}

/* ── Level helpers ─────────────────────────────────────── */
function getLevel(score) {
  const levels = {
    frozen:      { cls: 'frozen',      color: '#7dd3fc' },
    thawing:     { cls: 'thawing',     color: '#38bdf8' },
    growing:     { cls: 'growing',     color: '#4ade80' },
    flourishing: { cls: 'flourishing', color: '#fbbf24' }
  };
  let key;
  if (score <= 25) key = 'frozen';
  else if (score <= 50) key = 'thawing';
  else if (score <= 75) key = 'growing';
  else key = 'flourishing';
  return { label: t('levels.' + key), ...levels[key] };
}

/* ── Gauge rendering ──────────────────────────────────── */
function renderGauge(score) {
  const level = getLevel(score);
  const fill = document.getElementById('gaugeFill');
  const scoreEl = document.getElementById('gaugeScore');
  const statusEl = document.getElementById('statusLabel');
  const srEl = document.getElementById('gaugeSr'); // R4: screen reader

  const offset = GAUGE_PATH_LEN * (1 - score / 100);
  fill.style.strokeDashoffset = offset;
  fill.style.stroke = `url(#grad-${level.cls})`;

  scoreEl.textContent = score;
  scoreEl.style.color = level.color;

  statusEl.textContent = level.label;
  statusEl.className = `status-label ${level.cls}`;

  // R4: announce to screen readers
  if (srEl) srEl.textContent = `Peace score: ${score} out of 100. Status: ${level.label}`;
}

/* ── SVG Sparkline (no dependencies) ──────────────────── */
function renderSparklineSvg(container, data, color) {
  const w = 140, h = 32, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const firstPt = pts[0].split(',');
  const lastPt  = pts[pts.length - 1].split(',');
  const areaD = `M${pts.join(' L')} L${lastPt[0]},${h} L${firstPt[0]},${h} Z`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.style.cssText = 'width:100%;height:32px;display:block;';

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', color);
  area.setAttribute('opacity', '0.12');
  svg.appendChild(area);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(line);

  container.innerHTML = '';
  container.appendChild(svg);
}

/* ── SVG Trend Chart (no dependencies) ───────────────── */
function renderTrend(history) {
  const svgEl = document.getElementById('trendSvg');
  const scores = history.scores;
  const labels = history.labels;
  const lastScore = scores[scores.length - 1];
  const level = getLevel(lastScore);

  const W = 600, H = 200;
  const padL = 40, padR = 20, padT = 20, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.innerHTML = '';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'trendGrad');
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', level.color); stop1.setAttribute('stop-opacity', '0.2');
  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', level.color); stop2.setAttribute('stop-opacity', '0');
  grad.appendChild(stop1); grad.appendChild(stop2);
  defs.appendChild(grad);
  svgEl.appendChild(defs);

  for (let yVal of [0, 25, 50, 75, 100]) {
    const y = padT + chartH - (yVal / 100) * chartH;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', padL); line.setAttribute('y1', y);
    line.setAttribute('x2', padL + chartW); line.setAttribute('y2', y);
    line.setAttribute('stroke', '#1e2a38'); line.setAttribute('stroke-width', '1');
    svgEl.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', padL - 6); text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('fill', '#64748b'); text.setAttribute('font-size', '10');
    text.textContent = yVal;
    svgEl.appendChild(text);
  }

  const pts = scores.map((s, i) => {
    const x = padL + (i / (scores.length - 1)) * chartW;
    const y = padT + chartH - (s / 100) * chartH;
    return { x, y };
  });

  const areaPts = pts.map(p => `${p.x},${p.y}`);
  const firstPt = areaPts[0].split(',');
  const lastPt  = areaPts[areaPts.length - 1].split(',');
  const areaD = `M${areaPts.join(' L')} L${lastPt[0]},${padT + chartH} L${firstPt[0]},${padT + chartH} Z`;
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', 'url(#trendGrad)');
  svgEl.appendChild(area);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', level.color);
  line.setAttribute('stroke-width', '2.5');
  line.setAttribute('stroke-linejoin', 'round');
  svgEl.appendChild(line);

  pts.forEach((p, i) => {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', level.color);
    svgEl.appendChild(dot);

    if (i % 2 === 0) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', p.x); text.setAttribute('y', padT + chartH + 18);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#64748b'); text.setAttribute('font-size', '9');
      text.textContent = labels[labels.length - 1 - i] || '';
      svgEl.appendChild(text);
    }
  });
}

/* ── Signal cards ─────────────────────────────────────── */
function renderSignals(signals) {
  const grid = document.getElementById('signalGrid');
  grid.innerHTML = '';

  Object.keys(signals).forEach(key => {
    const s = signals[key];
    const level = getLevel(s.score);
    const sigInfo = LANG[currentLang].signals[key];
    const name = sigInfo ? sigInfo.name : s.label;

    const card = document.createElement('div');
    card.className = 'signal-card';
    card.style.cursor = 'pointer';
    card.title = sigInfo ? sigInfo.summary : '';
    card.tabIndex = 0;
    card.onclick = () => showSignalDetail(key);
    card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSignalDetail(key); }; };
    card.innerHTML = `
      <div class="signal-icon">${s.icon}</div>
      <div class="signal-name">${name}</div>
      <div class="signal-score" style="color:${level.color}">${s.score}</div>
      <div class="signal-detail">${s.detail}</div>
      <div id="spark-${key}" class="signal-spark"></div>
      <div style="margin-top:6px"><span class="signal-status ${s.status.toLowerCase()}">${t('status.' + s.status.toLowerCase())}</span></div>
    `;
    grid.appendChild(card);

    requestAnimationFrame(() => {
      const container = document.getElementById(`spark-${key}`);
      if (container) renderSparklineSvg(container, s.history, level.color);
    });
  });
}

/* ── Signal detail modal ──────────────────────────────── */
function showSignalDetail(key) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  const sigInfo = LANG[currentLang].signals[key];

  if (!sigInfo) return;

  const sourcesList = sigInfo.sources.map(src =>
    `<li>${src}</li>`
  ).join('');

  content.innerHTML = `
    <h2>${sigInfo.icon} ${sigInfo.name}</h2>
    <p><strong>Weight:</strong> ${sigInfo.weight}</p>
    <p>${sigInfo.summary}</p>
    <h3>Methodology</h3>
    <p>${sigInfo.detail}</p>
    <h3>Sources</h3>
    <ul>${sourcesList}</ul>
    <p style="font-size:11px;color:#64748b;">🔄 ${sigInfo.update}</p>
  `;
  overlay.classList.add('active');
}

/* ── Conflict Pairs ───────────────────────────────────── */
function renderPairs(pairs) {
  const grid = document.getElementById('pairsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  pairs.forEach(pair => {
    const card = document.createElement('div');
    card.className = 'pair-item';

    let scoreText, levelText, color;
    if (pair.score === null || pair.score === undefined) {
      scoreText = '—';
      levelText = t('pairUnknown') || 'Unknown';
      color = '#64748b';
    } else {
      const level = getLevel(pair.score);
      scoreText = pair.score;
      levelText = level.label;
      color = level.color;
    }

    card.style.borderLeftColor = color;
    const statusLabel = pair.status === 'Live' ? '●' : '◌';
    const statusColor = pair.status === 'Live' ? '#22c55e' : '#f59e0b';
    card.innerHTML = `
      <div class="pair-name">${pair.name} <span class="pair-status" style="color:${statusColor}">${statusLabel}</span></div>
      <div class="pair-score" style="color:${color}">${scoreText}</div>
      <div class="pair-level" style="color:${color}">${levelText}</div>
      <div class="pair-detail">${pair.detail || ''}</div>
    `;
    grid.appendChild(card);
  });
}

let pairsCollapsed = true;

function togglePairs() {
  const grid = document.getElementById('pairsGrid');
  const arrow = document.getElementById('pairArrow');
  pairsCollapsed = !pairsCollapsed;
  grid.style.display = pairsCollapsed ? 'none' : 'grid';
  if (arrow) arrow.classList.toggle('collapsed', pairsCollapsed);
}

/* ── Publications ─────────────────────────────────────── */
function renderPublications(pubs) {
  const container = document.getElementById('pubList');
  container.innerHTML = '';
  // Sort by date (newest first)
  pubs.sort((a, b) => new Date(b.date) - new Date(a.date));
  pubs.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pub-item';
    div.style.cursor = 'pointer';
    div.onclick = () => { if (p.link) window.open(p.link, '_blank'); };

    const titleEl = p.link ? `<a href="${p.link}" target="_blank" rel="noopener">${p.title}</a>` : p.title;
    const sentimentLabel = p.sentiment === 'peace' ? '🕊 peace' : p.sentiment === 'war' ? '⚔ war' : '⚖ neutral';
    div.innerHTML = `
      <div class="pub-source">${p.source}</div>
      <div class="pub-title">${titleEl}</div>
      <div class="pub-date">${p.date} <span class="pub-tag ${p.sentiment}">${sentimentLabel}</span></div>
    `;
    container.appendChild(div);
  });
}

/* ── Timestamps — client local time ───────────────────── */
function updateTimestamps(data) {
  const ts = new Date(data.timestamp);
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const shortTz = tzName.split('/').pop().replace(/_/g, ' ');

  const fmtOpts = {
    timeZone: tzName,
    hour: '2-digit', minute: '2-digit', hour12: false
  };
  const locale = currentLang === 'he' ? 'he-IL' : 'en-US';

  document.getElementById('lastUpdate').textContent = ts.toLocaleTimeString(locale, fmtOpts);
  document.getElementById('timezone').textContent = shortTz;

  const next = new Date(ts.getTime() + UPDATE_INTERVAL);
  document.getElementById('nextUpdate').textContent = t('nextUpdate') + ' ' + next.toLocaleTimeString(locale, fmtOpts);
}

/* ── Modal ────────────────────────────────────────────── */
function showInfo(type) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');

  const key = type === 'calculation' ? 'calc' : type;
  const html = t(key);
  content.innerHTML = html;
  overlay.classList.add('active');
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.remove('active');
});
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});

/* ── Master render ────────────────────────────────────── */
let lastData = null;

function renderAll(data) {
  lastData = data;
  renderGauge(data.master.score);
  renderSignals(data.signals);
  renderTrend(data.history);
  renderPairs(data.pairs || []);
  renderPublications(data.publications || []);
  updateTimestamps(data);
}

/* ── Load & render (with retry, cache, error banner) ─── */
let isInitialLoad = true;

async function loadAndRender() {
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');

  // L1: retry with exponential backoff
  let data = null;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch('/data.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      console.warn(`Fetch attempt ${attempt+1} failed:`, err.message);
      if (attempt < MAX_RETRY - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY[attempt]));
      }
    }
  }

  if (data) {
    // L2: cache fresh data in localStorage
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    errorBanner.style.display = 'none';
    renderAll(data);
  } else {
    // L2: try cached data as fallback
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (cached) {
        renderAll(cached);
        // L3: show error banner with stale notice
        errorMessage.textContent = t('errorCached');
        errorBanner.style.display = 'block';
        return;
      }
    } catch {}

    // No cache — show error
    errorMessage.textContent = t('errorOffline');
    errorBanner.style.display = 'block';
    document.getElementById('gaugeScore').textContent = '—';
    document.getElementById('statusLabel').textContent = 'Offline';
  }
}

loadAndRender();
setInterval(loadAndRender, UPDATE_INTERVAL);

// Set version badge
(function setVersion() {
  const el = document.getElementById('versionTag');
  if (el) el.textContent = 'v' + APP_VERSION;
})();

// L5: check if cached data is stale on load, refresh sooner
(function checkStale() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && Date.now() - Date.parse(cached.timestamp) > STALE_THRESHOLD) {
      setTimeout(loadAndRender, 3000);
    }
  } catch {}
})();
