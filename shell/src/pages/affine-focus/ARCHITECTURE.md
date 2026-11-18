# Affine Focus Transform Explorer (`affine-focus`)

Standalone `shell/` instrument at `/affine-focus` (arc `arcs/affine-focus`). Replaces the legacy vanilla-JS prototype (`../affine-focus-transform-explorer/`) with a tuning-agnostic transformational laboratory that inherits Harmonic Field Lab's one-screen layout, type scale (`M8k`), card/ring geometry (`ChordDrawing` + `ModeChevron`), tree fold pattern, and semantic marker vocabulary (`H-2` to `H-4`).

## Files

| Path | Role |
| --- | --- |
| `src/pages/AffineFocus.page.tsx` | Route entry file (`/affine-focus`). |
| `src/lib/affine-focus/types.ts` | Core domain types: `Fraction`, `GamutPitch`, `TuningGamut`, `TransformDomain`, `RuleFamily`, `TransformConfig`, `VoiceTransformStep`, `TransformResult`, `ClosureGraph`, `DualFocusMapEntry`, `TrajectoryStep`. |
| `src/lib/affine-focus/tunings.ts` | Exact rational (`Fraction`) arithmetic, repeat folding (`foldFraction`), 10 built-in tuning presets (EDOs, Ptolemy 7-note JI, `JI12`, 1·3·5·7 Hexany, Ellis Duodene, Bohlen–Pierce 13-ED3 and 9-note JI Lambda), custom gamut parser, gamut snapping (`snapPitchToGamut`), and seed parser (`parseSeedInput`). |
| `src/lib/affine-focus/transform.ts` | Pure transform engine supporting 4 transform domains (`gamut-steps`, `log-pitch`, `linear-freq`, `subharmonic`), `folded` vs. `unfolded` register, `exact` vs. `snap-to-gamut` realization, 5 canonical rule families (`single-focus`, `dual-focus`, `perspective`, `bilateral`, `multi-multiplier`), and `unordered-set` vs. `ordered-tuple` voice tracking. |
| `src/lib/affine-focus/closure.ts` | BFS finite closure graph builder, Tarjan Strongly Connected Component (SCC) orbit/attractor detector, and shortest transform path finder (`findShortestTransformPath`). |
| `src/lib/affine-focus/dualFocus.ts` | Affine map solver over $\mathbb{Z}_N$ (`g(x) = ax + b mod N`) for `swap`, `fix-both`, and `preserve-axis` constraints on a focus pair $\{f_A, f_B\}$ with permutation cycle decomposition. |
| `src/lib/affine-focus/trajectory.ts` | Step-by-step trajectory chain helpers (`createInitialTrajectory`, `appendTrajectoryStep`, `truncateTrajectoryAt`). |
| `src/pages/affine-focus/AffineFocusApp.tsx` | Top-level workspace layout (top bar, left control rail, center focus stage + exploration tabs, right arithmetic & audio inspector). |
| `src/pages/affine-focus/state.ts` | LocalStorage persistence (`hrifa.affine-focus.v1`), curated 1-click musical scenario presets (`SCENARIO_EXAMPLES`), and signed cyan/orange error coloring helpers. |
| `src/pages/affine-focus/audio.ts` | Web Audio polyphonic synthesizer (harmonic 7-partial or pure sine, chord or arpeggiated delivery, source/target alternation, trajectory progression playback). |
| `src/pages/affine-focus/export.ts` | JSON state export (with provenance), Nodes CSV export, and Mermaid directed graph export. |
| `src/pages/affine-focus/components/*` | `ControlRail.tsx`, `FocusStage.tsx`, `MiniRing.tsx`, `FamilyTrajectoryView.tsx`, `ClosureOrbitView.tsx`, `DualFocusMatrixView.tsx`, `InspectorRail.tsx`. |

## Mathematical & Acoustic Contracts

1. **Four Transform Domains:**
   - `gamut-steps`: Affine math on ordinal gamut indices $i \in \mathbb{Z}_N$: $i' = k + a(i - k) \pmod N$, tracking octave/repeat wraps when `folding === 'unfolded'`.
   - `log-pitch`: Perceptual log-frequency interval scaling $c' = c_f + a(c_x - c_f)$ (exact rational power $r' = r_f \cdot (r_x / r_f)^a$ when inputs are rational and $a \in \mathbb{Z}$).
   - `linear-freq`: Physical otonal frequency-difference scaling $r' = r_f + a(r_x - r_f)$.
   - `subharmonic`: Utonal period / string-length scaling $1/r' = 1/r_f + a(1/r_x - 1/r_f)$.
2. **Folding & Quantization:**
   - `folded` reduces pitches into $[0, R)$ by powers of the repeat $R$; `unfolded` keeps true acoustic register around the focus.
   - `snap-to-gamut` snaps transformed pitches in `log-pitch`, `linear-freq`, or `subharmonic` to the nearest gamut pitch mod $R$ and records signed cents error ($c_{\text{snapped}} - c_{\text{exact}}$).
3. **Persistence Boundary:**
   - Stored under `hrifa.affine-focus.v1` in `localStorage`, independent of Composition Workbench and Harmonic Field Lab keys.
