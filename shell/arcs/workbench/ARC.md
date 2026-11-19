# ARC: Timeline: material lanes and realizations in time, then meta lanes

**Status: DRAFT 2026-11-18, REVISED the same day after the human's correction, awaiting approval.** The first draft was a conventional timeline of finished note clips. The human: "the whole revelation behind this app was supposed to allow me to more fluidly combine things rather than having them written as set clips. For example I would be able to put a pitch set on the timeline or a block chord and then somehow associate it with a rhythm block on the timeline and then have those two interact and create the realization." This revision puts material of any kind on the timeline and combines it there. The workstream's previous arc ("One Stage") is archived as `ARC.one-stage.md` / `PROGRESS.one-stage.md` (done through M6c; its M7 pinning and M8 close-out are parked in `shell/BACKLOG.md`).

Background (the human, 2026-11-18): the workbench started as a modular connector and is "turning into more of a DAW (which I want)". The human needs to "move one level up from the node view where I created these microscopic things to put on the desk ... I need somewhere for them to go. Once we have that we can then start looking at the structures - those meta lanes I talked about earlier and I could actually try and start using it to make music." The three kinds of tools discussed the same day frame where the timeline sits: **instruments** (direct tools such as the harmonic lab: never nodes, they produce material), **processors** (modules on the canvas that transform material live, e.g. Householder vs Interference) and **operations** (one-time actions on a selection, some with options, e.g. ×2, invert, an affine transform). The timeline is where finished material is placed in time; all three feed it through clips.

Reading: the workbench `src/pages/composition-workbench/ARCHITECTURE.md` sections "The desk" (clips, clip properties, the edit contract and versions, history, projects) and "Direction: rolling playback and arrangement"; `ARC.one-stage.md` "Integration decisions" D4 (the meta lane) and D5 (W-44, fractional midicents plus exact identity); DECISIONS W-41 to W-50.

## Goal
The workbench has an **Arrange** panel on the dock Stage where **material of any kind is placed in time** — a pitch set, a block chord, a rhythm, pitch classes, notes (any desk clip; the desk already holds any packet kind) — on lanes along a bar ruler, and where **realizations** combine that material into notes over time: a pitch block and a rhythm block interact and produce the realization, which stays live (change a block and the notes follow) and plays on the transport. A realization is a processor placed in time rather than on the canvas; it reuses the modules' pure evaluators (R2, `runtime/evaluators/`; Melodicization already turns inter-onset durations plus pitch material into notes), so combining rules are written once. When a result is wanted fixed, an operation **bakes** it into a note clip (like freezing a DAW track). Then a **meta lane** above everything holds sections: labels first ("chorus", "development"), then pitch context per section (EDO, key or scale) that realizations, the clip editor and transforms follow inside that span (D4). The canvas stays where material and processors are made and explored; the desk stays where material is kept; the timeline is where material meets time and other material.

