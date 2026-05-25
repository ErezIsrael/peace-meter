#!/usr/bin/env python3
"""
Peace Room AI Analyzer — Production
====================================
Runs on the LLM server (192.168.2.121:8080).
1. Fetches RSS feeds
2. Sends ALL article titles to local llama.cpp in ONE prompt
3. Classifies + rates each article
4. Builds solutions.json with phase progress, direction, risks
5. Pushes to Cloudflare Pages via Workers API

Run: python ai-analyze-prod.py
Schedule: every 3 hours via cron / Task Scheduler
"""

import json
import sys
import os
import re
import time
import hashlib
import concurrent.futures
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.request import urlopen, Request
from urllib.error import URLError

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# ─── Configuration ───────────────────────────────────────────────────

LLAMA_CPP_URL = "http://localhost:8080"  # change if running elsewhere
LLAMA_API_KEY = os.getenv("LLAMA_API_KEY", "")  # optional

CLOUDFLARE_PAGES_PROJECT = "peace-meter"
CLOUDFLARE_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")

# Output — write to local file, then push to Cloudflare
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "peace-room")
DATA_FILE = os.path.join(DATA_DIR, "solutions.json")

MAX_ARTICLES_PER_FEED = 8
MAX_AGE_DAYS = 7

# ─── RSS Feeds ──────────────────────────────────────────────────────

RSS_FEEDS = [
    # ── International ME news ──────────────────────────────────
    ("BBC ME", "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml"),
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
    ("Guardian", "https://www.theguardian.com/world/israel/rss"),
    ("NYT ME", "https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml"),
    ("Al Monitor", "https://www.al-monitor.com/rss"),
    ("ME Monitor", "https://www.middleeastmonitor.com/feed/"),
    ("France24", "https://www.france24.com/en/middle-east/rss"),
    ("Middle East Eye", "https://www.middleeasteye.net/rss"),
    ("Foreign Policy", "https://foreignpolicy.com/feed/"),
    # ── Israel-focused (English) ───────────────────────────────
    ("Times of Israel", "https://www.timesofisrael.com/feed/"),
    ("Haaretz", "https://www.haaretz.com/srv/haaretz-latest-headlines"),
    ("Haaretz - ME", "https://www.haaretz.com/srv/middle-east-news-rss"),
    ("Haaretz - Domestic", "https://www.haaretz.com/srv/israel-news-rss"),
    ("JPost", "https://rss.jpost.com/rss/rssfeedsfrontpage.aspx"),
    ("Arutz Sheva", "https://www.israelnationalnews.com/Rss.aspx?act=.1"),
    ("JNS", "https://www.jns.org/feed/"),
    ("JFeed", "https://a.jfeed.com/v1/rss/articles/latest/rss2"),
    ("The Forward", "https://forward.com/rss/"),
    # ── Israel-focused (Hebrew — parsed by title keywords) ─────
    ("Maariv", "https://www.maariv.co.il/Rss/RssChadashot"),
    ("Walla", "https://rss.walla.co.il/feed/1"),
    # ── Regional / Arab world ──────────────────────────────────
    ("Al Bawaba", "https://www.albawaba.com/rss/all"),
    ("ME News", "https://menews247.com/feed/"),
    # ── Aggregators ────────────────────────────────────────────
    ("Google News Israel", "https://news.google.com/rss/search?hl=en-US&gl=US&q=israel&um=1&ie=UTF-8&ceid=US:en"),
    # ── Humanitarian / UN ──────────────────────────────────────
    ("UN News", "https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml"),
    ("Amnesty", "https://www.amnesty.org/en/location/middle-east-and-north-africa/feed/"),
    # ── OSINT / Think tanks ────────────────────────────────────
    ("Crisis Group", "https://www.crisisgroup.org/rss/91"),
    ("bellingcat", "https://www.bellingcat.com/feed/"),
    ("Mitvim", "https://mitvim.org.il/en/feed/"),
    ("Alma", "https://israel-alma.org/feed/"),
]

# ─── Solution Definitions ───────────────────────────────────────────

