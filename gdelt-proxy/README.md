# GDELT Proxy Worker

Queries the GDELT 2.0 BigQuery dataset for Middle East peace metrics and caches results in Cloudflare KV.

## Why This Exists

Cloudflare Workers cannot reach `data.gdeltproject.org` due to egress routing restrictions to Google Cloud IPs. The BigQuery REST API is accessible from Cloudflare's edge, so this Worker:

1. Authenticates to BigQuery via Google Service Account (JWT Bearer flow)
2. Runs targeted SQL against `gdelt_biq.gdelt_v2.events` (partitioned, 7-day window)
3. Caches results in Cloudflare KV (15-minute TTL)
4. Returns structured JSON to the Peace Meter dashboard

## Setup

### 1. Create a Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or use an existing one
3. Go to **IAM & Admin → Service Accounts** → **Create Service Account**
4. Grant role: **BigQuery Data Viewer** (`roles/bigquery.dataViewer`)
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
curl https://gdelt-proxy.erez4free.workers.dev/peace-metrics
```

Expected response:
```json
{
  "tone": 60,
  "news": 65,
  "conflict": 45,
  "eventCount": 12345,
  "constructiveEvents": 7500,
  "hostileEvents": 4845,
  "diplomaticEvents": 2300,
  "avgGoldstein": "0.523",
  "timestamp": "2026-05-20T16:30:00Z",
  "cached": false
}
```

Subsequent calls within 15 minutes return `"cached": true`.

## BigQuery Query

The Worker runs this SQL against the partitioned events table:

```sql
SELECT
  AVG(GoldsteinScale) AS avg_goldstein,
  COUNT(*) AS total_events,
  SUM(CASE WHEN GoldsteinScale > 0 THEN 1 ELSE 0 END) AS constructive,
  SUM(CASE WHEN GoldsteinScale < 0 THEN 1 ELSE 0 END) AS hostile,
  SUM(CASE WHEN EventRootCode IN ('13','22','23','24','26','27','40','41','42','43','45','52','58','59')
    THEN 1 ELSE 0 END) AS diplomatic
FROM `gdelt_biq.gdelt_v2.events`
WHERE DATE >= CURRENT_DATE() - INTERVAL '7' DAY
  AND _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL '7' DAY)
  AND (
    Actor1CountryCode IN ('ISR','PSE','LBN','SYR','IRN','YEM','IRQ','SAU','ARE','BHR','EGY','TUN','MAR','JOR','OMN','QAT','KWT')
    OR Actor2CountryCode IN ('ISR','PSE','LBN','SYR','IRN','YEM','IRQ','SAU','ARE','BHR','EGY','TUN','MAR','JOR','OMN','QAT','KWT')
    OR Actor1Code = 'USA' OR Actor2Code = 'USA'
  )
  AND GoldsteinScale != 0
```

## Cost

- **BigQuery**: First 1 TB/month is free. This query scans ~1-5 GB per execution.
- **Cloudflare Workers**: 100K requests/day free tier. KV reads/writes included.
- **Total**: Essentially free for this use case.

## Future Improvements

- **Per-pair queries**: Add individual pair queries for Israel-Palestine, Israel-Lebanon, etc.
- **GKG data**: Also query the Global Knowledge Graph for sentiment analysis
- **Scheduled refresh**: Use Cloudflare Cron Triggers to pre-warm cache hourly
