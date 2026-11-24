# UI rules (standing; read before ANY UI work in shell/)

These are the human's standing rules, collected so nobody has to repeat them in a brief. A builder brief for UI says "read `shell/UI-RULES.md`" and adds only what is specific to the task. Where a rule here and an old arc note disagree, this file wins. The harmonic lab's older, lab-specific details are in `arcs/harmonic-field-lab/UI-CONVENTIONS.md` (type scale, cards, tooltips); they apply to the lab only.

## 1. Smooth, no jumping (the human's meaning, 2026-11-24)
"No jumping text" means **no flicker and nothing that pops or jerks** when a state changes. It does NOT mean nothing may ever move.
- Fine: scrolling; lists that grow because the person added something; panels resized by the person; animated expand and collapse; a value that changes in place.
- Not fine: text or boxes that shift, reflow or pop because a value, toggle, hover, selection or empty/filled state changed; a panel that unmounts and remounts (a flash); a message that appears in the flow and pushes content down; a number that changes width and nudges its neighbors.
- How: give changing values a stable box (fixed or minimum width, tabular numerals); an empty state is the same box with nothing in it; transient messages are overlays or sit in a slot that is always there; crossfade instead of snapping; disable a control with the reason as its hover text instead of hiding it when hiding would shift its neighbors; keep components mounted when only their content changes.
- Check the whole page for this, not only the element you touched, and judge it in a real browser when you can (a state change that flickers is a bug even if the tests pass).

## 2. The page fits the window
The window never scrolls as a whole. Every panel scrolls its own contents.

## 3. Reuse, never invent
- When a new view should look or behave like an existing one, open that component and its CSS first and reuse its exact classes, sizes and values (or import the shared piece). Never write "look at X for conventions" and let the builder choose, and never invent dimensions, chips, toggles or chart colors: grep for the existing control of that kind and copy it. A sentence in a doc is not a substitute for the component.
- Colors come from theme roles (`src/theme/THEMING.md`: `--panel`, `--text-muted`, `--mark-<hue>`), never palette shades or hex values.
- Inspector panels use the shared kit (header strip, name/value row, number cell, switch, field sizes); settings and panels live in a fixed place (Blender-style properties, no "data-block" label noise).

## 4. Words
Exact, plain control names ("Add Empty", "Make Single User", "Loop"), American spelling, no jargon in labels. Blender's vocabulary where the workbench has adopted it (`arcs/workbench/VOCABULARY.md`). In JI and pitch-set contexts never use tonal words (major, minor, triad, inversion): use a:b:c, 1/(a:b:c), monzos, midicents.

## 5. State and feedback
- A panel whose main action waits for a selection or input has the **ready line** (`ARCHITECTURE.md`, "Ready line"). An action that cannot run now is disabled with the reason as its hover text.
- Nothing sounds without the person asking (no auto-play, and an agent never presses Play in the person's browser without asking).
- What is open stays open: deleting something never falls back to showing another thing; it leaves a blank placeholder.

## 6. How a look change is delivered
Thin slice first: the smallest working version, then STOP and tell the person exactly what to click and what to look at. No reviewer, gate, decision row or commit for a look until they have tried it. Ask design questions before building, with an example where the options differ and one recommendation, in plain words.

## 7. Briefing a builder for UI (orchestrator checklist)
1. Quote the human's own words about placement and behavior; mark any placement detail that is mine.
2. Name the reference component(s) with file and line, and the exact values to reuse.
3. State the layout shape the human gave (columns side by side, what scrolls).
4. Say "read `shell/UI-RULES.md`". Do not restate section 1 as "nothing moves".
