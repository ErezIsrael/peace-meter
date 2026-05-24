# Security Setup — Post-Audit Actions

## 1. Rotate Google Service Account Key

The private key file `gdelt-proxy/peace-meter-2b24d70d7c8d.json` was committed to git and **must be rotated**.

### Steps:
1. Go to [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Navigate to **IAM & Admin → Service Accounts**
3. Select the `peace-meter` service account
4. Go to the **Keys** tab
5. **Delete** all existing keys
6. Click **Add Key → Create new key** → Choose JSON
7. Save the new key file **locally** (never commit it)
8. Upload to Cloudflare Workers secret:
   ```bash
   cd gdelt-proxy
   # Paste the entire JSON content of the new key file:
   cat /path/to/new-key.json | npx wrangler secret put GDELT_SA_KEY
   ```
9. Purge from git history (use [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) or `git filter-repo`):
   ```bash
   git filter-repo --path peace-meter-2b24d70d7c8d.json --invert-paths
   git filter-repo --path credentials.json --invert-paths
   git filter-repo --path tempdata.json --invert-paths
   ```
   Then force-push: `git push --force --all`

---

## 2. Rotate API Client Secret

The `credentials.json` file contained a leaked `clientSecret`.

### Steps:
1. Identify which API/service this secret belongs to
2. Generate a new client secret through that service's admin console
3. Update the Cloudflare Pages Functions environment variable:
   ```bash
   # In the Pages project root:
   npx wrangler pages secret put API_CLIENT_SECRET
   # Paste the new secret when prompted
   ```
4. Delete `credentials.json` locally (already done) and purge from git history (see above)

---

## 3. Create KV Namespaces

✅ **DONE** — Both namespaces created via `npx wrangler kv namespace create`:

| Binding | Namespace ID | Created |
|---|---|---|
| `PEACE_CACHE` | `214f6f1d47bb4486b068bdc372c8f282` | ✅ |
| `RATE_LIMIT` | `c17646490c48400990afd336062c0646` | ✅ |

IDs are already populated in `gdelt-proxy/wrangler.toml`.

---

## 4. Verify Deployment

After making all changes:

```bash
# Deploy the Worker
cd gdelt-proxy
npx wrangler deploy

# Deploy the Pages app (fonts are included automatically)
cd ../app
npx wrangler pages deploy .
```

## 5. Git History Purge

⚠️ **CRITICAL** — Run these commands to remove leaked credentials from git history:

```bash
git filter-repo --path peace-meter-2b24d70d7c8d.json --invert-paths
git filter-repo --path credentials.json --invert-paths
git filter-repo --path tempdata.json --invert-paths
```

Then force-push: `git push --force --all`

---

## Verification Checklist
- [ ] Worker responds at `/data` with valid JSON
- [ ] Rate limiting works (try 31+ requests in 60 seconds — should get 429)
- [ ] Fonts load from `fonts/` directory (check DevTools Network tab — no Google Fonts requests)
- [ ] CSP header blocks external resources (except allowed)
- [ ] Security headers present: `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, `Referrer-Policy`
- [ ] Score max is exactly 100 (check with all signals at 100)
- [ ] Privacy policy reflects self-hosted fonts
- [ ] Privacy policy discloses all 4 localStorage keys
- [ ] No hardcoded secrets remain in source code
- [ ] Worker responds at `/data` with valid JSON
- [ ] Rate limiting works (try 31+ requests in 60 seconds — should get 429)
- [ ] Fonts load from `fonts/` directory (check DevTools Network tab — no Google Fonts requests)
- [ ] CSP header blocks external resources (except allowed)
- [ ] Security headers present: `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, `Referrer-Policy`
