# Guided Handoff: Composition Workbench UI Precision & Space Utilization

**Target:** `shell/src/pages/composition-workbench/` (and shared `Stage` / `InspectorKit` if unlocked)  
**Aesthetic & Interaction Goal:** Maintain and sharpen the **Blender + Bitwig minimalist, high-precision** studio feel by unifying ad-hoc panels onto existing primitives, tightening outer chrome, and trimming visual noise.

---

## 0. Read Before Touching Any UI

1. **`shell/UI-RULES.md`** — Standing UI rules.
   - **Order of authority:** (1) Blender (UI, terminology, data models) → (2) Bitwig (footer hover help, transport, timeline, piano roll, audio) → (3) Human's ideas → (4) Existing repo plans/code.
   - **Rule §7 (Delivery):** *Thin slice first.* Deliver the smallest working visual/interaction slice, then **stop** and tell the human exactly what to click and inspect before running final gates or committing.
   - **Rule §6 (Reuse, never invent):** Reuse existing `InspectorKit`, `DockStage`, `DataBlockMenu`, and theme CSS variables (`--panel-*`, `--text*`, `--grid`).
2. **`shell/src/theme/THEMING.md`** — Studio tiers & visual rules:
   - **Separate by tier, not by line:** Use `--panel-well`, `--surface`, `--panel`, `--panel-slot`, `--panel-body`, `--panel-header`, `--grid`, `--chrome`. Never stack borders/dividers between regions.
   - **Screens vs. Controls:** Data displays (canvas, piano roll, arranger timeline, plots, previews) sit on `--panel-well` (`--panel-screen`). Controls sit on `--panel-slot` / `--chrome`.
   - **4-state toggle grammar:** Tab (`--panel-body` + `--text`), Switch (`--accent` fill), View toggle (no fill, `--accent` icon/label), Action (pressed only, no persistent active look).
   - **No decorative `box-shadow`** outside floating surfaces (menus, popovers, modals) and focus rings.
3. **Reference notes:** `shell/arcs/workbench/RESEARCH.blender.md` and `shell/arcs/workbench/RESEARCH.bitwig-note-editor.md`.
4. **Shared code locks:** If a slice touches `src/components/InspectorKit/`, `src/components/Stage/`, or `src/lib/stage/`, check `shell/arcs/LOCKS.md` first and run `npm run check:stage` alongside `npm run check:workbench`.

---

## 1. Thin-Slice Roadmap (Recommended Order)

Work through these one slice at a time, getting human sign-off after each slice.

### Slice 1: Tighten the Outer Frame & Top/Bottom Chrome
**Files:**
- `shell/src/pages/CompositionWorkbench.page.tsx`
- `shell/src/pages/composition-workbench/CompositionWorkbench.module.css`
- `shell/src/pages/composition-workbench/components/WorkbenchStatusBar.tsx`
- `shell/src/pages/composition-workbench/layout/workbenchWorkspaces.ts`

**What to do:**
- Remove the outer `padding="md"` on `AppShell` / `AppShell.Main` in `CompositionWorkbench.page.tsx` and update `.compositionWorkspace` height calculation so `DockStage` sits edge-to-edge against the header and status bar.
- Slim `AppShell.Header` (`height: 56` currently) toward a compact studio bar (`~36–40px`).
- Move `WorkspaceTabs` out of `WorkbenchStatusBar.tsx` (bottom-left) into the top header bar (Blender convention, as noted in `RESEARCH.blender.md`), leaving `WorkbenchStatusBar` strictly for Bitwig-style footer hover help (`data-info`), panel toggles, and `PanelsMenu`.
- Consider adding a default `Scene` / `Arrange` workspace in `workbenchWorkspaces.ts` (note: `Outliner`, `Properties`, and `Arranger` are currently Panels-menu-only and hidden from default workspaces).
- Fix the 4-state toggle grammar on `WorkbenchStatusBar` view toggles (`inspectorOpen`, `settingsOpen` currently use Mantine `variant="light"` instead of accent icon/text with no fill).

---

