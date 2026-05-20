# Peace Meter — Concept Document v2

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

## Historical Signals of Approaching Peace

Before defining our signals, let's ground this in what **actually preceded past ceasefires and peace deals** in the Middle East. Studying the 2025 Gaza ceasefire, the 2026 Israel-Iran and Israel-Lebanon ceasefires, and earlier Oslo-era patterns, these were the leading indicators:

| Signal | What Happened Before Ceasefires |
|--------|-------------------------------|
| **Back-channel diplomacy** | Qatari, Egyptian, Turkish mediators shuttling between parties — often unreported for weeks |
| **Think tank "off-ramp" papers** | Mitvim, INSS, and others publish frameworks for de-escalation 2–6 months before deals |
| **Prediction market shifts** | Polymarket "ceasefire" odds jumped from 10% → 60%+ in the weeks before deals |
| **Flight corridors reopening** | Commercial airlines resume routes over conflict zones — airlines act on security intel before it's public |
| **Oil price calming** | After months of volatility, Brent crude stabilizes as traders price in reduced risk |
| **UN Security Council activity** | Resolutions, envoy visits, and "monthly forecast" language shifts from "escalation" to "ceasefire" |
| **Humanitarian corridor openings** | Aid trucks, prisoner swaps, hospital access — tangible steps toward peace |
| **Media narrative shift** | BBC/Al Jazeera headlines shift from "escalation" to "negotiations" and "framework" language |

These are the signals our meters should track.

---

## Sub-Meters (Peace Signals)

### 1. 📰 Diplomatic News Signal — weight 20%
**Sources:** BBC World Service RSS, Al Jazeera English RSS
**Method:** Same RSS parsing as StrikeRadar. Scan Middle East headlines and classify:
- **Peace keywords:** ceasefire, agreement, talks, diplomacy, deal, normalize, truce, peace, reconciliation, humanitarian, aid, prisoner exchange, envoy, mediation, framework, roadmap
- **War keywords:** strike, attack, missile, killed, escalation, war, bombardment

Score = `clamp(3, 95, round(ratio² × 150))` where ratio = peace_articles / total_ME_articles. Quadratic curve keeps low ratios at single-digit scores, real shifts register strongly.

---

### 2. 🧠 Think Tank & Expert Signal — weight 20%
**Sources:** RSS feeds + Twitter/X feeds from the most active Israeli & international analysis institutes.

**Why this is the most important signal:** Historically, think tank publications framing "off-ramps," "ceasefire frameworks," and "political solutions" have preceded actual deals by 2–6 months. These papers often reflect access to closed-door conversations.

**Institutes tracked (all have RSS feeds or Twitter accounts):**

| Institute | RSS Feed | Twitter | Peace-Relevant? |
|-----------|----------|---------|-----------------|
| **Mitvim** | `mitvim.org.il/en/feed/` | @mitvim | ✅ High — consistently publishes normalization, diplomacy, and framework papers |
| **INSS** | `inss.org.il/feed/` | @inssorg | ✅ Moderate — publishes public opinion surveys + strategic analysis, often signals shifts in Israeli consensus |
| **JISS** | `jiss.org.il/en/feed/` | — | ⚠️ Moderate — hawkish-leaning but useful for tracking "when even hawks say stop" |
| **ICT** (IDC) | `ict.org.il/feed/` | — | ❌ Low — counter-terrorism focused, mostly conflict-oriented |

**Additional international sources:**
| Institute | Feed | Notes |
|-----------|------|-------|
| **VIEWS** (PRIO/Uppsala) | `viewsforecasting.org` + HDX API | ✅ High — AI conflict forecast; if VIEWS predicts declining fatalities for a country, that's a peace signal. Data at `data.humdata.org/dataset/views-conflict-forecasts` |
| **Security Council Report** | `securitycouncilreport.org` | ✅ High — monthly ME forecasts; language shifts from "crisis" to "ceasefire" signal progress |
| **International Crisis Group** | `crisisgroup.org` | ✅ Moderate — publishes "off-ramp" analysis |

