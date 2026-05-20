/* ── /data.json — Cloudflare Pages Function ───────────── */

const CACHE_TTL = 60; // 1 min

function clamp(min, max, val) { return Math.max(min, Math.min(max, val)); }

/* ── RSS feeds (must be reachable from Cloudflare edge) ── */
/* feeds — 'type' determines inclusion rules:
 *   thinktank  — always include (ME-focused analysis), higher cap
 *   media      — include only if sentiment is 'peace' (skip war/neutral)
 *   me-news    — always include (inherently ME feed), moderate cap
 */
const RSS_FEEDS = [
  { url: 'https://mitvim.org.il/en/feed/',       source: 'Mitvim',            cap: 4, type: 'thinktank' },
  { url: 'https://ecopeaceme.org/feed/',         source: 'EcoPeace',          cap: 3, type: 'thinktank' },
  { url: 'https://www.al-monitor.com/rss',        source: 'Al Monitor',        cap: 3, type: 'me-news' },
  { url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', source: 'BBC', cap: 3, type: 'me-news' },
  { url: 'https://www.jns.org/feed/',             source: 'JNS',               cap: 2, type: 'media' },
  { url: 'https://www.timesofisrael.com/feed/',   source: 'Times of Israel',   cap: 2, type: 'media' },
];

/* Only show publications from the last 30 days */
const MAX_AGE_DAYS = 30;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/* ── Relevance keywords ─────────────────────────────── */
/* Tier 1 — peace/conflict/diplomacy (high signal) */
const RELEVANCE_PRIMARY = [
  'ceasefire', 'truce', 'peace deal', 'negotiat', 'diplomat', 'normalization',
  'abraham accords', 'framework', 'mediation', 'dialogue', 'agreement',
  'hamas', 'hezbollah', 'houthi', 'palestine', 'gaza', 'west bank',
  'syria', 'lebanon', 'yemen', 'iraq', 'red sea', 'dead sea', 'sinai',
  'bahrain', 'qatar',
  'conflict', 'escalat', 'attack', 'strike', 'bombing', 'killed', 'war',
  'rocket', 'missile', 'drone', 'casualt', 'proxy', 'target', 'threat',
];

/* Tier 2 — place names (low signal, need +1 primary to pass) */
const RELEVANCE_SECONDARY = [
  'israel', 'jerusalem', 'tel aviv', 'beirut', 'damascus',
  'saudi', 'uae', 'dubai', 'turkey', 'iran', 'mediterranean',
  'imf', 'imec',
];

/* Negative keywords — exclude clearly off-topic articles */
const EXCLUDE_KEYWORDS = [
  'world cup', 'super bowl', 'champions league', 'premier league',
  'academy awards', 'oscars', 'grammy', 'emmy',
  'stock market', 'nasdaq', 'dow jones', 's&p 500',
  'kindergarten', 'school', 'hospital', 'weather',
  'railway', 'railway', 'airport', 'traffic',
  'election', 'voting', 'ballot', 'polling',
  'cyber attack', 'ransomware', 'phishing',
];

/* ── GDELT 2.0 Event Database fetcher ──────────────────── */
/* Free, anonymous API. Monitors 250k+ news stories/day.
 * Columns (0-indexed):
 *   7  = Actor1CountryCode  (3-char CAMEO)
 *   16 = Actor2CountryCode
 *   26 = EventRootCode      (2-digit root category)
 *   28 = GoldsteinScale     (-10 to +10 per event)
 *   34 = AvgTone            (-100 to +100 for document)
 */
const GDELT_COUNTRIES = ['ISR','PSE','LBN','SYR','IRN','YEM','IRQ','SAU','ARE','BHR'];
// CAMEO root codes for diplomatic events
const CAMEO_DIPLOMATIC_ROOTS = ['13','22','23','24','26','27','40','41','42','43','45','52','58','59'];

async function fetchGDELT() {
  const now = new Date();

  // Try current hour and previous 4 hours (GDELT updates every 15 min, may lag)
  const hoursToTry = [];
  for (let offset = 0; offset < 5; offset++) {
    const h = new Date(now.getTime() - offset * 3600000);
    hoursToTry.push(h.toISOString().slice(0,10).replace(/-/g,'') + h.toISOString().slice(11,13));
  }

  for (const dateHour of hoursToTry) {
    const urls = [
      `https://data.gdeltproject.org/gdeltv2/${dateHour}000.COUNTRY.csv`,
      `https://data.gdeltproject.org/gdeltv2/${dateHour}000.COUNTRY.CSV.gz`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const text = await res.text();
        const parsed = parseGDELT(text);
        if (parsed && parsed.eventCount > 0) return parsed;
      } catch { /* try next URL */ }
    }
  }
  return null;
}

