# ☮️ Peace Meter

A real-time, open-source dashboard measuring the "temperature of peace" across the Middle East using **10 independent signals**.

[Live site](https://peace-meter.pages.dev) · [Source](https://github.com/ErezIsrael/peace-meter)

## What It Tracks

| # | Signal | Weight | Sources |
|---|--------|--------|---------|
| 1 | 🤝 Political Tone | 20% | GDELT 2.0 Event Database (RSS fallback) |
| 2 | 📰 Diplomatic News | 15% | GDELT 2.0 CAMEO diplomatic events (RSS fallback) |
| 3 | ✈️ Commercial Aviation | 12% | OpenSky + airline press releases |
| 4 | 💰 Prediction Markets | 10% | Polymarket API |
| 5 | 🏛 Credit Ratings | 10% | Fitch, S&P, Moody's |
| 6 | 🛂 Travel Advisories | 10% | US State Dept, UK FCDO, Canada, Israel |
| 7 | 🧠 Think Tank & Expert | 10% | Mitvim, EcoPeace ME RSS |
| 8 | 💥 Conflict Events | 8% | GDELT 2.0 Event Database (RSS fallback) |
| 9 | 🌍 VIEWS AI Forecast | 5% | PRIO/Uppsala HDX API |
| 10 | 🏥 Humanitarian | 1% | UN OCHA, ReliefWeb RSS |

## Peace Levels

| Score | Level | Meaning |
|-------|-------|---------|
| 0–25 | ❄️ Frozen | Active conflict, no diplomacy |
| 26–50 | 🌤 Thawing | Back-channel talks |
| 51–75 | 🌱 Growing | Active negotiations |
| 76–100 | 🕊 Flourishing | Peace agreements |

## Features

- **Zero-dependency frontend** — Vanilla JS, HTML, CSS. Charts are inline SVG.
- **GDELT integration** — Political Tone and Diplomatic News use GDELT 2.0 Event Database (free, no API key). Falls back to RSS when unavailable.
- **EN / HE bilingual** — Full Hebrew translation with RTL layout. Use `?lang=he` in URL to force Hebrew.
- **Cloudflare Pages Functions** — Live RSS parsing at the edge (Mitvim, EcoPeace ME, BBC, Al Monitor, JNS, Times of Israel).
- **Error resilience** — 3-attempt retry, localStorage cache fallback, stale-data auto-refresh.
- **Accessibility** — Semantic HTML, keyboard navigation, screen reader support, WCAG AA contrast.
- **Legal compliance** — Privacy Policy, Terms of Service, Accessibility Statement (EN/HE modals).
- **Cache-safe deployment** — Version query strings on JS/CSS assets prevent stale browser cache.

## Local Development

```bash
npx wrangler pages dev app --compatibility-date=2026-05-20
```

Open `http://127.0.0.1:8788` in your browser.

## Deploy to Cloudflare Pages

See [README_DEPLOY.md](README_DEPLOY.md) for step-by-step instructions.

> **Important:** Always deploy with `--skip-caching` to force full asset upload:
> ```bash
> npx wrangler pages deploy app --project-name=peace-meter --skip-caching
> ```

## Project Structure

```
peace-meter/                    ← repo root
├── wrangler.toml               ← Cloudflare config (MUST be at root)
├── _routes.json                ← route /data.json to function (MUST be at root)
├── functions/                  ← Cloudflare Pages Functions
│   └── data.json.js           ← /data.json endpoint (GDELT + RSS + signals)
├── app/                        ← static files (build output)
│   ├── index.html              ← main page (version query on script tags)
│   ├── app.js                  ← frontend logic, SVG rendering, retry/cache
│   ├── lang.js                 ← EN/HE translations + i18n manager
│   ├── styles.css              ← dark theme, RTL, accessibility
│   └── data.json               ← fallback mock data
├── CONCEPT.md                  ← design document (10 signals, scoring)
├── LEGAL.md                    ← source text for Privacy / Terms / Accessibility
├── README_DEPLOY.md            ← deployment guide
├── METHODOLOGY_IMPROVEMENTS.md ← v4 proposal (GDELT, ACLED, per-pair)
├── IMPLEMENTATION_PLAN_V4.md   ← phased v4 implementation plan
└── LICENSE
```

- **Frontend:** Vanilla JS + HTML + CSS (no frameworks, no dependencies)
- **Charts:** Pure inline SVG (no Chart.js)
- **Backend:** Cloudflare Pages Functions (edge-computed)
- **Deployment:** Cloudflare Pages (free tier)

## Links

- [Report a Bug](https://github.com/ErezIsrael/peace-meter/issues)
- [Buy Me Coffee](https://ko-fi.com/erezse)
