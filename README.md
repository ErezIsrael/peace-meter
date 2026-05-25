# ☮️ Peace Meter v2.11.1

Real-time dashboard measuring "temperature of peace" across the Middle East using 12 signals.

[Live site](https://peace-meter.pages.dev) · [Source](https://github.com/ErezIsrael/peace-meter)

---

## Architecture

```
GDELT BigQuery → GDELT Proxy Worker → Pages Function → Static Frontend
```

- **Worker** (`gdelt-proxy/`): JWT-authenticated BigQuery SQL + 29 RSS feeds → 12 signals + master + pairs. KV cache (60 min TTL).
- **Pages Function** (`functions/data.json.js`): Thin proxy → Worker `/data`.
- **Frontend** (`app/`): Static HTML/JS/CSS. Gauge, signals, pairs, map, i18n (EN/HE).

**Why a Worker?** Cloudflare can't reach `data.gdeltproject.org` (Google Cloud egress restriction). Cost: ~$0/month.

---

## Project Structure

```
peace-meter/
├── wrangler.toml            # Cloudflare config (MUST be at root)
├── _routes.json             # Routes /data.json → Pages Function
├── functions/
│   └── data.json.js         # Thin proxy to Worker
├── app/                     # Deployed frontend
│   ├── index.html
│   ├── app.js               # Frontend logic, SVG rendering
│   ├── lang.js              # EN/HE translations, signal metadata, footer link map
│   ├── styles.css
│   ├── data.json            # Fallback mock data
│   ├── me_map.svg
│   ├── fonts/               # Self-hosted fonts (Inter, Space Grotesk)
│   ├── _headers             # CSP, HSTS, etc.
│   └── peace-room/          # Curated peace-building solutions sub-page
├── gdelt-proxy/             # GDELT BigQuery Proxy Worker
│   ├── index.js             # Worker — GDELT + RSS + signals + pairs
│   ├── jwt-client.js        # JWT auth for BigQuery
│   └── wrangler.toml
└── LICENSE
```

---

## Key Details

| Item | Value |
|------|-------|
| BigQuery table | `gdelt-bq.gdeltv2.events_partitioned` (1-day window) |
| RSS feeds | 29 sources (see `RSS_FEEDS` in `gdelt-proxy/index.js`) |
| RSS types | `thinktank` (all items), `me-news` (all items), `media` (peace-sentiment only) |
| Signals | 12 independent, weighted. See `SIGNAL_WEIGHTS` in `gdelt-proxy/index.js` |
| Pairs | Israel-Palestine, Israel-Lebanon, Red Sea/Yemen, Israel-Iran, USA-Iran, Abraham Accords |
| Formula | `Σ(signal × weight)` + asymmetric EMA (3h rise / 12h decay) + volatility multiplier (up to 1.5×), clamped 0–100 |
| KV namespaces | `PEACE_CACHE` (60 min), `RATE_LIMIT` (30 req/min/IP), `GDELT_CACHE` |
| Worker secret | `GDELT_SA_KEY` (Google Service Account key) |

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

```bash
# Frontend
npx wrangler pages deploy app --project-name=peace-meter --skip-caching

# Backend Worker
cd gdelt-proxy && npx wrangler deploy --project-name=gdelt-proxy
```

> Always use `--skip-caching` — Cloudflare caches file hashes.
>
> `functions/` and `_routes.json` must be at repo root (not inside `app/`).

---

## Version Bumping

Update on each release:

1. `app/app.js` — `APP_VERSION` + `/* VERSION: */`
2. `app/lang.js` — `/* VERSION: */`
3. `app/styles.css` — `/* VERSION: */`
4. `app/index.html` — `<!-- VERSION: -->` + `?v=X.Y.Z` on `<script>`/`<link>`
5. `app/data.json` — `"_version"`

---

## i18n Notes

`lang.js` drives all translations including footer links. When adding a new footer link:

1. Add `<a href="..." class="footer-link">Text</a>` to `index.html` footer
2. Add the `href` → text mapping to both EN and HE `linkMap` in `lang.js`
3. Unknown hrefs fall back to `el.textContent` (won't blank out)

---

## Debug Checklist

1. **Frontend broken?** Check console errors, verify `/data.json` returns valid JSON.
2. **Link text blank?** Check `linkMap` in `lang.js` — every footer link href must have an entry.
3. **Worker broken?** Verify `GDELT_SA_KEY` secret, check JWT expiry in `jwt-client.js`.
4. **Stale data?** KV TTL is 60 min — check `PEACE_CACHE` in Cloudflare Dashboard.
5. **Deploy issues?** Use `--skip-caching`. Verify `_routes.json` routes `/data.json`.
6. **BigQuery quota?** ~0.3–0.6 TB/month. Free tier = 1 TB/month — monitor in GCP Console.