### Slice 2: Port `CompositionInspector` & `CompositionSettingsPanel` to `InspectorKit`
**Reference implementation:** `shell/src/components/InspectorKit/Kit.tsx` and `kit.module.css` (`KitScope`, `Panel`, `Strip`, `StripTool`, `Section`, `Row`, `Num`, `Toggle`, `Actions`, `Tip`).  
**Files:**
- `shell/src/pages/composition-workbench/components/CompositionInspector.tsx`
- `shell/src/pages/composition-workbench/components/CompositionInspector.module.css`
- `shell/src/pages/composition-workbench/components/CompositionSettingsPanel.tsx`
- `shell/src/pages/composition-workbench/components/CompositionSettingsPanel.module.css`

**What to do:**
- Wrap inspector and settings content in `KitScope` and replace ad-hoc Mantine `Stack` / `Title` / `Collapse` / `Chip` layouts with `InspectorKit` primitives (`Panel`, `Strip`, `Section`, `Row`, `Actions`, `Tip`).
- **Declutter prose:** Move static helper text (e.g., `"Select a cable to adjust..."`, `"Source material remains unchanged."`, and the EDO pitch-set explanation in `CompositionSettingsPanel.tsx`) into `data-info` attributes (for the Bitwig footer) or `Tip` popovers.
- **Tame destructive actions:** In `CompositionInspector.tsx` (`NodePart`), replace the full-width red `variant="light"` `"Remove {nodeName}"` button sitting mid-panel with a `StripTool` or a compact `Actions` row at the bottom.
- **Blender-style section folding:** Add `Ctrl+click` (solo-accordion) support to collapsible sections (`Part` in `CompositionInspector.tsx` or `Section` in `InspectorKit`).

---

### Slice 3: Bring Sidebars Under `DockStage` (or Resizable Splitters)
**Files:**
- `shell/src/pages/CompositionWorkbench.page.tsx`
- `shell/src/pages/composition-workbench/CompositionWorkbench.module.css`
- `shell/src/pages/composition-workbench/layout/workbenchPanels.tsx`
- `shell/src/pages/composition-workbench/layout/workbenchWorkspaces.ts`

**What to do:**
- Currently `.inspectorColumn` (`15–18rem`) and `.settingsColumn` (`16–20rem`) live outside `DockStage` as fixed CSS grid tracks.
- Evaluate registering `CompositionInspector` and `CompositionSettingsPanel` as `DockStage` panels (or giving them Stage-consistent splitters) so they can be resized, collapsed, swapped, or tabbed alongside `Outliner` and `Properties`.
- *Note:* Check `keepMounted` requirements if `nodeInspectorSlot` portals into `CompositionInspector`.

---

### Slice 4: Blender Area Ergonomics in `DockStage`
**Files:** `shell/src/components/Stage/dock/` (`DockStage.tsx`, `Docker.tsx`, `stageOps.ts`) — *requires `src/components/Stage/` lock in `arcs/LOCKS.md`.*

**What to do:**
- **Maximize Area** (temporary, non-persisted view state + `"Back to Previous"` chip in the top bar; avoid `Ctrl+Space` if it clashes with Windows IME, or check keybindings).
- **Focus Mode** (Maximize + hide header and status bar) for distraction-free `ArrangerPanel` or `PianoRoll` work.
- **Swap / Join Areas** in the docker menu and **Shift-drag** on splitters to move aligned borders together (`RESEARCH.blender.md` §8).

---

### Slice 5: Bitwig-Style Precision Numeric Controls
**Files:**
- `shell/src/components/InspectorKit/Kit.tsx` (`Num`)
- `shell/src/pages/composition-workbench/components/TransportBar.tsx`

**What to do:**
- Replace Mantine `NumberInput` stepper-arrow ergonomics with Bitwig-style precision interaction (`UI-RULES.md` §3):
  - Vertical drag to scrub value
  - `Shift+drag` for fine adjustment
  - Double-click to reset to default (or `Ctrl+click` / double-click to type exact value)
  - Fixed-width / `tabular-nums` container so changing numbers never jitter adjacent layout (`UI-RULES.md` §1).

---

## 2. Verification Commands

Run from `shell/`:

```powershell
# Workbench typecheck, format, lint, stylelint, and tests
npm run check:workbench

# If touching InspectorKit or Stage
npm run check:stage
```

Remember: **do not run final review gates or commit a look change** until the human has tried the thin slice in a real browser and signed off (`UI-RULES.md` §7).
