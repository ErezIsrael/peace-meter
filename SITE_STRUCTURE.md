# Peace Meter — Site Architecture

> A plain-language explanation of how Peace Meter works.

---

## The Big Picture

Peace Meter has **two sides**: a **backend** that collects data and a **frontend** that displays it. They are deployed separately on Cloudflare.

```
┌──────────────────────────┐
│  GDELT BigQuery Dataset  │  ← Google's free, global event database
└──────────┬───────────────┘
           │ queried by
┌──────────▼───────────────┐
│  GDELT Proxy Worker      │  ← Cloudflare Worker (separate deployment)
│  gdelt-proxy.xxx.workers │      • Authenticates to BigQuery via JWT
│  .dev/peace-metrics      │      • Runs SQL: last 24h, ME countries + USA
│                          │      • Caches results 60 min in KV
└──────────┬───────────────┘
           │ fetched by (every page load / refresh)
┌──────────▼───────────────┐
│  Pages Function          │  ← Cloudflare Pages Function
│  /data.json              │      • Calls GDELT Proxy → gets Tone, News, Conflict scores
│                          │      • Fetches 6 RSS feeds → Publications
│                          │      • Computes 12 signals, master score, 6 pair scores
│                          │      • Returns JSON
└──────────┬───────────────┘
           │ fetched by (every page load / 15 min refresh)
┌──────────▼───────────────┐
│  Frontend (Static)       │  ← Cloudflare Pages (static files)
│  index.html + app.js     │      • Renders gauge, signal cards, pairs, map
│  lang.js + styles.css    │      • Auto-refreshes /data.json every 15 minutes
└──────────────────────────┘
```

---

## The GDELT Connection

### What is GDELT?

GDELT 2.0 monitors global news in every language and extracts structured events (who did what to whom, when, and with what tone). These events are stored in a **public BigQuery dataset** (`gdelt-bq.gdeltv2.events_partitioned`).

### Why the Proxy Worker?

Cloudflare cannot reach Google Cloud IPs directly (egress restriction). So we use a dedicated Cloudflare Worker (`gdelt-proxy`) that:

1. **Authenticates** to Google BigQuery using a Service Account (JWT)
2. **Runs a SQL query** against the public GDELT dataset — last 24 hours, ME countries + USA, excluding neutral events
3. **Computes aggregated metrics**: average tone (Goldstein Scale), constructive/hostile/ diplomatic event counts
4. **Caches results** in Cloudflare KV for 60 minutes (stays within BigQuery's 1 TB/month free tier)
5. **Returns JSON** with tone, news, and conflict scores

### What Data Comes from GDELT?

| Signal | Source Field | Computation |
|--------|-------------|-------------|
| **Political Tone** (20%) | `avgGoldstein` | Map -10..+10 → 0..100 |
| **Diplomatic News** (15%) | `constructiveRatio` | Ratio² × 150, clamped |
| **Conflict Events** (8%) | `hostileRatio` | 100 − (hostile% × 100) |

These 3 signals account for **43%** of the master score.

### Who Reads It?

- **The Pages Function** (`/data.json`) calls the Proxy on every request. Gets back tone/news/conflict scores.
- **The frontend** never touches GDELT directly. It only reads the JSON from `/data.json`.

---

## Two Different Experiences

### 1. Visiting `/data.json` (Machine / API)

When a script or developer hits `https://peace-meter.pages.dev/data.json`, the **Pages Function** runs:

1. Fetches data from the GDELT Proxy Worker (may be cached from last 60 min)
2. Fetches 6 RSS feeds from Cloudflare edge (Mitvim, EcoPeace, BBC, Al Monitor, JNS, ToI)
3. Computes all 12 signals and the master score
4. Computes 6 pair scores (Israel-Palestine, Israel-Lebanon, etc.)
5. Returns a JSON object with signals, pairs, publications, and master score

**This is a live computation.** The result changes based on current GDELT data and RSS feeds.

### 2. Surfing to the Site (Human / Browser)

When a person visits `https://peace-meter.pages.dev`, the browser:

1. **Loads static files**: `index.html`, `app.js`, `lang.js`, `styles.css` (cached by browser)
2. **Fetches `/data.json`** via JavaScript → gets the JSON from the Pages Function above
3. **Renders** the gauge, signal cards, pair cards, publications list, and map
4. **Auto-refreshes** every 15 minutes by re-fetching `/data.json`
5. **Falls back** to `data.json` (mock data) if the network is unavailable

**The frontend never queries GDELT directly.** It always goes through the Pages Function. If GDELT is down, the function returns fallback scores and the frontend shows a "Delayed" status indicator.

---

## Data Flow Summary

```
User visits site
    │
    ├── Loads static HTML/CSS/JS (from Cloudflare CDN, cached)
    │
    └── JavaScript fetches /data.json
            │
            ├── Pages Function calls GDELT Proxy Worker
            │       │
            │       ├── Cache hit? → return cached JSON (60 min TTL)
            │       │
            │       └── Cache miss? → authenticate JWT → query BigQuery
            │                            → compute metrics → cache → return JSON
            │
            ├── Pages Function fetches 6 RSS feeds (parallel, 4s timeout each)
            │       → parse XML → filter relevance → sort by date
            │
            ├── Pages Function computes 12 signals + master score + 6 pair scores
            │
            └── Returns JSON → Frontend renders dashboard
```

---

## File Locations

| Component | File | Location |
|-----------|------|----------|
| **GDELT Proxy Worker** | `gdelt-proxy/index.js` | Repo root (deployed separately) |
| **JWT Auth** | `gdelt-proxy/jwt-client.js` | Repo root |
| **Pages Function** | `functions/data.json.js` | Repo root |
| **Frontend HTML** | `app/index.html` | Static (served from CDN) |
| **Frontend JS** | `app/app.js` | Static |
| **Translations** | `app/lang.js` | Static |
| **Styles** | `app/styles.css` | Static |
| **Fallback Data** | `app/data.json` | Static (used when API fails) |
| **Map SVG** | `app/me_map.svg` | Static (Natural Earth data) |