SOLUTIONS = {
    "ceasefire": {
        "icon": "\U0001f54a", "name": "Ceasefire & De-escalation",
        "phases": ["Active Fighting", "Ceasefire Talks", "Draft Agreement", "Signed", "Holding"],
        "description": "Ceasefire negotiations, de-escalation efforts, truce agreements across all conflict zones",
    },
    "hostages": {
        "icon": "\U0001f465", "name": "Hostage & POW Release",
        "phases": ["No Progress", "Negotiations", "Partial Release", "Most Returned", "All Released"],
        "description": "Hostage releases, prisoner exchanges, detainee releases, captives",
    },
    "aid": {
        "icon": "\U0001f69a", "name": "Humanitarian Aid",
        "phases": ["Blocked", "Limited Access", "Corridors Open", "Steady Flow", "Full Access"],
        "description": "Humanitarian aid delivery, relief supplies, food/water/medicine access, crossing operations",
    },
    "diplomacy": {
        "icon": "\U0001f91d", "name": "Diplomacy & Regional Deals",
        "phases": ["Isolated", "Back-channel", "Framework", "New Partners", "Regional Peace"],
        "description": "Diplomatic normalization, Abraham Accords expansion, peace deals, regional cooperation",
    },
    "governance": {
        "icon": "\U0001f3db", "name": "Post-War Governance",
        "phases": ["No Framework", "Proposals", "Consensus", "Interim Gov", "Sustainable"],
        "description": "Post-war governance plans, Palestinian Authority reform, transitional authority, political frameworks",
    },
    "infrastructure": {
        "icon": "\U0001f4a7", "name": "Infrastructure & Recovery",
        "phases": ["Destroyed", "Emergency Repairs", "Partial", "Reconstruction", "Full Recovery"],
        "description": "Infrastructure reconstruction, power/water/hospitals rebuilding, recovery efforts",
    },
    "iran": {
        "icon": "\u2623\ufe0f", "name": "Iran Nuclear & War",
        "phases": ["War", "Ceasefire Talks", "Armistice", "Nuclear Deal", "Resolution"],
        "description": "Iran-US conflict, nuclear program, Strait of Hormuz, Iran peace negotiations",
    },
    "lebanon": {
        "icon": "\U0001f1f1\U0001f1e7", "name": "Lebanon & Hezbollah",
        "phases": ["Active Fighting", "De-escalation", "Ceasefire", "Withdrawal", "Stable"],
        "description": "Lebanon conflict, Hezbollah-Israel hostilities, southern Lebanon situation",
    },
}

SOLUTION_IDS = list(SOLUTIONS.keys())

# ═══════════════════════════════════════════════════════════════════════
# RSS Fetching & Parsing
# ═══════════════════════════════════════════════════════════════════════

def fetch_rss(url, source, max_items):
    """Fetch and parse RSS feed using regex."""
    try:
        req = Request(url, headers={"User-Agent": "PeaceMeter/1.0"})
        with urlopen(req, timeout=10) as f:
            xml = f.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  \u26a0 {source}: {e}")
        return []

    if "<html" in xml[:200] or "<!DOCTYPE html" in xml[:200]:
        return []

    item_blocks = re.findall(r"<item>(.*?)</item>", xml, re.DOTALL)
    articles = []
    for block in item_blocks[:max_items]:
        title_m = re.search(r"<title>(.*?)</title>", block, re.DOTALL)
        link_m = re.search(r"<link>(.*?)</link>", block, re.DOTALL)
        date_m = re.search(r"<pubDate>(.*?)</pubDate>", block, re.DOTALL)

        if not title_m:
            continue

        title = title_m.group(1).strip()
        title = title.replace("<![CDATA[", "").replace("]]>", "")
        title = re.sub(r"&\w+;|&#\d+;", "", title)
        title = re.sub(r"<[^>]+>", "", title)

        link = link_m.group(1).strip() if link_m else ""
        date_str = date_m.group(1).strip() if date_m else datetime.now(timezone.utc).isoformat()
        if "GMT" in date_str or "UTC" in date_str:
            try:
                dt = parsedate_to_datetime(date_str)
                date_str = dt.isoformat()
            except Exception:
                pass

        articles.append({
            "title": title,
            "link": link,
            "date": date_str,
            "source": source,
        })
    return articles


