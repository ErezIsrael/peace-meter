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

Every push to `main` triggers an automatic deployment.

## Option B: CLI (requires API token)

```bash
# First time only:
wrangler login
# or set CLOUDFLARE_API_TOKEN env var

# Deploy:
cd app
npx wrangler pages deploy . --project-name=peace-meter
```

## Local Development

```bash
cd app
npx wrangler pages dev . --compatibility-date=2026-05-20
```

Serves on `http://127.0.0.1:8788` with Pages Functions support.

## Directory Structure

```
app/
├── index.html          # Main page
├── styles.css          # Styles
├── app.js              # Frontend logic
├── lang.js             # EN/HE translations + RTL support
├── data.json           # Fallback mock data (local dev)
├── _routes.json        # Routes /data.json to functions
├── wrangler.toml       # Cloudflare config
└── functions/
    └── data.json.js    # Live data: RSS feeds + mock signals
```

## Live Data Pipeline

The `data.json` endpoint fetches from 3 RSS feeds:
- **Mitvim** (`mitvim.org.il/en/feed/`) — Israeli think tank
- **ICT** (`ict.org.il/feed/`) — Counter-terrorism research
- **ReliefWeb** (`reliefweb.int/rss/news.xml`) — Humanitarian news

Articles are filtered for Middle East relevance and auto-classified (peace/war/neutral).
