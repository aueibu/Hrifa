# ARC: Affine Focus Transform Explorer (`affine-focus`)

## Goal
Port and re-envision the Affine Focus Transform Explorer into `shell/` at `/affine-focus` (`src/lib/affine-focus/` and `src/pages/affine-focus/`). Replace the legacy prototype's hardcoded $\mathbb{Z}_m$ integer-set model and tangled SVG hairball graph with a general focus-relative transformational instrument that supports arbitrary tunings (EDOs, Just Intonation scales, CPS gamuts, custom ratio/cents fields, and non-octave repeats), four transform domains (`Gamut Steps`, `Log Pitch`, `Linear Freq`, `Subharmonic`), folded ($\bmod\ R$) vs. unfolded acoustic register, exact vs. gamut-snapped pitch realization, five canonical transformational rule families (`Single Focus`, `Dual Focus`, `Perspective`, `Bilateral`, `Multi-Multiplier`), unordered set vs. ordered voicing tuple tracking, an interactive Pitch Ring + Register Strip geometry stage, step-by-step trajectory chaining, grouped orbit/closure inspection, and polyphonic Web Audio audition.

## Parameters

- **Tuning & Gamut Model:**
  - An active gamut $G = (p_0, p_1, \dots, p_{N-1})$ inside a repeat period $R$ (default $2/1 = 1200\text{ c}$), where each note carries exact ratio/monzo (when rational) and cents $c \in [0, R)$.
  - Built-in presets: $N$-EDOs (5, 7, 12, 19, 24, 31, 53), 7-note Ptolemy JI Intense Diatonic, 12-note JI (`JI12`), Dekany/Hexany/Duodene, Bohlen–Pierce (13 steps of $3/1$ or 9-note JI lambda), plus custom interval input (`a/b`, cents, `k\n`).
- **Four Transform Domains:**
  1. `gamut-steps`: Affine math on ordinal gamut indices $i \in \mathbb{Z}_N$: $i' = k + a(i - k) \pmod N$, realized at gamut pitch $p_{i'}$ (or with octave wrap tracking when unfolded).
  2. `log-pitch`: Perceptual log-frequency interval scaling around focus $c_f$: $c' = c_f + a(c_x - c_f)$ (for rational pitches and integer $a$, exact ratio power $r' = r_f \cdot (r_x / r_f)^a$).
  3. `linear-freq`: Acoustic harmonic / otonal frequency-difference scaling: $r' = r_f + a(r_x - r_f)$ (with $\nu' = \nu_0 \cdot r'$). Non-positive results ($r' \le 0$) are flagged as out-of-domain acoustic singularities.
  4. `subharmonic`: Utonal period / string-length scaling: $1/r' = 1/r_f + a(1/r_x - 1/r_f)$.
- **Offset, Folding & Quantization Rules:**
  - Offset mode for continuous/fractional or bilateral transforms: `positive` ($d \in [0, R)$) vs. `signed` shortest arc ($d \in [-R/2, R/2)$) vs. `unwrapped` ($d = x - f$).
  - Folding: `folded` (reduces result into $[0, R)$ by powers of the repeat $R$) vs. `unfolded` (preserves true acoustic register around the focus).
  - Quantization (in `log-pitch`, `linear-freq`, `subharmonic`): `exact` (keeps exact transformed pitch) vs. `snap-to-gamut` (snaps each result to the nearest gamut pitch mod $R$, recording signed cents error).
- **Five Canonical Rule Families:**
  1. `single-focus`: $T_{f,a}(x) = f + a(x - f)$ (includes $a = -1$ pivot reflection, $a = 1$ identity, $a = 0$ collapse, and general dilation $a$).
  2. `dual-focus`: Anchored on a pair $\{f_1, f_2\}$: edge reflection $T_{\{f_1,f_2\}}(x) = (f_1 + f_2) - x$ (swapping $f_1 \leftrightarrow f_2$, generalized $P/L/R$), plus general affine solver for maps fixing, swapping, or preserving $\{f_1, f_2\}$.
  3. `perspective`: Zero-anchored focus vantage $P_{f,a}(x) = a(x - f)$ (places focus $f$ at the origin $0$).
  4. `bilateral`: Split multipliers $(a_+, a_-)$ for positive vs. negative signed offsets $d = x - f$ around focus $f$ (includes focus fold $a_+ = 1, a_- = -1$).
  5. `multi-multiplier`: Closure and comparison across a set of multipliers $A = \{a_1, a_2, \dots\}$.