def fetch_all_feeds():
    """Fetch all RSS feeds, return deduplicated ME-relevant articles."""
    print(f"\U0001f4e1 Fetching {len(RSS_FEEDS)} RSS feeds...")
    all_articles = []

    me_keywords = [
        "israel", "palestine", "gaza", "west bank", "hamas", "iran",
        "lebanon", "hezbollah", "syria", "yemen", "houthi", "red sea",
        "egypt", "saudi", "uae", "qatar", "doha", "jordan",
        "bahrain", "morocco", "iraq", "baghdad",
        "tel aviv", "jerusalem", "beirut", "damascus", "riyadh",
        "middle east", "sinai", "hormuz", "arab",
        "hostage", "ceasefire", "truce", "aid", "refugee",
    ]

    now = datetime.now(timezone.utc)
    max_age = now.timestamp() - (MAX_AGE_DAYS * 86400)

    fetched = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        futures = {
            executor.submit(fetch_rss, url, source, MAX_ARTICLES_PER_FEED): (source, url)
            for source, url in RSS_FEEDS
        }
        for future in concurrent.futures.as_completed(futures, timeout=60):
            source, url = futures[future]
            try:
                items = future.result()
                fetched.extend(items)
            except Exception as e:
                print(f"  \u26a0 {source}: {e}")

    for a in fetched:
        title_lower = a["title"].lower()
        if not any(kw in title_lower for kw in me_keywords):
            continue
        try:
            dt = datetime.fromisoformat(a["date"])
            if dt.timestamp() < max_age:
                continue
        except Exception:
            pass
        all_articles.append(a)

    # Deduplicate by title
    seen = set()
    unique = []
    for a in all_articles:
        key = a["title"].lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(a)

    print(f"  \u2192 {len(unique)} unique ME articles ({len(all_articles) - len(unique)} duplicates removed)")
    return unique


# ═══════════════════════════════════════════════════════════════════════
# AI Classification via llama.cpp (SINGLE prompt for all articles)
# ═══════════════════════════════════════════════════════════════════════