function parseGDELT(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return null; // header only

  let totalGoldstein = 0;
  let totalTone = 0;
  let eventCount = 0;
  let diplomaticCount = 0;
  let constructiveEvents = 0;
  let hostileEvents = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(',');
    if (fields.length < 36) continue;

    const actor1 = fields[7].trim();
    const actor2 = fields[16].trim();
    const rootCode = fields[26].trim();
    const goldstein = parseFloat(fields[28]);
    const avgTone = parseFloat(fields[34]);

    // Check if at least one actor is a ME country we track
    const actorMatch = GDELT_COUNTRIES.includes(actor1) || GDELT_COUNTRIES.includes(actor2);
    if (!actorMatch) continue;

    // Skip events with zero Goldstein (neutral)
    if (goldstein === 0) continue;

    eventCount++;
    totalGoldstein += goldstein;
    totalTone += avgTone || 0;

    if (goldstein > 0) constructiveEvents++;
    else hostileEvents++;

    if (CAMEO_DIPLOMATIC_ROOTS.includes(rootCode)) {
      diplomaticCount++;
    }
  }

  if (eventCount === 0) return null;

  const avgGoldstein = totalGoldstein / eventCount;
  const avgTone = totalTone / eventCount;
  const constructiveRatio = (constructiveEvents + hostileEvents) > 0
    ? constructiveEvents / (constructiveEvents + hostileEvents)
    : 0.5;

  return {
    avgGoldstein,
    avgTone,
    eventCount,
    diplomaticCount,
    constructiveRatio,
    constructiveEvents,
    hostileEvents,
  };
}

