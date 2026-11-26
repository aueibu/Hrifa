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
- **DONE 2026-11-24 (W-70; the human tried it and approved the look).** Scope as built: three or four panels on the Stage (Outliner: tree of the scene with mute, user counts, Add Empty and Add Object; Properties: name, parent, time span, register span, data-block picker through the shared data-block menu, Loop | Stretch | One-shot, modifier list shell); a scene Play on the transport. No Arranger. Smallest version to try, then stop.
- Acceptance: [ ] `check:workbench` passes [ ] one page test [ ] no layout shift on select, add or delete (measured in a browser)
- Human checkpoint after: **yes** (look, feel and sound; no reviewer polish or commit of polish before the human has tried it)

### O2b: Arranger view
- **DONE 2026-11-24 (W-71; the human tried it and approved the look).** Scope as built: horizontal view of objects as blocks by time span and register; select, move, resize, playhead with the transport. A view of the same objects, never its own data.
- Human checkpoint after: **yes** (look and feel)

### O2c: Notes inside the Arranger blocks (added 2026-11-24, built right after O3-ii)
- Checkpoint decisions (human, 2026-11-24): Bitwig-style note BARS inside each block, by default (dots only maybe later for percussion; not now). Start right after O3-ii. Reference: Bitwig clip previews in the arranger (small piano-roll bars inside the clip block).
- Scope: each object block shows its EVALUATED notes (after modifiers and mapping, from `evaluateScene`) as bars, time on x, pitch on y scaled to the block's own range; rhythm-only data shows as ticks. A view only, no new data. THIN SLICE then stop for the human to look.
- Future goal (human, 2026-11-24, BACKLOG): a combined view of a selection of objects overlaid in one pitch/time space (by Hz or by pitch), like Bitwig's clip editor showing several selected clips together, colored per clip.
- Human checkpoint after: **yes** (look)

### O2d: Arranger edge drags and row height (added 2026-11-24, W-74)
- Checkpoint decisions (human, 2026-11-24): edge grab strips about 10 px on both sides with the length cursor and a hover highlight; Loop objects: both edge drags (full height) extend the loop with the cycle grid anchored (left drag reveals the earlier cycles); One-shot: left edge trims (notes keep their time), out past the data adds silence; Stretch: edge drag refits the span; one new field `contentOffset` on the object; drag a row's bottom edge to change its height (per row, per viewer, not undoable); taller default row (about 2.5rem). Option "content moves with the edge" deferred to a modifier key (BACKLOG). O2c preview keeps its 600-midicent minimum range (matches Bitwig).
- Scope: `contentOffset` in `sceneTypes` and `evaluateScene`, edge drag state machine in `arrangerGeometry.ts`, the panel. THIN SLICE then stop for the human to try.
- Human checkpoint after: **yes** (feel)

### L0 to L2: Collection lanes, Object = one placement (added 2026-11-24, W-77; REPLACES S0 to S2 below)
- Human decision (2026-11-24): after trying S0 and S1 the human reversed W-75: drop the Strip layer; Object is one placement again; each Collection is one Arranger lane (sub-lanes only when objects in one collection overlap in time); parent is object to object again and the Outliner nests children cleanly. Plan and rules: DECISIONS W-77.
- **L0 (pure model, no new UI features):** `ObjectData` back to one placement (fields in W-77), remove Strip types and strip slot keys, evaluator and ops back to object level (the committed pre-S0 code at `df96ccb` is a reference: `git show df96ccb:<path>`; keep W-74 `contentOffset`, O3 modifiers, the S0 ops that still make sense as object ops: duplicate object, duplicate linked, shared-edge resize, nearest-free placement, cross-collection move), migration of stored W-75 and pre-W-75 objects, existing UI adapted only enough to compile and work (Arranger rows as the Outliner rows for now). Tests from the table in W-77. Gate before commit.
- **L1 (UI thin slice, human checkpoint: look and feel):** Arranger lanes per Collection with sub-lanes for overlaps, drag to another lane, free move to the nearest free slot, shared edge, ghosted muted blocks, per-lane row height, Outliner nesting restored, Properties for the object (with Duplicate Object and Duplicate Linked). STOP for the human.
- **Parent display (human, 2026-11-24, for L1):** no always-on line along the child's lane (that crossed other blocks). Instead: (1) a small dash on the PARENT's lane at the world start of each child ("look at the parent to see the children"; hover names the child; always visible, tiny, theme role); (2) when a parent or a child is selected, a dashed connector from the parent's start (its lane) to the child's start (its lane) and a subtle tint on both blocks (Blender: Overlays, Relationship Lines, "dashed lines indicating parent or constraint relationships"); (3) a small marker on a parented block with hover help "Follows <parent>". An all-relationships toggle is a later option.
- **L2:** review, gate, wording.

