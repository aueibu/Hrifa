# M5 to M7 checkpoint: wording of 80 converted entries

For your review (2026-11-16). Each entry shows the **before** text exactly as committed in `b43d915` and the **after** exactly as it is now. Keys are shown as `[0]`, `[1]` ... the way the renderer shows them from the shortcut table. The tooltip shows the "After, tooltip" part only; the glossary shows that part, a rule, then "glossary adds".

The entry heading says how each was converted: **hand** (a builder rewrote it and checked its key and control claims against the code), **hand (generator batch)** (the first hand batch, 22 entries), or **mechanical split** (a script cut the old text at sentence ends, nothing reworded: about 200 characters of lead plus the Example in the tooltip, the rest in the glossary).

Two reviewers checked all 80: no fact is lost or altered in any of them, every claim the builders could not verify was checked in the code (all true), and the Group 2 cuts that read badly were put back to their old form (see below).

## Look at these first

**Corrections where the old text was wrong about the code (the old wording was carried over before; now fixed):**
- `preset`: said the control "shows its folder path". It shows only the name; the full path is the line under the control. Both places now say so.
- `method`: left out the **Sub** option (the subharmonic series). Added as the mirror image of the harmonic series.
- `shelfPanel`: the bin asks for a second click ("Delete?"); the old text said only "the bin to delete". Added.
- `renameSaved`: a rename also commits when you click away, not only on Enter. Added.
- `savedRow`: the bars measure the distance from whatever **Compare to** is set to (12-EDO by default), not always 12-EDO.
- `pitchCircle`: "a larger ring" is really a larger green dot.
- `lattice3d`: the two-finger pan only works on touch screens ("two-finger touch drag").
- `positionalChords`: the **+** in its Keys list is the on-screen + button on a row, not the + key (which stashes the Sketch). Now says "The + button on a row".
- `sendToComposite`: the minus key works only plain (not with Ctrl, Alt, Cmd or Shift); Esc says "popup open".

**Text changes the guard test forced:** `>|<` in `modeRoot` and `tunerStrip` became "a pair of chevrons facing each other" (angle brackets are banned in entry text); backticks in `positionalChords` became double quotes.

**Put back to their original old-form text (mechanical cut read worse than the original):** `keyMarks`, `tooltips`, `scorer`, `fillSources`, `retunerOn`, `chordLadder`, `dissCurve`, `liveRoughCurve`. They are not in this file because they were not converted. They still show their Example on its own line, sentences on separate lines and units glued, like every other short entry.

**Style, please confirm:**
- Bold only for names visible on screen (Generator, Count, Centre, Box, Diamond, Save as new, Undo, Update preset, Pin left and right, Retune now and the like).
- The first hand batch's `tunerStrip` has its two old examples split: one in the tooltip, one in the glossary.
- Not added: the `E` key in the composite popup stays plain text (its handler takes `e` and `E`, which does not fit one table entry; a `sendFlip` table entry is possible if you want it).
- `holdToPlay` still writes "= (or +)" as plain text instead of the table name (an M4-era entry; cosmetic).
- Left as old form on purpose: about 118 short entries with no key or click gestures. They are tooltip-sized already.

---

## Preset  (`preset`, hand (generator batch))

**Before** (one string):

> The generator this tab is on, shown as its folder path (for example Equal divisions > Non-octave > Carlos Alpha). Click to browse: type to search every preset at once, or open the folders (Built-in, My presets, Recent, Auto-saved). Choosing one fills in the method and its numbers. An orange dot before the name means you changed the generator since: the preset itself is untouched until you press Update preset, or you can keep the change with Save as new. Example: pick Harmonics 8-15 (one octave of the overtone series, whose 7th, 11th and 13th harmonics sit far from any 12-EDO note), raise the starting harmonic, and the dot appears.

**After, tooltip:**

> **Preset**
>
> The generator this tab is on, shown by its name (the full folder path is the line under the control). Click to browse: type to search every preset at once, or open the folders (Built-in, My presets, Recent, Auto-saved). Choosing one fills in the method and its numbers.
>
> *Example:* pick Harmonics 8-15, raise the starting harmonic, and an orange dot appears before the name.

**After, glossary adds** (below a rule):

> The full path, shown under the control, looks like Equal divisions > Non-octave > Carlos Alpha.
>
> An orange dot before the name means you changed the generator since. The preset itself is untouched until you press **Update preset**, or you can keep the change with **Save as new**.
>
> *Example:* Harmonics 8-15 is one octave of the overtone series, whose 7th, 11th and 13th harmonics sit far from any 12-EDO note.

See also: method, presetUpdate, presetSaveNew

---

## Update preset  (`presetUpdate`, hand (generator batch))

**Before** (one string):

> Writes the generator you have edited into the preset it came from. Every subset of that preset is matched against the new notes: pitches that no longer exist are dropped, and a subset left with none is removed. A line next to the preset says what changed, and Undo puts everything back exactly. Built-in presets cannot be changed (use Save as new), and the button is grayed out, with the reason on hover, when nothing has changed. Example: a preset of harmonics 8-15 with a subset on 11/8; change it to harmonics 16-31 and Update: 11/8 is still found as 22/16, so the subset keeps it.

**After, tooltip:**

> **Update preset**
>
> Writes the generator you have edited into the preset it came from. Every subset of that preset is matched against the new notes: pitches that no longer exist are dropped, and a subset left with none is removed.
>
> *Example:* a preset of harmonics 8-15 with a subset on 11/8; change it to harmonics 16-31 and Update: 11/8 is still found as 22/16, so the subset keeps it.

**After, glossary adds** (below a rule):

> A line next to the preset says what changed, and Undo puts everything back exactly.
>
> Built-in presets cannot be changed (use **Save as new**). The button is grayed out, with the reason on hover, when nothing has changed.

See also: preset, presetSaveNew, presetUndo

---

## Save as new  (`presetSaveNew`, hand (generator batch))

**Before** (one string):

> Saves the generator as a new preset of your own, with a name and an optional folder (type Pools/Seven to make or reuse nested folders; existing folders are suggested). A plain click starts it with no subsets. Shift+click (or the arrow beside the button) also copies the current preset's subsets, matched against this generator. The original preset is not changed. Example: edit Hexany to use 1 3 5 11, then Shift+click Save as new, name it Hexany 11 in the folder Hexanies: the subsets you had carry over where their pitches still exist.

**After, tooltip:**

> **Save as new**
>
> Saves the generator as a new preset of your own, with a name and an optional folder. The original preset is not changed.
>
> Keys:
> - Click: starts the new preset with no subsets
> - Shift+click (or the arrow beside the button): also copies the current preset's subsets, matched against this generator
>
> *Example:* edit Hexany to use 1 3 5 11, then Shift+click **Save as new**, name it Hexany 11 in the folder Hexanies: the subsets you had carry over where their pitches still exist.

**After, glossary adds** (below a rule):

> In the folder field, type Pools/Seven to make or reuse nested folders; existing folders are suggested.

See also: preset, presetUpdate

---

## Undo update  (`presetUndo`, hand (generator batch))

**Before** (one string):

> Puts the preset and its subsets back exactly as they were before the last Update. Only what the Update changed is touched, so subsets you added since stay. The line disappears as soon as you edit the generator again or open another one. Example: an Update removed two subsets; Undo brings them back at their old places.

**After, tooltip:**

> **Undo update**
>
> Puts the preset and its subsets back exactly as they were before the last Update. Only what the Update changed is touched, so subsets you added since stay.
>
> *Example:* an Update removed two subsets; **Undo** brings them back at their old places.

**After, glossary adds** (below a rule):

> The line disappears as soon as you edit the generator again or open another one.

See also: presetUpdate

---

## Show removed  (`presetShowRemoved`, hand (generator batch))

**Before** (one string):

> Lists the subsets the last Update (or copy) changed, drawn as small strips: pitches that survived are solid lines, pitches that no longer exist in the generator are dashed, and a subset that lost everything is all dashed. It is only a review: nothing here can be edited, and it is not stored. Example: a subset of 1/1, 5/4 and 11/8 on a generator that lost 11/8 shows two solid lines and one dashed.

**After, tooltip:**

> **Show removed**
>
> Lists the subsets the last Update (or copy) changed, drawn as small strips: pitches that survived are solid lines, pitches that no longer exist in the generator are dashed, and a subset that lost everything is all dashed.
>
> *Example:* a subset of 1/1, 5/4 and 11/8 on a generator that lost 11/8 shows two solid lines and one dashed.

**After, glossary adds** (below a rule):

> It is only a review: nothing here can be edited, and it is not stored.

See also: presetUpdate

---

## Edit preset  (`presetEdit`, hand (generator batch))

**Before** (one string):

> Renames one of your presets or moves it to another folder (a path such as Pools/Seven; empty puts it at the top of My presets). Its subsets and generator are unchanged. Example: move Hexany 11 from Hexanies to Pools/Seven.

**After, tooltip:**

> **Edit preset**
>
> Renames one of your presets or moves it to another folder. Its subsets and generator are unchanged.
>
> *Example:* move Hexany 11 from Hexanies to Pools/Seven.

**After, glossary adds** (below a rule):

> The folder is a path such as Pools/Seven; empty puts it at the top of My presets.

See also: preset

---

## Delete preset  (`presetDelete`, hand (generator batch))

**Before** (one string):

> Removes one of your presets after you confirm. Its subsets are not lost: they stay under Auto-saved, with the generator the preset had. A preset with no subsets is gone for good. Example: delete Hexany 11 with three subsets, and the three rows stay available under Auto-saved.

**After, tooltip:**

> **Delete preset**
>
> Removes one of your presets after you confirm. Its subsets are not lost: they stay under Auto-saved, with the generator the preset had.
>
> *Example:* delete Hexany 11 with three subsets, and the three rows stay available under Auto-saved.

**After, glossary adds** (below a rule):

> A preset with no subsets is gone for good.

See also: preset, unassigned

---

## Method  (`method`, hand (generator batch))

**Before** (one string):

> How the field of notes is built. Harmonic series takes consecutive overtones; Equal division splits the repeat into equal steps; Lattice stacks one or more generator intervals; Combination product set (CPS) multiplies chosen factors together; Custom takes ratios or a Scala file you type in. Example: Harmonic series starting at 8 gives 8/8, 9/8, 10/8, and so on up to 15/8.

**After, tooltip:**

> **Method**
>
> How the field of notes is built. *Harmonic series* takes consecutive overtones; *Subharmonic series* is its mirror image, consecutive undertones; *Equal division* splits the repeat into equal steps; *Lattice* stacks one or more generator intervals; *Combination product set (CPS)* multiplies chosen factors together; *Custom* takes ratios or a Scala file you type in.
>
> *Example:* Harmonic series starting at 8 gives 8/8, 9/8, 10/8, and so on up to 15/8.

