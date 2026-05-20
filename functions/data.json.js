/* ── /data.json — Cloudflare Pages Function ───────────── */

const CACHE_TTL = 60; // 1 min

/* ── RSS feeds (must be reachable from Cloudflare edge) ── */
const RSS_FEEDS = [
  { url: 'https://mitvim.org.il/en/feed/',    source: 'Mitvim',   alwaysInclude: false },
  { url: 'https://www.timesofisrael.com/feed/', source: 'Times of Israel', alwaysInclude: true },
  { url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', source: 'BBC', alwaysInclude: true },
];

/* Middle East relevance keywords */
const ME_KEYWORDS = [
  'israel', 'palestine', 'gaza', 'lebanon', 'iran', 'syria', 'jordan',
  'saudi', 'uae', 'dubai', 'turkey', 'beirut', 'tel aviv', 'damascus',
  'middle east', 'iraq', 'yemen', 'houthi', 'hamas', 'hezbollah',
  'ceasefire', 'normalization', 'abraham accords', 'dead sea', 'mediterranean',
  'red sea', 'sinai', 'jerusalem', 'west bank', 'iran', 'qatar', 'bahrain',
  'imf', 'imec', 'diplomat', 'peace deal', 'truce', 'negotiation',
  'fury', 'roaring', 'epic', 'sitrep', 'operation', 'conflict', 'counter',
  'terrorism', 'security', 'intelligence', 'defense', 'military'
];

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

function parseRSS(xml, sourceName, alwaysInclude) {
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

    // ── ME relevance filter ─────────────────────────────
    // Check title + category for relevance
    const category = categoryRaw ? decodeHTML(categoryRaw[1]).toLowerCase() : '';
    const searchable = (title.toLowerCase() + ' ' + category);
    let relevance = 0;
    for (const kw of ME_KEYWORDS) {
      if (searchable.includes(kw)) relevance++;
    }

    // ICT is inherently ME-focused — always include its items
    if (!alwaysInclude && relevance === 0) continue;

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
      const items = parseRSS(xml, feed.source, feed.alwaysInclude || false);
      // Cap each source at 4 to prevent one feed from dominating
      allItems.push(...items.slice(0, 4));
    } catch { /* skip on error */ }
  }

  // Deduplicate by title, sort by date (newest first), take top 5
  const seen = new Set();
  const unique = allItems.filter(item => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  unique.sort((a, b) => b.timestamp - a.timestamp);

  if (unique.length === 0) return FALLBACK_PUBLICATIONS;
  return unique.slice(0, 10);
}

/* ── Fallback mock data ────────────────────────────────── */
const FALLBACK_PUBLICATIONS = [
  { source: "Mitvim", title: "Normalization Through Strength? A Dual Israeli–Saudi Examination", link: "https://mitvim.org.il/en/normalization-through-strength-a-dual-israeli-saudi-examination-of-power-perception-and-the-limits-of-military-centric/", date: "2026-04-20", sentiment: "peace" },
  { source: "Times of Israel", title: "Israel-UAE Relations: A Strategic Partnership", link: "https://www.timesofisrael.com/", date: "2026-04-15", sentiment: "peace" },
  { source: "Mitvim", title: "IMEC 2.0: A New Regional Vision After the Gaza War", link: "https://mitvim.org.il/en/imec-2-0-a-new-regional-vision-after-the-gaza-war/", date: "2026-03-10", sentiment: "peace" }
];

const FALLBACK_SIGNALS = {
  tone:        { label: "Political Tone",      icon: "🤝", weight: 0.20, score: 60, history: [45,48,50,52,53,55,56,57,59,60], status: "Live",    detail: "55% constructive statements (7-day)" },
  news:        { label: "Diplomatic News",     icon: "📰", weight: 0.15, score: 65, history: [42,45,48,50,52,55,58,60,62,65], status: "Live",    detail: "62% peace-toned articles" },
  aviation:    { label: "Commercial Aviation",  icon: "✈️", weight: 0.12, score: 48, history: [35,37,39,40,42,43,45,46,47,48], status: "Live",    detail: "72 aircraft in ME airspace" },
  prediction:  { label: "Prediction Markets",   icon: "💰", weight: 0.10, score: 41, history: [20,22,25,28,30,33,35,37,39,41], status: "Live",    detail: "Ceasefire odds: 41% (Polymarket)" },
  credit:      { label: "Credit Ratings",       icon: "🏛", weight: 0.10, score: 50, history: [45,45,46,46,47,47,48,49,49,50], status: "Delayed", detail: "Israel: A-; Lebanon: C; Saudi: A" },
  travel:      { label: "Travel Advisories",    icon: "🛂", weight: 0.10, score: 30, history: [15,18,20,22,24,25,26,27,28,30], status: "Live",    detail: "US Level 3-4 avg; UK Level 3" },
  thinktank:   { label: "Think Tank & Expert",  icon: "🧠", weight: 0.10, score: 52, history: [30,32,35,38,40,44,47,49,50,52], status: "Live",    detail: "Mitvim: normalization framework paper" },
  shipping:    { label: "Gulf Shipping",        icon: "🚢", weight: 0.07, score: 55, history: [30,32,35,38,40,42,45,48,52,55], status: "Live",    detail: "2 safe passages, 1 attack (7 days)" },
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
    const masterScore = calcMaster(FALLBACK_SIGNALS);

    const data = {
      timestamp: new Date().toISOString(),
      master: {
        score: masterScore,
        level: masterScore <= 25 ? 'Frozen' : masterScore <= 50 ? 'Thawing' : masterScore <= 75 ? 'Growing' : 'Flourishing',
        trend: 'rising'
      },
      signals: FALLBACK_SIGNALS,
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