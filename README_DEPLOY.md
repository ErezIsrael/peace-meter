# Deploying Peace Meter to Cloudflare Pages

## ⚠️ Critical: Always use `--skip-caching`

Cloudflare Pages caches file hashes and skips re-uploading unchanged files. This causes old versions to persist even after Git pushes.

```bash
npx wrangler pages deploy app --project-name=peace-meter --skip-caching
```

**Always use `--skip-caching`** to force a full re-upload of all assets.

## Option A: Cloudflare Dashboard (Git integration)

1. Go to https://dash.cloudflare.com/
2. Navigate to **Workers & Pages** → **Create application** → **Pages**
3. Click **Connect to Git** → select **GitHub** → authorize
4. Select repo: **ErezIsrael/peace-meter**, branch: **main**
5. Build settings:
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Build output directory**: `app`
6. Click **Save and Deploy**

> **Important:** The `functions/` and `_routes.json` must be at the **repository root** (not inside `app/`). Cloudflare Pages only recognizes these at the repo root level.
> **Important:** `wrangler.toml` must be at the **repository root** with `pages_build_output_dir = "app"` for Cloudflare to find the config.

Every push to `main` triggers an automatic deployment (within 1-2 minutes).

> **Note:** Git-triggered deployments may reuse cached file hashes. If the site shows an old version, deploy via CLI (Option B) with `--skip-caching`.

## Option B: CLI (recommended for reliability)

```bash
# Set API token:
export CLOUDFLARE_API_TOKEN="your_token_here"

# Deploy (forces full upload):
npx wrangler pages deploy app --project-name=peace-meter --skip-caching
```

## Local Development

```bash
npx wrangler pages dev app --compatibility-date=2026-05-20
```

Serves on `http://127.0.0.1:8788` with Pages Functions support.

## Directory Structure

```
peace-meter/                    ← repo root
├── wrangler.toml               ← Cloudflare config (MUST be at root)
├── _routes.json                ← route /data.json to function (MUST be at root)
├── functions/                  ← Pages Functions (MUST be at repo root)
│   └── data.json.js           ← /data.json endpoint (GDELT + RSS + signals)
├── app/                        ← build output (deployed content)
│   ├── index.html              ← main page
│   ├── app.js                  ← frontend logic
│   ├── lang.js                 ← EN/HE translations + i18n
│   ├── styles.css              ← dark theme, RTL
│   └── data.json               ← fallback mock data
├── README_DEPLOY.md
└── LEGAL.md
```

## Version Bumping Protocol

When bumping the version, update these files:

1. `app/app.js` — `const APP_VERSION` + `/* VERSION: */` comment
2. `app/lang.js` — `/* VERSION: */` comment
3. `app/styles.css` — `/* VERSION: */` comment
4. `app/index.html` — `<!-- VERSION: -->` comment + `?v=X.Y.Z` query strings on `<script>` and `<link>` tags
5. `app/data.json` — `"_version"` field

This ensures file hashes change on every version bump and browser cache is busted.

## Live Data Pipeline

The `data.json` endpoint fetches from **GDELT 2.0 Event Database** (primary) and **6 RSS feeds** (fallback + publications):

### GDELT Integration (v2.0.0+)
- **Political Tone**: Goldstein Scale (-10 to +10) per event, mapped to 0–100
- **Diplomatic News**: CAMEO diplomatic event ratio, quadratic scoring
- Falls back to RSS-based mock data when GDELT unavailable

### RSS Feeds (reachable from Cloudflare edge):

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
