# GDELT Proxy Worker

Queries the GDELT 2.0 BigQuery dataset and computes the full Peace Meter dashboard data. Caches results in Cloudflare KV.

## Why This Exists

Cloudflare Workers cannot reach `data.gdeltproject.org` due to egress routing restrictions to Google Cloud IPs. The BigQuery REST API is accessible from Cloudflare's edge, so this Worker:

1. Authenticates to BigQuery via Google Service Account (JWT Bearer flow)
2. Runs targeted SQL against `` `gdelt-bq.gdeltv2.events_partitioned` `` (partitioned, 1-day window)
3. Fetches 6 RSS feeds, computes 12 signals + master score + 6 pair scores
4. Caches GDELT metrics in `GDELT_CACHE` KV (60 min TTL)
5. Caches full `/data.json` payload in `PEACE_CACHE` KV (60 min TTL)
6. Returns structured JSON to the Peace Meter Pages Function

## Endpoints

### `GET /peace-metrics` — GDELT metrics only (legacy)

Returns tone, news, conflict scores from BigQuery. Cached 60 min in `GDELT_CACHE`.

### `GET /data` — Full `/data.json` payload

Computes everything: GDELT signals + RSS publications + 12 signals + master score + 6 pair scores. Cached 60 min in `PEACE_CACHE`. This is what the Pages Function calls.

### `GET /debug` — Auth & API diagnostics

Tests JWT auth and BigQuery connectivity. Returns token status and any API errors.

## Architecture

```
Browser → Pages Function → Worker /data → KV cache (60 min)
                                      ↘ BigQuery + RSS (on miss)
```

The Pages Function is a thin proxy (~20 lines). All computation lives in the Worker.

## Setup

### 1. Create a Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or use an existing one
3. Go to **IAM & Admin → Service Accounts** → **Create Service Account**
4. Grant roles:
   - **BigQuery Data Viewer** (`roles/bigquery.dataViewer`)
   - **BigQuery Job User** (`roles/bigquery.jobUser`) — required to execute queries
5. Create a **JSON key** and download it

### 2. Deploy the Worker

```bash
cd gdelt-proxy/

# Store the service account key as a secret
npx wrangler secret put GDELT_SA_KEY
# → paste the full JSON key content when prompted

# Deploy
npx wrangler deploy --project-name=gdelt-proxy
```

### 3. Verify

```bash
curl https://gdelt-proxy.erez4free.workers.dev/data
```

Expected response: Full JSON payload matching the `/data.json` format.

## KV Namespaces

Two KV bindings share the same namespace ID (they can coexist):

| Binding | Purpose | TTL |
|---------|---------|-----|
| `GDELT_CACHE` | BigQuery access token + GDELT metrics | 60 min |
| `PEACE_CACHE` | Full `/data.json` payload | 60 min |

## Cost — Zero-Cost Configuration

BigQuery free tier: **1 TB query processing per month**.

| Parameter | Value | Why |
|---|---|---|
| Time window | **1 day** | Partition pruning — only scans last 24h |
| KV cache TTL | **60 minutes** | Only 24 BigQuery queries/day |
| Goldstein != 0 | **filter** | Skips ~40% of neutral events |
| ME countries only | **filter** | ~15% of global events |
| Estimated scan | **~0.3-0.5 GB/query** | Partitioned table, 1 day |

**Monthly cost: ~0.3-0.6 TB/month — safely within 1 TB free tier.**

- **Cloudflare Workers**: 100K requests/day free. KV reads/writes included.
- **BigQuery**: 0 cost (under free tier).
- **Total: $0/month.**

## Future Improvements

- **Per-pair queries**: Add individual pair queries for Israel-Palestine, Israel-Lebanon, etc.
- **GKG data**: Also query the Global Knowledge Graph for sentiment analysis
- **Scheduled refresh**: Use Cloudflare Cron Triggers to pre-warm cache hourly
