# Peace Meter — Improvements Log

## v2.1.0 (2026-05-20) — Conflict Events Signal

### Signal Change ✅
| # | Change | Details |
|---|--------|---------|
| C1 | Gulf Shipping → Conflict Events | Replaced RSS shipping with GDELT hostile vs constructive event ratio |
| C2 | Weight change | 7% → 8% (conflict weighted higher than shipping was) |
| C3 | Scoring method | `100 - (hostileRatio × 100)`, clamped 0–100 |
| C4 | Update interval | 30 min → 15 min (all GDELT signals share 15-min cycle) |
| C5 | ACLED not used | OAuth tokens expire every 24h, not viable for serverless edge |

## v2.0.0 (2026-05-20) — GDELT Event Data Integration

### Data Pipeline ✅
| # | Change | Details |
|---|--------|---------|
| G1 | Political Tone → GDELT | Goldstein Scale per event, avg mapped to 0–100. RSS fallback if GDELT unavailable |
| G2 | Diplomatic News → GDELT | CAMEO diplomatic root codes (13,22,23,24,26,27,40,41,42,43,45,52,58,59). RSS fallback |
| G3 | Multi-hour fallback | Tries current + 4 past hours, both .csv and .gz formats |
| G4 | Version badge → dynamic | JS sets `#versionTag` from `APP_VERSION` constant (not hardcoded in HTML) |
| G5 | Cache-busting | `?v=X.Y.Z` query strings on all `<script>`/`<link>` tags |
| G6 | VERSION comments | `/* VERSION: X.Y.Z */` in all static files to force hash change on version bump |

### Deployment Fixes ✅
| # | Issue | Fix |
|---|-------|-----|
| D1 | `_routes.json` inside `app/` | Moved to repo root (Cloudflare only recognizes at root) |
| D2 | `wrangler.toml` inside `app/` | Moved to repo root + added `pages_build_output_dir = "app"` |
| D3 | Cloudflare hash caching | Always deploy with `--skip-caching` to force full re-upload |
| D4 | Hardcoded version in HTML | Removed — now set dynamically from JS |

### Methodology Updates ✅
| # | Signal | Old | New |
|---|--------|-----|-----|
| M1 | Political Tone | RSS keyword sentiment | GDELT Goldstein Scale (primary), RSS (fallback) |
| M2 | Diplomatic News | RSS headline analysis | GDELT CAMEO diplomatic event ratio (primary), RSS (fallback) |
| M3 | Update frequency | "Every 30 min" | "Every 15 min" |

## v1.8.0 (2026-05-20) — Readability, Reliability, Professionalism

### Readability ✅

| # | Issue | Fix |
|---|---|---|
| R1 | Body text 11-13px, hard to read | signal-name 12px, signal-detail 12px, pub-title 14px |
| R2 | `--text-muted` (#64748b) too faint on dark bg | Brightened to #94a3b8 (WCAG AA on #111820) |
| R3 | Signal cards feel cramped | 3px colored border-left, hover glow |
| R4 | Gauge needs screen-reader text | `<span class="sr-only">` with score + level |
| R5 | Publications too dense | Card-style with gap instead of border-bottom |
| R6 | No keyboard focus on signal cards | `:focus-visible` outline + Enter/Space support |

### Reliability ✅

| # | Issue | Fix |
|---|---|---|
| L1 | Single fetch, no retry | 3-attempt retry with exponential backoff (1s, 2s, 4s) |
| L2 | No client-side cache | localStorage cache fallback on fetch failure |
| L3 | Error state silent | Inline error banner with retry button (EN/HE) |
| L4 | No loading state | Skeleton shimmer CSS class ready (not triggered yet) |
| L5 | 30-min poll too slow for first visit | Auto-refresh if cached data > 10 min old |

### Professionalism ✅

| # | Issue | Fix |
|---|---|---|
| P1 | No OG social sharing meta | `og:title`, `og:description`, `og:type`, `og:url` |
| P2 | SVG favicon only | (SVG-only, no PNG fallback — acceptable) |
| P3 | No visual loading indicator | Shimmer animation CSS class ready |
| P4 | Signal cards not clearly interactive | `cursor:pointer`, hover glow, `tabindex=0`, focus ring |
| P5 | Missing semantic landmarks | `<section>` with `aria-label` on gauge/chart/signals/pubs |

## v1.8.1 (2026-05-20) — Legal & Language

### Legal ✅
- Privacy Policy: 6 numbered sections (data, cookies, 3rd-party, deletion, legal basis, contact)
- Terms of Service: 8 numbered sections (nature, no predictions, no guarantees, user data, open source, liability, governing law, changes)
- Accessibility: 5 numbered sections (commitment, features, limitations, feedback, evaluation)
- Removed copyright notice → replaced with "open-source project" language
- EN/HE translations aligned to Psychic101 structure

### Language ✅
- `?lang=he` URL parameter forces Hebrew on load
- Saves choice to `localStorage` for subsequent visits

## Remaining / Future

| # | Issue | Status |
|---|---|---|
| L4 | Skeleton shimmer on initial load | CSS ready, not wired into JS yet |
| P2 | PNG favicon fallback | Not critical — SVG works everywhere |
| — | Arabic localization | Planned future feature |
| — | Per-conflict breakdown | Planned future feature |
| — | Telegram alerts | Planned future feature |