**Method:**
- Parse RSS feeds for new articles every 30 min
- NLP sentiment scoring on headlines + article text
- Peace-relevant articles score +1, conflict articles score -1
- Weight by institute reliability score (Mitvim = 1.3x, INSS = 1.0x, JISS = 0.8x, ICT = 0.5x)
- Also monitor Twitter feeds for real-time signals from institute researchers
- 7-day rolling score

Score = weighted sum of peace vs. conflict publications, normalized to 0–100.

---

### 3. ✈️ Civil Aviation Signal — weight 15%
**Source:** OpenSky Network API
**Method:** Count commercial aircraft transiting Israel, Lebanon, Syria, Iraq, Iran, and Gulf airspace. Rising flight volumes = normalization.
Score = current flight count vs. pre-2023 baseline. 100% of baseline = 90, below 30% = 10.

---

### 4. 💰 Prediction Markets Signal — weight 12%
**Source:** Polymarket API
**Method:** Track ceasefire/peace-related markets. Currently active:
- "Israel x Iran ceasefire before July?" — `polymarket.com/event/israel-x-iran-ceasefire-before-july`
- Monitor for new ceasefire/peace agreement markets
- Average the "Yes" probabilities across all relevant markets

Score = average "Yes" probability × 100.

---

### 5. 🚢 Gulf Shipping Signal — weight 10%
**Source:** BBC + Al Jazeera RSS (keyword filter)
**Method:** Scan for Red Sea / Gulf shipping articles:
- **Peace indicators:** resumed shipping, port reopened, safe passage, trade normalized, commercial traffic restored
- **Conflict indicators:** attacked, seized, hijacked, mine, blockade

Score = ratio of peace-classified shipping articles over 7-day window.

---

### 6. 🤝 Political Tone Signal — weight 10%
**Source:** BBC + Al Jazeera RSS
**Method:** Track statements by key regional leaders. Classify as:
- **Constructive:** meet, negotiate, peace plan, open to, dialogue, normalization, partnership
- **Hostile:** threaten, destroy, eliminate, no negotiation, will fight

Score = `clamp(5, 95, round(ratio² × 150))` where ratio = constructive / (constructive + hostile) over 7 days.

---

### 7. 🌍 VIEWS Conflict Forecast Signal — weight 8%
**Source:** VIEWS API / HDX (`api.viewsforecasting.org`)
**Method:** VIEWS (Violence & Impacts Early-Warning System) uses AI to predict fatalities 1–36 months ahead for each country. Download monthly country-level forecasts from HDX. For Israel, Lebanon, Syria, Iraq, Iran, Gaza — if predicted fatalities are declining vs. previous forecast, that's a peace signal.

Score = average decline in predicted fatalities across tracked countries, normalized to 0–100. If VIEWS predicts fewer fatalities next month than it predicted for this month → score rises.

---

### 8. 🏥 Humanitarian Signal — weight 5%
**Source:** UN OCHA reports, ReliefWeb RSS (when accessible), BBC/Al Jazeera humanitarian keywords
**Method:** Count articles/reports about:
- Aid corridor openings
- Prisoner/hostage releases
- Hospital access restored
- Refugee return
- Reconstruction announcements

Score = event count mapped: 0 = 5, 1 = 25, 2 = 50, 3 = 70, 4+ = 95.

---

## Master Score Calculation

```
Peace Score = (News × 0.20) + (ThinkTank × 0.20) + (Aviation × 0.15)
             + (Prediction × 0.12) + (Shipping × 0.10) + (Tone × 0.10)
             + (VIEWS × 0.08) + (Humanitarian × 0.05)
```

**Peace Multiplier:** When 3+ sub-meters cross above 60, apply 1.15x. When 5+ cross above 60, apply 1.25x. Caps at 100.

**Smoothing:** Asymmetric EMA — fast rise (3-hour half-life), slow decay (12-hour half-life).

---

## Peace Levels (Color Tiers)

| Score Range | Label        | Color      | Meaning |
|-------------|--------------|------------|---------|
| 0 – 25      | ❄️ Frozen    | Ice blue   | Active conflict, no diplomatic activity |
| 26 – 50     | 🌤 Thawing   | Light blue | Back-channel talks, sporadic diplomacy |
| 51 – 75     | 🌱 Growing   | Green      | Active negotiations, ceasefires holding |
| 76 – 100    | 🕊 Flourishing | Gold    | Peace agreements, normalization |

