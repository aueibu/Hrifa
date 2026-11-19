# The ready line (format draft, 2026-11-18)

The human (M6 scenarios, 2026-11-18): many panels and modules "are open and waiting but need a specific mode or selection to be used"; standardize where that text goes and what it means, and record it as the expected standard, as the lab did for tooltips (H-16, `arcs/harmonic-field-lab/HELP-FORMAT.md`).

This file is the design record. At M6 the settled rules move to a "Ready line" section of `src/pages/composition-workbench/ARCHITECTURE.md` (where this file disagrees later, ARCHITECTURE wins), with a DECISIONS row.

## 1. What it is
One line that says whether the panel's main action can happen now, and if so what it will do. It reports and never acts. It is not a tooltip, not a toast and not an error.

## 2. Where
- Directly under the panel's or module's header, above its controls. The same place in every panel.
- Always present while the panel has a main action, so it never appears or disappears and the layout never shifts (lab `UI-CONVENTIONS.md` section 1: no jumping or resizing on state change). A long text is cut with an ellipsis, and the full text goes in its tooltip.

## 3. Three states
| State | Says | Example (Chords panel) | Example (a module) |
| --- | --- | --- | --- |
| **Ready** | what the action will do, with counts | "Insert: one chord on each of 2 selected notes" / "Anchor: click in the roll" | "Publishing 12 onsets" |
| **Waiting** | the one thing needed next, as an instruction | "Select a note, or use the Chords tool" | "Connect a rhythm" |
| **No target** | why nothing can happen here now | "No target: open a clip to insert" | "No target: nothing is routed to this module" |

- Ready is plain text. Waiting and No target are muted plus an icon, so the state is not shown by color alone.
- The wording starts with the mode or action name the user can find on screen (bold, as in the lab's help format).

## 4. What it does
- The action's buttons are disabled with the **same** reason as their tooltip, from the same value: the line and the button never disagree (one function returns `{ state, text }` and both read it).
- Things that never need a target (audition, preview) are not blocked by Waiting or No target.
- Screen readers: the line is a polite live region and is announced only when its state changes, not on every count change.

## 5. Scope and rollout
- M6: the component and its rules live in the workbench (`src/pages/composition-workbench/`); the Chords panel is the first user.
- BACKLOG: replace the modules' "Connect …" select placeholders (Arithmetic, Householder, Melodicization, Mixer, Rhythm Edit, Scale Evolution) with the ready line.
- Shared: moving it to `src/components/` (a lock and a DECISIONS row) happens when a second page needs it; the lab and Affine Focus would then adopt it as they adopted `UI-CONVENTIONS.md`.

## 6. Decided (the human, 2026-11-18)
- Waiting and No target use **different icons** (Waiting: fixable here; No target: go somewhere else first).
- Panels with no single main action (the desk, the canvas) have **no ready line**.
- The format above is approved as the standard for M6.
