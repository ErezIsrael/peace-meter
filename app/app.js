/* ── Peace Meter — Frontend App ─────────────────────────── */

const GAUGE_PATH_LEN = 251.2; // arc length for SVG gauge
const UPDATE_INTERVAL = 30 * 60 * 1000; // 30 min

/* ── Level helpers ─────────────────────────────────────── */
function getLevel(score) {
  if (score <= 25) return { label: 'Frozen',     cls: 'frozen',      color: '#7dd3fc', emoji: '❄️' };
  if (score <= 50) return { label: 'Thawing',    cls: 'thawing',     color: '#38bdf8', emoji: '🌤' };
  if (score <= 75) return { label: 'Growing',    cls: 'growing',     color: '#4ade80', emoji: '🌱' };
  return                  { label: 'Flourishing', cls: 'flourishing', color: '#fbbf24', emoji: '🕊' };
}

/* ── Gauge rendering ──────────────────────────────────── */
function renderGauge(score) {
  const level = getLevel(score);
  const fill = document.getElementById('gaugeFill');
  const scoreEl = document.getElementById('gaugeScore');
  const statusEl = document.getElementById('statusLabel');

  // stroke-dashoffset: 0 = full, 251.2 = empty
  const offset = GAUGE_PATH_LEN * (1 - score / 100);
  fill.style.strokeDashoffset = offset;
  fill.style.stroke = `url(#grad-${level.cls})`;

  scoreEl.textContent = score;
  scoreEl.style.color = level.color;

  statusEl.textContent = `${level.emoji} ${level.label}`;
  statusEl.className = `status-label ${level.cls}`;
}

/* ── Sparkline rendering (Chart.js) ───────────────────── */
const sparkCharts = {};
function renderSparkline(canvasId, data, color) {
  if (sparkCharts[canvasId]) sparkCharts[canvasId].destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  sparkCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 600 },
    },
  });
}

/* ── Signal cards ─────────────────────────────────────── */
function renderSignals(signals) {
  const grid = document.getElementById('signalGrid');
  grid.innerHTML = '';

  const keys = Object.keys(signals);
  keys.forEach((key, i) => {
    const s = signals[key];
    const level = getLevel(s.score);
    const card = document.createElement('div');
    card.className = 'signal-card';
    card.innerHTML = `
      <div class="signal-icon">${s.icon}</div>
      <div class="signal-name">${s.label}</div>
      <div class="signal-score" style="color:${level.color}">${s.score}</div>
      <div class="signal-detail">${s.detail}</div>
      <canvas id="spark-${key}" class="signal-spark"></canvas>
      <div style="margin-top:6px"><span class="signal-status ${s.status.toLowerCase()}">${s.status}</span></div>
    `;
    grid.appendChild(card);

    // render sparkline after DOM insertion
    requestAnimationFrame(() => {
      renderSparkline(`spark-${key}`, s.history, level.color);
    });
  });
}

/* ── Trend chart ──────────────────────────────────────── */
let trendChart;
function renderTrend(history) {
  if (trendChart) trendChart.destroy();
  const ctx = document.getElementById('trendChart');
  const lastScore = history.scores[history.scores.length - 1];
  const level = getLevel(lastScore);

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.labels,
      datasets: [{
        data: history.scores,
        borderColor: level.color,
        borderWidth: 2,
        fill: {
          style: 'value',
          value: 0,
        },
        backgroundColor: level.color + '18',
        pointRadius: 2,
        pointBackgroundColor: level.color,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          cornerRadius: 8,
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: { color: '#1e2a38' },
          ticks: { color: '#64748b', font: { size: 10 } },
        },
        y: {
          min: 0, max: 100,
          grid: { color: '#1e2a38' },
          ticks: { color: '#64748b', font: { size: 10 }, stepSize: 25 },
        },
      },
      animation: { duration: 800 },
    },
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
async function loadData() {
  try {
    const res = await fetch('data.json');
    const data = await res.json();
    renderGauge(data.master.score);
    renderSignals(data.signals);
    renderTrend(data.history);
    renderPublications(data.publications || []);
    updateTimestamps(data);
  } catch (err) {
    console.error('Failed to load data:', err);
    document.getElementById('gaugeScore').textContent = '—';
    document.getElementById('statusLabel').textContent = 'Error loading data';
  }
}

// Initial load
loadData();

// Auto-refresh
setInterval(loadData, UPDATE_INTERVAL);
