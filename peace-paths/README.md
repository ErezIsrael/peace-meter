# Peace Room — AI-Powered Peace Progress Tracker

Fetches 29 RSS feeds → classifies via llama.cpp → writes `solutions.json` → deploys to Cloudflare Pages.

## Files

| File | Purpose |
|------|---------|
| `ai-analyze-prod.py` | **Production** — batched AI classification, Cloudflare Upload API |
| `ai-analyze.py` | Dev/test — Ollama/llama.cpp, per-solution meta-analysis |
| `solutions.json` | Sample data (mirrors `../app/peace-room/solutions.json`) |
| `taxonomy.json` | AI-proposed taxonomy (local, not committed) |
| `taxonomy-admin/` | Web UI for editing categories before deploy |
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
--review-taxonomy   # Phase 1: ask AI to propose taxonomy, save to taxonomy.json
--use-taxonomy FILE # Phase 2: use approved taxonomy file for classification
```

### Custom Categories (CLI Override)

Add a new category on the fly:

```bash
python ai-analyze-prod.py --fast --categories "armistice:Ceasefire Talks:Truce negotiations"
```

This injects the category into the AI prompt so it can classify articles into it.
For persistent changes, use the Taxonomy Admin UI instead.

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

## 11 Known Solutions

ceasefire · diplomacy · governance · infrastructure · iran · lebanon · gaza-crisis · human-rights · domestic-politics · west-bank · regional

Each has 5 phases, direction (`advancing`/`stable`/`stalling`), and recent events with sentiment. AI can discover new categories dynamically.

## Taxonomy Admin

Web UI to review, edit, and deploy AI classification categories.

```bash
cd taxonomy-admin
python server.py
# → http://localhost:8777
```

**Workflow:**
1. Open `http://localhost:8777` in your browser
2. Load `taxonomy.json` (AI-proposed) or defaults
3. Click **Load Articles** to see article counts per category
4. Edit category names, descriptions, icons, phases — or delete/add categories
5. Click **Save** to write `taxonomy.json`
6. Click **Deploy** to re-classify all articles with new taxonomy and upload to Cloudflare

**When categories change (added/removed):** A full `--daily` re-classification runs automatically. All articles are re-classified with the new taxonomy.

**When only icon/name/description changed:** No re-classification needed — just save and deploy.

**How deleted categories are handled:** Articles previously assigned to a deleted category are re-classified during deploy. The AI assigns them to the best matching remaining category or drops them if irrelevant.

**How added categories work:** The AI can now classify articles into the new category on the next deploy.

## Dynamic Taxonomy Workflow

```bash
# Phase 1: Ask AI to propose categories from current articles
python ai-analyze-prod.py --review-taxonomy
# → Saves taxonomy.json with proposed categories

# Edit taxonomy.json (or use the Taxonomy Admin UI)

# Phase 2: Classify using approved taxonomy
python ai-analyze-prod.py --use-taxonomy taxonomy.json --daily
```

## Frontend

Dynamic grid renders top 8 solutions by event count. No hardcoded categories.

## Gotchas

- Batches of 50 articles, 8000 tokens each (~60s total for 140 articles)
- HTML entity encoding (`&#x27;`) requires `html.unescape()` in Python
- WSL2 cannot reach Windows `localhost` — use host LAN IP
- Cloudflare Upload API needs `pages_edit` permission
