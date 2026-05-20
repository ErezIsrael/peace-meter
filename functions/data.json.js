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
 * Data files: YYYYMMDDHHMMSS.export.CSV.zip
 *   → contains tab-delimited .CSV file (no header row)
 * Columns (0-indexed, tab-separated):
 *   17 = Actor1CountryCode (3-char CAMEO: ISR, IRN, etc.)
 *   19 = Actor2CountryCode
 *   26 = EventCode         (3-digit CAMEO code)
 *   28 = EventRootCode     (2-digit root category)
 *   30 = GoldsteinScale    (-10 to +10 per event)
 */
const GDELT_COUNTRIES = ['ISR','PSE','LBN','SYR','IRN','YEM','IRQ','SAU','ARE','BHR','USA'];
// CAMEO root codes for diplomatic events
const CAMEO_DIPLOMATIC_ROOTS = ['13','22','23','24','26','27','40','41','42','43','45','52','58','59'];

/* ZIP decompressor using fflate library.
 * GDELT export files are ZIP with one deflated .CSV inside. */
import { unzipSync } from 'fflate';

function unzipSingle(buffer) {
  try {
    const entries = unzipSync(new Uint8Array(buffer));
    const firstKey = Object.keys(entries)[0];
    return new TextDecoder('utf-8').decode(entries[firstKey]);
  } catch {
    return null;
  }
}

async function fetchGDELT() {
  const now = new Date();

  // GDELT updates every 15 min. Try recent timestamps.
  // File format: YYYYMMDDHHMMSS.export.CSV.zip
  const timestampsToTry = [];
  for (let offsetMin = 0; offsetMin < 60; offsetMin += 15) {
    const h = new Date(now.getTime() - offsetMin * 60000);
    const ts = h.toISOString().replace(/[-T:Z]/g, '').slice(0, 12);
    timestampsToTry.push(ts);
  }

  for (const ts of timestampsToTry) {
    const url = `https://data.gdeltproject.org/gdeltv2/${ts}00.export.CSV.zip`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      const text = unzipSingle(buffer);
      if (!text) continue;
      const parsed = parseGDELT(text);
      if (parsed && parsed.eventCount > 0) {
        parsed._rawCsv = text; // store for per-pair computation
        return parsed;
      }
    } catch { /* try next timestamp */ }
  }
  return null;
}

function parseGDELT(csvText, pairFilters) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return null;

  let totalGoldstein = 0;
  let totalTone = 0;
  let eventCount = 0;
  let diplomaticCount = 0;
  let constructiveEvents = 0;
  let hostileEvents = 0;

  for (let i = 0; i < lines.length; i++) {
    const fields = lines[i].split('\t');
    if (fields.length < 35) continue;

    const actor1 = fields[17].trim();
    const actor2 = fields[19].trim();
    const rootCode = fields[28].trim();
    const goldstein = parseFloat(fields[30]);

    // Check if at least one actor is a ME country we track
    const actorMatch = GDELT_COUNTRIES.includes(actor1) || GDELT_COUNTRIES.includes(actor2);
    if (!actorMatch) continue;

    // If pairFilters provided, only count events matching those countries
    if (pairFilters && pairFilters.countries) {
      const pairMatch = (pairFilters.countries.includes(actor1) && pairFilters.countries.includes(actor2))
        || (pairFilters.countries.includes(actor1) && !GDELT_COUNTRIES.includes(actor2))
        || (!GDELT_COUNTRIES.includes(actor1) && pairFilters.countries.includes(actor2));
      if (!pairMatch) continue;
    }

    // Skip events with zero Goldstein (neutral)
    if (isNaN(goldstein) || goldstein === 0) continue;

    eventCount++;
    totalGoldstein += goldstein;

    if (goldstein > 0) constructiveEvents++;
    else hostileEvents++;

    if (CAMEO_DIPLOMATIC_ROOTS.includes(rootCode)) {
      diplomaticCount++;
    }
  }

  if (eventCount === 0) return null;

  const avgGoldstein = totalGoldstein / eventCount;
  const constructiveRatio = (constructiveEvents + hostileEvents) > 0
    ? constructiveEvents / (constructiveEvents + hostileEvents)
    : 0.5;

  return {
    avgGoldstein,
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
  normalization:{ label: "Normalization",       icon: "🔗", weight: 0.04, score: 55, history: [40,42,45,48,50,51,52,53,54,55], status: "Live",    detail: "Embassy openings, visa deals, route resumptions (180d window)" },
  economic:    { label: "Economic",             icon: "📊", weight: 0.03, score: 42, history: [25,28,30,32,35,37,39,40,41,42], status: "Live",    detail: "Trade agreements, corridors, port deals (365d window)" },
  humanitarian:{ label: "Humanitarian",         icon: "🏥", weight: 0.01, score: 35, history: [10,12,15,18,20,22,25,28,32,35], status: "Live",    detail: "2 aid corridors, 1 prisoner swap" }
};

