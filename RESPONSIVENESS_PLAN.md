# Peace Meter — Score Responsiveness Plan

> Goal: Make the master score visibly responsive to rapid geopolitical changes
> while remaining stable during calm periods.
>
> Current problem: Score stuck at 52-54 because:
> - 47% of master score comes from static hardcoded fallbacks (Aviation, Prediction, Credit, Travel, VIEWS, Humanitarian)
> - GDELT queries full 24h window, diluting recent events
> - Goldstein scale has low variance, formula compresses changes
> - Quadratic squashing on Diplomatic News hides small real shifts

---

## Path C: Volatility Multiplier ✅ DONE

**Goal:** When event volume spikes (active conflict), amplify GDELT signal changes so they're visible in the master score. During calm periods, no amplification.

**Mechanism:**
- Track a rolling baseline of event counts (store in KV as `event_baseline`, updated every cache refresh)
- Compute `currentEventCount / baseline` ratio
- If ratio > 1.5, apply a volatility multiplier up to 1.5x to GDELT-derived scores (Tone, News, Conflict)
- Cap: never exceeds ±10 points from base score

**Files changed:**
- `gdelt-proxy/index.js` — add baseline tracking, volatility multiplier to scoring functions

**Verification:**
- ✅ `/data` endpoint returns `volMultiplier` field
- ✅ `volBaseline` tracked in KV and visible via `/debug`
- ✅ During normal periods, multiplier = 1.0 (no amplification)
- Simulate low event count → verify scores are at baseline
- Master score should move ≥3 points when event count doubles

---

## Path A: Recent Events Weighting (Two-Window Query) ✅ DONE

**Goal:** Recent events (last 3 hours) should have more influence than events from 20 hours ago.

**Mechanism:**
- Added `ME_EVENTS_QUERY_3H` (filters by `_PARTITIONTIME = CURRENT_DATE()` + `event_time`)
- Blend: `score = 0.6 × recent_score + 0.4 × long_term_score` for each GDELT signal
- Recent events get 60% weight when data available; falls back to 24h-only if GDELT hasn't ingested
- 3h query is optional (try/catch) — won't break if GDELT processing is delayed

**Files changed:**
- `gdelt-proxy/index.js` — dual query, weighted blending, `recentEventCount` field

**Verification:**
- ✅ `/data` endpoint returns `recentEventCount` field
- ✅ When 3h data available, blending applies 60/40 weight
- ✅ When 3h data unavailable (GDELT delay), falls back to 24h only

---

## Path B: Real Data for Aviation + Prediction Markets

**Goal:** Replace the two biggest static fallbacks (12% + 10% = 22% of master score) with live data.

### B1: Commercial Aviation via OpenSky API

**Mechanism:**
- Fetch `https://opensky-network.org/api/states/all?lamin=29&lomin=33&lamax=43&lomax=57` (ME bounding box)
- Count commercial aircraft (filter by ICAO codes of known carriers, or count all in airspace)
- Score = `clamp(0, 100, aircraftCount / baseline * 50)` where baseline ≈ 80 aircraft
- Fallback: if OpenSky rate-limits (4 req/min), use cached value from last hour
- Cache result in GDELT_CACHE with 30 min TTL
- Add `opensky_req` KV key to track request timing (rate limit management)

**Files changed:**
- `gdelt-proxy/index.js` — add `fetchAviation()` function, integrate into `buildFullPayload()`

**Verification:**
- Hit `/data` endpoint → Aviation signal should have `status: "Live"` and a non-fallback score
- Aircraft count in detail string should change between queries
- Score range should be 20-90 (varies with real traffic)

### B2: Prediction Markets via Polymarket API

**Mechanism:**
- Fetch `https://gamma-api.polymarket.com/events?q=ceasefire+middle+east` or similar
- Parse active ceasefire/peace markets, extract "Yes" probability
- Score = average "Yes" probability × 100
- If no active markets found, score = previous cached value (Polymarket markets change infrequently)
- Cache with 60 min TTL

**Files changed:**
- `gdelt-proxy/index.js` — add `fetchPredictionMarkets()` function, integrate into `buildFullPayload()`

