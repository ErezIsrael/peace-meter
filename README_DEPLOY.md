# Deploying Peace Meter to Cloudflare Pages

## Option A: Cloudflare Dashboard (recommended)

1. Go to https://dash.cloudflare.com/
2. Navigate to **Workers & Pages** → **Create application** → **Pages**
3. Click **Connect to Git** → select **GitHub** → authorize
4. Select repo: **ErezIsrael/peace-meter**, branch: **main**
5. Build settings:
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Build output directory**: `app`
6. Click **Save and Deploy**

> **Important:** The `functions/` directory must be at the **repository root** (not inside `app/`). Cloudflare Pages Functions are only recognized at the repo root level.

Every push to `main` triggers an automatic deployment (within 1-2 minutes).

## Option B: CLI (requires API token)

```bash
# First time only:
wrangler login
# or set CLOUDFLARE_API_TOKEN env var

# Deploy:
npx wrangler pages dev app --compatibility-date=2026-05-20   # local test
npx wrangler pages deploy app --project-name=peace-meter      # deploy
```

## Local Development

```bash
npx wrangler pages dev app --compatibility-date=2026-05-20
```

Serves on `http://127.0.0.1:8788` with Pages Functions support.

## Directory Structure

```
peace-meter/                    ← repo root
├── functions/                  ← Pages Functions (MUST be at repo root)
│   └── data.json.js           ← /data.json endpoint (live RSS + mock signals)
├── app/                        ← build output (deployed content)
│   ├── index.html              ← main page
│   ├── app.js                  ← frontend logic
│   ├── lang.js                 ← EN/HE translations + i18n
│   ├── styles.css              ← dark theme, RTL
│   ├── data.json               ← fallback mock data
│   ├── _routes.json            ← routes /data.json to function
│   └── wrangler.toml           ← Cloudflare config
├── README_DEPLOY.md
└── LEGAL.md
```

## Live Data Pipeline

The `data.json` endpoint fetches from **6 RSS feeds** (reachable from Cloudflare edge):

| Source | URL | Type | Cap |
|--------|-----|------|-----|
| Mitvim | `mitvim.org.il/en/feed/` | thinktank | 4 |
| EcoPeace ME | `ecopeaceme.org/feed/` | thinktank | 3 |
| BBC Middle East | `feeds.bbci.co.uk/news/world/middle_east/rss.xml` | me-news | 3 |
| Al Monitor | `www.al-monitor.com/rss` | me-news | 3 |
| JNS | `www.jns.org/feed/` | media (peace only) | 2 |
| Times of Israel | `www.timesofisrael.com/feed/` | media (peace only) | 2 |

**Feed types:**
- `thinktank` — always included, higher cap (ME-focused analysis)
- `me-news` — always included, moderate cap (inherently Middle East feed)
- `media` — only included if sentiment is "peace" (general media, peace-sentiment filter)

**Freshness filter:** Only publications from the last 30 days are shown.

Articles are filtered for Middle East relevance using a two-tier keyword system (primary conflict/peace terms, secondary place names) and auto-classified (peace / war / neutral).

## RSS Feeds That Don't Work on Cloudflare Edge

These were tested but return errors, HTML, or stale content:

| Source | Issue |
|--------|-------|
| ICT | 403 Forbidden |
| ReliefWeb | 404 Not Found |
| Forward | 403 Forbidden |
| Jerusalem Post | 404 |
| Haaretz | 404 |
| Ynet | 404 / Redirect |
| Israel National News | Returns HTML, not RSS |
| i24 News | Returns HTML, not RSS |
| Middle East Eye | Returns HTML/JSON, not RSS |
| ALLMEP | RSS stale (2021-2024 content) |
| FMEP | RSS stale (2021-2024 content) |
| P4P | RSS works but stale (July 2024) |
| INSS | RSS broken (1 post from 2017) |
| ROPES | No RSS feed |
