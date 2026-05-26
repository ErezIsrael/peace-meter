/*
 * /peace-room/data.json — Cloudflare Pages Function
 *
 * Architecture:
 *  1. Fetch 18 RSS feeds in parallel (news + humanitarian + thinktank + govt)
 *  2. Filter to ME-related, deduplicate
 *  3. Classify each article into a solution bucket via keyword + context matching
 *  4. Compute sentiment, direction, phase progress per solution
 *  5. Return JSON matching Peace Room frontend schema
 *
 * Browser caches 3h via Cache-Control. Falls back to static data.json on error.
 */

/* ═══════════════════════════════════════════════════════════
   RSS FEEDS — categorized by type for balanced coverage
   ═══════════════════════════════════════════════════════════ */

const RSS_FEEDS = [
  // ── General ME news (broad coverage, high volume) ──
  { url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', source: 'BBC ME', cap: 6 },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', cap: 6 },
  { url: 'https://www.theguardian.com/world/israel/rss', source: 'Guardian', cap: 5 },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml', source: 'NYT ME', cap: 5 },
  { url: 'http://rss.cnn.com/rss/edition_meast.rss', source: 'CNN ME', cap: 4 },
  { url: 'https://www.al-monitor.com/rss', source: 'Al Monitor', cap: 5 },
  { url: 'https://www.middleeastmonitor.com/feed/', source: 'ME Monitor', cap: 5 },
  { url: 'https://www.middleeasteye.net/rss', source: 'ME Eye', cap: 4 },
  { url: 'https://www.france24.com/en/middle-east/rss', source: 'France24', cap: 4 },

  // ── Israel-focused (English) ──
  { url: 'https://www.timesofisrael.com/feed/', source: 'Times of Israel', cap: 5 },
  { url: 'https://www.haaretz.com/srv/haaretz-latest-headlines', source: 'Haaretz', cap: 5 },
  { url: 'https://rss.jpost.com/rss/rssfeedsfrontpage.aspx', source: 'JPost', cap: 4 },
  { url: 'https://www.i24news.tv/en/rss', source: 'i24NEWS', cap: 4 },
  { url: 'https://www.israel21c.org/feed/', source: 'Israel21c', cap: 3 },
  { url: 'https://www.israelnationalnews.com/Rss.aspx?act=.1', source: 'Arutz Sheva', cap: 3 },

  // ── Humanitarian / UN / NGO ──
  { url: 'https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml', source: 'UN News', cap: 5 },
  { url: 'https://www.amnesty.org/en/location/middle-east-and-north-africa/feed/', source: 'Amnesty', cap: 3 },
  { url: 'https://forward.com/rss/', source: 'The Forward', cap: 3 },
  { url: 'https://www.idf.il/en/rss/', source: 'IDF', cap: 3 },

  // ── Think tanks / analysis ──
  { url: 'https://www.brookings.edu/topic/middle-east-north-africa/feed/', source: 'Brookings', cap: 3 },
  { url: 'https://www.crisisgroup.org/rss/91', source: 'Crisis Group', cap: 3 },
  { url: 'https://mitvim.org.il/en/feed/', source: 'Mitvim', cap: 3 },
  { url: 'https://www.inss.org.il/feed/', source: 'INSS', cap: 3 },
  { url: 'https://feeds.feedburner.com/lsemiddleeastcentre', source: 'LSE ME Centre', cap: 2 },
];

/* ═══════════════════════════════════════════════════════════
   SOLUTIONS — 8 tracks covering the current conflict landscape
   ═══════════════════════════════════════════════════════════ */

