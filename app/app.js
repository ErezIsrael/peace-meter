/* ── Peace Meter — Frontend App (no dependencies) ──────── */
/* VERSION: 2.9.0 */

const APP_VERSION = '2.9.0'; // 2026-05-24: Customizable signal weights
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

  // Volatility icon (next to main score)
  const volIcon = document.getElementById('volIcon');
  if (volIcon && lastData) {
    const vol = lastData.volMultiplier || 1;
    if (vol > 1.2) { volIcon.textContent = '🔴'; volIcon.title = `Volatility ×${vol.toFixed(1)} — AMPLIFIED`; }
    else if (vol > 1.0) { volIcon.textContent = '🟠'; volIcon.title = `Volatility ×${vol.toFixed(1)} — elevated`; }
    else { volIcon.textContent = '🔵'; volIcon.title = `Volatility ×${vol.toFixed(1)} — normal`; }
  }

  // Momentum arrow
  const momEl = document.getElementById('momentumArrow');
  if (momEl && lastData && lastData.master) {
    const mom = lastData.master.momentum || 0;
    const dir = lastData.master.trend || '→';
    if (Math.abs(mom) > 1) {
      momEl.textContent = `${dir} ${mom > 0 ? '+' : ''}${mom} pts / 12h`;
      momEl.style.display = 'inline';
      momEl.style.color = mom > 0 ? '#4ade80' : '#f87171';
    } else {
      momEl.textContent = `${dir} stable`;
      momEl.style.display = 'inline';
      momEl.style.color = '#64748b';
    }
  }

  // R4: announce to screen readers
  if (srEl) srEl.textContent = `Peace score: ${score} out of 100. Status: ${level.label}`;
}

