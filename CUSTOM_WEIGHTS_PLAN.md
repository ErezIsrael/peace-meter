# Customizable Signal Weights — Implementation Plan

## Concept

Users can adjust the weighting of each of the 12 signals, see the master score recalculate in real-time, save named presets, and share them via URL.

**Frontend-only** — no backend changes. The server already sends all 12 individual signal scores, so the client can recompute the master score independently.

---

## Architecture

### Data Storage

| Key | Location | Content |
|-----|----------|---------|
| `pm-weights` | localStorage | Currently active weight set (object) |
| `pm-weight-presets` | localStorage | Named presets: `{ "default": {...}, "my-view": {...}, ... }` |
| `?w=` | URL query param | Encoded weights for sharing: `tone:25,news:10,...` |

### Weight Format

```json
{
  "tone": 0.20,
  "news": 0.15,
  "aviation": 0.12,
  "prediction": 0.10,
  "credit": 0.10,
  "travel": 0.10,
  "thinktank": 0.10,
  "conflict": 0.08,
  "views": 0.05,
  "normalization": 0.04,
  "economic": 0.03,
  "humanitarian": 0.01
}
```

All values sum to `1.0`. Stored as decimals internally, displayed as percentages in UI.

---

## Built-in Presets

Shipped with the app, read-only:

| Name | Focus | Key Changes |
|------|-------|-------------|
| `default` | Balanced | Original weights |
| `conflict` | Conflict-heavy | Tone 30%, Conflict 15%, rest reduced proportionally |
| `diplomacy` | Diplomacy-heavy | News 20%, Normalization 10%, Think Tank 15%, rest reduced |

---

## UI Flow

### 1. Entry Point

A "⚙️" button in the `gauge-meta` row (next to volatility icon and momentum arrow). Clicking it opens the weight editor modal.

```html
<!-- gauge-meta row becomes: -->
<div class="gauge-meta">
  <span class="vol-icon">🔵</span>
  <span class="momentum-arrow">→ +3 pts</span>
  <button class="icon-btn weights-btn" onclick="showWeightEditor()" title="Customize weights">⚙️</button>
</div>
```

### 2. Weight Editor Modal

```
┌──────────────────────────────────────────┐
| ☮️ Customize Weights                     |
|                                          |
| Preset: [ My View          ▼ ]           |
|            [+ New Preset]  [Share]       |
|                                          |
| ┌──────────────────────────────────────┐ |
| | 🤝 Political Tone    [═════  ] 25%  | |
| | 📰 Diplomatic News   [══    ] 10%  | |
| | ✈️ Commercial Aviation [══  ] 12% | |
| | ... (all 12 signals)               | |
| └──────────────────────────────────────┘ |
|                                          |
| Total: 100%  ✓                          |
|                                          |
| [Save]  [Save As...]  [Reset to Default] |
└──────────────────────────────────────────┘
```

### 3. Slider Behavior

- Each slider range: `1%` to `50%` (per-signal cap prevents one signal from dominating completely)
- **Auto-normalize**: When a slider changes, all *other* signals scale down proportionally so total stays 100%
- Formula: `other_i_new = other_i_old × (100 - new_value) / (100 - old_value)`
- Result rounded to 1 decimal place; any rounding remainder added to the largest-weighted signal

### 4. Total Indicator

