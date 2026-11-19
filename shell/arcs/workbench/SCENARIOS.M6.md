# M6 scenarios: the piano roll and the chord picker as separate panels

Draft 2026-11-18, for the human to confirm before anything is built (shell CLAUDE.md rule 7). Tests come from the confirmed rows only. Sources: ARC.md M6, DESIGN.one-stage.md 1.3, 3.3, 3.5, 7.7 (anchor and selection modes confirmed for M6 on 2026-11-14), 8.4.

What changes for you: the chord picker stops being part of the clip editor. It becomes its own panel (tab "Chords") that you can put in any docker, like the desk or canvas. The editor's inner split (roll | picker) and the "over the canvas" takeover go away.

Setup used in every row unless the row says otherwise: the **Canvas** screenset (Canvas docker on top; Detail docker bottom left with the clip editor; Tools docker bottom right), clip **Alpha** open, 12-EDO, C major chord chosen in the picker.

## A. Behavior that stays as today (no choice; confirm they are right)

| # | You do | You get |
| --- | --- | --- |
| A1 | Pick the Chords tool | The Chords panel appears in its remembered docker (first time: Tools) and comes to the front. The roll shows the hover ghost under the pointer. |
| A2 | Chords tool on, click C4 at beat 1 in the roll, press Enter | C-E-G inserted at beat 1 from C4; one undo step; anchor moves on as today if Continuous is on. |
| A3 | Chords tool on, arrow keys / Shift+arrow / Alt+arrow | Same as today (W-20): the anchor moves, reselect, silent auto-repeat. The keys work whichever docker the picker is in. |
| A4 | Chords tool on, close the Chords tab (its x or menu Close) | The roll leaves the Chords tool and goes back to the tool you had before (today's rule). |
| A5 | Drag the Chords tab to another docker (e.g. into Canvas, or a new docker left of Detail) while an anchor is set | The chord, voicing, anchor and ghosts stay. Next time the Chords tool is picked, the panel opens where you put it, per screenset. |
| A6 | Flip to the Desk screenset and back, Chords tool on | Picker and anchor are as you left them (same clip, same tool). |
| A7 | Click a chord in the picker with no clip open | You hear it (audition never needs a target). The panel says "No target: open a clip to insert"; Insert is disabled with that reason. |
| A8 | Chords tool on; click the "Modules" tab in the Detail docker so the roll is hidden | The picker stays; keys are not captured while the roll is hidden (8.4); clicking back on "Clip editor" restores everything. |
| A9 | Esc | Clears the anchor and ghosts as today (only when not typing and no menu or dialog is open). |

## B. New: selection mode (a non-Chords tool, the picker open)

The panel always shows which mode applies, e.g. "Anchor: click in the roll", "Selection: 1 note", "No selection: audition only".

| # | You do | You get |
| --- | --- | --- |
| B1 | Pointer tool, select the note E4 at beat 2 (length 1 beat, velocity 90), Insert C major | Exactly what you get today by picking the Chords tool, clicking that E4 and pressing Enter: same anchor rule, same stack-on-note rule (the new notes take E4's length 1 and velocity 90). One undo step. |
| B2 | Pointer tool, nothing selected, click a chord | Audition only; Insert disabled: "Select a note, or use the Chords tool". |
| B3 | Pointer tool, select a time range with no notes | Insert disabled: "Select a note" (a range has no pitch). |
| B4 | Pointer tool, select two notes: C4 at beat 1 and G4 at beat 3 | **Choice 3 below.** |

## C. Choices (the options give different results in the example)

### Choice 1: when you leave the Chords tool, does the Chords panel close?

Example: Chords tool on, picker in Tools. You insert C major at beat 1, then press the pointer tool and select the note E4 at beat 2.

| Option | What you see after pressing the pointer tool | To stack a chord on E4 |
| --- | --- | --- |
| **1a. Panel closes (today's rule)** | Tools docker is empty | Open "Chords" from the Panels menu first, then Insert |
| **1b. Panel stays until you close it** (recommended) | Picker still in Tools, now saying "Selection: 1 note" | Insert directly |

1b makes selection mode reachable without a detour; the cost is that the panel no longer disappears by itself, so you close it when you want the space back. A4 still holds either way (closing the panel while in the Chords tool leaves the tool).

### Choice 2: where does the picker go for a project that used "over the canvas" (the takeover) before?

Today that setting puts the picker over the whole canvas area while the Chords tool is on. The takeover is removed in M6.

| Option | Pick the Chords tool in such a project | The canvas |
| --- | --- | --- |
| **2a. A "Chords" tab in the Canvas docker** (recommended; closest to today) | The picker fills the Canvas docker, in front of the canvas tab | Hidden behind the Chords tab while it is in front; one click on the Canvas tab shows it |
| **2b. The Tools docker** (same as every other project) | The picker appears bottom right | Stays visible, as for dock users |
| **2c. A new "Chords" docker beside the canvas** | The Canvas docker is split, picker on the right | Visible but about half as wide |

Projects that used "beside the roll" (the dock) get the Tools docker, sized from the old dock width, in every option.

### Choice 3: selection mode with several selected notes

Example: Pointer tool, select C4 at beat 1 and G4 at beat 3, Insert C major.

| Option | Result |
| --- | --- |
| **3a. Each selected note is an anchor** | Two chords, one stacked on C4 at beat 1 and one on G4 at beat 3 (each as if you had clicked that note with the Chords tool); one undo step |
| **3b. Only the lowest note** (recommended for M6: predictable, smallest) | One chord, stacked on C4 at beat 1; G4 untouched. The panel says "Selection: 2 notes, using the lowest" |
| **3c. Refuse** | Insert disabled: "Select one note" |

Note for 3a: with notes at the same beat (C4 and G4 both at beat 1), "each" would stack two chords on one beat; 3a would need a rule for that too.

## Decisions (the human, 2026-11-18)
A rows and B1 to B3 accepted. **1b** (the panel stays open until you close it). **2a** (takeover becomes a Chords tab in the Canvas docker; no saved projects exist). **3a** (each selected note gets a chord) with **(i)** at a shared onset: every note gets its chord, and a pitch two chords share at the same onset is entered once. The mode text is the standard **ready line** (`READY-LINE.md`).

| # | You do | You get (confirmed) |
| --- | --- | --- |
| B4 | Pointer tool, select C4 at beat 1 and G4 at beat 3, Insert C major | Two chords: one on C4 at beat 1, one on G4 at beat 3, each as if clicked with the Chords tool; one undo step. Ready line: "Insert: one chord on each of 2 selected notes". |
| B5 | Pointer tool, select C4 and G4 both at beat 1, Insert C major | Two chords at beat 1, one on C4 and one on G4; a pitch both chords contain at beat 1 is entered once. One undo step. |
| B6 | Chords tool on, insert at beat 1, then press the pointer tool | The Chords panel stays in Tools; ready line changes from "Anchor: click in the roll" to "Select a note, or use the Chords tool". |

## D. Removed or rewritten tests (for your OK; listed by the design)

Retired with the editor's inner split and the takeover: `NoteClipEditor.stage.test.tsx`, `editorStage.test.ts`, and the takeover cases in `ChordPickerHost.test.tsx`, `ChordPicker.test.tsx` and `NoteClipEditor.chords.test.tsx`. Each retired case that checks chord behavior (not placement) is rewritten against the new panel instead of dropped; the exact list comes to you before the commit.

## E. Not in M6

Cursor mode (insert at the playhead) and dropping a chord onto the roll (design 7.7, later). Two pickers at once. Removing the old v1 Stage and the `/stage` spike (decided at M8).