/* ── SVG Sparkline (no dependencies) ──────────────────── */
function renderSparklineSvg(container, data, color) {
  // Guard against empty or invalid data
  data = data.filter(v => typeof v === 'number' && !isNaN(v));
  if (data.length < 2) { container.innerHTML = ''; return; }

  // Subsample to max 50 points for readability on a 140px sparkline
  const maxPts = 50;
  if (data.length > maxPts) {
    const step = (data.length - 1) / (maxPts - 1);
    data = Array.from({ length: maxPts }, (_, i) => data[Math.round(i * step)]);
  }
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
  const scores = history.scores || [];
  const labels = history.labels || [];

  // Update chart title with recent query status
  const titleEl = document.querySelector('.chart-card h3');
  if (titleEl && lastData) {
    const rq = lastData.recentQueryStatus || 'no-data';
    const rqIcon = rq === 'live' ? '🟢' : rq.includes('no-data') ? '🟡' : '🔴';
    const wh = lastData.windowHours || lastData.master?.windowHours || lastData?.signals?.tone?.windowHours || 0;
    if (rq === 'live' && wh > 0) {
      titleEl.textContent = `📈 Trend (${scores.length} pts) ${rqIcon} ${wh}h data live`;
    } else if (rq.includes('no-data')) {
      titleEl.textContent = `📈 Trend (${scores.length} pts) ${rqIcon} GDELT ingestion lag (using 24h data)`;
    } else {
      titleEl.textContent = `📈 Trend (${scores.length} pts) ${rqIcon} query failed`;
    }
  }
  const lastScore = scores.length > 0 ? scores[scores.length - 1] : 50;
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

  // Need at least 2 points to draw a line; if only 1, duplicate it
  const chartScores = scores.length < 2 ? [lastScore, lastScore] : scores;
  const chartLabels = labels.length < 2 ? ['now', 'now'] : labels;

  const pts = chartScores.map((s, i) => {
    const x = padL + (i / (chartScores.length - 1)) * chartW;
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
      text.textContent = chartLabels[chartLabels.length - 1 - i] || '';
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

/* ── Volatility indicator ─────────────────────────────── */
/* Moved into renderGauge() as an icon next to the main score */
function renderVolatility() { /* no-op */ }

/* ── Signal detail modal ──────────────────────────────── */
function showSignalDetail(key) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  const sigInfo = LANG[currentLang].signals[key];

  if (!sigInfo) return;

  const sig = lastData?.signals?.[key];
  const level = sig ? getLevel(sig.score) : null;
  const sourcesList = sigInfo.sources.map(src =>
    `<li>${src}</li>`
  ).join('');

  content.innerHTML = `
    <h2>${sigInfo.icon} ${sigInfo.name}</h2>
    ${sig ? `<div style="font-family:var(--font-heading);font-size:36px;font-weight:700;color:${level?.color || '#fff'};margin:8px 0;">${sig.score}</div>` : ''}
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

/* ── Peace Score detail modal ─────────────────────────── */
function showPeaceScoreDetail() {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  const sigInfo = LANG[currentLang].signals['master'];

  if (!sigInfo || !lastData) return;

  const score = lastData.master.score;
  const level = getLevel(score);
  const signals = lastData.signals || {};
  const sigInfoMap = LANG[currentLang].signals;

  // Build breakdown table
  let rows = '';
  const useCustom = activeCustomWeights !== null;
  const weights = useCustom ? activeCustomWeights : null;
  const entries = Object.entries(signals).sort((a, b) => {
    const wa = useCustom ? (weights[a[0]] || 0) : (parseFloat((sigInfoMap[a[0]]?.weight || '0%').replace('%', '')) / 100);
    const wb = useCustom ? (weights[b[0]] || 0) : (parseFloat((sigInfoMap[b[0]]?.weight || '0%').replace('%', '')) / 100);
    return wb - wa;
  });
  for (const [key, sig] of entries) {
    const info = sigInfoMap[key];
    const name = info ? info.name : sig.label;
    const wPct = useCustom ? Math.round((weights[key] || 0) * 1000) / 10 + '%' : (info?.weight || '?');
    const wVal = useCustom ? (weights[key] || 0) : (parseFloat((info?.weight || '0%').replace('%', '')) / 100);
    const contr = sig.score * wVal;
    rows += `<tr>
      <td>${info?.icon || ''} ${name}</td>
      <td style="text-align:center">${sig.score}</td>
      <td style="text-align:center">${wPct}</td>
      <td style="text-align:center;color:${level.color}">+${contr.toFixed(1)}</td>
    </tr>`;
  }

  const sourcesList = sigInfo.sources.map(src => `<li>${src}</li>`).join('');

  const customNote = activeCustomWeights
    ? `<p style="color:var(--accent);font-size:12px;font-weight:600;margin:4px 0;">⚙️ Custom weights active (Default: ${lastData.master.score})</p>`
    : '';

  content.innerHTML = `
    <h2>☮️ ${sigInfo.name}</h2>
    <div style="font-family:var(--font-heading);font-size:48px;font-weight:700;color:${level.color};margin:8px 0;">${score}</div>
    ${customNote}
    <p style="color:${level.color};font-weight:600;">${level.label}</p>
    <p>${sigInfo.summary}</p>
    <h3>Signal Breakdown</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;">
      <thead><tr style="border-bottom:1px solid var(--border);">
        <th style="text-align:left;padding:4px">Signal</th>
        <th style="text-align:center;padding:4px">Score</th>
        <th style="text-align:center;padding:4px">Weight</th>
        <th style="text-align:center;padding:4px">Contribution</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h3>Methodology</h3>
    <p style="white-space:pre-line">${sigInfo.detail}</p>
    <h3>Sources</h3>
    <ul>${sourcesList}</ul>
    <p style="font-size:11px;color:#64748b;">🔄 ${sigInfo.update}</p>
  `;
  overlay.classList.add('active');
}

/* ── Trend detail modal ───────────────────────────────── */
function showTrendDetail(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');

  if (!lastData) return;

  const history = lastData.history || {};
  const scores = history.scores || [];
  const labels = history.labels || [];
  const master = lastData.master || {};
  const score = master.score || '--';
  const level = getLevel(typeof score === 'number' ? score : 50);

  // Stats
  const nums = scores.filter(v => typeof v === 'number' && !isNaN(v));
  const min = nums.length ? Math.min(...nums) : '--';
  const max = nums.length ? Math.max(...nums) : '--';
  const avg = nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1) : '--';
  const change = nums.length >= 2 ? (nums[nums.length-1] - nums[0]).toFixed(1) : '--';
  const changeSign = parseFloat(change) > 0 ? '+' : '';

  const mom = master.momentum || 0;
  const momSign = mom > 0 ? '+' : '';
  const dir = master.trend || '→';

  content.innerHTML = `
    <h2>📈 ${LANG[currentLang].trendTitle}</h2>
    <p>${LANG[currentLang].trendTitle.replace('📈 ','')}</p>
    <h3>Statistics</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0;">
      <div style="background:var(--bg-dark);padding:10px;border-radius:8px;text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);">Current</div>
        <div style="font-size:24px;font-weight:700;color:${level.color};">${score}</div>
      </div>
      <div style="background:var(--bg-dark);padding:10px;border-radius:8px;text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);">Change</div>
        <div style="font-size:24px;font-weight:700;color:${parseFloat(change)>0?'#4ade80':parseFloat(change)<0?'#f87171':'#64748b'};">${changeSign}${change}</div>
      </div>
      <div style="background:var(--bg-dark);padding:10px;border-radius:8px;text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);">Range</div>
        <div style="font-size:24px;font-weight:700;color:#94a3b8;">${min}–${max}</div>
      </div>
      <div style="background:var(--bg-dark);padding:10px;border-radius:8px;text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);">12h Momentum</div>
        <div style="font-size:24px;font-weight:700;color:${mom>0?'#4ade80':mom<0?'#f87171':'#64748b'};">${dir} ${momSign}${mom}</div>
      </div>
    </div>
    <p style="font-size:12px;color:var(--text-muted);">${scores.length} data points · Avg: ${avg}</p>
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
    const isOnline = ['Live','Cached'].includes(pair.status);
    const statusLabel = isOnline ? '●' : '◌';
    const statusColor = isOnline ? '#22c55e' : '#f59e0b';
    card.innerHTML = `
      <div class="pair-name">${pair.name} <span class="pair-status" style="color:${statusColor}">${statusLabel}</span></div>
      <div class="pair-score" style="color:${color}">${scoreText}</div>
      <div class="pair-level" style="color:${color}">${levelText}</div>
      ${pair.detail ? '<div class="pair-detail">' + pair.detail + '</div>' : ''}
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

/* ── Regional Map ─────────────────────────────────────── */
// Real country outlines from Natural Earth data (1:50m)
// Loaded as static SVG: me_map.svg (viewBox 0 0 600 400)

// Pair score dot positions (computed from country centroids)
const MAP_PAIRS = [
  { id: 'israel-palestine',   cx: 144, cy: 140 },
  { id: 'israel-lebanon',     cx: 149, cy: 128 },
  { id: 'red-sea',            cx: 178, cy: 223 },
  { id: 'israel-iran',        cx: 259, cy: 131 },
  { id: 'gulf-normalization', cx: 389, cy: 238 },
];

// Connection lines between pair dots
const MAP_LINES = [
  ['israel-palestine', 'israel-lebanon'],
  ['israel-palestine', 'israel-iran'],
  ['red-sea', 'gulf-normalization'],
];

async function loadMapSVG() {
  const resp = await fetch('me_map.svg');
  return await resp.text();
}

let mapSVGContent = null;
let mapSVGLoaded = null; // promise

async function ensureMapSVG() {
  if (mapSVGContent) return mapSVGContent;
  if (!mapSVGLoaded) {
    mapSVGLoaded = loadMapSVG().then(svg => { mapSVGContent = svg; }).catch(() => { mapSVGContent = '<svg viewBox="0 0 600 400"><text x="300" y="200" text-anchor="middle" fill="#64748b">Map unavailable</text></svg>'; });
  }
  await mapSVGLoaded;
  return mapSVGContent;
}

function overlayMapDots(svgContent, pairs, large) {
  const pairMap = Object.fromEntries(pairs.map(p => [p.id, p]));
  const dotR = large ? 14 : 10;
  const fs = large ? 11 : 9;

  // Build overlay group
  let overlay = '<g id="map-overlay">';

  // Connection lines
  MAP_LINES.forEach(([fromId, toId]) => {
    const a = MAP_PAIRS.find(p => p.id === fromId);
    const b = MAP_PAIRS.find(p => p.id === toId);
    if (a && b)
      overlay += `<line x1="${a.cx}" y1="${a.cy}" x2="${b.cx}" y2="${b.cy}" stroke="#2a3a50" stroke-width="1" stroke-dasharray="5,4" opacity="0.6"/>`;
  });

  // Pair score dots
  MAP_PAIRS.forEach(pair => {
    const data = pairMap[pair.id];
    let color = '#64748b';
    let score = null;
    if (data && data.score != null) {
      const level = getLevel(data.score);
      color = level.color;
      score = data.score;
    }
    overlay += `<circle cx="${pair.cx}" cy="${pair.cy}" r="${dotR + 4}" fill="${color}" opacity="0.1"/>`;
    const levelLabel = score !== null ? getLevel(score).cls : '';
    const tooltip = score !== null ? `${pair.name}\nScore: ${score} (${levelLabel})` : pair.name;
    overlay += `<g class="map-dot-group" data-pair="${pair.id}">`;
    overlay += `<title>${tooltip}</title>`;
    overlay += `<circle class="map-dot" cx="${pair.cx}" cy="${pair.cy}" r="${dotR}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" stroke-opacity="0.9"/>`;
    overlay += `</g>`;
    if (score !== null) {
      overlay += `<text x="${pair.cx}" y="${pair.cy + 3.5}" text-anchor="middle" font-size="${fs}" fill="${color}" font-family="monospace" font-weight="700">${score}</text>`;
    }
  });

  // Legend (large view only)
  if (large) {
    overlay += '<g transform="translate(14, 320)">';
    const levels = [
      { label: 'Frozen', color: '#7dd3fc' },
      { label: 'Thawing', color: '#38bdf8' },
      { label: 'Growing', color: '#4ade80' },
      { label: 'Flourishing', color: '#fbbf24' },
    ];
    levels.forEach((l, i) => {
      const x = i * 65;
      overlay += `<circle cx="${x+8}" cy="6" r="5" fill="${l.color}" opacity="0.6" stroke="${l.color}" stroke-width="1"/>`;
      overlay += `<text x="${x+16}" y="10" font-size="9" fill="#94a3b8">${l.label}</text>`;
    });
    overlay += '</g>';
  }

  overlay += '</g>';

  // Insert overlay before closing </svg>
  return svgContent.replace('</svg>', overlay + '</svg>');
}

async function renderMap(pairs) {
  const container = document.getElementById('mapContainer');
  if (!container) return;
  let svg;
  try { svg = await ensureMapSVG(); } catch { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Map unavailable</p>'; return; }
  const html = overlayMapDots(svg, pairs, false);
  const wrapper = document.createElement('div');
  wrapper.className = 'map-wrapper';
  wrapper.innerHTML = html;
  wrapper.style.cursor = 'pointer';
  wrapper.addEventListener('click', toggleMapModal);
  container.innerHTML = '';
  container.appendChild(wrapper);
}

let mapModalOpen = false;

async function toggleMapModal(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const overlay = document.getElementById('modalOverlay');
  const modal = overlay.querySelector('.modal');
  const content = document.getElementById('modalContent');

  if (mapModalOpen) {
    // Close
    modal.classList.remove('map-modal');
    overlay.classList.remove('active');
    overlay.removeEventListener('click', handleMapOverlayClick);
    mapModalOpen = false;
  } else {
    // Open
    overlay.classList.add('active');
    modal.classList.add('map-modal');
    overlay.addEventListener('click', handleMapOverlayClick);

    const pairs = (lastData && lastData.pairs) || [];
    const svg = await ensureMapSVG();
    const html = overlayMapDots(svg, pairs, true);
    content.innerHTML = `<div class="map-wrapper" id="modalMapWrapper">${html}</div>`;

    // Also let the modal map wrapper toggle
    const modalWrapper = document.getElementById('modalMapWrapper');
    if (modalWrapper) {
      modalWrapper.style.cursor = 'pointer';
      modalWrapper.addEventListener('click', toggleMapModal);
    }
    mapModalOpen = true;
  }
}

function handleMapOverlayClick(e) {
  // Close only if clicking the overlay background, not inside the modal
  if (e && e.target && e.target.closest('.modal') && !e.target.classList.contains('modal-close')) return;
  toggleMapModal();
}



let mapCollapsed = true;

function toggleMap() {
  const container = document.getElementById('mapContainer');
  const arrow = document.getElementById('mapArrow');
  mapCollapsed = !mapCollapsed;
  container.style.display = mapCollapsed ? 'none' : 'block';
  if (arrow) arrow.classList.toggle('collapsed', mapCollapsed);
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
  // computedAt = when the Worker actually queried BigQuery (stored in KV cache)
  // nextRefreshAt = 60 min after computedAt (when KV cache expires)
  const ts = data.computedAt ? new Date(data.computedAt) : new Date(data.timestamp);
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const shortTz = tzName.split('/').pop().replace(/_/g, ' ');

  const fmtOpts = {
    timeZone: tzName,
    hour: '2-digit', minute: '2-digit', hour12: false
  };
  const locale = currentLang === 'he' ? 'he-IL' : 'en-US';

  document.getElementById('lastUpdate').textContent = ts.toLocaleTimeString(locale, fmtOpts);
  document.getElementById('timezone').textContent = shortTz;

  // Show cache age if data was served from KV cache
  const cacheEl = document.getElementById('cacheStatus');
  if (cacheEl) {
    if (data.cached) {
      const ageMin = Math.round((Date.now() - ts.getTime()) / 60000);
      cacheEl.textContent = currentLang === 'he' ? `מאגר (${ageMin} ד')` : `Cached (${ageMin}m ago)`;
      cacheEl.style.display = 'inline';
    } else {
      cacheEl.style.display = 'none';
    }
  }

  const nextTs = data.nextRefreshAt ? new Date(data.nextRefreshAt) : new Date(ts.getTime() + UPDATE_INTERVAL);
  document.getElementById('nextUpdate').textContent = t('nextUpdate') + ' ' + nextTs.toLocaleTimeString(locale, fmtOpts);
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

/* ── Custom Weights ───────────────────────────────────── */
const SIGNAL_KEYS = ['tone','news','aviation','prediction','credit','travel','thinktank','conflict','views','normalization','economic','humanitarian'];
const DEFAULT_WEIGHTS = { tone:0.20, news:0.15, aviation:0.12, prediction:0.10, credit:0.10, travel:0.10, thinktank:0.10, conflict:0.08, views:0.05, normalization:0.04, economic:0.03, humanitarian:0.01 };
const BUILT_IN_PRESETS = {
  default:   { ...DEFAULT_WEIGHTS },
  conflict:  { tone:0.30, news:0.08, aviation:0.06, prediction:0.05, credit:0.05, travel:0.05, thinktank:0.05, conflict:0.15, views:0.05, normalization:0.04, economic:0.03, humanitarian:0.04 },
  diplomacy: { tone:0.15, news:0.20, aviation:0.06, prediction:0.05, credit:0.05, travel:0.10, thinktank:0.15, conflict:0.06, views:0.05, normalization:0.10, economic:0.03, humanitarian:0.05 },
};

let activeCustomWeights = null; // null = using defaults

function loadPresets() {
  try {
    const stored = JSON.parse(localStorage.getItem('pm-weight-presets'));
    return { ...BUILT_IN_PRESETS, ...(stored || {}) };
  } catch { return { ...BUILT_IN_PRESETS }; }
}

function savePresets(presets) {
  const userPresets = { ...presets };
  for (const key of Object.keys(BUILT_IN_PRESETS)) delete userPresets[key];
  localStorage.setItem('pm-weight-presets', JSON.stringify(userPresets));
}

function loadWeights() {
  // 1. Check URL param ?w=...
  const params = new URLSearchParams(window.location.search);
  const wParam = params.get('w');
  if (wParam) {
    const parsed = parseWeightParam(wParam);
    if (parsed) {
      activeCustomWeights = parsed;
      localStorage.setItem('pm-weights', JSON.stringify(parsed));
      showToast(t('weights.customLoaded'));
      return parsed;
    }
  }
  // 2. Check localStorage
  try {
    const stored = JSON.parse(localStorage.getItem('pm-weights'));
    if (stored && Object.keys(stored).length === SIGNAL_KEYS.length) {
      activeCustomWeights = stored;
      return stored;
    }
  } catch {}
  activeCustomWeights = null;
  return null;
}

function parseWeightParam(str) {
  try {
    const weights = {};
    const pairs = str.split(',');
    let total = 0;
    for (const pair of pairs) {
      const [key, val] = pair.split(':');
      if (key && val != null) {
        weights[key.trim()] = parseFloat(val) / 100;
        total += weights[key.trim()];
      }
    }
    if (Object.keys(weights).length === SIGNAL_KEYS.length && Math.abs(total - 1.0) < 0.01) {
      return weights;
    }
  } catch {}
  return null;
}

function encodeWeightParam(weights) {
  return SIGNAL_KEYS.map(k => `${k}:${Math.round(weights[k] * 100)}`).join(',');
}

function recalcMaster(weights, signals) {
  let score = 0;
  for (const key of SIGNAL_KEYS) {
    score += (signals[key]?.score || 0) * (weights[key] || 0);
  }
  return Math.round(score);
}

function autoNormalize(changedKey, newValue, currentWeights) {
  // newValue is integer percent (1-50)
  const newVal = newValue / 100;
  const oldVal = currentWeights[changedKey];
  const remaining = 1 - newVal;
  const oldRemaining = 1 - oldVal;
  const result = { ...currentWeights };
  result[changedKey] = newVal;

  if (oldRemaining > 0) {
    for (const key of SIGNAL_KEYS) {
      if (key === changedKey) continue;
      result[key] = result[key] * (remaining / oldRemaining);
    }
  }

  // Enforce 1% floor
  const floor = 0.01;
  let deficit = 0;
  const belowFloor = [];
  for (const key of SIGNAL_KEYS) {
    if (key === changedKey) continue;
    if (result[key] < floor) {
      deficit += result[key] - floor;
      belowFloor.push(key);
      result[key] = floor;
    }
  }
  if (deficit < 0) {
    // Redistribute deficit among non-floor signals (excluding changedKey)
    const others = SIGNAL_KEYS.filter(k => k !== changedKey && !belowFloor.includes(k));
    const totalOther = others.reduce((s, k) => s + result[k], 0);
    for (const key of others) {
      result[key] += result[key] * (deficit / totalOther);
    }
  }

  // Round to 1 decimal place
  for (const key of SIGNAL_KEYS) {
    result[key] = Math.round(result[key] * 1000) / 1000;
  }

  // Fix rounding drift — add remainder to largest non-changed signal
  let total = 0;
  for (const key of SIGNAL_KEYS) total += result[key];
  const remainder = 1 - total;
  if (Math.abs(remainder) > 0.0001) {
    let maxKey = null, maxVal = 0;
    for (const key of SIGNAL_KEYS) {
      if (key !== changedKey && result[key] > maxVal) { maxVal = result[key]; maxKey = key; }
    }
    if (maxKey) result[maxKey] = Math.round((result[maxKey] + remainder) * 1000) / 1000;
  }

  return result;
}

function applyCustomWeights() {
  if (!activeCustomWeights || !lastData) return;
  const score = recalcMaster(activeCustomWeights, lastData.signals);
  renderGauge(score);
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

/* ── Weight Editor Modal ──────────────────────────────── */
let currentPresetName = 'default';

function showWeightEditor() {
  const overlay = document.getElementById('weightModalOverlay');
  const content = document.getElementById('weightModalContent');
  const presets = loadPresets();
  const weights = activeCustomWeights || DEFAULT_WEIGHTS;

  // Determine which preset name best matches current weights
  currentPresetName = 'default';
  for (const [name, w] of Object.entries(presets)) {
    if (JSON.stringify(w) === JSON.stringify(weights)) {
      currentPresetName = name;
      break;
    }
  }

  // Build preset options
  let options = '';
  for (const [name, w] of Object.entries(presets)) {
    const labelKey = `weights.presets.${name}`;
    const label = t(labelKey) !== labelKey ? t(labelKey) : name;
    const selected = name === currentPresetName ? ' selected' : '';
    options += `<option value="${name}"${selected}>${label}</option>`;
  }

  // Build signal sliders
  const L = LANG[currentLang];
  let sliders = '';
  for (const key of SIGNAL_KEYS) {
    const sigInfo = L.signals[key];
    const name = sigInfo ? sigInfo.name : key;
    const icon = sigInfo?.icon || '';
    const pct = Math.round(weights[key] * 100 * 10) / 10;
    sliders += `
      <div class="weight-row">
        <label for="ws-${key}">${icon} ${name}</label>
        <input type="range" id="ws-${key}" min="1" max="50" step="0.1" value="${pct}" oninput="onSliderChange('${key}', this.value)">
        <span class="weight-val" id="wv-${key}">${pct}%</span>
      </div>
    `;
  }

  content.innerHTML = `
    <h2>⚙️ ${t('weights.title')}</h2>
    <div class="weight-preset-row">
      <select class="preset-select" id="presetSelect" onchange="onPresetChange(this.value)">
        ${options}
      </select>
      <button onclick="onNewPreset()">${t('weights.newPreset')}</button>
      <button onclick="onShareWeights()">${t('weights.share')}</button>
    </div>
    <div class="weight-slider-list">${sliders}</div>
    <div class="weight-total ok" id="weightTotal">${t('weights.total')}: 100.0% ✓</div>
    <div class="weight-actions">
      <button class="primary" onclick="onSavePreset()">${t('weights.save')}</button>
      <button onclick="onSaveAsPreset()">${t('weights.saveAs')}</button>
      <button onclick="onResetWeights()">${t('weights.reset')}</button>
    </div>
  `;
  overlay.classList.add('active');
}

function hideWeightEditor() {
  document.getElementById('weightModalOverlay').classList.remove('active');
}

function getEditorWeights() {
  const weights = {};
  for (const key of SIGNAL_KEYS) {
    const slider = document.getElementById(`ws-${key}`);
    weights[key] = slider ? parseFloat(slider.value) / 100 : (activeCustomWeights?.[key] ?? DEFAULT_WEIGHTS[key]);
  }
  return weights;
}

function updateEditorUI(weights) {
  let total = 0;
  for (const key of SIGNAL_KEYS) {
    total += weights[key];
    const valEl = document.getElementById(`wv-${key}`);
    const slider = document.getElementById(`ws-${key}`);
    const pct = Math.round(weights[key] * 1000) / 10;
    if (valEl) valEl.textContent = `${pct}%`;
    if (slider) slider.value = pct;
  }
  const totalEl = document.getElementById('weightTotal');
  if (totalEl) {
    const totalPct = Math.round(total * 1000) / 10;
    if (Math.abs(total - 1.0) < 0.005) {
      totalEl.textContent = `${t('weights.total')}: ${totalPct}% ✓`;
      totalEl.className = 'weight-total ok';
    } else if (Math.abs(total - 1.0) < 0.02) {
      totalEl.textContent = `${t('weights.total')}: ${totalPct}% ⚠`;
      totalEl.className = 'weight-total warn';
    } else {
      totalEl.textContent = `${t('weights.total')}: ${totalPct}% ✗`;
      totalEl.className = 'weight-total error';
    }
  }
}

function onSliderChange(changedKey, newValue) {
  const currentWeights = getEditorWeights();
  const newVal = parseFloat(newValue);
  currentWeights[changedKey] = newVal / 100;
  const normalized = autoNormalize(changedKey, newVal, currentWeights);
  activeCustomWeights = normalized;
  updateEditorUI(normalized);
  applyCustomWeights();
}

function onPresetChange(presetName) {
  const presets = loadPresets();
  const weights = presets[presetName];
  if (!weights) return;
  currentPresetName = presetName;
  activeCustomWeights = { ...weights };
  localStorage.setItem('pm-weights', JSON.stringify(activeCustomWeights));
  updateEditorUI(activeCustomWeights);
  applyCustomWeights();
}

function onSavePreset() {
  const weights = getEditorWeights();
  const presets = loadPresets();
  presets[currentPresetName] = { ...weights };
  savePresets(presets);
  activeCustomWeights = { ...weights };
  localStorage.setItem('pm-weights', JSON.stringify(activeCustomWeights));
  applyCustomWeights();
  updateEditorUI(weights);
  showToast(t('weights.saved'));
}

function onSaveAsPreset() {
  const name = prompt(t('weights.saveAs').replace('...','') + ':');
  if (!name) return;
  const weights = getEditorWeights();
  const presets = loadPresets();
  presets[name.toLowerCase().replace(/\s+/g, '-')] = { ...weights };
  savePresets(presets);
  currentPresetName = name.toLowerCase().replace(/\s+/g, '-');
  activeCustomWeights = { ...weights };
  localStorage.setItem('pm-weights', JSON.stringify(activeCustomWeights));
  applyCustomWeights();
  updateEditorUI(weights);
  // Refresh preset dropdown
  const sel = document.getElementById('presetSelect');
  if (sel) {
    sel.value = currentPresetName;
    // Add new option
    const opt = document.createElement('option');
    opt.value = currentPresetName;
    opt.textContent = name;
    opt.selected = true;
    sel.appendChild(opt);
  }
  showToast(t('weights.saved'));
}

function onResetWeights() {
  activeCustomWeights = null;
  localStorage.removeItem('pm-weights');
  currentPresetName = 'default';
  updateEditorUI(DEFAULT_WEIGHTS);
  if (lastData) renderGauge(lastData.master.score);
}

function onNewPreset() {
  onSaveAsPreset();
}

function onShareWeights() {
  const weights = activeCustomWeights || DEFAULT_WEIGHTS;
  const encoded = encodeWeightParam(weights);
  const url = `${window.location.origin}${window.location.pathname}?w=${encoded}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast(t('weights.shared'));
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(t('weights.shared'));
  });
}

/* ── Master render ────────────────────────────────────── */
let lastData = null;

function renderAll(data) {
  lastData = data;
  let score = data.master.score;
  if (activeCustomWeights) {
    score = recalcMaster(activeCustomWeights, data.signals);
  }
  renderGauge(score);
  renderSignals(data.signals);
  renderTrend(data.history);
  renderVolatility();
  renderPairs(data.pairs || []);
  renderMap(data.pairs || []);
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

// Load custom weights from URL or localStorage before rendering
loadWeights();

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
