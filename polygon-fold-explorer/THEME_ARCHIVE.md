# Original theme archive (pre Hrifa design-token alignment)

This app originally shipped with its own hand-authored dark palette, hardcoded as hex
values in `styles.css` and `app.js`. That palette is being replaced by the shared
`../design-tokens` system so this applet matches the rest of the Hrifa family. This
document preserves the original values and where each one was used, so the look is
recoverable even after the source files are rewritten (git history has it too, but
this is the readable index).

## `styles.css` `:root` custom properties

| Variable | Hex | Purpose (as originally named/used) |
| --- | --- | --- |
| `--bg` | `#0f1115` | Page background. |
| `--panel` | `#171a20` | Left/right aside panel background (gradient stop). |
| `--panel2` | `#1d2129` | Button background, status box background, tile/insertion card background. |
| `--line` | `#343b49` | Default border color (asides, buttons, inputs, cards). |
| `--text` | `#e8eaf0` | Primary text color. |
| `--muted` | `#9aa3b2` | Secondary/label text, subtitle, meta lines. |
| `--focus` | `#c4a7ff` | Crease-line legend swatch color (light violet). |
| `--vantage` | `#74b9ff` | Source-polygon legend swatch color (blue). |
| `--mid` | `#6f7d91` | Inactive edge-midpoint marker color (slate). |
| `--exo` | `#ff8f70` | Declared but unused in the final markup (leftover token). |
| `--outlook` | `#9be28f` | Declared but unused directly (duplicate of `--good`). |
| `--f2` | `#d993ff` | Selected-point legend swatch color; Level-1 tile hover/selected border (pink/magenta). |
| `--good` | `#9be28f` | Valid insertion candidate border (green). |
| `--bad` | `#ff706b` | Self-intersecting/invalid insertion candidate border (red). |
| `--amber` | `#f2b84b` | Degenerate insertion candidate border (amber/yellow). |
| `--fold-plus` | `#f2994a` | Fold `+` chain/reflection color (orange). |
| `--fold-minus` | `#55d6be` | Fold `-` chain/reflection color (teal). |

## `app.js` `colors` object

```js
const colors = {
  polygon:  '#74b9ff', // source polygon stroke/fill, resting vertex fill
  crease:   '#c4a7ff', // inactive crease line stroke
  mid:      '#6f7d91', // inactive edge-midpoint marker
  plus:     '#f2994a', // fold "+" chain/reflection/crease-active color
  minus:    '#55d6be', // fold "-" chain/reflection/crease-active color
  selected: '#f0d5ff', // selected reflected-point ring, active vertex stroke
  text:     '#e8eaf0', // SVG label text (V#, E#, F#)
  muted:    '#9aa3b2', // secondary SVG label text (edge labels)
};
```

## Component → color usage (as originally implemented)

| Component | Color source |
| --- | --- |
| Source polygon outline/fill, resting vertex | `colors.polygon` (`#74b9ff`) |
| Inactive crease line (dashed) | `colors.crease` (`#c4a7ff`) |
| Active crease line + `F{i}{dir}` label | `colors.plus` or `colors.minus` depending on fold direction |
| Inactive opposite-edge midpoint dot | `colors.mid` (`#6f7d91`) |
| Active opposite-edge midpoint dot | fold direction color (`plus`/`minus`) |
| Fold chain polyline | fold direction color (`plus`/`minus`) |
| Reflected point dot (idle) | fold direction color (`plus`/`minus`) |
| Reflected point dot (selected) | `colors.selected` (`#f0d5ff`) ring/stroke over the direction fill |
| Selected candidate polygon overlay | `colors.selected` stroke, translucent green fill (`rgba(155,226,143,.12)`, hardcoded, not tokenized) |
| Reflecting source vertex (highlighted) | fold direction color, `colors.selected` stroke |
| Crease vertex marker (paired anchor) | `#27303b` fill, fold direction color stroke |
| Vertex/edge/fold labels | `colors.text` (labels), `colors.muted` (edge labels) |
| Level-1 fold-matrix tile dot | inline `style="background:${colors.plus/minus}"` |
| Level-1 tile hover/selected border | `--f2` (`#d993ff`) |
| Level-3 insertion tile: valid | `--good` (`#9be28f`) border |
| Level-3 insertion tile: degenerate | `--amber` (`#f2b84b`) border |
| Level-3 insertion tile: self-intersecting/invalid | `--bad` (`#ff706b`) border |
| Level-3 insertion tile: active/selected | `--f2` inset box-shadow |
| Legend swatches | `.polygon`→`--vantage`, `.crease`→`--focus`, `.selected`→`--f2` |
| Lattice-seed grid: eligible point | `colors.plus` (orange) — chosen ad hoc when lattice mode was added, no dedicated token existed |
| Lattice-seed grid: background/ineligible point | `colors.mid` (slate) |

## As-found quirk (documented, not corrected here)

`styles.css` defines `.plus` / `.minus` **twice**:

```css
.plus{background:var(--fold-plus)!important}.minus{background:var(--fold-minus)!important}
/* ...later in the file... */
.plus{background:var(--good)}.minus{background:var(--bad)}
```

The `!important` rule always wins regardless of source order, so in the shipped app the
legend's "+ chain / reflection" and "− chain / reflection" swatches actually rendered in
`--fold-plus`/`--fold-minus` (orange/teal), **not** `--good`/`--bad` (green/red) as the
second rule's variable names would suggest. This was true of the app as originally
handed off and is recorded here for reference, not treated as a bug to fix as part of
this archive.