## Parameters
- Stack: React 19 + Vite + Mantine, TypeScript, shell theme roles only (`src/theme/THEMING.md`); the ready line standard (W-49) for any panel whose main action waits for a selection or target.
- Time: positions and lengths are exact rationals in quarter notes, shown as bars.beats.ticks (`clipTime.ts`, 960 ticks per quarter; the project meter decides bars and beats), as clips already are. Tempo and meter are the project's (`compositionSettings`) until a milestone adds changes over time (a scenario decision).
- Pitch: unchanged contracts (W-1, W-44). Per-section pitch context (T4b) is designed with the human first and is the first change to how the roll and transforms pick their EDO.
- Data: the timeline is project data, in undo history like the desk (the history recorder); exact storage (the IndexedDB desk store or a project-state key) is decided in T1 from its size. Blocks hold packets of any kind (the existing `DataPacket` kinds and domains; routing compatibility from `signalTypes.ts` decides what a realization accepts). Blocks refer to desk clips by id or copy them: a T0 scenario decision. A realization's output is derived, never stored (only its sources, rule and settings are), so it always follows its sources.
- Realizations: how blocks get associated (by overlap in time, by an explicit link, or by a realize block with chosen sources, or a mix) and which combining rules exist first are T0 decisions. Combining rules come from the module evaluators (W-45: the runtime shape lasts, evaluators are replaceable), never a second copy of the logic.
- Playback: the first version compiles the arrangement's notes (note blocks plus realizations) for the whole piece or a loop region into today's finite `PerformancePlan` on the transport; the rolling scheduler of "Direction: rolling playback and arrangement" is a later milestone, scheduled when the simple path limits the human.
- Owned paths: `src/pages/composition-workbench/**` (the page folder, its tests, its `ARCHITECTURE.md`; new code in a `timeline/` folder), `arcs/workbench/` (this file, `PROGRESS.md`, scenarios, designs, archives).
- Shared paths it may touch (a row in `arcs/LOCKS.md` while edited, written by the orchestrator): `src/pages/CompositionWorkbench.page.tsx` (registering the Arrange panel, a screenset), `shell/ARCHITECTURE.md` (docs), `src/components/PianoRoll/` (opt-in props only, stop and ask first), `src/components/Stage/dock/` (only if drag from the desk to the timeline needs a Stage change: stop and ask first; then also `check:stage` and `check:hfl`). `src/pages/harmonic-field-lab/`, `src/lib/harmonic-field/` and the other pages are not edited.
- Check command: `corepack yarn check:workbench` (exists), once per milestone before the commit; plus `src/pages/CompositionWorkbench.page.test.tsx` (outside its scope), run explicitly.
- Concurrency: same checkout and branch as the other arcs; path-scoped `git add <paths>` and `git commit -- <paths>` only; lock rows removed only after the commit; DECISIONS prefix `W-` (next free id).

## Preconditions
- `check:workbench` is green before each code milestone. If red only because of another arc's unfinished files, stop, report and wait (shell rule 14).
- The human's dev server is http://127.0.0.1:5174 (per-origin storage); builders never start or stop dev servers.

## Non-goals
- No audio recording or audio clips. Material on the timeline is symbolic (packets); what sounds is notes (note blocks and realizations).
- No timeline that only holds finished note clips: material stays combinable until the human bakes it.
- No rewrite of the Mixer module or of module previews; no change to the harmonic lab; no node-based wrapping of the lab's direct tools (instruments produce material, they are not nodes).
- No module pinning (parked One-Stage M7) and no DAW model for module views (BACKLOG) in this arc, unless the human moves them in.
- No rolling scheduler before the human asks for it (a later milestone, see Playback).

## Milestones
Each milestone is small enough for one builder run (split if not) and has criteria a command or test can check. Every milestone with something to see or hear ends with the human trying it (look and listen first, then review, gate and commit: the human's rule).

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, `arcs/LOCKS.md`; note who imports `composition-workbench` (Scale Explorer: audio and the Forte catalog). Record in PROGRESS.md.
- Acceptance:
  - [ ] PROGRESS.md notes the scan result
- Human checkpoint after: no

### T0: Scenarios (no code)
- Scope: `arcs/workbench/SCENARIOS.T.md`: the human's concrete cases, each choice shown with an example where the options give different results. First question: **how blocks get associated** — (A) by overlap in time (a realization lane combines whatever pitch and rhythm blocks sit above it at each moment), (B) by an explicit link between two blocks, (C) by a realize block whose pitch source, rhythm source and rule are chosen in its settings, or a mix (e.g. C's rule with A's overlap). Then: which combining rules come first (Melodicization's; others from the canvas modules); what happens where the pitch and rhythm blocks have different lengths or start at different bars; what lanes are (typed by material kind, or free); a block as a reference to its desk clip (edit once, every use follows) or a copy, and "make unique"; bake (realization → note clip) and what stays linked; what a sounding lane owns (sound, volume, mute, solo); what happens when a source clip is deleted; one tempo and meter or changes; how material gets onto the timeline first (Send to timeline, then drag); the Arrange panel's place in the screensets; how the canvas modules relate (can a canvas module's output be a block?).
- Acceptance:
  - [ ] The human confirms the scenarios; decisions written under T0 here
- Human checkpoint after: **yes**

