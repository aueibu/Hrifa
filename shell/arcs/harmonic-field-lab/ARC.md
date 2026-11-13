# ARC: Dynamic retuner + move into the Hrifa shell + encyclopaedia UI

**Status: APPROVED (2026-11-12).** Moved into the shell's multi-arc layout the same day (from `C:\Users\apoor\Documents\Infinitone Tracing\ARC.md`, history in `PROGRESS.md`), and re-ordered so the retuner is written once, in TS, after the core port. Next: M3.

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
- Human checkpoint after: no

### M4: Encyclopaedia mock (in the shell theme)
- Scope: a mock route (e.g. `/harmonic-field-lab/mock`) built from shell components (Surface, Mantine, Data/Mono), static real numbers from the "Harmonics from 8" preset, no live maths.
- Acceptance:
  - [ ] Contents rail with summaries, top transport bar, keyboard dock, every current block as an article (heading, lede, detail, Open in reader), glossary drawer, and a placeholder **Retuner** section (card list, pivot/anchor/trigger/scorer controls, "why this card won" table, drift readout).
  - [ ] Screenshots at 1500 px and 1100 px, light and dark (dev server + headless Edge, throwaway profile). A "what changed and why" list mapped to the diagnosis.
- Checkpoint decisions (human, …):
- Human checkpoint after: **yes** (approve or change the layout)

### M5: Live shell + Generator and Field & subset sections
- Scope: the page + section components.
- Acceptance:
  - [ ] Approved layout live: rail (scroll-spy, live summaries), collapsible articles (state persisted), reader modal, top bar, tabs (`…tabs.v1`), keyboard dock.
  - [ ] Generator (methods, presets, prime filter) and Field & subset (circle, subset controls in labelled clusters, tuner strip, lattice, field table) rebuilt as components on the ported core, with tooltips and lights.
  - [ ] Audio through the shell's shared engine (`AudioEngineProvider`) if it can play arbitrary Hz with held voices and glide. Otherwise stop and ask.
  - [ ] Headless smoke script: load, switch presets and tabs, toggle notes, open every reader, zero console errors; `check:hfl` green.
- Checkpoint decisions (human, …):
- Human checkpoint after: **yes**

### M6: Analysis sections + glossary
- Scope: page.
- Acceptance:
  - [ ] Stats (incl. shape), scale, interval spectrum (no sideways scroll at default width; full view in the reader), chords (templates, tolerance, ladder, severities), pick nearest scale, compare-to, keys, modes, saved subsets (`…subsets.v1`), Scala export, all with ledes and tooltips.
  - [ ] Glossary drawer from one `texts.ts` source, searchable, "see also" links.
  - [ ] Feature parity checklist against the frozen prototype (every control and analysis accounted for, or dropped with the human's OK); screenshots light/dark; `check:hfl` green.
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
