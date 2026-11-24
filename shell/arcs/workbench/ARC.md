# ARC: Timeline: material lanes and realizations in time, then meta lanes

**Status: DRAFT 2026-11-18, REVISED 2026-11-18 (material of any kind on the timeline) and REVISED AGAIN 2026-11-23 (Blender research folded in: a data-block model phase B0 to B2 before the timeline data, NLA-style blocks, bundles, markers; a working agreement that lets the orchestrator decide more, and a Blender vocabulary with a baseline reset, see `VOCABULARY.md`), awaiting approval.** The first draft was a conventional timeline of finished note clips. The human: "the whole revelation behind this app was supposed to allow me to more fluidly combine things rather than having them written as set clips. For example I would be able to put a pitch set on the timeline or a block chord and then somehow associate it with a rhythm block on the timeline and then have those two interact and create the realization." This revision puts material of any kind on the timeline and combines it there. The workstream's previous arc ("One Stage") is archived as `ARC.one-stage.md` / `PROGRESS.one-stage.md` (done through M6c; its M7 pinning and M8 close-out are parked in `shell/BACKLOG.md`).

Background (the human, 2026-11-18): the workbench started as a modular connector and is "turning into more of a DAW (which I want)". The human needs to "move one level up from the node view where I created these microscopic things to put on the desk ... I need somewhere for them to go. Once we have that we can then start looking at the structures - those meta lanes I talked about earlier and I could actually try and start using it to make music." The three kinds of tools discussed the same day frame where the timeline sits: **instruments** (direct tools such as the harmonic lab: never nodes, they produce material), **processors** (modules on the canvas that transform material live, e.g. Householder vs Interference) and **operations** (one-time actions on a selection, some with options, e.g. ×2, invert, an affine transform). The timeline is where finished material is placed in time; all three feed it through clips.

Blender research (2026-11-23): the human read Blender's manual and found that its **data-block** model (every stored thing has an id, a type, a name and a computed user count; things reference each other; pickers are filtered by type), its **NLA editor** (strips reference actions; crop, repeat, scale, hold; tweak mode; lane mute, solo, lock), its **markers** and **collections** answer many of this arc's open questions, and wants the workbench's data systems and packets reworked toward that model for extensibility ("I think it really answers a lot of questions about this modular system I am trying to build"). `RESEARCH.blender.md` is the source (each idea marked adopt, adapt or skip); this revision turns its adopt items into milestones.

Reading: `RESEARCH.blender.md` (this folder), `PROPOSAL.derivation-graph.md`, the workbench `src/pages/composition-workbench/ARCHITECTURE.md` sections "The desk" (clips, clip properties, the edit contract and versions, history, projects) and "Direction: rolling playback and arrangement"; `ARC.one-stage.md` "Integration decisions" D4 (the meta lane) and D5 (W-44, fractional midicents plus exact identity); DECISIONS W-41 to W-50.

