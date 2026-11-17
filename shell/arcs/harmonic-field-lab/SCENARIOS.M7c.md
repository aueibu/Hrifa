# M7c scenarios: hear a library chord, see it on a ring, and keep the dialog's state

CONFIRMED by the human 2026-11-17 (storage saved across reloads; Checked only shows only checked rows; minimum flag about 4 degrees). Nothing is built yet. All numbers come from a script over the real ratios (`scratchpad/flags_examples.py`), field = the 5-limit major scale (1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8) with the whole field as the comparison set; they are the test source.

## What the human asked for (2026-11-17)
1. Hear a library chord (hold 1) at its exact ratios.
2. A persistent panel at the bottom of the dialog with a ring: the chord's ratios as colored dots, flags from each to the nearest note of the field (or of the subset, a toggle, default field), same colors as the tuner strip (orange = above the note, teal = below), a minimum flag width, and a readout like the stepper's (ratio, nearest note, error).
3. Related: the Check tooltip says "subset" not "current notes"; Clear checks shows how many rows are checked; checks and filters stay when the dialog closes (it behaves like any other panel); a "Checked only" filter.

## One root rule for the sound AND the ring (human: confirm)
For a library chord, the **preview root** is:
1. the root where Check finds the chord in your subset (a field note where all its notes sit within your tolerance);
2. if it is found on several roots, the stepper's selected root when that is one of them, otherwise the lowest root;
3. if it is not found, the stepper's selected root;
4. if there is no selection, 1/1.

The sound is always the chord's EXACT ratios from that root's pitch (not the nearest field notes). The ring draws the same chord at the same root.

