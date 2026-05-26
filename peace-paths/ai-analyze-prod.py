#!/usr/bin/env python3
"""
Peace Room AI Analyzer — Production
====================================
Runs on the LLM server (192.168.2.121:8080).

Pipeline:
  [Raw RSS Feed] -> [Extract 1200 chars] -> [Single-article LLM inference]
                                                      |
                                        [me_relevant:true]    [me_relevant:false]
                                              |                       |
                                      [classify category]     [silently drop]

Modes:
  --fast   — Hourly: fetch recent articles (last 2h), merge into existing solutions.json
  --daily  — Daily: full fetch (7-day window), overwrite solutions.json
  (default) — Same as --daily

Run: python ai-analyze-prod.py
Run: python ai-analyze-prod.py --fast
Run: python ai-analyze-prod.py --categories "id:name:description"

Schedule: --fast every hour; --daily every 12h
"""

import json
import sys
import os
import re
import html
import time
import hashlib
import concurrent.futures
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.request import urlopen, Request
from urllib.error import URLError

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# ─── Configuration ───────────────────────────────────────────────────

LLAMA_CPP_URL = os.environ.get("LLAMA_CPP_URL", "http://192.168.2.121:8080")
LLAMA_API_KEY = os.getenv("LLAMA_API_KEY", "")  # optional

CLOUDFLARE_PAGES_PROJECT = "peace-meter"
CLOUDFLARE_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")

# Output — write to local file, then push to Cloudflare
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "peace-room")
DATA_FILE = os.path.join(DATA_DIR, "solutions.json")

MAX_ARTICLES_PER_FEED = 8
MAX_AGE_DAYS = 7
FAST_AGE_HOURS = 2  # --fast: only articles from last N hours

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
    "gaza-crisis": {
        "icon": "🏚", "name": "Gaza Humanitarian Crisis",
        "phases": ["Blockade", "Aid Inflow", "Recovery", "Rebuilding", "Stabilized"],
        "description": "Gaza humanitarian crisis, displacement, medicine/food blockade, disease, civilian suffering",
    },
    "human-rights": {
        "icon": "⚖️", "name": "Human Rights & Intl Law",
        "phases": ["Allegations", "Investigations", "Sanctions", "Accountability", "Reform"],
        "description": "Human rights violations, war crimes, flotilla activists, ICC/ICJ, international law, abuse allegations",
    },
    "domestic-politics": {
        "icon": "🏛", "name": "Israeli Domestic Politics",
        "phases": ["Fractured", "Coalition Shift", "Policy Change", "Elections", "Stability"],
        "description": "Israeli internal politics, coalition dynamics, Knesset, party struggles, Netanyahu, Herzog, liberal center",
    },
    "west-bank": {
        "icon": "🔥", "name": "West Bank & Settlements",
        "phases": ["Escalation", "Violence Spike", "Mediation", "Calming", "Frozen Conflict"],
        "description": "West Bank settler violence, occupation policies, East Jerusalem, Palestinian communities",
    },
    "regional": {
        "icon": "🌍", "name": "Regional Relations",
        "phases": ["Tensions", "Diplomatic Push", "Accord", "Integration", "Cooperation"],
        "description": "Regional diplomacy, Arab states positions, Jordan, Egypt, Syria, Türkiye, Morocco, UAE, China influence",
    },
}

SOLUTION_IDS = list(SOLUTIONS.keys())


def inject_category(cat_id, name, description, icon=None):
    """Inject a custom category before AI classification.

    Usage: --categories "armistice:Ceasefire across all fronts:Ceasefire talks, armistice negotiations, truce"
    """
    if cat_id in SOLUTIONS:
        print(f"  \u26a0 Category '{cat_id}' already exists, updating description.")
        SOLUTIONS[cat_id]["description"] = description
    else:
        SOLUTIONS[cat_id] = {
            "icon": icon or "\U0001f4cc",
            "name": name,
            "phases": ["Emerged", "Developing", "Gaining Traction", "Maturing", "Resolved"],
            "description": description,
        }
        SOLUTION_IDS.append(cat_id)
    print(f"  \u2713 Category '{cat_id}' ({name})")

# ═══════════════════════════════════════════════════════════════════════
# RSS Fetching & Parsing
# ═══════════════════════════════════════════════════════════════════════

