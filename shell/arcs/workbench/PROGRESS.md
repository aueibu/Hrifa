# PROGRESS

## Status
- Arc: workbench (`arcs/workbench`), chord input arc (ARC.md approved by the human 2026-11-13)
- Current milestone: M2 (M1 and M2 built and reviewed, reviewer fixes in progress, uncommitted)
- State: building

## Where to look
- `ARC.md` (this arc). Archives of earlier workbench arcs: `ARC.desk.md`, `ARC.clips.md` and their `PROGRESS.*` files.
- `RESEARCH.bitwig-note-editor.md` for the Bitwig comparison; `../../BACKLOG.md` for leftovers.

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup | ARC.md approved; no `check:` script needed (`check:workbench` exists) | n/a | Hover = silent ghost; click = audition; double-click or Enter = insert (confirm at M5). Euclidean and rhythm transforms = second arc. |
| C0 | Done | n/a | No locks held by anyone. harmonic-field-lab (M4, awaiting its checkpoint) owns `src/pages/harmonic-field-lab/`, `src/lib/harmonic-field/`, `HarmonicFieldLab.page.tsx`; no overlap with us. Binding decisions: W-1 (midicents), W-3 (roll fixed 12-EDO), W-4, W-6 (single edit path `commitSnippetEditById`, one undo step), W-9 (same-pitch overlap), W-10, W-11 (new PianoRoll/EditorPalette features opt-in), W-12. Only scale-explorer imports the workbench (`audio/*`, `forteCatalog`): keep stable. Reuse: `scaleConstruction.ts` (`realizePitchClasses`), `pitch.ts` (`pitchClassName`), `scaleDegreeColor.ts`, `compositionSettings.tsx` (storage key under the project-captured prefix; pitch set goes here), audition via `createNotePacketPerformancePlan` + `useModulePreview`. Tools: `NoteClipEditor.tsx:93-100` (keys 1-6, 7+ free), `EditorPalette`. `commit` (`NoteClipEditor.tsx:594`) is not exported; `addNotes` (`noteClipEdits.ts:154`) places N notes as one undo step. No ghost-notes prop on PianoRoll yet (add `ghostNotes`, opt-in, per W-11). |
| M1 | Built (`chordInput/`: pitchSet, chordTemplates, chords, chords.test; 21 tests), reviewer: pass with fixes | `check:workbench` green (builder run) | DECISIONS W-13. Am6/Aadd9 correctly absent in C major (acceptance reworded in ARC.md). Reviewer fixes to apply: (2) copy arrays in `buildChord` / freeze library, (3) exact-list test for root A in C major, (4) name non-12 chords consistently + fix doc example. Item 1 resolved: keep chromatic at non-12 EDOs (human, 2026-11-13); M3 default is major at 12-EDO and chromatic otherwise. Item 6 for M5: convert midicents to steps before `chordsOnRoot`. |
| M2 | Built (`voicing.ts`, 20 tests; `voiceChord`, `voiceChordTones`, anchors `bass` and `tone`), reviewer: pass with fixes | `check:workbench` green (builder run) | Fixes in progress: document that a bass anchor pins the lowest voice and ignores pitch class (M5/M6 use `tone` anchors), `chordToneIndex` helper for M6, doc/test-title fixes, input guards. Open for M5: register under inversion (root tone at the click, other voices below, vs bass near the click) is a human taste decision; added to M5 acceptance. Drop-2 needs >=3 voices, drop-3 >=4, open on a dyad raises the upper voice: record in ARCHITECTURE at M8. |
| Layout | ARC.md updated with picker body + host split and four host rules (human OK 2026-11-13) | n/a | Inspector slot is the preferred host; sharing it with clip properties decided at M4. |

## Shared touches (locks taken)
None yet.

## Open questions for human
- RESOLVED 2026-11-13 (human): non-12 EDO presets stay chromatic for now; users build non-12 sets by hand. Follow-up (BACKLOG): link default non-12 pitch sets/chord vocabulary to the harmonic-field-lab engine.
- `addNote`/`addNotes` (`noteClipEdits.ts:131,171`) `Math.round` midicents, so a non-12 EDO step (e.g. 31-EDO 38.71c) is rounded to whole cents on placement (error under 0.5c). Acceptable, or should placement keep fractional midicents? Decide before M5; M1/M2 engines stay in exact steps.

## Next action
When the M2 builder reports: dispatch one builder for the M1 reviewer fixes (items 2-4), review M2, run `check:workbench`, commit M1 then M2 path-scoped.