def classify_articles(articles):
    """Send ALL article titles to llama.cpp in ONE prompt."""
    print(f"\U0001f916 Classifying {len(articles)} articles via llama.cpp...")

    solution_descriptions = "\n".join(
        f"  {sid}: {sol['description']}" for sid, sol in SOLUTIONS.items()
    )

    prompt = f"""You are a Middle East news analyst. Classify each article title into ONE category.

Categories:
{solution_descriptions}

Rules:
- Pick the SINGLE best matching category id from: {", ".join(SOLUTION_IDS)}
- Sentiment: "positive" = progress toward peace, "negative" = setback/escalation, "neutral" = mixed
- Risk score: integer 1-10 (10 = highest risk to peace progress)

Output ONLY a JSON array, no markdown, no explanation:
[
  {{"solution": "<id>", "sentiment": "<positive|negative|neutral>", "risk": <1-10>}},
  ...
]

One entry per article, in order. Total: {len(articles)} entries.

Articles:
""" + "\n".join(f"{i+1}. {a['title']}" for i, a in enumerate(articles))

    # llama.cpp OpenAI-compatible API
    body = {
        "prompt": prompt,
        "n_predict": 4096,
        "temperature": 0.0,
        "top_p": 0.1,
        "stop": ["\n\n", "[DONE]"],
    }

    headers = {"Content-Type": "application/json"}
    if LLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {LLAMA_API_KEY}"

    try:
        req = Request(
            f"{LLAMA_CPP_URL}/v1/completions",
            data=json.dumps(body).encode(),
            headers=headers,
        )
        with urlopen(req, timeout=300) as f:
            response = json.loads(f.read().decode())

        result_text = response.get("choices", [{}])[0].get("text", "")
        print(f"  Response length: {len(result_text)} chars")

        # Extract JSON array from response
        json_match = re.search(r"\[.*\]", result_text, re.DOTALL)
        if json_match:
            classifications = json.loads(json_match.group())
            print(f"  Parsed {len(classifications)} classifications")
            return classifications
        else:
            print(f"  \u26a0 No JSON array found in response")
            print(f"  Response preview: {result_text[:500]}")
            return None

    except Exception as e:
        print(f"  \u26a0 llama.cpp classification failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════
# Keyword fallback classifier
# ═══════════════════════════════════════════════════════════════════════

KEYWORD_MAP = {
    "ceasefire": ["ceasefire", "truce", "cease fire", "armistice", "de-escalation", "peace talks"],
    "hostages": ["hostage", "hostages", "prisoner", "captives", "pows"],
    "aid": ["humanitarian aid", "aid", "relief", "wfp", "unrwa", "food delivery", "medical"],
    "diplomacy": ["abraham accords", "normalization", "diplomatic", "saudi", "nuclear deal"],
    "governance": ["governance", "authority", "two state", "pa reform", "election"],
    "infrastructure": ["reconstruction", "rebuild", "infrastructure", "hospital", "water"],
    "iran": ["iran", "tehran", "hormuz", "khamenei"],
    "lebanon": ["lebanon", "hezbollah", "beirut", "southern lebanon"],
}

POSITIVE_WORDS = ["agreed", "signed", "resumed", "reopened", "released", "deal", "progress", "restored"]
NEGATIVE_WORDS = ["killed", "attack", "strike", "bombing", "destroyed", "escalat", "crisis", "failed"]


def keyword_classify(articles):
    """Fallback keyword-based classification."""
    results = []
    for article in articles:
        lower = article["title"].lower()

        scores = {}
        for sol, kws in KEYWORD_MAP.items():
            for kw in kws:
                if kw in lower:
                    scores[sol] = scores.get(sol, 0) + 1

        best = max(scores, key=scores.get) if scores else "ceasefire"

        pos = sum(1 for w in POSITIVE_WORDS if w in lower)
        neg = sum(1 for w in NEGATIVE_WORDS if w in lower)
        sentiment = "positive" if pos > neg else "negative" if neg > pos else "neutral"

        results.append({"solution": best, "sentiment": sentiment, "risk": 5})

    return results


# ═══════════════════════════════════════════════════════════════════════
# Build Output Data
# ═══════════════════════════════════════════════════════════════════════

def build_output(articles, classifications):
    """Build the final JSON structure for the Peace Room frontend."""
    now = datetime.now(timezone.utc)

    # Group articles by solution
    solution_events = {sid: [] for sid in SOLUTIONS}

    for article, classification in zip(articles, classifications):
        sol = classification.get("solution", "ceasefire")
        if sol not in solution_events:
            sol = "ceasefire"

        solution_events[sol].append({
            "date": article["date"],
            "text": article["title"],
            "sentiment": classification.get("sentiment", "neutral"),
            "source": article["source"],
            "link": article["link"],
            "ai_risk": classification.get("risk", 5),
        })

    # Sort events per solution by date desc
    for sol in solution_events:
        solution_events[sol].sort(key=lambda e: e["date"], reverse=True)

    # Compute direction per solution
    def compute_direction(events):
        if not events:
            return "stable"
        pos = sum(1 for e in events if e["sentiment"] == "positive")
        neg = sum(1 for e in events if e["sentiment"] == "negative")
        ratio = pos / (pos + neg) if (pos + neg) > 0 else 0.5
        if ratio > 0.65:
            return "advancing"
        elif ratio < 0.35:
            return "stalling"
        return "stable"

    def compute_phase(events):
        if not events:
            return 0
        total = len(events)
        now_ts = now.timestamp()
        neg = sum(1 for e in events if e["sentiment"] == "negative")

        # Weighted ratio (recent events count double)
        w_pos, w_total = 0, 0
        for e in events:
            age = now_ts - datetime.fromisoformat(e["date"]).timestamp()
            weight = 2 if age < 48 * 3600 else 1
            w_total += weight
            if e["sentiment"] == "positive":
                w_pos += weight

        ratio = w_pos / w_total if w_total > 0 else 0
        phase = min(4, int(ratio * 5))
        if neg / total > 0.6:
            phase = min(phase, 1)
        return phase

    solutions = []
    counts = {"advancing": 0, "stable": 0, "stalling": 0}

    for sol_id, sol_cfg in SOLUTIONS.items():
        events = solution_events[sol_id]
        direction = compute_direction(events)
        phase_index = compute_phase(events)
        counts[direction] += 1

        solutions.append({
            "id": sol_id,
            "icon": sol_cfg["icon"],
            "name": sol_cfg["name"],
            "phases": sol_cfg["phases"],
            "phaseIndex": phase_index,
            "direction": direction,
            "keyMetric": {"label": "Events (7d)", "value": str(len(events))},
            "summary": events[0]["text"] if events else "No recent developments",
            "events": events[:12],
            "confidence": "high" if len(events) > 5 else "medium" if len(events) > 2 else "low",
        })

    # Overall momentum
    if counts["advancing"] > counts["stalling"]:
        m_dir, m_label = "advancing", "Net Positive"
    elif counts["stalling"] > counts["advancing"]:
        m_dir, m_label = "stalling", "Net Negative"
    else:
        m_dir, m_label = "stable", "Mixed Signals"

    return {
        "solutions": solutions,
        "overallMomentum": {
            "direction": m_dir,
            "label": m_label,
            "summary": f"{counts['advancing']} advancing, {counts['stable']} stable, {counts['stalling']} stalling. {len(articles)} ME articles from {len(RSS_FEEDS)} feeds.",
        },
        "lastUpdated": now.isoformat(),
        "source": "ai-analyzer-prod",
        "feedCount": len(articles),
    }


# ═══════════════════════════════════════════════════════════════════════
# Upload to Cloudflare Pages via Workers API
# ═══════════════════════════════════════════════════════════════════════

def upload_to_cloudflare(data):
    """Push solutions.json to Cloudflare Pages via the API."""
    if not CLOUDFLARE_TOKEN or not CLOUDFLARE_ACCOUNT:
        print("\n\u26a0 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set")
        print("   Setting env vars will enable automatic deployment.")
        print("   Data written locally — deploy with: npx wrangler pages deploy")
        return False

    json_bytes = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
    boundary = "PeaceMeterBoundary"

    # Build multipart form for Pages Upload API
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="name"\r\n\r\n'
        f"solutions.json\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="solutions.json"\r\n'
        f"Content-Type: application/json\r\n\r\n"
    ).encode() + json_bytes + f"\r\n--{boundary}--\r\n".encode()

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/"
        f"{CLOUDFLARE_ACCOUNT}/pages/projects/{CLOUDFLARE_PAGES_PROJECT}/uploads"
    )

    try:
        req = Request(
            url,
            data=body,
            headers={
                "Authorization": f"Bearer {CLOUDFLARE_TOKEN}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )
        with urlopen(req, timeout=30) as f:
            resp = json.loads(f.read().decode())

        if resp.get("success"):
            print("  \u2713 Deployed to Cloudflare Pages")
            return True
        else:
            print(f"  \u26a0 Upload failed: {resp.get('errors', 'unknown')}")
            return False

    except Exception as e:
        print(f"  \u26a0 Upload failed: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Peace Room AI Analyzer (Production)")
    parser.add_argument("--fetch-only", action="store_true", help="Only fetch RSS, skip AI")
    parser.add_argument("--skip-upload", action="store_true", help="Skip Cloudflare upload")
    parser.add_argument("--dry-run", action="store_true", help="Print output JSON to stdout")
    args = parser.parse_args()

    start = time.time()

    # 1. Fetch RSS
    articles = fetch_all_feeds()
    if not articles:
        print("No articles found, aborting.")
        return

    # 2. AI Classification
    if args.fetch_only:
        print("[--fetch-only] Using keyword fallback")
        classifications = keyword_classify(articles)
    else:
        classifications = classify_articles(articles)
        if not classifications:
            print("  \u26a0 AI failed, falling back to keyword classification")
            classifications = keyword_classify(articles)

    # Trim to match article count
    classifications = classifications[:len(articles)]

    # 3. Build output
    data = build_output(articles, classifications)

    # 4. Dry run
    if args.dry_run:
        print("\n--- solutions.json ---")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return

    # 5. Write local JSON
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\n\u2713 Written to {DATA_FILE}")

    # 6. Upload to Cloudflare
    if not args.skip_upload:
        upload_to_cloudflare(data)

    elapsed = time.time() - start
    print(f"\n\u2713 Done in {elapsed:.1f}s")
    print(f"  {len(articles)} articles \u2192 {len(data['solutions'])} solutions")
    print(f"  Momentum: {data['overallMomentum']['label']}")

    for sol in data["solutions"]:
        d = "\U0001f7e2" if sol["direction"] == "advancing" else "\U0001f7e5" if sol["direction"] == "stalling" else "\U0001f7e1"
        phase = sol["phases"][sol["phaseIndex"]]
        print(f"  {sol['icon']} {sol['name']:35s} {sol['direction']:10s} {d} {sol['keyMetric']['value']} events \u2192 {phase}")


if __name__ == "__main__":
    main()