- Shows `Total: XX%` below the slider list
- Green ✓ if total = 100% (auto-normalize ensures this)
- Yellow ⚠ if slightly off (rounding edge case — rare)
- Red ✗ if significantly off (shouldn't happen with auto-normalize)

### 5. Preset Management

- **Dropdown**: Lists all saved presets (built-in + user-created)
- **Switching**: Selecting a preset loads those weights instantly, recalc happens
- **Save**: Overwrites the currently selected preset
- **Save As...**: Prompts for a name via `prompt()`, creates new preset
- **Delete**: Right-click or long-press on dropdown item → confirm delete (user presets only)
- **Share**: Copies URL to clipboard with `?w=tone:25,news:10,...` encoded weights

### 6. Live Recalculation

Every slider change triggers:
1. Auto-normalize remaining signals
2. Recalculate master score: `Σ(signalScore × weight)`
3. Update gauge display (score number, arc, status label, level)
4. Update momentum display if applicable

### 7. URL-encoded Weights

Format: `?w=tone:25,news:10,aviation:12,...`

On page load:
- If `?w=` present, parse weights
- Show toast: "Custom weights loaded from URL"
- Apply weights, recalc master score
- No localStorage save unless user clicks "Save"

---

## Implementation Details

### Files to Modify

| File | Changes |
|------|---------|
| `app/index.html` | Add `⚙️` button to `gauge-meta` row |
| `app/app.js` | Add `showWeightEditor()`, `recalcMaster()`, `autoNormalize()`, `loadWeights()`, `saveWeights()`, `shareWeights()`, `applyWeightsToGauge()` |
| `app/styles.css` | Slider styles, modal layout for weight editor, total indicator colors |
| `app/lang.js` | Add `myweight` i18n strings (EN + HE) for labels, preset names, buttons |

### New Functions in `app.js`

```js
// ── Weight editor modal ──
function showWeightEditor() { /* renders modal with 12 sliders */ }
function hideWeightEditor() { /* closes modal */ }

// ── Weight computation ──
function recalcMaster(weights, signals) { /* Σ(score × weight) */ }
function autoNormalize(changedKey, newValue, currentWeights) { /* proportional scaling */ }

// ── Persistence ──
function loadWeights() { /* from localStorage or URL param */ }
function saveWeights(name) { /* save to pm-weight-presets */ }
function deletePreset(name) { /* remove from presets */ }
function shareWeights() { /* copy URL with ?w= param */ }
function parseWeightParam(str) { /* parse "tone:25,news:10,..." */ }
function encodeWeightParam(weights) { /* reverse of parse */ }

// ── Gauge override ──
function applyCustomWeights() { /* if custom weights active, recalc and update gauge */ }
```

### Integration with Existing Code

- `renderGauge(score)` stays unchanged — it just receives a score
- `renderAll(data)` modified to check for active custom weights:
  ```js
  function renderAll(data) {
    lastData = data;
    let score = data.master.score;
    if (activeCustomWeights) {
      score = recalcMaster(activeCustomWeights, data.signals);
    }
    renderGauge(score);
    // ...
  }
  ```
- `showPeaceScoreDetail()` modified to show "Your Weight" vs "Default" when custom weights are active
- Signal cards unchanged — they show individual scores which don't change

### CSS Additions

```css
/* Slider row */
.weight-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.weight-row label { flex: 1; font-size: 13px; }
.weight-row input[type="range"] { flex: 2; accent-color: var(--thawing); }
.weight-row .weight-val { width: 40px; text-align: right; font-family: var(--font-mono); font-size: 13px; }

/* Total indicator */
.weight-total { padding: 8px 0; font-weight: 600; font-size: 13px; }
.weight-total.ok { color: #4ade80; }
.weight-total.warn { color: #fbbf24; }
.weight-total.error { color: #f87171; }

/* Modal buttons row */
.weight-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.weight-actions button { font-size: 12px; padding: 6px 12px; }

/* Preset dropdown */
.preset-select {
  background: var(--bg-dark);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  width: 100%;
  margin-bottom: 12px;
}
```

### i18n Additions (lang.js)

```js
myweight: {
  title: 'Customize Weights',
  preset: 'Preset',
  total: 'Total',
  save: 'Save',
  saveAs: 'Save As...',
  reset: 'Reset to Default',
  share: 'Share',
  newPreset: '+ New Preset',
  deletePreset: 'Delete',
  customLoaded: 'Custom weights loaded from URL',
  saved: 'Saved!',
  shared: 'Link copied!',
  presets: {
    default: 'Default',
    conflict: 'Conflict-Focused',
    diplomacy: 'Diplomacy-Focused',
  },
},
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User drags slider to 50% | Other signals scale down; smallest may hit 1% floor |
| Slider min is 1% | Prevents signals from being completely ignored |
| localStorage corrupted | Fallback to default weights, show toast warning |
| URL param malformed | Ignore, use defaults, show toast |
| Many presets saved | Cap at 10 user presets; oldest deleted when exceeded |
| Rounding drift from auto-normalize | Add remainder to largest-weighted signal; display warning if >0.1% off |

---

## Future Enhancements (out of scope for v1)

- Preset sharing via short codes (`?preset=abc123`) backed by a public KV store
- Export/import presets as JSON files
- Comparison mode: show side-by-side scores for two weight sets
- Historical weights: track how user's weights changed over time