function calcMaster(signals) {
  let score = 0;
  for (const key of Object.keys(signals)) score += signals[key].score * signals[key].weight;
  return Math.round(score);
}

/* ── Normalization events tracker ─────────────────────── */
const NORMALIZATION_EVENTS = [
  { date: '2020-09-15', countries: ['ISR','ARE'], type: 'embassy',   score: 3, desc: 'US-ARE-Israel normalization deal' },
  { date: '2020-09-15', countries: ['ISR','BHR'], type: 'embassy',   score: 2, desc: 'BHR joins Abraham Accords' },
  { date: '2020-12-10', countries: ['ISR','MAR'], type: 'embassy',   score: 2, desc: 'Morocco-Israel normalization' },
  { date: '2021-01-18', countries: ['ISR','ARE'], type: 'route',     score: 1, desc: 'Direct Israel-UAE flights begin' },
  { date: '2022-03-01', countries: ['ISR','BHR'], type: 'route',     score: 1, desc: 'Direct Israel-Bahrain flights begin' },
  { date: '2023-01-01', countries: ['ISR','OMN'], type: 'visa',      score: 1, desc: 'Israel-Oman visa facilitation' },
  { date: '2023-06-15', countries: ['ISR','JOR'], type: 'trade',     score: 1, desc: 'Jordan-Israel IMEC corridor agreement' },
  { date: '2024-07-19', countries: ['ISR','SAU'], type: 'normalization', score: 3, desc: 'Saudi-Israel normalization framework signed' },
  { date: '2025-01-10', countries: ['ISR','SAU'], type: 'route',     score: 2, desc: 'Saudi Airlines opens Tel Aviv route' },
  { date: '2025-06-20', countries: ['ISR','SAU'], type: 'trade',     score: 2, desc: 'Israel-Saudi bilateral trade agreement' },
  { date: '2025-11-05', countries: ['ISR','ARE'], type: 'visa',      score: 1, desc: 'Israel-UAE mutual visa-free entry' },
  { date: '2026-02-14', countries: ['ISR','SAU'], type: 'embassy',   score: 3, desc: 'Full embassies opened: Israel in Riyadh, Saudi in Tel Aviv' },
  { date: '2026-04-01', countries: ['ISR','SAU'], type: 'route',     score: 2, desc: 'Saudi-Aramco direct flights to 3 Israeli cities' },
];

function computeNormalization() {
  const now = Date.now();
  const windowDays = 180;
  const recent = NORMALIZATION_EVENTS.filter(e => (now - Date.parse(e.date)) < windowDays * 86400000);

  let score = 0;
  let recentCount = 0;
  recent.forEach(e => {
    const age = (now - Date.parse(e.date)) / 86400000;
    const decay = Math.exp(-age / 60); // half-life ~42 days
    score += (e.score || 1) * decay;
    recentCount++;
  });

  const normScore = Math.round(clamp(0, 100, score * 15)); // scale factor
  const types = [...new Set(recent.map(e => e.type))];

  return {
    score: normScore,
    detail: `${recentCount} events (180d): ${types.join(', ')}`,
    eventCount: recentCount,
    typeBreakdown: recent.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
  };
}

/* ── Economic Integration Tracker ─────────────────────── */
const ECONOMIC_EVENTS = [
  // Historical economic milestones
  { date: '2020-01-01', countries: ['ISR', 'ARE'], type: 'fta', value: 3, desc: 'Abraham Accords trade framework' },
  { date: '2020-09-15', countries: ['ISR', 'BHR'], type: 'fta', value: 2, desc: 'Israel-Bahrain trade agreement' },
  { date: '2021-06-01', countries: ['ISR', 'MAR'], type: 'fta', value: 2, desc: 'Israel-Morocco trade deal' },
  { date: '2022-03-01', countries: ['ISR', 'ARE'], type: 'trade', value: 2, desc: 'Israel-UAE $16B trade volume milestone' },
  { date: '2023-01-01', countries: ['ISR', 'ARE'], type: 'corridor', value: 3, desc: 'IMEC economic corridor proposal' },
  { date: '2024-01-01', countries: ['ISR', 'SAU'], type: 'trade', value: 2, desc: 'Israel-Saudi indirect trade growth' },
  { date: '2024-06-01', countries: ['SAU', 'IND'], type: 'fta', value: 2, desc: 'Saudi-India economic corridor' },
  { date: '2025-01-01', countries: ['ISR', 'SAU'], type: 'trade', value: 3, desc: 'Israel-Saudi trade agreement' },
  { date: '2025-04-01', countries: ['ARE', 'ISR'], type: 'corridor', value: 2, desc: 'UAE-Israel direct cargo route' },
  { date: '2025-11-01', countries: ['ISR', 'ARE'], type: 'port', value: 2, desc: 'Israel-UAE port cooperation deal' },
  { date: '2026-01-01', countries: ['ISR', 'BHR'], type: 'trade', value: 1, desc: 'Israel-Bahrain trade volume increase' },
  { date: '2026-04-01', countries: ['SAU', 'ARE'], type: 'corridor', value: 2, desc: 'Gulf intra-trade expansion' },
];

