/* ── Peace Meter — Frontend App (no dependencies) ──────── */

const GAUGE_PATH_LEN = 251.2; // arc length for SVG gauge
const UPDATE_INTERVAL = 30 * 60 * 1000; // 30 min

/* ── Level helpers ─────────────────────────────────────── */
function getLevel(score) {
  if (score <= 25) return { label: 'Frozen',      cls: 'frozen',      color: '#7dd3fc', emoji: '❄️' };
  if (score <= 50) return { label: 'Thawing',     cls: 'thawing',     color: '#38bdf8', emoji: '🌤' };
  if (score <= 75) return { label: 'Growing',     cls: 'growing',     color: '#4ade80', emoji: '🌱' };
  return                    { label: 'Flourishing', cls: 'flourishing', color: '#fbbf24', emoji: '🕊' };
}

/* ── Gauge rendering ──────────────────────────────────── */
function renderGauge(score) {
  const level = getLevel(score);
  const fill = document.getElementById('gaugeFill');
  const scoreEl = document.getElementById('gaugeScore');
  const statusEl = document.getElementById('statusLabel');

  const offset = GAUGE_PATH_LEN * (1 - score / 100);
  fill.style.strokeDashoffset = offset;
  fill.style.stroke = `url(#grad-${level.cls})`;

  scoreEl.textContent = score;
  scoreEl.style.color = level.color;

  statusEl.textContent = `${level.emoji} ${level.label}`;
  statusEl.className = `status-label ${level.cls}`;
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

  // build area fill
  const firstPt = pts[0].split(',');
  const lastPt  = pts[pts.length - 1].split(',');
  const areaD = `M${pts.join(' L')} L${lastPt[0]},${h} L${firstPt[0]},${h} Z`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.style.cssText = 'width:100%;height:32px;display:block;';

  // area
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', color);
  area.setAttribute('opacity', '0.12');
  svg.appendChild(area);

  // line
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

  // defs for gradient
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

  // grid lines (0, 25, 50, 75, 100)
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

  // data points
  const pts = scores.map((s, i) => {
    const x = padL + (i / (scores.length - 1)) * chartW;
    const y = padT + chartH - (s / 100) * chartH;
    return { x, y };
  });

  // area fill
  const areaPts = pts.map(p => `${p.x},${p.y}`);
  const firstPt = areaPts[0].split(',');
  const lastPt  = areaPts[areaPts.length - 1].split(',');
  const areaD = `M${areaPts.join(' L')} L${lastPt[0]},${padT + chartH} L${firstPt[0]},${padT + chartH} Z`;
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', 'url(#trendGrad)');
  svgEl.appendChild(area);

  // line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', level.color);
  line.setAttribute('stroke-width', '2.5');
  line.setAttribute('stroke-linejoin', 'round');
  svgEl.appendChild(line);

  // dots
  pts.forEach((p, i) => {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', level.color);
    svgEl.appendChild(dot);

    // label (every other)
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
    const card = document.createElement('div');
    card.className = 'signal-card';
    card.innerHTML = `
      <div class="signal-icon">${s.icon}</div>
      <div class="signal-name">${s.label}</div>
      <div class="signal-score" style="color:${level.color}">${s.score}</div>
      <div class="signal-detail">${s.detail}</div>
      <div id="spark-${key}" class="signal-spark"></div>
      <div style="margin-top:6px"><span class="signal-status ${s.status.toLowerCase()}">${s.status}</span></div>
    `;
    grid.appendChild(card);

    requestAnimationFrame(() => {
      const container = document.getElementById(`spark-${key}`);
      if (container) renderSparklineSvg(container, s.history, level.color);
    });
  });
}

/* ── Publications ─────────────────────────────────────── */
function renderPublications(pubs) {
  const container = document.getElementById('pubList');
  container.innerHTML = '';
  pubs.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pub-item';
    div.innerHTML = `
      <div class="pub-source">${p.source}</div>
      <div class="pub-title">${p.title}</div>
      <div class="pub-date">${p.date} <span class="pub-tag ${p.sentiment}">${p.sentiment}</span></div>
    `;
    container.appendChild(div);
  });
}