- **Element Identity:** `unordered-set` (canonical sorted deduplicated set) vs. `ordered-tuple` (preserves voice index $x_i \mapsto y_i$ and voice-leading vector $\Delta_i = y_i - x_i$).
- **Persistence:** Per-page localStorage key `hrifa.affine-focus.v1` (outside the workbench prefix).
- **Theming & Design Decisions (adopted directly from Harmonic Field Lab, `H-2`–`H-4` & `UI-CONVENTIONS.md`):**
  - **One-screen instrument layout:** `100dvh` (`overflow: hidden`) with `0.25rem` gaps between `--panel` columns on `--surface`, sub-groups in `--panel-inset` / `--panel-slot`, separated by tier steps rather than divider lines or shadows (`src/theme/THEMING.md` divider budget).
  - **Type scale (`M8k`):** Use the eight lab type tokens (`--lab-fs-tiny: 0.6875rem`, `--lab-fs-small: 0.75rem`, `--lab-fs-body: 0.8125rem`, `--lab-fs-title: 0.875rem`, `--lab-fs-glyph: 1rem`, `--lab-fs-display: 1.5rem`, `--lab-svg-fs-small: 9px`, `--lab-svg-fs-label: 11px`); nothing below `0.6875rem` (11px).
  - **Color & Mark vocabulary (roles only, no hex):**
    - Source set polygon & dots on ring/strip: `--text` (solid dots for active set members, dimmed solid ~35% for unselected ambient gamut notes, dashed for off-gamut exact pitches).
    - Focus anchor marker: the bold `--text` inward chevron (`ModeChevron` / `RingChevron`, `d="M-6 -5.5L0 0L-6 5.5"`) on every ring (main ring and card mini-rings) and strip, plus `--mark-yellow` pin halo for pinned focus/note inspection (`H-3`).
    - Transformed target chord / hovered operation preview: `--mark-blue` polygon, dots, and voice-leading arcs/arrows (`H-2`).
    - Sounding pitches: `--mark-green` (`H-2`).
    - Snap error severities: `--mark-cyan`, `--mark-green`, `--mark-yellow`, `--mark-orange`, `--mark-red`, always paired with the printed signed cents value (`+13.7 c`).
    - Card / item selection: `1px` border + `1px` outline in `--text` (no halo, no fill change).
  - **Cards (`ChordCard` pattern):** One card per row with a mini ring on the left (showing the transformed polygon and focus chevron), title & subtitle, pitches (ratios when rational, else cents with 1 decimal) and `steps a, b c` wrapped only between whole values with glued units, right stat (`exact`, snap error in severity color, or `fixed`), and trailing actions.
  - **Tree hierarchy & Folds (`Fold` pattern):** Tree-style foldable headers with chevron button, hairline left guide line (`--control-border`, brightens on hover, clickable to fold), level weights (level 1 `600`, level 2 `500`, level 3 `400` muted), and right-aligned tabular counts (`min-width: 8ch`).
  - **Stability (`UI-CONVENTIONS.md` §1):** Blocks never jump or resize on hover/state change; numeric readouts use `tabular-nums` and fixed `ch` widths; panel headers stay fixed while lists scroll with `scrollbar-gutter: stable`.
- **DECISIONS prefix:** `AF` (registered on the first cross-arc decision row if one is needed).

- Owned paths: `src/lib/affine-focus/`, `src/pages/affine-focus/`, `arcs/affine-focus/`
- Shared paths it may touch: `package.json` (new-arc setup for `check:affine-focus`), `src/pages/AffineFocus.page.tsx`, `src/Router.tsx`, `src/data/applets.ts`, `shell/ARCHITECTURE.md`
- Check command: `corepack yarn check:affine-focus`
- Concurrency: same checkout and branch as the other arcs; the orchestrator commits at the end of every milestone with path-scoped `git add <paths>` and `git commit -- <paths>` only (never `git add -A` or a bare `git commit`; on an `index.lock` error retry, never delete the lock) and removes lock rows only after that commit; after writing a lock row re-read `arcs/LOCKS.md` (on a duplicate the earlier row wins, or the human decides); before committing a shared-component or theme change also run the consuming arcs' check (`shell/ARCHITECTURE.md`, "Who consumes what"); use an arc-prefixed `DECISIONS.md` id (`AF-1`).