### T1: Timeline data (pure TS)
- Scope: `timeline/` model: lanes, blocks holding packets of any kind (by desk reference or copy, per T0), realizations (sources, rule, settings; output derived, never stored); pure operations (add, move, resize, delete, duplicate, split if confirmed), validation, persistence and undo through the existing history recorder; old projects open with an empty timeline.
- Acceptance:
  - [ ] `check:workbench` passes
  - [ ] Unit tests from the confirmed T0 rows (node env)
  - [ ] DECISIONS row: the timeline model, realizations as derived output, storage
- Human checkpoint after: no

### T2: The Arrange panel: lanes and material blocks
- Scope: an `arrange` panel on the dock Stage (registered by the page, under a lock): lanes on a bar ruler; blocks of each material kind drawn readably (a pitch set, a chord, a rhythm, notes: reuse the desk's `SnippetPreview` renderers where they fit); select, move and resize with the confirmed snapping; "Send to timeline" from the desk (drag if T0 puts it here); double-click a note block opens the clip editor; an "Arrange" screenset if confirmed.
- Acceptance:
  - [ ] `check:workbench` passes; the page test passes
  - [ ] Tests from the confirmed T0 rows
- Human checkpoint after: **yes** (look and feel)

### T3: Realizations
- Scope: the confirmed association (T0) and the first combining rule(s): a realization combines a pitch block and a rhythm block (and later others) into notes over its span, through the module evaluators (no second copy of the logic); its notes are drawn on the Arrange panel as a derived lane and update when a source block changes or moves; the ready line (W-49) says what a realization is missing ("Waiting: place a rhythm block under this span").
- Acceptance:
  - [ ] `check:workbench` passes
  - [ ] Tests from the confirmed T0 rows: the realization's notes equal the evaluator's output for those blocks; editing or moving a source block changes the notes; a missing source gives the waiting state, never guessed notes
  - [ ] DECISIONS row: realizations reuse evaluators; association rule
- Human checkpoint after: **yes** (look; and listen through a block preview if T4 is not in yet)

### T4: Play the arrangement
- Scope: Play, Stop, a playhead across the Arrange panel, a loop region, mute and solo per sounding lane; note blocks and realizations compiled into the existing finite performance plan on the transport (metronome and count-in as today).
- Acceptance:
  - [ ] `check:workbench` passes
  - [ ] Tests: the compiled plan's events equal the note blocks and the realizations' notes (positions, pitches, lengths); mute and solo; loop region
- Human checkpoint after: **yes** (listen)

### T5: Bake
- Scope: an operation that turns a realization (or a region of it) into a note clip on the desk and, per T0, places it on a lane in place of or beside the realization; one undo step; the clip records where it came from (lineage `derivedFrom`).
- Acceptance:
  - [ ] `check:workbench` passes; tests: the baked notes equal the realization's notes at that moment; the result is an ordinary editable note clip
- Human checkpoint after: **yes**

### T6a: Meta lane: sections and labels
- Scope: a lane above the tracks holding sections (a span with a label and a color role); add, rename, move, resize; sections show across the ruler. No pitch behavior yet.
- Acceptance:
  - [ ] `check:workbench` passes; tests from scenarios written before this milestone
- Human checkpoint after: **yes**

### T6b: Meta lane: pitch context per section
- Scope: designed with the human first (scenarios): a section's EDO and key or scale; realizations inside the span realize in that pitch space; the clip editor shows that EDO's keyboard and snapping for a block inside the span; transforms work in that pitch space. Touches the pitch contracts (W-1, W-44): DECISIONS rows and the shell `ARCHITECTURE.md`.
- Acceptance:
  - [ ] `check:workbench` passes; tests from the confirmed scenarios
- Human checkpoint after: **yes**

### Later (not scheduled; the human decides): the rolling scheduler (window function, live edits while playing, seek), tempo and meter changes over time, drag between panels (the drops system).

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to the pitch, time or edit contracts beyond what a confirmed scenario says.
- A shared path needed is locked by another arc.
- Any decision about look, sound or musical behavior not settled by confirmed scenarios.

## Budget
Max 2 builder attempts per milestone; then stop and report.
