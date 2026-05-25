# Peace Room — AI-Powered Peace Progress Tracker

Tracks progress on concrete peace initiatives in the Middle East by analyzing 29 RSS feeds through a local LLM (llama.cpp).

## Architecture

```
RSS Feeds (29 sources) → llama.cpp (localhost) → solutions.json → Cloudflare Pages
```

Two scripts exist:

| Script | Purpose | Where |
|--------|---------|-------|
| `ai-analyze.py` | Dev/test — Ollama or llama.cpp, batched AI calls, meta-analysis per solution | This machine |
| `ai-analyze-prod.py` | Production — llama.cpp only, single-prompt classification, Cloudflare Upload API | LLM server (192.168.2.121) |

**Production flow (`ai-analyze-prod.py`):**
1. Fetches 29 RSS feeds (parallel, 12 workers)
2. Filters by ME relevance keywords + recency (7 days), deduplicates
3. Sends **all** article titles to llama.cpp in **one** prompt (uses ~10-15% of 80k context)
4. Groups classified articles into 8 solution categories
5. Computes phase progress and direction from sentiment ratios (no extra AI calls)
6. Writes `solutions.json` locally + pushes to Cloudflare Pages via Upload API
7. Falls back to keyword classification if AI fails

## 8 Solution Categories

| ID | Name | Phases |
|----|------|--------|
| ceasefire | Ceasefire & De-escalation | Active Fighting → Ceasefire Talks → Draft → Signed → Holding |
| hostages | Hostage & POW Release | No Progress → Negotiations → Partial → Most Returned → All Released |
| aid | Humanitarian Aid | Blocked → Limited → Corridors Open → Steady Flow → Full Access |
| diplomacy | Diplomacy & Regional Deals | Isolated → Back-channel → Framework → New Partners → Regional Peace |
| governance | Post-War Governance | No Framework → Proposals → Consensus → Interim Gov → Sustainable |
| infrastructure | Infrastructure & Recovery | Destroyed → Emergency Repairs → Partial → Reconstruction → Full Recovery |
| iran | Iran Nuclear & War | War → Ceasefire Talks → Armistice → Nuclear Deal → Resolution |
| lebanon | Lebanon & Hezbollah | Active Fighting → De-escalation → Ceasefire → Withdrawal → Stable |

Direction (`advancing`/`stable`/`stalling`) is computed from positive/negative sentiment ratio per solution. Phase index from weighted ratio (recent events count double).

## `solutions.json` Schema

```json
{
  "solutions": [
    {
      "id": "ceasefire",
      "icon": "🕊",
      "name": "Ceasefire & De-escalation",
      "phases": ["Active Fighting", "Ceasefire Talks", "Draft Agreement", "Signed", "Holding"],
      "phaseIndex": 2,
      "direction": "advancing",
      "keyMetric": { "label": "Events (7d)", "value": "12" },
      "summary": "...",
      "confidence": "high"|"medium"|"low",
      "events": [
        { "date": "ISO", "text": "...", "sentiment": "positive"|"negative"|"neutral", "source": "...", "link": "..." }
      ]
    }
  ],
  "overallMomentum": { "direction": "...", "label": "...", "summary": "..." },
  "lastUpdated": "ISO timestamp",
  "source": "ai-analyzer-prod",
  "feedCount": 123
}
```

## Frontend

Static dashboard at `../app/peace-room/` (mirrored from this directory):
- `index.html` — layout: momentum banner, activity feed, solution card groups
- `app.js` — loads `solutions.json`, renders phase bars, sentiment dots, expandable events
- `styles.css` — dark theme

Solution cards grouped into: **Active** (ceasefire, hostages, aid), **Regional** (diplomacy, iran, lebanon), **Structural** (governance, infrastructure).

> Note: `app.js` `CATEGORIES` dict must stay in sync with `SOLUTIONS` keys.

## Running (Production)

```bash
# Deploy: copy ai-analyze-prod.py to LLM server, change LLAMA_CPP_URL to localhost:8080

# Full run (fetch + AI + write + Cloudflare upload)
python ai-analyze-prod.py

# Fetch RSS only (keyword fallback, no AI)
python ai-analyze-prod.py --fetch-only

# Preview output without writing/uploading
python ai-analyze-prod.py --dry-run

# Write locally, skip Cloudflare
python ai-analyze-prod.py --skip-upload
```

Schedule every 3 hours via cron / Task Scheduler on the LLM server.

## File Map

| File | Purpose |
|------|---------|
| `ai-analyze-prod.py` | **Production** pipeline (RSS → single AI prompt → Cloudflare) |
| `ai-analyze.py` | Dev/test pipeline (batches, meta-analysis, Ollama support) |
| `solutions.json` | Sample data (from `../app/peace-room/solutions.json`) |
| `index.html` | Dashboard HTML |
| `app.js` | Frontend rendering logic |
| `styles.css` | Dark theme styling |
| `sonnet-edited.OPML` | Original OPML feed list (62 feeds, reference) |

## Key Config

### `ai-analyze-prod.py`

| Setting | Default | Note |
|---------|---------|------|
| `LLAMA_CPP_URL` | `http://localhost:8080` | Change if not running on LLM server |
| `MAX_ARTICLES_PER_FEED` | `8` | RSS items per feed |
| `MAX_AGE_DAYS` | `7` | Only include articles from last N days |
| `CLOUDFLARE_PAGES_PROJECT` | `peace-meter` | Pages project name |
| `CLOUDFLARE_TOKEN` | env var | Set `CLOUDFLARE_API_TOKEN` |
| `CLOUDFLARE_ACCOUNT` | env var | Set `CLOUDFLARE_ACCOUNT_ID` |

### RSS Feeds (29 total)

Organized by: International ME news (9), Israel English (8), Israel Hebrew (2), Regional (2), Aggregators (1), Humanitarian/UN (2), OSINT/Think tanks (4).

## Known Gotchas

- **llama.cpp string serialization bug** — garbled `&#` patterns in source cause HTTP 500 crashes. Fixed in previous session; check for corruption before edits.
- **Single prompt limits** — all titles go in one prompt. With 8 items/×29 feeds = ~232 titles, context usage is ~10-15% of 80k. Safe up to ~500 articles.
- **RSS feeds returning HTML** are auto-skipped.
- **Date parsing** assumes ISO 8601 or RFC 2822.
- **Cloudflare Upload API** requires a Pages project and API token with `pages_edit` permissions.
