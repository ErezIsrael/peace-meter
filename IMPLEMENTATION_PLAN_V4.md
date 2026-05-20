# Peace Meter v4 — Implementation Plan

> This document is structured for incremental implementation across multiple sessions.
> Each phase is self-contained with clear file references and instructions.
> Read the full document at the start of each session to re-establish context.

---

## Current State (v1.8.3)

**Files:**
- `app/index.html` — layout: header, gauge, trend chart, signal grid (10 cards), publications list, footer
- `app/app.js` — frontend: gauge/sparkline/trend SVG rendering, signal cards, modals, retry/cache, i18n
- `app/lang.js` — EN/HE translations, signal metadata, legal modals, URL param detection
- `app/styles.css` — dark theme, RTL overrides, gauge/sparkline/trend CSS
- `app/data.json` — fallback mock data (10 signals, 3 publications)
- `functions/data.json.js` — Cloudflare Pages Function: RSS parsing (6 feeds), relevance filter, 30-day freshness, returns JSON with 10 signals + publications
- `CONCEPT.md` — 10-signal design doc (v3)
- `METHODOLOGY_IMPROVEMENTS.md` — v4 proposal: GDELT, ACLED, per-pair scores, rebalanced weights

**Data flow:** Frontend fetches `/data.json` → Cloudflare function parses RSS + returns mock signals → Frontend renders gauge, trend, signal cards, publications.

**Key constraint:** All data processing happens in the Cloudflare Pages Function. Frontend is purely rendering.

---

## Phase 1 — Integrate GDELT Event Data

**Goal:** Replace RSS headline sentiment analysis (Signals 1+2) with structured GDELT event data.

**Why:** GDELT monitors 250k+ news stories/day, classifies events with CAMEO codes and Goldstein tone scores (-100 to +100). Free, anonymous, no API key needed.

### 1A: Add GDELT data fetcher to `functions/data.json.js`

**File:** `functions/data.json.js`

**Add after the RSS_FEEDS constant block:**

```javascript
/* ── GDELT 2.0 data fetcher ──────────────────────────── */
const GDELT_BASE = 'https://data.gdeltproject.org/gdeltv2/';
const GDELT_COUNTRIES = [
  { code: 'ISR', name: 'Israel' },
  { code: 'PSE', name: 'Palestine' },
  { code: 'LBN', name: 'Lebanon' },
  { code: 'SYR', name: 'Syria' },
  { code: 'IRN', name: 'Iran' },
  { code: 'YEM', name: 'Yemen' },
  { code: 'IRQ', name: 'Iraq' },
  { code: 'SAU', name: 'Saudi Arabia' },
  { code: 'ARE', name: 'UAE' },
  { code: 'BHR', name: 'Bahrain' },
];

// CAMEO codes for diplomatic events
const CAMEO_DIPLOMATIC = [13, 22, 23, 24, 26, 27, 40, 41, 42, 43, 45, 52, 58, 59];

async function fetchGDELT() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hourStr = now.toISOString().slice(11, 13);
  const url = `${GDELT_BASE}${dateStr}${hourStr}000.COUNTRY.CSV.gz`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    // Cloudflare Workers supports decompress-gzip
    // Note: GDELT files are gzip-compressed
    // Alternative: use the uncompressed GDELT-CSV endpoint
    const text = await res.text();
    return parseGDELT(text);
  } catch {
    // Fall back to uncompressed endpoint
    const urlAlt = `${GDELT_BASE}${dateStr}${hourStr}000.COUNTRY.csv`;
    try {
      const res = await fetch(urlAlt, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const text = await res.text();
      return parseGDELT(text);
    } catch { return null; }
  }
}

function parseGDELT(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return null; // header only

  let totalTone = 0;
  let eventCount = 0;
  let diplomaticCount = 0;
  let constructiveTone = 0;
  let hostileTone = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(',');
    if (fields.length < 16) continue;

    const toneScore = parseFloat(fields[15]) || 0; // Goldstein Tone
    const rootAction = parseInt(fields[7]) || 0;    // CAMEO root action

    if (toneScore === 0) continue; // skip neutral

    eventCount++;
    totalTone += toneScore;

    if (toneScore > 0) constructiveTone++;
    else hostileTone++;

    if (CAMEO_DIPLOMATIC.includes(rootAction)) {
      diplomaticCount++;
    }
  }

  const avgTone = eventCount > 0 ? totalTone / eventCount : 0;
  const constructiveRatio = (constructiveTone + hostileTone) > 0
    ? constructiveTone / (constructiveTone + hostileTone)
    : 0.5;

  return {
    avgTone,
    eventCount,
    diplomaticCount,
    constructiveRatio,
    constructiveTone,
    hostileTone,
  };
}
```