### L3: Free sub-lanes inside a collection (added 2026-11-25, W-78; human-confirmed behavior)
- Human decision (2026-11-25): "how am I ever going to have overlapping moments?" Within one collection the human must be able to overlap objects on purpose. Confirmed: (1) yes, overlap in the same collection on lanes the human chooses; (2) a drop that lands on an occupied spot in the lane it is over goes to the NEAREST FREE SLOT in that lane; the object goes to another sub-lane only when the human drops it in that sub-lane or on the new-lane strip.
- **Data (done by the orchestrator, no migration):** `ObjectData.lane?: number` (whole number from 0, absent = automatic). Compared only among siblings in one collection.
- **Rules.** (a) Display sub-lanes are the DENSE RANK of the distinct stored numbers in the collection (gaps vanish, so an emptied lane disappears). (b) Objects with no `lane` are automatic: in start order each goes to the first display sub-lane where it overlaps nothing (touching is not overlap), a new one if none; a child with no `lane` therefore lands below its parent as today. (c) Overlap is refused or avoided PER SUB-LANE: sibling checks in `sceneOps` (`objectRoom`, `placeObjectNearest`, `resizeSharedEdge`) compare only objects on the same display sub-lane; a parent and its descendants are still ignored (L1b). (d) A body drop onto a sub-lane stores that lane's number and lands at the nearest free slot there; a drop on the new-lane strip (a thin strip under the collection's last sub-lane, shown only while dragging a block) stores `max stored + 1` and the object lands at its dropped time with no neighbors; a drop on another collection's lane keeps the object's lane number if free there at that time, else the dropped sub-lane. (e) Duplicate Object and Duplicate Linked copy `lane`. (f) Evaluation, playback and the Outliner ignore `lane`.
- **Consumer check:**
| Panel or op | Reads | Shows or does |
| --- | --- | --- |
| `arrangerLanes` | `lane` of each member | dense-ranks stored lanes, greedy-fills the automatic ones, `subLanes` count |
| `arrangerDrop`, `sceneOps` (object ops, move to collection, duplicate) | `lane` | per-sub-lane overlap checks; set or keep `lane` on a drop; copy on duplicate |
| `ArrangerPanel` | lane layout, drag target sub-lane | drop highlight per sub-lane, new-lane strip while dragging, block y per sub-lane, one undo step per drop |
| `evaluateScene`, playback, modifiers | nothing | unchanged (overlapping blocks sound together) |
| Outliner, Properties | nothing | unchanged |
| desk, project save and open, `sceneMigration` | the record as stored | optional field passes through, absent stays absent; validation accepts a whole number from 0 |
| importing pages (Scale Explorer) | nothing | none |
- **Human checkpoint after:** yes (feel). Thin slice, then STOP.

