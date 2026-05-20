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
│   ├── index.html
│   ├── app.js
│   ├── lang.js                ← EN/HE translations + RTL
│   ├── styles.css
│   ├── _routes.json           ← routes /data.json to functions
│   └── wrangler.toml
├── README_DEPLOY.md
└── LEGAL.md
```

## Live Data Pipeline

The `data.json` endpoint fetches from 3 RSS feeds:
- **Mitvim** (`mitvim.org.il/en/feed/`) — Israeli think tank
- **ICT** (`ict.org.il/feed/`) — Counter-terrorism research  
- **ReliefWeb** (`reliefweb.int/rss/news.xml`) — Humanitarian news

Articles are filtered for Middle East relevance and auto-classified (peace/war/neutral).
