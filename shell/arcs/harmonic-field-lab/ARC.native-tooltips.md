# ARC: Lab native tooltips to Hint (the `title=` attributes first)

**COMPLETE 2026-11-16 after M1 (human scope cut), archived as `ARC.native-tooltips.md` / `PROGRESS.native-tooltips.md`.** M2, M3 and the optional overlay were dropped; the SVG `<title>`s wait on the unified help panel idea (BACKLOG).

Approved by the human 2026-11-16 (shell rule 16), as drafted. Workstream folder `arcs/harmonic-field-lab` (previous arc archived as `ARC.help-text.md`). Gate `check:hfl` and DECISIONS prefix `H` already exist (next id `H-17`), so there is no setup commit.

## Goal
The seven native `title=` tooltips left in the lab (found by a count on 2026-11-16) become styled `Hint` tooltips, so they get the same look (dynamic line first, glued units), the same delay and the same Developer on/off as every other tooltip. Then, as an optional milestone the human decides after a spike, an HTML tooltip anchored to an SVG element for the seven SVG `<title>`s.

## Parameters
Facts from the 2026-11-16 count (the lab's components, excluding `title` props that are headings):
- **`title=` attributes on a real element (7 sites, M1):** `GhostMarks.tsx:59` (`g.text`), `RoughnessView.tsx:121` (the live data span, fed by the `StatSlot` `title` prop at ~626: one site), `RoughnessView.tsx:407` ("Lower is smoother"), `:419` (the Shape explanation), `:427` (the Pitch explanation), `ShelfPanel.tsx:261` ("Computer key"), `TunerStrip.tsx:124` (`strip.caption`).
- **SVG `<title>` elements (7, M2 only, optional):** `DissonanceView.tsx:198,221`, `RoughnessView.tsx:490,552`, `RingStats.tsx:200`, `LatticePanel.tsx:157`, `ModeRoot.tsx:96` (`MODE_ROOT_TIP`).
- Not in scope: the ~43 `title` props on `Strip`, `FoldHead`, `Cluster`, `Section`, `ChordCard`, `Modal` (headings or card text, not tooltips).
- The tooltip rules are in the page `ARCHITECTURE.md`, "Help text: tooltips and glossary" (order: bold term, dynamic line, help, Keys, Example last; `Hint` and `LabTooltip`; the innermost tooltip wins; a `display: contents` host cannot carry a tooltip; a disabled button needs `.hintHost`). `Hint`'s `dynamic` string is not markup.
- Existing wording is kept verbatim unless the human rewords it; the human approves the wording of any tooltip text at the checkpoint (a before and after list, like `CHECKPOINT.M4.md`).

- Owned paths: `src/pages/harmonic-field-lab/` (components, tests, `texts.ts`, `ARCHITECTURE.md`), `arcs/harmonic-field-lab/`.
- Shared paths it may touch: none planned. `DECISIONS.md`/`BACKLOG.md` need no lock for our own rows.
- Check command: `corepack yarn check:hfl` (Node 24 portable copy on PATH, `VITEST_MAX_WORKERS=4`, see `shell/CLAUDE.md`).
- Concurrency: as the template (path-scoped commits, `H-` ids).
- **Gate policy (human, standing):** run `check:hfl` sparingly: builders run only the tests related to their files, reviewers never run it, the orchestrator runs it once per milestone before the commit, and nothing heavy runs alongside it.

## Checkpoint decisions
- **Approved as drafted (human, 2026-11-16).** The question about the Shape and Pitch explanations (`RoughnessView.tsx` ~419 and ~427) is settled by a finding at C0: the glossary's `shape` entry is about scale regularity (propriety, constant structure), NOT the Shape | Pitch roughness register, so no glossary link fits. They become `Hint`s with a bold `label` ("Shape", "Pitch") and the existing sentence verbatim as the `dynamic` line; the human reviews the wording at the M1 checkpoint.

- **Scope cut (human, 2026-11-16): this arc stops after M1.** "I don't want to go any further on this arc than M1. After the builder completes I think I am all done." M2 (the SVG spike), M3 and the optional overlay are DROPPED from this arc. The SVG `<title>`s stay as they are until the unified help panel idea (BACKLOG, "Unified help panel", logged the same day) is decided, because a panel would make per-mark bubbles unnecessary. After M1 the orchestrator runs the reviewer, the one gate and the commit, writes `CHECKPOINT.native-tooltips.md`, does the short close-out (BACKLOG item update, one line each in `ARCHITECTURE.md` and `UI-CONVENTIONS.md`) and archives the arc as `ARC.native-tooltips.md` / `PROGRESS.native-tooltips.md`.

## Preconditions
- `check:hfl` is green at the start (last run 2026-11-16: 95 files, 1412 tests).

## Non-goals
- No change to what any control does, to audio or to layout. The 43 heading props stay.
- The SVG overlay is NOT built unless the human approves it after the M2 spike.
- No new tooltips on controls that have none.

## Milestones

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, `arcs/LOCKS.md` and the other arcs' Status; confirm nothing outside the lab imports these files.
- Acceptance:
  - [ ] PROGRESS.md notes the scan result
- Human checkpoint after: no

### M1: The seven `title=` attributes become `Hint`
- Scope: the seven sites listed above, each wrapped in `Hint` with the existing text (`label` plus `dynamic`, or a glossary key where one exists: for example the Shape and Pitch explanations may belong to the `shape` entry). The `title` attribute is removed; every `aria-label` or visible text stays. A `RoughnessView` data span that is `data-layer` (it crossfades) must not change layout or the crossfade.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] No `title=` on a DOM element remains under `components/` except component props (a guard test reads the sources, like the existing `nativeTitle` guard)
  - [ ] Tooltips-off hides all seven; the nesting rule still holds where one sits inside another tooltip
  - [ ] The wording of each is listed before and after in `CHECKPOINT.native-tooltips.md`
- Human checkpoint after: yes (hover each; wording)

### M2 (optional): Spike an HTML tooltip on an SVG element
- Scope: one site only (`RingStats.tsx:200`, the ghost marks on the ring): wrap the SVG shape in `Hint`, keep its `aria-label`, measure the cost on the dense charts (`RoughnessView`, `DissonanceView`) with a throwaway count of tooltip instances, and report: does the anchor position correctly, do existing hover handlers still fire, what happens with many marks. Also describe the alternative (one shared tooltip per chart, nearest mark) with its change in hover behaviour.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] A report with numbers and a recommendation; no other SVG site is converted
- Human checkpoint after: yes (the human decides the approach for the other six)

### M3 (only if approved after M2): the remaining SVG `<title>`s
- Scope and acceptance written after the M2 decision; not started before.

### M4: Close-out
- Rules into the page `ARCHITECTURE.md` and `UI-CONVENTIONS.md` (one line each), the BACKLOG item "Native `title=` and SVG `<title>` tooltips" updated or removed, the arc archived as `ARC.native-tooltips.md` / `PROGRESS.native-tooltips.md`, two reviewers.
- Human checkpoint after: yes

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope or Owned paths, or to `shell/ARCHITECTURE.md` or the page's own `ARCHITECTURE.md` contracts.
- Any decision about look or wording not specified above.

## Budget
Max 2 builder attempts per milestone; then stop and report. One builder run is expected for M1 (seven sites), one small one for M2.
