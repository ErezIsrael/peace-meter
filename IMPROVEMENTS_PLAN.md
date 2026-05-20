# Peace Meter — Improvements Log

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
