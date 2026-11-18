# SCENARIOS M9: Harmonic entropy (Erlich)

Drafted 2026-11-18; table CONFIRMED by the human 2026-11-18 ("Yes, build it"). Storage: H-39. Numbers from throwaway scripts (`he.mjs`, `he2.mjs`, session scratchpad): HE(c) = -Σ p ln p, p_j ∝ exp(-(c - c_j)² / 2s²) / √(n_j·d_j), over every reduced n/d with n·d < N, from 300 c below 1/1 to 300 c above 2/1 (no edge distortion). Values in nats; lower = more consonant; only shape and relative depth are meaningful (the level depends on N).

## Human decisions so far
- Blur s: a SLIDER, default 17 c (Erlich classic), range about 8 to 20 c.
- Shown in all three: the Dissonance view curve, the picker Color metric, the Near ring overlay.
- Candidate limit N: Developer option, up to 500k, with an estimated run time shown when changing it (human: "n as dev option allow up to 500k show estimated run time when changing"). Default 30k.
- Computation: built once per (s, N) and kept in memory; exact single-interval values computed once and remembered; nothing stored on disk (human asked "this is a one off run that happens and then is referenced?": yes).
- Finer steps: no gain (dips identical within 0.5 c; 1 c curve + linear interpolation is within 0.045 % of the curve's range of the exact value). Curve at 1 c; single intervals exact (3/2 at 701.955 c).
- Weighting 1/√(n·d) (mediant regions put the dips in the same places within 2 c).

## Measured reference values (N = 10k unless noted)
| Interval | s 17 | s 12 | s 10 |
| -------- | ---- | ---- | ---- |
| 3/2 (702) | dip 4.10 | dip 3.45 | dip 3.05 |
| 4/3, 5/4, 5/3, 7/4 | dips | dips | dips |
| 11/8 (551) | no dip | dip | dip |
| 9/8 (204) | no dip (one at 223) | dip | dip |
| 13/8 (842) | no dip | no dip | dip |
| dips in 0..1200 | 13 | 19 | 23 |

| N | ratios | build (s 17, Node) | note |
| - | ------ | ------------------ | ---- |
| 10k | 3,167 | 23 ms | a 1065 c dip that is an artifact (gone at 30k) |
| 30k | 9,474 | 74 ms | converged: normalized 3/2 0.721 (100k: 0.716) |
| 100k | 31,604 | 302 ms | |
| 500k | ~158,000 (est.) | ~1.5-3 s (est.) | worker needed |

## Behavior
| # | Action | Result |
| - | ------ | ------ |
| E1 | Open the Dissonance view | The HE curve is drawn behind the roughness curve, on its own vertical scale (labeled "Harmonic entropy"), 0..1200 c; the field's pitches are marked on it (dots at their exact HE). |
| E2 | Drag the s slider 17 -> 12 | The curve rebuilds when the drag pauses (not per pixel); dips appear at 9/8 and 11/8. The slider shows "s 12 c". One s for the whole lab (Dissonance view, picker metric, Near overlay all use it); saved in `settings.v1` (H- row). |
| E3 | s back to 17 | Instant (that curve is kept). |
| E4 | Picker Color: Harmonic entropy (Rings, Near or Monzo, per view like the other metrics) | Each cell / dot / Monzo cell / pin card is shaded by its exact HE (intervals outside 0..1200 c are octave-reduced first); low HE = simple end for Interval intensity; legend = gradient bar with end values (Fixed = the curve's own min..max at the current s and N; Fit = the view's min..max) and the hover tick; the s slider is also shown in the Color panel while HE is selected (same value). |
| E5 | Near view (meta ring), checkbox "Entropy curve" | The HE curve is drawn around the meta ring as a radial line aligned with the dots' angles (each dot sits at its cents angle; the curve dips toward the ring at consonances). With a smaller Span, only that arc of the curve is drawn. |
| E6 | Developer menu: "Harmonic entropy candidates (n·d <)" 10k / 30k (default) / 100k / 250k / 500k | Each choice shows an estimated build time ("about 0.3 s"), calibrated from this machine's last build (ms per ratio × ratio count). Builds above about 200 ms run in a background worker; meanwhile the views show "Building entropy…" and keep the previous curve. Saved in `developer.v1`. |
| E7 | Acceptance (ARC) | Dips at 1/1, 3/2, 4/3, 5/4 at s 17 and N 30k; build time measured and reported. |