const SOLUTIONS = {
  'ceasefire': {
    icon: '🕊', name: 'Ceasefire & De-escalation',
    phases: ['Active Fighting', 'Ceasefire Talks', 'Draft Agreement', 'Signed', 'Holding'],
    primary: ['ceasefire', 'truce', 'cease fire', 'cease-fire', 'armistice',
              'end hostilities', 'de-escalation', 'deescalation',
              'pause fighting', 'halt fire', 'violations ceasefire',
              'fire cease', 'fighting stops', 'war ends', 'end war'],
    context: {
      locations: ['gaza', 'lebanon', 'beirut', 'syria', 'iran', 'israel', 'hezbollah'],
      patterns: ['border calm', 'mediation', 'mediator', 'negotiations',
                 'peace talks', 'qatar mediation', 'egypt mediates',
                 'intense strikes', 'offensive', 'crush', 'escalat',
                 'intensif', 'bombardment', 'air strikes', 'raid',
                 'ground offensive', 'military operation', 'hostilities'],
    },
  },
  'aid': {
    icon: '🚚', name: 'Humanitarian Aid',
    phases: ['Blocked', 'Limited Access', 'Corridors Open', 'Steady Flow', 'Full Access'],
    primary: ['humanitarian aid', 'aid corridor', 'aid truck', 'aid delivery',
              'food aid', 'medical aid', 'relief supplies', 'wfp',
              'kerem shalom', 'rafaq crossing', 'nitzanim',
              'humanitarian access', 'aid resumed', 'aid corridor open',
              'supply delivery', 'food delivery', 'relief truck',
              'fuel delivery', 'water delivery', 'food stocks',
              'un ochaa', 'ocha', 'unrwa', 'crossing trucks',
              'aid convoy', 'humanitarian corridor'],
    context: {
      locations: ['gaza', 'lebanon', 'syria', 'yemen', 'west bank'],
      patterns: ['flotilla', 'relief', 'supplies', 'starvation',
                 'food crisis', 'water crisis', 'medical supplies',
                 'aid blocked', 'aid denied', 'aid restrictions',
                 'malnutrition', 'famine', 'displacement', 'displaced',
                 'refugee', 'refugees', 'idp', 'internally displaced',
                 'shelter', 'msf', 'doctors without borders',
                 'facial injuries', 'hospital', 'medicine', 'medicines'],
    },
  },
  'diplomacy': {
    icon: '🤝', name: 'Diplomacy & Regional Deals',
    phases: ['Isolated', 'Back-channel', 'Framework', 'New Partners', 'Regional Peace'],
    primary: ['abraham accords', 'normalization', 'normalize relations',
              'diplomatic ties', 'peace deal', 'iraq peace deal',
              'iran deal', 'iran agreement', 'nuclear deal'],
    context: {
      locations: [],
      patterns: ['saudi-israel', 'saudi arabia israel', 'direct flights',
                 'riyadh tel aviv', 'trade agreement',
                 'uae israel', 'morocco israel', 'bahrain israel', 'oman israel',
                 'diplomatic mission', 'embassy opening', 'visa agreement',
                 'gulf cooperation', 'arab normalization',
                 'saudi flights', 'uae trade', 'diplomatic relations',
                 'normaliz', 'nuclear', 'strait of hormuz', 'hormuz',
                 'iran us', 'us iran', 'rubio', 'state department'],
    },
  },
  'governance': {
    icon: '🏛', name: 'Post-War Governance',
    phases: ['No Framework', 'Proposals', 'Consensus', 'Interim Gov', 'Sustainable'],
    primary: ['gaza governance', 'post-war', 'interim authority',
              'palestinian authority', 'pa reform', 'elections gaza',
              'self-rule', 'self rule', 'reconstruction authority',
              'un administration', 'political framework', 'governance plan',
              'gaza government', 'transitional authority',
              'two state', 'political solution', 'power sharing'],
    context: {
      locations: ['gaza', 'palestine', 'west bank', 'syria'],
      patterns: ['post conflict', 'occupation', 'annexation',
                 'self determination', 'statehood', 'palestinian state',
                 'palestinian government', 'reform', 'authority',
                 'transition plan', 'future of gaza', 'security council',
                 'united nations', 'guterres', 'arab league'],
    },
  },
  'infrastructure': {
    icon: '💧', name: 'Infrastructure & Recovery',
    phases: ['Destroyed', 'Emergency Repairs', 'Partial', 'Reconstruction', 'Full Recovery'],
    primary: ['reconstruction', 'rebuild gaza', 'infrastructure',
              'water treatment', 'power grid', 'al-shifa',
              'reconstruction fund', 'donor conference',
              'hospital reopen'],
    context: {
      locations: ['gaza', 'lebanon', 'syria', 'iran', 'yemen'],
      patterns: ['rebuild', 'repair', 'power station', 'water plant',
                 'generators', 'electricity', 'hospital', 'school',
                 'housing', 'building', 'destroyed', 'demolished',
                 'water supply', 'power grid', 'rebuilding',
                 'recovery fund', 'energy', 'energy war', 'oil',
                 'port', 'airport', 'bridge', 'road',
                 'civilian homes', 'destruction', 'levelled'],
    },
  },
  'iran': {
    icon: '☣️', name: 'Iran Nuclear & War',
    phases: ['War', 'Ceasefire Talks', 'Armistice', 'Nuclear Deal', 'Resolution'],
    primary: ['iran us', 'us iran', 'iran deal', 'iran agreement',
              'iran war', 'iran ceasefire', 'nuclear deal',
              'iraq nuclear', 'iran nuclear'],
    context: {
      locations: ['iran', 'tehran', 'isfahan', 'hormuz'],
      patterns: ['strait of hormuz', 'hormuz', 'nuclear', 'missile',
                 'rubio', 'state department', 'oil', 'war with iran',
                 'iranian missile', 'iranian strike', 'iran attack',
                 'iran peace', 'iran talks', 'iran terms',
                 'gulf states', 'khamenei', 'supreme leader'],
    },
  },
  'lebanon': {
    icon: '🇱🇧', name: 'Lebanon & Hezbollah',
    phases: ['Active Fighting', 'De-escalation', 'Ceasefire', 'Withdrawal', 'Stable'],
    primary: ['lebanon', 'hezbollah', 'southern lebanon', 'south lebanon'],
    context: {
      locations: ['lebanon', 'beirut', 'hezbollah', 'nagorno'],
      patterns: ['strikes', 'drone', 'uav', 'border', 'idf',
                 'withdrawal', 'withdraw', 'killing', 'killed',
                 'civilian', 'children', 'bombardment', 'raid',
                 'ground offensive', 'occupation'],
    },
  },
  'gaza-crisis': {
    icon: '🏚', name: 'Gaza Humanitarian Crisis',
    phases: ['Blockade', 'Aid Inflow', 'Recovery', 'Rebuilding', 'Stabilized'],
    primary: ['gaza crisis', 'gaza famine', 'gaza starvation', 'gaza death',
              'gaza hospital', 'gaza water', 'gaza medicine',
              'gaza displacement', 'gaza aid blocked', 'gaza siege',
              'gaza blockade'],
    context: {
      locations: ['gaza'],
      patterns: ['displacement', 'refugee', 'famine', 'starvation',
                 'malnutrition', 'water crisis', 'medicine shortage',
                 'aid denied', 'aid blocked', 'siege', 'civilian death',
                 'hospital destroyed', 'civilian killed', 'shelling'],
    },
  },
  'human-rights': {
    icon: '⚖️', name: 'Human Rights & Intl Law',
    phases: ['Allegations', 'Investigations', 'Sanctions', 'Accountability', 'Reform'],
    primary: ['human rights', 'war crimes', 'icc', 'icj',
              'genocide', 'flotilla', 'activists arrested',
              'international court', 'war crime',
              'human rights violation', 'abuse allegations'],
    context: {
      locations: ['gaza', 'west bank', 'israel', 'icc', 'icj'],
      patterns: ['war crime', 'human rights', 'icc', 'icj',
                 'genocide', 'crimes against humanity',
                 'arrest warrant', 'sanctions', 'flotilla',
                 'activist', 'msf', 'amnesty', 'hrw'],
    },
  },
  'domestic-politics': {
    icon: '🏛', name: 'Israeli Domestic Politics',
    phases: ['Fractured', 'Coalition Shift', 'Policy Change', 'Elections', 'Stability'],
    primary: ['netanyahu', 'herzog', 'knesset', 'coalition',
              'israeli election', 'israeli politics',
              'israeli protest', 'judicial reform',
              'liberal center', 'opposition'],
    context: {
      locations: ['israel', 'tel aviv', 'jerusalem'],
      patterns: ['netanyahu', 'coalition', 'knesset', 'herzog',
                 'protest', 'demonstration', 'election', 'polls',
                 'political', 'prime minister', 'president'],
    },
  },
  'west-bank': {
    icon: '🔥', name: 'West Bank & Settlements',
    phases: ['Escalation', 'Violence Spike', 'Mediation', 'Calming', 'Frozen Conflict'],
    primary: ['west bank', 'settler violence', 'settlements',
              'east jerusalem', 'hebron', 'nablus',
              'al-aqsa', 'west bank violence'],
    context: {
      locations: ['west bank', 'hebron', 'nablus', 'ramallah', 'jenin'],
      patterns: ['settler', 'settlement', 'occupation', 'violence',
                 'raid', 'arrest', 'killed', 'demolish',
                 'palestinian', 'east jerusalem', 'al-aqsa'],
    },
  },
  'regional': {
    icon: '🌍', name: 'Regional Relations',
    phases: ['Tensions', 'Diplomatic Push', 'Accord', 'Integration', 'Cooperation'],
    primary: ['jordan', 'egypt', 'turkey', 'turkiye', 'morocco',
              'saudi arabia', 'uae', 'qatar', 'arab league',
              'regional diplomacy', 'china middle east'],
    context: {
      locations: ['jordan', 'egypt', 'turkey', 'morocco', 'uae', 'qatar', 'bahrain', 'oman'],
      patterns: ['arab', 'diplomatic', 'regional', 'gulf',
                 'mediation', 'summit', 'china', 'russia',
                 'saudi', 'turkey', 'turkiye', 'morocco'],
    },
  },
};