/* ── Timestamps ───────────────────────────────────────── */
function updateTimestamps(data) {
  const ts = new Date(data.timestamp);
  document.getElementById('lastUpdate').textContent = ts.toTimeString().slice(0, 5);
  document.getElementById('timezone').textContent = 'UTC';
  const next = new Date(ts.getTime() + UPDATE_INTERVAL);
  document.getElementById('nextUpdate').textContent = `Next update ${next.toTimeString().slice(0, 5)}`;
}

/* ── Modal ────────────────────────────────────────────── */
function showInfo(type) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');

  const aboutHTML = `
    <h2>About Peace Meter</h2>
    <p>Peace Meter is a real-time dashboard that measures the "temperature of peace" across the Middle East using 8 independent signals.</p>
    <p>It is <strong>not a prediction</strong> — it is a structured aggregation of publicly available data to help track positive momentum amid the noise.</p>
    <h3>Signals</h3>
    <ul>
      <li><strong>Diplomatic News</strong> — BBC + Al Jazeera headline sentiment</li>
      <li><strong>Think Tank & Expert</strong> — Mitvim, INSS, JISS publications analysis</li>
      <li><strong>Civil Aviation</strong> — OpenSky flight counts over ME airspace</li>
      <li><strong>Prediction Markets</strong> — Polymarket ceasefire odds</li>
      <li><strong>Gulf Shipping</strong> — Red Sea / Gulf shipping status</li>
      <li><strong>Political Tone</strong> — Leader statement sentiment</li>
      <li><strong>VIEWS AI Forecast</strong> — PRIO/Uppsala conflict prediction</li>
      <li><strong>Humanitarian</strong> — Aid corridors, prisoner swaps</li>
    </ul>
    <h3>Scoring</h3>
    <p>Each signal is scored 0–100. The master score is a weighted average. An asymmetric EMA smooths the data — peace rises fast, decays slowly.</p>
  `;

  const calcHTML = `
    <h2>How the Score Is Calculated</h2>
    <p><strong>Formula:</strong></p>
    <p style="font-family:monospace;font-size:12px;background:#1e293b;padding:10px;border-radius:6px;margin:8px 0;">
      Score = News×0.20 + ThinkTank×0.20 + Aviation×0.15 + Predict×0.12 + Shipping×0.10 + Tone×0.10 + VIEWS×0.08 + Humanitarian×0.05
    </p>
    <p><strong>Peace Multiplier:</strong> When 3+ signals exceed 60, score × 1.15. When 5+ exceed 60, × 1.25. Capped at 100.</p>
    <h3>Smoothing</h3>
    <p>Asymmetric EMA: 3-hour half-life rising, 12-hour half-life falling. A breakthrough registers quickly; a single bad day doesn't erase progress.</p>
    <h3>Levels</h3>
    <ul>
      <li>0–25: ❄️ Frozen — Active conflict, no diplomacy</li>
      <li>26–50: 🌤 Thawing — Back-channel talks</li>
      <li>51–75: 🌱 Growing — Active negotiations</li>
      <li>76–100: 🕊 Flourishing — Peace agreements</li>
    </ul>
  `;

  content.innerHTML = type === 'about' ? aboutHTML : calcHTML;
  overlay.classList.add('active');
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.remove('active');
});
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});

/* ── Load & render ────────────────────────────────────── */
function renderAll() {
  const data = APP_DATA;
  renderGauge(data.master.score);
  renderSignals(data.signals);
  renderTrend(data.history);
  renderPublications(data.publications || []);
  updateTimestamps(data);
}

renderAll();
// Auto-refresh (for future: will reload from backend)
setInterval(() => { location.reload(); }, UPDATE_INTERVAL);
