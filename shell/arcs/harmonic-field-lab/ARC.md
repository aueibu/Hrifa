# ARC: Dynamic retuner + move into the Hrifa shell + encyclopaedia UI

**Status: APPROVED (2026-11-12).** Moved into the shell's multi-arc layout the same day (from `C:\Users\apoor\Documents\Infinitone Tracing\ARC.md`, history in `PROGRESS.md`), and re-ordered so the retuner is written once, in TS, after the core port. Next: M4 (mock, human checkpoint).

The source repo `C:\Users\apoor\Documents\Infinitone Tracing` (below: **the Infinitone repo**) keeps the frozen JS prototype (`prototype/`), its contracts (`ARCHITECTURE.md`, `prototype/CORE_SPEC.md`) and the RE notes (`notes/`). Read them by absolute path; never edit them (they are outside this arc's paths, except the one-time freeze note and pointer done at Setup).

## Goal
Three things, ordered so nothing is built twice:

1. **The lab moves into the Hrifa shell** (React 19 + TS + Mantine). It uses the shell's theming. The ultimate goal is for it to **join the Composition Workbench piece by piece**, so the core becomes a pure TS library and the UI becomes self-contained section components.
2. **A dynamic retuner** that does what Infinitone 2's Auto Retuner does in practice (Infinitone repo `notes/AUTORETUNER.md`). It keeps a pivot note fixed, re-roots a list of candidate scales ("cards") around it, predicts the held chord in each card, scores each prediction, and switches to the best one. There are **four scoring methods**, and you can see *why* a card won.
3. **A UI rebuilt as a "digital encyclopaedia"** in the shell's theme. It is information-dense but you never get lost. It keeps the one-page idea and the pop-out reader, and fixes the crowded spots, the readability and the organisation.

## Design decisions already made (from the human)
- Notes are monzos + cents. Analysis survives outside 12-EDO. Every label/control/analysis row gets a tooltip with an example. Anything that sounds lights in every visualiser. (standing)
- Retuner: **behavioural parity, not code parity** with Infinitone. (2026-11-12)
- Candidate scales = **a new, dedicated card list** inside the retuner (not tabs, not the saved-subset library). (2026-11-12)
- **Four scorers:** (1) Infinitone parity (pure sines, 0.1 s, 44100 Hz, 100×100 grid cell count, linear-ratio nearest degree, pitch bias kept); (2) pitch-fair periodicity (window scales with the chord); (3) lattice distance (mean Tenney height of every pair of chord tones, nearest ratio within an odd limit for irrational notes); (4) roughness with overtones (Plomp–Levelt / Sethares). (2026-11-12)
- **Default scorer = Sethares roughness.** No checkpoint for the scorer milestone. (2026-11-12)
- Move to the Hrifa shell before any UI work, using the shell's theming. Ultimate goal: the lab joins the Composition Workbench piece by piece. (2026-11-12)
- **The lab stays a standalone page in Hrifa** (its own route `/harmonic-field-lab` and Home applet, its own tabs and settings), permanently, not just as a staging step. Workbench integration later *reuses* its core (`src/lib/harmonic-field/`) and section components; it does not replace the page. (2026-11-12)
- **Port style = core first, UI rebuilt:** port the core to TypeScript with `vectors.json` as the Vitest contract, plus an empty themed page. The UI is rebuilt directly as React components in the encyclopaedia layout, one section at a time. There is **no 1:1 port** of the old page. (2026-11-12)
- **Arc home:** the shell workstream folder `arcs/harmonic-field-lab/` (this file + `PROGRESS.md`), gate `check:hfl`, DECISIONS prefix `H`. The page's own `ARCHITECTURE.md` lives in `src/pages/harmonic-field-lab/`. The Infinitone repo keeps the frozen prototype and the RE notes. (2026-11-12, approved with the Setup defaults)
- **Start in Hrifa now; the retuner is written once, in TS, after the core port** (the first draft built it in the JS prototype first). The standalone prototype is **frozen now** at 221 tests (168 vectors + 53 presets): it keeps working from disk as a reference, with no new features. `vectors.json` moves with the core and stays the contract. (2026-11-12)
- The Home test (`src/pages/Home.page.test.tsx`, Home has no active arc) may be edited under a lock to bump the applet count. (2026-11-12, human OK)
- The UI overhaul starts with a **mock** the human approves before the live UI is built. (2026-11-12)
- M3–M7 below were approved as drafted ("M3 good, M4 good, M5 wonderful, M6 super" for the first draft's M3–M6). (2026-11-12)

## Proposed UI principles (confirmed or changed at the M4 mock checkpoint)
Diagnosis of the prototype page (1500 px screenshot, 2026-11-12):
- The right analysis column is a long, narrow scroll; the spectrum scrolls sideways inside it; "Step sizes" is a wall of text.
- The Generator column is mostly empty.
- The subset controls have no visible grouping.
- The keyboard is far from everything it plays.

Proposal:
- **Contents rail**: sticky, every section and block with a live one-line summary ("Chords · 9 found"), scroll-spy, click to jump.
- **Articles**: each block has heading → **lede** (the key fact in one line) → detail → "Open in reader" (a full-size Mantine Modal). Blocks collapse to heading + lede, and the collapsed state is remembered.
- **Shell typography and spacing** (Figtree body, DM Mono numbers, Fraunces headings, Mantine spacing scale). Tabular, right-aligned numbers. Units in headers. Grouped control clusters. Follow `src/theme/THEMING.md`: roles only, divider budget, no decorative shadows.
- **Glossary**: every tooltip text is also a searchable glossary entry (one source of truth in a `texts.ts`), with "see also" links.
- **Docked transport**: a top bar for global audio + tabs, and a collapsible keyboard dock.

## Parameters
- **Repo:** all work in the Hrifa repo (git root `C:\Data Files\Projects\Hrifa`, app in `shell/`; paths below are relative to `shell/`). Use the shell's `CLAUDE.md`, `.claude/agents/*`, `src/theme/THEMING.md` and commands (`corepack yarn …`, run in `shell/`). `Hrifa/CLAUDE.md` contains unrelated text; ignore it for this arc.
- **Owned paths:** `src/lib/harmonic-field/` (new: pure TS core, no React, no DOM, so the workbench can import it without depending on a page), `src/pages/harmonic-field-lab/` (new: components, hooks, tests, `texts.ts`, `settings.ts`, the page's `ARCHITECTURE.md`), `arcs/harmonic-field-lab/`.
- **Shared paths it may touch** (row in `arcs/LOCKS.md` while edited, written by the orchestrator): `package.json` (Setup only: add `check:hfl`); `src/pages/HarmonicFieldLab.page.tsx` (standing shared entry file, created in M1); `src/Router.tsx` and `src/data/applets.ts` (M1 registration); `src/pages/Home.page.test.tsx` (M1 applet count, human OK 2026-11-12); `ARCHITECTURE.md` (M1/Final: add the page and `src/lib/harmonic-field/` to the map and "Who consumes what"). `DECISIONS.md`/`BACKLOG.md` need no lock for our own rows.
- **Check command:** `corepack yarn check:hfl` = `npm run typecheck`, then `oxfmt --check` and `oxlint` scoped to our two code folders (both with `--no-error-on-unmatched-pattern`), stylelint scoped (`--allow-empty-input`), `vitest run --passWithNoTests src/lib/harmonic-field src/pages/harmonic-field-lab`. Modelled on `check:workbench`. The project-wide `vite build` is not in the gate (like `tsc`, it can go red from other arcs' work); M1 runs one build by hand and records it. If the gate is red only because of other arcs' files, stop and report (shell rule 14).
- **DECISIONS prefix:** `H`, registered in our first row. Rows due: H-1 the lab's pitch representation (monzo + cents; midicents/Hz only at the edge, matching W-1 at any workbench handoff) in M1; any colour-role/marker mapping that touches the theme contract; any change to a shared component (none planned).
- **Concurrency:** same checkout and branch as the other arcs. The orchestrator commits at the end of every milestone with path-scoped `git add <paths>` and `git commit -- <paths>` only (owned + locked paths; never `git add -A` or a bare `git commit`; on an `index.lock` error retry, never delete the lock), and removes lock rows only after that commit. After writing a lock row, re-read `arcs/LOCKS.md` (on a duplicate the earlier row wins, or the human decides). Builders run only the tests of the files they touched; the orchestrator runs `check:hfl` once per milestone.
- **Data contracts:** as the Infinitone repo's `ARCHITECTURE.md` (monzo `{prime: exp}`, Note `{m, c}`, Field rules, tolerances), ported unchanged. The workbench's unit is midicents (`composition-workbench/pitch.ts`, DECISIONS W-1). Derive midicents/Hz from cents only at the edge (audio, workbench handoff); never store them in place of monzos.
- **Retuner model (core):** card `{name, notes, rep, base: {m|null, c}}`, base kept as an exact monzo when possible so drift shows as a ratio. Held notes `[{key, deg, oct, t}]`. Re-root: `base(C) = base(R) · ratio_R[D] / ratio_C[D]`, where R = active card (Freestyle) or card 0 (Fixed). In Fixed, card 0 is never a target. Scorers: `score(freqsHz, opts) → {score, detail}`, lower = better.
- **Persistence (shell):** follow the shell pattern (`loadSettings`/`saveSettings`/`sanitizeSettings`). Keys: `hrifa.harmonic-field-lab.settings.v1` (UI state, collapsed blocks), `…tabs.v1`, `…subsets.v1`, `…chordfinder.v1`, `…retuner.v1` (`{cards:[{name, snap}], settings:{pivot, anchor, trigger, scorer, scorerOpts, glideMs}}`). The snapshot shape stays as in the prototype (optional fields with defaults). Prototype data lives on another origin (`file://`), so it does not carry over automatically (see Open questions).
- **Theme:** shell roles and `--mark-<hue>` only. No hex, raw shades, or ad-hoc radius/shadow. Map the lab's colour meanings (selected, highlighted chord, sounding, sharp/flat, the five chord-error severities) onto roles/marker hues, documented in the page's `ARCHITECTURE.md`.
- **Tests:** `vectors.json` (copied from the Infinitone repo's `prototype/tests/vectors.json` into `src/lib/harmonic-field/`) is imported by a Vitest runner that ports `run_tests.js`'s op handlers. Preset checks are ported too. New core rules add cases to that file. Rendering checks use the dev server + headless Edge with a throwaway `--user-data-dir`.

## Preconditions
- `check:hfl` exists and is green before M1 (created at Setup; the rule-15 flags make it green with no code). If missing or red, stop and report; if red only because of other arcs' files, it is not ours to fix.
- Our owned and locked paths are clean before each builder brief (other arcs may have uncommitted work elsewhere).
- `corepack yarn test` is run once before M1 to record the baseline (unrelated failures may exist; record them, don't fix them).

## Non-goals
- No 1:1 port of the old page UI. No new features in the frozen prototype.
- No changes to the shell's existing pages, theme system, or audio engine internals (use them as they are; stop and ask if they block us).
- No merging into the Composition Workbench in this arc. Just design the core and sections so that it is easy later.
- No MIDI input, MPE or MTS-ESP output. No harmonic entropy, no comma-pump finder.
- No more RE of the binary unless a milestone truly needs it (stop and ask).

## Milestones

### Setup (done 2026-11-12, orchestrator, shell rule 16)
- Arc folder created, ARC/PROGRESS moved here, Infinitone repo `ARC.md`/`PROGRESS.md` replaced by pointers and the prototype frozen (README note), `check:hfl` added under a `package.json` lock, path-scoped commits, lock released. See PROGRESS.

### C0: Context scan
- Read `ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, `arcs/LOCKS.md`, and `src/theme/THEMING.md`. Note who imports from `src/lib/`, and whether we would reuse Scale/Raga Explorer code (a cross-arc API).
- Acceptance:
  - [ ] PROGRESS.md notes the scan result (other arcs, locks, relevant decisions/backlog, and whether the shared audio engine can play arbitrary Hz with held voices and glide, for M5).
- Human checkpoint after: no

### M1: Core to TS + empty themed page
- Scope: owned `src/lib/harmonic-field/`, `src/pages/harmonic-field-lab/`; locked `src/pages/HarmonicFieldLab.page.tsx`, `src/Router.tsx`, `src/data/applets.ts`, `src/pages/Home.page.test.tsx`, `ARCHITECTURE.md`. Source: the Infinitone repo's `prototype/hfl_core.js`, `hfl_presets.js`, `tests/run_tests.js`, `tests/vectors.json`, `CORE_SPEC.md`.
- Acceptance:
  - [ ] Core ported to strict TS as cohesive modules (e.g. `intervals` (monzo/ratio/cents), `field` (generators, buildField), `subset`, `shape`, `chords`, `scales` (melakarta/library), `keys`, `deviation`, `scala`, `presets`). Public API documented in `src/lib/harmonic-field/README.md` (absorbing `CORE_SPEC.md`). No React/DOM imports.
  - [ ] Every case in `vectors.json` passes in Vitest through ported op handlers (168 vectors), and all 53 preset checks pass (221 total, same as the frozen prototype).
  - [ ] `HarmonicFieldLab` page registered (route `/harmonic-field-lab`, applet entry with status "prototype", Home test updated). Shows the shell AppShell header (back link, title, `ColorSchemeToggle`) and a "coming soon" Surface. No hex anywhere.
  - [ ] `check:hfl` green. One `vite build` run and recorded in PROGRESS.
  - [ ] Page `ARCHITECTURE.md` started in `src/pages/harmonic-field-lab/` (contracts, module map, colour-role mapping plan). `ARCHITECTURE.md` (shell) lists the page and `src/lib/harmonic-field/`. `DECISIONS.md` H-1 (registers prefix H) appended.
  - [ ] Path-scoped commit; lock rows removed after it.
- Checkpoint decisions (orchestrator, 2026-11-12, for the human to veto): applet status is `experimental` (the `Applet` type only allows `maintained | experimental`; `prototype` would need a Home change outside our locks). `Home.page.test.tsx` needed no edit (it counts `applets.length`). The colour-role plan in the page `ARCHITECTURE.md` uses core hues only for the five severities (cyan, green, yellow, orange, red + the cents number), to confirm at M4.
- Human checkpoint after: no

### M2: Retuner engine + Infinitone-parity scorer (TS)
- Scope: owned `src/lib/harmonic-field/` (`retuner.ts`, `scorers.ts` or similar), its tests, `vectors.json`, `README.md`. No UI.
- Core API (export all): `pickPivot(held, mode)` (`manual|lowest|highest|recent|longest`); `degreeOf(card, cents)`; `nearestDegree(card, hz, {metric:'ratio'|'cents'})` → `{deg, oct}`; `rerootCards(cards, refIdx, D)`; `retuneStep(state, opts)` → `{bases, predictions, scores, chosen, drift:{m, c}, why}`; `scorePeriodicityInfinitone(freqs, {dur=0.1, sr=44100, bins=100})`.
- Acceptance:
  - [ ] Test: each pivot mode picks the documented note on a fixed held set; Manual returns `null`.
  - [ ] Test: re-root keeps the pivot's absolute pitch identical (≤ 1e-9 c) in every card. JI bases are exact monzos.
  - [ ] Test: parity scorer orderings at 220 Hz (unison < 3/2 < 12-EDO fifth; 4:5:6 < 12-EDO major; 4:5:6:7 < 12-EDO dom7; 45/32 worst), with ±5 % bands around the Infinitone repo's `notes/AUTORETUNER.md`. Not exact cell counts.
  - [ ] Test: parity pitch bias: 4:5:6 at 55 Hz scores clearly worse than at 440 Hz.
  - [ ] Test (drift): a fixed chord sequence over 5-limit JI cards accumulates a known comma in Freestyle (hand-verified in the report, e.g. 81/80) and exactly 0 in Fixed.
  - [ ] Test: Fixed never chooses card 0; ties go to the lowest index.
  - [ ] Rules documented in the lib `README.md`; new cases in `vectors.json`; `check:hfl` green; path-scoped commit.
- Checkpoint decisions (human, 2026-11-12): the criterion "4:5:6 at 55 Hz scores clearly worse than at 440 Hz" was wrong in theory (the reconstruction reproduces all 10 measured counts at 220 Hz exactly, yet gives 896 vs 889). Replaced by: 4:5:6 at 20 Hz < 60 % of 440 Hz; at 1760 Hz > 110 %; the 12-EDO-vs-JI gap at 55 Hz < 20 % of the gap at 440 Hz. The Infinitone repo's `notes/AUTORETUNER.md` caveats were corrected (`df6fd5f`). Orchestrator default (parity): Manual pivot takes `manualDeg` (need not be held, as Infinitone), `manualKey` kept as an alternative; drift = chosen card's base minus its `home` (M7 sets `home` when a card is added).
- Human checkpoint after: no

### M3: Three more scorers (TS, shell lib)
- Scope: `src/lib/harmonic-field/scorers*` + tests + docs.
- API: `scorePeriodicityFair`, `scoreLattice(freqsOrNotes, {oddLimit})`, `scoreRoughness(freqs, {harmonics, rolloff})` (**default scorer**), `compareScorers(chords, scorers)`.
- Acceptance:
  - [ ] Test: pitch-fair scores 4:5:6 the same (±2 %) at 55, 220 and 880 Hz.
  - [ ] Test: lattice scores 4:5:6 and 10:12:15 the **same** (same pairwise intervals 5/4, 6/5, 3/2), value hand-checked. This is a tooltip teaching point.
  - [ ] Test: roughness of two harmonic tones (standard Sethares timbre) has local minima at 1/1, 6/5, 5/4, 4/3, 3/2, 5/3, 2/1 on a fine sweep. The builder picks the standard timbre, cites it, and makes it the default.
  - [ ] Test: all four scorers rank JI 4:5:6 above 12-EDO major at 220 Hz.
  - [ ] `compareScorers` table over ~12 standard chords (JI/12-EDO triads and tetrads, tritone, cluster, Young WTP 3–7 chords) pasted into PROGRESS for the human to read later.
- Checkpoint decisions (human, 2026-11-12): default = Sethares roughness, no checkpoint.
- Checkpoint decisions (human, 2026-11-12, at M3 review): lattice scorer picks the explaining ratio by lowest cost = Tenney height + centsPenalty × |error c| over all ratios in the odd limit (default 0.05 bits per cent, 0 = pure Tenney height; exact monzo pairs unpenalised), so a tempered triad scores worse than JI and 300 c reads as 6/5, not 13/11. Comparison table uses La Monte Young Well-Tuned Piano chords from Kyle Gann, "La Monte Young's The Well-Tuned Piano", *Perspectives of New Music* 31/1 (1993), pp. 134–162, Examples 10–12: Opening 4:6:7:8:9:12, Magic 81:84:108:112:144:162:192:216, Romantic 48:54:56:64:72:81:84, Gamelan 42:54:64:81, Tamiar Dream 14:18:24:27, 189/98 Lost Ancestral Lake Region 12:14:18:21:24:27, The Brook 12:14:16:18:21, The Pool 128:144:147:192:224. Orchestrator: roughness includes Sethares' factor 5 (`dissmeasure.m` C1=5, C2=−5).
- Human checkpoint after: no

### M4: Encyclopaedia mock (in the shell theme)
- Scope: a mock route (e.g. `/harmonic-field-lab/mock`) built from shell components (Surface, Mantine, Data/Mono), static real numbers from the "Harmonics from 8" preset, no live maths.
- Acceptance:
  - [ ] Contents rail with summaries, top transport bar, keyboard dock, every current block as an article (heading, lede, detail, Open in reader), glossary drawer, and a placeholder **Retuner** section (card list, pivot/anchor/trigger/scorer controls, "why this card won" table, drift readout).
  - [ ] Screenshots at 1500 px and 1100 px, light and dark (dev server + headless Edge, throwaway profile). A "what changed and why" list mapped to the diagnosis.
- Checkpoint decisions (human, 2026-11-12, mock 1 at `5d4e729` REJECTED as a direction): clearer, but a huge sprawling scroll ("like the Ian Ring scale page, a mile long, you get lost"); it drifted toward a "B2B marketing dashboard for music theory". Wanted: the Ableton/Bitwig clean, tidy, minimalist-but-useful approach. Specifics:
  - Keep the wiki-style nav rail on the left; everything else is too big and spaced out.
  - **One generation-and-selection unit**: presets, method options, pitch circle and the tuner strip together. Prime filter (and maybe repeat interval) go in a fold-away menu nearby.
  - Everything else is analysis. The lattice is intermediate (a visual that shows layout; click-to-toggle exists but is not primary).
  - Field table is useful but huge (n notes = n rows): needs a compact treatment.
  - Stats belong to the right of the ring, glanceable (as in the prototype). Keep the new step-sizes layout.
  - Scale block is unhelpful far down: roll it into the ribbon/tuner strip.
  - Chords: keep and value it; keep click-to-raise/lower tolerance to make a chord appear; group by chord type (templates); templates user-editable behind an Edit button; chips layout preferred over the flat table, but organised.
  - Keys and modes: related; flat tables are sleep-inducing; collate and visualise them.
  - Retuner: leave alone for now (too new); no redesign in this pass.
- Round 2 decisions (human, 2026-11-12, from sketches):
  - **One-screen workspace**: no page scroll at 1500×900. Thin top bar (tabs + transport + Glossary). Left: the wiki rail picks ONE analysis panel (Chords, Spectrum, Keys & Modes, Lattice, Field table, Retuner) with live counts. Centre, always visible: the generation-and-selection unit (preset ▾, method tabs, a ⚙ fold-out for prime filter + repeat interval, pitch circle with glanceable stats + step-size bars to its right, subset tool row, tuner strip with the scale degrees rolled in). Right: the chosen analysis panel, scrolling inside itself. Thin keyboard dock at the bottom. DAW density: small type, compact controls, explanations in tooltips instead of paragraphs.
  - **Keys & Modes**: one rotation × degree heat grid (rows = modes, columns = degrees, cell = how close that degree lands to a field note, severity colour + number on hover) plus a ring of mini dots per key showing which transpositions fit completely; click a row to select or play that mode.
  - **Field table**: no standing table. Hover/click a note anywhere shows its row in a small inspector (ratio, cents, monzo, nearest 12-EDO, deviation); the full table opens in a reader/drawer (sticky headers, dense rows, sort/filter).
  - Retuner panel kept as in mock 1, not redesigned.
- Round 2 feedback (human, 2026-11-13, mock at `76c9121`): "SO much better". Round 3 changes:
  - **Chords:** keep the note-count sections (Triads / Tetrads / Larger); inside each, one row per **family** with a small label. Templates get an optional, user-editable `family` field. Defaults: Major 4:5:6, 8:10:12:15; Minor 10:12:15, 10:12:15:18; Septimal 4:5:6:7, 6:7:9, 14:18:21, 5:6:7, 3:5:7; Utonal 1/(4:5:6:7); Neutral 18:22:27; Suspended 6:8:9.
  - **Every voicing gets its own chip:** when several field notes are within tolerance for the same chord tone, each combination is a separate chip. This is a new lib function beside `findChords`, which stays unchanged as the vector contract.
  - **Tuner strip:** shorter (it was too tall), and its 12-EDO "piano key" spacing reference comes back.
  - **Saved subsets:** the freed space below the strip becomes a browsable list of the saved subsets of this pitch collection, one row each, drawn as a mini tuner strip like a sparkline. Selected pitches are lit, inactive ones dimmed, and the blue/pink deviation bars stay as the cue.
  - (human, 2026-11-13, mid-round) **Method parameters go in a column left of the ring** (room for Lattice generators and the Custom text field). **Ring view toggle Chromatic | Fifths**: Fifths places each note on a chain of generator steps (3/2, period = repeat, 12 steps from −5 to +6 = D♭…F♯ by default, length selectable) at the nearest step with its cents offset; in 12-EDO it is the circle of fifths. Pure geometry in the lib (`fifthsLayout`).
- Round 3 feedback (human, 2026-11-13, mock at `cc23181`): the piano-band underlay is wrong. Instead: thin vertical reference lines (about 5 px) at each 100 c position, lighter grey where a white key would be and darker grey for black keys, as absolute pitch references. Saved-subset rows must line up EXACTLY with the current strip (same horizontal cents scale and left edge) for comparison. So the tuner strip + saved list become a narrower column, which leaves room to put some of the stats beside it.
- Wide screens (human, 2026-11-13): **pin panels into columns.** Rail items get a pin; pinned panels open as extra columns as space allows (about 24rem each), on the **left or right** of the generator, in a user-chosen **order**; the user can move them between sides and reorder them, and the arrangement is remembered. Defaults: left = Keys & Modes, Chords; right = Lattice, Spectrum. At normal widths nothing changes (one panel via the rail); pins that do not fit fall back to the switcher. **Field table** moves into the right-hand stats column under Step sizes (compact, with Open full table), and leaves the rail.
- Stacked pins (human, 2026-11-13, "this is the good shit"): a pinned column can hold **up to two panels stacked** (top/bottom, split evenly), counting as one column for width. Controls (orchestrator default): ← / → move a panel as its own column; Stack merges it into the neighbouring column toward the generator when that has one panel; Unstack splits it out; ↑ / ↓ swap within a stack.
- Splitter between stacked panels (human, 2026-11-13).
- New views (human, 2026-11-13): add **3D lattice + full-size pop-out**, **Dissonance curve** (Sethares, scale notes marked), **EDO fit** (how well each n-EDO 5–72 fits the field) and **Isomorphic keyboard** (hex layout by two generators). Human: a **visualizer option** so one panel can switch between views (e.g. lattice and EDO fit in the same panel). Orchestrator default: visual panels are generic **Visualizer** panels with a view selector (Lattice 2D/3D, EDO fit, Dissonance curve, Isomorphic keyboard), up to three instances in the rail; Visualizer 1 starts on Lattice where Lattice was pinned. No 12-EDO set-class views (covered by the Scale/Raga Explorers).
- Off-axis notes in the lattice (human, 2026-11-13): a note with exponents on primes that are not the chosen axes is drawn with a hollow ring at its folded position, a dashed stem per hidden prime (that prime's marker hue, length = exponent, direction flips for negative), the note itself at the stem tip, and a label chip naming the prime with its signed exponent (e.g. 11⁺¹, 11⁻¹, 11⁺¹ 13⁺¹). Same in 2D and 3D.
- Stacking refined (human, 2026-11-13): up to **three** panels per pinned column (supersedes "up to two"), with a splitter between each pair. "Stack with ▾" menu (any panel whose column has room, either side, any distance) and Pin left / Pin right (also from the switcher header) replace the neighbour-only Stack button; the human likes these menus. Visualizers are named "Visualizer N – <view>" in the rail, headers and menus.
- Approval path (human, 2026-11-13): after the 3-stack change the human is "ready to make this the actual page" (M4 approved on that change landing). **Audio (decided for M5): a lab-local Web Audio voice engine** in the lab's own folder (held voices, glide, any Hz, sine/harmonic timbres); no shared audio code touched; may be promoted to shared later. **Colour contract:** chord highlight (the chord's selected pitches) = `--mark-blue`; sounding = `--mark-green`; sharp / flat = amber / cyan, with amber = `--mark-orange` (the theme has no amber hue; a true amber would be a shared theme change); chord-error severities unchanged (cyan, green, yellow, orange, red, always with the cents number); selection = 1px border + 1px outline in `--text`. All via theme roles, no hex. Logged as DECISIONS H-2.
- **APPROVED (human, 2026-11-13, mock at `ac7b371`): "looks awesome, let's rock and roll".** The human will revisit the note-selection controls (All / None / Invert and the others moved under the ring) later; they stay as they are for now (BACKLOG item).
- M5/M6 re-cut (orchestrator, 2026-11-13, for the approved one-screen layout; the first draft's M5/M6 assumed the rejected article layout). Retuner stays M7.
- Human checkpoint after: **yes** (approve or change the layout)

### M5: Live workspace + lab voice engine
- Scope: owned `src/pages/harmonic-field-lab/` (promote the mock's components into live, state-driven components; the mock route keeps rendering them from frozen data until M6 retires it); locked `src/pages/HarmonicFieldLab.page.tsx` (the entry renders the live page instead of the placeholder).
- Acceptance:
  - [ ] `/harmonic-field-lab` shows the approved layout (rail, pinned columns with stacks and splitters, switcher, centre workspace, dock) driven by one lab state, not module-scope data.
  - [ ] Generation is live: preset, method tabs and their parameters, prime filter and repeat interval (⚙) rebuild the field through the lib; tabs (several pitch collections) can be added, renamed, closed.
  - [ ] Selection is live: click notes on the ring, strip, keys and field table; All / None / Invert; mode stepper; nearest scale and odd-limit Select; Chromatic | Fifths ring; the tuner strip's compare-to; inspector hover and pin; saved subsets save, load (hover preview), delete, rename; .scl export.
  - [ ] Stats, shape, step sizes and the compact field table update live.
  - [ ] Lab-local voice engine (`src/pages/harmonic-field-lab/audio/`, Web Audio, no shared audio code): held voices while a key is down (computer keys and mouse), any Hz from cents and 1/1 Hz, glide between pitches (API ready for M7), sine and a harmonic timbre, volume, Play scale, Play chord, Stop/panic; no stuck notes on blur or tab switch. Everything sounding lights green in every view (H-2).
  - [ ] Persistence through the shell pattern (`loadSettings`/`saveSettings`/`sanitizeSettings`): `hrifa.harmonic-field-lab.settings.v1`, `…tabs.v1`, `…subsets.v1`, `…layout.v1` (from the mock's v3 shape); bad data falls back to defaults; nothing lost on reload.
  - [ ] Analysis panels may show live data where it is cheap; otherwise they keep their mock content until M6 (say which in the report).
  - [ ] Tests: lab state reducers, persistence round-trips and bad data, the voice engine against a fake AudioContext (voice start/stop/glide, panic), page tests for generation and selection; `check:hfl` green.
- Human checkpoint after: **yes** (ears and feel)

### M6: Live analysis panels + parity
- Scope: owned page folder; locked `src/Router.tsx` (retire `/harmonic-field-lab/mock` at the end).
- Acceptance:
  - [ ] Chords live: voicings per family row, tolerance −/+ and ladder, dashed "not yet" chips, hover lights, template editor with families persisted in `…chordfinder.v1`.
  - [ ] Spectrum, Keys & Modes (heat grid, key rings, click a row/ring to select that mode/key) live.
  - [ ] Visualizers live: Lattice 2D/3D with axes and off-axis stems, EDO fit, Dissonance curve, Isomorphic keyboard, pop-out; all lights and the inspector work.
  - [ ] Glossary drawer from `texts.ts`, searchable, see-also links.
  - [ ] Feature-parity checklist against the frozen prototype (every control and analysis accounted for, or dropped with the human's OK); .scl import.
  - [ ] Mock route retired; `check:hfl` green.
- Checkpoint decisions (human, …):
- Human checkpoint after: **yes**

### M7: Card list + retuner panel (live)
- Scope: page + `…retuner.v1`.
- Acceptance:
  - [ ] Card list: add the current tab as a card, rename, reorder, delete, choose card 0 (home).
  - [ ] Controls: on/off, pivot mode, anchor (Freestyle/Fixed), trigger (Auto/Manual + Retune), scorer + options (default Sethares), glide ms. Tooltips with examples.
  - [ ] Playing ≥2 keys with Auto on runs `retuneStep`; the active card switches; held voices glide; everything sounding lights.
  - [ ] "Why this card won" table (each card's predicted chord, score, winner, sortable). Drift readout in cents and as a ratio when exact.
  - [ ] Headless behaviour test reproduces the M2 drift vector through the UI; the human checks audio.
- Checkpoint decisions (human, …):
- Human checkpoint after: **yes** (audio + feel)

## Final step
Page `ARCHITECTURE.md` + lib `README.md` complete (contracts, modules, colour-role mapping, persistence keys, how a section could move into the Workbench). Reviewer over the full arc diff. Archive as `ARC.retuner-shell.md` / `PROGRESS.retuner-shell.md` in `arcs/harmonic-field-lab/`; add leftovers to `BACKLOG.md` tagged `[harmonic-field-lab]`, starting with: "Workbench integration plan: which section/packet moves first."

## Open questions (answer at the milestone where they matter)
- M5: While the retuner is on, do the main views follow the active card or stay on the tab? (Could move to M7.)
- M6: Bring saved data over from the prototype? Option: a one-off "Export all (JSON)" button in the frozen prototype + "Import" in the shell page. This is the only allowed prototype change, and only if the human wants it.
- M7: Does a card store a whole tab snapshot, or only the subset's notes?

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change would break loading of saved data.
- Any change outside a milestone's scope, outside Owned/Shared paths, or to shared shell code (theme, audio engine, shared components), `ARCHITECTURE.md` contracts, or the page's `ARCHITECTURE.md` contracts.
- A shared path we need is locked by another arc in `arcs/LOCKS.md`, or `check:hfl` is red only because of another arc's files.
- Shell rules (THEMING.md, lint, CLAUDE.md) conflict with this ARC.
- Any decision about layout, wording, look or sound beyond the approved mock or existing patterns.
- An expected value in a test turns out to be wrong in theory (report it; don't silently change the test).
- A milestone needs new RE work on the binary.

## Budget
Max 2 builder attempts per milestone, then stop and report.
