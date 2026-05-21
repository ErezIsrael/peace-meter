/* ── /data.json — Cloudflare Pages Function (thin proxy) ──────────── */
/*
 * Delegates all computation to the GDELT Proxy Worker (/data endpoint).
 * The Worker handles: GDELT BigQuery, RSS feeds, 12 signals, master score,
 * 6 pair scores — all cached in KV for 60 min.
 *
 * If the Worker is unreachable, the browser falls back to app/data.json
 * (handled by app.js L2 fallback logic).
 */

const PROXY_URL = 'https://gdelt-proxy.erez4free.workers.dev/data';

export async function onRequest(context) {
  try {
    const res = await fetch(PROXY_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    // Worker unreachable — return error so browser falls back to app/data.json
    return new Response(JSON.stringify({ error: "proxy unavailable" }), {
      status: 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
