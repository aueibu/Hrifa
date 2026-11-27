# PROGRESS: Carry a scale between Cust and Rel, and Clear

## Status
CLOSED 2026-11-26. M1 built, gated (`check:hfl` exit 0, 157 files, 2,510 tests) and tried by the human ("looks good"). Archived as `ARC.carry-clear.md` / `PROGRESS.carry-clear.md`.

## C0 (context scan, done informally)
- Other arcs: structure, stage, affine-focus, interval-placement, ratio-rhythm, workbench. None owns `src/pages/harmonic-field-lab/`; `arcs/LOCKS.md` had no rows.
- `src/lib/harmonic-field` untouched (`noteText` already exported).

## M1 result
- Done, as the human steered it step by step: Clear (Cust and Rel only, grayed out elsewhere), Cust to Rel carry (their exact seven ratios), Rel to Cust carry, Make cust (replaces Cust text and switches to Cust), method buttons `CPS | Rel | Cust`, no silent overwrite when leaving a generated mode.
- Changed from ARC.md: Clear empties the Cust text instead of writing `1/1` (the parser adds 1/1 itself); generated mode to Cust no longer carries automatically (Make cust does).
- Tests: `state/carryClear.test.ts` (10). Two old test problems fixed on the way: `HarmonicFieldLab.m8f.test.tsx` looked for a `textbox` that is now a `combobox`; `HarmonicFieldLab.library.test.tsx` had an unused `typeSlow`.
- Decision: `H-44` in `DECISIONS.md`.

## Left over
Merging Cust and Rel into one mode: `BACKLOG.md` [harmonic-field-lab] (human: not now).
