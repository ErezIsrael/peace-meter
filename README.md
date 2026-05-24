# ☮️ Peace Meter v2.10.0

A real-time, open-source dashboard measuring the "temperature of peace" across the Middle East using **12 independent signals**.

[Live site](https://peace-meter.pages.dev) · [Source](https://github.com/ErezIsrael/peace-meter)

---

## What It Tracks

Twelve signals are scored independently (0–100) and combined into a master score using normalized weights that sum to exactly 1.0.

| # | Signal | Weight | Primary Source |
|---|--------|--------|----------------|
| 1 | 🤝 Political Tone | 18% | GDELT 2.0 BigQuery (Goldstein Scale) |
| 2 | 📰 Diplomatic News | 14% | GDELT 2.0 BigQuery (CAMEO codes) |
| 3 | ✈️ Commercial Aviation | 11% | GDELT-derived estimate |
| 4 | 💰 Prediction Markets | 10% | Polymarket API |
| 5 | 🏛 Credit Ratings | 9% | GDELT-derived estimate |
| 6 | 🛂 Travel Advisories | 9% | GDELT-derived estimate |
| 7 | 🧠 Think Tank & Expert | 9% | RSS feeds (Mitvim, EcoPeace ME) |
| 8 | 💥 Conflict Events | 8% | GDELT 2.0 BigQuery |
| 9 | 🌍 VIEWS AI Forecast | 5% | GDELT-derived estimate |
| 10 | 🔗 Normalization | 4% | Curated events list |
| 11 | 📊 Economic | 3% | Curated events list |
| 12 | 🏥 Humanitarian | 1% | GDELT-derived estimate |

### Peace Levels

| Score | Level | Meaning |
|-------|-------|---------|
| 0–25 | ❄️ Frozen | Active conflict, no diplomacy |
| 26–50 | 🌤 Thawing | Back-channel talks |
| 51–75 | 🌱 Growing | Active negotiations |
| 76–100 | 🕊 Flourishing | Peace agreements |

### Master Score Formula

```
Score = Tone×0.18 + News×0.14 + Aviation×0.11 + Predict×0.10 + Credit×0.09
      + Travel×0.09 + ThinkTank×0.09 + Conflict×0.08 + VIEWS×0.05 + Norm×0.04
      + Econ×0.03 + Human×0.01
```

- **Asymmetric EMA**: Peace rises fast (3h half-life), decays slowly (12h half-life).
- **Volatility Multiplier**: During event spikes, tone & conflict shifts are amplified up to 1.5×.
- Score is always clamped to 0–100.

### Per-Pair Scores

In addition to the master gauge, six conflict pairs are tracked:
Israel-Palestine, Israel-Lebanon, Red Sea/Yemen, Israel-Iran, USA-Iran, Abraham Accords.

---

## Architecture

```
┌─────────────────────┐
│  GDELT BigQuery     │  ← Google's free, global event database
└──────┬──────────────┘
       │ queried by JWT
┌──────▼──────────────┐
│  GDELT Proxy Worker │  ← Cloudflare Worker (gdelt-proxy/)
│  /data              │      • JWT auth → BigQuery SQL
│  /peace-metrics     │      • 12 signals + master + pairs
└──────┬──────────────┘       • KV cache (60 min TTL)
       │ fetched by
┌──────▼──────────────┐
│  Pages Function     │  ← Cloudflare Pages Function
│  /data.json         │      • Thin proxy → Worker /data
└──────┬──────────────┘
       │ fetched by
┌──────▼──────────────┐
│  Frontend (Static)  │  ← Cloudflare Pages (app/)
│  index.html + JS    │      • Gauge, signals, pairs, map
└─────────────────────┘
```

### Why a Separate Worker?

Cloudflare cannot reach `data.gdeltproject.org` (Google Cloud egress restriction). BigQuery REST API is accessible, so the Worker:
1. Authenticates via Google Service Account (JWT Bearer flow)
2. Runs SQL against ``gdelt-bq.gdeltv2.events_partitioned`` (partitioned, 1-day window)
3. Fetches 6 RSS feeds, computes all 12 signals + master score + 6 pair scores
4. Caches in KV (60 min TTL) — stays within BigQuery's 1 TB/month free tier

### Cost: $0/month

- Cloudflare Workers: 100K requests/day free
- KV reads/writes: included
- BigQuery: ~0.3-0.5 GB/query × 24/day ≈ 0.3-0.6 TB/month (under 1 TB free tier)

---

## RSS Feeds

Six feeds are fetched from Cloudflare edge on each Worker cache miss:

| Source | URL | Type | Cap |
|--------|-----|------|-----|
| Mitvim | `mitvim.org.il/en/feed/` | thinktank | 4 |
| EcoPeace ME | `ecopeaceme.org/feed/` | thinktank | 3 |
| BBC Middle East | `feeds.bbci.co.uk/news/world/middle_east/rss.xml` | me-news | 3 |
| Al Monitor | `www.al-monitor.com/rss` | me-news | 3 |
| JNS | `www.jns.org/feed/` | media (peace only) | 2 |
| Times of Israel | `www.timesofisrael.com/feed/` | media (peace only) | 2 |

Only publications from the last 30 days are shown. Articles are filtered for Middle East relevance and auto-classified (peace / war / neutral).

---

## Features

- **Zero-dependency frontend** — Vanilla JS, HTML, CSS. Charts are inline SVG.
- **GDELT integration** — Primary data source for Political Tone, Diplomatic News, and Conflict Events.
- **EN / HE bilingual** — Full Hebrew translation with RTL layout. Use `?lang=he` in URL.
- **Error resilience** — 3-attempt retry, localStorage cache fallback, stale-data auto-refresh.
- **Self-hosted fonts** — Inter & Space Grotesk variable fonts (no Google Fonts).
- **Security** — Strict CSP, HSTS, X-Frame-Options, rate limiting (30 req/min/IP).
- **Accessibility** — Semantic HTML, keyboard nav, screen reader support, WCAG AA contrast.
- **Legal compliance** — Privacy Policy, Terms of Service, Accessibility Statement (EN/HE modals).
- **Cache-safe deployment** — Version query strings on JS/CSS assets.

---

## Local Development

```bash
# Pages frontend (with Functions)
npx wrangler pages dev app --compatibility-date=2026-05-20
# → http://127.0.0.1:8788

# GDELT Proxy Worker
cd gdelt-proxy
npx wrangler dev --compatibility-date=2026-05-20
```

---

## Deploying

### Frontend (Cloudflare Pages)

```bash
npx wrangler pages deploy app --project-name=peace-meter --skip-caching
```

**Always use `--skip-caching`** — Cloudflare caches file hashes and may skip re-uploading unchanged files.

### Backend (GDELT Proxy Worker)

```bash
cd gdelt-proxy
npx wrangler deploy --project-name=gdelt-proxy
```

### Git-Triggered Deployments

Connect GitHub repo `ErezIsrael/peace-meter` (branch `main`) in Cloudflare Dashboard:
- Framework preset: **None**
- Build command: **(leave empty)**
- Build output directory: `app`

> `functions/` and `_routes.json` must be at the **repository root** (not inside `app/`).

---

## Required Secrets

### GDELT Proxy Worker (`gdelt-proxy/`)

| Secret | Description |
|--------|-------------|
| `GDELT_SA_KEY` | Full JSON content of Google Service Account key |

Set via: `cd gdelt-proxy && npx wrangler secret put GDELT_SA_KEY`

### Pages Functions (`app/`)

No secrets currently required. RSS feeds and GDELT are fetched through the Worker.

### KV Namespaces

Created in Cloudflare Dashboard or via CLI:

| Binding | Namespace | Purpose |
|---------|-----------|---------|
| `PEACE_CACHE` | Worker | Full `/data` payload (60 min TTL) |
| `RATE_LIMIT` | Worker | Sliding-window rate limiting (30 req/min/IP) |
| `GDELT_CACHE` | Worker | BigQuery auth token + metrics (60 min TTL) |

---

## Project Structure

```
peace-meter/
├── wrangler.toml          # Cloudflare config (MUST be at root)
├── _routes.json           # Routes /data.json to Pages Function
├── functions/
│   └── data.json.js       # Pages Function — thin proxy to Worker
├── app/                   # Static frontend (deployed content)
│   ├── index.html         # Main page
│   ├── app.js             # Frontend logic, SVG rendering, i18n
│   ├── lang.js            # EN/HE translations, signal metadata, legal modals
│   ├── styles.css         # Dark theme, RTL, accessibility
│   ├── data.json          # Fallback mock data
│   ├── me_map.svg         # Middle East map (Natural Earth data)
│   ├── fonts/             # Self-hosted fonts
│   ├── _headers           # Security headers (CSP, HSTS, etc.)
│   └── _routes.json       # Pages routing
├── gdelt-proxy/           # GDELT BigQuery Proxy Worker
│   ├── index.js           # Worker code — GDELT + RSS + signals + pairs
│   ├── jwt-client.js      # JWT auth for BigQuery
│   └── wrangler.toml      # Worker config
└── LICENSE
```

### Version Bumping Protocol

When bumping the version, update these files:

1. `app/app.js` — `const APP_VERSION` + `/* VERSION: */` comment
2. `app/lang.js` — `/* VERSION: */` comment
3. `app/styles.css` — `/* VERSION: */` comment
4. `app/index.html` — `<!-- VERSION: -->` comment + `?v=X.Y.Z` on `<script>`/`<link>`
5. `app/data.json` — `"_version"` field

---

## Security

- **CORS**: Restricted to `https://peace-meter.pages.dev`
- **CSP**: `default-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:`
- **HSTS**: `max-age=31536000; includeSubDomains`
- **X-Frame-Options**: DENY
- **X-Content-Type-Options**: nosniff
- **Rate Limiting**: 30 requests/minute per IP on the Worker
- **Credentials**: GCP Service Account key stored as Cloudflare secret (`GDELT_SA_KEY`), never in repo

---

## Legal

- **Privacy**: No personal data collected. No cookies. localStorage stores language preference and cached data only.
- **Terms**: Informational dashboard — not financial, political, or security advice.
- **Accessibility**: WCAG 2.1 AA compliant. Known limitations: SVG gauge for screen readers, visual-only sparklines.

Full text served in EN/HE modals from the site footer.

---

## Links

- [Report a Bug](https://github.com/ErezIsrael/peace-meter/issues)
- [Buy Me Coffee](https://ko-fi.com/erezse)
