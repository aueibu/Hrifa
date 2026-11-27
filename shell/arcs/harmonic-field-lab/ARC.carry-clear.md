# ARC: Carry a scale between Cust and Rel, and Clear

## Goal
A scale pasted into Cust can be edited in Rel, and a scale from any other mode can be seen and edited in Cust. Cust and Rel each get a Clear button that leaves just `1/1` for a fresh start. Today, switching to Rel rebuilds from `gen.notes` (default `['1/1']`), so a pasted scale is lost, and switching to Cust shows whatever text was last typed there.

## Parameters
- Fixed inputs: no new stored fields. `gen.custom` (text) and `gen.notes` (pitch texts) already exist. `noteText` (`src/lib/harmonic-field/relativePitches.ts:299`) turns a field note back into text.
- Rules (the human's words, 2026-11-26):
  - "I'd click over to relative and then edit those values" (paste `1 3/2 1170/931 27/16 1755/931 729/512 142155/119168` into Cust, click Rel, edit there).
  - "just the reset for clear and rel" means Clear exists in Cust and Rel only; no per-mode defaults.
  - "in any other mode if you click to custom you see the current field's pitches in that box".
- Out of scope in this arc: a retype-in-place text box in Rel (Rel edits by remove then add).
- Owned paths: `src/pages/harmonic-field-lab/` (state, components, tests, its `ARCHITECTURE.md`), `arcs/harmonic-field-lab/`.
- Shared paths it may touch: `src/lib/harmonic-field/` only if a helper is missing (cross-arc: scale-explorer and the workbench import it, so lock and log it); `DECISIONS.md`/`BACKLOG.md` rows (no lock).
- Check command: `corepack yarn check:hfl` (existing script, kept under its older name).
- Concurrency: as in `shell/CLAUDE.md`, "Several arcs at once". `DECISIONS.md` ids keep the older prefix `H`.

## Preconditions
- `check:hfl` exists and is green before M1. If missing or red only because of other arcs' files, stop and report.

## Non-goals
- No change to generated modes' settings, no per-mode defaults, no new tab behavior beyond the two switches and Clear.

## Scenarios (confirm before M1)
Field = the active tab's notes. Reduction into the repeat is unchanged.

| # | Start | Action | Result |
|---|---|---|---|
| 1 | Cust, text `1 3/2 1170/931 27/16 1755/931 729/512 142155/119168` | click Rel | Rel's list is the 7 notes as typed (`1`, `3/2`, `1170/931`, ...); the Rel picker shows 7 notes |
| 2 | Rel with 5 notes, then Cust | click Cust | Cust's box shows those 5 as text, one per line |
| 3 | EDO 12 (12 notes) | click Cust | Cust's box shows the 12 pitches (cents, since EDO notes have no ratio) |
| 4 | Harmonic series (ratios) | click Cust | Cust's box shows the ratios |
| 5 | Cust with any text | click Clear | box holds `1/1`; field is 1 note |
| 6 | Rel with any notes | click Clear | list is `['1/1']`; field is 1 note |
| 7 | Rel (edited in 1), click Cust, then Rel again | switch back and forth | nothing is lost or reordered |
| 8 | Cust scale, click Rel, click Cust | round trip | Cust text equals the Rel notes, not the original paste if edited in Rel |

Open to confirm: in 3, is cents text the right Cust view for an EDO field? (Recommended: yes, it is the only exact text.)

## Milestones

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md` (last `H-` id), `BACKLOG.md`, the Status of every other arc, `arcs/LOCKS.md`, and the lab's own `ARCHITECTURE.md` on Relative and Custom. Note which pages import `src/lib/harmonic-field`.
- Acceptance:
  - [ ] PROGRESS.md notes the scan result
- Human checkpoint after: no

### M1: Carry and Clear (one builder run, about 100k tokens)
- Scope: `state/labState.ts` (`gen/method` handler about line 1254; a new `gen/clear` action), `components/GeneratorColumn.tsx` (Clear button in the `custom` and `relative` cases, lines 330 to 413), the lab's tests, its `ARCHITECTURE.md`. No stored record changes, so no consumer table.
- Behavior: on `gen/method` to `relative`, `notes` = the field's `noteText`s when coming from another method; to `custom`, `custom` = the field's pitch text one per line (without the `1/1` that `parseCustom` adds itself, and keeping `rep`). `gen/clear` sets `custom: ''` in Cust and `notes: ['1/1']` in Rel.
- Acceptance:
  - [ ] Scenarios 1 to 8 pass as tests (scenario 1 with the exact seven ratios)
  - [ ] Existing Relative and Custom tests still pass
  - [ ] `corepack yarn check:hfl` passes
  - [ ] Decision recorded in `DECISIONS.md` as `H-<n>`
- Human checkpoint after: yes (judged by use: paste, switch, Clear)

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside Owned or Shared paths, or to a documented contract.
- A shared path needed is locked by another arc.
- Any decision about look or taste not specified above (Clear button label and position).

## Budget
Max 2 builder attempts per milestone; then stop and report.