See also: repeat, field

---

## Repeat interval  (`repeat`, hand (generator batch))

**Before** (one string):

> The interval after which the scale starts over: its "octave". Most scales use 2/1, but 3/1 (a tritave) or 3/2 also work. Accepts ratios (3/2), whole numbers (3), cents (701.96 or 701.96c) and equal-division steps (7\12). Example: 3/1 makes a scale that repeats every tritave.

**After, tooltip:**

> **Repeat interval**
>
> The interval after which the scale starts over: its "octave". Most scales use 2/1, but 3/1 (a tritave) or 3/2 also work.
>
> *Example:* 3/1 makes a scale that repeats every tritave.

**After, glossary adds** (below a rule):

> Accepts ratios (3/2), whole numbers (3), cents (701.96 or 701.96c) and equal-division steps (7\12).

See also: field

---

## Starting harmonic  (`startHarmonic`, hand (generator batch))

**Before** (one string):

> The first overtone in the segment; the field runs from it up to twice its number. Example: 8 gives 8:9:10:11:12:13:14:15, which is one octave of the series; 16 gives 16 notes packed into the same octave.

**After, tooltip:**

> **Starting harmonic**
>
> The first overtone in the segment; the field runs from it up to twice its number.
>
> *Example:* 8 gives 8:9:10:11:12:13:14:15, which is one octave of the series; 16 gives 16 notes packed into the same octave.

See also: (none)

---

## Divisions  (`edoDivisions`, hand (generator batch))

**Before** (one string):

> How many equal steps the repeat is cut into. Example: 12 steps of an octave is ordinary piano tuning; 19 gives smaller steps of 63.2 cents.

**After, tooltip:**

> **Divisions**
>
> How many equal steps the repeat is cut into.
>
> *Example:* 12 steps of an octave is ordinary piano tuning; 19 gives smaller steps of 63.2 c.

See also: (none)

---

## Lattice shape  (`latticeShape`, hand (generator batch))

**Before** (one string):

> Box counts a fixed number of steps along each generator, like a grid. Diamond keeps everything within a total number of steps of 1/1. Example: generators 3/2 and 5/4, box 3 by 3, gives nine notes before reducing into the octave.

**After, tooltip:**

> **Lattice shape**
>
> **Box** counts a fixed number of steps along each generator, like a grid. **Diamond** keeps everything within a total number of steps of 1/1.
>
> *Example:* generators 3/2 and 5/4, box 3 by 3, gives nine notes before reducing into the octave.

See also: (none)

---

## Steps from the centre  (`diamondDistance`, hand (generator batch))

**Before** (one string):

> For the Diamond shape: how many generator steps in total a note may be from 1/1, counting every axis together. Example: with generators 3/2 and 5/4 and 2 steps, 9/8 (two steps of 3/2) and 15/8 (one of each) are in, but 27/16 (three steps) is not.

**After, tooltip:**

> **Steps from the centre**
>
> For the Diamond shape: how many generator steps in total a note may be from 1/1, counting every axis together.
>
> *Example:* with generators 3/2 and 5/4 and 2 steps, 9/8 (two steps of 3/2) and 15/8 (one of each) are in, but 27/16 (three steps) is not.

See also: latticeShape

---

## Generator, count, centre  (`genAxis`, hand (generator batch))

**Before** (one string):

> Generator is the interval stacked again and again (3/2 builds a chain of fifths). Count is how many to stack. Centre is how many steps go below 1/1. Example: 3/2, count 12, centre 0 builds the twelve notes up from the root; centre 6 spreads them both ways.

**After, tooltip:**

> **Generator, count, centre**
>
> **Generator** is the interval stacked again and again (3/2 builds a chain of fifths). **Count** is how many to stack. **Centre** is how many steps go below 1/1.
>
> *Example:* 3/2, count 12, centre 0 builds the twelve notes up from the root; centre 6 spreads them both ways.

See also: mos

---

## MOS sizes  (`mos`, hand (generator batch))

**Before** (one string):

> Moment of Symmetry: counts of generator steps where the chain folds into a scale with exactly two step sizes. For 3/2 inside an octave the sizes include 5 (pentatonic), 7 (diatonic) and 12. Click one to use it as the count. Example: 7 notes of a 3/2 chain give the diatonic 5L 2s pattern.

**After, tooltip:**

> **MOS sizes**
>
> *Moment of Symmetry*: counts of generator steps where the chain folds into a scale with exactly two step sizes. Click one to use it as the count.
>
> *Example:* 7 notes of a 3/2 chain give the diatonic 5L 2s pattern.

**After, glossary adds** (below a rule):

> For 3/2 inside an octave the sizes include 5 (pentatonic), 7 (diatonic) and 12.

See also: structure

---

## Factors  (`cpsFactors`, hand (generator batch))

**Before** (one string):

> The numbers that get multiplied together in pairs, triples and so on. Example: factors 1 3 5 7, choose 2 gives the hexany: 1x3, 1x5, 1x7, 3x5, 3x7, 5x7, each brought into the octave.

**After, tooltip:**

> **Factors**
>
> The numbers that get multiplied together in pairs, triples and so on.
>
> *Example:* factors 1 3 5 7, choose 2 gives the hexany: 1x3, 1x5, 1x7, 3x5, 3x7, 5x7, each brought into the octave.

See also: (none)

---

## Choose k  (`cpsK`, hand (generator batch))

**Before** (one string):

> How many factors go into each product. Example: 1 3 5 7 with k = 2 is a hexany; with k = 3 it is 4 notes, a subharmonic tetrad; 1 3 5 7 9 with k = 2 is a 10-note dekany.

**After, tooltip:**

> **Choose k**
>
> How many factors go into each product.
>
> *Example:* 1 3 5 7 with k = 2 is a hexany; with k = 3 it is 4 notes, a subharmonic tetrad; 1 3 5 7 9 with k = 2 is a 10-note dekany.

See also: (none)

---

## Custom intervals  (`customIntervals`, hand (generator batch))

**Before** (one string):

> Your own list of ratios, cents or EDO steps, one per line or separated by spaces. Example: 9/8 5/4 4/3 3/2 5/3 15/8 is the just major scale above 1/1.

**After, tooltip:**

> **Custom intervals**
>
> Your own list of ratios, cents or EDO steps, one per line or separated by spaces.
>
> *Example:* 9/8 5/4 4/3 3/2 5/3 15/8 is the just major scale above 1/1.

See also: (none)

---

## Load .scl  (`loadScl`, hand (generator batch))

**Before** (one string):

> Reads a Scala scale file (the standard text format for tunings) and replaces the custom list with its notes. Example: a file from the Scala archive named "pyth_12.scl".

**After, tooltip:**

> **Load .scl**
>
> Reads a Scala scale file (the standard text format for tunings) and replaces the custom list with its notes.
>
> *Example:* a file from the Scala archive named "pyth_12.scl".

See also: (none)

---

## Prime filter  (`primeFilter`, hand (generator batch))

**Before** (one string):

> Switches off every note whose ratio uses a prime you have turned off. Example: with 11 and 13 off, Harmonics 8-15 loses 11/8 and 13/8, leaving a 7-limit field. Notes made only of cents (EDO steps) are not filtered.

**After, tooltip:**

> **Prime filter**
>
> Switches off every note whose ratio uses a prime you have turned off.
>
> *Example:* with 11 and 13 off, Harmonics 8-15 loses 11/8 and 13/8, leaving a 7-limit field.

**After, glossary adds** (below a rule):

> Notes made only of cents (EDO steps) are not filtered.

See also: primeLimit

---

## All primes  (`primeAll`, hand (generator batch))

**Before** (one string):

> Turns every prime on, so no note is filtered out. Example: use it to undo an earlier filter.

**After, tooltip:**

> **All primes**
>
> Turns every prime on, so no note is filtered out.
>
> *Example:* use it to undo an earlier filter.

See also: (none)

---

## No primes  (`primeNone`, hand (generator batch))

**Before** (one string):

> Turns every prime off. Then switch on just the ones you want. Example: none, then 3 and 5 gives a 5-limit field.

**After, tooltip:**

> **No primes**
>
> Turns every prime off. Then switch on just the ones you want.
>
> *Example:* none, then 3 and 5 gives a 5-limit field.

See also: (none)

---

## Pitch circle  (`pitchCircle`, hand)

**Before** (one string):

> Every field note placed round a circle by its pitch, the repeat being one full turn. Click a dot to include or exclude it; Alt+click pins it in the inspector (yellow ring) without changing the subset. Filled = in your subset, hollow = out; the pale grey shape joins the notes of the subset in circle order (the shape of the scale), under the blue shape of a highlighted chord; larger ring = sounding right now; a bold chevron outside the ring pointing in marks the mode root. Example: 3/2 sits just past the bottom of the circle, 702 of 1200 cents round.

**After, tooltip:**

> **Pitch circle**
>
> Every field note placed round a circle by its pitch; the repeat is one full turn. A filled dot is in your subset, a hollow one is out.
>
> Keys:
> - Click a dot: include or exclude it
> - Alt+click a dot: pin it in the inspector (yellow ring) without changing the subset
>
> *Example:* 3/2 sits just past the bottom of the circle, 702 of 1200 c round.

**After, glossary adds** (below a rule):

> The pale grey shape joins the notes of the subset in circle order (the shape of the scale), under the blue shape of a highlighted chord.
>
> A larger green dot means the note is sounding right now.
>
> A bold chevron outside the ring, pointing in, marks the mode root.

See also: (none)

---

## None  (`selectNone`, hand)

**Before** (one string):

> Empties the subset. Example: clear everything, then click just the dots you want.

**After, tooltip:**

> **None**
>
> Empties the subset.
>
> *Example:* clear everything, then click just the dots you want.

See also: (none)

---

## Mode root (chevron)  (`modeRoot`, hand)

**Before** (one string):

> A bold chevron marks the note the current mode starts on, in every view that draws single notes: outside the pitch circle and the key circle pointing in at the note, beside the note's tick on the tuner strip (a small pair, like >|<), above a lattice node pointing down, in the row of the field table, on its isomorphic-keyboard key and its mark on the dissonance curve. It is drawn in the plain text colour so it never clashes with the hover, pin, sounding or chord colours. Example: in C major, mode 2 starts on D (D dorian): the chevron moves from C to D, while the same seven notes stay selected.

**After, tooltip:**

> **Mode root (chevron)**
>
> A bold chevron marks the note the current mode starts on, in every view that draws single notes.
>
> *Example:* in C major, mode 2 starts on D (D dorian): the chevron moves from C to D, while the same seven notes stay selected.

**After, glossary adds** (below a rule):

