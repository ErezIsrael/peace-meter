# ☮️ Peace Meter

A real-time dashboard measuring the "temperature of peace" across the Middle East using 8 independent signals.

## What It Tracks

| Signal | Source | Weight |
|--------|--------|--------|
| 📰 Diplomatic News | BBC + Al Jazeera RSS | 20% |
| 🧠 Think Tank & Expert | Mitvim, INSS, JISS RSS | 20% |
| ✈️ Civil Aviation | OpenSky Network API | 15% |
| 💰 Prediction Markets | Polymarket API | 12% |
| 🚢 Gulf Shipping | RSS keyword analysis | 10% |
| 🤝 Political Tone | BBC + Al Jazeera RSS | 10% |
| 🌍 VIEWS AI Forecast | PRIO/Uppsala HDX API | 8% |
| 🏥 Humanitarian | UN OCHA, ReliefWeb RSS | 5% |

## Peace Levels

| Score | Level | Meaning |
|-------|-------|---------|
| 0–25 | ❄️ Frozen | Active conflict, no diplomacy |
| 26–50 | 🌤 Thawing | Back-channel talks |
| 51–75 | 🌱 Growing | Active negotiations |
| 76–100 | 🕊 Flourishing | Peace agreements |

## Local Development

```bash
cd app
npx wrangler pages dev .
```

Then open `http://localhost:8788/` in your browser.

## Deploy to Cloudflare Pages

See [README_DEPLOY.md](README_DEPLOY.md) for step-by-step instructions.

## Project Structure

```
app/
├── index.html          # Main page
├── styles.css          # Dark theme styles
├── app.js              # Frontend (zero dependencies)
├── data.json           # Mock data (fallback)
├── _routes.json        # Cloudflare routing config
├── wrangler.toml       # Cloudflare config
├── functions/
│   └── __data.js       # Data endpoint (mock → real)
├── CONCEPT.md          # Design document
└── README_DEPLOY.md    # Deployment guide
```

## Tech

- **Frontend:** Vanilla JS + HTML + CSS (no frameworks, no dependencies)
- **Charts:** Pure inline SVG (no Chart.js)
- **Backend:** Cloudflare Pages Functions (edge-computed)
- **Deployment:** Cloudflare Pages (free tier)