## Re-plan (human, 2026-11-24): objects first, then modifiers, then node trees
The human, after trying the audition and desk: the structure is wrong for what comes next. Their words: "create something like the blender outliner and allow the user to place empty objects there. This then allows us to keep our nodes and fit them in as we migrate. A better structure allows us to implement modifiers and transforms without having to retrofit things." So the middle layer is **Scene, Object and Modifier as data-blocks in the registry**, evaluated by one pure, memoized function into a `PerformancePlan`; the timeline becomes a VIEW of objects (their spans), not a second structure of strips. Source of truth: `SCENARIOS.objects.md` (confirmed 2026-11-24) and `HANDOFF.data-model.md`. Milestones O0 to O4c below replace R4 (dropped: Blender's Collection groups objects and has no roles; an object with a data slot and modifier inputs does that job) and T0 to T6b (superseded: T2 becomes the Arranger view O2b; the realization of T3 is a modifier on an object, O3; Bake is Apply; markers and meta track return after O2b). Phase B (node layer) is replaced by O4. Everything above this paragraph (B0 to R3, B2) stands.

## Goal
The workbench has an **Arrange** panel on the dock Stage where **material of any kind is placed in time** — a pitch set, a block chord, a rhythm, pitch classes, notes (any desk clip; the desk already holds any packet kind) — on tracks along a bar ruler, and where **realizations** combine that material into notes over time: a pitch strip and a rhythm strip interact and produce the realization, which stays live (change a strip and the notes follow) and plays on the transport. A realization is a processor placed in time rather than on the canvas; it reuses the modules' pure evaluators (R2, `runtime/evaluators/`; Melodicization already turns inter-onset durations plus pitch material into notes), so combining rules are written once. When a result is wanted fixed, an operation **bakes** it into a note clip (like freezing a DAW track). Then a **meta track** above everything holds sections: labels first ("chorus", "development"), then pitch context per section (EDO, key or scale) that realizations, the clip editor and transforms follow inside that span (D4). The canvas stays where material and processors are made and explored; the desk stays where material is kept; the timeline is where material meets time and other material.

## Working agreement (human, 2026-11-23)
The human: "I have been trying to orchestrate at too low of a level and I need to let you have a little more of that capacity while I just steer." So, in this arc:
- **The orchestrator proposes and decides; the human steers.** For every scenario table and design the orchestrator writes a recommended answer for each row, with the example where the options differ, and the human replies "ok" or changes rows. The human is not asked to author the options.
- **Decisions that no example can tell apart** (naming, file layout, internal shapes, test structure, split of work between builders) are made by the orchestrator and logged in `DECISIONS.md` with status `orchestrator-decided` so the human can veto later; no question.
- **Still the human's call (stop and ask):** anything the human sees, hears or feels (look, layout, sound, key layout, feel); a change to the pitch, time or edit contracts; spending (many builder runs: offer the cheaper scope first).
- **Baseline reset (human, 2026-11-23): there are no saved projects to keep.** No migration, no read-old-data path, no compatibility tests; storage names and schema versions change with the vocabulary. The vocabulary (`VOCABULARY.md`) is Blender's: data-block, collection, node, node tree, tool, operator, modifier, strip, track, marker, workspace; "clip", "snippet", "bundle", "module", "patch", "lane" and "screenset" are retired from new text and renamed in the existing code by B1a to B1c.
- Two reviews of a milestone at most; the orchestrator fixes short review findings itself.

## Parameters
- Stack: React 19 + Vite + Mantine, TypeScript, shell theme roles only (`src/theme/THEMING.md`); the ready line standard (W-49) for any panel whose main action waits for a selection or target.
- Time: positions and lengths are exact rationals in quarter notes, shown as bars.beats.ticks (`clipTime.ts`, 960 ticks per quarter; the project meter decides bars and beats), as clips already are. Tempo and meter are the project's (`compositionSettings`) until a milestone adds changes over time (a scenario decision).
- Pitch: unchanged contracts (W-1, W-44). Per-section pitch context (T4b) is designed with the human first and is the first change to how the roll and transforms pick their EDO.
- Data: the timeline is project data, in undo history like the desk (the history recorder); exact storage (the IndexedDB desk store or a project-state key) is decided in T1 from its size. Strips hold packets of any kind (the existing `DataPacket` kinds and domains; routing compatibility from `signalTypes.ts` decides what a realization accepts). Strips refer to desk clips by id or copy them: a T0 scenario decision. A realization's output is derived, never stored (only its sources, rule and settings are), so it always follows its sources.
- Realizations: how strips get associated (by overlap in time, by an explicit link, or by a realize strip with chosen sources, or a mix) and which combining rules exist first are T0 decisions. Combining rules come from the module evaluators (W-45: the runtime shape lasts, evaluators are replaceable), never a second copy of the logic.
- Direct path first (human, 2026-11-23): nothing a DAW user does needs a node. A data-block is editable, auditable (each type registers a default audition), placeable on a track and playable with zero wiring; the node tree is the optional advanced layer. Test: "C major" from the desk to sound with no connection.
- Data-block model (B0 to B2): the workbench's stored things become **data-blocks in one registry**: a data-block has an id, a type, a name and a payload (a `DataPacket` for musical types, the type's own typed data for the others), and **users computed from references, never stored** (Blender's reference count). Desk clips are the first strips; collections, realizations, sections and timeline items follow the same registration shape (the `clipTypes.ts` registry grows to cover them: payload check, preview, editor, actions, what it accepts). Rules carried over from Blender: references are by id; unlink and delete are different actions and delete says what it breaks; no automatic cleanup (the desk is a keep list, so only an Unused filter and a manual Purge); pickers list only what the input accepts. `DataPacket` (kind, domain, frame, items with provenance) stays the payload contract: the rework is around it (identity, references, registration, pickers), not a rewrite of the three axes, unless B0 shows a case that needs one (then it is a human decision).
- Playback: the first version compiles the arrangement's notes (note strips plus realizations) for the whole piece or a loop region into today's finite `PerformancePlan` on the transport; the rolling scheduler of "Direction: rolling playback and arrangement" is a later milestone, scheduled when the simple path limits the human.
- Owned paths: `src/pages/composition-workbench/**` (the page folder, its tests, its `ARCHITECTURE.md`; new code in a `timeline/` folder), `arcs/workbench/` (this file, `PROGRESS.md`, scenarios, designs, archives).
- Shared paths it may touch (a row in `arcs/LOCKS.md` while edited, written by the orchestrator): `src/pages/CompositionWorkbench.page.tsx` (registering the Arrange panel, a screenset), `shell/ARCHITECTURE.md` (docs), `src/components/PianoRoll/` (opt-in props only, stop and ask first), `src/components/Stage/dock/` (only if drag from the desk to the timeline needs a Stage change: stop and ask first; then also `check:stage` and `check:hfl`). `src/pages/harmonic-field-lab/`, `src/lib/harmonic-field/` and the other pages are not edited.
- Check command: `corepack yarn check:workbench` (exists), once per milestone before the commit; plus `src/pages/CompositionWorkbench.page.test.tsx` (outside its scope), run explicitly.
- Concurrency: same checkout and branch as the other arcs; path-scoped `git add <paths>` and `git commit -- <paths>` only; lock rows removed only after the commit; DECISIONS prefix `W-` (next free id).

## Preconditions
- `check:workbench` is green before each code milestone. If red only because of another arc's unfinished files, stop, report and wait (shell rule 14).
- The human's dev server is http://127.0.0.1:5174 (per-origin storage); builders never start or stop dev servers.

## Non-goals
- No audio recording or audio clips. Material on the timeline is symbolic (packets); what sounds is notes (note strips and realizations).
- No timeline that only holds finished note clips: material stays combinable until the human bakes it.
- No rewrite of the Mixer module or of module previews; no change to the harmonic lab; no node-based wrapping of the lab's direct tools (instruments produce material, they are not nodes).
- No module pinning (parked One-Stage M7) and no DAW model for module views (BACKLOG) in this arc, unless the human moves them in.
- No rolling scheduler before the human asks for it (a later milestone, see Playback).

## Milestones
Each milestone is small enough for one builder run (split if not) and has criteria a command or test can check. Every milestone with something to see or hear ends with the human trying it (look and listen first, then review, gate and commit: the human's rule).

### C0: Context scan
- Read `RESEARCH.blender.md` and `PROPOSAL.derivation-graph.md` first, then `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, `arcs/LOCKS.md`; note who imports `composition-workbench` (Scale Explorer: audio and the Forte catalog). Record in PROGRESS.md.
- Acceptance:
  - [ ] PROGRESS.md notes the scan result
- Human checkpoint after: no

### B0: Data-block model (design, no code)
- Scope: `arcs/workbench/DESIGN.data-blocks.md`, written by the orchestrator (with a scout for facts) from `RESEARCH.blender.md` sections 1 to 4 and the code: (1) an inventory of every stored thing today (desk clips, canvas modules and their settings, connections, projects, screensets, per-viewer preferences) and how each is identified and referenced now; (2) the data-block registration shape (type id, payload, name, preview, editor, actions, accepts) as an extension of `clipTypes.ts`, and how a new node or data-block type registers without touching core code; (3) the reference model: where references live (a Make source's `snippetId`, a strip's data-block id, a collection's `{role, dataBlockId, version?}`), the computed `users` function, Make single user, unlink versus delete, delete impact, replace everywhere; (4) collections as collections and the one shared shape with the derivation proposal's `inputs`; (5) what is not changed (packets, evaluators) and what changes with the vocabulary (storage names, no migration: baseline reset); (6) a scenario table of concrete cases (their rhythm, chord and voicing; one rhythm in three collections; delete a used clip; Make single user on a clip used by a canvas source and a timeline strip), each choice shown with an example where the options differ, with a recommended answer per row.
- Acceptance:
  - [x] The design document exists with the six parts and a recommended answer per scenario row (`DESIGN.data-blocks.md`)
  - [x] The human confirms the scenario rows (or changes some); decisions written under B0 here and in `DECISIONS.md` (W-52)
- Human checkpoint after: **yes** (steer: ok or changed rows)
- Checkpoint decisions (human, 2026-11-23): S1 A (delete leaves users "missing", the confirm lists them); S2 to S6, S9, S10 as recommended; S7 as recommended, plus an open question (can lineage recreate a deleted ancestor: recommended no, see the design's open follow-ups); S8 as recommended plus a "Reinterpret as ..." submenu for convertible types; S11 the node tree stays one canvas, and a new rule **direct path first** (a data-block is editable, auditable, placeable and playable with zero nodes; each type registers a default audition; acceptance test: "C major" from the desk to sound with no wiring); S12 A; S13 A and B plus a second shaper type, **Steps** (discrete steps over continuous content) beside **Curve**, onset versus glide decided in T0.

### B0b: Audit for stacked revisions (read-only, before any rename)
- Scope: a scout lists, in the page folder, legacy and migration code (deletable under the baseline reset), dead or doubtful modules (the second `moduleRegistry` in `registry.ts`, `PatchDocument`, `Connection`), duplicated logic (`acceptsPacket` and `packetMatches`; `signalTypeFor`'s hard-coded dispatch), every file and symbol carrying a retired word, comments that narrate history, and stale `ARCHITECTURE.md` sections. The orchestrator turns the list into the removal list for B1a to B1c: delete first, then rename what is left, so nothing dead is renamed.
- Acceptance:
  - [ ] The audit table is in `arcs/workbench/AUDIT.baseline.md` with a verdict per item (DEAD, LEGACY-READ, DUPLICATE, RENAME-ONLY, KEEP)
  - [ ] The human steers on anything marked KEEP that is surprising; the rest the orchestrator decides (`orchestrator-decided`)
- Human checkpoint after: no (steer only if asked)

### B1a: Rename the data-block vocabulary (mechanical)
- Scope: after the B0b removals: `Snippet`, "clip" and "snippet" become `DataBlock` and the type names; `clipTypes.ts` becomes `dataBlockTypes.ts`; the files named for note content (`clipProperties`, `clipTime`, the note clip editor) take Notes names, the rest take data-block names (the audit lists which is which) (a Notes data-block, a Rhythm data-block), everywhere in the page folder and the one outside use (`CompositionWorkbench.page.tsx`, under a lock): symbols, files, UI text, tests, `ARCHITECTURE.md`. Storage names change with it (baseline reset). Rules in `VOCABULARY.md` "Rename rules". A scout first lists every outside use and every stored name.
- Acceptance:
  - [ ] `check:workbench` and the page test pass; no occurrence of the retired words remains in the page folder except in archived arc files and quoted history
  - [ ] DECISIONS row (the vocabulary and the baseline reset)
- Human checkpoint after: no

### B1b: Rename modules to nodes and patches to node trees (mechanical)
- Scope: "module" (the canvas processor), "patch" and their compound names; by compiler rename only (ES modules, CSS modules and Vite modules are not touched). Any use in a shared path (`src/components/`, other pages such as Scale Explorer's imports) takes a lock and runs that area's own check.
- Acceptance: as B1a.
- Human checkpoint after: no

### B1c: Rename screensets to workspaces, and the tool, operator and track words
- Scope: "screenset" becomes "workspace" (the Stage's own use is a shared path: scout first, lock, `check:stage` and `check:hfl`); "instrument" and "processor" in docs and UI text become tool and node; "operation" and "clip action" for one-shot actions become operator.
- Acceptance: as B1a.
- Human checkpoint after: **yes** (the workspace tabs and labels are what the human sees)

### B1-i: References and users (pure TS): DONE 2026-11-23 (df8cb2a, W-57)
- `dataBlockRefs.ts`: computed users from registered referencers, delete impact, make single user, unlink, remap, unused and purge. Hand-offs to B2: undo wiring, remap from a missing data-block, unlink wording, disable Make single user at 1 user.

### Registry rebuild, phase A (human, 2026-11-24: "a ground up build probably makes the most sense"; scope A and B, A first)
Source of truth: `SCENARIOS.registry.md` (confirmed 2026-11-24). Only the contracts stay (`DataPacket`, exact-rational time, midicent pitch, evaluators' math, version tree, PianoRoll, audio engine); the old registry code is not read for shape, only to port a specific piece. New code in `src/pages/composition-workbench/dataBlocks/`; each old caller is moved to it and its old logic deleted in the same step (no two registries side by side after a step).

#### R0: Registry core
- Scope: `registerDataBlockType` (id, label, payload, one `accepts`, `createBlank`, `validate`, optional `preview`, `editorId`, `audition`, `refs`), `dataBlockRefs.ts` moved in. No UI.
- Acceptance: [ ] `check:workbench` passes [ ] unit tests for R1 to R4 of the scenarios (one registration is enough for a new type; a type with no audition reports why) [ ] DECISIONS row
- Human checkpoint after: no

#### R1: Register the packet types and move the callers
- Scope: Notes, Pitch set, Pitch classes, Rhythm, Values registered; desk, Make source and capture read the registry; delete `clipTypeOf`, `acceptsPacket`, `packetMatches` duplicates as each caller moves.
- Acceptance: [ ] `check:workbench` passes [ ] page test passes, no visible change
- Human checkpoint after: no

#### R2: Audition core (pure)
- Scope: `audition(dataBlock, listenerSettings) -> plan` for the rows A1 to A8: in sequence (default) or together, base octave, offset (transposition), loop (toggle, default on while held), cycle or stop at shortest, project tempo; refusals with reasons; Values only through the explicit "Hear as MIDI note numbers".
- Acceptance: [ ] `check:workbench` passes [ ] tests written from the A rows with the human's actual examples (`0 1 4 6` plays exactly those four pitches, no octave added; `{0,4,7}` with offset 3 gives 3, 7, 10; 3 pitches over 5 onsets: cycle `p1 p2 p3 p1 p2`, stop at shortest `p1 p2 p3`)
- Human checkpoint after: no

#### R3: Audition control on the desk card (thin slice)
- Scope: Play with the listener settings (sequence or together, base octave, offset, loop) on the desk card, through the transport; Values refusing with the Hear-as button; empty refusing.
- Acceptance: [ ] `check:workbench` and the page test pass [ ] "C major"-style Pitch set audible from the desk with no wiring
- Human checkpoint after: **yes** (the human listens)

#### R4: Collection type: DROPPED 2026-11-24 (superseded by the object phase O0 to O4c; kept for reference only)
- Scope: Collection record (named entries, role plus reference, two entries of one role allowed, a missing reference shows as missing), its referencer, its audition through the Melodicization evaluator in cycle or stop-at-shortest mode; two melodies in one collection layer from the same start. Read the OpenMusic manual (voice, poly) before any composite beyond this.
- Acceptance: [ ] `check:workbench` passes [ ] tests from A7 and R4 rows
- Human checkpoint after: **yes** (the human listens: Ring A on Clave in both modes)

#### B2 (built before R4; see PROGRESS): data-block menu and desk user counts (UI)
- Scope as before (one data-block menu with filtering by `accepts`, "Reinterpret as" submenu, user count that makes a unique copy, New, unlink, Make source swap in place, desk "Used by" list in the delete confirm, Unused filter, Purge) plus the B1-i hand-offs (undo wiring through a desk method that takes the next list, apply the desk first then instances in one `recordGroup`; remap from a missing data-block; unlink wording; disable Make single user at 1 user). Thin slice first.
- Human checkpoint after: **yes** (look and feel)

### Phase B (node layer), planned after R4 with its own scenarios (`SCENARIOS.registry.md` Part 3)
Each node declares its inputs and outputs against the registry (N1 to N5); the connection check and the picker read one `accepts`; `signalTypeFor` and the signal type table fold into the registry; Make source disconnects wires that no longer fit and says which. One node at a time, Melodicization first.

## Object phase (re-plan 2026-11-24; replaces Phase B, R4 and T0 to T6b)
Scenarios first: `SCENARIOS.objects.md` (confirmed by the human 2026-11-24). Object contract: Scene, Object, Collection and Node tree are record types in the existing registry (`validate`, `refs`, `mapRefs`); references blank on delete (never a fallback); modifiers live inline on the object; mapping (Loop, Stretch, One-shot) is the object's, applied AFTER the node tree or modifiers produce ONE cycle; evaluation is pure and two-stage memoized (cycle result keyed by data-block versions and modifier params; mapping and placement keyed by span); no override layer (a hand-edit of a modified object asks to Apply first). Direct path first: scene, object, desk data-block, native modifier and Play with zero nodes. A scene has one root collection (no separate `objectRefs`). Panels register in `layout/workbenchPanels.tsx` and `workbenchWorkspaces.ts` (workbench-owned); the page entry file is a shared path (lock). Reviewer standing question applies (DECISIONS rows W-66 and W-67).

### O0: The desk stores any registered data-block
- **DONE 2026-11-24 (W-68):** the family filter moved to O2a (records have no card until the Outliner). Scope as built: `desk.tsx`, `deskStore.ts`, `dataBlock.ts`, the history `deskStep`, loading validation and the desk cards accept `StoredDataBlock` (packets and records) instead of `PacketBlock`; a family filter on the desk (default shows what it shows today: packets; records by family `placed` and `composite`); a throwaway test record type in `dataBlocks/testTypes.ts` proves store, reload, undo, delete impact and make single user for a record; no visible change for packets.
- Acceptance: [ ] `check:workbench` passes [ ] page test passes [ ] tests: a record block round-trips through the desk store and history, its `refs` count as users, delete blanks the slot
- Human checkpoint after: no

### O1: Scene, Object, Collection records and `evaluateScene` (pure)
- **DONE 2026-11-24 (W-69; reviewed, review blocker and small findings fixed).** Scope as built: new folder `scene/`: record types `scene` (name, root collection ref, markers), `object` (name, parentRef, timeSpan, registerSpan, primaryDataRef, mapping, modifiers, mute), `collection` (name, memberRefs, mute); `evaluateScene(project, context) -> PerformancePlan` per `SCENARIOS.objects.md` rows 1, 2, 5, 6, 7 (Loop, Stretch, One-shot over the object's span, child start relative to parent with a deleted parent keeping the child's place, a child played to its parent's end, blank and empty silence, scene length to the end of the object spans, circular parent guard, mute); the audition core's `build` reused for the primary data (no second copy of realization logic); two-stage memo.
- Acceptance: [ ] `check:workbench` passes [ ] unit tests from the confirmed rows with the son clave numbers (Loop 80 attacks, Stretch attacks at quarters 0, 12, 24, 40, 48, One-shot 5 attacks then silence) [ ] DECISIONS rows W-66 (object contract) and W-67 (evaluation)
- Human checkpoint after: no

### O2a: Outliner, Properties and Play (thin slice)
- Scope: three or four panels on the Stage (Outliner: tree of the scene with mute, user counts, Add Empty and Add Object; Properties: name, parent, time span, register span, data-block picker through the shared data-block menu, Loop | Stretch | One-shot, modifier list shell); a scene Play on the transport. No Arranger. Smallest version to try, then stop.
- Acceptance: [ ] `check:workbench` passes [ ] one page test [ ] no layout shift on select, add or delete (measured in a browser)
- Human checkpoint after: **yes** (look, feel and sound; no reviewer polish or commit of polish before the human has tried it)

### O2b: Arranger view
- Scope: horizontal view of objects as blocks by time span and register; select, move, resize, playhead with the transport. A view of the same objects, never its own data.
- Human checkpoint after: **yes** (look and feel)

### O3: Native modifiers and Apply
- Scope: modifier stack on objects (reorder, mute); Transpose to pitch set, Harmonize (chord engine), Melodicize (`melodicize`), each reading its pitch set or rhythm by reference; a missing reference silences the object and Properties says which is missing (row 3); Apply bakes ONE cycle into a new Notes data-block, clears the modifiers, keeps the mapping (row 4); a hand-edit of a modified object asks to Apply first.
- Acceptance: [ ] `check:workbench` passes [ ] tests from rows 3 and 4 [ ] DECISIONS row
- Human checkpoint after: **yes** (listen)

### O4a: Headless graph evaluator
- Scope: extract from `runtime/NodeEvaluationRunner.tsx` and `useNodeEvaluation.ts` a non-React function that evaluates a node tree (instances, routes, per-node state) into outputs; the canvas keeps using it with no visible change.
- Acceptance: [ ] `check:workbench` passes [ ] node tests evaluate a tree headless and equal the runner's outputs
- Human checkpoint after: no

### O4b: Node trees as data-blocks
- Scope: `node-tree` record (instances, routes and each node's persisted state), the canvas edits the active tree, a header bar (picker, New, Make single user, users), unattached scratch trees stay alive (the playground).
- Human checkpoint after: **yes** (look)

### O4c: Group Input and Output, and the Node tree modifier
- Scope: Group Input and Output nodes, a Node tree modifier on objects (tree outputs one cycle; mapping after).
- Human checkpoint after: **yes** (listen)

### Superseded plan kept for reference: T0 to T6b (do not build from these; their content moved into O2b and later)
### T0: Scenarios (no code)
- Scope: `arcs/workbench/SCENARIOS.T.md`, with a recommended answer per row from `RESEARCH.blender.md` section 5 (NLA table) and section 6 (markers); where the human has not changed it, the recommendation stands: a strip references its clip (B0), **extrapolation per strip** (Hold Forward so a short pitch strip governs a long rhythm strip, or Nothing), crop, repeat, scale and reverse live on the strip, tracks combine by order plus Replace or Add, double-click is tweak mode (edit the clip in place, Pin toggles clip time or timeline time), meta strips and placed collections, mute, solo and lock per track and mute per strip, bake as Push Down in reverse, sections are shared markers (a marker bound to a pitch context is the T6b model). The human's concrete cases, each choice shown with an example where the options give different results. First question: **how strips get associated** — (A) by overlap in time (a realization track combines whatever pitch and rhythm strips sit above it at each moment), (B) by an explicit link between two strips, (C) by a realize strip whose pitch source, rhythm source and rule are chosen in its settings, or a mix (e.g. C's rule with A's overlap). Then: which combining rules come first (Melodicization's; others from the canvas modules); what happens where the pitch and rhythm strips have different lengths or start at different bars; what tracks are (typed by material kind, or free); a strip as a reference to its desk clip (edit once, every use follows) or a copy, and "make single user"; bake (realization → note clip) and what stays linked; what a sounding track owns (sound, volume, mute, solo); what happens when a source clip is deleted; one tempo and meter or changes; how material gets onto the timeline first (Send to timeline, then drag); the Arrange panel's place in the screensets; how the canvas modules relate (can a canvas module's output be a strip?).
- Acceptance:
  - [ ] The human confirms the scenarios; decisions written under T0 here
- Human checkpoint after: **yes**

### T1: Timeline data (pure TS)
- Scope: `timeline/` model: tracks (mute, solo, lock), strips over a data-block in the registry (a Notes, Rhythm or Pitch set data-block or a collection; start, length, clip start and end, repeat, scale, reverse, extrapolation, mute), markers, realizations (sources, rule, settings; output derived, never stored); pure operations (add, move, resize, delete, duplicate, split if confirmed), validation, persistence and undo through the existing history recorder; old projects open with an empty timeline.
- Acceptance:
  - [ ] `check:workbench` passes
  - [ ] Unit tests from the confirmed T0 rows (node env)
  - [ ] DECISIONS row: the timeline model, realizations as derived output, storage
- Human checkpoint after: no

### T2: The Arrange panel: tracks and material strips
- Scope: an `arrange` panel on the dock Stage (crop, repeat and extrapolation are strip handles and a small strip inspector; double-click is tweak mode; the user count shows on a strip whose data-block has other users) (registered by the page, under a lock): tracks on a bar ruler; strips of each material kind drawn readably (a pitch set, a chord, a rhythm, notes: reuse the desk's `SnippetPreview` renderers where they fit); select, move and resize with the confirmed snapping; "Send to timeline" from the desk (drag if T0 puts it here); double-click a note strip opens the clip editor; an "Arrange" screenset if confirmed.
- Acceptance:
  - [ ] `check:workbench` passes; the page test passes
  - [ ] Tests from the confirmed T0 rows
- Human checkpoint after: **yes** (look and feel)

### T3: Realizations
- Scope: the confirmed association (T0) and the first combining rule(s): a realization combines a pitch strip and a rhythm strip (and later others) into notes over its span, through the module evaluators (no second copy of the logic); its notes are drawn on the Arrange panel as a derived track and update when a source strip changes or moves; the ready line (W-49) says what a realization is missing ("Waiting: place a rhythm strip under this span").
- Acceptance:
  - [ ] `check:workbench` passes
  - [ ] Tests from the confirmed T0 rows: the realization's notes equal the evaluator's output for those strips; editing or moving a source strip changes the notes; a missing source gives the waiting state, never guessed notes
  - [ ] DECISIONS row: realizations reuse evaluators; association rule
- Human checkpoint after: **yes** (look; and listen through a strip preview if T4 is not in yet)

### T4: Play the arrangement
- Scope: Play, Stop, a playhead across the Arrange panel, a loop region, mute and solo per sounding track; note strips and realizations compiled into the existing finite performance plan on the transport (metronome and count-in as today).
- Acceptance:
  - [ ] `check:workbench` passes
  - [ ] Tests: the compiled plan's events equal the note strips and the realizations' notes (positions, pitches, lengths); mute and solo; loop region
- Human checkpoint after: **yes** (listen)

### T5: Bake
- Scope: an operation that turns a realization (or a region of it) into a note clip on the desk and, per T0, places it on a track in place of or beside the realization; one undo step; the clip records where it came from (lineage `derivedFrom`).
- Acceptance:
  - [ ] `check:workbench` passes; tests: the baked notes equal the realization's notes at that moment; the result is an ordinary editable note clip
- Human checkpoint after: **yes**

### T6a: Meta track: sections and labels
- Scope: a track above the tracks holding sections (a span with a label and a color role); add, rename, move, resize; sections show across the ruler. No pitch behavior yet.
- Acceptance:
  - [ ] `check:workbench` passes; tests from scenarios written before this milestone
- Human checkpoint after: **yes**

### T6b: Meta track: pitch context per section
- Scope: designed with the human first (scenarios): a section's EDO and key or scale; realizations inside the span realize in that pitch space; the clip editor shows that EDO's keyboard and snapping for a strip inside the span; transforms work in that pitch space. Touches the pitch contracts (W-1, W-44): DECISIONS rows and the shell `ARCHITECTURE.md`.
- Acceptance:
  - [ ] `check:workbench` passes; tests from the confirmed scenarios
- Human checkpoint after: **yes**

### Not in this arc (routed from `RESEARCH.blender.md`, logged in `BACKLOG.md`)
- A **Stage and Inspector arc**: swap and join areas, Maximize and Focus, workspace tabs at the top, folding inspector sections with Blender's gestures, breadcrumb and pin, display filter, presets, Adjust Last Operation. Look changes: the human first.
- Curve meta tracks with a modifier stack (tempo, density, register) and Dope Sheet style header bars: after T6a.
- Library-override-style following of source presets: only if a T0 row shows a case where it differs from pin and flag.

### Later (not scheduled; the human decides): the rolling scheduler (window function, live edits while playing, seek), tempo and meter changes over time, drag between panels (the drops system).

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to the pitch, time or edit contracts beyond what a confirmed scenario says.
- A shared path needed is locked by another arc.
- Any decision about look, sound or musical behavior not settled by confirmed scenarios.

## Budget
Max 2 builder attempts per milestone; then stop and report.