### L4: Parents are structure, not masks; show shared data (added 2026-11-25, W-79; human-confirmed)
- Human decision (2026-11-25): (1) drop the parent-end cut: a child plays its full length even past its parent's end, and the hatched cut disappears from the Arranger. A parent is structure plus the start reference only. (A later "Limit to parent" setting may bring a mask back; not now.) (2) Show shared data: an object whose `primaryDataRef` is shared with other objects shows a small link badge on its block (count when 3 or more users; tooltip "Shares <data name> with N other object(s)"); selecting an object tints the other blocks that share its data; Duplicate Linked selects the new block. Computed from the existing users query, nothing stored. Shared modifiers or parents do not count.
- **Consumer check:** `evaluateScene` (remove the parent end bound; muted inheritance, relative start and deleted-parent rules stay), its scenario tests, `arrangerGeometry` / `ArrangerPanel` (remove `.cut` and its geometry), `arrangerRelations` tint (add a second, shared-data tint), Properties (unchanged), save and open (unchanged, nothing stored). Docs: W-66/W-70/W-77 wording and DIGEST rule 3 (orchestrator updates).
- **Human checkpoint after:** yes (look). Thin slice, then STOP.

### L5: Block title bar, linked marker, shared-users list (added 2026-11-25, W-80; human-confirmed from `MOCK.block-titlebar.html`)
- Human decisions (2026-11-25): (1) Bitwig-style compact title bar on every Arranger block: name, then the data used, icons on the right (link icon plus user count now; modifier icons later), notes underneath. Data name (human look, same day): it truncates with an ellipsis FIRST and is removed from view only when about 2.5 rem does not fit; then the name truncates; icons never hide; no layout shift. The L4 inline badge before the text goes. (2) Linked marker = mock option A: when an object is selected, every OTHER block that shares its data shows a small accent triangle on its left edge pointing into the block, with a REAL point (crisp tip, clip-path or equivalent, not a rounded blob); the triangle is the light text color and the gentle sharer tint STAYS with it (human look, same day), as does the parent/child tint. (3) Properties Users row: "Used by N" opens a FOLDABLE table (fold state per viewer, session state), one row per user, sorted by start time, columns Object, Collection, Starts (bar and beat), Length (so modified ones show); clicking an object row selects that object; a user that is not an object (a desk node) shows its name and "Desk" with no start or length. Make single user stays.
- **Consumer check:**
| Panel or op | Reads | Shows or does |
| --- | --- | --- |
| `ArrangerPanel` | `sharedData`, object name, data name, mapping | title bar, hide-data-first rule, link icon with count, left triangle on other sharers while one is selected |
| Properties (`ScenePanels` Users row) | `dataBlockUsers`, scene lanes (collection per object), world start and duration | foldable table, row click selects the object |
| new pure `scene/sharedUsersTable.ts` | blocks, scene id, data id | rows `{ id, name, kind: 'object' \| 'desk', collection, start, duration }` sorted by start |
| `sceneSession` | fold flag | per-viewer, not saved with the project |
| evaluator, ops, save and open, Outliner, desk | nothing | unchanged |
- **Human checkpoint after:** yes (look). Thin slice, then STOP.
- **L5b (small second pass, human 2026-11-25):** after the human has looked at the L5 Properties table, reuse ONE shared users-table component (rows from `sharedUsersTable`, optional per-row action slot) in the Desk card's "Used by N" popover (`DeskView.tsx`): same columns (Object, Collection, Starts, Length; desk-only users show their name and "Desk"), always open there, Make single user stays per row; drop the Collection column there if cramped; update `DataBlockUsage.test.tsx`.