## Preconditions
- The arc's `Check command` (`corepack yarn check:affine-focus`) exists (created by the orchestrator under a `package.json` lock at new-arc setup, before C0 and the first code milestone) and is green before the first code milestone starts.

## Non-goals
- Do not modify `src/pages/composition-workbench/`, `src/pages/harmonic-field-lab/`, `src/pages/scale-explorer/`, or shared `PianoRoll`/`Stage` components.
- Do not delete or alter the legacy vanilla-JS applet in `../affine-focus-transform-explorer/`.

## Milestones

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, and `arcs/LOCKS.md`. Record in `PROGRESS.md` what other arcs own, what is locked, and any decision or backlog item that affects this arc.
- Acceptance:
  - [ ] `PROGRESS.md` notes the scan result (other arcs, locks, relevant decisions/backlog)
- Human checkpoint after: no

### M1: Pure mathematical engine — Tunings, 4 Domains, 5 Rules & Voicing Modes
- Scope: `src/lib/affine-focus/` (`types.ts`, `tunings.ts`, `transform.ts`, `rules.ts`, `index.ts`, `transform.test.ts`)
- Acceptance:
  - [ ] `corepack yarn check:affine-focus` passes
  - [ ] Verified against the confirmed scenario table on 7-note JI Diatonic $(1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8)$ with seed $(1/1, 5/4, 3/2)$, $f = 1/1, a = 2$:
    - `gamut-steps` ($\bmod\ 7$) yields indices $[0, 4, 1]$: unfolded $(1/1, 3/2, 9/4)$, folded $\{1/1, 9/8, 3/2\}$
    - `log-pitch` yields unfolded $(1/1, 25/16, 9/4)$, folded $\{1/1, 9/8, 25/16\}$
    - `linear-freq` yields unfolded $(1/1, 3/2, 2/1)$, folded $\{1/1, 3/2\}$; and with $f = 3/2, a = -1$ yields folded $\{1/1, 3/2, 7/4\}$
    - `subharmonic` yields unfolded $(1/1, 5/3, 3/1)$, folded $\{1/1, 3/2, 5/3\}$
  - [ ] Verified against the confirmed scenario table on 12-EDO with seed $(0, 4, 7)$:
    - `single-focus` ($f = 0, a = -1$) $\to (0, 8, 5) / \{0, 5, 8\}$ (F minor)
    - `dual-focus` ($\{0, 7\}$, swap $a = -1$) $\to (7, 3, 0) / \{0, 3, 7\}$ (C minor, P); $\{4, 7\} \to \{4, 7, 11\}$ (E minor, L); $\{0, 4\} \to \{0, 4, 9\}$ (A minor, R)
    - `single-focus` dilation ($f = 4, a = 5$) $\to (8, 4, 7) / \{4, 7, 8\}$
    - `perspective` ($f = 4, a = 1$) $\to (8, 0, 3) / \{0, 3, 8\}$
    - `bilateral` ($f = 4, a_+ = 1, a_- = -1$, signed $d \in [-6, 6)$) $\to (8, 4, 7) / \{4, 7, 8\}$
  - [ ] Gamut snapping in `log-pitch`, `linear-freq`, and `subharmonic` snaps each transformed pitch to the nearest gamut pitch mod $R$ and reports signed cents error
  - [ ] Both `unordered-set` and `ordered-tuple` modes work and report step-by-step arithmetic rows and voice-leading displacements
- Human checkpoint after: no