> It sits outside the pitch circle and the key circle pointing in at the note, beside the note's tick on the tuner strip (a small pair of chevrons facing each other), above a lattice node pointing down, in the row of the field table, on its isomorphic-keyboard key and on its mark on the dissonance curve.
>
> It is drawn in the plain text colour so it never clashes with the hover, pin, sounding or chord colours.

See also: mode, subset

---

## Pick nearest  (`pickNearest`, hand)

**Before** (one string):

> Chooses the field notes closest to a known scale or to an equal division. The menu also has "m-ED" (the nearest notes to an equal division) and "Odd limit..." (keep only the notes whose odd limit is at most the number you enter). Example: choosing "Major" with 12-EDO targets selects, for each degree of the major scale, the field note nearest to it; choosing "Odd limit..." with 15 keeps 15/8 but drops 17/16.

**After, tooltip:**

> **Pick nearest**
>
> Chooses the field notes closest to a known scale or to an equal division.
>
> The menu also has "m-ED" (the nearest notes to an equal division) and "Odd limit..." (keep only the notes whose odd limit is at most the number you enter).
>
> *Example:* choosing "Major" with 12-EDO targets selects, for each degree of the major scale, the field note nearest to it; choosing "Odd limit..." with 15 keeps 15/8 but drops 17/16.

See also: (none)

---

## Add subset  (`addSubset`, hand)

**Before** (one string):

> Puts the current selection into the next new row of this generator, no name asked: it is called Subset 1, Subset 2 and so on, and you click its name to rename it. If a row with exactly these notes and the same mode root exists, that row lights up instead of making a copy. Example: pick the seven notes you like, press Add, and a row "Subset 1" appears and flashes.

**After, tooltip:**

> **Add subset**
>
> Puts the current selection into the next new row of this generator, no name asked: it is called Subset 1, Subset 2 and so on. If a row with exactly these notes and the same mode root exists, that row lights up instead of making a copy.
>
> Keys:
> - Click a row name: rename it
>
> *Example:* pick the seven notes you like, press Add, and a row "Subset 1" appears and flashes.

See also: savedSubsets, renameSaved

---

## Unassigned subsets  (`unassigned`, hand)

**Before** (one string):

> Subsets whose generator is gone (for example a built-in preset that was renamed in a newer version). They are kept, never deleted for you. Open the group and click one to apply its pitches to the current generator; if some pitches do not exist in it, a line says how many were missing. Example: a subset of 6 pitches loaded on a field that has 5 of them reports "1 of 6 pitches are not in this field".

**After, tooltip:**

> **Unassigned subsets**
>
> Subsets whose generator is gone (for example a built-in preset that was renamed in a newer version). They are kept, never deleted for you.
>
> Keys:
> - Open the group, click one: apply its pitches to the current generator
>
> *Example:* a subset of 6 pitches loaded on a field that has 5 of them reports "1 of 6 pitches are not in this field".

**After, glossary adds** (below a rule):

> If some pitches do not exist in the current generator, a line says how many were missing.

See also: savedSubsets

---

## Saved subsets  (`savedSubsets`, hand)

**Before** (one string):

> The subsets of this generator (the preset shown above), one row each, drawn like the tuner strip. Press Add to put the current selection in a new row; click a name to rename it; click a strip to load it; point at a row to preview it on the ring. Switching preset swaps the list, because subsets belong to their generator. Example: add the seven notes without 11/8, rename the row "No 11/8", change the selection, then click its strip to get them back.

**After, tooltip:**

> **Saved subsets**
>
> The subsets of this generator (the preset shown above), one row each, drawn like the tuner strip. Switching preset swaps the list, because subsets belong to their generator.
>
> Keys:
> - Add: put the current selection in a new row
> - Click a name: rename it
> - Click a strip: load it
> - Point at a row: preview it on the ring
>
> *Example:* add the seven notes without 11/8, rename the row "No 11/8", change the selection, then click its strip to get them back.

See also: (none)

---

## Tuner strip  (`tunerStrip`, hand)

**Before** (one string):

> Your scale laid out by pitch, with a faint reference line at every 100 c (1/1 as C): lighter where a piano white key would sit, darker for a black key. Saved subsets below use the same columns, so a note sits straight above and below itself. Each bar sits under its own dot: orange going up means that many cents sharp of its target, cyan going down means flat, and the printed number says how many. The letters under the notes are the steps between them. A small >|< pair of chevrons beside a note marks the mode root. Example: "+40.5" over 13/8 means a bit under half a semitone sharp of 12-EDO's A-flat. Hear a note against its target without changing anything: Ctrl+click (Cmd on a Mac) plays the note as listed, Shift+click plays its target (the note moved by its error, so +40.5 plays 40.5 c lower), and Ctrl+Shift+click plays both at once, held half as fast again, so a small difference is heard as a slow wobble (beating); a note with no error plays once, since there is nothing to beat against, and a pair shares the level so it is never louder than one note. The target tone lights only its own bar. Plain click still toggles the note and Alt+click still pins it. Or point at a note (or Tab to it) and hold a number key: 1 plays the note as listed, 2 its target, 3 both, and the sound lasts as long as you hold the key. Example: point at a note showing +40.5 and hold 3 to hear the beating for as long as you like; letting go stops it.

**After, tooltip:**

> **Tuner strip**
>
> Your scale laid out by pitch. Each bar sits under its own dot: orange going up means that many cents sharp of its target, cyan going down means flat, and the printed number says how many.
>
> Keys:
> - Click, Alt+click: toggle the note, pin it
> - Ctrl+click (Cmd on a Mac): play the note as listed
> - Shift+click: play its target
> - Ctrl+Shift+click: play both at once
> - [1], [2], [3]: point at a note and hold: listed, target, both
>
> *Example:* point at a note showing +40.5 and hold [3] to hear the beating for as long as you like; letting go stops it.

**After, glossary adds** (below a rule):

> A faint reference line sits at every 100 c (1/1 as C): lighter where a piano white key would sit, darker for a black key. Saved subsets below use the same columns, so a note sits straight above and below itself.
>
> The letters under the notes are the steps between them. A small pair of chevrons facing each other beside a note marks the mode root.
>
> *Example:* "+40.5" over 13/8 means a bit under half a semitone sharp of 12-EDO's A-flat.
>
> The target is the note moved by its error, so +40.5 plays 40.5 c lower. Ctrl+Shift+click plays both at once, held half as fast again, so a small difference is heard as a slow wobble (beating).
>
> A note with no error plays once, since there is nothing to beat against, and a pair shares the level so it is never louder than one note. The target tone lights only its own bar.
>
> You can also Tab to a note instead of pointing at it. The sound lasts as long as you hold the key.

See also: compareTo, cents

---

## Lattice axes (primes)  (`latticeAxes`, hand)

**Before** (one string):

> Which three primes become the three directions of the lattice, in 2D and in 3D. The list is ranked by fit: each choice shows how many of your selected notes sit on the grid with no stem (for example 3·5·7 — 7/7 on grid means all seven selected notes use only the primes 3, 5 and 7). The best fit is at the top; a tie goes to the choice whose notes are closer to 1/1. Auto, the default, always follows the best fit as you change the subset; pick a triple to keep it until you choose Auto again. Reading the primes: 3·5 is fifths and pure major thirds (classical just intonation), 3·7 is fifths plus harmonic sevenths. A note's place along an axis is its exponent of that prime; a note that uses another prime is drawn on a stem (see Off-axis notes). Example: with only 1/1, 3/2, 5/4 and 7/4 selected, 3·5·7 shows 4/4 on grid, while 3·5·11 shows 3/4 and puts 7/4 on a stem. Notes without a monzo (equal-division steps) cannot be placed and are left out of the count.

**After, tooltip:**

> **Lattice axes (primes)**
>
> Which three primes become the three directions of the lattice, in 2D and in 3D. The list is ranked by fit: each choice shows how many of your selected notes sit on the grid with no stem.
>
> Auto, the default, always follows the best fit as you change the subset; pick a triple to keep it until you choose Auto again.
>
> *Example:* with only 1/1, 3/2, 5/4 and 7/4 selected, 3·5·7 shows 4/4 on grid, while 3·5·11 shows 3/4 and puts 7/4 on a stem.

**After, glossary adds** (below a rule):

> For example 3·5·7 — 7/7 on grid means all seven selected notes use only the primes 3, 5 and 7.
>
> The best fit is at the top; a tie goes to the choice whose notes are closer to 1/1.
>
> Reading the primes: 3·5 is fifths and pure major thirds (classical just intonation), 3·7 is fifths plus harmonic sevenths.
>
> A note's place along an axis is its exponent of that prime; a note that uses another prime is drawn on a stem (see Off-axis notes).
>
> Notes without a monzo (equal-division steps) cannot be placed and are left out of the count.

See also: lattice, latticeStems, primePower

---

## Off-axis notes (stems)  (`latticeStems`, hand)

**Before** (one string):

> A note that uses a prime which is not one of the three chosen axes cannot sit on the grid, so it is drawn on a stem. A small hollow ring marks where it would be using the visible primes only. A dashed line in that prime's colour runs out from the ring, one lattice step long for each power of the prime, pointing the opposite way for a negative power. The note itself is the dot at the end, and its label carries a chip such as 11⁺¹ naming the hidden prime and its power (point at a chip to read what it means). Example: with axes 3, 5, 7, 11/8 has its ring at 1/1, one stem step of the 11 colour, and the chip 11⁺¹; 8/11 points the other way (11⁻¹); 143/128 has two stems chained, 11⁺¹ 13⁺¹.

**After, tooltip:**

> **Off-axis notes (stems)**
>
> A note that uses a prime which is not one of the three chosen axes cannot sit on the grid, so it is drawn on a stem. A small hollow ring marks where it would be using the visible primes only; the note itself is the dot at the end of a dashed line.
>
> *Example:* with axes 3, 5, 7, 11/8 has its ring at 1/1, one stem step of the 11 colour, and the chip 11⁺¹; 8/11 points the other way (11⁻¹).

**After, glossary adds** (below a rule):

> The dashed line is in that prime's colour, one lattice step long for each power of the prime, pointing the opposite way for a negative power.
>
> The note's label carries a chip such as 11⁺¹ naming the hidden prime and its power (point at a chip to read what it means).
>
> *Example:* 143/128 has two stems chained, 11⁺¹ 13⁺¹.

See also: latticeAxes, lattice3d, primePower

---

## Field table  (`fieldTable`, hand)

**Before** (one string):

> One line for every field note: ratio, cents and its distance from the nearest 12-EDO key, with a mark for whether it is in the subset and a chevron beside the mode root. Point at a line to light the note everywhere and read it in the inspector; click to include or exclude it, Alt+click to pin it in the inspector. "Open full table" shows every column with sorting. Example: the 13/8 line reads 840.5 c, "Ab +40.5": a note 40.5 c sharp of the piano A-flat.

**After, tooltip:**

