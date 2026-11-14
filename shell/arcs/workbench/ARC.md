# ARC: One Stage for the workbench (panels with a home, reusable anywhere)

**Status: APPROVED by the human 2026-11-14** (drafted the same day; remembered placement, tab groups and the pop-out stretch added before approval; the three M1 pre-decisions below confirmed). Drafted after the chord-input arc closed (`ARC.chord-input.md`) and the Stage was adopted inside the note clip editor (W-23 to W-25). Background reading: `arcs/workbench/STAGE-ADOPTION.md` (terms and the current nesting), `src/pages/stage/ARCHITECTURE.md` section 13, `shell/BACKLOG.md` items tagged `[stage]`, `[shared]` Stage items and the `[workbench]` Stage adoption items.

## Goal
The workbench centre is arranged by one Stage instead of hand-built special cases. The top and bottom split, the desk and canvas sharing the top pane, the clip editor area and the canvas takeover all become **panels** placed by the same layout rules, so the user can send a panel somewhere else (for example the desk to the top half) without a code change. Standard proportions (the size classes and the 6rem unit) let panels slot together and nest.

Two ideas from the human (2026-11-14) shape the design:

1. **Standard proportions that slot and nest, not fixed slots.** The arrangement is data the user can change.
2. **Panels have a home, but are built to be reused.** A panel is written once, context-free, and declares where it normally lives (its **home**). It can also appear elsewhere. The chord picker is the example: today only inside the piano roll, but a future workbench module (a chord progression list constructor, say) should be able to use the same chord picker panel. So a panel must not depend on being inside the note clip editor.

