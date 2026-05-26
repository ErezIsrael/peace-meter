# Peace Room — AI-Powered Peace Progress Tracker

Fetches 29 RSS feeds → classifies via llama.cpp → writes `solutions.json` → deploys to Cloudflare Pages.

## Files

| File | Purpose |
|------|---------|
| `ai-analyze-prod.py` | **Production** — batched AI classification, Cloudflare Upload API |
| `ai-analyze.py` | Dev/test — Ollama/llama.cpp, per-solution meta-analysis |
| `solutions.json` | Sample data (mirrors `../app/peace-room/solutions.json`) |
| `index.html` / `app.js` / `styles.css` | Frontend dashboard |

## Production Script (`ai-analyze-prod.py`)

1. Fetches 29 RSS feeds (12 workers, 8 items each)
2. Filters by ME keywords, deduplicates by title
3. Sends batches of 50 titles to llama.cpp (8000 tokens each)
4. Groups into solutions, computes phase index + direction from sentiment ratios
5. Writes `../app/peace-room/solutions.json` + pushes to Cloudflare Pages

### Modes

```bash
python ai-analyze-prod.py --fast              # Hourly: last 2h, merge into existing data
python ai-analyze-prod.py --daily             # Daily: last 7d, overwrite solutions.json
python ai-analyze-prod.py                     # Default = --daily
```

### Options

```bash
--skip-upload       # Write local file, skip Cloudflare
--dry-run           # Print JSON to stdout (no file write)
--fetch-only        # Skip AI, use keyword fallback only
--categories "id:name:desc"  # Inject custom category before AI classification
```

### Custom Categories (Admin Override)

Add a new category on the fly:

```bash
python ai-analyze-prod.py --fast --categories "armistice:Ceasefire Talks:Truce negotiations"
python ai-analyze-prod.py --fast --categories "armistice:Ceasefire Talks:Truce negotiations" "refugees:Refugee Crisis:Displacement news"
```

This injects the category into the AI prompt so it can classify articles into it.
Useful when a major event emerges that needs its own category.

### Schedule

| Cron | Command |
|------|---------|
| `0 * * * *` | `python ai-analyze-prod.py --fast` |
| `0 6 * * *` | `python ai-analyze-prod.py --daily` |

## Config

| Env / Variable | Default | Note |
|---|---|---|
| `LLAMA_CPP_URL` | `http://localhost:8080` | Change if not on LLM server |
| `CLOUDFLARE_API_TOKEN` | env var | Pages upload auth |
| `CLOUDFLARE_ACCOUNT_ID` | env var | Account ID |
| `MAX_ARTICLES_PER_FEED` | 8 | Items per RSS feed |
| `MAX_AGE_DAYS` | 7 | Daily mode recency window |
| `FAST_AGE_HOURS` | 2 | Fast mode recency window |

## 12 Known Solutions

ceasefire · aid · diplomacy · governance · infrastructure · iran · lebanon · gaza-crisis · human-rights · domestic-politics · west-bank · regional

Each has 5 phases, direction (`advancing`/`stable`/`stalling`), and recent events with sentiment. AI can discover new categories dynamically.

## Frontend

Dynamic grid renders top 8 solutions by event count. No hardcoded categories.

## Gotchas

- Batches of 50 articles, 8000 tokens each (~60s total for 140 articles)
- HTML entity encoding (`&#x27;`) requires `html.unescape()` in Python
- WSL2 cannot reach Windows `localhost` — use host LAN IP
- Cloudflare Upload API needs `pages_edit` permission
