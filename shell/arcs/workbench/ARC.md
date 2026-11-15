# ARC: One Stage for the workbench (named dockers, screensets, panels reusable anywhere)

**Status: approved by the human 2026-11-14; AMENDED the same day after the M1 checkpoint (named dockers on a split tree instead of fixed areas, screensets per project, drag docking and pinning in scope, a new milestone order). The amendment is awaiting the human's approval.** Drafted after the chord-input arc closed (`ARC.chord-input.md`) and the Stage was adopted inside the note clip editor (W-23 to W-25). Background reading: `arcs/workbench/DESIGN.one-stage.md` (the design: panel model, split tree, screensets, state boundary, migration, decisions D1 onward and open items), `arcs/workbench/RESEARCH.docking-layouts.md` (how other systems do it), `arcs/workbench/STAGE-ADOPTION.md` (terms and the current nesting), `src/pages/stage/ARCHITECTURE.md` section 13, `shell/BACKLOG.md` items tagged `[stage]`, `[shared]` Stage items and the `[workbench]` Stage adoption items.

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
  - [ ] `check:workbench` passes; every existing test passes without weakened assertions
  - [ ] Tests: the session resets per clip without remounting siblings; `reveal` and `focus` reach the roll; the selection chain resolves note to clip to project
  - [ ] `DECISIONS.md` row: the command channel and the selection chain
- Human checkpoint after: no

### M5: The workbench page on the new Stage
- Scope: `src/pages/CompositionWorkbench.page.tsx` (lock) and owned workbench paths, `shell/ARCHITECTURE.md` (lock): canvas, desk, a clip editor panel (which still contains its own v1 editor Stage with the piano roll and chord picker) and the module detail in dockers on the new Stage, REPLACING `SplitStage` and `ClipEditorSlot` (`SplitStage.test.tsx` is retired at M5 with the component, and the workspace-view case in `WorkbenchStatusBar.test.tsx` is rewritten for the meta-tabs; `src/pages/CompositionWorkbench.page.test.tsx` (outside the `check:workbench` scope) and `clipPanel.page.test.tsx` are run explicitly and must pass; the orchestrator lists the retired tests and tells the human); this milestone seeds `lastDocker.chords` from `chordHost` and `chordDockWidth`; the default screensets (derived from today's canvas and desk views and the current arrangement; Canvas, Desk and Edit; a Harmonic screenset waits for the lab panels; the design lists the contents) appear as meta-tabs at the bottom replacing the canvas and desk view tabs; seeding from old project state (`ui.canvas-split`, `ui.detail-collapsed`, `ui.workspace-view`) so existing projects open as before; the canvas takeover stays as it is in this milestone.
- Acceptance:
  - [ ] `check:workbench`, `check:stage` and `check:hfl` pass (once, before the commit)
  - [ ] Existing page, desk, history and clip tests pass; new tests: an old project opens in the screenset that reproduces today's look; flipping screensets keeps the desk, canvas and every module editor mounted (outputs still publish); reload restores the active screenset; sending the desk to the bottom docker survives reload
  - [ ] `DECISIONS.md` rows: layout per project and the key move, supersedes the project-state layout keys
  - [ ] `shell/ARCHITECTURE.md` updated (layers, who consumes what)
- Human checkpoint after: **yes** (the human uses the whole workbench: same behaviour, new screenset tabs, rearranging; judges look)
- Checkpoint decisions: <written back by the orchestrator>

### M6: The piano roll and chord picker as independent panels
- Scope: owned workbench paths: the piano roll and the chord picker registered as panels with homes; the chord picker no longer lives inside the note clip editor; the editor's v1 Stage and the canvas takeover are removed (supersedes W-16 and W-25); `NoteClipEditor.stage.test.tsx`, `editorStage.test.ts` and the takeover cases in `ChordPickerHost.test.tsx`, `ChordPicker.test.tsx` and `NoteClipEditor.chords.test.tsx` are retired or rewritten (the design lists them; the orchestrator confirms the exact cases and tells the human); a one-time upgrade seeds the chord picker's docker for any screenset store that has no `chords` place (so a `chordHost` choice made between M5 and M6 is not lost); the Chords tool or hotkey shows the chord picker panel (open in its remembered docker) if it is not shown; closing the panel while the Chords tool is active leaves the tool (today's rule); with another tool the panel works in the placement mode from design 7.7; the old v1 `Stage` stays (the spike uses it); whether it and the old spike are removed is decided with the human at M8.
- Acceptance:
  - [ ] `check:workbench`, `check:stage` and `check:hfl` pass
  - [ ] Tests: the chord picker works with the piano roll in another docker; picker state survives moving it; the second consumer from M4 works on the page Stage; the Chords tool reopens the picker where the user last put it; old preferences open without loss
  - [ ] `DECISIONS.md` rows superseding W-16 and W-25
- Human checkpoint after: **yes** (chord input as before, plus rearranging; this also covers the combined review of M3b to M6)
- Checkpoint decisions: <written back by the orchestrator>

### M7: Pin modules, screenset UI polish and defaults
- Scope: a workbench module instance can be pinned into its own docker as a panel with a generated id `module:<instanceId>` (the module detail panel stays as the follower of the selected module); modules stay mounted to publish outputs; a screenset names its pinned instances (per project); add, rename, duplicate and delete screensets; sensible default screensets; the user's template library if the design's open item says so.
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