### U1 to U7: UI precision, docked Inspector, and tabbed Properties (added 2026-11-25 from `HANDOFF.ui-precision.md`, refined 2026-11-25)
- **U1 (done as a thin slice, UNCOMMITTED, human checkpoint: look):** AppShell padding removed (dock edge to edge), header 56 to 40 px, workspace tabs moved from the status bar to the header's left cell (the status bar keeps the inspector toggle, hover help, Panels menu and settings toggle), the two view toggles lose the filled `light` look and show an accent icon while open (THEMING 4-state grammar). Lock row on `src/pages/CompositionWorkbench.page.tsx`. Not done: a default Scene/Arrange workspace (the human picks what it holds).
- **U2:** port `CompositionInspector` and `CompositionSettingsPanel` to `InspectorKit` (page-owned files, no lock: `KitScope`, `Strip`, `Section` accordion menus with `Ctrl+click` solo accordion, prose into `data-info` or `Tip`, the red Remove button becomes a compact action). `Inspector` stays the Graph & Edit-Mode context panel (`Canvas & cables` + `Node`, or `Properties` + `Operators` in Data-block Edit Mode).
- **U3:** register `CompositionInspector` as a `DockStage` panel (`keepMounted: true` for `#nodeInspectorSlot`; entry-file lock). `CompositionSettingsPanel` stays the right pull-up panel.
- **U4 (Maximize done, UNCOMMITTED, W-81):** Blender area ergonomics in `Stage/dock` (Maximize area + `Esc`/Restore + 3-line docker menu icon done; Focus mode, Swap/Join, Shift-drag splitters skipped/deferred): SHARED path `src/components/Stage/`, lock, `check:stage` and consumer check.
- **U5:** Bitwig-style numeric drag in `InspectorKit` `Num` plus `TransportBar`: SHARED `InspectorKit` (used by other pages): consumer table first (who renders `Num`), lock, `check:stage`.
- **U6: Tabbed `Properties` (Blender-style vertical icon + colored tab rail):**
  - Static wireframe mock first (`arcs/workbench/mock-properties-tabs.html`): vertical icon + colored tab rail (five tabs, Blender order: `Scene | Collection | Object | Modifiers | Data`; tabs that do not apply are dimmed with the reason on hover) using `THEMING.md` semantic mark roles (`--mark-*` / `--accent`), human checkpoint before code.
  - **Checkpoint decisions (human, 2026-11-25): mock APPROVED** (`mock-properties-tabs.html`, `mock-icons.html` icons: Scene violet, Collection yellow, Object orange, Modifiers blue, Data green). Every tab opens with Blender's two lines: a plain path line, then a row with the type icon and the editable name. Only the Data tab's row has a picker (browse and link `primaryDataRef`) plus user count (click = Make Single User), New (duplicate) and Unlink (the old None). The Object, Collection and Scene rows have no picker (the Outliner selects). No pin. Scene tab shows the Settings content while the right pull-up Settings panel stays. A selection change that makes the open tab not apply falls back to the nearest live tab and the last tab per kind is remembered.
  - Implementation (`ScenePanels.tsx`, no schema change): split `PropertiesBody` into fixed-layout tabs (`Scene`, `Collection`, `Object`, `Modifiers`, `Data`), active tab persisted in `sceneSession.ts`. Human checkpoint: **yes** (look & zero layout shift).
- **U7: Expose `RegisterSpan` in `Properties → Object`:** surface `ObjectData.registerSpan` (already in `sceneTypes.ts`) in the `Object` tab (`ScenePanels.tsx`, `sceneOps.ts`, `ArrangerPanel` / `evaluateScene`). Human checkpoint: **yes** (look). **Checkpoint decisions (human, 2026-11-25):** the register works like time: a span (low, high) plus a `registerMapping` with three modes, **Show** (default: sounds unchanged), **Filter**, **Fold**. Acts only on the realization (evaluateScene), never on the data-block. The Object tab also shows a read-only "Data range: lowest to highest note" line in every mode, measured from what the object plays after its modifiers. This changes the stored Object record (new field), so the workflow cost rules apply: U7a = types, validation, migration (existing objects get `show`), consumer table; U7b = evaluator, ops, panel. Scenarios (notes C4 E4 G4 C5 = 6000, 6400, 6700, 7200 cents):

  | Mode | Span | Plays | Rule |
  | --- | --- | --- | --- |
  | Show | any | C4 E4 G4 C5 | no change |
  | Filter | 6200 to 7000 | E4 G4 | notes outside the span are dropped |
  | Fold | 6200 to 7000 | E4 G4 | each note moves by whole octaves into the span; a note with no octave inside the span is dropped (both Cs here) |
  | Fold | 6000 to 7100, chord (all at one start) | C4 E4 G4 (C5 folds onto C4 and merges) | CONFIRMED: a fold that lands on a note already sounding at the same start merges into one note |
  | Fold | 6000 to 7100, melody (C4 then C5 at different starts) | C4 E4 G4 C4, nothing lost | CONFIRMED: different starts stay two separate notes |

  CONFIRMED (human, 2026-11-25): with a span wider than an octave, a note with several fitting octaves goes to the one nearest its original pitch. The Object tab also shows "N moved, M dropped" beside the Data range line (Filter shows dropped only; Show shows neither). Next: the consumer table (U7a), human confirms before a builder.