**Add after the `parseRSS` function.**

### 1B: Use GDELT data in signal scoring

**File:** `functions/data.json.js`

**In the `onRequest` handler, before the data assembly:**

```javascript
// Fetch GDELT data (best effort, falls back to RSS-only)
const gdeltData = await fetchGDELT();
```

**Replace the FALLBACK_SIGNALS for `tone` and `news` with computed values:**

```javascript
// Compute tone signal from GDELT
let toneScore, toneDetail;
if (gdeltData && gdeltData.eventCount > 0) {
  // Goldstein Tone: -100 to +100 → map to 0-100
  toneScore = Math.round(clamp(0, 100, 50 + gdeltData.avgTone / 2));
  toneDetail = `${gdeltData.eventCount} events, tone ${gdeltData.avgTone > 0 ? '+' : ''}${gdeltData.avgTone.toFixed(1)}, ${gdeltData.diplomaticCount} diplomatic`;
} else {
  toneScore = FALLBACK_SIGNALS.tone.score;
  toneDetail = FALLBACK_SIGNALS.tone.detail;
}

// Compute diplomatic news signal from GDELT
let newsScore, newsDetail;
if (gdeltData && gdeltData.eventCount > 0) {
  newsScore = Math.round(clamp(3, 95, Math.round(Math.pow(gdeltData.constructiveRatio, 2) * 150)));
  newsDetail = `${gdeltData.diplomaticCount} diplomatic events / ${gdeltData.eventCount} total`;
} else {
  newsScore = FALLBACK_SIGNALS.news.score;
  newsDetail = FALLBACK_SIGNALS.news.detail;
}
```

**Add a `clamp` helper at the top of the file:**

```javascript
function clamp(min, max, val) { return Math.max(min, Math.min(max, val)); }
```

**Replace the hardcoded signals in the data object:**

```javascript
const signals = { ...FALLBACK_SIGNALS };
signals.tone = { ...signals.tone, score: toneScore, detail: toneDetail, status: gdeltData ? 'Live' : 'Delayed' };
signals.news = { ...signals.news, score: newsScore, detail: newsDetail, status: gdeltData ? 'Live' : 'Delayed' };
```

### 1C: Update translations in `app/lang.js`

**File:** `app/lang.js`

**Update signal methodology text for `tone` and `news` to mention GDELT:**

In both EN and HE signal definitions, update:
- `tone.detail`: Mention "GDELT event data, Goldstein tone scoring" instead of "RSS headline keywords"
- `news.detail`: Mention "GDELT CAMEO diplomatic event codes" instead of "headline sentiment"
- `tone.sources`: Add "GDELT 2.0 Event Database" as primary, keep RSS as fallback

### 1D: Update `app/data.json` mock data

**File:** `app/data.json`

Update the `detail` fields for `tone` and `news` to reflect GDELT-based methodology.

---

## Phase 2 — Add ACLED Conflict Events Signal

**Goal:** Replace "Gulf Shipping" (7%) with "Conflict Events" (8%) — direct violence measurement using ACLED data.

### 2A: Add ACLED API integration

**File:** `functions/data.json.js`

**After GDELT block, add:**

```javascript
/* ── ACLED Conflict Events ────────────────────────────── */
const ACLED_API = 'https://acleddata.com/api';
const ACLED_TOKEN = ''; // Requires free registration at acleddata.com

// Event type weights: Battles=2.0, Violence-vs-civilians=3.0,
// Explosions=1.5, Riots=0.5, Strategic=0.0
const ACLED_WEIGHTS = {
  1: 2.0,   // Battles
  2: 3.0,   // Violence against civilians
  3: 1.5,   // Explosions/Remote violence
  4: 0.5,   // Riots
  5: 0.0,   // Strategic developments
};

async function fetchACLED() {
  if (!ACLED_TOKEN) return null;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startDate = weekAgo.toISOString().slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);

  // Countries: Israel, Lebanon, Syria, Yemen, Iraq, Palestine
  const countries = 'Israel,Lebanon,Syria,Yemen,Iraq,Gaza,West Bank';

  try {
    const res = await fetch(
      `${ACLED_API}?country=${encodeURIComponent(countries)}&start_date=${startDate}&end_date=${endDate}`,
      {
        headers: { 'Authorization': `Bearer ${ACLED_TOKEN}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return computeACLED(data);
  } catch { return null; }
}

