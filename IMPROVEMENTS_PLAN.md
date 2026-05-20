# Peace Meter — Improvements Plan (v1.8.0)

## Readability

| # | Issue | Fix |
|---|---|---|
| R1 | Body text 11-13px, hard to read | Increase signal-name to 12px, signal-detail to 12px, pub-title to 14px |
| R2 | `--text-muted` (#64748b) too faint on dark bg | Brighten to #94a3b8 (WCAG AA on #111820) |
| R3 | Signal cards feel cramped | Add 2px border-left accent colored by level, increase padding |
| R4 | Gauge needs screen-reader text | Add `<span class="sr-only">` with score + level |
| R5 | Publications too dense | Add gap between items instead of border-bottom |
| R6 | No keyboard focus on signal cards | Add `:focus-visible` outline |

## Reliability

| # | Issue | Fix |
|---|---|---|
| L1 | Single fetch, no retry | 3-attempt retry with exponential backoff (1s, 2s, 4s) |
| L2 | No client-side cache | Cache response in `localStorage` as fallback on fetch failure |
| L3 | Error state silent | Show inline error banner with retry button |
| L4 | No loading state | Skeleton shimmer on gauge + signal cards during initial load |
| L5 | 30-min poll too slow for first visit | Immediate load + aggressive refresh if stale (>10 min) |

## Professionalism

| # | Issue | Fix |
|---|---|---|
| P1 | No OG social sharing meta | Add `<meta property="og:*">` tags |
| P2 | SVG favicon only | Add `<link rel="icon" type="image/png">` fallback |
| P3 | No visual loading indicator | Add shimmer animation to cards during load |
| P4 | Signal cards not clearly interactive | Add hover glow + `tabindex=0` + visible focus ring |
| P5 | Missing semantic landmarks | Add `aria-label` to main sections |