---

## Why the Think Tank Signal Is the Crown Jewel

The Think Tank & Expert signal (20% weight, tied for highest) is what makes the Peace Meter fundamentally different from StrikeRadar. Here's why:

1. **Early warning:** Mitvim and INSS papers framing "off-ramps" consistently appear 2–6 months before deals materialize. They often reflect knowledge from closed-door diplomatic conversations.

2. **Inside perspective:** These are Israeli think tanks with access to Israeli government circles. When INSS publishes a public opinion survey showing majority support for ceasefire, that's a leading indicator of Netanyahu's room to maneuver.

3. **Sentiment shift:** When even hawkish outlets like JISS publish "time for restraint" papers, the signal is strong — it means even the hardline consensus is shifting.

4. **VIEWS AI forecasts:** The PRIO/Uppsala VIEWS system uses machine learning on 100+ indicators to predict conflict. When its AI says "fewer fatalities expected," that's an independent, data-driven peace signal.

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
│         │   Peace Score: 62     │            │
│         │   🌱 Growing          │            │
│         │   [arc gauge visual]  │            │
│         ╰───────────────────────╯            │
│                                              │
├─────────────────────────────────────────────┤
│  72-HOUR TREND CHART                        │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 📰 News  │ │ 🧠 Think │ │ ✈️ Aviat │    │
│  │  Score:68│ │  Score:55│ │  Score:72│    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 💰 Pred  │ │ 🚢 Ship  │ │ 🤝 Tone  │    │
│  │  Score:45│ │  Score:60│ │  Score:70│    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  ┌──────────┐ ┌──────────┐                  │
│  │ 🌍 VIEWS │ │ 🏥 Aid   │                  │
│  │  Score:50│ │  Score:40│                  │
│  └──────────┘ └──────────┘                  │
│                                              │
├─────────────────────────────────────────────┤
│  Recent Think Tank Publications             │
│  [Mitvim: "Normalization through..."]       │
│  [INSS: "October 2025 Public Opinion..."]   │
├─────────────────────────────────────────────┤
```

---

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Frontend    | Vanilla JS + HTML + CSS, Chart.js for graphs |
| Backend     | Node.js or Python — cron every 30 min |
| RSS Parser  | `feedparser` (Python) or `rss-parser` (Node) |
| NLP         | HuggingFace free sentiment API or local transformer model for headline classification |
| VIEWS Data  | HDX API or CSV downloads from `api.viewsforecasting.org` |
| Twitter/X   | Nitter alternative or Twitter API for institute accounts |
| OpenSky     | Public API for flight tracking |
| Polymarket  | Polymarket API for prediction market odds |
| Hosting     | Cloudflare Pages / Vercel + GitHub Actions cron for data updates |

---

## Key Design Decisions vs. StrikeRadar

| Aspect | StrikeRadar | Peace Meter | Rationale |
|--------|-------------|-------------|-----------|
| Top signal | News (25%) | Think Tanks + News (20% each) | Expert analysis is an earlier, more reliable peace signal than news |
| Oil signal | Volatility = bad | Stability = good | Inverted logic |
| New signal | N/A | VIEWS AI forecasts | Independent ML-based conflict prediction |
| New signal | N/A | Humanitarian | Grounds peace in human impact |
| Color scheme | Green→Red | Blue→Green→Gold | Matches "frozen→flourishing" metaphor |
| Multiplier | Escalation (1.5x) | Peace (1.25x) | More conservative — peace compounds slower |

---

## Future Extensions

- **Per-conflict breakdown:** Israel-Gaza, Israel-Lebanon, Israel-Iran, Saudi-Iran, Red Sea
- **"Peace Streak" counter:** Consecutive days above threshold — "14 days 🌱"
- **Peace archive:** Historical peace score with annotations of major events
- **Telegram alerts:** "Peace score crossed 70 🌱"
- **Shareable cards:** Social media images with current score
- **Public API:** REST endpoint for other projects
