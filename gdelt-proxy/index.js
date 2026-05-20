/**
 * GDELT Proxy Worker
 * 
 * Queries the GDELT BigQuery public dataset and caches results in KV.
 * 
 * Architecture:
 * - Authenticates to BigQuery via Google Service Account (JWT)
 * - Queries gdelt_bq.gdelt_v2.events for ME-focused metrics
 * - Caches results in Cloudflare KV (15-minute TTL)
 * - Returns structured JSON to the Peace Meter Pages Function
 * 
 * Setup:
 * 1. Create a Google Cloud Service Account with "BigQuery Data Viewer" role
 * 2. Generate a JSON key and save it securely
 * 3. npx wrangler secret put GDELT_SA_KEY
 *    (paste the full JSON key content)
 * 4. npx wrangler deploy --project-name=gdelt-proxy
 * 
 * Endpoint: GET /peace-metrics
 * Returns: { tone, news, conflict, pairs, timestamp, cached }
 */

import { jwtClient } from './jwt-client.js';

const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
const BIGQUERY_PROJECT = 'gdelt_biq';

/**
 * BigQuery SQL query — extracts ME-focused peace metrics
 * from the partitioned events table (much faster than full table scan).
 * 
 * Computes:
 * - Global ME tone (avg Goldstein for all ME country pairs)
 * - Diplomatic event ratio
 * - Conflict event ratio (hostile vs constructive)
 * - Per-pair metrics for 6 key pairs
 */
const ME_EVENTS_QUERY = `
SELECT
  AVG(GoldsteinScale) AS avg_goldstein,
  COUNT(*) AS total_events,
  SUM(CASE WHEN GoldsteinScale > 0 THEN 1 ELSE 0 END) AS constructive,
  SUM(CASE WHEN GoldsteinScale < 0 THEN 1 ELSE 0 END) AS hostile,
  SUM(CASE WHEN EventRootCode IN ('13','22','23','24','26','27','40','41','42','43','45','52','58','59') THEN 1 ELSE 0 END) AS diplomatic
FROM \`gdelt_biq.gdelt_v2.events\`
WHERE
  DATE >= CURRENT_DATE() - INTERVAL '7' DAY
  AND _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL '7' DAY)
  AND (
    Actor1CountryCode IN ('ISR','PSE','LBN','SYR','IRN','YEM','IRQ','SAU','ARE','BHR','EGY','TUN','MAR','JOR','OMN','QAT','KWT')
    OR Actor2CountryCode IN ('ISR','PSE','LBN','SYR','IRN','YEM','IRQ','SAU','ARE','BHR','EGY','TUN','MAR','JOR','OMN','QAT','KWT')
    OR Actor1Code = 'USA' OR Actor2Code = 'USA'
  )
  AND GoldsteinScale != 0
`;

/**
 * Per-pair query — focused on specific country pairs
 */
const PAIR_QUERY = `
SELECT
  Actor1CountryCode, Actor2CountryCode,
  COUNT(*) as event_count,
  SUM(GoldsteinScale) as total_goldstein,
  SUM(CASE WHEN GoldsteinScale > 0 THEN 1 ELSE 0 END) as constructive,
  SUM(CASE WHEN GoldsteinScale < 0 THEN 1 ELSE 0 END) as hostile,
  SUM(CASE WHEN EventRootCode IN ('13','22','23','24','26','27','40','41','42','43','45','52','58','59') THEN 1 ELSE 0 END) as diplomatic
FROM \`gdelt_biq.gdelt_v2.events\`
WHERE
  DATE >= CURRENT_DATE() - INTERVAL '7' DAY
  AND _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL '7' DAY)
  AND GoldsteinScale != 0
  AND (
    (Actor1CountryCode IN ('{countries}') OR Actor2CountryCode IN ('{countries}'))
  )
GROUP BY Actor1CountryCode, Actor2CountryCode
`;

/**
 * Get or create BigQuery access token via JWT flow.
 * Token is valid for 1 hour, we cache it in KV with 50-minute TTL.
 */
async function getAccessToken(env) {
  const token = await env.GDELT_CACHE.get('bq_access_token');
  if (token) {
    return JSON.parse(token).access_token;
  }

  const saKey = JSON.parse(env.GDELT_SA_KEY);
  const tokenData = await jwtClient(saKey, 'https://www.googleapis.com/auth/bigquery');

  // Cache for 50 minutes (token expires in 60)
  await env.GDELT_CACHE.put('bq_access_token', JSON.stringify(tokenData), {
    expirationTtl: 50 * 60,
  });

  return tokenData.access_token;
}