function computeACLED(data) {
  if (!data || !data.data || !data.data.events) return null;

  const events = data.data.events;
  let weightedCount = 0;
  let eventCounts = { battles: 0, civilian: 0, explosions: 0, riots: 0, strategic: 0 };

  events.forEach(ev => {
    const type = ev.event_type_code || 0;
    const weight = ACLED_WEIGHTS[type] || 0;
    weightedCount += weight;
    if (type === 1) eventCounts.battles++;
    else if (type === 2) eventCounts.civilian++;
    else if (type === 3) eventCounts.explosions++;
    else if (type === 4) eventCounts.riots++;
    else if (type === 5) eventCounts.strategic++;
  });

  // Peace score: more violence = lower score
  // Normalize: 0 events = 100, 10 weighted events = ~40, 20+ = ~10
  const peaceScore = Math.round(clamp(0, 100, 100 - (weightedCount * 4)));

  return {
    peaceScore,
    totalEvents: events.length,
    weightedCount,
    eventCounts,
    detail: `${events.length} events (7d): ${eventCounts.battles} battles, ${eventCounts.civilian} civilian, ${eventCounts.explosions} explosions, ${eventCounts.riots} riots`,
  };
}
```

**Register at https://acleddata.com/ for a free token.** Add token to `ACLED_TOKEN`.

### 2B: Integrate into signals

**File:** `functions/data.json.js`

**In `onRequest`, after GDELT fetch:**

```javascript
const acledData = await fetchACLED();
```

**Replace `shipping` signal with `conflict` signal in FALLBACK_SIGNALS:**

```javascript
conflict: { label: "Conflict Events", icon: "💥", weight: 0.08, score: 45, history: [...], status: "Delayed", detail: "ACLED: pending token" },
```

**In the data assembly:**

```javascript
if (acledData) {
  signals.conflict = { ...signals.conflict, score: acledData.peaceScore, detail: acledData.detail, status: 'Live' };
}
// Remove shipping signal entirely (or keep as deprecated)
```

### 2C: Update frontend

**File:** `app/app.js`

No changes needed — the signal grid renders any signals present in the data JSON. The new `conflict` signal will appear automatically.

### 2D: Update translations

**File:** `app/lang.js`

Add `conflict` signal definition in both EN and HE. Remove `shipping` signal.

**EN:**
```javascript
conflict: { icon:'💥', name:'Conflict Events', weight:'8%', summary:'Violence events (ACLED)', detail:'Counts battles, civilian attacks, explosions, riots weighted by severity. More events = lower peace score. 7-day rolling window.', sources:['ACLED API (Armed Conflict Location & Event Data)'], update:'Daily' },
```

**HE:**
```javascript
conflict: { icon:'💥', name:'אירועי קונפליקט', weight:'8%', summary:'אירועי אלימות (ACLED)', detail:'סופר קרבות, פיגועים באזרחים, פיצוצים, מהומות עם משקולות חומרה. יותר אירועים = ציון נמוך יותר. חלון של 7 ימים.', sources:['ACLED API'], update:'יומי' },
```

### 2E: Update mock data

**File:** `app/data.json`

Replace `shipping` with `conflict`. Remove `shipping`.

---

## Phase 3 — Per-Pair Peace Scores

**Goal:** Add individual peace scores for conflict pairs (Israel-Palestine, Israel-Lebanon, Red Sea) alongside the master regional gauge.

**This is the largest change.** It requires:
1. Backend: Compute per-pair scores from GDELT/ACLED data filtered by country pairs
2. Frontend: New UI section for pair gauges (collapsible)
3. Data format: New `pairs` array in JSON response

### 3A: Define pair structure in data format

**File:** `functions/data.json.js`

Add to the data response:

```javascript
const PAIRS = [
  { id: 'israel-palestine', name: 'Israel-Palestine', countries: ['ISR', 'PSE'], weight: 0.35 },
  { id: 'israel-lebanon', name: 'Israel-Lebanon', countries: ['ISR', 'LBN'], weight: 0.25 },
  { id: 'red-sea', name: 'Red Sea / Yemen', countries: ['YEM', 'SAU', 'ARE'], weight: 0.20 },
  { id: 'israel-iran', name: 'Israel-Iran', countries: ['ISR', 'IRN'], weight: 0.15 },
  { id: 'gulf-normalization', name: 'Abraham Accords', countries: ['ISR', 'ARE', 'BHR'], weight: 0.05 },
];
```

### 3B: Compute per-pair scores

**File:** `functions/data.json.js`

```javascript
function computePairScore(pair, gdeltData, acledData) {
  // Filter GDELT events to this pair's countries
  // Filter ACLED events to this pair's countries
  // Compute same methodology as master but country-filtered
  // Return { id, name, score, level, signals: { tone, news, conflict, ... } }
}
```

**This requires restructuring the GDELT and ACLED parsers to return per-country data, not just aggregates.**

### 3C: Add pair gauges UI

**File:** `app/index.html`

Add after the signal grid section:

```html
<!-- ── Conflict Pairs ─────────────────────────────────── -->
<section class="pairs-card" aria-label="Conflict pair scores">
  <h3 onclick="togglePairs()" class="pairs-toggle">⚔️ Conflict Pairs <span class="toggle-arrow" id="pairArrow">▼</span></h3>
  <div id="pairsGrid" class="pairs-grid">
    <!-- Rendered by JS -->
  </div>