### U8: Bitwig-style position scrub for Start and Duration (added 2026-11-25; human decisions; changes DISPLAY and PARSING only, stored values stay exact `Rational`s of a quarter note)
- **Format `BARs.BEATs.TICKs.%`:** a tick is a sixteenth note (4 per beat in 4/4; in 7/8 a beat is an eighth, so 2 ticks); `%` is 0 to 99 of a tick (one percent = exactly 1/400 of a quarter note); the optional `4/4,8` tick setting is ignored for now. Project meter only (`settings.transport.meter`); no per-object meter. **Start counts from 1** (`1.1.1.00` is the origin), **Duration from 0** (`0.0.0.00`). A value between two percents shows the nearest percent; a field writes back ONLY when edited, so looking never rounds a triplet.
- **Scrub (component `PositionScrub`, page-owned in `components/`, same look as `ScrubNumber`):** the part under the pointer at pointer-down sets the step (bar, beat, tick or %); steps carry (2.4.2.00 + 1 beat = 3.1.2.00); left stops at the minimum (`1.1.1.00` for Start); a `%` drag on an off-grid value first snaps to the nearest percent, then steps (CONFIRMED 2026-11-25). Click types, double-click resets.
- **Typed text is parsed and normalized** (carry, missing parts fill with the minimum): `2` -> Start `2.1.1.00`, Duration `2.0.0.00`; `1.3.5` -> `1.4.1.00` in 4/4. **Ratios** (exact, meter-independent for `n`): `a/bn` = a/b of a whole note (`1/4n` is a quarter note); `a/bb` = a/b of a bar (meter-dependent); no suffix = `n`; a ratio needs a `/`; a bare integer is never a ratio. The exact ratio is stored; the field then shows the nearest `bar.beat.tick.%` and the hover text gives the exact ratio.
- **Scenarios (4/4 unless noted, Start counts from 1):** bar drag 2.3.2.00 +1 = 3.3.2.00; beat drag 2.4.2.00 +1 = 3.1.2.00; tick drag 2.3.4.00 +1 = 2.4.1.00; % drag 2.3.2.99 +1 = 2.3.3.00; left from 1.1.1.00 stays; 7/8 tick drag 1.7.2.00 +1 = 2.1.1.00. Ratios, Start/Duration: `1/4n` 1.2.1.00 / 0.1.0.00; `1/4b` 1.2.1.00 / 0.1.0.00 (7/8: 1.2.2.50 / 0.1.1.50); `3/16n` 1.1.4.00 / 0.0.3.00; `1/3n` 1.2.2.33 / 0.1.1.33.
- **Consumer check (display and parse only):** `meterTime.ts` (`formatPosition`, `parsePosition`, `formatLength`, `parseLength`: replaced by the new format, one place) -> Object tab Start/Duration (`ScenePanels.tsx`) and the Notes data-block panel (`NotesPropertiesPanel.tsx` ~128, ~164, ~189); `barQuarters`, `MAX_DATA_BLOCK_BARS` users (`notesProperties.ts`, `arrangerGeometry.ts`, Mixer) unchanged; `TICKS_PER_QUARTER` rounding in `notesProperties.ts:72` to be checked by U8a; `meterTime.test.ts` rewritten.
- **Split (each one builder run, 100k tokens / 50 calls; the resumed builder continues while under 250k summed):** U8a pure math in `meterTime.ts` (format, parse with carry and ratios, step by part, snap) + tests; U8b `PositionScrub` + Object tab Start and Duration (human checkpoint: look; thin slice = Start only first); U8c Notes panel fields.

