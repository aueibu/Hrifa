# M7 scenarios: the chord library (from Scala's chordnam.par)

DRAFT 2026-11-17, not yet confirmed by the human. Nothing is built. Counts and chords below come from a script over the real file (`scratchpad/chordnam_stats.py`); they are the test source.

## What the file holds
`reference/chordnam.par` is "List of chords for Scala by Manuel Op de Coul". It has several formats (colon ratios, cents lists, equal-temperament steps, note names). **M7 uses the colon-ratio entries only: 399 of them** (392 `a:b:c`, 7 undertone `(a:b:c)`). The other formats (about 550 entries) are not in M7; they go to the backlog.

Counted from the file:
- 399 entries; **16 fold in the octave** (two notes land on the same pitch, like `1:2:3`), so the finder can never find them in a 2/1 repeat.
- The other 383 make **362 chords that differ** once the root is kept. 18 of those 362 are listed more than once under different spreads of the same notes (for example `1:3:5:15` and `8:10:12:15`; `3:5:7` and `6:7:10`): the library lists each as ONE entry with the names joined.
- Ignoring which note is the root, the 362 are **297 shapes**: 258 shapes have one rooted entry, 20 have two, 12 have three, 7 have four. (My earlier estimate of "about 304" was a little off.)
- Scala names inversions explicitly, so they are real entries: `4:5:6 Major Triad`, `5:6:8 Neapolitan Sixth, Major Triad 1st inversion`, `3:4:5 Fourth-Sixth Chord, Major Triad 2nd inversion`.