3. **A panel remembers its preferred place.** If the user puts the chord picker in the bottom right and closes it, it goes away (and the space is released if nothing else is there); invoking it again (for example turning the Chords tool back on) reopens it in that bottom-right spot. Nothing to set in a menu: placing it once is the preference. (Close to what the note clip editor's Stage already does: closing the chord picker leaves the Chords tool and the saved arrangement keeps its place, W-25.)
4. **Tab groups, like Reaper's docker.** Any number of panels can share one slot as tabs (for example the file browser, a spectrograph and the connections panel in one slot), each reached by its tab. A tab can be brought to the front contextually when a tool or workbench module calls its panel up. This is different from today's stack, which splits a column vertically so panels are all visible at once.
5. **Stretch goal, not required: pop-out.** The user can pop a tab or panel out to a free-floating window.

That second point is what stops the piano roll, chord picker and canvas being independent today: the piano roll takes about 40 props closed over the note clip editor's state, and the chord session (anchor, ghost notes, voicing, mode, keyboard workflow W-20) lives in `NoteClipEditor`. This arc lifts that state out so a panel works wherever it is placed.

## Working assumptions (to be confirmed or changed at the M1 checkpoint, not decided yet)
- **Areas with homes, rather than free nesting.** The Stage gets a small fixed set of named areas (candidates: a top area, a main area, a bottom area; the inspector stays a region). Each area holds columns and stacks as the Stage does today. A panel declares a home area and can be sent to another. This is simpler than an arbitrary tree of rows and covers the top and bottom split. The alternative to weigh is rows of columns or a nested tree.
- **"Send to" menu on each header strip** (top, bottom, left, right, new column) comes first; dragging a strip to drop zones is a later option. Both operate on the same layout data, so dragging can be added without changing it.
- **Remembered placement is stored separately from the visible layout.** The visible layout lists only open panels; a small per-viewer map `panel id -> last place` (area, column, position, or the tab group it was in, plus width or share) is kept when a panel closes and used when it is reopened. If the remembered place no longer exists (the area is full, the column was removed), it falls back to the panel's home. A reset action clears the map. This keeps reopening smooth without a menu.
- **A tab group is a slot holding several panels with one active.** Stacks (all visible, vertical) and tab groups (one visible at a time) are two ways to put panels in a column. Activating a panel (by clicking its tab, or when a module calls it up) switches the group's active tab. Panels in inactive tabs stay mounted (mounted-once, STAGE-7), so they keep their state.
- **Calling a panel to the foreground needs the command channel** (`BACKLOG`: "Modules need a command channel"). M1 decides whether "show this panel" is one command of a general channel or a Stage API.
- **Pop-out is a stretch and is a deliberate change of an earlier rule.** The chord-input arc and the stage arc both ruled out free-floating, free-positioned windows (the only floating element allowed was a transient anchored popover). If the human wants pop-out it is a new kind of slot: a `DECISIONS.md` row is required and it is built only after the core milestones, behind its own checkpoint.
- **One layout format version bump**, with the existing parser migrating old layouts (the Stage and the clip editor's `hrifa.stage.layout.workbench-editor.v1` both load without loss).
- **A panel instance is by id, with at most one instance per id per Stage** unless M1 decides multiple instances are needed (the chord picker used by two hosts at once would need it).

## Parameters
- Stack: React 19 + Vite + Mantine, TypeScript, shell theme roles only (`src/theme/THEMING.md`). The Stage contract stays: a panel receives only its size class; panels are mounted once and keep state when moved (STAGE-7).
- Persistence: layout and per-viewer choices under `hrifa.stage.` keys only; existing keys and the saved `chordHost` / `chordDockWidth` migration keep working.
- Behaviour that must not change: chord input (hover ghosts, audition, insert, W-20 keyboard workflow, Esc), clip editing, undo and history, the desk, Scale Explorer and other pages.
- Owned paths: `src/pages/composition-workbench/**` (the page folder and its tests, its `ARCHITECTURE.md`, new files such as `panels/` and a chord session module), `arcs/workbench/` files (`ARC.md`, `PROGRESS.md`, archives, `STAGE-ADOPTION.md`).
- Shared paths it may touch (each needs a row in `arcs/LOCKS.md`, written by the orchestrator): `src/components/Stage/` and `src/lib/stage/` (layout format, areas, Send-to menu; the stage arc is finished, so these are shared paths: lock plus a `DECISIONS.md` row), `src/pages/stage/` (the `/stage` spike keeps working and is the test bed), `src/components/InspectorKit/` (only if a kit change is needed), `src/components/PianoRoll/` (opt-in props only, if the piano roll panel needs them: stop and ask first), `src/pages/CompositionWorkbench.page.tsx` (entry file: the page-level Stage), `shell/ARCHITECTURE.md`, `package.json` (only if a new check script is needed), `DECISIONS.md`/`BACKLOG.md` (no lock). `src/pages/harmonic-field-lab/` and `src/lib/harmonic-field/` belong to another arc and are not edited.
- Check command: `corepack yarn check:workbench` and `corepack yarn check:stage` (both exist; run both at each milestone, once, before the commit). Also `check:hfl` before committing a change to the Stage, kit or `src/components/` (the lab is a consumer of shared components).
- Concurrency: same checkout and branch as the other arcs; the orchestrator commits at the end of every milestone with path-scoped `git add <paths>` and `git commit -- <paths>` only (never `git add -A` or a bare `git commit`; on an `index.lock` error retry, never delete the lock) and removes lock rows only after that commit; after writing a lock row re-read `arcs/LOCKS.md`; use the existing DECISIONS prefix `W-` (next free id).

## Preconditions
- `check:workbench` and `check:stage` exist and are green before the first code milestone. If red only because of another arc's unfinished files, stop, report and wait (shell rule 14).
- Owned and locked paths are clean before each builder brief.

## Non-goals
- No new chord or musical features; chord-input behaviour is preserved, not extended.
- No rebuild of the workbench inspector on the kit (`BACKLOG`, later), and no change to the harmonic field lab.
- No free-floating or free-positioned windows in the core milestones; the only floating element stays a transient anchored popover. Pop-out is the stretch milestone M8 and needs the human's explicit go-ahead and a `DECISIONS.md` row (it relaxes an earlier rule).
- No change to the pitch, time or edit contracts (`shell/ARCHITECTURE.md`, shared contracts).
- The `/stage` spike page stays until the human decides to remove it.

## Milestones
Each milestone is small enough for one builder run and has criteria a command or test can check.

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, and `arcs/LOCKS.md`; note who imports the Stage, kit and `NoteClipEditor`; record in PROGRESS.md.
- Acceptance:
  - [ ] PROGRESS.md notes the scan result (other arcs, locks, relevant decisions and backlog)
- Human checkpoint after: no

### M1: Design: panels with a home, areas, Send-to (a document and a mock, no production code)
- Pre-decisions (human, 2026-11-14, at approval): a stack can contain a tab group (a tab group can be one member of a stack); when the last tab of a group closes the group and its space are released like any closed panel; one instance of each panel id per Stage by default, with multiple instances only if M1 finds a case that needs them. Everything else in "Working assumptions" is still to be confirmed at the M1 checkpoint.
- Scope: owned `arcs/workbench/` and `src/pages/composition-workbench/ARCHITECTURE.md` only. Write down the panel model (home, reuse, one or many instances, what a host must provide), the layout model options (areas with homes versus rows versus a tree), how the current workbench centre maps onto it (desk, canvas, clip editor area, workbench modules, canvas takeover, inspector as a region), the Send-to menu behaviour, and what must move out of `NoteClipEditor` (the chord session, the piano roll props, the reveal command, selection) with a proposed boundary (a session hook or store, a command channel, one selection model). Also design: the remembered-placement map (what is stored, fallback rules, reset), tab groups (how a panel joins or leaves a group, the active tab, calling a panel to the front, how this combines with stacks), and whether pop-out is wanted and what it would need (a floating slot, window bounds, persistence, what happens when the page is narrow). Optionally a throwaway HTML mock outside the repo. List the open questions with a recommendation each.
- Acceptance:
  - [ ] A design section in the page `ARCHITECTURE.md` or `arcs/workbench/` with the models above and the questions
  - [ ] Every `[stage]` and `[shared]` backlog item that this arc must resolve is mapped to a milestone or explicitly deferred
  - [ ] The three added ideas (remembered placement, tab groups, pop-out) each have a recommendation and an in-scope or deferred decision
- Human checkpoint after: **yes** (vocabulary, area set, Send-to versus drag, instance model and the state boundary are the human's decisions)
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
  - The human states the vision plainly: "I have this vision for the app. I feel like we can achieve it." Treat the design as a foundation for that vision, not only the current workbench.

### M2: Layout core: areas and migration (pure TS)
- Scope: `src/lib/stage/` under a lock: the chosen layout model, operations (send a panel to an area or position, stack, resize across areas), tab groups (add a panel to a group, set the active tab, remove), the remembered-placement map (record a place when a panel closes, resolve it on reopen with the home fallback, reset), parsing with a version bump and migration of the current layout, tests. No React.
- Acceptance:
  - [ ] `check:stage` passes
  - [ ] Tests: an old stored layout and the clip editor's saved layout load without loss; sending a panel between areas keeps all panels; minimum sizes are respected; unknown panel ids are dropped
  - [ ] Tests: closing a panel and reopening it restores its previous place; a remembered place that no longer fits falls back to the home; closing the last panel in an area releases the area's space; a tab group's active tab survives reload
  - [ ] `DECISIONS.md` row for the layout format
- Human checkpoint after: no

### M3: Stage component: areas, Send-to menu, spike updated
- Scope: `src/components/Stage/` and `src/pages/stage/` under locks: render areas, the Send-to menu on each header strip (keyboard reachable), the hidden-panel switcher in the component, which column or panel fills the spare width (the human prefers the piano roll flexing), a non-closable flag, tab groups (tabs in the header strip, keyboard reachable, a panel can be moved into or out of a group with the Send-to menu), opening a closed panel in its remembered place, and the `/stage` spike showing a top and bottom arrangement, a tab group and a close-and-reopen. Panels stay mounted once across areas and across tabs.
- Acceptance:
  - [ ] `check:stage` and `check:hfl` pass (and `check:workbench`, a consumer)
  - [ ] Tests: a panel keeps its state when sent between areas and when its tab is inactive; Send-to works by keyboard; the hidden-panel switcher brings a hidden panel back; a panel closed from the bottom right reopens there; calling an inactive tab's panel up (the command) switches the active tab
- Human checkpoint after: **yes** (the human tries it at `/stage`: moving a panel between top and bottom, resizing, grouping panels into tabs, closing and reopening a panel in its spot, reload)

### M4: Chord session out of the note clip editor (no UI change)
- Scope: owned workbench paths: move the chord session (anchor, pinned and hover ghosts, voicing, mode, tier, continuous, override, keyboard workflow W-20, audition) out of `NoteClipEditor` into a session hook or store that any host can use; decide the reveal command channel and selection model per the M1 decisions. The note clip editor keeps working exactly as today by using it.
- Acceptance:
  - [ ] `check:workbench` passes; all existing chord-input and `NoteClipEditor` tests pass without weakened assertions
  - [ ] A second consumer exists in a test or spike (for example a minimal chord progression list that uses the chord picker panel and the session without the piano roll)
  - [ ] `DECISIONS.md` row for the session boundary and the command channel
- Human checkpoint after: no

### M5: Piano roll, chord picker and canvas as independent panels
- Scope: owned workbench paths: the piano roll panel, the chord picker panel and the canvas panel each registered with a home area and a size contract; the chord picker no longer needs to be inside the piano roll; the note clip editor's own Stage (W-25) is replaced by the panels in the page Stage. Defaults reproduce today's arrangement.
- Acceptance:
  - [ ] `check:workbench` and `check:stage` pass
  - [ ] Tests: the chord picker panel works with the piano roll in another area; picker state survives moving it; the takeover is replaced by sending the chord picker panel to the canvas area; old stored `chordHost` and `chordDockWidth` preferences open without loss
- Human checkpoint after: no

### M6: The workbench page on the Stage (replaces `SplitStage` and the takeover)
- Scope: `src/pages/CompositionWorkbench.page.tsx` (lock) and owned workbench paths: desk, canvas, clip editor area and workbench modules become panels in areas; `SplitStage`, `ClipEditorSlot` and `canvasTakeover` are replaced; default layout equals today's look (desk or canvas on top, clip editor and modules below); the user can send any panel to another area. Tools reopen their panel in its remembered place (the Chords tool reopens the chord picker where the user last put it).
- Acceptance:
  - [ ] `check:workbench`, `check:stage` and `check:hfl` pass (once, before the commit)
  - [ ] Existing page, desk, history and clip tests pass; new tests: sending the desk to the bottom and the clip editor to the top, reload restores it; an old session opens with the default layout
  - [ ] `shell/ARCHITECTURE.md` updated (layers, who consumes what); `STAGE-ADOPTION.md` updated
- Human checkpoint after: **yes** (the human uses the whole workbench: same behaviour, new arrangement freedom; also judges look)
- Checkpoint decisions: <written back by the orchestrator>

### M7: Close-out
- Scope: docs, BACKLOG items for what was deferred (inspector on the kit, the lab and the Stage, roll scroll restore if still open, drag to drop zones), final checks, release all locks after their commits, archive the arc.
- Acceptance:
  - [ ] The arc's `Check command` passes; no locks left for this arc
  - [ ] Docs describe the final shape
- Human checkpoint after: no

### M8 (stretch, only if the human asks after M6): Pop-out
- Scope: a panel or tab can be popped out into a free-floating window inside the app (not a browser window unless M1 says so), movable and resizable, persisted per viewer, closable and re-dockable (it returns to its remembered place). It stays mounted once while it moves. `DECISIONS.md` row recording that this relaxes the earlier no-floating-windows rule and what limits it keeps (kept within the screen, never covers the header, one pop-out per panel).
- Acceptance:
  - [ ] `check:workbench`, `check:stage` and `check:hfl` pass
  - [ ] Tests: pop-out keeps panel state, re-dock returns to the remembered place, a stored pop-out outside the screen comes back inside it
- Human checkpoint after: **yes**

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned or Shared paths, or to the `PianoRoll` or other shared components beyond opt-in props (`src/components/PianoRoll/` needs a lock, a `DECISIONS.md` row and the human's OK).
- A shared path needed is locked by another arc in `arcs/LOCKS.md`.
- The gate is red from another arc's unfinished work (shell rule 14).
- Any decision about look, density, the set of areas, instance model, tab behaviour, remembered-placement rules or feel not specified above (these go to the human at M1, M3 and M6).
- Starting pop-out (M8) without the human's explicit go-ahead.
- The state lift in M4 cannot keep every existing chord-input and `NoteClipEditor` test passing without weakening it.

## Budget
Max 2 builder attempts per milestone; then stop and report.