### TK0 to TK2: Tracks and Collections separate (added 2026-11-25, W-82; human decision; design note `DESIGN.scene-tracks-linking.md`)
Hierarchy: Scene > Collection (group, mute, fold, nesting) > Track (a named Arranger row, for organization) > Object > Data-block. Tracks replace "1 Collection = 1 lane" (W-77) and `ObjectData.lane` (W-78). No Strip layer, no blend modes. Scheduled after U7 and before O4a; it changes a stored record, so the workflow cost rules apply (scenarios, consumer check, static mock, schema split).
- **TK0 (design, no code, HUMAN CHECKPOINT):** (1) `SCENARIOS.tracks.md`: the human's concrete cases as a table (a Piano collection with RH, LH and Pedal tracks; overlapping blocks on one track; dragging an object to another track and to another collection; deleting a track that holds objects; a collection with one track versus several; nested collections; mute on a collection versus on a track; what Properties shows for a selected track). Open questions to settle there with examples that differ: does a Track mute, solo or lock (the human said "organization", so default none beyond mute and fold); are Tracks per Collection only (default yes); can an object overlap another on one Track (default yes, drawn as sub-rows automatically, replacing the stored `lane`); how existing objects migrate (one Track per collection named after it, `lane` becomes overlap order only); does the Outliner list Tracks under their Collection (default yes). (2) Consumer check table `Panel or op | Reads | Shows or does` for Outliner, Properties (a Track tab or a section in the Collection tab, human decides), Arranger, evaluator, ops, desk, project save and importing pages. (3) Static wireframe mock of the Outliner tree and the Arranger rows with Tracks, shown to the human before any data work. STOP for the human.
- **TK1a (types, validation, migration; one builder run):** `TrackData` record and `ObjectData.trackRef`, removal of `lane`, validation, migration of stored objects, registry slots. Gate. No UI.
- **TK1b (evaluator, ops, scenario tests; one builder run):** ops (add, rename, delete, reorder, move object between tracks and collections, duplicate with tracks), `evaluateScene` and mute rules, tests from the confirmed table.
- **TK2 (UI thin slice, HUMAN CHECKPOINT: look):** Outliner shows Tracks, Arranger rows per Track, drag between tracks, Properties for a selected Track (rail gets no sixth tab unless TK0 decides so), `VOCABULARY.md` and `ARCHITECTURE.md` updated. STOP for the human.
- Acceptance: [ ] `check:workbench` passes [ ] tests from the confirmed table [ ] consumer table reflected in code [ ] DECISIONS row updated from "planned" to "done"

### O3: Native modifiers and Apply (split 2026-11-24: O3-i pure, O3-ii Properties UI; scenarios confirmed: `SCENARIOS.modifiers.md`, W-72)
- Checkpoint decisions (human, 2026-11-24): rows 1, 2, 5, 6, 7 as recommended (Apply only on the top modifier plus Apply All; the second modifier is named **Snap to Pitch Set**); row 3 gets a toggle for both behaviors (Repeat every octave, default on, with an editable Period in cents); row 4 accepted for now, to be tuned after hearing it; **non-12-EDO is a core rule** (exact cents with a period, a Pitch classes input brings its own EDO).
- **O3-i DONE 2026-11-24 (W-73).** O3-i (pure, no UI, no human checkpoint): modifier registry, object `modifiers` with refs, evaluation through the stack before the mapping, the three modifiers, Apply and Apply All ops, problem messages for Properties. O3-ii (UI thin slice, human checkpoint: look and sound): the Modifiers section in Properties.
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

### Removed 2026-11-25: T0 to T6b and S0 to S2 (superseded by the object phase, W-66, and by L0 to L2, W-77). Recover from git history if ever needed; do not build from them.

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
