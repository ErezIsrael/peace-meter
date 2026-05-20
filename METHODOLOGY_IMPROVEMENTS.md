# Methodology Improvements — v4 Proposal

## Part 1: Better / More Reliable Signals

The current v3 design is already strong on the "commercial reality over opinions" principle. Below are **additions and refinements** grounded in established peace measurement research (Global Peace Index, V-Dem, UCDP, ACLED, GDELT).

---

### A. Replace RSS Sentiment Analysis with GDELT Event Data

**Current approach:** Parse BBC/Al Jazeera/Al Monitor RSS headlines with keyword sentiment scoring.

**Problem:**
- Headlines ≠ events. A headline about "diplomatic talks" doesn't prove a meeting happened.
- Keyword-based classification is brittle ("strike" in "strike a deal" = false positive war signal).
- Limited to feeds that are reachable from Cloudflare edge.

**Proposal: GDELT 2.0 Event Database**

[GDELT](https://www.gdeltproject.org/) monitors every news source worldwide (250k+ stories/day, 80+ languages) and classifies them into structured events (Goldstein Tone scoring, CAMEO event codes).

**API:** Free, anonymous, global download at `https://data.gdeltproject.org/` (no auth needed). Cloudflare-edge accessible.

**How it replaces/improves Signals 1 + 2:**

| Current Signal | GDELT Equivalent | Advantage |
|---|---|---|
| Political Tone (20%) | Filter GDELT events by actor = regional leaders, score by Goldstein Tone (-100 to +100) | Structured event data, not headline keywords |
| Diplomatic News (15%) | CAMEO event codes for diplomacy (C13 "consult", C22 "confer", C23 "meet", C58 "negotiate") | Counts actual diplomatic events, not media mentions |

**Implementation:**
```
GET https://data.gdeltproject.org/gdeltv2/20260520000000.COUNTRY.CSV.gz
    → filter for Israel, Lebanon, Syria, Gaza, Iran, etc.
    → extract Goldstein Tone per event
    → aggregate diplomatic event count (CAMEO codes)
```

GDELT updates every 15 minutes. Free. No API key.

---

### B. Add Conflict Event Density (ACLED / UCDP)

**New signal proposal:** Replace or supplement "Gulf Shipping" with a **Conflict Event Density** signal.

**Why:** The [Global Peace Index](https://www.economicsandpeace.org/) measures peace using 23 indicators, the most important being "number of conflicts" and "deadliness of conflict." We need a direct measure of violence to invert it into a peace score.

**Data sources:**

| Source | Coverage | Update | Access |
|--------|----------|--------|--------|
| **ACLED** | Middle East, event-level violence | Daily | Free API (registration required) |
| **UCDP/PRIO** | Global armed conflicts | Quarterly | Free download |

**Method:**
```
Conflict Density = ACLED events in ME region over last 7 days
Peace Score = max(0, 100 - (events × normalization_factor))
```

ACLED classifies events into types: Battles, Violence against civilians, Explosions/Remote violence, Riots, Strategic developments. We weight them differently:

| Event Type | Weight | Rationale |
|-----------|--------|-----------|
| Battles | 2.0 | Direct combat |
| Violence vs civilians | 3.0 | Worst signal |
| Explosions | 1.5 | Indirect violence |
| Riots | 0.5 | Internal unrest, not interstate |
| Strategic developments | 0.0 | Neutral (could be peace or war) |

**Weight in master score:** 8–10% — replaces Gulf Shipping as a more direct peace/conflict indicator.

---

### C. Add Visa / Normalization Tracker

**New signal proposal:** Track bilateral diplomatic normalization events.

**Why:** The Abraham Accords era showed that visa openings and airline agreements are **leading indicators** of broader peace. When UAE opens direct flights to Israel, that's a commercial peace signal.

**Data sources:**
- IATA flight route data (free, monthly)
- Embassy opening press releases (RSS from foreign ministries)
- Visa policy databases (Henley Passport Index, IATA Travel Centre)

**Method:** Track new routes, visa-free agreements, embassy openings between ME countries and Israel/Gulf states. Each event = +X points, decay over 180 days.

**Weight:** 5–7%

---

### D. Refine VIEWS Integration

**Current approach:** Download VIEWS CSV monthly, compare predicted fatalities.

**Problem:** Updates too slowly (monthly). By the time we see a decline, it's old news.

**Proposal:** Use VIEWS via [HDX API](https://data.humdata.org/) for more frequent access, and supplement with [UCDP Conflict Forecasts](https://www.uu.se/en/websites/ucdp---uppsala-conflict-data-program) which update quarterly.

**Even better:** Use V-Dem's [electoral democracy index](https://www.v-dem.net/data/the-v-dem-dataset/) as a structural peace predictor. Countries with higher democratic scores have significantly lower conflict risk (established in political science literature).

---

### E. Add Social Media Sentiment (X/Twitter via GDELT)

**Current approach:** Mentioned in concept but not implemented.

**Proposal:** GDELT also tracks social media. Use its SOCMENT dataset to capture public sentiment in the region.

**Method:** Goldstein Tone score on social media mentions about Middle East topics. Normalize to 0–100.

**Weight:** 3–5% (supplemental — social media is noisy but captures public mood that RSS misses)

---

### F. Add Economic Integration Signal

**New signal proposal:** Track trade flows, port activity, energy deals.

**Why:** Economic interdependence = peace. When ME countries increase trade, they have less incentive for conflict.

**Data sources:**
- IMF Direction of Trade Statistics (free, monthly)
- World Bank trade data (free)
- Energy deal announcements (RSS from Reuters, Bloomberg)

**Method:** Year-over-year change in bilateral trade volumes between ME countries. Rising trade = peace signal.

**Weight:** 3–5%

---

## Part 2: Per-Country Pair Peace Scores

The master gauge is a **regional composite**. But "Middle East peace" is too broad — Israel-Palestine and Saudi-Iran are completely different trajectories.

### Proposed Architecture

Instead of one gauge, add **pair-specific gauges**:

```
Master Gauge (regional composite)
├── Israel-Palestine (Gaza/WB)
├── Israel-Lebanon
├── Israel-Iran
├── Saudi-Iran
├── Red Sea / Yemen
└── Abraham Accords (UAE/Bahrain/Morocco-Israel)
```

### How to Compute Pair Scores

Each pair gets its own weighted signals, drawn from the same data but **filtered to the relevant countries**:

| Signal | Israel-Palestine | Israel-Lebanon | Israel-Iran | Red Sea |
|--------|-----------------|----------------|-------------|---------|
| Political Tone | ✅ (filter actors) | ✅ | ✅ | ✅ (Houthi leaders) |
| Diplomatic News | ✅ | ✅ | ✅ | ✅ |
| Aviation | ✅ (Tel Aviv–Cairo) | ✅ (Beirut routes) | ✅ (Iran overflights) | ✅ (Red Sea flights) |
| Prediction Markets | ✅ (Gaza ceasefire) | ✅ (Lebanon truce) | ✅ | ❌ |
| Credit Ratings | ✅ (Israel + Gaza) | ✅ (Israel + Lebanon) | ✅ (Israel + Iran) | ✅ (Yemen) |
| Travel Advisories | ✅ | ✅ | ✅ | ✅ (Red Sea travel) |
| Conflict Events (ACLED) | ✅ (Gaza/WB events) | ✅ (Southern Lebanon) | ✅ (Israel-Iran exchanges) | ✅ (Houthi attacks) |
| Shipping | ❌ | ❌ | ❌ | ✅ (primary signal) |
| Visa/Normalization | ✅ | ✅ | ✅ | ❌ |
| Economic Integration | ✅ | ✅ | ❌ | ✅ (port activity) |

### Implementation Strategy

**Phase 1 (v4):** Add 2–3 pair gauges to the dashboard. Start with the most active conflicts:
1. **Israel-Palestine** (highest impact)
2. **Israel-Lebanon** (active front)
3. **Red Sea / Yemen** (clear shipping signal)

**Phase 2 (v5):** Add remaining pairs:
4. Israel-Iran
5. Saudi-Iran
6. Abraham Accords tracker

**Phase 3 (v6):** Interactive map showing pair scores geographically.

### Technical Approach

```json
{
  "master": { "score": 42, "level": "thawing" },
  "pairs": [
    { "id": "israel-palestine", "score": 35, "level": "thawing", "signals": { "tone": 40, "diplomacy": 50, ... } },
    { "id": "israel-lebanon", "score": 28, "level": "frozen", "signals": { "tone": 25, "conflict_events": 15, ... } },
    { "id": "red-sea", "score": 55, "level": "growing", "signals": { "shipping": 70, "conflict_events": 30, ... } }
  ]
}
```

Each pair's sub-meters feed into the master score proportionally. If Israel-Palestine is 40% of regional conflict, its score weighs more.

---

## Part 3: Signal Weight Rebalancing for v4

Proposed new weights incorporating the improvements above:

| Signal | v3 Weight | v4 Weight | Change | Reason |
|--------|-----------|-----------|--------|--------|
| 🤝 Political Tone | 20% | 15% | ↓5 | GDELT provides structured events, reduces reliance on sentiment alone |
| 📰 Diplomatic News | 15% | 10% | ↓5 | Replaced by GDELT CAMEO diplomatic event codes |
| ✈️ Aviation | 12% | 10% | ↓2 | Maintained as strong commercial signal |
| 💰 Prediction Markets | 10% | 8% | ↓2 | Valuable but limited market coverage |
| 🏛 Credit Ratings | 10% | 8% | ↓2 | Maintain but make room for new signals |
| 🛂 Travel Advisories | 10% | 8% | ↓2 | Maintain but make room for new signals |
| 🧠 Think Tank | 10% | 5% | ↓5 | Further reduced per expert feedback |
| 🚢 Shipping | 7% | — | REMOVED | Replaced by Conflict Events |
| 🌍 VIEWS | 5% | 4% | ↓1 | Keep as long-term forecast |
| 🏥 Humanitarian | 1% | 2% | ↑1 | Slight increase — captures humanitarian corridors |
| **NEW: Conflict Events** | — | 8% | NEW | Direct violence measurement (ACLED) |
| **NEW: Normalization** | — | 4% | NEW | Visa, embassy, route openings |
| **NEW: Economic** | — | 3% | NEW | Trade flow indicator |
| **Total** | **100%** | **100%** | | |

---

## Part 4: Implementation Priority

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| **P1** | Integrate GDELT API for Signals 1+2 | Medium | High — structured event data replaces brittle RSS sentiment |
| **P2** | Add ACLED Conflict Events signal | Medium | High — direct violence measurement |
| **P3** | Add 2–3 per-pair gauges (Israel-Palestine, Israel-Lebanon, Red Sea) | High | High — meaningful granularity |
| **P4** | Add Normalization tracker (visa, routes, embassies) | Low | Medium — captures Abraham Accords-style progress |
| **P5** | Add Economic Integration signal | Medium | Medium — trade = peace |
| **P6** | Add remaining pair gauges (Israel-Iran, Saudi-Iran, Abraham Accords) | High | Medium — completes the matrix |
| **P7** | Interactive map visualization | High | Medium — great UX but requires new SVG rendering |

---

## Part 5: Established Methodologies for Reference

These are the gold-standard peace measurement frameworks. Our methodology should align with their best practices:

| Framework | What It Measures | Relevance to Peace Meter |
|-----------|------------------|--------------------------|
| **Global Peace Index** (Economist / SIPRI) | 23 indicators: conflict, armed forces, governance, refugee flow | Our 10 signals ≈ their top 10 indicators. We should add "armed forces" and "refugee flow." |
| **V-Dem Institute** | Democracy types, electoral freedom, liberty | Democratic backsliding = conflict risk. Their indices could supplement Think Tank signal. |
| **UCDP/PRIO** | Armed conflict onset, intensity, duration | Gold standard for conflict measurement. Our Conflict Events signal mirrors their approach. |
| **ACLED** | Event-level violence (battles, civilian attacks, riots) | Direct replacement for RSS-based conflict detection. Event-level granularity. |
| **GDELT** | Global news event extraction, Goldstein tone, CAMEO codes | Replaces our RSS sentiment analysis with structured, coded events. |
| **VIEWS** | AI-predicted fatalities (1-36 month horizon) | Already in our signals. Keep as long-term forecast layer. |

**Key lesson from GPI:** They weight indicators differently for "relative peace" (conflict) vs "societal peace" (governance, refugee flow) vs "personal security" (crime, police). Our meter is currently focused on **relative peace** (conflict). The v4 expansion toward economic integration and normalization begins addressing **societal peace**.