> **Field table**
>
> One line for every field note: ratio, cents and its distance from the nearest 12-EDO key, with a mark for whether it is in the subset and a chevron beside the mode root.
>
> Keys:
> - Point at a line: light the note everywhere and read it in the inspector
> - Click: include or exclude it
> - Alt+click: pin it in the inspector
>
> *Example:* the 13/8 line reads 840.5 c, "Ab +40.5": a note 40.5 c sharp of the piano A-flat.

**After, glossary adds** (below a rule):

> "Open full table" shows every column with sorting.

See also: (none)

---

## Retuned notes | Different notes  (`fillTags`, mechanical split)

**Before** (one string):

> Compared with card 0 (home), degree by degree. Retuned notes: the same number of notes and every degree within 30 c of home's, a comma-sized change, so the card is the same scale tuned differently. Different notes: it substitutes notes, like a mode or a smaller subset. Example: a major scale with a 10/9 second is "retuned" (22 c off at one degree); Dorian is "different" (its second degree is 10/9 but its third is 32/27, 70 c from 5/4).

**After, tooltip:**

> **Retuned notes | Different notes**
>
> Compared with card 0 (home), degree by degree. Retuned notes: the same number of notes and every degree within 30 c of home's, a comma-sized change, so the card is the same scale tuned differently. Different notes: it substitutes notes, like a mode or a smaller subset.
>
> *Example:* a major scale with a 10/9 second is "retuned" (22 c off at one degree); Dorian is "different" (its second degree is 10/9 but its third is 32/27, 70 c from 5/4).

See also: (none)

---

## Trigger  (`trigger`, hand)

**Before** (one string):

> When the retuner decides. Auto runs every time a chord of two or more keys is held. Manual waits until you press Retune now. Example: choose Manual to set up a chord, then press Retune now once it is right.

**After, tooltip:**

> **Trigger**
>
> When the retuner decides. **Auto** runs every time a chord of two or more keys is held. **Manual** waits until you press **Retune now**.
>
> *Example:* choose Manual to set up a chord, then press Retune now once it is right.

See also: (none)

---

## Retune now  (`retuneNow`, hand)

**Before** (one string):

> Runs one retune on the keys held right now (used with the Manual trigger). Example: hold A, C and E, then press it to retune around them.

**After, tooltip:**

> **Retune now**
>
> Runs one retune on the keys held right now (used with the Manual trigger).
>
> *Example:* hold A, C and E, then press it to retune around them.

See also: (none)

---

## Analysis panels  (`analysisRail`, hand)

**Before** (one string):

> The list on the left picks which analysis panel shows on the right; the figure beside each name is a live summary of your current subset. Everything on the left and in the middle (generator, circle, tuner strip) is always visible. Example: "Chords 10" means ten chords are found at the current tolerance; click it to see them.

**After, tooltip:**

> **Analysis panels**
>
> The list on the left picks which analysis panel shows on the right; the figure beside each name is a live summary of your current subset. Everything on the left and in the middle (generator, circle, tuner strip) is always visible.
>
> *Example:* "Chords 10" means ten chords are found at the current tolerance; click it to see them.

See also: (none)

---

## Chords  (`chords`, hand)

**Before** (one string):

> Chord shapes (templates such as 4:5:6) that your subset contains. Sections are by number of notes; inside each, one row per family (Major, Septimal, ...). Every chip is one voicing: the template, its root, the field notes used and the largest error in cents. When two field notes are both close enough to a chord tone, each gets its own chip. Point at a chip and hold 1 to hear the chord for as long as you hold the key. Example: "4:5:6 @ 1/1, 1/1 5/4 3/2" is a just major triad on the root; hovering a chip lights its notes on the circle.

**After, tooltip:**

> **Chords**
>
> Chord shapes (templates such as 4:5:6) that your subset contains. Sections are by number of notes; inside each, one row per family (Major, Septimal, ...). Every chip is one voicing: the template, its root, the field notes used and the largest error in cents.
>
> Keys:
> - [1]: point at a chip and hold: hear the chord for as long as you hold the key
>
> *Example:* "4:5:6 @ 1/1, 1/1 5/4 3/2" is a just major triad on the root; hovering a chip lights its notes on the circle.

**After, glossary adds** (below a rule):

> When two field notes are both close enough to a chord tone, each gets its own chip.

See also: chordTolerance, templates, chordLadder, holdToPlay

---

## Chords inside this CPS  (`cpsChords`, hand)

**Before** (one string):

> A CPS (combination product set) is made by multiplying every k-sized group of a few chosen factors. With factors 1 3 5 7 and k = 2 you get the hexany: 1x3, 1x5, 1x7, 3x5, 3x7 and 5x7, each divided by the lowest so it starts at 1/1. The notes of such a set are related in a regular way, and the chords inside it are read straight from which factors the notes share, not by a template. Click a chip to hear it and keep it highlighted (click again to clear); Shift-click makes its notes the subset. Point at a chip and hold 1 to hear the chord for as long as you hold the key. Example: in that hexany the notes that all use the factor 1 are one otonal chord. Click the header to fold this section away (it is remembered).

**After, tooltip:**

> **Chords inside this CPS**
>
> The chords inside a CPS (combination product set), read straight from which factors the notes share, not by a template.
>
> Keys:
> - Click a chip: hear it and keep it highlighted (click again to clear)
> - Shift+click a chip: make its notes the subset
> - [1]: point at a chip and hold: hear the chord while you hold
> - Click the header: fold this section away (it is remembered)
>
> *Example:* in the hexany from factors 1 3 5 7 with k = 2, the notes that all use the factor 1 are one otonal chord.

**After, glossary adds** (below a rule):

> A CPS (combination product set) is made by multiplying every k-sized group of a few chosen factors.
>
> With factors 1 3 5 7 and k = 2 you get the hexany: 1x3, 1x5, 1x7, 3x5, 3x7 and 5x7, each divided by the lowest so it starts at 1/1.
>
> The notes of such a set are related in a regular way, and the chords inside it are read straight from which factors the notes share, not by a template.

See also: otonal, utonal, latticeMode, holdToPlay

---

## Utonal (subharmonic)  (`utonal`, mechanical split)

**Before** (one string):

> The mirror image of otonal: the notes are a slice of the undertone series, so the chord sounds as 1/x1:1/x2:1/x3. In a CPS these are the notes that sit inside the same larger group of factors, each leaving one factor out. Example: the notes 1x3, 1x5 and 3x5 all sit inside the factors 1, 3 and 5; they leave out 5, 3 and 1 in turn, giving the chord 1/1:1/3:1/5 (named by the factor each note leaves out, not listed by pitch).

**After, tooltip:**

> **Utonal (subharmonic)**
>
> The mirror image of otonal: the notes are a slice of the undertone series, so the chord sounds as 1/x1:1/x2:1/x3. In a CPS these are the notes that sit inside the same larger group of factors, each leaving one factor out.
>
> *Example:* the notes 1x3, 1x5 and 3x5 all sit inside the factors 1, 3 and 5; they leave out 5, 3 and 1 in turn, giving the chord 1/1:1/3:1/5 (named by the factor each note leaves out, not listed by pitch).

See also: otonal, cpsChords

---

## Chord families  (`chordFamily`, hand)

**Before** (one string):

> Chords are grouped by how many notes they have (triads, tetrads, larger), then by family, a label you can edit on each template: Major, Minor, Septimal, Utonal and so on. Templates without a family go in an "Other" row. Click the chevron header of the whole group, of a size (Triads, Tetrads, Larger) or of one family to fold it away; the count stays in the header and the choice is remembered. A chord sent to a composite carries its family (Septimal, ...). Example: 4:5:6 and 8:10:12:15 are both Major; 6:7:9 and 4:5:6:7 are Septimal.

**After, tooltip:**

> **Chord families**
>
> Chords are grouped by how many notes they have (triads, tetrads, larger), then by family, a label you can edit on each template: Major, Minor, Septimal, Utonal and so on. Templates without a family go in an "Other" row.
>
> Keys:
> - Click a chevron header: fold the whole group, a size (Triads, Tetrads, Larger) or one family; the count stays in the header and the choice is remembered
>
> *Example:* 4:5:6 and 8:10:12:15 are both Major; 6:7:9 and 4:5:6:7 are Septimal.

**After, glossary adds** (below a rule):

> A chord sent to a composite carries its family (Septimal, ...).

See also: templates

---

## Collapse all  (`collapseAllChords`, hand)

**Before** (one string):

> Folds every section of the Chords panel at once: the CPS chords, Positional and each pattern group, the ratio chords with every size and family row. The counts stay beside the names. Example: with the panel long and busy, press Collapse all, then open only the Major triads. The choice is remembered, like folding one section.

**After, tooltip:**

> **Collapse all**
>
> Folds every section of the Chords panel at once: the CPS chords, Positional and each pattern group, the ratio chords with every size and family row. The counts stay beside the names.
>
> *Example:* with the panel long and busy, press Collapse all, then open only the Major triads.

**After, glossary adds** (below a rule):

> The choice is remembered, like folding one section.

See also: expandAllChords

---

## Keys (transposition)  (`keysModes`, mechanical split)

**Before** (one string):