def _extract_text(raw_html):
    """Extract clean text from HTML content.
    Prefers BeautifulSoup for clean stripping; falls back to regex.
    """
    if HAS_BS4:
        soup = BeautifulSoup(raw_html, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
    else:
        text = html.unescape(raw_html)
        text = re.sub(r"<[^>]+>", " ", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


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
        title = html.unescape(title)
        title = re.sub(r"&\w+;|&#\d+;|&#x[0-9a-fA-F]+;", "", title)
        title = re.sub(r"<[^>]+>", "", title)

        # Extract snippet from <content:encoded> first, then <description>
        snippet = ""
        # Try <content:encoded> — usually holds full article text
        content_m = re.search(r"<content:encoded>(.*?)</content:encoded>", block, re.DOTALL)
        if content_m:
            raw = content_m.group(1)
            raw = raw.replace("<![CDATA[", "").replace("]]>", "")
            snippet = _extract_text(raw)
        else:
            # Fallback to <description>
            desc_m = re.search(r"<description>(.*?)</description>", block, re.DOTALL)
            if desc_m:
                raw = desc_m.group(1)
                raw = raw.replace("<![CDATA[", "").replace("]]>", "")
                snippet = _extract_text(raw)
        # Truncate to 1200 chars for AI prompt
        snippet = snippet[:1200]

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
            "snippet": snippet,
        })
    return articles


def fetch_all_feeds(age_hours=None):
    """Fetch all RSS feeds, return deduplicated articles (no keyword filter).
    The LLM decides relevance.
    """
    print(f"\U0001f4e1 Fetching {len(RSS_FEEDS)} RSS feeds...")
    now = datetime.now(timezone.utc)
    if age_hours is not None:
        max_age = now.timestamp() - (age_hours * 3600)
    else:
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

    # Age filter — keep articles within time window
    all_articles = []
    for a in fetched:
        try:
            dt = datetime.fromisoformat(a["date"])
            if dt.timestamp() < max_age:
                continue
        except Exception:
            pass  # keep articles with unparseable dates
        all_articles.append(a)

    # Deduplicate by title
    seen = set()
    unique = []
    for a in all_articles:
        key = a["title"].lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(a)

    print(f"  \u2192 {len(unique)} unique articles ({len(all_articles) - len(unique)} duplicates removed)")
    return unique


# ═══════════════════════════════════════════════════════════════════════
# AI Classification via llama.cpp (single-article inference)
# ═══════════════════════════════════════════════════════════════════════

# Pre-build the category descriptions block (reused per article)
_CATEGORY_BLOCK = "\n".join(
    f"  {sid}: {sol['description']}" for sid, sol in SOLUTIONS.items()
)
_CATEGORY_LIST = ", ".join(SOLUTION_IDS)