## The ring
- A full repeat as a circle, 1/1 at the top (as Pianoteq's tuner). Field notes are small grey dots with their ratio.
- The chord's notes are bigger dots at their exact positions. Each dot and its flag take the tuner strip's colors: **orange** = the chord ratio is ABOVE its nearest note, **teal** (the strip's cyan) = BELOW, neutral open circle with no flag = exact.
- A flag is a short bar along the ring from the chord dot to its nearest note. Its length is the error; it is never shorter than a fixed minimum (about 4 degrees) so a 3 c error is still visible. The readout carries the real number.
- Compared against: a switch **Field | Subset** (default Field). Subset = only the notes you selected; Field = every note of the field.
- Readout under the ring, one line per chord note, in the stepper's wording: `7/4` `nearest 5/3` `+84.5 c` (sign = the chord ratio relative to the nearest note, as in the stepper); an exact note reads `3/2 is exact`.

## Scenarios

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| 1 | Field and subset = the 5-limit major scale, tolerance 0, nothing selected in the stepper | Hover `10:12:15 Minor Triad`, hold 1 | Sounds 10:12:15 exact from 5/4 (found on 5/4 and 5/3; lowest root is 5/4). Ring shows 5/4, 3/2, 15/8 as neutral open circles, no flags. Readout: `1 is exact`, `6/5 is exact`, `3/2 is exact`. |
| 2 | Same, stepper root = 5/3 | Hold 1 on the same row | Sounds from 5/3 (found there, and it is the stepper's root). |
| 3 | Same, stepper root = 1/1 | Hold 1 on the same row | Sounds from 5/4 (found; 1/1 is not one of its roots; lowest root wins). |
| 4 | Same field, tolerance 0 | Hold 1 on `4:5:6:7 Harmonic Dominant Seventh`, stepper root = 1/1 | Not found anywhere at tolerance 0 (7/4 is not in the field). Sounds exact from 1/1. Ring: 1/1, 5/4, 3/2 neutral; 7/4 at 968.8 c an **orange** dot with a flag back to 5/3 (884.4 c); readout `7/4 is +84.5 c from 5/3`. |
| 5 | Same, stepper root = 5/4 | Hold 1 on the same row | Not found. Sounds from 5/4: 5/4, 25/16, 15/8, 35/32 (pitches 386.3, 772.6, 1088.3, 155.1 c). Ring: 386.3 c (5/4) and 1088.3 c (15/8) neutral, 772.6 c (25/16) **orange** with a flag to 3/2 (`+70.7 c`), 155.1 c (35/32) **teal** with a flag to 9/8 (`-48.8 c`). |
| 6 | Same, no stepper selection | Hold 1 on the same row | Sounds from 1/1 (rule 4). |
| 7 | Same field | Hover `8:10:13 Quasi-augmented Triad` (root 1/1; `8:10:12:13` is not in the library, the numbers are the same) | 13/8 (840.5 c) is a **teal** dot with a flag to 5/3: `13/8 is -43.8 c from 5/3`. |
| 8 | Same field | Hover `6:7:9` (root 1/1) | 7/6 (266.9 c) **orange**, `+63.0 c from 9/8`; 3/2 exact. |
| 9 | Ring compared against Subset, subset = 1/1, 3/2 only | Hover `6:7:9` | 7/6 is now compared with 1/1 and 3/2: nearest is 1/1 (266.9 above), `+266.9 c from 1/1`; the flag is long. Switching back to Field shows `+63.0 c from 9/8`. |
| 10 | Field = 12-EDO (12 notes), tolerance 25 | Hover `4:5:6` Major Triad (root 1/1) | 3/2 (702.0 c) is **orange** with a flag drawn at the minimum length to the 700 c note, readout `3/2 is +2.0 c from 700` (the real error is far below the minimum flag); 5/4 (386.3 c) is **teal**, `-13.7 c from 400`. |
| 11 | Nothing hovered or checked | Open the dialog | The panel at the bottom shows `Hover or check a chord to see it here.` The panel is always there (no layout jump). |
| 12 | A row hovered, then the pointer leaves | Look at the panel | It keeps showing the last hovered or checked row (persistent), until another is chosen. |
| 13 | A folding row, for example `1:2:3 Triunisonus` (repeat 2/1), stepper root = 1/1 | Hover it, hold 1 | Sounds 1:2:3 at its real octaves. The ring draws one dot at 1/1 labeled `1 · 2` and one at 3/2; readout one line per drawn dot (a merged dot reads `1 · 2 is exact`, so no two identical lines). No Check (disabled, with the note below); the root is the stepper's root or 1/1 (nothing is "found"). |
| 13b | The same row | Look at it | Not muted as unusable: it carries the note `Octave notes merge in this repeat; the finder skips it here.` (one short muted line, no icon or box) Check is disabled; Add and Add all work. |
| 13c | Add `1:2:3` | Look at the message and your templates | `Added 1:2:3 (not used by the finder in this repeat: octave notes merge).` (several: `Added 2 templates, including 1:2:3 (not used by the finder in this repeat: octave notes merge).`) The template is stored as written (`1:2:3`), takes one of the 64 places and is in family `Library` (or its Scala category). |
| 13d | `1:2:3` is added, repeat 2/1 | Open Edit templates | Its row carries the note `Skipped here: two notes share a pitch.` (one short muted line) |
| 13e | `3:5:6` is a template (repeat 2/1, it folds); the subset is 1/1 and 5/3 only | Look at the Chords panel | No chord found: the template needs 3 different notes and in 2/1 its 2/1 note lands on the root. The `3:5` template (not `3:5:6`) is what 1/1 and 5/3 match. |
| 13f | Same, change the generator's repeat to 3/1 | Look at the Chords panel | `3:5:6` is now an ordinary 3-note template and is found where three subset notes fit it (not in a 2-note subset). |
| 13g | Header of the library | Look | `376 chords in 297 shapes (399 names in Scala's list); 16 collapse octaves in this repeat (they can be added; the finder skips them here)`. In a 3/1 repeat the number follows the repeat. |
| 13h | A family whose only template folds in this repeat (every note fold-collapsed, for example only `1:2:3` in family `Library`) | Look at the chord picker (Chords panel) | UNCHANGED from today: the family row and its size section do not show, because the chord matches at NO tolerance. A family shows once any of its chords matches at ANY rung of the tolerance ladder; below that rung its cards are dashed and inactive and the count reads `0 (0)` (tooltip `0 chords here`), and it counts up when the tolerance reaches the chord. No code change in the picker. |
| 14 | Subset has more than 128 notes | Hover a row | Ring drawn (it only needs the field), `Check` stays disabled with its reason; hold 1 still sounds from the stepper's root or 1/1. |
| 15 | Hover a row | Look at the Check button tooltip | `Compares this chord to your current subset and shows where it is found.` (the glossary entry says "subset" everywhere it said "current notes"). |
| 16 | 3 rows checked | Look at the buttons | `Clear checks (3)`. 0 checked: the button is not shown. |
| 17 | 3 rows checked, search and filters set, some shapes open | Close the dialog, reopen it | Same checks, filters, search text and open shapes. Check results are recomputed from the subset as it is now. |
| 18 | Same, reload the page | Reopen | The checks, filters, search and open shapes are still there (stored, see Storage). The dialog itself is closed. |
| 19 | 3 rows checked | Turn on `Checked only` | Only the shapes holding a checked row are listed, each opened, with only the checked rows shown plus a heading count `· 1 checked`; the summary line reads `3 checked`. |
| 20 | A checked row whose chord is no longer in the library (cannot happen today) | Reopen | Unknown keys are dropped silently. |
| 21 | Add a row while it is checked | Look | Unchanged from M7 (row says `in your templates`, still checked). |

## Decisions for the human (recommendation first)
- **D1 Root rule above** (found root, stepper root among them, else lowest; not found: stepper root; none: 1/1). Recommended as written.
- **D2 Which ring dots get colors.** Recommended: the chord's dots take orange / teal and exact ones the neutral open circle; the field note dots stay grey; the flag runs from the chord dot to the nearest note.
- **D3 Minimum flag length** about 4 degrees of the ring. Say if you want it bigger.
- **D4 What is stored.** Recommended: `settings.v1` ui gains `libFilters` (search text, cardinality min and max, odd limit, prime limit, family, Checked only), `libChecked` (the keys of the checked rows, at most 40 as today), `libOpen` (the opened shape ids) and `libCmp` (`field` or `subset`); all additive, unknown or bad values fall back to the defaults. The dialog open state is not stored. Alternative: keep it all in memory (survives closing the dialog, lost on reload).
- **D5 Checked only** lists the shapes of checked rows and shows only the checked rows. Alternative: keep every row of those shapes visible. Recommended as written.

- **D6 Folding library chords are addable (human, 2026-11-17):** Add and Add all work on them with the octave note; Check stays off; hold 1 and the ring work on them (rows 13 to 13d). The finder keeps skipping a template whose notes fold in the current repeat (intentional, `templateFolds`), and it comes back when the repeat separates the notes (`3:5:6` at 3/1).
- **D7 The Chords panel keeps its family rule (human, 2026-11-17, corrected):** a family or size section shows when any of its chords matches at ANY rung of the tolerance ladder (its cards are dashed and inactive until the tolerance reaches them, and the count `0 (0)` becomes `1 (1)`). A template that folds in the current repeat matches at no rung, so its family is absent from the picker; the Edit templates note (row 13d) is where you see that it is there. (My first draft wrongly read the code as "only when a chord is found at the current tolerance" and proposed always listing families; withdrawn.)

## Not in M7c
The same ring for the stepper's played chord or the chord chips (later, same drawing). Playing a library chord as a sustained chord outside hold 1 (a Play button). Voicing or inversion choice for the preview (it sounds the ratios in root position as the entry is written).
