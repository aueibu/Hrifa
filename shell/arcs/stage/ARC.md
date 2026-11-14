# ARC: Stage (module slots, sizes and the inspector kit)

**Status: APPROVED (2026-11-13), with three edits from the human: the word is "size" (not "shape"), the DECISIONS prefix is the word `STAGE`, and stand-in modules in the spike are fine.** Source of the ideas: `C:\Data Files\Projects\Hrifa\_Ideas\Workbench-UI-Musings.md` (a handoff from a design conversation; most of it is Claude-proposed, only the human's own statements there are decisions) and the conversation that followed (decisions below).

## Goal
The workbench's centre (today: canvas, desk, piano roll and the chord picker, arranged by hardcoded special cases) gets a layout system that no module has to be designed around. When this arc is done there is a tried, documented way for a module to live in a **slot** on the **Stage**, to be moved or stacked by the user, and to render itself for the **size** of the slot it is given (wide, tall, compact, ...), the way a module already renders for light and dark. There is also an **inspector kit**: a small set of shared pieces and fixed sizes (header strip, name/value row, number cell, switch-style toggle, field sizes, spacing and density) so a new module's panel looks like its neighbours without anyone trimming it by hand.

The aim is to remove the fear of lock-in: layouts are saved data, modules only receive a size, and the arrangement style (stacks, tiles, tabs) can change later without rewriting modules. This arc builds and proves the system in new folders with a throwaway spike page. It does **not** migrate the workbench or the lab; that is a decision at the end (M6) for after the chord-input arc finishes.

## Vocabulary (proposed 2026-11-13; confirmed or changed at the M1 checkpoint)
- **Region**: a permanent part of the screen. Today: **Inspector** (left) and **Stage** (centre).
- **Module**: a self-contained view (piano roll, desk/canvas, chord picker, lineage graph, a lab panel).
- **Slot**: a place on the Stage that holds one module. Slots stack and move.
- **Layout**: the arrangement of slots, plain serialisable data.
- **Size**: the proportions of the room a slot gives its module, as named size classes along each axis (e.g. narrow / regular / wide by short / regular / tall), measured from the slot itself, not from the window. A module declares the sizes it supports and renders differently per size. It never knows where it sits.

## Decisions already taken (from the human)
- Modules must not be designed around a layout. A module is layout-agnostic: it receives a size class. (2026-11-13)
- The Inspector stays a region whose content follows what is selected; its look is standardised by the kit rather than redesigned as a layout. Folded into this arc, not a separate one. (2026-11-13)
- Keep what the lab does well: its **spacing and density**, and its **switch-style toggle buttons** for binary options. The kit takes its measurements from the lab (`panels.module.css`, `lab.module.css`, `ui.tsx`). Column width standardisation is useful but secondary. (2026-11-13)
- Panels keep **splitters** for small adjustments (the lab's stacked-column splitters are the model). Exact behaviour comes out as we go. (2026-11-13)
- Start by learning from the harmonic-field-lab's panel system (done as a read-only audit on 2026-11-13: pure `state/layout.ts` with pin/stack/move/splitter rules, `PinnedColumn`, header strip with injected move/stack buttons, `fitColumns` by width; no size awareness, hardcoded `PanelId` union, page-local). (2026-11-13)
- Floating, free-positioned, draggable windows are out (carried over from the chord-input arc's host rules); the only floating element allowed is a transient anchored popover. A new kind of slot is a deliberate decision logged in `DECISIONS.md`.

## Parameters
- Stack: React 19 + Vite + Mantine, TypeScript, shell theme roles only (`src/theme/THEMING.md`: `--panel`, `--text-muted`, `--mark-<hue>`; no hex, no palette shades).
- **No edits to the workbench page folder or the lab page folder or `src/lib/harmonic-field/`** (both arcs are active). Reads are free. The spike may import the shared `PianoRoll` (consume only; no `src/components/` edits without a lock). It does not import workbench or lab modules; stand-in modules are written here, so the active arcs cannot break the spike and the spike cannot break them.
- Persistence: layout and per-viewer choices under the key prefix `hrifa.stage.` (own keys; no page reads another page's keys; see `shell/ARCHITECTURE.md`, "Persistence boundaries").
- Sizes are a small named set decided at M1 (starting proposal: width classes `narrow` < ~24rem, `regular`, `wide` > ~40rem; height classes `short`, `regular`, `tall`), measured with a `ResizeObserver` on the slot and exposed as a hook and as a `data-slot-size` attribute for CSS. Thresholds are tokens, not scattered numbers.
- Module contract (proposed): `{ id, title, sizes: supported size set, minSize, render(size) }`, registered in a registry (open set of ids, not a hardcoded union).
- Layout core is pure TS with no React and no storage (like the lab's `layout.ts`), with a parser that migrates old stored layouts.

- Owned paths: `src/lib/stage/` (new: pure layout rules, size classes, registry types, tests), `src/pages/stage/` (new: Stage and slot components, splitters, the inspector kit, stand-in modules, spike page modules, tests, the page's own `ARCHITECTURE.md`), `arcs/stage/`.
- Shared paths it may touch (each needs a row in `arcs/LOCKS.md`, written by the orchestrator): `package.json` (setup only: add `check:stage`); `src/pages/Stage.page.tsx` (standing shared entry file, created in the first code milestone), `src/Router.tsx` and `src/data/applets.ts` (registration of the spike page); `shell/ARCHITECTURE.md` (add the new layers and, at M6, the contract); `src/components/` and `src/theme/` only at M6, and only if the human decides to promote the kit or add a theme role. `DECISIONS.md` and `BACKLOG.md` need no lock for our own rows.
- Check command: `corepack yarn check:stage` (to be created at setup, modelled on `check:hfl`: `npm run typecheck`, then `oxfmt --check` and `oxlint` scoped to `src/lib/stage` and `src/pages/stage` with `--no-error-on-unmatched-pattern`, stylelint scoped with `--allow-empty-input`, `vitest run --passWithNoTests src/lib/stage src/pages/stage`). If `corepack` is not on PATH: `node .yarn/releases/yarn-4.18.0.cjs run check:stage` from `shell/`.
- Concurrency: same checkout and branch as the other arcs; the orchestrator commits at the end of every milestone with path-scoped `git add <paths>` and `git commit -- <paths>` only (never `git add -A` or a bare `git commit`; on an `index.lock` error retry, never delete the lock) and removes lock rows only after that commit; after writing a lock row re-read `arcs/LOCKS.md`. `DECISIONS.md` ids use the prefix `STAGE`, registered in this arc's first row.

## Preconditions
- `check:stage` exists and is green before M1's code (created at setup, with the empty-folder flags so it is green with no code). If missing or red, stop and report. Its `tsc --noEmit` step is project-wide: if it is red only because of files outside this arc's owned and locked paths (the chord-input and lab arcs are mid-flight), it is not this arc's to fix: stop, report, wait for their commit or the human.
- Owned and locked paths are clean before each builder brief.

## Non-goals
- No changes to the workbench, the lab, the theme roles, Scale Explorer or any existing page. No migration of any existing page in this arc.
- No tiling-window-manager engine, docking framework or free-form windows. The arrangement style stays deliberately small (columns, stacks, splitters) and replaceable.
- No new module features, no redesign of any module's content, no Bitwig/MIDI/score-model work from the handoff (separate arcs).
- No layout persistence beyond the spike's own `hrifa.stage.` keys; no per-project layouts yet.

## Milestones
Each milestone is small enough for one builder run and has criteria a command or test can check.

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/` (workbench chord input and harmonic-field-lab are active) and `arcs/LOCKS.md`. Note which pages import from the lab and workbench layout and styling code (none should import the lab's `state/layout.ts` or `ui.tsx` today). Re-read the lab's `state/layout.ts`, `components/Panels.tsx`, `components/ui.tsx` and the density-related parts of `lab.module.css`/`panels.module.css` and the workbench's `SplitStage.tsx`, `CompositionInspector.tsx`, `compactTheme.ts`, `ClipEditorSlot.tsx`, `canvasTakeover.tsx` for the M1 write-up. Record what other arcs own, what is locked, and any decision or backlog item that affects this arc (the roll/row and tuning items, the chord-input slots W-16/W-17, "Bring Melodicization and Mixer onto the new roll conventions").
- Acceptance:
  - [ ] PROGRESS.md notes the scan result (other arcs, locks, relevant decisions/backlog)
- Human checkpoint after: no

### M1: Vocabulary, module-size contract and kit measurements (documents only)
- Scope: `arcs/stage/` and `src/pages/stage/ARCHITECTURE.md` (start); `DECISIONS.md` rows (STAGE-1 registers prefix STAGE and records the vocabulary; STAGE-2 the module-size contract; STAGE-3 the "no free windows, only named slots" rule carried over). No code.
- Content: (a) the vocabulary above, finalised; (b) the size set and thresholds, with the reasons; (c) the module contract and what a module may not do (reach into its parent, read layout, assume a width); (d) a worked example on the chord picker (2x1 beside the roll, 3x1 above it) and on the roll; (e) **kit measurements taken from the lab**: row heights, gaps, paddings, font sizes, control sizes, the switch-style toggle spec, header strip spec, as named tokens with the file and line they came from; (f) a gap list: what the lab does not do that the Stage needs (size awareness, open registry, shared components).
- Acceptance:
  - [ ] The document exists and every token cites its source in the lab or workbench
  - [ ] `DECISIONS.md` rows STAGE-1 to STAGE-3 appended, prefix registered
  - [ ] No code or config changed (git diff shows only `arcs/stage/`, `src/pages/stage/ARCHITECTURE.md`, `DECISIONS.md`)
- Human checkpoint after: **yes** (vocabulary, size thresholds and the kit tokens are judged by the human)
- Checkpoint decisions (human, 2026-11-13, answers to Q1 to Q12 in `src/pages/stage/ARCHITECTURE.md` section 7; written by the orchestrator):
  - Q1: the vocabulary (region, module, slot, layout, size), the class names and `data-slot-size` are confirmed.
  - Q2/Q3: size thresholds come from ONE scale on both axes, multiples of a base unit, three tiers like the width tiers; the human wanted the standard-practice rationale. Proposed (awaiting the human's confirm): base unit U = 6rem (the minimum slot height); nominal sizes 4U/6U/8U = 24/36/48rem; class boundaries at 5U (30rem) and 7U (42rem), same for width (`narrow`/`regular`/`wide`) and height (`short`/`regular`/`tall`); minimum slot 2U wide by 1U high (12 x 6rem). The unit is for slot sizes only, not control sizes.
  - Q4: hysteresis wanted (0.5rem). Q5: measure the slot body border-box as proposed.
  - Q6: one tooltip style as proposed (300 wide, `position="top"`) but the open delay is 330 ms and is a developer option (the Stage's own per-viewer dev option under the `hrifa.stage.` prefix, default 330).
  - Q7: the kit has ONE toggle control, the pressed-button look (`aria-pressed`, accent fill when on) in place of Mantine `Switch`. Its label is one or two words naming what it toggles ("Active", "Enable"); longer meaning goes in the tooltip, never in the label.
  - Q8: one density, the lab's, to be honed later. Q9: one fixed row height, 1.625rem. Q10: one header strip shared by Stage slots and Inspector panels. Q11: kit numbers from the lab only; no workbench inspector comparison for now.
  - Q12: column-width splitters are wanted as well as the vertical stack splitters (for later adjustment and user preference); M2 layout data therefore holds column widths and M3 builds both kinds.

### M2: Layout core (pure TS)
- Scope: owned `src/lib/stage/`. Generalise the lab's `state/layout.ts` rules: an open set of panel/module ids instead of the `PanelId` union; columns of one to three slots; pin, unpin, move, stack, unstack, reorder within a stack; splitter shares and clamping; how many columns fit a width; `parseLayout` with a version field and migration; size classes from a width/height in px or rem as a pure function over the threshold tokens. No React, no DOM, no storage.
- Acceptance:
  - [ ] `check:stage` passes
  - [ ] Unit tests ported or rewritten from the lab's `layout.test.ts` cases (stack limits, share clamping, move at edges, narrow screen keeps the inner pair) and new cases for size classification at the boundary values and for an unknown module id in a stored layout (dropped, never a crash)
  - [ ] Nothing in `src/lib/stage/` imports React, a page or the lab
- Human checkpoint after: no

### M3: Stage, slots and the module contract (React) with a spike page
- Scope: owned `src/pages/stage/`; locked `src/pages/Stage.page.tsx`, `src/Router.tsx`, `src/data/applets.ts` (a route `/stage`, applet status `experimental`). The Stage renders a layout through the registry; each slot measures itself (`ResizeObserver`), passes the size to its module and sets `data-slot-size`; header strip with move/stack/unstack/close; splitters (pointer and keyboard) like the lab; layout saved under `hrifa.stage.layout.v1`. Two or three trivial stand-in modules that render visibly differently per size so the mechanism can be seen.
- Acceptance:
  - [ ] `check:stage` passes
  - [ ] Tests: a slot reports a new size when its container resizes (jsdom with a stubbed `ResizeObserver`); a module is mounted once per slot and keeps state when moved between columns; splitter drag and arrow-key nudge change shares within the clamp; a stored layout with a removed module id loads without it
  - [ ] Route registered; applet entry added; one `vite build` run and recorded in PROGRESS (not part of the gate)
  - [ ] `src/pages/stage/ARCHITECTURE.md` documents the contract; `shell/ARCHITECTURE.md` lists the new folders
- Human checkpoint after: **yes** (the human tries moving, stacking and resizing; feel is judged by eye and hand)
- Checkpoint decisions (human, 2026-11-14): tried `/stage` by hand; splitters, move/stack/unstack, resize and hidden-columns mode, light and dark, reset and reload all approved with no changes asked. M4 may start.

### M4: Inspector kit
- Scope: owned `src/pages/stage/kit/` (promoted later, see M6). The pieces named in M1(e), built to the measured tokens with theme roles only: header strip (title left, tools right), section with heading, name/value row, number cell, switch-style toggle (the lab's binary-option look), field sizes (text, number, select, segmented), a spacing/density scale with one named density setting, and a rule for where a panel's actions sit. A kit demo area on the spike page showing each piece at each density. Each piece is a thin wrapper over Mantine with the sizes fixed, not a new component library. Run each piece in light and dark.
- Acceptance:
  - [ ] `check:stage` passes
  - [ ] Tests for the behaviours that are not just styling (the toggle's accessible role and keyboard, the row's alignment contract, the density setting changing sizes through one token set)
  - [ ] No hex values or raw palette shades in the kit's CSS (stylelint passes); sizes come from named tokens defined once
  - [ ] A one-page "how to add a panel" in the page `ARCHITECTURE.md`: which pieces to use, which sizes are fixed, where actions go
- Human checkpoint after: **merged into M5's** (human decision 2026-11-14: M4 and M5 run back to back with one checkpoint after M5; density, look and the realistic-modules trial are judged together). M4 is still committed on its own at the end of its milestone.
- Checkpoint decisions: none separate; see M5.

### M5: Spike with realistic modules
- Scope: owned `src/pages/stage/` only. The spike page hosts: the shared `PianoRoll` (consumed with demo notes, opt-in props only) as a wide module; a canvas stand-in; a chord-picker stand-in that renders as a 2x1 beside the roll and as a 3x1 above it, from one component; an inspector region built entirely from the kit with panels for a selected note and a selected clip. Presets: two saved layouts switchable by keystroke or a small control, to try "sketch" and "audition" arrangements.
- Acceptance:
  - [ ] `check:stage` passes
  - [ ] The same chord-picker stand-in is tested in both sizes (one component, two renderings); moving it between the two positions loses no state
  - [ ] The consuming arc's check (`check:workbench`) is run once before commit if any `src/components/` file was touched (none planned; if one is needed, stop and ask)
  - [ ] PROGRESS.md records what felt bound or awkward, taken from the human's trial, to feed M6
- Human checkpoint after: **yes** (this is the real test of whether the system removes the lock-in worry; also covers M4's density and look)
- Checkpoint decisions (human, 2026-11-14, merged M4+M5 checkpoint; tried it through a tunnel):
  - Overall: looks good; rows line up in both densities, the chord picker keeps its state across presets, the inspector is liked.
  - Column widths: the last column fills the spare width (option 1); widths of the other columns stay fixed and splitters resize the column to their left. The human expects to hone a layout and then keep it.
  - Presets: make the default widths narrower so both fit about a 1366 px window. (Sketch and Audition were explained as two saved arrangements of the same modules, there to exercise one chord picker in two sizes.)
  - Density: keep only `compact`; drop `roomy` and the side-by-side density demo (less to manage).
  - Inspector: asked whether a note panel and a clip panel should be reserved or dynamic; orchestrator recommended dynamic (note panel with its clip's panel below, clip alone, or one hint); human agreed (2026-11-14) and chose top-down specificity: the clip's panel first, then the note's panel under it when a note is selected. Built in M5b.
  - Nothing felt bound or awkward.
  - Follow-up (M5c, human 2026-11-14): link the canvas and the roll in the spike (clicking a canvas clip scrolls the roll to its notes; selecting a note highlights its clip on the canvas), using the PianoRoll's existing props only; the unified clips-on-one-roll idea goes to BACKLOG `[workbench]` and M6.

### M6: Promotion and adoption plan (decision milestone)
- Scope: documents, plus `DECISIONS.md`/`BACKLOG.md` rows. Decide with the human: where the pure core and the kit live permanently (`src/lib/stage/` plus `src/components/` under a lock, or stay in a page folder), how the workbench centre and inspector would adopt it (which modules first, what happens to `SplitStage`, `ClipEditorSlot`, `canvasTakeover` and the chord-input slots W-16/W-17), how the lab would adopt or keep its own, and the order. Write the adoption plan as proposed follow-up arcs; do not start them. Confirm nothing else depends on the spike's throwaway parts.
- Acceptance:
  - [ ] `DECISIONS.md` row recording the promotion choice; `BACKLOG.md` items for each adoption step, tagged `[workbench]`, `[harmonic-field-lab]` or `[shared]`
  - [ ] `shell/ARCHITECTURE.md` updated (layers, "Who consumes what") if anything was promoted
  - [ ] If `src/components/` or `src/theme/` is touched, the lock was taken first and `check:workbench` and `check:hfl` are run before the commit
- Human checkpoint after: **yes**

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to `shell/ARCHITECTURE.md` or the page's own `ARCHITECTURE.md` contracts beyond what the milestone lists.
- A shared path needed is locked by another arc in `arcs/LOCKS.md`, or a file in the workbench or lab folders would have to change.
- The gate is red from another arc's unfinished work (shell rule 14): stop and report.
- Any decision about look, density, size thresholds or feel not specified above (these go to the human at the milestone checkpoints).
- A module in the spike would need to know its own position or the layout to work: that is a contract failure, stop and report rather than adding a back door.

## Budget
Max 2 builder attempts per milestone; then stop and report.
