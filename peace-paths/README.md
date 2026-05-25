# Peace Room — AI-Powered Peace Progress Tracker

Fetches 29 RSS feeds → classifies via llama.cpp → writes `solutions.json` → deploys to Cloudflare Pages.

## Files

| File | Purpose |
|------|---------|
| `ai-analyze-prod.py` | **Production** — single-prompt AI, Cloudflare Upload API |
| `ai-analyze.py` | Dev/test — batched AI, Ollama/llama.cpp, per-solution meta-analysis |
| `solutions.json` | Sample data (mirrors `../app/peace-room/solutions.json`) |
| `index.html` / `app.js` / `styles.css` | Frontend dashboard |

## Production Script (`ai-analyze-prod.py`)

1. Fetches 29 RSS feeds (12 workers, 8 items each, 7-day window)
2. Filters by ME keywords, deduplicates by title
3. Sends **all** titles to llama.cpp in **one** prompt (~10% of 80k context)
4. Groups into 8 solutions, computes phase index + direction from sentiment ratios
5. Writes `../app/peace-room/solutions.json` + pushes to Cloudflare Pages

```bash
python ai-analyze-prod.py            # full run + upload
python ai-analyze-prod.py --dry-run  # preview JSON to stdout
python ai-analyze-prod.py --skip-upload
python ai-analyze-prod.py --fetch-only   # keyword fallback only
```

## Config

| Env / Variable | Default | Note |
|---|---|---|
| `LLAMA_CPP_URL` | `http://localhost:8080` | Change if not on LLM server |
| `CLOUDFLARE_API_TOKEN` | env var | Pages upload auth |
| `CLOUDFLARE_ACCOUNT_ID` | env var | Account ID |
| `MAX_ARTICLES_PER_FEED` | 8 | Items per RSS feed |
| `MAX_AGE_DAYS` | 7 | Recency window |

## 8 Solutions

ceasefire · hostages · aid · diplomacy · governance · infrastructure · iran · lebanon

Each has 5 phases, direction (`advancing`/`stable`/`stalling`), and recent events with sentiment.

## Frontend

Cards grouped: **Active** (ceasefire, hostages, aid) / **Regional** (diplomacy, iran, lebanon) / **Structural** (governance, infrastructure). `app.js` `CATEGORIES` dict must match `SOLUTIONS` keys.

## Gotchas

- Garbled `&#` patterns in source cause llama.cpp HTTP 500 (fixed in session 1)
- Single prompt is safe up to ~500 article titles
- HTML responses from feeds are auto-skipped
- Cloudflare Upload API needs `pages_edit` permission