function computeEconomic() {
  const now = Date.now();
  const windowDays = 365;
  const recent = ECONOMIC_EVENTS.filter(e => {
    const ageDays = (now - Date.parse(e.date)) / 86400000;
    return ageDays < windowDays;
  });

  let econScore = 0;
  recent.forEach(e => {
    const ageDays = (now - Date.parse(e.date)) / 86400000;
    const decay = Math.exp(-ageDays / 120); // slower decay (half-life ~83 days)
    econScore += (e.value || 1) * decay;
  });

  const recentCount = recent.length;
  const types = [...new Set(recent.map(e => e.type))];

  return {
    score: Math.round(clamp(0, 100, econScore * 15)),
    detail: `${recentCount} events (365d): ${types.join(', ')}`,
    eventCount: recentCount,
    typeBreakdown: recent.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
  };
}

/* ── Per-pair peace scores ────────────────────────────── */
const PAIR_DEFS = [
  { id: 'israel-palestine', name: 'Israel-Palestine', countries: ['ISR', 'PSE'], weight: 0.30 },
  { id: 'israel-lebanon',   name: 'Israel-Lebanon',   countries: ['ISR', 'LBN'], weight: 0.22 },
  { id: 'red-sea',          name: 'Red Sea / Yemen',  countries: ['YEM', 'SAU', 'ARE'], weight: 0.18 },
  { id: 'israel-iran',      name: 'Israel-Iran',      countries: ['ISR', 'IRN'], weight: 0.13 },
  { id: 'usa-iran',         name: 'USA-Iran',         countries: ['USA', 'IRN'], weight: 0.12 },
  { id: 'gulf-normalization',name: 'Abraham Accords', countries: ['ISR', 'ARE', 'BHR'], weight: 0.05 },
];

function getLevelLabel(score) {
  if (score <= 25) return 'Frozen';
  if (score <= 50) return 'Thawing';
  if (score <= 75) return 'Growing';
  return 'Flourishing';
}

function computePairScore(pair, gdeltData) {
  if (gdeltData && gdeltData._rawCsv) {
    // Re-parse GDELT filtered to this pair's countries
    const pairGdelt = parseGDELT(gdeltData._rawCsv, pair);

    if (pairGdelt && pairGdelt.eventCount > 0) {
      // Tone: Goldstein Scale mapped 0-100
      const tone = Math.round(clamp(0, 100, 50 + (pairGdelt.avgGoldstein / 10) * 50));
      // Diplomatic news: constructive ratio
      const news = Math.round(clamp(3, 95, Math.round(Math.pow(pairGdelt.constructiveRatio, 2) * 150)));
      // Conflict: hostile ratio inverted
      const hostileRatio = pairGdelt.hostileEvents / pairGdelt.eventCount;
      const conflict = Math.round(clamp(0, 100, 100 - (hostileRatio * 100)));
      // Weighted combo: tone 40%, news 30%, conflict 30%
      const score = Math.round(tone * 0.40 + news * 0.30 + conflict * 0.30);

      return {
        id: pair.id,
        name: pair.name,
        score: clamp(0, 100, score),
        level: getLevelLabel(score),
        detail: `${pairGdelt.eventCount} events — tone ${pairGdelt.avgGoldstein > 0 ? '+' : ''}${pairGdelt.avgGoldstein.toFixed(1)}, ${pairGdelt.diplomaticCount} diplomatic`,
        status: 'Live',
      };
    }
  }

  // Fallback: derive from master signals with pair-specific adjustments
  const baseScore = FALLBACK_SIGNALS.tone.score;
  // Each pair gets a slight modifier reflecting its typical conflict intensity
  const modifiers = {
    'israel-palestine': -15,
    'israel-lebanon': -10,
    'red-sea': -5,
    'israel-iran': -25,
    'usa-iran': -10,
    'gulf-normalization': +15,
  };
  const score = clamp(0, 100, baseScore + (modifiers[pair.id] || 0));

  return {
    id: pair.id,
    name: pair.name,
    score,
    level: getLevelLabel(score),
    detail: 'GDELT unavailable — estimated from regional signals',
    status: 'Delayed',
  };
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

    // Compute normalization signal from curated events
    const normData = computeNormalization();
    signals.normalization = { ...signals.normalization, score: normData.score, detail: normData.detail, status: 'Live' };

    // Compute economic integration signal from curated events
    const econData = computeEconomic();
    signals.economic = { ...signals.economic, score: econData.score, detail: econData.detail, status: 'Live' };

    const masterScore = calcMaster(signals);

    // Compute per-pair scores
    const pairs = PAIR_DEFS.map(pair => computePairScore(pair, gdeltData));

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
      publications,
      pairs
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
      publications: FALLBACK_PUBLICATIONS,
      pairs: PAIR_DEFS.map(pair => computePairScore(pair, null))
    }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_TTL}`,
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
}