/* ── Lightweight RSS parser ───────────────────────────── */
function decodeHTML(text) {
  return text
    ? text.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
          .replace(/&#8220;/g, '\"').replace(/&#8221;/g, '\"')
          .replace(/&#8216;/g, "'").replace(/&#8217;/g, "'")
          .replace(/&#8212;/g, '\u2014').replace(/&#8211;/g, '\u2013')
          .replace(/&#038;/g, '&').replace(/&amp;/g, '&')
          .replace(/&#8230;/g, '\u2026').replace(/&#39;/g, "'")
          .replace(/&#8211;/g, '\u2013')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014')
          .replace(/\&#\d+;/g, ' ')
          .trim()
    : '';
}

function parseRSS(xml, sourceName, feedType) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g);
  if (!itemMatches) return items;

  for (const block of itemMatches) {
    const titleMatch   = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch    = block.match(/<link>(.*?)<\/link>/);
    const dateRaw      = block.match(/<pubDate>(.*?)<\/pubDate>/);
    const categoryRaw  = block.match(/<category>(.*?)<\/category>/);

    if (!titleMatch || !linkMatch) continue;

    const title = decodeHTML(titleMatch[1]);
    if (!title || title.length < 10) continue;

    const link = linkMatch[1];
    const pubDate = dateRaw ? new Date(dateRaw[1]) : new Date();
    const dateStr = pubDate.toISOString().slice(0, 10);
    const category = categoryRaw ? decodeHTML(categoryRaw[1]).toLowerCase() : '';
    const searchable = (title.toLowerCase() + ' ' + category);

    // ── Exclusion filter (always applies, even for trusted feeds) ─
    let excluded = false;
    for (const kw of EXCLUDE_KEYWORDS) {
      if (searchable.includes(kw)) { excluded = true; break; }
    }
    if (excluded) continue;

    // ── ME relevance filter ───────────────────────────
    // 'media' feeds must pass primary keyword check;
    // 'thinktank' and 'me-news' skip this filter
    if (feedType === 'media') {
      let primaryHits = 0;
      for (const kw of RELEVANCE_PRIMARY)    if (searchable.includes(kw)) primaryHits++;
      if (primaryHits < 1) continue;
    }

    // ── Sentiment scoring ──────────────────────────────
    const lower = title.toLowerCase();
    const peaceW = ['peace', 'normalize', 'dialogue', 'deal', 'agreement', 'negotiat', 'ceasefire', 'truce', 'aid', 'corridor', 'swap', 'release', 'reconstruction', 'framework', 'vision', 'integration', 'cooperation', 'rebuild', 'resolution', 'humanitarian', 'mediation'];
    const warW   = ['attack', 'strike', 'deadly', 'killed', 'rocket', 'missile', 'drone', 'assassin', 'fury', 'lion', 'bombing', 'war', 'conflict', 'escalat', 'hijack', 'seized', 'casualt', 'sitrep', 'operation', 'target', 'threat', 'proxy'];

    let score = 0;
    for (const w of peaceW) if (lower.includes(w)) score++;
    for (const w of warW)   if (lower.includes(w)) score--;

    const sentiment = score > 0 ? 'peace' : score < 0 ? 'war' : 'neutral';

    items.push({ source: sourceName, title, link, date: dateStr, sentiment, timestamp: pubDate.getTime() });
  }
  return items;
}

/* ── Fetch publications from RSS feeds ────────────────── */
async function fetchPublications() {
  const allItems = [];

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSS(xml, feed.source, feed.type || 'media');
      // 'media' feeds: only keep items with 'peace' sentiment
      const filtered = feed.type === 'media'
        ? items.filter(item => item.sentiment === 'peace')
        : items;
      // Tag items with feed type for freshness filtering
      const tagged = filtered.map(item => ({ ...item, _feedType: feed.type }));
      allItems.push(...tagged.slice(0, feed.cap || 3));
    } catch { /* skip on error */ }
  }

  // Deduplicate by title, filter by freshness, sort by date (newest first)
  const now = Date.now();
  const seen = new Set();
  const thinktankMaxAgeMs = 90 * 24 * 60 * 60 * 1000; // 90 days for think tanks
  const unique = allItems.filter(item => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    // Skip stale articles; think tanks allowed 90 days, others 30
    const age = now - (item.timestamp || 0);
    const maxAge = item._feedType === 'thinktank' ? thinktankMaxAgeMs : MAX_AGE_MS;
    if (age > maxAge) return false;
    return true;
  });

  unique.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (unique.length === 0) return FALLBACK_PUBLICATIONS;
  // Strip internal _feedType before returning
  return unique.slice(0, 15).map(({ _feedType, ...item }) => item);
}

/* ── Fallback mock data ────────────────────────────────── */
const FALLBACK_PUBLICATIONS = [
  { source: "Mitvim", title: "Normalization Through Strength? A Dual Israeli–Saudi Examination", link: "https://mitvim.org.il/en/normalization-through-strength-a-dual-israeli-saudi-examination-of-power-perception-and-the-limits-of-military-centric/", date: "2026-04-20", timestamp: Date.parse("2026-04-20"), sentiment: "peace" },
  { source: "Times of Israel", title: "Israel-UAE Relations: A Strategic Partnership", link: "https://www.timesofisrael.com/", date: "2026-04-15", timestamp: Date.parse("2026-04-15"), sentiment: "peace" },
  { source: "JNS", title: "A Jewish Future in the Middle East", link: "https://www.jns.org/", date: "2026-04-10", timestamp: Date.parse("2026-04-10"), sentiment: "peace" },
  { source: "Al Monitor", title: "Regional Dynamics: Gulf-Israel Relations", link: "https://www.al-monitor.com/", date: "2026-03-25", timestamp: Date.parse("2026-03-25"), sentiment: "peace" }
];

const FALLBACK_SIGNALS = {
  tone:        { label: "Political Tone",      icon: "🤝", weight: 0.20, score: 60, history: [45,48,50,52,53,55,56,57,59,60], status: "Live",    detail: "55% constructive statements (7-day)" },
  news:        { label: "Diplomatic News",     icon: "📰", weight: 0.15, score: 65, history: [42,45,48,50,52,55,58,60,62,65], status: "Live",    detail: "62% peace-toned articles" },
  aviation:    { label: "Commercial Aviation",  icon: "✈️", weight: 0.12, score: 48, history: [35,37,39,40,42,43,45,46,47,48], status: "Live",    detail: "72 aircraft in ME airspace" },
  prediction:  { label: "Prediction Markets",   icon: "💰", weight: 0.10, score: 41, history: [20,22,25,28,30,33,35,37,39,41], status: "Live",    detail: "Ceasefire odds: 41% (Polymarket)" },
  credit:      { label: "Credit Ratings",       icon: "🏛", weight: 0.10, score: 50, history: [45,45,46,46,47,47,48,49,49,50], status: "Delayed", detail: "Israel: A-; Lebanon: C; Saudi: A" },
  travel:      { label: "Travel Advisories",    icon: "🛂", weight: 0.10, score: 30, history: [15,18,20,22,24,25,26,27,28,30], status: "Live",    detail: "US Level 3-4 avg; UK Level 3" },
  thinktank:   { label: "Think Tank & Expert",  icon: "🧠", weight: 0.10, score: 52, history: [30,32,35,38,40,44,47,49,50,52], status: "Live",    detail: "Mitvim: normalization framework paper" },
  conflict:    { label: "Conflict Events",      icon: "💥", weight: 0.08, score: 45, history: [30,32,35,38,40,42,45,48,50,45], status: "Delayed", detail: "GDELT: 12 hostile / 28 constructive / 40 total" },
  views:       { label: "VIEWS AI Forecast",    icon: "🌍", weight: 0.05, score: 62, history: [55,56,57,58,59,60,60,61,61,62], status: "Delayed", detail: "Declining predicted fatalities" },
  humanitarian:{ label: "Humanitarian",         icon: "🏥", weight: 0.01, score: 35, history: [10,12,15,18,20,22,25,28,32,35], status: "Live",    detail: "2 aid corridors, 1 prisoner swap" }
};

function calcMaster(signals) {
  let score = 0;
  for (const key of Object.keys(signals)) score += signals[key].score * signals[key].weight;
  return Math.round(score);
}

/* ── Handler ───────────────────────────────────────────── */
export async function onRequest(context) {
  try {
    const publications = await fetchPublications();

    // Fetch GDELT data (best effort, falls back to mock)
    const gdeltData = await fetchGDELT();

    // Compute tone signal from GDELT
    let toneScore, toneDetail, toneStatus;
    if (gdeltData && gdeltData.eventCount > 0) {
      // Goldstein Scale: -10 to +10 per event → map to 0-100
      // Average +10 → 100, 0 → 50, -10 → 0
      toneScore = Math.round(clamp(0, 100, 50 + (gdeltData.avgGoldstein / 10) * 50));
      toneDetail = `${gdeltData.eventCount} events, tone ${gdeltData.avgGoldstein > 0 ? '+' : ''}${gdeltData.avgGoldstein.toFixed(1)}, ${gdeltData.diplomaticCount} diplomatic`;
      toneStatus = 'Live';
    } else {
      toneScore = FALLBACK_SIGNALS.tone.score;
      toneDetail = FALLBACK_SIGNALS.tone.detail;
      toneStatus = 'Delayed';
    }

    // Compute diplomatic news signal from GDELT
    let newsScore, newsDetail, newsStatus;
    if (gdeltData && gdeltData.eventCount > 0) {
      newsScore = Math.round(clamp(3, 95, Math.round(Math.pow(gdeltData.constructiveRatio, 2) * 150)));
      newsDetail = `${gdeltData.diplomaticCount} diplomatic events / ${gdeltData.eventCount} total`;
      newsStatus = 'Live';
    } else {
      newsScore = FALLBACK_SIGNALS.news.score;
      newsDetail = FALLBACK_SIGNALS.news.detail;
      newsStatus = 'Delayed';
    }

    // Compute conflict events signal from GDELT
    let conflictScore, conflictDetail, conflictStatus;
    if (gdeltData && gdeltData.eventCount > 0) {
      // Violent event ratio: hostile events vs total, mapped to peace score
      // More hostile events = lower score
      const hostileRatio = gdeltData.eventCount > 0
        ? gdeltData.hostileEvents / gdeltData.eventCount
        : 0;
      // Invert: high hostile ratio → low peace score
      // 0 hostile → 100, 0.5 hostile → 50, 1.0 hostile → 0
      conflictScore = Math.round(clamp(0, 100, 100 - (hostileRatio * 100)));
      conflictDetail = `${gdeltData.hostileEvents} hostile / ${gdeltData.constructiveEvents} constructive / ${gdeltData.eventCount} total`;
      conflictStatus = 'Live';
    } else {
      conflictScore = FALLBACK_SIGNALS.conflict.score;
      conflictDetail = FALLBACK_SIGNALS.conflict.detail;
      conflictStatus = 'Delayed';
    }

    // Merge computed signals into fallback data
    const signals = { ...FALLBACK_SIGNALS };
    signals.tone = { ...signals.tone, score: toneScore, detail: toneDetail, status: toneStatus };
    signals.news = { ...signals.news, score: newsScore, detail: newsDetail, status: newsStatus };
    signals.conflict = { ...signals.conflict, score: conflictScore, detail: conflictDetail, status: conflictStatus };

    const masterScore = calcMaster(signals);

    const data = {
      timestamp: new Date().toISOString(),
      master: {
        score: masterScore,
        level: masterScore <= 25 ? 'Frozen' : masterScore <= 50 ? 'Thawing' : masterScore <= 75 ? 'Growing' : 'Flourishing',
        trend: 'rising'
      },
      signals,
      history: {
        labels: ["14:02","13:32","13:02","12:32","12:02","11:32","11:02","10:32","10:02","9:32","9:02","8:32"],
        scores: [42,44,46,47,49,50,52,53,55,56,57,58]
      },
      publications
    };

    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
        "Access-Control-Allow-Origin": "*",
      }
    });
  } catch (err) {
    console.error('Data fetch error:', err);
    return new Response(JSON.stringify({
      timestamp: new Date().toISOString(),
      master: { score: 58, level: "Thawing", trend: "rising" },
      signals: FALLBACK_SIGNALS,
      history: { labels: ["14:02","13:32","13:02"], scores: [55,57,58] },
      publications: FALLBACK_PUBLICATIONS
    }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_TTL}`,
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
}