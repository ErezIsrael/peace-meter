# ☮️ Peace Meter v2.11.0

Real-time dashboard measuring "temperature of peace" across the Middle East using 12 independent signals.

[Live site](https://peace-meter.pages.dev) · [Source](https://github.com/ErezIsrael/peace-meter)

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

**Why a separate Worker?** Cloudflare cannot reach `data.gdeltproject.org` (Google Cloud egress restriction). Worker authenticates via Google Service Account JWT, runs SQL against `gdelt-bq.gdeltv2.events_partitioned` (1-day window), fetches 6 RSS feeds, computes all signals, and caches in KV (60 min TTL).

**Cost: ~$0/month** — Workers: 100K req/day free, KV: included, BigQuery: ~0.3–0.6 TB/month (under 1 TB free tier).

---

## Project Structure

```
peace-meter/
├── wrangler.toml          # Cloudflare config (MUST be at root)
├── _routes.json           # Routes /data.json to Pages Function
├── functions/
│   └── data.json.js       # Pages Function — thin proxy to Worker
├── app/                   # Static frontend (deployed content)
│   ├── index.html
│   ├── app.js             # Frontend logic, SVG rendering, i18n
│   ├── lang.js            # EN/HE translations, signal metadata, legal modals
│   ├── styles.css
│   ├── data.json          # Fallback mock data
│   ├── me_map.svg
│   ├── fonts/             # Self-hosted fonts (Inter & Space Grotesk)
│   ├── _headers           # Security headers
│   └── _routes.json
├── gdelt-proxy/           # GDELT BigQuery Proxy Worker
│   ├── index.js           # Worker code — GDELT + RSS + signals + pairs
│   ├── jwt-client.js      # JWT auth for BigQuery
│   └── wrangler.toml
└── LICENSE
```

---

## Signal Weights

| Signal | Weight | Source |
|--------|--------|--------|
| Political Tone | 18% | GDELT BigQuery (Goldstein) |
| Diplomatic News | 14% | GDELT BigQuery (CAMEO) |
| Commercial Aviation | 11% | GDELT-derived |
| Prediction Markets | 10% | Polymarket API |
| Credit Ratings | 9% | GDELT-derived |
| Travel Advisories | 9% | GDELT-derived |
| Think Tank & Expert | 9% | RSS (Mitvim, EcoPeace) |
| Conflict Events | 8% | GDELT BigQuery |
| VIEWS AI Forecast | 5% | GDELT-derived |
| Normalization | 4% | Curated events |
| Economic | 3% | Curated events |
| Humanitarian | 1% | GDELT-derived |

**Formula:** `Score = Σ(signal_i × weight_i)` with asymmetric EMA (3h rise / 12h decay) + volatility multiplier (up to 1.5×). Clamped 0–100.

**Per-pair scores:** Israel-Palestine, Israel-Lebanon, Red Sea/Yemen, Israel-Iran, USA-Iran, Abraham Accords.

---

## RSS Feeds (29 sources)

### Think Tanks & Research
| Source | URL | Cap |
|--------|-----|-----|
| Mitvim | `mitvim.org.il/en/feed/` | 4 |
| EcoPeace ME | `ecopeaceme.org/feed/` | 3 |
| Crisis Group | `crisisgroup.org/rss/91` | 2 |
| Alma | `israel-alma.org/feed/` | 3 |

### Middle East News
| Source | URL | Cap |
|--------|-----|-----|
| BBC ME | `feeds.bbci.co.uk/news/world/middle_east/rss.xml` | 3 |
| Al Jazeera | `aljazeera.com/xml/rss/all.xml` | 3 |
| Guardian | `theguardian.com/world/israel/rss` | 3 |
| NYT ME | `rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml` | 3 |
| Al Monitor | `al-monitor.com/rss` | 3 |
| ME Monitor | `middleeastmonitor.com/feed/` | 3 |
| France24 | `france24.com/en/middle-east/rss` | 3 |
| Middle East Eye | `middleeasteye.net/rss` | 3 |
| ME News | `menews247.com/feed/` | 3 |
| Al Bawaba | `albawaba.com/rss/all` | 3 |
| UN News | `news.un.org/feed/subscribe/en/news/region/middle-east/...` | 2 |

### General Media / Broader Coverage
| Source | URL | Cap |
|--------|-----|-----|
| Foreign Policy | `foreignpolicy.com/feed/` | 2 |
| Times of Israel | `timesofisrael.com/feed/` | 2 |
| Haaretz (latest) | `haaretz.com/srv/haaretz-latest-headlines` | 2 |
| Haaretz ME | `haaretz.com/srv/middle-east-news-rss` | 2 |
| Haaretz Domestic | `haaretz.com/srv/israel-news-rss` | 2 |
| JPost | `rss.jpost.com/rss/rssfeedsfrontpage.aspx` | 2 |
| Arutz Sheva | `israelnationalnews.com/Rss.aspx?act=.1` | 2 |
| JNS | `jns.org/feed/` | 2 |
| JFeed | `a.jfeed.com/v1/rss/articles/latest/rss2` | 2 |
| The Forward | `forward.com/rss/` | 2 |
| Maariv | `maariv.co.il/Rss/RssChadashot` | 2 |
| Walla | `rss.walla.co.il/feed/1` | 2 |
| Amnesty | `amnesty.org/en/location/middle-east-and-north-africa/feed/` | 2 |
| Bellingcat | `bellingcat.com/feed/` | 2 |
| Google News Israel | `news.google.com/rss/search?hl=en-US&gl=US&q=israel&...` | 2 |

---

## Local Development

```bash
# Frontend (with Pages Functions)
npx wrangler pages dev app --compatibility-date=2026-05-20
# → http://127.0.0.1:8788

# GDELT Proxy Worker
cd gdelt-proxy && npx wrangler dev --compatibility-date=2026-05-20
```

---

## Deploying

### Frontend

```bash
npx wrangler pages deploy app --project-name=peace-meter --skip-caching
```

**Always use `--skip-caching`** — Cloudflare caches file hashes and may skip re-uploading.

### Backend (Worker)

```bash
cd gdelt-proxy && npx wrangler deploy --project-name=gdelt-proxy
```

### Git-Triggered

Connect GitHub repo `ErezIsrael/peace-meter` (branch `main`) in Cloudflare Dashboard. Framework preset: **None**. Build output: `app`.

> `functions/` and `_routes.json` must be at repository root (not inside `app/`).

---

## Required Secrets & KV

### Worker Secrets

| Secret | Set Via |
|--------|---------|
| `GDELT_SA_KEY` | `cd gdelt-proxy && npx wrangler secret put GDELT_SA_KEY` |

### KV Namespaces

| Binding | Purpose |
|---------|---------|
| `PEACE_CACHE` | Full `/data` payload (60 min TTL) |
| `RATE_LIMIT` | Sliding-window rate limiting (30 req/min/IP) |
| `GDELT_CACHE` | BigQuery auth token + metrics (60 min TTL) |

---

## Version Bumping

Update these files on each release:

1. `app/app.js` — `const APP_VERSION` + `/* VERSION: */` comment
2. `app/lang.js` — `/* VERSION: */` comment
3. `app/styles.css` — `/* VERSION: */` comment
4. `app/index.html` — `<!-- VERSION: -->` comment + `?v=X.Y.Z` on `<script>`/`<link>`
5. `app/data.json` — `"_version"` field

---

## Security Headers (_headers)

```
CSP: default-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:
HSTS: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Rate Limiting: 30 req/min/IP
```

---

## Debug Checklist

1. **Frontend broken?** Check `app.js` console errors, verify `/data.json` returns valid JSON.
2. **Worker broken?** Check `gdelt-proxy/index.js`, verify `GDELT_SA_KEY` secret is set, check BigQuery token expiry in `jwt-client.js`.
3. **Stale data?** KV TTL is 60 min — check `PEACE_CACHE` namespace in Cloudflare Dashboard.
4. **Deploy issues?** Always use `--skip-caching` for Pages. Verify `_routes.json` at repo root routes `/data.json` to `functions/data.json.js`.
5. **BigQuery quota?** ~0.3–0.6 TB/month — monitor in GCP Console. Free tier = 1 TB/month.

---

## Links

- [Report a Bug](https://github.com/ErezIsrael/peace-meter/issues)