/* ═══════════════════════════════════════════════════════════
   SENTIMENT
   ═══════════════════════════════════════════════════════════ */

const POSITIVE_WORDS = ['agreed', 'signed', 'resumed', 'reopened', 'released',
  'opened', 'announced', 'begins', 'begun', 'cooperation', 'deal',
  'progress', 'accepted', 'confirmed', 'facilitated', 'restored',
  'growing', 'completed', 'back online', 'advance', 'improved',
  'rebuilding', 'settlement', 'resolution', 'peace', 'lowered',
  'de-escalation', 'ceasefire', 'truce', 'normaliz'];

const NEGATIVE_WORDS = ['killed', 'deadly', 'attack', 'strike', 'bombing',
  'violation', 'rejected', 'refuses', 'refused', 'closed', 'closure',
  'demolished', 'destroyed', 'halted', 'suspended', 'delayed',
  'fail', 'failed', 'stalled', 'stuck', 'deadlock', 'escalat',
  'declining', 'crisis', 'denied', 'deprived', 'devastated',
  'intensif', 'offensive', 'crush', 'abuse', 'beating',
  'death penalty', 'execution', 'war', 'hostilities'];

function classifySentiment(text) {
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) pos++;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) neg++;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

/* ═══════════════════════════════════════════════════════════
   RSS PARSING
   ═══════════════════════════════════════════════════════════ */

