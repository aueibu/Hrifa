# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: harmonic-field-lab, help text arc (`arcs/harmonic-field-lab`)
- Current milestone: M2 done, committed; human checkpoint pending
- State: awaiting human (look at `Play scale`, `Hover and hold 1 (and 4, 5)` and `Modes (heat grid)` in the running page)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup | ARC.md approved as drafted; PROGRESS.md created | no code, no gate | Gate policy: run `check:hfl` sparingly (see ARC.md "Checkpoint decisions"). No `package.json` change needed (`check:hfl` and prefix `H` exist). |

| C0 | Context scan done (2026-11-15), no code, no gate | n/a | See "C0 findings" below. |

| M1 | Format decided (2026-11-15): `HELP-FORMAT.md` written, ARC.md checkpoint decision added | no code, no gate | Open: the human's OK to add a shortcut table (sync of key bindings and help text) to M2 scope. DECISIONS `H-16` is written at M2 with the code contract. |

| M2 | Built (builder), reviewed (reviewer FAIL on wording drift, fixed by the orchestrator), gated | `check:hfl` green once: 94 files, 1294 tests | Review fixes: help wording of `playScale`, `holdToPlay`, `modes` restored to the confirmed text; lost `modes` fact ("one row per mode: the scale restarted from each degree") moved to teaching; "Keys:" label no longer italic; the guard now requires an Example in `help`; stale "5 key" comment fixed; `Object.hasOwn` lint fix. `H-16` appended. Open for the human: example-then-keys is the one order in both views (HELP-FORMAT section 2); the confirmed `holdToPlay` mockup showed keys first. Human checkpoint: look at the three entries in the running page. |

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
Human checkpoint for M2: the human looks at the three converted entries (tooltip and glossary) and answers wording, look and order. Then M3 (dynamic tooltips: `extra` as a typed block, the 15 `nativeTitle` sites to the styled tooltip, tooltips-off hiding them; related tests while building, one gate at the end).