## Proposed design (confirmed in principle: inversions kept and grouped, on demand finder, credit kept)
- A **Chord library** dialog opened by a new button beside "Edit templates" in the Chords panel strip.
- **Grouped by shape**: each heading is one shape (the root position entry's ratio and name, "· 3 entries"), collapsed by default; opening it lists the rooted entries (root position first, then 1st, 2nd inversion, ...). Same-root spread duplicates are one row with the names joined by " / ".
- Each row: the ratio text, the name (a leading `=` in the file is dropped), note count, **odd limit**, **prime limit**, and buttons **Add** and **Check**.
- **Add** puts that entry into your templates (family `Library`, its name kept). A shape heading has **Add all N** (off by default is the button, not the action: nothing is added until clicked).
- **Check** runs the finder for just that entry on your current subset at the current tolerance and prints the hits in the row (`2 found: on 5/3, 5/4`), without changing your templates. That is the on-demand cost: one template, not 383.
- **Search and filters:** a search box (name or ratio), note count (from, to), odd limit (up to), prime limit (up to).
- **Credit line** always visible in the dialog header: `Chord list by Manuel Op de Coul, from Scala (chordnam.par)`; the glossary entry carries it too.
- Nothing from the library is stored except what you add (your templates are stored as today).

## Scenarios (the human's real cases to confirm)

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| 1 | Open Chord library | Look at the header | The credit line; `399 entries, 297 shapes` (the 16 folding entries are counted but marked, see row 11). |
| 2 | Search `minor triad` | Look at the list | One shape heading `10:12:15 Minor Triad · 3 entries`, collapsed. |
| 3 | Open it | Look at the rows | `10:12:15 Minor Triad`, `12:15:20 Minor Triad 1st inversion`, `15:20:24 Minor Triad 2nd inversion`, each with note count 3. |
| 4 | Search `dominant seventh` | Open the 4:5:6:7 shape | `4:5:6:7 Harmonic Dominant Seventh`, `5:6:7:8 ... 1st inversion`, `6:7:8:10 ... 2nd inversion`, `7:8:10:12 ... 3rd inversion`. |
| 5 | Shape `4:5:6` | Look at its rows | `4:5:6 Major Triad`, `5:6:8 Neapolitan Sixth, Major Triad 1st inversion`, `3:4:5 Fourth-Sixth Chord, Major Triad 2nd inversion`. |
| 6 | Search `Genus [35]` | Look at the row | ONE row `1:3:5:15` with the names `Genus [35] / Major Seventh` (the file also lists `8:10:12:15 Major Seventh`: same root, same notes in one octave). Adding it adds one template. |
| 7 | Your templates do not contain `10:12:15` | Add `10:12:15 Minor Triad` | Your templates gain `10:12:15` named `Minor Triad` in family `Library`; the finder lists minor triads. |
| 8 | Your templates already contain `4:5:6` | Add `8:10:12`-style duplicates (for example `1:3:5` if listed) | Refused: `Same notes as 4:5:6 already in your templates.` (the finder's own duplicate rule). |
| 9 | The `Minor Triad` shape | Add all 3 | Three templates added (`10:12:15`, `12:15:20`, `15:20:24`) and a note `Added 3 templates.`; if you have fewer than 3 free places of the 64, nothing is added and it says `Needs 3 free places; you have 1.` (all or nothing). |
| 10 | 5-limit major scale (1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8), tolerance 0 | Check `10:12:15 Minor Triad` | `2 found: on 5/4, 5/3` (E minor, A minor); at tolerance 25 c `3 found` (D minor at 21.5 c joins). Your templates are unchanged. |
| 11 | Entries that fold in the octave (`1:2:3 Triunisonus`, `1:2:3:4:5:6:7:8 Harmonics 1-8`) | Look at them | Shown dimmed with the reason `Two notes land on the same pitch in this repeat, so it cannot be found.`; Add and Check are disabled. |
| 12 | `(1:2:3:4:5:6:7:8) Subharmonics 1-8` | Look at it | Shown as `1/(1:2:3:4:5:6:7:8)` (the lab's undertone form), dimmed like row 11 (it folds). |
| 13 | `2:3:4  =8/5 Chord, NM Trine "8|5-4"` | Look at the name | `8/5 Chord, NM Trine "8|5-4"` (the file's leading `=` is a syntax marker, dropped). |
| 14 | Filter odd limit up to 9, note count 4 to 4 | Look at the list | Only 4-note entries whose largest odd number is 9 or less (for example `4:5:6:7`, 7; `3:5:7:9`, 9; `4:5:6:9`?); each shown with its odd limit and prime limit. |
| 15 | Reload the page | Look at your templates | Only what you added; the library itself stores nothing. |

Row 14's exact list is computed by script before it becomes a test. Row 8 uses whichever duplicate the file really lists.

## Decisions for the human (recommendation first)
- **D1 Where it opens.** Recommended: a "Chord library" button beside "Edit templates". Alternative: a tab inside the Edit templates dialog.
- **D2 Check button.** Recommended: yes (row 10): see what a library chord would find in your subset without adding it. Alternative: only Add (you add it and look at the chips).
- **D3 The 64-template limit.** Recommended: keep it and refuse politely when full (rows 9 and the limit message). Raising it would slow every selection click.
- **D4 Which family added entries go into.** Recommended: one family named `Library` (you can edit it in Edit templates). Alternative: keep the file's own sections (the file has none that map to families).
- **D5 Folding entries.** Recommended: show them dimmed with the reason (rows 11 and 12), since a different repeat (3/1, for example) can use them. Alternative: hide them.
- **D6 Other formats.** Recommended: M7 reads only the colon-ratio entries (399); the cents, EDO-step and note-name entries (about 550) go to the backlog.
- **D7 The data file.** The library is a generated data file in the lib (`chordLibrary`), built from the `.par` by a script, with the credit as a comment on top. The `reference/` folder (the `.par`, the Scala manual, the analysis scripts) is still uncommitted: commit the `.par` with this milestone (credit kept) or keep it untracked? Recommended: commit `chordnam.par` only, leave the manual and scripts untracked.

Storage: none new (your templates are stored as today in `chordfinder.v1`). The library is code, so no `DECISIONS.md` storage row; one row for the dialog and the add rules when built.

## Human answers (2026-11-17)
- **D1:** a "Chord library" button BESIDE "Edit templates". **D2:** yes, Check. **D3:** keep the 64 limit. **D5:** dimmed with the reason. **D6:** colon ratios only. **D7:** keep `reference/` UNTRACKED (the `.par` is not committed); the generated data file is committed, with the credit as a comment, and the script that builds it is committed under the arc folder (`arcs/harmonic-field-lab/scripts/`), reading the `.par` from a path argument.
- **D4 (family names), CONFIRMED with two splits (human, 2026-11-17):** Tetrachords, pentachords and trichords are three families; Major and minor are two. An added entry takes the family of its category; an entry that matches none gets `Library`. The rules (first match wins) and counts, from the real file (script `scratchpad/chordnam_final_rules.py`): Named chords 49, Neo-Medieval (NM) 47, Pentachords 39, Sevenths, ninths and added tones 37, Diminished and augmented 37, Tetrachords 31, Neutral, subminor and supermajor 30, Harmonics and subharmonics 23, Minor 22, Major 17, Hendrix chords 16, Trichords 11, Septimal and higher limits 7, Number sequences 6, Bohlen-Pierce (BP) 6, Saturated suspensions (ASS) 6, Suspended and quartal 6, Genus and product sets 5, Library 4 (total 399; no entry has both Major and Minor after the rules). The category is also a filter in the library list.
- **Check, when and cost (explained to the human):** Check runs only when you press it (never automatically). It runs the finder for ONE template on the subset, about N x N x (notes in the chord) steps: for the largest subset the finder accepts (128 notes) that is about 130 thousand steps, a few milliseconds. What was expensive was all 383 at once; that never happens. Check is disabled with the usual hint above 128 notes. A row you have checked recomputes when the subset or the tolerance changes (cheap, bounded by the rows you checked); Check on a shape heading checks its 2 to 4 entries.

## Corrections from the M7a build (real lib numbers; tests assert these)
- **Counts in a 2/1 repeat:** 399 lines in the file; after merging same-root spreads (the lab's own `templateKey` rule) **376 chords**, of which **360 can be found** and **16 fold**; the 360 make **297 shapes** (259 with one entry, 20 with two, 11 with three, 7 with four), 313 shapes counting the 16 folding ones as their own. (My script took the first number of an undertone as its root, so it said 362 and 258/20/12/7.) 19 groups merge, not 18.
- **Row 1 header wording:** `376 chords in 297 shapes (399 names in Scala's list); 16 cannot be found in this repeat`.
- **Row 2:** `minor triad` also matches Subminor Triad, Supraminor Triad and Quasi-Equal Minor Triad: 11 shapes; the `10:12:15` shape is one of them (3 entries).
- **Row 14** (odd limit up to 9, 4 notes): 18 entries: `3:5:7:9`, `7:9:10:12`, `9:10:12:14`, `5:6:7:9`, `4:5:6:7`, `5:6:7:8`, `6:7:8:10`, `7:8:10:12`, `4:5:6:9`, `9:10:12:16`, `5:6:8:9`, `6:8:9:10`, `4:6:7:9`, `6:7:8:9`, `4:6:9:16`, `6:8:9:12`, `1/(3:4:5:7)`, `1/(5:6:7:9)`.
- **Root position of a shape:** the entry with no "inversion" in its name comes first, then smaller numbers, then text; inversions follow in order.
- **Add refusal order:** fold, then duplicate, then the 64 cap. The add message (`Added 3 templates.` or the refusal sentence) is runtime-only state `templateNote`.
