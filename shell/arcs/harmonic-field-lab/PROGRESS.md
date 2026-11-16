# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: harmonic-field-lab, help text arc (`arcs/harmonic-field-lab`)
- Current milestone: M4 done, committed; human checkpoint pending
- State: awaiting human (wording of the 17 M4 entries; M3 look checks passed informally 2026-11-16)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup | ARC.md approved as drafted; PROGRESS.md created | no code, no gate | Gate policy: run `check:hfl` sparingly (see ARC.md "Checkpoint decisions"). No `package.json` change needed (`check:hfl` and prefix `H` exist). |
| C0 | Context scan done (2026-11-15), no code, no gate | n/a | See "C0 findings" below. |
| M1 | Format decided (2026-11-15): `HELP-FORMAT.md` written, ARC.md checkpoint decision added | no code, no gate | Open: the human's OK to add a shortcut table (sync of key bindings and help text) to M2 scope. DECISIONS `H-16` is written at M2 with the code contract. |

| M2 | Built (builder), reviewed (reviewer FAIL on wording drift, fixed by the orchestrator), gated | `check:hfl` green once: 94 files, 1294 tests | Review fixes: help wording of `playScale`, `holdToPlay`, `modes` restored to the confirmed text; lost `modes` fact ("one row per mode: the scale restarted from each degree") moved to teaching; "Keys:" label no longer italic; the guard now requires an Example in `help`; stale "5 key" comment fixed; `Object.hasOwn` lint fix. `H-16` appended. Open for the human: example-then-keys is the one order in both views (HELP-FORMAT section 2); the confirmed `holdToPlay` mockup showed keys first. Human checkpoint: look at the three entries in the running page (approved 2026-11-16, order changed to keys then example). |
| M3 | Built (builder), reviewed (reviewer: PASS-WITH-HUMAN-CHECK), follow-up builder for nested tooltips and review fixes, gated | `check:hfl` green on the second run: 95 files, 1302 tests (first run red: a mojibake of `−` in `ui.tsx` caused by the orchestrator's mutation check, repaired; and `previews.test` read a removed `title`) | All 15 `nativeTitle` sites now use `Hint` (new, `components/ui.tsx`); `useNativeTitle` removed; `LabTooltip` makes the innermost tooltip win when tooltips nest (mutation-checked: the nesting test fails without it); `keyRings` converted (S5). Order: term, dynamic, help, keys, example last; uniform colour (human, 2026-11-16). `H-16` amended. Human checkpoint pending: hover a modes tile (one bubble), a key ring, the disabled Reload button, and the four new labels the builder wrote ("Play this chord", "Reload as a new tab", "Chords here", "Hear this chord on any note"). Left native on purpose (M4 to M7 reviews): static `title=` in `RoughnessView`, `GhostMarks`, `Visualizer`, `TunerStrip` caption, `ShelfPanel` "Computer key". |
| M4 | Built (builder), reviewed (reviewer PASS-WITH-HUMAN-CHECK), review fixes by the orchestrator, gated | `check:hfl` green once: 95 files, 1323 tests | Converted 17 entries (16 top bar + `soundMenu`) to help + teaching; no fact lost (reviewer). Also in this commit: old-form entries now render through the same blocks (cut at `Example:`, sentences break after about 140 characters, `c`/`Hz` glued to their number: `legacyBlocks`, `sentenceLines`, `glueUnits` in `markup.ts`), chord-card tooltip fixed (`display: contents` host put it top-left; now on the two line boxes, labelled Pitches / Steps with `ValueList`), shortcut table grew (`,` `.` `[` `]` `=` `-`; Alt+1 to Alt+9 stays a literal). Text fixes where the old wording disagreed with the code: `soundMenu`, `glossary`. Examples the builder derived (human to approve): `linkedRootDefault`, `octShift`, and the linked-melody pair (now caveated "in Relative"). `H-16` amended. Human checkpoint: before and after wording of the 17 entries. |

## C0 findings
- **Importers:** nothing outside `src/pages/harmonic-field-lab/` imports `texts.ts` or the lab's `components/ui.tsx`, so the entry type and `Tip` can change inside the lab with no cross-arc effect.
- **Other arcs:** `stage` finished (M6 approved 2026-11-14); `structure` done (2026-11-12); `workbench` active, ready for M4b (clip editor session, input scope, selection chain), a different page. `arcs/LOCKS.md` has no active locks.
- **Decisions and backlog that touch this arc:** DECISIONS H-1..H-15 are the lab's; none concerns tooltips or the glossary. STAGE-10 (a tooltip delay for the Stage) is a separate setting and not the lab's `tooltipDelay`. BACKLOG: only "Dead code and glossary cleanup" (dead entries `scaleTable`, `methodParams`, `chordExact`, the word "snapshot"), which M4 to M7 and M8 absorb in part. No other arc reads lab text.
- **Existing tooltip pieces to reuse or keep green:** `Tip` and `useTooltipProps` / `useNativeTitle` in `components/ui.tsx`; Developer options `tooltips` (default on) and `tooltipDelay` (page `ARCHITECTURE.md`, "Tooltip options and the fork notice"); the chord chips use `useTooltipProps` themselves (their tooltips are Mantine, not `Tip`); tests `components/tooltips.test.tsx`, `HarmonicFieldLab.signs.test.tsx`, `HarmonicFieldLab.moderoot.test.tsx` reference the texts; the lab's `typeScale.test.ts` guard applies to any new CSS.
- **No locks needed so far;** M2 and M3 touch only owned paths.

## Shared touches (locks taken)
None yet.

## Open questions for human
- M1 will ask: native `title` tooltips to styled tooltips or not; block and emphasis rules; help length target; which controls get a tooltip.

## Next action
Human checkpoint for M4: show before and after of the 17 entries; the human rewords what they want. Then M5 (field, subset, rings, key rings, modes entries; the `Hover and hold 1` entry still has no hover target, decide there).