def _classify_article(article):
    """Classify a single article via llama.cpp chat API.
    Returns dict {me_relevant, solution, sentiment, risk} or None on failure.
    """
    snippet = article.get("snippet", "")
    context = snippet if snippet else article["title"]

    prompt = (
        "You are a Middle East news filter.\n"
        "\n"
        "Step 1: Is this article about Middle East conflict, politics, diplomacy, humanitarian issues, or regional security?\n"
        "Step 2: If yes, classify it into ONE category from the list below.\n"
        "\n"
        f"Categories:\n{_CATEGORY_BLOCK}\n"
        f"\nCategories list: {_CATEGORY_LIST}\n"
        "\n"
        "Output ONLY a JSON object:\n"
        '{"me_relevant": true/false, "solution": "<id>", "sentiment": "<positive/negative/neutral>", "risk": <1-10>}\n'
        'If me_relevant is false, set solution to "null", sentiment to "neutral", risk to 0.\n'
        "\n"
        "Article:\n"
        f"  Title: {article['title']}\n"
        f"  Context: {context}\n"
    )

    body = {
        "model": "Qwen3.6-27B",
        "messages": [
            {"role": "system", "content": "Middle East news filter. Output ONLY a valid JSON object with keys: me_relevant, solution, sentiment, risk. No explanation."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 8000,
        "temperature": 0.0,
    }

    headers = {"Content-Type": "application/json"}
    if LLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {LLAMA_API_KEY}"

    req = Request(
        f"{LLAMA_CPP_URL}/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers=headers,
    )
    try:
        with urlopen(req, timeout=60) as f:
            response = json.loads(f.read().decode())
    except Exception as e:
        print(f"  AI unavailable: {e}")
        return None

    result_text = response.get("choices", [{}])[0].get("message", {}).get("content", "")

    # Extract JSON object
    first_brace = result_text.find('{')
    last_brace = result_text.rfind('}')
    if first_brace != -1 and last_brace > first_brace:
        json_str = result_text[first_brace:last_brace+1]
        try:
            obj = json.loads(json_str)
            if "me_relevant" in obj:
                return obj
        except json.JSONDecodeError:
            pass
    return None


def classify_articles(articles):
    """Classify each article individually via llama.cpp.
    Articles with me_relevant=false are silently dropped.
    Returns list of {solution, sentiment, risk} dicts for relevant articles.
    """
    print(f"\U0001f916 Classifying {len(articles)} articles via llama.cpp (1-by-1)...")
    pairs = []  # list of (article, classification)
    relevant = 0
    dropped = 0
    ai_failures = 0

    for idx, article in enumerate(articles):
        t0 = time.time()
        result = _classify_article(article)
        elapsed = time.time() - t0

        if result is None:
            ai_failures += 1
            if ai_failures <= 3:
                # Retry once
                result = _classify_article(article)
                elapsed = time.time() - t0
                if result:
                    ai_failures = 0
            else:
                # AI unreachable — abort
                print(f"  \u26a0\ufe0f AI unreachable after {ai_failures} failures. Aborting classification.")
                break

        if result.get("me_relevant"):
            pairs.append((article, {
                "solution": result.get("solution", "regional"),
                "sentiment": result.get("sentiment", "neutral"),
                "risk": result.get("risk", 5),
            }))
            relevant += 1
        else:
            dropped += 1

        if (idx + 1) % 20 == 0 or idx == len(articles) - 1:
            print(f"  [{idx+1}/{len(articles)}] {relevant} relevant, {dropped} dropped")

    print(f"  Total: {relevant} relevant / {len(articles)} articles")
    return pairs

# ═══════════════════════════════════════════════════════════════════════
# Keyword fallback classifier
# ═══════════════════════════════════════════════════════════════════════

KEYWORD_MAP = {
    "ceasefire": ["ceasefire", "truce", "cease fire", "armistice", "de-escalation", "peace talks"],
    "aid": ["humanitarian aid", "aid", "relief", "wfp", "unrwa", "food delivery", "medical"],
    "diplomacy": ["abraham accords", "normalization", "diplomatic", "saudi", "nuclear deal"],
    "governance": ["governance", "authority", "two state", "pa reform", "election"],
    "infrastructure": ["reconstruction", "rebuild", "infrastructure", "hospital", "water"],
    "iran": ["iran war", "iran nuclear", "iran us", "us iran", "iran deal", "iran ceasefire", "khamenei", "isfahan", "strait of hormuz"],
    "lebanon": ["lebanon", "hezbollah", "beirut", "southern lebanon", "south lebanon"],
    "gaza-crisis": ["gaza crisis", "gaza famine", "gaza blockade", "gaza siege", "sumud", "flotilla"],
    "human-rights": ["war crime", "icj", "icc", "genocide", "human rights", "flotilla", "torture"],
    "domestic-politics": ["netanyahu", "herzog", "knesset", "coalition", "arab parties", "liberal center", "death penalty"],
    "west-bank": ["west bank", "settler", "east jerusalem", "occupied"],
    "regional": ["jordan", "egypt", "syria", "türkiye", "turkey", "turkiye", "morocco", "uae", "qatar", "china", "arab"],
}

# Priority order — checked first wins on tie
KEYWORD_PRIORITY = [
    "ceasefire", "aid", "lebanon", "gaza-crisis", "west-bank",
    "iran", "infrastructure", "human-rights", "domestic-politics",
    "diplomacy", "governance", "regional",
]

POSITIVE_WORDS = ["agreed", "signed", "resumed", "reopened", "released", "deal", "progress", "restored"]
NEGATIVE_WORDS = ["killed", "attack", "strike", "bombing", "destroyed", "escalat", "crisis", "failed"]


def keyword_classify(articles):
    """Fallback keyword-based classification with priority tie-breaking.

    Multi-word keywords get a score of 2 (more specific), single-word gets 1.
    Among tied scores, higher priority category wins.
    """
    results = []
    for article in articles:
        lower = article["title"].lower()

        scores = {}
        for sol, kws in KEYWORD_MAP.items():
            for kw in kws:
                if kw in lower:
                    # Multi-word keywords are more specific → score 2
                    weight = 2 if " " in kw else 1
                    scores[sol] = scores.get(sol, 0) + weight

        if scores:
            # Among tied scores, prefer higher priority category
            max_score = max(scores.values())
            best = None
            for sol in KEYWORD_PRIORITY:
                if scores.get(sol, 0) == max_score:
                    best = sol
                    break
            if best is None:
                best = max(scores, key=scores.get)
        else:
            continue  # drop unclassifiable articles

        pos = sum(1 for w in POSITIVE_WORDS if w in lower)
        neg = sum(1 for w in NEGATIVE_WORDS if w in lower)
        sentiment = "positive" if pos > neg else "negative" if neg > pos else "neutral"

        results.append({"solution": best, "sentiment": sentiment, "risk": 5})

    return results


# ═══════════════════════════════════════════════════════════════════════
# Utility Functions
# ═══════════════════════════════════════════════════════════════════════

def parse_date(date_str):
    """Parse date string (ISO 8601 or RFC 2822)."""
    try:
        return datetime.fromisoformat(date_str)
    except (ValueError, TypeError):
        try:
            return parsedate_to_datetime(date_str)
        except Exception:
            return datetime.now(timezone.utc)


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
    now_ts = datetime.now(timezone.utc).timestamp()

    w_pos, w_total = 0, 0
    for e in events:
        age = now_ts - parse_date(e["date"]).timestamp()
        weight = 2 if age < 48 * 3600 else 1
        w_total += weight
        if e["sentiment"] == "positive":
            w_pos += weight

    ratio = w_pos / w_total if w_total > 0 else 0
    phase = min(4, int(ratio * 5))
    neg = sum(1 for e in events if e["sentiment"] == "negative")
    if neg / total > 0.6:
        phase = min(phase, 1)
    return phase


# ═══════════════════════════════════════════════════════════════════════
# Build Output Data
# ═══════════════════════════════════════════════════════════════════════

def build_output(articles, classifications):
    """Build the final JSON structure for the Peace Room frontend.

    arguments: If 'classifications' is a list of (article, classification) tuples,
    articles is ignored and pairs are iterated directly.
    """
    now = datetime.now(timezone.utc)

    # Group articles by solution
    solution_events = {sid: [] for sid in SOLUTIONS}

    # Handle new format: list of (article, classification) pairs
    if classifications and isinstance(classifications[0], tuple):
        pairs = classifications
    else:
        pairs = list(zip(articles, classifications))

    for article, classification in pairs:
        sol = classification.get("solution", "ceasefire")
        if sol not in solution_events:
            sol = "ceasefire"  # unknown category, default to ceasefire

        solution_events[sol].append({
            "date": article["date"],
            "text": article["title"],
            "sentiment": classification.get("sentiment", "neutral"),
            "source": article["source"],
            "link": article["link"],
            "snippet": article.get("snippet", ""),
            "ai_risk": classification.get("risk", 5),
        })

    # Sort events per solution by date desc
    for sol in solution_events:
        solution_events[sol].sort(key=lambda e: e["date"], reverse=True)

    solutions = []
    counts = {"advancing": 0, "stable": 0, "stalling": 0}
    active_solutions = []  # only solutions with recent articles

    # Process ALL solution IDs — known from SOLUTIONS or dynamic from AI
    all_sol_ids = set(solution_events.keys())
    for sol_id in all_sol_ids:
        events = solution_events[sol_id]
        if not events:
            continue
        active_solutions.append(sol_id)
        direction = compute_direction(events)
        phase_index = compute_phase(events)
        counts[direction] += 1

        sol_cfg = SOLUTIONS.get(sol_id)
        if sol_cfg:
            # Known category — use its config
            solutions.append({
                "id": sol_id,
                "icon": sol_cfg["icon"],
                "name": sol_cfg["name"],
                "phases": sol_cfg["phases"],
                "phaseIndex": phase_index,
                "direction": direction,
                "keyMetric": {"label": "Events (7d)", "value": str(len(events))},
                "summary": events[0]["text"],
                "events": events,
                "confidence": "high" if len(events) > 5 else "medium" if len(events) > 2 else "low",
            })
        else:
            # Dynamic category discovered by AI — generate default
            name = sol_id.replace("-", " ").replace("_", " ").title()
            solutions.append({
                "id": sol_id,
                "icon": "📌",
                "name": name,
                "phases": ["Emerged", "Developing", "Gaining Traction", "Maturing", "Resolved"],
                "phaseIndex": phase_index,
                "direction": direction,
                "keyMetric": {"label": "Events (7d)", "value": str(len(events))},
                "summary": events[0]["text"],
                "events": events,
                "confidence": "low",
            })

    if not active_solutions:
        counts["stable"] = 1

    # Sort by event count desc, keep top 8
    solutions.sort(key=lambda s: s["keyMetric"]["value"], reverse=True)
    solutions = solutions[:8]
    # Re-sort activeSolutions to match
    active_ids = set(s["id"] for s in solutions)
    active_solutions = [sid for sid in active_solutions if sid in active_ids]

    # Overall momentum
    if counts["advancing"] > counts["stalling"]:
        m_dir, m_label = "advancing", "Net Positive"
    elif counts["stalling"] > counts["advancing"]:
        m_dir, m_label = "stalling", "Net Negative"
    else:
        m_dir, m_label = "stable", "Mixed Signals"

    return {
        "solutions": solutions,
        "activeSolutions": active_solutions,
        "overallMomentum": {
            "direction": m_dir,
            "label": m_label,
            "summary": f"{counts['advancing']} advancing, {counts['stable']} stable, {counts['stalling']} stalling ({len(active_solutions)} active). {len(articles)} ME articles from {len(RSS_FEEDS)} feeds.",
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

def _load_existing_data():
    """Load existing solutions.json for merge operations."""
    if not os.path.exists(DATA_FILE):
        return None
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  \u26a0 Could not load existing data: {e}")
        return None


def _merge_with_existing(data, existing):
    """Merge new events into existing solutions, preserving history.

    - Deduplicates events by text content within each category
    - Adds new solution categories discovered by AI
    - Recomputes phases, directions, confidence for all solutions
    """
    for sol in existing.get("solutions", []):
        sol_id = sol["id"]
        existing_texts = {e["text"] for e in sol["events"]}
        for new_sol in data["solutions"]:
            if new_sol["id"] == sol_id:
                for ev in new_sol["events"]:
                    if ev["text"] not in existing_texts:
                        sol["events"].append(ev)
                        existing_texts.add(ev["text"])

    existing_ids = {s["id"] for s in existing["solutions"]}
    for new_sol in data["solutions"]:
        if new_sol["id"] not in existing_ids:
            existing["solutions"].append(new_sol)

    # Recompute for all solutions — compute on ALL events, store all
    for sol in existing["solutions"]:
        sol["events"].sort(key=lambda e: e["date"], reverse=True)
        sol["phaseIndex"] = compute_phase(sol["events"])
        sol["direction"] = compute_direction(sol["events"])
        sol["keyMetric"] = {"label": "Events (7d)", "value": str(len(sol["events"]))}
        sol["summary"] = sol["events"][0]["text"] if sol["events"] else ""
        sol["confidence"] = "high" if len(sol["events"]) >= 5 else "medium" if len(sol["events"]) >= 3 else "low"

    # Recompute momentum
    all_solutions = existing["solutions"]
    active_ids = [s["id"] for s in all_solutions if s["events"]]
    existing["activeSolutions"] = active_ids

    counts = {"advancing": 0, "stable": 0, "stalling": 0}
    for s in all_solutions:
        counts[s["direction"]] += 1

    # Sort by event count, keep top 8
    all_solutions.sort(key=lambda s: len(s["events"]), reverse=True)
    top8 = all_solutions[:8]
    existing["solutions"] = top8
    existing["activeSolutions"] = [s["id"] for s in top8]

    if counts["advancing"] > counts["stalling"]:
        m_dir, m_label = "advancing", "Net Positive"
    elif counts["stalling"] > counts["advancing"]:
        m_dir, m_label = "stalling", "Net Negative"
    else:
        m_dir, m_label = "stable", "Mixed Signals"

    existing["overallMomentum"] = {
        "direction": m_dir,
        "label": m_label,
        "summary": f"{counts['advancing']} advancing, {counts['stable']} stable, {counts['stalling']} stalling ({len(active_ids)} active). {sum(len(s['events']) for s in all_solutions)} events across {len(all_solutions)} categories.",
    }
    existing["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    existing["source"] = "ai-analyzer-prod"
    return existing


def _print_summary(data, articles_count, elapsed):
    """Print run summary."""
    print(f"\n\u2713 Done in {elapsed:.1f}s")
    print(f"  {articles_count} articles \u2192 {len(data['solutions'])} solutions")
    print(f"  Momentum: {data['overallMomentum']['label']}")

    for sol in data["solutions"]:
        d = "\U0001f7e2" if sol["direction"] == "advancing" else "\U0001f7e5" if sol["direction"] == "stalling" else "\U0001f7e1"
        phase = sol["phases"][sol["phaseIndex"]]
        print(f"  {sol['icon']} {sol['name']:35s} {sol['direction']:10s} {d} {sol['keyMetric']['value']} events \u2192 {phase}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Peace Room AI Analyzer (Production)")
    parser.add_argument("--fast", action="store_true",
                        help="Hourly fast run: fetch last 2h, merge into existing data")
    parser.add_argument("--daily", action="store_true",
                        help="Daily full run: fetch 7 days, overwrite solutions.json")
    parser.add_argument("--categories", type=str, nargs="*",
                        help="Inject custom categories (id:name:description). E.g., --categories \"armistice:Ceasefire Talks:Truce negotiations\"")
    parser.add_argument("--skip-upload", action="store_true", help="Skip Cloudflare upload")
    parser.add_argument("--dry-run", action="store_true", help="Print output JSON to stdout")
    parser.add_argument("--fetch-only", action="store_true", help="Only fetch RSS, skip AI")
    parser.add_argument("--recent", type=int, default=0,
                        help="[deprecated] Only process articles from last N hours")
    args = parser.parse_args()

    # Determine mode
    if args.fast:
        mode = "fast"
        age_hours = FAST_AGE_HOURS
    elif args.daily or (args.fast == False and args.recent == 0):
        mode = "daily"
        age_hours = None
    else:
        # --recent is deprecated, treat as fast with custom hours
        mode = "fast"
        age_hours = args.recent
        print("  \u26a0 --recent is deprecated, use --fast instead")

    print(f"\n{'\U0001f680' if mode == 'daily' else '\U0001f4a9'} Peace Room AI Analyzer — {mode.upper()} mode\n")

    # Inject custom categories
    if args.categories:
        print("\u2728 Injecting custom categories:")
        for cat in args.categories:
            parts = cat.split(":", 2)
            if len(parts) == 3:
                cat_id, name, desc = parts
                inject_category(cat_id, name, desc)
            elif len(parts) == 2:
                cat_id, name = parts
                inject_category(cat_id, name, f"{name} news and updates")
            else:
                print(f"  \u26a0 Invalid format: '{cat}' (expected id:name:description)")

    start = time.time()

    # 1. Fetch RSS
    if age_hours is not None:
        print(f"  [fast mode] fetching articles from last {age_hours}h")
    else:
        print(f"  [daily mode] fetching articles from last {MAX_AGE_DAYS}d")
    articles = fetch_all_feeds(age_hours=age_hours)
    if not articles:
        print("No articles found, aborting.")
        return

    # 2. AI Classification
    if args.fetch_only:
        print("[--fetch-only] Using keyword fallback")
        classified_pairs = [(a, c) for a, c in zip(articles, keyword_classify(articles))]
    else:
        classified_pairs = classify_articles(articles)
        if not classified_pairs:
            print("  \u26a0 AI failed, falling back to keyword classification")
            classified_pairs = [(a, c) for a, c in zip(articles, keyword_classify(articles))]

    # 3. Build output
    data = build_output(articles, classified_pairs)

    # 4. Merge with existing data (fast mode) or overwrite (daily mode)
    if mode == "fast":
        existing = _load_existing_data()
        if existing:
            print(f"\u2192 Merging {len(classified_pairs)} new events into existing data")
            data = _merge_with_existing(data, existing)
        else:
            print("  \u26a0 No existing data found, falling back to daily mode")
    # daily mode: data already overwrites

    # 5. Dry run
    if args.dry_run:
        print("\n--- solutions.json ---")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return

    # 6. Write local JSON
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\n\u2713 Written to {DATA_FILE}")

    # 7. Upload to Cloudflare
    if not args.skip_upload:
        upload_to_cloudflare(data)

    elapsed = time.time() - start
    _print_summary(data, len(classified_pairs), elapsed)


if __name__ == "__main__":
    main()