> The panel for moving your whole scale: transposition. A key is the same scale started on another field note, so every interval stays the same and only the starting pitch changes. This is different from a mode, which keeps the same notes and starts the scale on another degree (see Modes). Example: C major to G major is a key change (C D E F G A B becomes G A B C D E F#); C major to D dorian is a mode change (the same seven notes, now starting on D).

**After, tooltip:**

> **Keys (transposition)**
>
> The panel for moving your whole scale: transposition. A key is the same scale started on another field note, so every interval stays the same and only the starting pitch changes. This is different from a mode, which keeps the same notes and starts the scale on another degree (see Modes).
>
> *Example:* C major to G major is a key change (C D E F G A B becomes G A B C D E F#); C major to D dorian is a mode change (the same seven notes, now starting on D).

See also: modes, keyRings, keyView, commonTones

---

## Common tones (x|y)  (`commonTones`, mechanical split)

**Before** (one string):

> Under each key ring: x is how many notes the key shares with your current subset, y is how many notes the subset has. The bar is a separator, not a division. More shared notes means a closer key: a key with the same notes as the subset shows y|y. Example: for C major, the G major ring reads 6|7 (all but F, which becomes F#) and the F# major ring reads 2|7 (only B and F survive), so G major is a close key and F# major is a distant one.

**After, tooltip:**

> **Common tones (x|y)**
>
> Under each key ring: x is how many notes the key shares with your current subset, y is how many notes the subset has. The bar is a separator, not a division. More shared notes means a closer key: a key with the same notes as the subset shows y|y.
>
> *Example:* for C major, the G major ring reads 6|7 (all but F, which becomes F#) and the F# major ring reads 2|7 (only B and F survive), so G major is a close key and F# major is a distant one.

See also: keyView, keyRings

---

## Key comparison  (`keyView`, hand)

**Before** (one string):

> One large circle comparing your subset with a key. It shows the key you point at in the small rings, else the one you last clicked, else the current key (your subset itself, where everything is common). It goes back to the current key whenever the subset changes any other way (a new selection, preset, method, mode or tab). Everything sounding is lit green, and pointing at a note here lights it in every view. The bold chevron outside the circle marks the root note of the shown key (the mode root you would get by switching to it). The line under it counts the four groups in words. Example: from C major to G major it reads "6 common · +1 added · −1 dropped · 0 missing": F# would be added and F dropped.

**After, tooltip:**

> **Key comparison**
>
> One large circle comparing your subset with a key. It shows the key you point at in the small rings, else the one you last clicked, else the current key (your subset itself, where everything is common). The line under it counts the four groups in words.
>
> *Example:* from C major to G major it reads "6 common · +1 added · −1 dropped · 0 missing": F# would be added and F dropped.

**After, glossary adds** (below a rule):

> It goes back to the current key whenever the subset changes any other way (a new selection, preset, method, mode or tab).
>
> Everything sounding is lit green, and pointing at a note here lights it in every view.
>
> The bold chevron outside the circle marks the root note of the shown key (the mode root you would get by switching to it).

See also: keyMarks, keySwitch, keyAdd, commonTones

---

## Add key  (`keyAdd`, hand)

**Before** (one string):

> Adds the notes of the shown key to your subset and keeps everything you already have; the mode root stays where it is. Same as Shift+click on its small ring. Notes the field does not have cannot be added. Example: with C major and the G major key shown, Add gives the eight notes C D E F F# G A B (F stays, F# joins), still rooted on C.

**After, tooltip:**

> **Add key**
>
> Adds the notes of the shown key to your subset and keeps everything you already have; the mode root stays where it is. Notes the field does not have cannot be added.
>
> Keys:
> - Shift+click a small ring: the same as Add key
>
> *Example:* with C major and the G major key shown, Add gives the eight notes C D E F F# G A B (F stays, F# joins), still rooted on C.

See also: keySwitch, keyRings

---

## Note inspector  (`inspector`, hand)

**Before** (one string):

> Shows one row of the field table for the note you point at, or pinned with Alt+click, anywhere (circle, strip, keys, lattice): ratio, cents, monzo (prime exponents), nearest 12-EDO key and how far off it is. Example: pointing at 13/8 reads 840.53 c, monzo 2^-3 13, and about 40 c sharp of Ab.

**After, tooltip:**

> **Note inspector**
>
> Shows one row of the field table for the note you point at, or pinned, anywhere (circle, strip, keys, lattice): ratio, cents, monzo (prime exponents), nearest 12-EDO key and how far off it is.
>
> Keys:
> - Point at a note: show it here
> - Alt+click a note: pin it
>
> *Example:* pointing at 13/8 reads 840.53 c, monzo 2^-3 13, and about 40 c sharp of Ab.

See also: fieldTable

---

## Keep the mode root when notes are added or removed  (`keepModeRoot`, mechanical split)

**Before** (one string):

> On (the default): adding or removing a note keeps the same note as the mode root, so the mode number follows it. Off: the mode number stays and may now point at a different note. If the root itself is removed, the mode number stays either way. Example: with 1/1, 5/4, 3/2 and 15/8 selected on mode 2 (root 5/4), add 9/8. The set becomes 1/1, 9/8, 5/4, 3/2, 15/8: with this on, the root stays 5/4 and the mode becomes 3; with it off, the mode stays 2 and now starts on 9/8.

**After, tooltip:**

> **Keep the mode root when notes are added or removed**
>
> On (the default): adding or removing a note keeps the same note as the mode root, so the mode number follows it. Off: the mode number stays and may now point at a different note. If the root itself is removed, the mode number stays either way.
>
> *Example:* with 1/1, 5/4, 3/2 and 15/8 selected on mode 2 (root 5/4), add 9/8. The set becomes 1/1, 9/8, 5/4, 3/2, 15/8: with this on, the root stays 5/4 and the mode becomes 3; with it off, the mode stays 2 and now starts on 9/8.

See also: mode, developerMenu

---

## Shelf  (`shelfPanel`, hand)

**Before** (one string):

> Chords you stashed, each with the exact pitches that were heard and where they came from. Click a slot to hear it and keep it highlighted; point at it and hold 1 to hold it (on one of several selected slots, hold 1 layers all the selected ones). Click the name to rename, use the arrows to reorder, the copy button to reload the source of the chord as a new tab, the bin to delete. Tick several slots and press Play selected to hear them together. In Parallel a chord sounds from the 1/1 pitch, in Relative at the pitches it was stashed at. Example: stash a major triad on degree 1 and another on degree 5, tick both and press Play selected.

**After, tooltip:**

> **Shelf**
>
> Chords you stashed, each with the exact pitches that were heard and where they came from. In Parallel a chord sounds from the 1/1 pitch, in Relative at the pitches it was stashed at.
>
> Keys:
> - Click a slot: hear it and keep it highlighted
> - [1]: point at a slot and hold it (on one of several selected slots, all the selected ones layer)
> - Tick slots, Play selected: hear them together
>
> *Example:* stash a major triad on degree 1 and another on degree 5, tick both and press Play selected.

**After, glossary adds** (below a rule):

> Click the name to rename, use the arrows to reorder, the copy button to reload the source of the chord as a new tab, the bin to delete.
>
> The bin asks for a second click ("Delete?") before it deletes.

See also: sketchRow, stashChord, holdToPlay, modePlayback

---

## Composites  (`compositesPanel`, hand)

**Before** (one string):

> Up to nine numbered collections. Each gathers chords, subsets and single notes (from any generator, any tab) and merges their pitches onto ONE ring, a new gamut you can work on like any other. Pitches closer than the merge tolerance (5 c by default, set in the Developer menu) become one note. A row shows its number, name (click to rename), the merged note count, a small ring, and the items it holds (open them to remove one). Each item shows four lines: its template, kind and root (such as 4:5:6 major triad on 200.0 c; a positional chord shows its name such as 2-2 on 4), what it is and how many notes, its cents (a positional chord adds its tail), and its source. Point at an item to light, on the ring of its row, the notes it gives the composite. Open as tab makes a NEW tab with the merged notes as they are now; later changes to the composite do not touch that tab. Delete takes two clicks. Example: send a 12-EDO major triad and a just 4:5:6 to one composite; at 5 c they merge into 4 notes (400 c and 386.3 c stay apart, 700 c and 702 c become one).

**After, tooltip:**

> **Composites**
>
> Up to nine numbered collections of chords, subsets and single notes (from any generator, any tab), merged onto ONE ring: a new gamut you can work on like any other. Pitches closer than the merge tolerance (5 c by default, set in the Developer menu) become one note.
>
> Keys:
> - Click a name: rename it
>
> *Example:* send a 12-EDO major triad and a just 4:5:6 to one composite; at 5 c they merge into 4 notes (400 c and 386.3 c stay apart, 700 c and 702 c become one).

**After, glossary adds** (below a rule):

> A row shows its number, name, the merged note count, a small ring, and the items it holds (open them to remove one).
>
> Each item shows four lines: its template, kind and root (such as 4:5:6 major triad on 200.0 c; a positional chord shows its name such as 2-2 on 4), what it is and how many notes, its cents (a positional chord adds its tail), and its source.
>
> Point at an item to light, on the ring of its row, the notes it gives the composite.
>
> Open as tab makes a NEW tab with the merged notes as they are now; later changes to the composite do not touch that tab.
>
> Delete takes two clicks.

See also: sendToComposite, compositeOpen, shelfPanel

---

## Open as tab  (`compositeOpen`, hand)

**Before** (one string):

> Makes a new tab, at the end, whose generator is the Composite method: the merged notes of this composite as they are at this moment. Your other tabs are not touched. Every panel works on it (ring, keys, lattice, Sketch, shelf, Retuner). Changing or deleting the composite later changes nothing in that tab. Example: collect three chords, press Open as tab, then look for chords inside the new gamut.

**After, tooltip:**

> **Open as tab**
>
> Makes a new tab, at the end, whose generator is the Composite method: the merged notes of this composite as they are at this moment. Your other tabs are not touched.
>
> *Example:* with three chords collected, press **Open as tab**, then look for chords inside the new gamut.

**After, glossary adds** (below a rule):

> Every panel works on it (ring, keys, lattice, Sketch, shelf, Retuner).
>
> Changing or deleting the composite later changes nothing in that tab.

See also: compositesPanel

---

## Send to a composite (- key, right-click)  (`sendToComposite`, hand)

**Before** (one string):

> Point at a chord chip, a shelf chord, a saved subset, a key ring, a note anywhere or an item of a composite and press - (the minus key, plain). A small popup lists the composites by number: press 1 to 9 to send it there, 0 for a new composite, Esc to cancel. Each composite is drawn as a small ring: small dots are notes it already has, a plus is a new note, a filled mark merges into a note it has (within the merge tolerance), a struck-through mark is dropped because it doubles another pitch of the same item. An item already in a composite is greyed out and says so. The popup also lists the pitch values as text (cents for every note; ratio and monzo when sending Exact) and the note counts. Its Field | Exact slider starts on the choice made on the shelf and changes the preview and the send; it is disabled, with the reason, for a stashed shelf chord, a positional chord and anything without separate exact ratios. While the popup is open E flips the slider and the digit keys belong to it (no hold previews, Alt+digit tabs or Parallel | Relative on 0). Right-click the same things for a menu: a chord chip also offers Stash on shelf; Send to composite offers the three most recently used composites, New composite and All composites, and Shift+click on a composite sends in the other mode (Field or Exact). On the shelf, tick chords and use Add selected to composite. Example: point at the minor triad chip, press -, then 2.

**After, tooltip:**

> **Send to a composite (- key, right-click)**
>
> Sends what the pointer is on to a numbered composite: a chord chip, a shelf chord, a saved subset, a key ring, a note anywhere or an item of a composite. A small popup lists the composites; right-click the same things for a menu instead.
>
> Keys:
> - [-]: open the popup on what the pointer is on (again to close it); the plain key only, not with Ctrl, Alt, Cmd or Shift
> - 1 to 9: popup open: send it to that composite
> - 0: popup open: send it to a new composite
> - Esc: popup open: cancel
>
> *Example:* point at the minor triad chip, press [-], then 2.

**After, glossary adds** (below a rule):

> Each composite is drawn as a small ring: small dots are notes it already has, a plus is a new note, a filled mark merges into a note it has (within the merge tolerance), a struck-through mark is dropped because it doubles another pitch of the same item.
>
> An item already in a composite is greyed out and says so.
>
> The popup also lists the pitch values as text (cents for every note; ratio and monzo when sending Exact) and the note counts.
>
> Its Field | Exact slider starts on the choice made on the shelf and changes the preview and the send; it is disabled, with the reason, for a stashed shelf chord, a positional chord and anything without separate exact ratios.
>
> While the popup is open the E key flips the slider and the digit keys belong to it (no hold previews, Alt+digit tabs or Parallel | Relative on [0]).
>
> The right-click menu: a chord chip also offers **Stash on shelf**; **Send to composite** offers the three most recently used composites, **New composite** and **All composites**. Shift+click on a composite sends in the other mode (Field or Exact).
>
> On the shelf, tick chords and use **Add selected to composite**.

See also: compositesPanel, holdToPlay

---

## Positional chords  (`positionalChords`, hand)

**Before** (one string):

> Chords made by POSITION in the subset, not by ratios. A pattern says how many subset notes to step over: 2-2 takes every other note (a triad in a 7-note scale), 2-2-2 a four-note chord, 1-1 three neighbours, 2-3 and 3-2 mixed. Every degree of the subset gets one chord, smoothest first (Sethares roughness of its shape; no tolerance, so it works in any tuning). A row is named `2-2 on 4` (pattern and start degree); the second line says what it is in THIS tuning: `7 of 12-EDO` (subset size and generator), then the cents of each step, like `400-300 c`, and `~ 4:5:6` only when every note is within 5 c of a simple ratio chord. Every pattern is its own foldable group (click its header to fold it). Click a row to hear it, keep it highlighted and arm it in the Sketch row (hold 4 or 5 then puts the same chord on any note you point at; with the pointer on the row itself, 4 or 5 plays it on the Sketch row root); point and hold 1 to hear it while held; + stashes it with its pattern. Parallel puts the chord on its own root, Relative plays the real pitches. Example: in 12-EDO C major (7 notes), 2-2 on 1 is C E G (0, 400, 700 c) and 2-2 on 2 is D F A (200, 500, 900 c).

**After, tooltip:**

> **Positional chords**
>
> Chords made by POSITION in the subset, not by ratios. A pattern says how many subset notes to step over: 2-2 takes every other note (a triad in a 7-note scale). Every degree of the subset gets one chord, smoothest first.
>
> Keys:
> - Click a row: hear it, keep it highlighted, arm it in the Sketch row
> - [1]: point at a row and hold it to hear it while held
> - [4] or [5]: on any note you point at, the armed chord; on the row itself, it plays on the Sketch row root
> - The + button on a row: stash it with its pattern
>
> *Example:* in 12-EDO C major (7 notes), 2-2 on 1 is C E G (0, 400, 700 c) and 2-2 on 2 is D F A (200, 500, 900 c).

**After, glossary adds** (below a rule):

> Other patterns: 2-2-2 gives a four-note chord, 1-1 three neighbours, 2-3 and 3-2 mixed steps.
>
> Smoothest means the lowest Sethares roughness of its shape; there is no tolerance, so it works in any tuning.
>
> A row is named "2-2 on 4" (pattern and start degree). The second line says what it is in THIS tuning: "7 of 12-EDO" (subset size and generator), then the cents of each step, like "400-300 c", and "~ 4:5:6" only when every note is within 5 c of a simple ratio chord.
>
> Every pattern is its own foldable group: click its header to fold it.
>
> Parallel puts the chord on its own root, Relative plays the real pitches.

See also: positionalPatterns, sketchRow, stashChord, modePlayback

---

## Positional pattern group  (`positionalPick`, hand)

**Before** (one string):

> One step pattern of your own list, with one chord for every degree of the subset, ranked among the chords of this pattern only (rank 1 = smoothest of the group). Click the header to fold the group away; the row count stays in the header, and a folded group is not ranked until you open it. Add, edit, reorder and restore the patterns under Edit templates, Positional patterns. Example: 3-3 lists chords built from every third note, which are wider than triads, and 2-3 can be folded away while 2-2 stays open.

**After, tooltip:**

> **Positional pattern group**
>
> One step pattern of your own list, with one chord for every degree of the subset, ranked among the chords of this pattern only (rank 1 = smoothest of the group).
>
> Keys:
> - Click the header: fold the group away, or open it again
>
> *Example:* 3-3 lists chords built from every third note, which are wider than triads, and 2-3 can be folded away while 2-2 stays open.

**After, glossary adds** (below a rule):

> The row count stays in the header, and a folded group is not ranked until you open it.
>
> Add, edit, reorder and restore the patterns under **Edit templates**, Positional patterns.

See also: positionalChords, positionalPatterns

---

## Positional patterns (editor)  (`positionalPatterns`, hand)

**Before** (one string):

> Your list of step patterns, kept apart from the ratio templates. A pattern is digits 1 to 9 joined by dashes, 1 to 8 steps: 2-2, 2-3-2, 1-1-1. Edit a pattern in place (Enter or leaving the box keeps it, Escape gives the old text back), use the arrows to reorder, the bin to delete, and Add pattern for a new one. A pattern that is not valid or is already in the list is refused and the reason is shown under the list. Example: type 2-3-2 and press Add pattern; it joins the Positional picker and the Sketch row.

**After, tooltip:**

> **Positional patterns (editor)**
>
> Your list of step patterns, kept apart from the ratio templates. A pattern is digits 1 to 9 joined by dashes, 1 to 8 steps: 2-2, 2-3-2, 1-1-1.
>
> Keys:
> - Enter, or leave the box: keeps your edit of a pattern
> - Escape: gives the old text back
> - Arrows, bin: reorder, delete
> - **Add pattern**: adds a new one
>
> *Example:* type 2-3-2 and press **Add pattern**; it joins the Positional picker and the Sketch row.

**After, glossary adds** (below a rule):

> A pattern that is not valid or is already in the list is refused, and the reason is shown under the list.

See also: positionalChords, positionalRestore

---

## Field | Exact  (`sketchRealization`, hand)

**Before** (one string):

> Which pitches Play sketch and Stash use. Field: the chord as the field gives it (the shape of the chord you armed from a chip or shelf slot, else the template found at the Sketch root, errors included; a note the field lacks stays exact). Exact: the true ratios of the template. Example: in 12-EDO, 4:5:6 on the first note is 0, 400, 700 c in Field mode and 0, 386.3, 702 c exact. Holds 4 and 5 are the same two choices for any note you point at. The switch is off while a positional chord is picked in the Sketch row: it has no separate exact ratios, so Play sketch, Stash and holds 4 and 5 all use its field notes.

**After, tooltip:**

> **Field | Exact**
>
> Which pitches **Play sketch** and **Stash** use. Field: the chord as the field gives it (the shape of the chord you armed from a chip or shelf slot, else the template found at the Sketch root, errors included; a note the field lacks stays exact). Exact: the true ratios of the template.
>
> Keys:
> - [4] and [5]: the same two choices for any note you point at
>
> *Example:* in 12-EDO, 4:5:6 on the first note is 0, 400, 700 c in Field mode and 0, 386.3, 702 c exact.

**After, glossary adds** (below a rule):

> The switch is off while a positional chord is picked in the Sketch row: it has no separate exact ratios, so Play sketch, Stash and holds [4] and [5] all use its field notes.

See also: sketchRow, holdToPlay

---

## Sketch row  (`sketchRow`, hand)

**Before** (one string):

> Puts any chord template on any note of the subset, even when the field lacks some of its notes: Play sketch sounds the chord as the Field | Exact switch says (default Field: the chord as the field gives it; Exact: the true ratios). A note the field has is marked with the chord colour; one it lacks is dashed with its distance in cents to the nearest field note (+ means that note is above). The root stepper moves along the subset from the mode root (1 is the mode root). Example: 4:5:6:7 on a 12-EDO field shows the 7 as about -31 c, the nearest piano note being flatter than the true seventh harmonic. The template list also has a Positional group (your step patterns, such as 2-2): picking one makes the row show that positional chord at the root degree (its name and tail replace the template line), and Play sketch, Stash, = and holds 4 and 5 use it; picking a ratio template goes back.

**After, tooltip:**

> **Sketch row**
>
> Puts any chord template on any note of the subset, even when the field lacks some of its notes. **Play sketch** sounds the chord as the Field | Exact switch says (default Field: as the field gives it; Exact: the true ratios).
>
> Keys:
> - [=]: stash the current sketch on the shelf
> - [4] or [5]: point at any note and hold it to hear this chord there: as the field has it, or the exact ratios
>
> *Example:* 4:5:6:7 on a 12-EDO field shows the 7 as about -31 c, the nearest piano note being flatter than the true seventh harmonic.

**After, glossary adds** (below a rule):

> A note the field has is marked with the chord colour; one it lacks is dashed with its distance in cents to the nearest field note (+ means that note is above).
>
> The root stepper moves along the subset from the mode root (1 is the mode root).
>
> The template list also has a Positional group (your step patterns, such as 2-2). Picking one makes the row show that positional chord at the root degree, its name and tail replacing the template line; picking a ratio template goes back.
>
> Play sketch, Stash, [=] and holds [4] and [5] all use the positional chord while it is picked.

See also: stashChord, holdToPlay, chords

---

## Retuner  (`retunerPanel`, hand)

**Before** (one string):

> Re-roots a list of candidate scales around a held pivot note and picks the card whose predicted chord scores best. Example: hold C-E-G and the card with the purest 4:5:6 wins.

**After, tooltip:**

> **Retuner**
>
> Re-roots a list of candidate scales around a held pivot note and picks the card whose predicted chord scores best.
>
> *Example:* hold C-E-G and the card with the purest 4:5:6 wins.

See also: cards, why

---

## Ring view: Chromatic | Fifths  (`ringView`, mechanical split)

**Before** (one string):

> Chromatic places each note by its pitch, so the angle is its cents within the repeat. Fifths places notes along a chain of generator steps (3/2 by default), the way the circle of fifths does: neighbours on the ring are a fifth apart. Example: in Fifths, 3/2 sits one step clockwise of 1/1 and 9/8 two steps; 5/4 sits at step +4 with a small offset because the pure third is 21.5 c flatter than four stacked fifths.

**After, tooltip:**

> **Ring view: Chromatic | Fifths**
>
> Chromatic places each note by its pitch, so the angle is its cents within the repeat. Fifths places notes along a chain of generator steps (3/2 by default), the way the circle of fifths does: neighbours on the ring are a fifth apart.
>
> *Example:* in Fifths, 3/2 sits one step clockwise of 1/1 and 9/8 two steps; 5/4 sits at step +4 with a small offset because the pure third is 21.5 c flatter than four stacked fifths.

See also: ringMenu, offChain

---

## Subset only partly in these settings  (`subsetPartialMatch`, hand)

**Before** (one string):

> A slightly dimmed row with a halftone (dotted) bar at its left edge: some of the subset's pitches do not exist in the generator as it is now (for example after you edited it without pressing Update preset). Loading it still selects the pitches that do exist. The bar's hover says how many are found and which are missing. Example: a 7-note subset on a field that has 5 of its pitches shows: 5 of 7 notes in these settings. Missing: 7/4, 11/8.

**After, tooltip:**

> **Subset only partly in these settings**
>
> A slightly dimmed row with a halftone (dotted) bar at its left edge: some of the subset's pitches do not exist in the generator as it is now (for example after you edited it without pressing **Update preset**). Loading it still selects the pitches that do exist.
>
> Keys:
> - Point at the bar: says how many pitches are found and which are missing
>
> *Example:* a 7-note subset on a field that has 5 of its pitches shows: 5 of 7 notes in these settings. Missing: 7/4, 11/8.

See also: savedSubsets, subsetNoMatch

---

## Subset not in these settings  (`subsetNoMatch`, mechanical split)

**Before** (one string):

> A strongly dimmed row with a solid grey bar at its left edge: none of the subset's pitches exist in the generator as it is now, so clicking the row does nothing (you can still rename or delete it). Change the settings back, or open the generator it belongs to, to use it again. Example: a subset of 12-EDO notes seen while the tab is on a 7-limit just field shows: No notes in common with these settings.

**After, tooltip:**

> **Subset not in these settings**
>
> A strongly dimmed row with a solid grey bar at its left edge: none of the subset's pitches exist in the generator as it is now, so clicking the row does nothing (you can still rename or delete it). Change the settings back, or open the generator it belongs to, to use it again.
>
> *Example:* a subset of 12-EDO notes seen while the tab is on a 7-limit just field shows: No notes in common with these settings.

See also: savedSubsets, subsetPartialMatch

---

## Rename saved subset  (`renameSaved`, hand)

**Before** (one string):

> Click the name of a row to type a new one; Enter keeps it, Escape cancels. The notes stay the same. Example: rename "Subset 2" to "Dorian-ish".

**After, tooltip:**

> **Rename saved subset**
>
> Type a new name for a saved subset. The notes stay the same.
>
> Keys:
> - Click the name of a row: start typing a new one
> - Enter, or leave the box: keeps it
> - Escape: cancels
>
> *Example:* rename "Subset 2" to "Dorian-ish".

See also: savedSubsets

---

## Play this note  (`auditionNote`, hand)

**Before** (one string):

> Sounds this one field note for a moment at its own pitch above the 1/1 Hz setting, and lights it in every view. Example: press it on 5/4 to hear the major third before deciding to keep it.

**After, tooltip:**

> **Play this note**
>
> Sounds this one field note for a moment at its own pitch above the 1/1 Hz setting, and lights it in every view.
>
> *Example:* press it on 5/4 to hear the major third before deciding to keep it.

See also: baseHz

---

## Unpin  (`unpinNote`, hand)

**Before** (one string):

> The inspector keeps showing the note you pinned (Alt+click, or Alt+Enter on a focused note, in any view) until you unpin it: Alt+click it again or press the pinned label. A pinned note is marked in yellow in every view. A plain click only includes or excludes the note. Example: Alt+click 5/4 on the ring, move the mouse over other notes to compare, then unpin to go back to following the mouse.

**After, tooltip:**

> **Unpin**
>
> The inspector keeps showing the note you pinned until you unpin it. A pinned note is marked in yellow in every view. A plain click only includes or excludes the note.
>
> Keys:
> - Alt+click: pin a note in any view (Alt+Enter on a focused note)
> - Alt+click it again, or press the pinned label: unpin
>
> *Example:* Alt+click 5/4 on the ring, move the mouse over other notes to compare, then unpin to go back to following the mouse.

See also: inspector

---

## Saved subset  (`savedRow`, hand)

**Before** (one string):

> One saved selection of this pitch collection, drawn as a miniature tuner strip: a dot for every field note, bright when it is in the subset and dim when it is out, with small orange (sharp) and cyan (flat) bars for the distance from 12-EDO. A small chevron above a column marks the mode root of that subset. Pointing at a row previews it on the ring; clicking loads it. Point at a row and hold 1 to hear the subset as a scale from its mode root, for as long as you hold the key. Example: "Septimal tetrad 4:5:6:7" lights 1/1, 5/4, 3/2 and 7/4 and dims the rest.

**After, tooltip:**

> **Saved subset**
>
> One saved selection of this pitch collection, drawn as a miniature tuner strip: a dot for every field note, bright when it is in the subset and dim when it is out, with small orange (sharp) and cyan (flat) bars for the distance from the scale chosen in Compare to (12-EDO by default). A small chevron above a column marks the mode root of that subset.
>
> Keys:
> - Point at a row: preview it on the ring
> - Click: load it
> - [1]: point at a row and hold it to hear the subset as a scale from its mode root
>
> *Example:* "Septimal tetrad 4:5:6:7" lights 1/1, 5/4, 3/2 and 7/4 and dims the rest.

See also: savedSubsets, holdToPlay

---

## Pin as a column  (`pinPanel`, hand)

**Before** (one string):

> Gives this panel its own column beside the generator, so on a wide screen several analyses are visible at once. Click it and choose Pin left or Pin right: the column goes on that side, right next to the generator. Pinned columns can be moved left or right and reordered; the arrangement is remembered. A dimmed pin means it is pinned but there is no room for its column at this window width; it stays reachable through the switcher. Example: pin Keys & Modes and Chords on an ultrawide to watch both while you edit the subset.

**After, tooltip:**

> **Pin as a column**
>
> Gives this panel its own column beside the generator, so on a wide screen several analyses are visible at once. Pinned columns can be moved left or right and reordered; the arrangement is remembered.
>
> Keys:
> - Click the pin: choose **Pin left** or **Pin right**: the column goes on that side, right next to the generator
>
> *Example:* pin Keys & Modes and Chords on an ultrawide to watch both while you edit the subset.

**After, glossary adds** (below a rule):

> A dimmed pin means it is pinned but there is no room for its column at this window width; it stays reachable through the switcher.

See also: movePin, analysisRail

---

## Stack with  (`stackPin`, mechanical split)

**Before** (one string):

> Lists every other pinned panel whose column has room (a column holds up to three panels), with its side and how full it is, and moves this panel to the bottom of that column, so the panels share its height. It works across the generator and at any distance; a panel taken out of a stack leaves the others together. Disabled when every other column is full. Example: on Visualizer 3 - Dissonance curve choose "Visualizer 1 - Lattice (right, 1 of 3)" to see the lattice and the curve one above the other; then stack Visualizer 2 - EDO fit the same way to have all three in one column.

**After, tooltip:**

> **Stack with**
>
> Lists every other pinned panel whose column has room (a column holds up to three panels), with its side and how full it is, and moves this panel to the bottom of that column, so the panels share its height.
>
> *Example:* on Visualizer 3 - Dissonance curve choose "Visualizer 1 - Lattice (right, 1 of 3)" to see the lattice and the curve one above the other; then stack Visualizer 2 - EDO fit the same way to have all three in one column.

**After, glossary adds** (below a rule):

> It works across the generator and at any distance; a panel taken out of a stack leaves the others together. Disabled when every other column is full.

See also: pinPanel, unstackPin

---

## Stack splitter  (`splitter`, hand)

**Before** (one string):

> Drag this bar to change how a stacked column is shared, or focus it and press Up or Down to move it 5% (Home and End jump to its limits). A stack of three has two bars; each one only trades space between the two panels beside it. Every panel keeps at least 20% of the height or 6 rem, whichever is larger. Double-click either bar to go back to even shares. Example: drag the upper bar down to give Visualizer 1 - Lattice more room while Visualizer 3 - Dissonance curve stays the same size.

**After, tooltip:**

> **Stack splitter**
>
> The bar between two stacked panels, for changing how a stacked column is shared. A stack of three has two bars; each one only trades space between the two panels beside it.
>
> Keys:
> - Drag: change the shares
> - Up or Down (bar focused): move it 5%
> - Home or End: jump to its limits
> - Double-click either bar: back to even shares
>
> *Example:* drag the upper bar down to give Visualizer 1 - Lattice more room while Visualizer 3 - Dissonance curve stays the same size.

**After, glossary adds** (below a rule):

> Every panel keeps at least 20% of the height or 6 rem, whichever is larger.

See also: stackPin

---

## Visualizer view  (`vizView`, hand)

**Before** (one string):

> A visualizer panel can show any of five views: Lattice, EDO fit, Dissonance curve, Live roughness or Isomorphic keyboard (Live roughness follows what sounds now, the others follow the subset). The panel is named after the view it shows; pick another from this menu. There are five visualizer panels in the rail, so you can keep several views side by side. Example: leave the first visualizer on Lattice and switch the second to EDO fit to see the grid and the tuning fit together.

**After, tooltip:**

> **Visualizer view**
>
> A visualizer panel can show any of five views: Lattice, EDO fit, Dissonance curve, Live roughness or Isomorphic keyboard. The panel is named after the view it shows; pick another from this menu.
>
> *Example:* leave the first visualizer on Lattice and switch the second to EDO fit to see the grid and the tuning fit together.

**After, glossary adds** (below a rule):

> Live roughness follows what sounds now, the others follow the subset.
>
> There are five visualizer panels in the rail, so you can keep several views side by side.

See also: lattice, edoFit, dissCurve, liveRoughness, isoKeyboard

---

## Lattice axis mode  (`latticeMode`, hand)

**Before** (one string):

> What the directions of the lattice mean. Primes (always available): one direction per prime, so a note sits at its prime exponents, as in 3/2 is one step of 3. Generators: one direction per generator of the Lattice method (for example 3/2 and 5/4), so a note sits at how many steps of each generator it took; a line is one step of one generator. Factors: for a CPS, one direction per factor, a note sits where its factors are (the first factor in the centre, the others around it, which makes the hexany a star); a line joins two notes that swap one factor. Generators needs a field built by the Lattice method and Factors needs the CPS method; otherwise they are greyed out. Example: with the Lattice method and generators 3/2 and 5/4, Generators shows the fifth-by-third grid you typed in.

**After, tooltip:**

> **Lattice axis mode**
>
> What the directions of the lattice mean. **Primes** (always available): one direction per prime, so a note sits at its prime exponents; for example 3/2 is one step of 3.
>
> **Generators**: one direction per generator of the Lattice method (for example 3/2 and 5/4), so a note sits at how many steps of each generator it took; a line is one step of one generator.
>
> *Example:* with the Lattice method and generators 3/2 and 5/4, Generators shows the fifth-by-third grid you typed in.

**After, glossary adds** (below a rule):

> **Factors**: for a CPS, one direction per factor. A note sits where its factors are (the first factor in the centre, the others around it, which makes the hexany a star); a line joins two notes that swap one factor.
>
> Generators needs a field built by the Lattice method and Factors needs the CPS method; otherwise they are greyed out.

See also: lattice, latticeAltAxes, cpsChords

---

## Lattice 2D | 3D  (`latticeDim`, mechanical split)

**Before** (one string):

> Switches the lattice between a flat picture and a rotatable 3D one. 2D squeezes every prime onto a plane, so two notes can look close when they are not. 3D gives three primes their own real direction (3D is only for the prime lattice; Generators and Factors are drawn flat). Example: in 3D, 15/8 sits one step along the 3 axis and one along the 5 axis from 1/1, while 11/8 is drawn on a stem so it never overlaps a real note.

**After, tooltip:**

> **Lattice 2D | 3D**
>
> Switches the lattice between a flat picture and a rotatable 3D one. 2D squeezes every prime onto a plane, so two notes can look close when they are not. 3D gives three primes their own real direction (3D is only for the prime lattice; Generators and Factors are drawn flat).
>
> *Example:* in 3D, 15/8 sits one step along the 3 axis and one along the 5 axis from 1/1, while 11/8 is drawn on a stem so it never overlaps a real note.

See also: lattice, lattice3d

---

## 3D lattice  (`lattice3d`, hand)

**Before** (one string):

> The prime lattice in three dimensions. Each note is a small sphere placed by its prime exponents: how many steps of 3, of 5 and of 7 lie between it and 1/1. Neighbouring spheres joined by a line are one prime step apart. Drag to rotate, scroll to zoom, right-drag (or two-finger drag) to pan. Example: 9/8 is two steps out along the 3 axis, 5/4 one step along the 5 axis. A bold chevron floating above a sphere marks the mode root.

**After, tooltip:**

> **3D lattice**
>
> The prime lattice in three dimensions. Each note is a small sphere placed by its prime exponents: how many steps of 3, of 5 and of 7 lie between it and 1/1. Neighbouring spheres joined by a line are one prime step apart.
>
> Keys:
> - Drag: rotate
> - Scroll: zoom
> - Right-drag (or two-finger touch drag): pan
>
> *Example:* 9/8 is two steps out along the 3 axis, 5/4 one step along the 5 axis.

**After, glossary adds** (below a rule):

> A bold chevron floating above a sphere marks the mode root.

See also: lattice, latticeAxes, latticeStems, modeRoot

---

## 3D view  (`lattice3dView`, hand)

**Before** (one string):

> The 3D lattice itself. Drag to rotate, scroll to zoom, right-drag to pan. Point at a sphere to read the note in the inspector; click to include or exclude it, Alt+click to pin it (yellow halo). Bright spheres are in your subset, dim ones are in the field but left out, a green sphere is sounding, and a blue ring marks a note of the highlighted chord. A hollow ring with a dashed coloured line is the base and stem of an off-axis note. Example: hover 3/2 and the inspector shows 701.96 c.

**After, tooltip:**

> **3D view**
>
> The 3D lattice itself.
>
> Keys:
> - Drag: rotate
> - Scroll: zoom
> - Right-drag: pan
> - Point at a sphere: read the note in the inspector
> - Click: include or exclude the note
> - Alt+click: pin it (yellow halo)
>
> *Example:* hover 3/2 and the inspector shows 701.96 c.

**After, glossary adds** (below a rule):

> Bright spheres are in your subset, dim ones are in the field but left out, a green sphere is sounding, and a blue ring marks a note of the highlighted chord.
>
> A hollow ring with a dashed coloured line is the base and stem of an off-axis note.

See also: lattice3d, inspector

---

## EDO fit chart  (`edoChart`, hand)

**Before** (one string):

> The number of divisions n runs along the bottom (5 to 72) and the error in cents runs up the side. Each bar is the largest error of any subset note in that n-EDO; the dot is the average error. Taller than the top of the chart is clipped. The best few n are drawn in violet and named. Point at a bar to read it; click a bar to keep it highlighted. Example: a bar at n = 22 with a worst of 7.1 c means every note of the 1/1, 5/4, 3/2 triad is within 7.1 c of a 22-EDO step.

**After, tooltip:**

> **EDO fit chart**
>
> The number of divisions n runs along the bottom (5 to 72) and the error in cents runs up the side. Each bar is the largest error of any subset note in that n-EDO; the dot is the average error.
>
> Keys:
> - Point at a bar: read it
> - Click a bar: keep it highlighted
>
> *Example:* a bar at n = 22 with a worst of 7.1 c means every note of the 1/1, 5/4, 3/2 triad is within 7.1 c of a 22-EDO step.

**After, glossary adds** (below a rule):

> A bar taller than the top of the chart is clipped.
>
> The best few n are drawn in violet and named.

See also: edoFit, edoReadout

---

## Error relative to the step  (`edoRelative`, mechanical split)

**Before** (one string):

> The worst error divided by the size of one step of that division. Bigger divisions always shrink the error in cents, so this tells you whether a division fits better than its size alone would suggest. Example: 12-EDO's worst miss is 13.7 c (the major third 5/4) of a 100 c step (14 %); 22-EDO's worst miss is 7.1 c (the fifth 3/2) of a 54.5 c step (13 %), so they fit about equally well for their size.

**After, tooltip:**

> **Error relative to the step**
>
> The worst error divided by the size of one step of that division. Bigger divisions always shrink the error in cents, so this tells you whether a division fits better than its size alone would suggest.
>
> *Example:* 12-EDO's worst miss is 13.7 c (the major third 5/4) of a 100 c step (14 %); 22-EDO's worst miss is 7.1 c (the fifth 3/2) of a 54.5 c step (13 %), so they fit about equally well for their size.

See also: edoFit

---

## Scale marks on the curve  (`dissMarks`, mechanical split)

**Before** (one string):

> A vertical line at the cents of every field note. Bright lines are notes in your subset; faint lines are field notes you left out; green means sounding now; a small bold chevron above a line marks the mode root. Read where a line meets the curve: a line at the bottom of a dip means that interval, measured from 1/1, is smooth. Example: the 3/2 line sits in the deep dip at 702 c, so 3/2 is smooth against 1/1; a line that lands on a peak is rougher against 1/1.

**After, tooltip:**

> **Scale marks on the curve**
>
> A vertical line at the cents of every field note. Bright lines are notes in your subset; faint lines are field notes you left out; green means sounding now; a small bold chevron above a line marks the mode root.
>
> *Example:* the 3/2 line sits in the deep dip at 702 c, so 3/2 is smooth against 1/1; a line that lands on a peak is rougher against 1/1.

**After, glossary adds** (below a rule):

> Read where a line meets the curve: a line at the bottom of a dip means that interval, measured from 1/1, is smooth.

See also: dissCurve, dissDips

---

## Live roughness  (`liveRoughness`, hand)

**Before** (one string):

> The Sethares roughness of the notes sounding right now (field notes, notes outside the field, held keys and held chord previews), using the same seven-partial sound as the dissonance curve, with the lowest sounding note at its own pitch above the 1/1 Hz setting. It shows the total, one bar per pair of notes, and a curve of what the total would be if one more note were added. It updates as notes start and stop. Example: hold C, G and B of 12-EDO and the total is 4.79; hold C, F-sharp and A-flat and it is 6.70, so the first chord is smoother.

**After, tooltip:**

> **Live roughness**
>
> The Sethares roughness of the notes sounding right now (field notes, notes outside the field, held keys and held chord previews). It shows the total, one bar per pair of notes, and a curve of what the total would be if one more note were added.
>
> *Example:* hold C, G and B of 12-EDO and the total is 4.79; hold C, F-sharp and A-flat and it is 6.70, so the first chord is smoother.

**After, glossary adds** (below a rule):

> It uses the same seven-partial sound as the dissonance curve, with the lowest sounding note at its own pitch above the 1/1 Hz setting.
>
> It updates as notes start and stop.

See also: roughness, liveRoughTotal, liveRoughPairs, liveRoughCurve, dissCurve

---

## Isomorphic keyboard  (`isoKeyboard`, mechanical split)

**Before** (one string):

> A grid of hexagonal keys where an interval always has the same shape: one step right is the first generator (3/2 by default), one step up and to the right is the second (2/1 or 5/4). Each hexagon shows the field note nearest its pitch, if there is one within the tolerance; the rest stay blank. Example: with 3/2 and 2/1, a row of hexagons is a chain of fifths, so 1/1, 3/2, 9/8 run along it; with 5/4 as the second generator, up and right from 1/1 is the pure third 5/4.

**After, tooltip:**

> **Isomorphic keyboard**
>
> A grid of hexagonal keys where an interval always has the same shape: one step right is the first generator (3/2 by default), one step up and to the right is the second (2/1 or 5/4). Each hexagon shows the field note nearest its pitch, if there is one within the tolerance; the rest stay blank.
>
> *Example:* with 3/2 and 2/1, a row of hexagons is a chain of fifths, so 1/1, 3/2, 9/8 run along it; with 5/4 as the second generator, up and right from 1/1 is the pure third 5/4.

See also: isoG1, isoG2, isoTol, isoHex

---

## Up-right step (generator 2)  (`isoG2`, hand)

**Before** (one string):

> The interval for one hexagon up and to the right. Example: 2/1 makes each row up an octave higher, like a normal keyboard; 5/4 makes it a pure third higher, which fills the grid with just major triads.

**After, tooltip:**

> **Up-right step (generator 2)**
>
> The interval for one hexagon up and to the right.
>
> *Example:* 2/1 makes each row up an octave higher, like a normal keyboard; 5/4 makes it a pure third higher, which fills the grid with just major triads.

See also: isoKeyboard

---

## Hexagon  (`isoHex`, hand)

**Before** (one string):

> One key. Filled and bright: a note in your subset. Outlined: a field note that you left out. Blank: no field note near that pitch. A green dot means it is sounding now, a blue outline marks a note of the highlighted chord, and a small bold chevron at the top of the key marks the mode root. Point at a key to read it in the inspector; click to include or exclude the note, Alt+click to pin it (yellow outline). Example: the 3/2 key lights when you play 3/2 anywhere, and on every hexagon that lands on it.

**After, tooltip:**

> **Hexagon**
>
> One key. Filled and bright: a note in your subset. Outlined: a field note that you left out. Blank: no field note near that pitch.
>
> Keys:
> - Point at a key: read it in the inspector
> - Click: include or exclude the note
> - Alt+click: pin it (yellow outline)
>
> *Example:* the 3/2 key lights when you play 3/2 anywhere, and on every hexagon that lands on it.

**After, glossary adds** (below a rule):

> A green dot means it is sounding now, a blue outline marks a note of the highlighted chord, and a small bold chevron at the top of the key marks the mode root.

See also: isoKeyboard, inspector

---