### M2: Closure, Orbit (SCC), Dual-Focus Solver & Trajectory Engine
- Scope: `src/lib/affine-focus/` (`closure.ts`, `dualFocus.ts`, `trajectory.ts`, `closure.test.ts`)
- Acceptance:
  - [ ] `corepack yarn check:affine-focus` passes
  - [ ] Immediate 1-step family generation supports focus policies: `current-members`, `seed-members`, `all-gamut`, `custom`, and `dual-pairs`
  - [ ] BFS closure deduplicates canonical states, records all focus/multiplier transform edges, distinguishes true saturation from safety-limit truncation, computes Tarjan Strongly Connected Components (SCCs / attractors / reversible orbits), and finds shortest transform paths between states
  - [ ] Dual-focus affine map search finds all maps over $\mathbb{Z}_N$ satisfying `fix-both`, `swap`, or `preserve-axis` on $\{f_1, f_2\}$, with cycle decomposition and fixed points
  - [ ] Trajectory chain supports stepping $S_0 \xrightarrow{op_1} S_1 \xrightarrow{op_2} \dots$, branching/rewinding, and provenance
- Human checkpoint after: no

### M3: Page Registration, Left Control Rail & Focus Geometry Stage
- Scope: `src/pages/AffineFocus.page.tsx`, `src/Router.tsx`, `src/data/applets.ts` (under locks), and `src/pages/affine-focus/` (`AffineFocusApp.tsx`, `state.ts`, `components/ControlRail.tsx`, `components/FocusStage.tsx`, `components/FamilyTrajectoryView.tsx`, `AffineFocus.module.css`, `AffineFocus.page.test.tsx`)
- Acceptance:
  - [ ] `corepack yarn check:affine-focus` passes
  - [ ] Route `/affine-focus` is registered in `src/Router.tsx` and `src/data/applets.ts` points `Affine Focus` to `/affine-focus`
  - [ ] Left Rail controls Tuning/Gamut preset & custom intervals, Seed set/voicing (text + clickable degree chips + Unordered/Ordered toggle), Transform Domain (`Gamut Steps` | `Log Pitch` | `Linear Freq` | `Subharmonic`), Folding (`Fold mod R` | `Unfolded`), Quantization (`Exact` | `Snap to Gamut`), and Rule family + parameters
  - [ ] Center Top Focus Geometry Stage renders both the **Pitch Ring ($\bmod\ R$)** and **Unfolded Register Strip** with gamut ticks, source notes, focus chevron anchor(s), target notes, and voice-leading arrows, with instant hover preview on any focus operation card
  - [ ] Immediate Family cards show mini ring glyphs, resulting pitches/ratios, invariant notes, voice-leading distance, and allow clicking **"Step →"** to build a Trajectory Chain
- Human checkpoint after: yes

### M4: Grouped Orbit/Closure Map, Dual-Focus Matrix, Arithmetic Inspector, Polyphonic Audio & Docs
- Scope: `src/pages/affine-focus/` (`components/ClosureOrbitView.tsx`, `components/DualFocusMatrixView.tsx`, `components/InspectorRail.tsx`, `audio.ts`, `export.ts`, `ARCHITECTURE.md`, tests) and `shell/ARCHITECTURE.md`
- Acceptance:
  - [ ] `corepack yarn check:affine-focus` passes
  - [ ] Grouped Orbit & Closure tab organizes states by Generation or Strongly Connected Component (SCC) with focus-edge filtering and shortest-path highlighting
  - [ ] Dual-Focus & Rule Matrix tab compares focus pairs $\{f_1, f_2\}$ and multiplier families side-by-side
  - [ ] Right Rail Inspector shows the full per-voice arithmetic breakdown table ($x \to d \to a \cdot d \to \text{raw} \to \text{folded/snapped} + \text{error}$), set/voicing analysis, and polyphonic Web Audio audition (Play Source, Play Target, Alternate $S \leftrightarrow T(S)$, Play Trajectory Chain, simultaneous or arpeggiated, at exact $\text{baseHz} \cdot 2^{c/1200}$)
  - [ ] Export (JSON state with provenance, CSV, Mermaid) and `hrifa.affine-focus.v1` localStorage persistence work with reset
  - [ ] `src/pages/affine-focus/ARCHITECTURE.md` and `shell/ARCHITECTURE.md` are updated
- Human checkpoint after: yes

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to `shell/ARCHITECTURE.md` or the page's own `ARCHITECTURE.md` contracts.
- A shared path needed is locked by another arc in `arcs/LOCKS.md`.
- Any decision about look, sound, or musical taste not specified above.

## Budget
Max 2 builder attempts per milestone; then stop and report.