</section>
```

**File:** `app/styles.css`

Add:

```css
.pairs-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 14px 16px;
  margin: 12px 0;
  border: 1px solid #1e2a38;
}

.pairs-toggle {
  cursor: pointer;
  margin: 0 0 8px 0;
  display: flex;
  align-direction: row;
  justify-content: space-between;
  align-items: center;
}

.toggle-arrow {
  transition: transform 0.2s;
  font-size: 12px;
}

.toggle-arrow.collapsed { transform: rotate(-90deg); }

.pairs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.pair-card {
  background: #0f1720;
  border-radius: 8px;
  padding: 10px 12px;
  border-left: 3px solid #334155;
  text-align: center;
}

.pair-name { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.pair-score { font-size: 24px; font-weight: 700; font-family: var(--heading-font); }
.pair-level { font-size: 11px; margin-top: 2px; }
```

### 3D: Add pair rendering to frontend

**File:** `app/app.js`

Add:

```javascript
function renderPairs(pairs) {
  const grid = document.getElementById('pairsGrid');
  grid.innerHTML = '';

  pairs.forEach(pair => {
    const level = getLevel(pair.score);
    const card = document.createElement('div');
    card.className = 'pair-card';
    card.style.borderLeftColor = level.color;
    card.innerHTML = `
      <div class="pair-name">${pair.name}</div>
      <div class="pair-score" style="color:${level.color}">${pair.score}</div>
      <div class="pair-level" style="color:${level.color}">${level.label}</div>
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
  arrow.classList.toggle('collapsed', pairsCollapsed);
}

// Initialize collapsed
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('pairsGrid');
  if (grid) grid.style.display = 'none';
});
```

Call `renderPairs(data.pairs || [])` in `renderAll()`.

### 3E: Update translations

**File:** `app/lang.js`

Add translation keys for pair labels and section title.

---

## Phase 4 — Normalization Tracker Signal

**Goal:** Track visa openings, direct routes, embassy openings, trade agreements.

**Effort:** Low-Medium. Data is event-based (press releases), not API-driven.

### 4A: Add to `functions/data.json.js`

```javascript
const NORMALIZATION_EVENTS = [
  // Manually maintained list, or scrape from RSS
  // Format: { date, countries, type, score }
  // Types: 'visa', 'route', 'embassy', 'trade', 'normalization'
];

function computeNormalization(events) {
  const now = Date.now();
  const windowDays = 180;
  const recent = events.filter(e => now - Date.parse(e.date) < windowDays * 86400000);

  // Each event adds points, decaying with age
  let score = 0;
  recent.forEach(e => {
    const age = (now - Date.parse(e.date)) / 86400000;
    const decay = Math.exp(-age / 60); // half-life ~42 days
    score += (e.score || 1) * decay;
  });

  return Math.round(clamp(0, 100, score * 20)); // scale factor
}
```

### 4B: Add `normalization` signal to data

Add to FALLBACK_SIGNALS and data response with weight 4%.

### 4C: Update translations

Add `normalization` signal definition in EN/HE.

---

## Phase 5 — Economic Integration Signal

**Goal:** Track bilateral trade flows between ME countries.

**Effort:** Medium. Requires IMF Direction of Trade Statistics or World Bank API.

### 5A: Add trade data fetcher

```javascript
async function fetchTradeData() {
  // IMF Direction of Trade: free CSV download
  // or World Bank API: ws://api.worldbank.org/v2/country/ISR/indicator/BX.GSR.CWLD.WT?date=2020..2025
  // Compute YoY change in ME bilateral trade
}
```

### 5B: Add `economic` signal to data

Weight: 3%.

### 5C: Update translations

Add `economic` signal definition in EN/HE.

---

## Phase 6 — Remaining Pair Gauges

After Phase 3 infrastructure is built, add:
- Israel-Iran pair
- Gulf Normalization / Abraham Accords tracker

---

## Phase 7 — Interactive Map Visualization

**Future stretch goal.** SVG map of Middle East with pair scores overlaid.

---

## Signal Weight Migration (v3 → v4)

| Signal | v3 Weight | v4 Weight | Change |
|--------|-----------|-----------|--------|
| 🤝 Political Tone | 20% | 15% | ↓5 |
| 📰 Diplomatic News | 15% | 10% | ↓5 |
| ✈️ Commercial Aviation | 12% | 10% | ↓2 |
| 💰 Prediction Markets | 10% | 8% | ↓2 |
| 🏛 Credit Ratings | 10% | 8% | ↓2 |
| 🛂 Travel Advisories | 10% | 8% | ↓2 |
| 🧠 Think Tank | 10% | 5% | ↓5 |
| 🚢 Gulf Shipping | 7% | **REMOVED** | → Conflict Events |
| 🌍 VIEWS AI Forecast | 5% | 4% | ↓1 |
| 🏥 Humanitarian | 1% | 2% | ↑1 |
| 💥 **Conflict Events** (NEW) | — | 8% | NEW |
| 🤝 **Normalization** (NEW) | — | 4% | NEW |
| 📊 **Economic** (NEW) | — | 3% | NEW |
| **Total** | **100%** | **100%** | |

**Weight update locations:**
- `functions/data.json.js` — `FALLBACK_SIGNALS` weight values
- `app/lang.js` — `signals.*.weight` strings
- `app/lang.js` — `calc` modal formula text
- `app/data.json` — `weight` values
- `CONCEPT.md` — signal weight table
- `README.md` — signal weight table

---

## Versioning

| Phase | Version | Description |
|-------|---------|-------------|
| Phase 1 | v2.0.0 | GDELT integration (breaking change — replaces RSS sentiment) |
| Phase 2 | v2.1.0 | ACLED Conflict Events signal |
| Phase 3 | v2.2.0 | Per-pair peace scores |
| Phase 4 | v2.3.0 | Normalization tracker |
| Phase 5 | v2.4.0 | Economic integration signal |
| Phase 6 | v2.5.0 | Remaining pair gauges |
| Phase 7 | v3.0.0 | Interactive map |

---

## Instructions for Next Session

1. **Read this file first** to understand the full plan and current state.
2. **Read METHODOLOGY_IMPROVEMENTS.md** for the research rationale behind each change.
3. **Pick one phase** to implement. Do not skip phases.
4. **Within a phase, follow sub-steps in order** (A → B → C → D).
5. **Test after each sub-step:** `npx wrangler pages dev app --compatibility-date=2026-05-20`
6. **Commit incrementally** — one commit per sub-step.
7. **Update APP_VERSION** in `app/app.js` after each phase.
8. **If a phase fails or is blocked**, document why in the plan and move to the next.

**Recommended order:** Phase 1 → Phase 2 → Phase 3 (biggest impact, reasonable effort).
Phase 4 and 5 are optional enhancements. Phase 6 and 7 are future stretch goals.
