# Peace Meter — Concept Document v3

## What Is It?

A real-time, multi-signal dashboard that measures the current "temperature of peace" across the Middle East. Inspired by [StrikeRadar](https://usstrikeradar.com/) — which aggregates OSINT signals to gauge war risk — but inverted: **we track signals of peace, diplomacy, and de-escalation**.

The dashboard shows:
- **One large master gauge** — the overall Middle East Peace Score (0–100, higher = more peaceful).
- **Several smaller sub-meter gauges** — each tracking a different peace signal.
- A **72-hour trend chart** for the master score.
- **Sparkline mini-charts** per sub-meter.

---

## Why?

StrikeRadar tells you when things are about to blow up. The Peace Meter tells you when things are calming down, when bridges are being built, and when diplomacy is making progress. It gives people hope in a quantifiable form — and helps analysts, journalists, and citizens track positive momentum amid the noise.

---

## Expert Feedback (from an Israeli Think Tank Representative)

> This section captures direct feedback from a representative of one of the tracked Israeli institutes, provided in Hebrew on 2026-05-20:

| Feedback (translated) | Impact on Concept |
|-----------------------|-------------------|
| "Tracking statements of senior officials **must** be included" | ✅ Political Tone signal confirmed as essential (20% weight — highest) |
| "Think tank opinions are **problematic** — we recommend policy steps, that doesn't necessarily reflect what will happen" | ⚠️ Think Tank weight reduced from 20% → 10%. Still useful as sentiment indicator but not a leading predictor |
| "I would add **commercial trust** — are airlines easing restrictions?" | ✅ Aviation signal refined: now tracks airline policy/route changes, not just flight counts |
| "Add **credit rating indicators** — what's the direction? Downgrade or upgrade?" | ✅ NEW signal: Credit Ratings (10%) — sovereign ratings from Fitch/S&P/Moody's |
| "What's the travel risk level for a country according to various foreign ministries?" | ✅ NEW signal: Travel Advisories (10%) — aggregated risk levels from US State Dept, UK FCDO, Canada, etc. |

---

## Historical Signals of Approaching Peace

Before defining our signals, let's ground this in what **actually preceded past ceasefires and peace deals** in the Middle East. Studying the 2025 Gaza ceasefire, the 2026 Israel-Iran and Israel-Lebanon ceasefires, and earlier Oslo-era patterns:

| Signal | What Happened Before Ceasefires |
|--------|-------------------------------|
| **Back-channel diplomacy** | Qatari, Egyptian, Turkish mediators shuttling — often unreported for weeks |
| **Senior official statements** | Constructive rhetoric from leaders 1-3 months before deals (confirmed by think tank expert) |
| **Prediction market shifts** | Polymarket "ceasefire" odds jumped 10% → 60%+ in the weeks before deals |
| **Airline restrictions easing** | Commercial carriers resume routes over conflict zones — they act on security intel before it's public |
| **Credit rating upgrades/stabilization** | Fitch/S&P upgrade or stabilize ratings as traders price in reduced risk |
| **Travel advisory downgrades** | Foreign ministries lower travel warnings (Level 4 → 3 → 2) |
| **UN Security Council activity** | Resolutions, envoy visits, "monthly forecast" language shifts from "escalation" to "ceasefire" |
| **Humanitarian corridor openings** | Aid trucks, prisoner swaps, hospital access — tangible steps toward peace |
| **Media narrative shift** | BBC/Al Jazeera headlines shift from "escalation" to "negotiations" |

---

## Sub-Meters (Peace Signals)

### 1. 🤝 Political Tone Signal — weight 20%
**Sources:** GDELT 2.0 Event Database (primary), RSS feeds (fallback)
**Method:** Uses the Goldstein Scale (-10 to +10) per event from GDELT. Each news event is scored on a standardized scale where +10 is maximally positive and -10 is maximally negative.
- Filters events where Actor1 or Actor2 is a tracked ME country (ISR, PSE, LBN, SYR, IRN, YEM, IRQ, SAU, ARE, BHR)
- Skips neutral events (Goldstein = 0)
- Score = `50 + (avgGoldstein / 10) × 50`, clamped to 0–100

**Why GDELT over RSS:** GDELT monitors 250k+ news stories/day across 200 languages, provides structured event data with standardized sentiment scores. Far more reliable than scraping RSS headlines for keyword sentiment.

**Why highest weight:** Expert confirmed this as the most essential signal. Senior officials' rhetoric is a direct leading indicator of policy direction.

---

### 2. 📰 Diplomatic News Signal — weight 15%
**Sources:** GDELT 2.0 Event Database (primary), RSS feeds (fallback)
**Method:** Uses CAMEO event coding from GDELT. Counts diplomatic event root codes (Consult, Discuss, Provide aid, Negotiate, etc.) vs. total ME events.
- **Peace keywords:** ceasefire, agreement, talks, diplomacy, deal, normalize, truce, peace, reconciliation, humanitarian, aid, prisoner exchange, envoy, mediation, framework, roadmap
- **War keywords:** strike, attack, missile, killed, escalation, war, bombardment

Score = `clamp(3, 95, round(ratio² × 150))` where ratio = peace_articles / total_ME_articles. Quadratic curve keeps low ratios at single-digit scores, real shifts register strongly.

---

### 3. ✈️ Commercial Aviation / Airline Trust Signal — weight 12%
**Sources:** OpenSky Network API + airline press releases + RSS
**Method:** Two-layer signal:
1. **Flight volume** — count commercial aircraft in ME airspace (Israel, Lebanon, Syria, Iraq, Iran, Gulf)
2. **Airline policy** — track when airlines lift restrictions: route resumptions, overflight permission changes, charter cancellations

Rising flight volumes + easing restrictions = commercial confidence = peace signal.
Score = combined metric: 40% flight volume vs. pre-2023 baseline, 60% airline policy changes.

**Why 60/40 split:** Expert emphasized that airline policy changes are more meaningful than raw flight counts — when El Al or Turkish Airlines announce resumed routes to a conflict zone, that reflects concrete risk assessment.

---

### 4. 💰 Prediction Markets Signal — weight 10%
**Source:** Polymarket API
**Method:** Track ceasefire/peace-related markets. Currently active:
- "Israel x Iran ceasefire before July?"
- Monitor for new ceasefire/peace agreement markets
- Average the "Yes" probabilities across all relevant markets

Score = average "Yes" probability × 100.

---

### 5. 🏛 Credit Ratings Signal — weight 10%
**Sources:** Trading Economics (`tradingeconomics.com/country-list/rating`), CountryRisk.io API, Fitch/S&P/Moody's press releases via RSS
**Method:** Track sovereign credit ratings for Israel, Lebanon, Syria, Iraq, Iran, Saudi Arabia.
- **Upgrade or positive outlook** = peace signal (+1 per country)
- **Downgrade or negative outlook** = conflict signal (-1 per country)
- **Rating direction matters more than absolute level** — a country going from B+ to BB- is a peace signal even if still speculative grade

Score = net rating direction across tracked countries, normalized to 0–100. Weekly update (ratings change slowly).

---

### 6. 🛂 Travel Advisories Signal — weight 10%
**Sources:** US State Department (travel.state.gov), UK FCDO (gov.uk/foreign-travel-advice), Canada (travel.gc.ca), Israel NSC (gov.il/travel-warnings), TravelAdvisory.io aggregator
**Method:** Each foreign ministry rates countries on a scale (typically 1-4, where 4 = "Do not travel"). Track the average advisory level for each Middle East country.
- **Downward movement** (Level 4 → 3) = peace signal
- **Upward movement** (Level 2 → 3) = conflict signal
- Score = weighted average of advisory levels across all ministries, inverted (lower risk = higher score)

Score = `(4 - average_level) / 3 × 100`, averaged across all tracked ministries. Updated daily.

---

### 7. 🚢 Gulf Shipping Signal — weight 7%
**Source:** BBC + Al Jazeera RSS (keyword filter)
**Method:** Scan for Red Sea / Gulf shipping articles:
- **Peace indicators:** resumed shipping, port reopened, safe passage, trade normalized, commercial traffic restored
- **Conflict indicators:** attacked, seized, hijacked, mine, blockade

Score = ratio of peace-classified shipping articles over 7-day window.

---

### 8. 🧠 Think Tank & Expert Signal — weight 10%
**Sources:** RSS feeds from Mitvim, INSS, JISS, ICT + Security Council Report
**Method:** Parse RSS feeds for new articles. NLP sentiment scoring on headlines.
- Peace-relevant articles score +1, conflict articles score -1
- Weight by institute reliability (Mitvim = 1.3x, INSS = 1.0x, JISS = 0.8x, ICT = 0.5x)
- 7-day rolling score

**⚠️ Caveat (from institute representative):** Think tank publications reflect policy recommendations, not predictions. A paper saying "Israel should pursue ceasefire" does not mean a ceasefire will happen. This signal captures **diplomatic sentiment and consensus-building**, not outcomes. Used as a supporting indicator, not a primary predictor.

---

### 9. 🌍 VIEWS AI Forecast Signal — weight 5%
**Source:** VIEWS API / HDX (`api.viewsforecasting.org`)
**Method:** VIEWS uses AI to predict fatalities 1–36 months ahead. For Israel, Lebanon, Syria, Iraq, Iran — if predicted fatalities are declining vs. previous forecast, that's a peace signal.

Score = average decline in predicted fatalities, normalized to 0–100.

---

### 10. 🏥 Humanitarian Signal — weight 1%
**Source:** UN OCHA reports, ReliefWeb RSS, BBC/Al Jazeera humanitarian keywords
**Method:** Count events:
- Aid corridor openings, Prisoner/hostage releases, Hospital access restored, Refugee return, Reconstruction announcements

Score = event count mapped: 0 = 5, 1 = 25, 2 = 50, 3 = 70, 4+ = 95.

**Why 1% weight:** Humanitarian events are important for human impact but are lagging indicators — they happen after political decisions are made.

---

## Master Score Calculation

```
Peace Score = (Tone    × 0.20) + (News    × 0.15)
             + (Aviation× 0.12) + (Predict × 0.10)
             + (Credit  × 0.10) + (Travel  × 0.10)
             + (ThinkTank×0.10) + (Shipping× 0.07)
             + (VIEWS   × 0.05) + (Humanitarian × 0.01)
```

**Peace Multiplier:** When 3+ sub-meters cross above 60, apply 1.15x. When 5+ cross above 60, apply 1.25x. Caps at 100.

**Smoothing:** Asymmetric EMA — fast rise (3-hour half-life), slow decay (12-hour half-life). A breakthrough registers quickly; a single bad day doesn't erase progress.

---

## Peace Levels (Color Tiers)

| Score Range | Label        | Color      | Meaning |
|-------------|--------------|------------|---------|
| 0 – 25      | ❄️ Frozen    | Ice blue   | Active conflict, no diplomatic activity |
| 26 – 50     | 🌤 Thawing   | Light blue | Back-channel talks, sporadic diplomacy |
| 51 – 75     | 🌱 Growing   | Green      | Active negotiations, ceasefires holding |
| 76 – 100    | 🕊 Flourishing | Gold    | Peace agreements, normalization |

---

## Signal Philosophy — Commercial Reality Over Opinions

The v3 design philosophy, shaped by the institute representative's feedback:

| Priority | Rationale |
|----------|-----------|
| **1. What senior officials say** (20%) | Direct leading indicator of policy direction |
| **2. What the media reports** (15%) | Captures diplomatic activity visible in news |
| **3. What airlines do** (12%) | Commercial entities act on risk intel before it's public |
| **4. What markets price in** (10%) | Prediction markets aggregate thousands of individual judgments |
| **5. What credit agencies rate** (10%) | Sovereign ratings reflect institutional risk assessment |
| **6. What foreign ministries warn** (10%) | Government risk assessments for citizens |
| **7. What think tanks recommend** (10%) | Policy sentiment — useful but not predictive |
| **8-10. Supporting signals** (13%) | Shipping, AI forecasts, humanitarian |

**Key insight:** The top signals are **commercial and official actions** (airlines, markets, credit agencies, foreign ministries), not **opinions** (think tanks, media). Opinions still matter but carry less weight.

---

## Dashboard Layout

```
┌─────────────────────────────────────────────┐
│  ☮️ Peace Meter    [Live]  [About] [?]     │
├─────────────────────────────────────────────┤
│  Updated 14:32 UTC  |  Next update 15:02   │
├─────────────────────────────────────────────┤
│                                              │
│         ╭───────────────────────╮            │
│         │   MASTER GAUGE        │            │
│         │   Peace Score: 58     │            │
│         │   🌤 Thawing          │            │
│         │   [arc gauge visual]  │            │
│         ╰───────────────────────╯            │
│                                              │
├─────────────────────────────────────────────┤
│  72-HOUR TREND CHART                        │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 🤝 Tone  │ │ 📰 News  │ │ ✈️ Aviat │    │
│  │  Score:60│ │  Score:65│ │  Score:48│    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 💰 Pred  │ │ 🏛 Credit│ │ 🛂 Travel│    │
│  │  Score:41│ │  Score:55│ │  Score:30│    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 🚢 Ship  │ │ 🧠 Think │ │ 🌍 VIEWS │    │
│  │  Score:55│ │  Score:52│ │  Score:62│    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  ┌──────────┐                              │
│  │ 🏥 Aid   │                              │
│  │  Score:35│                              │
│  └──────────┘                              │
│                                              │
├─────────────────────────────────────────────┤
│  Recent Think Tank Publications             │
│  [Mitvim: "Normalization through..."]       │
│  [INSS: "October 2025 Public Opinion..."]   │
├─────────────────────────────────────────────┤
```

---

## Data Sources & APIs

| Signal | Source | Access Method | Update Frequency |
|--------|--------|---------------|-----------------|
| Political Tone | BBC RSS, Al Monitor RSS, X/Twitter | RSS + Twitter API | Every 30 min |
| Diplomatic News | BBC RSS, Al Monitor RSS | RSS parsing | Every 30 min |
| Aviation | OpenSky Network + airline RSS | API + RSS | Every 30 min |
| Prediction Markets | Polymarket | API | Every hour |
| Credit Ratings | Trading Economics, CountryRisk.io | API / scraping | Weekly |
| Travel Advisories | US State Dept, UK FCDO, Canada, Israel NSC | Scraping / RSS | Daily |
| Shipping | BBC RSS, Al Monitor RSS | RSS keyword filter | Every 30 min |
| Think Tank | Mitvim RSS, EcoPeace ME RSS | RSS parsing | Every 30 min |
| VIEWS | HDX / viewsforecasting.org | CSV download | Monthly |
| Humanitarian | UN OCHA, ReliefWeb RSS | RSS parsing | Daily |

**Active RSS feeds (reachable from Cloudflare edge):**
- Mitvim (`mitvim.org.il/en/feed/`) — think tank
- EcoPeace ME (`ecopeaceme.org/feed/`) — think tank
- BBC Middle East (`feeds.bbci.co.uk/.../middle_east/rss.xml`) — ME news
- Al Monitor (`al-monitor.com/rss`) — ME news
- JNS (`jns.org/feed/`) — general media (peace-sentiment filter)
- Times of Israel (`timesofisrael.com/feed/`) — general media (peace-sentiment filter)

---

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Frontend    | Vanilla JS + HTML + CSS, inline SVG charts (zero dependencies) |
| Backend     | Cloudflare Pages Functions (edge-computed) |
| RSS Parser  | Built-in XML parser (Cloudflare Workers) |
| i18n        | Client-side translation (EN / HE with RTL) |
| Hosting     | Cloudflare Pages (free tier) |
| Error Handling | 3-attempt retry, localStorage cache, error banner |

---

## Key Design Decisions vs. v2

| Change | v2 → v3 | Rationale |
|--------|----------|-----------|
| Political Tone weight | 10% → **20%** | Expert confirmed as essential signal |
| Think Tank weight | 20% → **10%** | Expert warned: opinions ≠ predictions |
| Aviation refined | Flight counts only → **counts + airline policy** | Commercial trust matters more |
| NEW: Credit Ratings | — → **10%** | Institutional risk assessment, objective |
| NEW: Travel Advisories | — → **10%** | Government risk levels, actionable |
| Humanitarian weight | 5% → **1%** | Lagging indicator, not predictive |
| VIEWS weight | 8% → **5%** | Useful but updates infrequently |
| Total signals | 8 → **10** | Broader coverage, better balance |

---

## Future Extensions

- **Arabic localization:** Arabic language support (Hebrew already implemented)
- **Per-conflict breakdown:** Israel-Gaza, Israel-Lebanon, Israel-Iran, Saudi-Iran, Red Sea
- **"Peace Streak" counter:** Consecutive days above threshold — "14 days 🌱"
- **Peace archive:** Historical peace score with annotations of major events
- **Telegram alerts:** "Peace score crossed 70 🌱"
- **Shareable cards:** Social media images with current score
- **Public API:** REST endpoint for other projects
