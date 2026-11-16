# Harmonic field lab: UI conventions as settled in the arc (draft for the next design discussion)

Written 2026-11-15 at the close of the arc from what the human decided while trying the working page. Everything here is observed behaviour, not yet a rule set: the next discussion (interactivity, styling standardisation, tooltip formats) should confirm, change or drop each item, then promote the survivors into a rules section of the page `ARCHITECTURE.md` or `src/theme/THEMING.md`.

Where each thing lives: `src/pages/harmonic-field-lab/` (`components/`, `state/`, `texts.ts`, `ARCHITECTURE.md`), CSS in `components/lab.module.css` and `components/panels.module.css`.

## 1. Stability: nothing moves
- A block never changes size or position because of its content or state. Transient messages are overlays (`+N outside`, the one idle hint), never lines in the flow.
- Numeric slots have fixed widths (`ch` units) with tabular numerals; placeholders occupy the same space as the real value (the idle Live roughness total reads `0.00`).
- A chart keeps one constant height in every state; label bands under the axis are part of that height.
- Show/hide uses opacity and `visibility` (space reserved), not `display`; the select checkbox on a shelf card appears on hover/focus with its space reserved and stays visible when checked.
- Placeholder layer and data layer are separate and crossfade; there is no snap between idle and live (hold, then fade out completely).
- Dash filler ("-----") is never used as placeholder text; empty slots are invisible but keep their width.

## 2. Cards (chord chips, positional rows, CPS chords, shelf slots, grouped cards)
- One card per row, every kind through one `ChordCard`; a ring on every card, with the root chevron (`ROOT_TIP`, `ROOT_ARM`, `ROOT_STROKE` in `ShelfPanel.tsx`).
- Two layouts by container width (about 30 rem): NARROW four lines (title and right stat; subtitle; pitches; steps), WIDE two rows. Height is a minimum that grows when values wrap; tunables are `--chord-card-*` custom properties.
- Title is the chord's name (the template name; renamable on a shelf slot); the subtitle is `<template> on <root> · N notes` (positional: `2-2 on 4`); pitches show as ratios when the field has them else cents with one decimal; steps read `steps a, b c`; the right stat is `exact` or the cents error in its severity colour, `#rank · score` for positional rows, `N notes` for CPS.
- Value lists wrap only between whole values with the unit glued to the last value, balanced (`ValueList`); never a lone `c`.
- A group of identical shapes is one card with a left-aligned `N roots` button row (like the composite Items button); the roots expand one tree level deeper.

## 3. Hierarchy
- Folder headers are tree-style: indent about 0.75 rem per level, a hairline guide line (existing border token) at each nested level, lighter type per level (level 1 bold, level 2 medium, level 3 regular and muted); counts on the same row, `n (m)` while shapes are grouped.
- Clicking a guide line folds its folder (a pointer shortcut, the header button is the accessible control).
- Collapse all and Expand all apply to every level including grouped roots; fold state is remembered per viewer.
- The top of the Chords panel (Sketch row, tolerance row, ladder, Collapse/Expand all, `Group shapes`) is always shown in full: it never shrinks or scrolls; only the lists below scroll, with `scrollbar-gutter: stable` and right padding.

## 4. Naming and tooltips (to be extended by the human)
- Labels stay short; explanations live in tooltips: `Field | Exact` (the chord from the field's own notes vs its true ratios), `Shape | Pitch` (score the shape at middle C, as the cards do, vs each note where it sounds), `Smoothest | Scale order`, `Group shapes`.
- The glossary is `texts.ts` (one entry per `TipKey`); native `title` text goes through `useNativeTitle` (it follows the Developer menu's tooltip option).
- Open: a standard tooltip format (what first, then an example, then the key if there is one), and which controls get one.

## 5. Colour and marks
- Roles, not hexes (`src/theme/THEMING.md`): sounding is `--mark-green`, the highlighted/hovered chord is `--mark-blue`, a hovered note is blue, a pinned note is muted, severity colours for cents error. Not-in-subset marks are dimmed SOLID lines (about 35 percent), not dashed; ghost marks (off-field sounding pitches) stay dashed.
- The root of a chord or subset is marked with the mode-root chevron wherever a ring is drawn (main ring, chord rings, composite ring on item hover).
- Selection/hover looks differ by medium on purpose (ring dot, strip line, dissonance mark); one shared look is not worth the lost legibility.

## 6. Type scale (M8k)
- Eight lab tokens on `:root`: `--lab-fs-tiny` 0.6875rem, `-small` 0.75rem, `-body` 0.8125rem, `-title` 0.875rem, `-glyph` 1rem, `-display` 1.5rem, SVG `--lab-svg-fs-small` 9, `--lab-svg-fs-label` 11; the guard test `typeScale.test.ts` fails on any other literal. Nothing below 0.6875rem (11 px).

## 7. Charts and labels
- Labels live in a band under the axis in up to three lanes with thin dashed leaders (`state/chartLabelLayout.ts`), shrink then drop, never overlap the curve; dropped names stay readable as the dot's hover title.
- Live roughness: sources in priority order sounding > hovered chord > hovered note > lingering last chord > pinned note > idle; tags `sounding`, `hover`, `note`, `last chord`, `pinned` as an overlay inside the chart frame.

## 8. Interaction
- Hover previews without sound; holding 1 plays the chord's own root, 4 plays it on the Sketch stepper root as it sits in the field (`Field`), 5 plays the exact ratios; hold 4/5 on a chip arms the Sketch (template only; the root never changes by arming).
- Melody keys move the Sketch root stepper; in the keyboard Chords mode they move it silently.
- Keys that will clash in the Workbench (digits, `v`, `[` `]`, `-` `=`, Alt+digit, `E` only while the send popup is open) are listed in `WORKBENCH-STEERING.md`.

## 9. How the human works (for the next session)
- Tries the working tree on the dev server and reports looks in short notes; wants the look changed exactly as asked, in small steps, with named tunable values.
- An "is it needed?" question is a request for an opinion, not an instruction to drop what was asked (see the memory note on requested features).
- Plain words, exact control names, numbered steps, one recommendation.
