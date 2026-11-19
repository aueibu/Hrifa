# ARC: One Stage for the workbench (named dockers, screensets, panels reusable anywhere)

**Status: approved by the human 2026-11-14; AMENDED the same day after the M1 checkpoint (named dockers on a split tree instead of fixed areas, screensets per project, drag docking and pinning in scope, a new milestone order). The amendment is awaiting the human's approval.** Drafted after the chord-input arc closed (`ARC.chord-input.md`) and the Stage was adopted inside the note clip editor (W-23 to W-25). Background reading: `arcs/workbench/DESIGN.one-stage.md` (the design: panel model, split tree, screensets, state boundary, migration, decisions D1 onward and open items), `arcs/workbench/RESEARCH.docking-layouts.md` (how other systems do it), `arcs/workbench/STAGE-ADOPTION.md` (terms and the current nesting), `src/pages/stage/ARCHITECTURE.md` section 13, `shell/BACKLOG.md` items tagged `[stage]`, `[shared]` Stage items and the `[workbench]` Stage adoption items.

**AMENDED 2026-11-18 (approved by the human: "okay we can start on phase zero and move into phase 1 ... handle it all", after reviewing the plan `C:\Users\apoor\.claude\plans\d-downloads-workbench-pathway-integratio-ancient-blum.md`):** new milestones R1 to R3 (the module runtime) and a new order: **R1, M5, R2, R3, M4b, M6, M7, M8**. Why: an audit found that every workbench module computes and publishes its outputs inside its own mounted React component (`useEffect(() => onOutputsChange(...))`), outputs live in a page `useState` (every publish re-renders the page and every module), and the page lists modules in a hand-written if/else chain plus two side tables. That forces every module to stay mounted forever, makes pinning (M7) lose unsaved state on remount (DESIGN 8.3), and makes hosting many panels (and later the harmonic lab's panels, a planned Harmonic screenset) expensive. R1 goes before M5 because both rewrite the page's module block; M5 does not depend on M4b. The wider plan (lab seams arc, the lab as a screenset, pitch seam, timeline and context lanes) is in the plan file; only R1 to R3 and the new order belong to this arc.

**Integration decisions (the human, 2026-11-18, at the M5 checkpoint; the plan's open decisions):**
- D1 (close the lab's Scala-tools arc after M8f): the human handles it in a separate lab session. Nothing for this arc.
- D4 ("key groups"): an arranger lane of "meta clips" that sets context over a time span, which would otherwise be project-wide setup. Main use: pitch context per section. A section in 12-EDO and a later one in 19-EDO: inside each span the piano roll shows that EDO's keyboard, snaps to its notes, and transforms work in that pitch space. Lower level: snap to a key or scale per span (C major in one section, Db minor in another). The same lane also holds structure labels ("chorus", "climax", "development") and can define rhythmic structure. Other apps show this as a bar running along the timeline. This confirms and widens the plan's Phase 4 context lane (`PitchContext` spans that the clips under them link to). It is the timeline arc's design input, not this arc's scope.
- D5 (fractional stored pitches): yes. Stored pitches keep whatever they need to resolve microtonal structure: fractional midicents, plus the exact identity (the plan's `exact: { m: monzo, c }`) when the pitch came from a ratio. Orchestrator note for the X2 design: an EDO pitch has no monzo, so `exact` should also allow an EDO step (`{ edo, step }`), settled when X2 is designed. DECISIONS W-44.
- D6 (retire the lab's own column layout in favor of the dock Stage): yes, when the lab panels move onto the dock Stage (plan L-S4).

## Goal
The workbench centre is arranged by one Stage instead of hand-built special cases. The top and bottom split, the desk and canvas sharing the top pane, the clip editor area, the module detail area and the canvas takeover all become **panels** shown in **dockers** that the user can name, arrange and recall, so the user can send a panel somewhere else ("send this to the visualizer docker") or drag it there without a code change. Standard proportions (the size classes and the 6rem unit) let dockers slot together and nest.

Ideas from the human (2026-11-14) that shape the design:

1. **Standard proportions that slot and nest, not fixed slots.** The arrangement is data the user changes: a split tree whose leaves are named dockers. Examples to support: (a) a top docker over a bottom area whose right-hand docker holds 3 tabs; (b) left, centre and right dockers each with one tab; (c) a top docker over a bottom split into left and right.
2. **Panels are built to be reused.** A panel is written once, context-free, and declares its home (the docker it normally lives in). The chord picker is the example: it must work for the piano roll AND for other hosts (an empty list in a workbench module that receives a chord as pitch classes, a module that takes a note set for analysis). So its state and the clip editor's state move to page level, and the picker follows the active chord target.
3. **A panel remembers its preferred docker.** Close the chord picker; invoke the Chords tool again and it reopens in the docker the user last had it in. Nothing to set in a menu.
4. **Dockers, like REAPER's.** A docker holds any number of panels as tabs, has a user-chosen NAME, and persists when empty until the user removes it. A tool or workbench module can call a panel to the front. Send-to targets dockers by name; drag-to-dock follows the menu.
5. **Screensets (saved named arrangements).** Different sessions want different arrangements (harmonic lab modules; drawing and realising gestures and fields; arranging). Each project stores its screensets (per project by default); the user can add their own; the app ships sensible default screensets. They appear as meta-tabs at the bottom that replace today's canvas and desk view tabs.
6. **Pinning modules.** A workbench module instance can be pinned into its own docker so several can be seen at once (two Carter hexachord views, a subset combiner next to them).
7. **Stretch, not required: pop-out** of a panel into a free-floating window.

## Decisions already taken (M1 checkpoint, 2026-11-14; full list under M1 below)
- Build our own split tree with named leaf dockers on the existing Stage core; no docking library (dockview was considered and declined).
- Vocabulary: docker = container with tabs and a name; panel = content in a tab; screenset = a saved named arrangement; slot, stack, column kept only for the old v1 Stage.
- Send-to menu first, then drag-to-dock; both call one layout operation. A "show this panel" function on the Stage (not a general message channel).
- Named dockers persist when empty. Which docker flexes and what can close are workspace choices, not per-panel flags. Keyboard: select a docker by shortcut, then cycle its tabs (manual activation).
- Chord session and clip editor session at page level, no React key above the Stage, picker follows the active chord target. Single instances for the piano roll and chord picker; a `multiple` option for panels like browsers and catalogs; pinned module instances in this arc.
- Layout per project; the old Stage (v1) and the editor's own Stage stay until M6 so the existing tests stay green.
- A drops system (picker payloads dragged onto targets such as a velocity lane or a rhythm list) is a LATER arc; this arc must not preclude it.

## Parameters
- Stack: React 19 + Vite + Mantine, TypeScript, shell theme roles only (`src/theme/THEMING.md`). The Stage contract stays: a panel receives only its size class; panels are mounted once and keep state when moved (STAGE-7).
- Persistence: layout and screensets live with the project by default. The screenset store is a project-state key `hrifa.composition-workbench.ui.screensets.v1` read and written by the page with `usePersistentState` (like today's `ui.canvas-split`, `ui.detail-collapsed`, `ui.workspace-view`, W-10; added to `unrecordedStateKeys` so changing it is never an undo step); this differs from the Stage's own `hrifa.stage.` loader, which stays for the spike and any per-viewer data (the spike keys, the editor key, `hrifa.note-editor.v1`, a possible template library). Existing keys and the saved `chordHost` / `chordDockWidth` migration keep working; old project state seeds the first screensets (nothing lost, no history entries).
- Behaviour that must not change: chord input (hover ghosts, audition, insert, W-20 keyboard workflow, Esc), clip editing, undo and history, the desk, Scale Explorer and other pages.
- Owned paths: `src/pages/composition-workbench/**` (the page folder and its tests, its `ARCHITECTURE.md`, new files such as `panels/` and a sessions wrapper component), `arcs/workbench/` files (`ARC.md`, `PROGRESS.md`, `DESIGN.one-stage.md`, `RESEARCH.*`, archives, `STAGE-ADOPTION.md`).
- Shared paths it may touch (each needs a row in `arcs/LOCKS.md`, written by the orchestrator, per milestone): `src/lib/stage/` (the layout core: tree, screensets, migration), `src/components/Stage/` (the old v1 Stage stays unchanged until M6; the new tree Stage is a new component beside it, in a new folder; `stageOps.ts` and `registry.ts` lock from M2 per the checkpoint), `src/pages/stage/` (the `/stage` spike is the test bed; its docs and tests), `src/components/InspectorKit/` (conditional: the docker strip with tabs), `src/pages/CompositionWorkbench.page.tsx` (entry file, M5, and M6 if touched; the new spike in M3a is reached through a new `StageEntry` in `src/pages/stage/` plus a ONE-LINE change in `src/pages/Stage.page.tsx` (amendment 2026-11-14: the route imports `StageEntry`, `/stage?dock` shows the dock spike); the amendment is logged in W-31), `shell/ARCHITECTURE.md` (M5 and M8 docs; needs a lock row), `src/components/PianoRoll/` (opt-in props only, if a panel needs them: stop and ask first), `package.json` (only if a new check script is needed), `DECISIONS.md`/`BACKLOG.md` (no lock). `src/pages/harmonic-field-lab/` and `src/lib/harmonic-field/` belong to another arc and are not edited.
- Check command: `corepack yarn check:workbench` and `corepack yarn check:stage` (both exist; run both at each milestone, once, before the commit). Also `check:hfl` before committing a change to the Stage, kit or `src/components/` (the lab is a consumer of shared components).
- Concurrency: same checkout and branch as the other arcs; the orchestrator commits at the end of every milestone with path-scoped `git add <paths>` and `git commit -- <paths>` only (never `git add -A` or a bare `git commit`; on an `index.lock` error retry, never delete the lock) and removes lock rows only after that commit; after writing a lock row re-read `arcs/LOCKS.md`; use the existing DECISIONS prefix `W-` (next free id). Every code milestone appends its DECISIONS rows in the same milestone.

## Preconditions
- `check:workbench` and `check:stage` exist and are green before each code milestone. If red only because of another arc's unfinished files, stop, report and wait (shell rule 14).
- Owned and locked paths are clean before each builder brief.

## Non-goals
- No new chord or musical features; chord-input behaviour is preserved, not extended.
- No rebuild of the workbench left inspector on the kit (`BACKLOG`, later), and no change to the harmonic field lab.
- No free-floating windows in the core milestones; the only floating element stays a transient anchored popover. Pop-out is the stretch milestone M9 and needs the human's explicit go-ahead and a `DECISIONS.md` row (it relaxes an earlier rule).
- No drops system (payload types and drop targets); a later arc.
- No change to the pitch, time or edit contracts (`shell/ARCHITECTURE.md`, shared contracts).
- The `/stage` spike page stays until the human decides to remove it.

## Milestones
Each milestone is small enough for one builder run and has criteria a command or test can check.

### C0: Context scan. DONE (see PROGRESS.md).

### M1: Design: dockers, screensets, panels reusable anywhere (a document, no production code). DONE; deliverables `DESIGN.one-stage.md` and `RESEARCH.docking-layouts.md`
- Pre-decisions (human, 2026-11-14, at approval): a stack can contain a tab group (now: a docker, which is the tab group, can be a member of a vertical split); one instance of each panel id per Stage by default. SUPERSEDED at the M1 checkpoint: closing the last tab no longer releases the space; named dockers stay until the user removes them.
- Scope: owned `arcs/workbench/` and `src/pages/composition-workbench/ARCHITECTURE.md` only. Write down the panel model (home, reuse, one or many instances, what a host must provide), the layout model options (areas with homes versus rows versus a tree), how the current workbench centre maps onto it (desk, canvas, clip editor area, workbench modules, canvas takeover, inspector as a region), the Send-to menu behaviour, and what must move out of `NoteClipEditor` (the chord session, the piano roll props, the reveal command, selection) with a proposed boundary (a session hook or store, a command channel, one selection model). Also design: the remembered-placement map (what is stored, fallback rules, reset), tab groups (how a panel joins or leaves a group, the active tab, calling a panel to the front, how this combines with stacks), and whether pop-out is wanted and what it would need (a floating slot, window bounds, persistence, what happens when the page is narrow). Optionally a throwaway HTML mock outside the repo. List the open questions with a recommendation each.
- Acceptance:
  - [ ] A design section in the page `ARCHITECTURE.md` or `arcs/workbench/` with the models above and the questions
  - [ ] Every `[stage]` and `[shared]` backlog item that this arc must resolve is mapped to a milestone or explicitly deferred
  - [ ] The three added ideas (remembered placement, tab groups, pop-out) each have a recommendation and an in-scope or deferred decision
- Human checkpoint after: **yes** (answered 2026-11-14; the revised design `DESIGN.one-stage.md` is accepted when the human approves this amended ARC.md)
- Checkpoint decisions (human, 2026-11-14, answering the 24 questions in `DESIGN.one-stage.md` section 9; the design is being revised to match, so these are interim until the revised design is accepted):
  - Q1 layout model: named areas, but the human wants far more arrangement freedom than top and bottom (see Q2, Q9): the areas are user-nameable **dockers** (REAPER's term) arranged by the user.
  - Q2 area set: top versus bottom is too binary. Examples to support: (a) a top and a bottom with a right-hand docker holding 3 tabs; (b) left, centre and right dockers each with one tab; (c) a top docker over a bottom split into left and right. Research into how established systems do this was requested (a report is pending); this probably moves the layout model from a fixed area set to a split tree whose leaves are named dockers.
  - Q3 Send-to versus drag: menu first is fine; drag docking is expected to remove the "clunk" and is wanted.
  - Q4 "show this panel": a Stage function (not a general channel): accepted.
  - Q5 state boundary: the chord picker's state moves to page level. The human's vision: a picker works on many targets, not only the piano roll (insert a chord as pitch classes in a bracket into an empty list in a module; insert a set of notes into a module for analysis). The same holds for all future data "drops" or bucket-style generators: a gesture picker that saves curves, dragged onto a velocity section or onto a rhythm list to scale durations; this ties into curves as automation lanes versus written or generated data. (Capture as backlog; the arc must not preclude it.)
  - Q6 second chord picker host: option (a), the single picker panel follows the active chord target.
  - Q7 workbench modules as one panel: accepted as a bound for writing new panels, BUT Q23 asks for multiple instances of some modules (see Q23): reconcile in the revised design.
  - Q8 clip editor and modules in one tab group: ok.
  - Q9 remembered placement and Send-to: dockers should be NAMED by the user so "send this to the visualizer docker" works instead of "top right"; a remembered place is a docker (by name) plus tab position.
  - Q10 inactive tabs laid out but invisible: ok. Q11 vocabulary: ok unless REAPER's wording clarifies: what the design calls a panel the human calls a docker. Resolve in the revised design: **docker** = the container with tabs; **panel** = the content shown in a tab.
  - Q12 picker follows the Stage size class: ok.
  - Q13 and Q15 (fills, never hidden, closable fixed per panel): DISAGREE. Those are just one mode of working. Different sessions will be mostly harmonic lab modules, or drawing and realising gestures and fields, or arranging. So which docker flexes, what may be hidden and what can be closed must be user and workspace choices, not hardwired per panel; implies saved, named **workspaces**. The measuring problem for the canvas stays a technical robustness matter.
  - Q14 home with no space: ok, alleviated by tabs (there is always space).
  - Q16 command names: the human did not understand the question (explain plainly). Q17 selection model read-only chain: ok. Q18 new chrome: not seen by the human (explain plainly).
  - Q19 takeover migration: ok. Q20 pop-out deferred: ok. Q21 picker's own close renamed: ok (the picker stays open for later use).
  - Q22 tab activation: not automatic on arrow keys. Wants a better selection system first: select a docker by shortcut, then cycle its tabs once the docker is active.
  - Q23 multiple instances: one chord picker or one piano roll is fine (state moves to page level). But some modules need several at once (a set browser, a voicing catalog; two modules showing different Carter hexachords, another combining subsets). Conflicts with Q7's single `module-detail` panel; the revised design must allow `multiple` instances for such panels and reconcile with Q7.
  - Q24: yes, `src/components/Stage/stageOps.ts` and `registry.ts` join M2's lock.
  - Follow-up answers (2026-11-14, after the research and the revised design): build our own split tree (no library); named dockers persist when emptied; milestone order approved (see M2 to M9); pinning a module into its own docker ships in this arc (M7); layout and screensets are stored PER PROJECT by default, with the option for the user to add their own screensets; screensets act as meta-tabs at the bottom that replace the old canvas and desk view tabs, so the user flips quickly between preferred custom views; the app ships with sensible default screensets.
  - The human states the vision plainly: "I have this vision for the app. I feel like we can achieve it." Treat the design as a foundation for that vision, not only the current workbench.

### M2: Layout core: split tree, dockers, screensets, migration (pure TS)
- Human decision (2026-11-14, design open item O3): the chord picker is an ORDINARY panel (opened and closed freely, openness saved like any other panel), not `transient`. The Chords tool or its hotkey FORCES it into view if it is not shown (it reopens in its remembered docker). `transient` is removed from `PanelMeta`; `keepMounted`, `multiple` and `home` stay. How the roll behaves with the Chords tool versus the chord panel alone is the placement-modes scaffold (design 7.7), decided before M4a.
- Scope: `src/lib/stage/` plus `src/components/Stage/stageOps.ts` and `registry.ts` under locks (checkpoint answer Q24), and `src/pages/stage/ARCHITECTURE.md` section 10 only if the `src/pages/stage/` lock is taken: the split tree with named leaf dockers (`id` plus mutable `name`), panels outside the tree, the per-screenset `lastDocker` map, screenset data (`{ name, tree, lastDocker }` with a version field and validation), operations (send a panel to a docker or to a new docker with a direction, move, split, resize with minimums, set the active tab, close and reopen with the remembered docker, remove an empty docker), the solver (weights, rem sizes, per-docker minimums from the active panel, collapse), `PanelMeta` fields (`home`, `multiple`, `transient`, `keepMounted`), `layoutV1ToScreenset` (named in the design) and the parse functions (version 2 accepted, version 1 migrated), the dynamic panel registry (ids exist before parse). No React.
- Acceptance:
  - [ ] `check:stage`, `check:workbench` and `check:hfl` pass (the lab and workbench consume shared Stage code)
  - [ ] Tests: the three target arrangements (a), (b), (c) build, serialise and parse back; a v1 layout, including a column with no width, a stacked and a swapped editor layout, loads without loss; sending a panel between dockers keeps all panels; minimum sizes are respected; unknown panel ids are dropped; an emptied docker persists; closing and reopening a panel restores its docker (by id, then by name, then the home docker); a screenset's active tabs survive a round trip; a panel's openness is saved like any other (no `transient`) and `show` of a closed panel opens it in its remembered docker
  - [ ] `DECISIONS.md` rows: the version-2 screenset format (supersedes STAGE-5, STAGE-15 and part of STAGE-8), persistent dockers (replaces the earlier pre-decision), remembered docker, the chord picker is an ordinary panel (replaces design 3.6)
- Human checkpoint after: no

### M3a: The tree Stage component beside the old one (render, dockers, tabs, Send-to, parking)
- Scope: a NEW Stage component in a new folder `src/components/Stage/dock/` (the old v1 `Stage`, `NoteClipEditor.stage.test.tsx` and the editor's Stage stay untouched and green): render the tree and the solver, docker strips with tabs and the docker name, the Send-to menu (by docker name, "New docker..." with a direction), empty docker strips, parking of collapsed, narrow-hidden and inactive-tab panels (kept laid out and measured, hidden with opacity, `inert` and no `display: none`, no detaching; scroll restore tied to parking), `keepMounted`, `useStageApi` (`open`, `show`, `close`, `sendTo`, `isOpen`, `isShown`); the `/stage` spike shows the three arrangements, a docker with tabs and a close-and-reopen (a new spike file inside `src/pages/stage/`, old spike untouched). `src/components/InspectorKit/` conditional lock for the docker strip.
- Acceptance:
  - [ ] `check:stage`, `check:hfl` and `check:workbench` pass
  - [ ] Tests: a panel keeps its state when sent between dockers and when its tab is inactive; an emptied docker shows as a strip and accepts a panel; a panel closed from a docker reopens there; `show` switches the active tab; a measured panel in a parked docker keeps its last size; a `keepMounted` panel survives a screenset change
  - [ ] `DECISIONS.md` rows: dockers and parking (supersedes STAGE-7's "hidden detached" and STAGE-8's switcher for the new Stage), `useStageApi`, `keepMounted`
- Human checkpoint after: **yes** (the human tries it at `/stage`: moving a panel between dockers, naming a docker, sending by name, tabs, close and reopen, reload)
- Checkpoint decisions (human, 2026-11-14): tried at `/stage?dock`: "all works well". One bug found and fixed (the top/bottom splitter was an unreachable 2.5rem stub, commit `289842a`). The spike's own layout is not final; the human will make their own arrangements. Nothing else asked.

### M3b: Drag-to-dock
- Scope: the new Stage component (lock; `check:stage`, `check:workbench` and `check:hfl` run once before the commit): a drop overlay on dockers with a centre zone (join as a tab) and four edge zones (split in that direction), a preview, a transparent shield over canvases while dragging, Escape cancels; every drop calls the same `sendTo` as the menu; a drop in the same docker does nothing.
- Acceptance:
  - [ ] `check:stage` passes
  - [ ] Tests: centre joins as a tab, an edge splits, a same-docker drop does nothing, Escape cancels, the layout after a drop equals the layout after the equivalent menu choice
- Human checkpoint after: **yes** (feel of dragging)
- Checkpoint decisions (human, 2026-11-14): tried it: "this is great". The root-edge drop (a docker spanning a whole Stage edge, not in the original design) is kept as built (W-34); no changes asked.

### M3c: The tree Stage: keyboard, Panels menu, dynamic registry, screenset tab strip skeleton
- Scope: the new Stage component (lock): docker selection by shortcut then arrows between tabs (manual activation), the Panels menu (transient panels excluded), the dynamic registry (rebuilt as instances change; ids exist before parse), the screenset meta-tab strip UI skeleton, extended in the spike.
- Acceptance:
  - [ ] `check:stage`, `check:hfl` and `check:workbench` pass
  - [ ] Tests: selecting a docker by shortcut then arrows moves between tabs; Enter or Space activates; a dynamic registry rebuild keeps hosts alive; the Panels menu opens a closed panel in its remembered docker
  - [ ] `DECISIONS.md` row: the keyboard model
- Human checkpoint after: no

### M4a: The chord session at page level (no UI change)
- Placement modes CONFIRMED by the human (2026-11-14, design 7.7): anchor mode (the Chords tool, unchanged) and selection mode (pointer tool: the chord panel acts on the selected notes; nothing selected means audition only) ship in M6; cursor and drop modes are later. The panel shows which mode applies and what Insert will do; Insert is disabled with a reason, never guesses.
- Scope: owned workbench paths only: a sessions wrapper component (`composition-workbench/WorkbenchSessions.tsx`; the entry file is not edited until M5) and a page-level `ChordSession` store with claim and release (the last claim wins, an earlier held claim becomes active again when the latest releases), a `ChordTarget` interface, ownership of `hoverCell`, `hoverBlocked`, audition and the W-20 keyboard handling. `NoteClipEditor` uses the session from `WorkbenchSessions` when one is above it and otherwise mounts a private one, so every existing test and the page run unchanged. Until M6 the picker still lives in the editor's v1 Stage: the `ChordSession` drives it through an injected open/close adapter (the editor's adapter maps "the claiming host wants the picker" to today's picker-in-Stage rule).
- Acceptance:
  - [ ] `check:workbench` passes; every existing chord-input and `NoteClipEditor` test passes without weakened assertions
  - [ ] A second consumer in a TEST (a minimal host that is not a clip, for example a chord progression list that claims the target and mounts the picker body bound to the session, or the `dock/` Stage from M3a) with no clip open receives the inserted chord
  - [ ] `DECISIONS.md` rows: the chord session boundary, claim lifetime
- Human checkpoint after: no

### M4b: The clip editor session, input scope and selection chain (no UI change)
- Scope: owned workbench paths only: a page-level `ClipEditorSession` store (per-clip state keyed internally, no React key above the Stage), the `inputScope.ts` module (`pointerInside`, the pointer tracker, scope attributes `data-note-editor-scope` and `data-chord-scope`), the panel commands (`reveal`, `clearAnchor`, `focus`) and the read-only selection chain (`WorkbenchSelection`, design 7.4). The note clip editor keeps working as today by using them, with the same private-session fallback.
- Acceptance:
  - [x] `check:workbench` passes; every existing test passes without weakened assertions
  - [x] Tests: the session resets per clip without remounting siblings; `reveal` and `focus` reach the roll; the selection chain resolves note to clip to project
  - [x] `DECISIONS.md` row: the command channel and the selection chain (W-47)
- Human checkpoint after: no
- Done 2026-11-18. Found: the page does not mount `WorkbenchSessions` (M5 shipped without it), so in the running app the editor uses its private sessions; page wiring is a BACKLOG item (entry-file lock), before or with M6.
- Checkpoint decisions (the human, 2026-11-18): do the page wiring as its own step (M4c) before M6, not folded into M6.

### M4c: Mount `WorkbenchSessions` in the page (no UI change) (added 2026-11-18)
- Scope: `src/pages/CompositionWorkbench.page.tsx` (lock) and owned workbench paths. The page wraps the Stage (and anything that renders a `NoteClipEditor`, chord picker or clip actions panel) in `<WorkbenchSessions inspectorTarget={...} clipId={editorClipTarget}>`, so the editor, the chord picker host and the clip actions panel share the page's chord session, clip editor session and input scope instead of private ones. No React key above the Stage. Existing behaviour unchanged.
- Acceptance:
  - [x] `check:workbench` passes; `src/pages/CompositionWorkbench.page.test.tsx` and `clipPanel.page.test.tsx` pass; no existing test weakened
  - [x] New page-level tests: the editor in the page uses the shared sessions (e.g. the chord picker host and the editor see the same anchor; switching clips resets the editor's state without remounting the desk or canvas); `useWorkbenchSelection()` inside the page resolves the live note, clip and module targets
  - [x] BACKLOG item "Mount `WorkbenchSessions` in the page" removed; workbench `ARCHITECTURE.md` and the `WorkbenchSessions.tsx` comments say it is mounted
- Human checkpoint after: no
- Done 2026-11-18 (no behavior change; W-39 and W-47 text updated, no new DECISIONS row).

### R1: Module runtime, step 1: output store and module registry (no UI change) (added 2026-11-18; runs before M5)
- Scope: owned workbench paths plus `src/pages/CompositionWorkbench.page.tsx` (lock). (1) A new `src/pages/composition-workbench/runtime/` folder: `outputStore.ts`, a pure external store for published outputs (`publish(instanceId, outputs)` with today's equality rule from `reconcileCompositionOutputs`, `prune(liveInstanceIds)`, `get(ref)`, a stable `list()` snapshot that changes identity only when an output changes, `subscribe`), and a `useOutputs` hook over it via `useSyncExternalStore`. (2) `runtime/moduleRegistry.tsx`: ONE table `moduleId -> { stateKeys, ports?, render(props) }` replacing the page's `instanceStateKeys`, `routedModulePorts` and the if/else render chain (page lines about 95-224 and 754-926); the canvas's own port table (`CompositionCanvas.tsx:99`) reads its port ids from the registry if the shapes allow without behaviour change (labels may stay in the canvas). (3) A memoised per-instance host component with stable callbacks, so a publish no longer re-renders every module: source modules (no `outputs` prop) do not re-render when another module publishes. (4) The page uses the store; `bindModulePort` reads the store instead of closing over the outputs state (stable callback). No module file changes its logic in R1 (only imports if unavoidable). Modules still publish from their effects (R2 moves that).
- Acceptance:
  - [ ] `check:workbench` passes; every existing test passes unweakened; `src/pages/CompositionWorkbench.page.test.tsx` and `clipPanel.page.test.tsx` run explicitly and pass
  - [ ] New tests: `outputStore.test.ts` (publish, same-content publish keeps identity, prune, subscribe notifications); a page-level test that a publish from one source module does not re-render another source module and that a routed module receives the new output
  - [ ] Adding a module type needs one registry entry (plus its component); the workbench `ARCHITECTURE.md` "adding a module" note (about line 374) and `SWIRLING_MISTS_SPEC.md` pointer updated
  - [ ] `DECISIONS.md` row W-41: the module runtime direction (registry, external output store; R2 evaluators, R3 state and undo in the store; headless publishing as the target)
- Human checkpoint after: no

### R2: Module runtime, step 2: pure evaluators (no UI change) (added 2026-11-18; after M5)
- Scope: owned workbench paths. Each source module's state-to-outputs glue (input resolution, signal treatment, result, packet assembly) moves out of the component into a pure `evaluate(state, inputs, ctx) -> PublishedCompositionOutput[]` registered in the module registry; the runtime (not the component) calls it and publishes. Two or three modules per builder run, simplest first (PitchList, RhythmList, Arithmetic; then Fractioning, PairComposition, ScaleConstruction, ScaleEvolution; then Interference, SwirlingMists, Householder, RhythmEdit; then Melodicization, Snippet). The duplicated publish `useEffect` is removed from each ported module.
- Acceptance:
  - [ ] `check:workbench` passes; existing module tests unweakened
  - [ ] Each ported module has an evaluator unit test (`.test.ts`, node env) comparing against today's output for its default and one edited state
- Human checkpoint after: no

### R3: Module runtime, step 3: state and undo in the store; modules may unmount (added 2026-11-18)
- Scope: owned workbench paths. Per-instance module state lives in the runtime store (read once from the same storage keys, written back, history appliers registered by the store per instance key through the existing `registerHistoryApplier`, so `history.ts` does not change); module components read and write through a hook; the runtime evaluates every instance whether or not its view is mounted. `module-detail` and the module list no longer need `keepMounted` or `hidden` hosts.
- Acceptance:
  - [ ] `check:workbench` passes; undo, redo, project open and delete-module tests unweakened
  - [ ] New tests: an unmounted module's output still reaches a downstream module; editing a mounted module and undoing works after the view unmounts and remounts; delete then undo restores the state
  - [ ] `DECISIONS.md` row: supersedes the "modules must stay mounted to publish" rule in the workbench `ARCHITECTURE.md`
- Human checkpoint after: no
- Checkpoint decisions (the human, 2026-11-18, asked during R3b): hidden module views STAY MOUNTED for now (option A). Unmounting them would stop a playing preview when switching module or screenset and reset selections, scroll, open dialogs and playheads. The human's intent is the DAW model: "Bitwig lets you start playing on a timeline and then go into a synth and edit it live then pop over to a reverb vst and it all just works." So playback and live view state must not belong to a module's view. Moving previews into a page-level playback engine and per-instance view state into a session store, after which hidden views can unmount with nothing lost, is a BACKLOG item to schedule before or with M7.

### M5: The workbench page on the new Stage
- Scope: `src/pages/CompositionWorkbench.page.tsx` (lock) and owned workbench paths, `shell/ARCHITECTURE.md` (lock): canvas, desk, a clip editor panel (which still contains its own v1 editor Stage with the piano roll and chord picker) and the module detail in dockers on the new Stage, REPLACING `SplitStage` and `ClipEditorSlot` (`SplitStage.test.tsx` is retired at M5 with the component, and the workspace-view case in `WorkbenchStatusBar.test.tsx` is rewritten for the meta-tabs; `src/pages/CompositionWorkbench.page.test.tsx` (outside the `check:workbench` scope) and `clipPanel.page.test.tsx` are run explicitly and must pass; the orchestrator lists the retired tests and tells the human); this milestone seeds `lastDocker.chords` from `chordHost` and `chordDockWidth`; the default screensets (derived from today's canvas and desk views and the current arrangement; Canvas, Desk and Edit; a Harmonic screenset waits for the lab panels; the design lists the contents) appear as meta-tabs at the bottom replacing the canvas and desk view tabs; seeding from old project state (`ui.canvas-split`, `ui.detail-collapsed`, `ui.workspace-view`) so existing projects open as before; the canvas takeover stays as it is in this milestone.
- Acceptance:
  - [ ] `check:workbench`, `check:stage` and `check:hfl` pass (once, before the commit)
  - [ ] Existing page, desk, history and clip tests pass; new tests: an old project opens in the screenset that reproduces today's look; flipping screensets keeps the desk, canvas and every module editor mounted (outputs still publish); reload restores the active screenset; sending the desk to the bottom docker survives reload
  - [ ] `DECISIONS.md` rows: layout per project and the key move, supersedes the project-state layout keys
  - [ ] `shell/ARCHITECTURE.md` updated (layers, who consumes what)
- Human checkpoint after: **yes** (the human uses the whole workbench: same behaviour, new screenset tabs, rearranging; judges look)
- Checkpoint decisions (the human, 2026-11-18):
  - An existing project opens as before; flipping Canvas, Desk and Edit works; rearranging (drag, Send to, Panels menu) is "great"; reload restores the layout. M5 accepted.
  - Defect to fix: in a narrow window the footer screenset tabs are cut off. Wanted: show the active screenset plus a selector menu holding the others. Added to M7 (screenset UI polish).
  - New idea ("may be another goal"): dragging a tab onto a splitter creates a new docker there. BACKLOG `[stage]` (a shared `src/components/Stage/dock/` change); not in this arc unless the human adds it.
  - The builder choices and the test rewrites listed in PROGRESS M5 were not objected to; taken as accepted.

### M6: The piano roll and chord picker as independent panels
- Scope: owned workbench paths: the piano roll and the chord picker registered as panels with homes; the chord picker no longer lives inside the note clip editor; the editor's v1 Stage and the canvas takeover are removed (supersedes W-16 and W-25); `NoteClipEditor.stage.test.tsx`, `editorStage.test.ts` and the takeover cases in `ChordPickerHost.test.tsx`, `ChordPicker.test.tsx` and `NoteClipEditor.chords.test.tsx` are retired or rewritten (the design lists them; the orchestrator confirms the exact cases and tells the human); a one-time upgrade seeds the chord picker's docker for any screenset store that has no `chords` place (so a `chordHost` choice made between M5 and M6 is not lost); the Chords tool or hotkey shows the chord picker panel (open in its remembered docker) if it is not shown; closing the panel while the Chords tool is active leaves the tool (today's rule); with another tool the panel works in the placement mode from design 7.7; the old v1 `Stage` stays (the spike uses it); whether it and the old spike are removed is decided with the human at M8.
- Acceptance:
  - [x] `check:workbench`, `check:stage` and `check:hfl` pass (2026-11-18: workbench and stage green; `check:hfl` 4 lab page-test TIMEOUTS only (15-20 s) in a 462 s run under load; the lab imports nothing from the workbench and M6 touched no shared component: shell rule 14, not ours)
  - [x] Tests: the chord picker works with the piano roll in another docker; picker state survives moving it; the second consumer from M4 works on the page Stage; the Chords tool reopens the picker where the user last put it; old preferences open without loss
  - [x] `DECISIONS.md` rows superseding W-16 and W-25 (W-48; plus W-49 ready line, W-50 selection mode)
- Human checkpoint after: **yes** (chord input as before, plus rearranging; this also covers the combined review of M3b to M6)
- Scenario decisions (the human, 2026-11-18, on `SCENARIOS.M6.md`):
  - A rows and B1 to B3 accepted. D (test retirements and rewrites) OK; the exact list still goes to the human before the commit.
  - Choice 1 = **1b**: the Chords panel stays open when you leave the Chords tool, until you close it (selection mode reachable directly).
  - Choice 2 = **2a**: the takeover maps to a Chords tab in the Canvas docker. There are no saved projects, so the migration matters little. Refined after the M6a review (S4): in the **Desk** screenset the takeover seed is the **Tools** docker (the takeover never covered the desk); in Canvas and Edit it is the Canvas docker (option a).
  - Choice 3 = **3a**: each selected note is an anchor ("feels the most creative"). Same onset: **(i)**, every selected note gets its chord, and a pitch two chords share at the same onset is entered once.
  - After the M6b review (the human, 2026-11-18): **B2**: after an Insert in selection mode the selection stays on the notes the person had selected (not the inserted notes). **C2**: a tone is skipped only when another chord's tone has the same pitch at the same onset; overlaps that start at different onsets are both kept. Anchors are ordered by onset, then pitch. **Root mode with several notes: the same chord TYPE on each note** (each note as if clicked with the Chords tool; C major picked on C4 gives G-B-D on G4); common-tone mode keeps one harmony.
  - **Ready line (standardized):** the human agreed a standard "ready line" for any panel or module that waits for a mode, selection or input. M6 builds it in the workbench and uses it first on the Chords panel. It is recorded as the expected standard, as the lab did for tooltips (H-16, `HELP-FORMAT.md`): the format is in `arcs/workbench/READY-LINE.md`, which becomes a rules section of the workbench `ARCHITECTURE.md` plus a DECISIONS row in M6. Converting the modules' "Connect …" placeholder hints is a BACKLOG item. Moving it to `src/components/` is for when a second page uses it. Format approved 2026-11-18, with different icons for Waiting and No target and no ready line on the desk or canvas; the human said go for M6.
- Checkpoint decisions (the human, 2026-11-18): "everything is looking good"; M6 accepted (chord input, rearranging, selection mode, the ready line; also covers the combined review of M3b to M6; the retired-test list was shown). One quirk: in selection mode (pointer tool, a note selected) choosing a chord previews the audio but draws no ghost notes where the chord would go (the Chords tool does). This was the BACKLOG item "Ghost preview in chord selection mode". The human chose: build it now as **M6c**, ghosts **on every selected note** (exactly what Insert will add).

### M6c: Ghost preview in chord selection mode (added 2026-11-18, the human at the M6 checkpoint)
- Scope: owned workbench paths only. In selection mode (a claim whose tool is not Chords, notes selected), the roll draws ghost notes for the chord the picker would insert, on **every** selected note, computed by the same code Insert uses (each note as if clicked, same chord type in root mode, W-22 stack rule against existing notes, same-onset merge C2), so the ghosts are exactly what Insert adds. They follow the same picker events as anchor mode's ghosts (the chord under the pointer or keyboard focus in the picker, and the pinned chord), and clear when the selection empties, the chord is un-hovered or un-pinned, the tool changes, or after Insert. Anchor mode unchanged. The roll still knows nothing about the panel (ghosts arrive through the chord session and target).
- Acceptance:
  - [ ] Look first (human rule): the human looks at the thin slice before the reviewer, the gate or a commit
  - [ ] Tests: one note → ghosts equal the notes Insert then adds; C4 @ 1 and G4 @ 3 → ghosts on both; same-onset merge shows one ghost per pitch; nothing selected → no ghosts; anchor mode ghosts unchanged
  - [ ] `check:workbench` passes; DECISIONS W-50 text extended (ghosts in selection mode)
- Human checkpoint after: **yes** (look)
- Checkpoint decisions (the human, 2026-11-18, after looking): the ghosts work. Asked "do we want that chord<>clip roll link to always be active?". Chose: (1) **the pin resets on a new selection**: selecting different notes in selection mode clears the pinned chord, so a new selection shows no ghosts until a chord is hovered or clicked again (anchor mode unchanged); (2) **selection mode is off unless the Chords panel is visible**: with the panel closed or behind another tab, no ghosts and no Insert from the panel. Looked at again: "works perfect! lets commit and continue" (M6c accepted).

### M7: Pin modules, screenset UI polish and defaults
- Scope: a workbench module instance can be pinned into its own docker as a panel with a generated id `module:<instanceId>` (the module detail panel stays as the follower of the selected module); modules stay mounted to publish outputs; a screenset names its pinned instances (per project); add, rename, duplicate and delete screensets; sensible default screensets; when the footer is too narrow for every screenset tab, show the active screenset plus a selector menu with the rest (human, M5 checkpoint); the user's template library if the design's open item says so.
- Acceptance:
  - [ ] `check:workbench`, `check:stage` and `check:hfl` pass
  - [ ] Tests: two instances of the same module kind pinned side by side keep independent state and still publish; unpinning returns to the follower; screenset operations round-trip; deleting a project's screenset never removes a module
- Human checkpoint after: **yes**

### M8: Close-out
- Scope: decide with the human whether the old v1 `Stage` and the old spike are removed (and the `LayoutV1` rename); docs (workbench and shell `ARCHITECTURE.md`, `STAGE-ADOPTION.md`), BACKLOG items for what was deferred (the drops system, pop-out, the left inspector on the kit, the lab and the Stage, the roll scroll restore if still open, a template library if deferred), final checks, release all locks after their commits, archive the arc.
- Acceptance:
  - [ ] The arc's `Check command` passes; no locks left for this arc
  - [ ] Docs describe the final shape
- Human checkpoint after: no

### M9 (stretch, only if the human asks after M8): Pop-out
- Scope: a panel or tab can be popped out into a free-floating window inside the app, movable and resizable, persisted, closable and re-dockable (it returns to its remembered docker). It stays mounted once while it moves. `DECISIONS.md` row recording that this relaxes the earlier no-floating-windows rule and what limits it keeps (kept within the screen, never covers the header, one pop-out per panel).
- Acceptance:
  - [ ] `check:workbench`, `check:stage` and `check:hfl` pass
  - [ ] Tests: pop-out keeps panel state, re-dock returns to the remembered docker, a stored pop-out outside the screen comes back inside it
- Human checkpoint after: **yes**

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned or Shared paths, or to the `PianoRoll` or other shared components beyond opt-in props (`src/components/PianoRoll/` needs a lock, a `DECISIONS.md` row and the human's OK).
- A shared path needed is locked by another arc in `arcs/LOCKS.md`.
- The gate is red from another arc's unfinished work (shell rule 14).
- Any decision about look, density, the docker model and defaults, default screensets, tab behaviour, remembered-docker rules or feel not specified above (these go to the human at the M3, M3b, M5, M6 and M7 checkpoints).
- Starting pop-out (M9) without the human's explicit go-ahead.
- Retiring or rewriting an existing test (M5 and M6 list which).
- The state lift in M4 cannot keep every existing chord-input and `NoteClipEditor` test passing without weakening it.

## Budget
Max 2 builder attempts per milestone; then stop and report.
