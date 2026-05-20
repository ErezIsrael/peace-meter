# Deploying Peace Meter to Cloudflare Pages

## Prerequisites

1. Install Wrangler CLI:
   ```
   npm install -g wrangler
   ```

2. Log in to Cloudflare:
   ```
   cd app
   wrangler login
   ```

## Deploy

```bash
cd app
npx wrangler pages deploy . --project-name=peace-meter
```

This deploys the entire `app/` directory. Cloudflare Pages will:
- Serve `index.html` as the root page
- Route `/data.json` through `functions/__data.js`
- Cache the data endpoint for 2 minutes

## Local Development

```bash
cd app
npx wrangler pages dev .
```

This starts a local server that simulates Cloudflare's environment, including Pages Functions.

## Directory Structure

```
app/
├── index.html          # Main page
├── styles.css          # Styles
├── app.js              # Frontend logic
├── _routes.json        # Routes /data.json to functions
├── wrangler.toml       # Cloudflare config
├── functions/
│   └── __data.js       # Data endpoint (mock → real data)
└── data.json           # Fallback mock data (local dev only)
```

## Updating the Data Pipeline

When ready to connect real data sources:
1. Edit `functions/__data.js` — replace the `getData()` function
2. Add RSS parsing (Mitvim, INSS, JISS)
3. Add OpenSky API queries for aviation
4. Add Polymarket API for prediction markets
5. Add VIEWS data fetching from HDX
6. Re-deploy with `wrangler pages deploy`