function decodeHTML(text) {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8216;/g, "'").replace(/&#8217;/g, "'")
    .replace(/&#8212;/g, '\u2014').replace(/&#8211;/g, '\u2013')
    .replace(/&#038;/g, '&').replace(/&amp;/g, '&')
    .replace(/&#8230;/g, '\u2026').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014')
    .replace(/\&#\d+;/g, ' ').trim();
}

function parseRSS(xml, sourceName) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g);
  if (!itemMatches) return items;
  for (const block of itemMatches) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch  = block.match(/<link>(.*?)<\/link>/);
    const dateRaw    = block.match(/<pubDate>(.*?)<\/pubDate>/);
    if (!titleMatch || !linkMatch) continue;
    const title = decodeHTML(titleMatch[1]);
    if (!title || title.length < 10) continue;
    const pubDate = dateRaw ? new Date(dateRaw[1]) : new Date();
    if (isNaN(pubDate.getTime())) continue;
    items.push({ source: sourceName, title, link: linkMatch[1], date: pubDate.toISOString(), timestamp: pubDate.getTime() });
  }
  return items;
}

/* ═══════════════════════════════════════════════════════════
   ME RELEVANCE FILTER
   ═══════════════════════════════════════════════════════════ */

const ME_KEYWORDS = [
  'israel', 'palestine', 'gaza', 'west bank', 'hamas', 'iran',
  'lebanon', 'hezbollah', 'syria', 'yemen', 'houthi', 'red sea',
  'egypt', 'saudi', 'uae', 'dubai', 'qatar', 'doha', 'jordan',
  'amman', 'bahrain', 'morocco', 'tunis', 'iraq', 'baghdad',
  'tel aviv', 'jerusalem', 'beirut', 'damascus', 'riyadh',
  'middle east', 'sinai', 'dead sea', 'isfahan', 'hormuz',
  'arab', 'mideast', 'mideast',
];

function isMiddleEastRelated(text) {
  const lower = text.toLowerCase();
  return ME_KEYWORDS.some(kw => lower.includes(kw));
}

/* ═══════════════════════════════════════════════════════════
   SMART CLASSIFIER — primary + context-aware
   ═══════════════════════════════════════════════════════════ */

function classifyArticle(title) {
  const lower = title.toLowerCase();
  const matches = [];

  for (const [solId, cfg] of Object.entries(SOLUTIONS)) {
    // Primary keywords — highest confidence (score 3)
    for (const kw of cfg.primary) {
      if (lower.includes(kw)) {
        matches.push({ solution: solId, score: 3 });
        break;
      }
    }
    // Context patterns — only if location hint present (score 2)
    if (!matches.some(m => m.solution === solId) && cfg.context && cfg.context.locations.length > 0) {
      const hasLocation = cfg.context.locations.some(loc => lower.includes(loc));
      if (hasLocation) {
        for (const pat of cfg.context.patterns) {
          if (lower.includes(pat)) {
            matches.push({ solution: solId, score: 2 });
            break;
          }
        }
      }
    }
  }

  if (matches.length === 0) return null;
  // Primary (score 3) wins; among ties, first match wins
  matches.sort((a, b) => b.score - a.score);
  return matches[0].solution;
}

/* ═══════════════════════════════════════════════════════════
   PHASE INDEX — computed from event patterns
   ═══════════════════════════════════════════════════════════ */

function computePhaseIndex(events) {
  if (events.length === 0) return 0;
  const total = events.length;
  const now = Date.now();

  // Weighted sentiment ratio (recent events count double)
  let weightedPos = 0, weightedTotal = 0;
  for (const ev of events) {
    const age = now - new Date(ev.date).getTime();
    const weight = (age < 48 * 3600000) ? 2 : 1;
    weightedTotal += weight;
    if (ev.sentiment === 'positive') weightedPos += weight;
  }
  const weightedRatio = weightedTotal > 0 ? weightedPos / weightedTotal : 0;

  // Map ratio → phase index (0-4)
  let phaseIndex = Math.min(4, Math.floor(weightedRatio * 5));

  // If mostly negative, cap at phase 1
  const negative = events.filter(e => e.sentiment === 'negative').length;
  if ((negative / total) > 0.6) return Math.min(phaseIndex, 1);

  return phaseIndex;
}

/* ═══════════════════════════════════════════════════════════
   DIRECTION — advancing / stable / stalling
   ═══════════════════════════════════════════════════════════ */

function computeDirection(events) {
  if (events.length === 0) return 'stable';
  const positive = events.filter(e => e.sentiment === 'positive').length;
  const negative = events.filter(e => e.sentiment === 'negative').length;
  const ratio = (positive + negative) > 0 ? positive / (positive + negative) : 0.5;
  if (ratio > 0.65) return 'advancing';
  if (ratio < 0.35) return 'stalling';
  return 'stable';
}

/* ═══════════════════════════════════════════════════════════
   BUILD PEACE ROOM DATA
   ═══════════════════════════════════════════════════════════ */

async function buildPeaceRoomData() {
  const allArticles = [];

  // Fetch all feeds in parallel
  const fetchPromises = RSS_FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const xml = await res.text();
      let items = parseRSS(xml, feed.source);
      return items.slice(0, feed.cap);
    } catch { return []; }
  });

  const results = await Promise.all(fetchPromises);
  for (const items of results) allArticles.push(...items);

  // Filter to ME-related
  const meArticles = allArticles.filter(a => isMiddleEastRelated(a.title));

  // Classify into solutions
  const solutionEvents = {};
  const now = Date.now();
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

  for (const article of meArticles) {
    if (now - article.timestamp > maxAgeMs) continue;
    const solutionId = classifyArticle(article.title);
    if (!solutionId) continue;
    if (!solutionEvents[solutionId]) solutionEvents[solutionId] = [];
    const sentiment = classifySentiment(article.title);
    solutionEvents[solutionId].push({
      date: article.date, text: article.title, sentiment,
      source: article.source, link: article.link,
    });
  }

  // Sort & deduplicate per solution
  for (const sol of Object.keys(solutionEvents)) {
    solutionEvents[sol].sort((a, b) => new Date(b.date) - new Date(a.date));
    const seen = new Set();
    solutionEvents[sol] = solutionEvents[sol].filter(ev => {
      if (seen.has(ev.text)) return false;
      seen.add(ev.text);
      return true;
    });
  }

  // Build solutions array — only solutions with events
  const solutions = [];
  const activeIds = [];
  let totalAdvancing = 0, totalStable = 0, totalStalling = 0;

  for (const [solId, cfg] of Object.entries(SOLUTIONS)) {
    const events = solutionEvents[solId] || [];
    if (events.length === 0) continue;  // skip empty categories
    activeIds.push(solId);
    const direction = computeDirection(events);
    const phaseIndex = computePhaseIndex(events);
    const summary = events[0].text;

    if (direction === 'advancing') totalAdvancing++;
    else if (direction === 'stalling') totalStalling++;
    else totalStable++;

    solutions.push({
      id: solId, icon: cfg.icon, name: cfg.name,
      phases: cfg.phases, phaseIndex, direction,
      keyMetric: { label: 'Events (7d)', value: String(events.length) },
      summary, events: events.slice(0, 12),
      confidence: events.length > 5 ? 'high' : events.length > 2 ? 'medium' : 'low',
    });
  }

  // Sort by event count desc, take top 8
  solutions.sort((a, b) => b.keyMetric.value - a.keyMetric.value);
  const top8 = solutions.slice(0, 8);

  // Overall momentum
  let momentumDir, momentumLabel;
  if (totalAdvancing > totalStalling) { momentumDir = 'advancing'; momentumLabel = 'Net Positive'; }
  else if (totalStalling > totalAdvancing) { momentumDir = 'stalling'; momentumLabel = 'Net Negative'; }
  else { momentumDir = 'stable'; momentumLabel = 'Mixed Signals'; }

  return {
    solutions: top8,
    activeSolutions: top8.map(s => s.id),
    overallMomentum: {
      direction: momentumDir,
      label: momentumLabel,
      summary: `${totalAdvancing} advancing, ${totalStable} stable, ${totalStalling} stalling. ${meArticles.length} ME articles from ${allArticles.length} total across ${RSS_FEEDS.length} feeds.`,
    },
    lastUpdated: new Date().toISOString(),
    source: 'rss-live',
    feedCount: allArticles.length,
  };
}

/* ═══════════════════════════════════════════════════════════
   REQUEST HANDLER
   ═══════════════════════════════════════════════════════════ */

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=10800', // 3h browser cache
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const data = await buildPeaceRoomData();
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch (err) {
    console.error('Peace Room RSS fetch error:', err);
    return new Response(JSON.stringify({ error: 'rss-unavailable', useFallback: true }), {
      status: 502, headers: corsHeaders,
    });
  }
}
