# KV Cache for /data.json — Pre-computed Signal Cache

## Problem

Every request to `/data.json` triggers:
1. GDELT Proxy call (cached 60 min in Worker KV)
2. 6 RSS feed fetches (fresh every time, ~2-3s parallel)
3. 12 signal computations + master score + 6 pair scores

**Result:** 3-5 second load time for every page visit and every 15-min refresh.

## Solution

Add a `/data` endpoint to the GDELT Proxy Worker that computes the full `/data.json` payload once per hour, stores it in KV, and serves cached JSON on subsequent requests. The Pages Function becomes a thin proxy that calls this endpoint instead of computing locally.

## Implementation Steps

### 1. Add KV binding to GDELT Proxy Worker

Add `PEACE_CACHE` KV namespace to `gdelt-proxy/wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "GDELT_CACHE", id = "..." },
  { binding = "PEACE_CACHE", id = "..." }  # same ID or separate
]
```

### 2. Move RSS + signal computation to GDELT Proxy Worker

Copy these from `functions/data.json.js` into `gdelt-proxy/index.js`:
- RSS feed definitions + parser (`RSS_FEEDS`, `decodeHTML`, `parseRSS`, `fetchPublications`)
- Signal computation (`computeNormalization`, `computeEconomic`, `computePairScore`, `calcMaster`)
- Constants (`PAIR_DEFS`, `NORMALIZATION_EVENTS`, `ECONOMIC_EVENTS`, `FALLBACK_SIGNALS`)
- Relevance/freshness filters

Add a `/data` endpoint that:
- Checks `PEACE_CACHE.get('data')` — if fresh (<60 min), return cached JSON
- If stale: fetch GDELT metrics (existing logic) + fetch RSS feeds + compute all signals
- Store full JSON in `PEACE_CACHE.put('data', json, { expirationTtl: 3600 })`
- Return JSON

### 3. Simplify Pages Function

Replace `functions/data.json.js` with a ~30-line proxy:

```js
export async function onRequest(context) {
  const url = 'https://gdelt-proxy.xxx.workers.dev/data';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    // Serve fallback mock data
    // (embed minimal fallback or return error)
  }
}
```

### 4. Frontend — no changes

`app.js` fetches `/data.json` which now routes through Pages Function → GDELT Proxy Worker. JSON shape is identical.

## File Changes

| File | Change |
|------|--------|
| `gdelt-proxy/wrangler.toml` | Add `PEACE_CACHE` KV binding |
| `gdelt-proxy/index.js` | Add `/data` endpoint + RSS + signal computation logic |
| `gdelt-proxy/README.md` | Document new `/data` endpoint |
| `functions/data.json.js` | Replace with thin proxy (~30 lines) |
| `app/data.json` | Keep as offline fallback (unchanged) |

## Impact

| Metric | Before | After |
|--------|--------|-------|
| `/data.json` response time | 3-5s | <100ms (cached) |
| Pages Function size | ~400 lines | ~30 lines |
| Data freshness | Per-request | Hourly (same as GDELT) |
| Cost | $0 | $0 |
| Deployments | Pages only | Pages + Worker redeploy |

## Risks

- RSS fetching from Worker may have different edge location than Pages Function (minor)
- If Worker is down, Pages Function has no local computation fallback (mitigate by keeping `app/data.json` as browser-side fallback)
- Need to create new KV namespace or reuse existing one