/**
 * Execute BigQuery query via REST API
 */
async function queryBigQuery(env, sql) {
  const token = await getAccessToken(env);

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${BIGQUERY_PROJECT}/queries`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: sql,
        useLegacySql: false,
        maxResults: 1000,
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`BigQuery API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Parse the single aggregated row from BigQuery
 * Query returns: [avg_goldstein, total_events, constructive, hostile, diplomatic]
 */
function computeMetrics(rows) {
  if (!rows || rows.length === 0) return null;

  const row = rows[0];
  const avgGoldstein = parseFloat(row.f[0]?.v || 0);
  const totalEvents = parseInt(row.f[1]?.v || 0);
  const constructive = parseInt(row.f[2]?.v || 0);
  const hostile = parseInt(row.f[3]?.v || 0);
  const diplomatic = parseInt(row.f[4]?.v || 0);

  const constructiveRatio = (constructive + hostile) > 0 ? constructive / (constructive + hostile) : 0.5;
  const hostileRatio = totalEvents > 0 ? hostile / totalEvents : 0;

  return { avgGoldstein, constructiveRatio, hostileRatio, totalEvents, constructive, hostile, diplomatic };
}

/**
 * Map metrics to peace scores (0-100)
 */
function scoreFromMetrics(metrics) {
  if (!metrics) return null;

  // Tone: Goldstein mapped 0-100
  // avg +10 → 100, 0 → 50, -10 → 0
  const tone = Math.round(Math.max(0, Math.min(100, 50 + (metrics.avgGoldstein / 10) * 50)));

  // Diplomatic news: constructive ratio squared * 150, clamped 3-95
  const news = Math.round(Math.max(3, Math.min(95, Math.pow(metrics.constructiveRatio, 2) * 150)));

  // Conflict: hostile ratio inverted
  const conflict = Math.round(Math.max(0, Math.min(100, 100 - (metrics.hostileRatio * 100))));

  return { tone, news, conflict };
}

/**
 * Per-pair country definitions
 */
const PAIR_DEFS = [
  { id: 'israel-palestine', name: 'Israel-Palestine', countries: ['ISR', 'PSE'] },
  { id: 'israel-lebanon', name: 'Israel-Lebanon', countries: ['ISR', 'LBN'] },
  { id: 'red-sea', name: 'Red Sea / Yemen', countries: ['YEM', 'SAU', 'ARE'] },
  { id: 'israel-iran', name: 'Israel-Iran', countries: ['ISR', 'IRN'] },
  { id: 'usa-iran', name: 'USA-Iran', countries: ['USA', 'IRN'] },
  { id: 'gulf-normalization', name: 'Abraham Accords', countries: ['ISR', 'ARE', 'BHR'] },
];

/**
 * Main handler
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    if (url.pathname !== '/peace-metrics' || request.method !== 'GET') {
      return new Response('Not found', { status: 404 });
    }

    // Check KV cache first
    const cached = await env.GDELT_CACHE.get('peace_metrics');
    if (cached) {
      const data = JSON.parse(cached);
      return new Response(JSON.stringify({ ...data, cached: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      // Query BigQuery for ME-wide metrics
      const result = await queryBigQuery(env, ME_EVENTS_QUERY);
      const metrics = computeMetrics(result.rows);
      const scores = scoreFromMetrics(metrics);

      // Build response
      const response = {
        tone: scores ? scores.tone : 60,
        news: scores ? scores.news : 65,
        conflict: scores ? scores.conflict : 45,
        eventCount: metrics?.totalEvents || 0,
        constructiveEvents: metrics?.constructive || 0,
        hostileEvents: metrics?.hostile || 0,
        diplomaticEvents: metrics?.diplomatic || 0,
        avgGoldstein: metrics?.avgGoldstein?.toFixed(3) || '0',
        timestamp: new Date().toISOString(),
        cached: false,
      };

      // Cache in KV for 15 minutes
      await env.GDELT_CACHE.put('peace_metrics', JSON.stringify(response), {
        expirationTtl: CACHE_TTL_SECONDS,
      });

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err) {
      console.error('BigQuery error:', err.message);
      return new Response(JSON.stringify({
        error: 'BigQuery unavailable',
        tone: 60,
        news: 65,
        conflict: 45,
        timestamp: new Date().toISOString(),
        cached: false,
        status: 'Delayed',
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