**Verification:**
- Hit `/data` endpoint → Prediction Markets signal should have `status: "Live"` and real odds
- If Polymarket is unreachable, falls back to cached value with `status: "Cached"`
- Score should reflect actual market odds (e.g., 41% → score 41)

---

## Path D: Trend-Based Estimates for Remaining Static Signals

**Goal:** Even before implementing all real APIs, break the "static 47%" problem by deriving estimates from correlated GDELT data.

**Mechanism:**
- **Credit Ratings estimate:** Derive from Travel + Aviation signals. If both are declining, credit outlook is negative. Score = `0.5 × travelScore + 0.5 × aviationScore`
- **VIEWS estimate:** Track derivative of Political Tone over last 3 queries. Rising tone → VIEWS optimistic. Score = `toneScore + (recentToneTrend × 10)`, clamped
- **Humanitarian estimate:** Derive from Diplomatic News. High diplomatic activity correlates with humanitarian corridors. Score = `newsScore × 0.7`, clamped

These are temporary — they make the score dynamic until real APIs are implemented. They will be replaced when Paths B2/B3 are done.

**Files changed:**
- `gdelt-proxy/index.js` — update `FALLBACK_SIGNALS` computation in `buildFullPayload()` to use correlated estimates instead of flat numbers
- Store last 3 tone scores in KV (`tone_history`) for trend computation

**Verification:**
- All 12 signals should now have `status: "Live"` or `"Cached"` (never static fallback)
- Credit, VIEWS, Humanitarian scores should vary when GDELT data changes
- No hardcoded static scores remain in the live data path

---

## Path E: Momentum Indicator (Frontend)

**Goal:** Show users the *direction* and *rate* of change, even when the score is stable.

**Mechanism:**
- Added momentum arrow (↑↓→) and rate-of-change display next to the master score
- Worker compares current master score with previous reading (stored in KV as `last_master`)
- If |momentum| < 1: show → (stable)
- If momentum > 0: show ↑ with "+X"
- If momentum < 0: show ↓ with "-X"
- Momentum field included in `/data` payload under `master.momentum` and `master.trend`

**Files changed:**
- `app/index.html` — added `#momentumArrow` element in gauge card
- `app/app.js` — added `renderVolatility()` and momentum rendering in `renderGauge()`
- `app/styles.css` — added momentum styling
- `gdelt-proxy/index.js` — KV-based momentum tracking, `momentum` and `trend` fields in master object

**Verification:**
- ✅ Gauge card shows ↑/↓/→ arrow next to score
- ✅ `master.momentum` and `master.trend` in `/data` payload
- ⏳ Arrow changes direction when score trends change (needs 2+ cycles to verify)
- ⏳ Hebrew translation (future)

---

## Execution Order & Dependencies

| Order | Path | Effort | Depends On | Files |
|-------|------|--------|------------|-------|
| 1 | **C** — Volatility Multiplier | ~1h | None | `gdelt-proxy/index.js` |
| 2 | **A** — Recent Events Weighting | ~2h | C (uses same scoring functions) | `gdelt-proxy/index.js` |
| 3 | **B1** — Aviation (OpenSky) | ~2h | A | `gdelt-proxy/index.js` |
| 4 | **B2** — Prediction Markets (Polymarket) | ~1.5h | B1 | `gdelt-proxy/index.js` |
| 5 | **D** — Trend Estimates | ~1h | B2 (replaces remaining static) | `gdelt-proxy/index.js` |
| 6 | **E** — Momentum Indicator | ~1.5h | All above (reads history data) | `app/*`, `lang.js`, `gdelt-proxy/index.js` |

**Total estimated effort: ~9 hours**

---

## Version Bumping

After all paths complete: bump to **v3.0.0** (major change to methodology)

---

## Rollback Strategy

Each path modifies separate code regions. If a path causes issues:
- **C/A:** Revert `gdelt-proxy/index.js` scoring functions to pre-change state
- **B1/B2:** Remove API fetch calls, revert to FALLBACK_SIGNALS
- **D:** Revert correlated estimates to static values
- **E:** Remove momentum UI elements from frontend
- KV cache keys added by each path can be safely left (they auto-expire)
