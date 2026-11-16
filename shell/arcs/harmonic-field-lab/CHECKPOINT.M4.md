# M4 checkpoint: wording of the 17 top bar and Sound entries

For your review (2026-11-16). Each entry shows the **before** text exactly as it was (commit `5a96413`) and the **after** exactly as it is now (commit `b43d915`). Keys are shown as `[0]`, `[1]` ... the way the renderer shows them from the shortcut table. The tooltip shows the "After, tooltip" part only; the glossary shows that part, a rule, then "glossary adds". `Example:` is always last in the tooltip and has a blank line above it.

The reviewer checked every entry and found no fact lost; every moved fact is in the glossary part.

## Look at these first

**Examples the builder wrote (the old text had none, or it had to be turned into a continuation). Please read these closely:**
- `linkedRootDefault`: new example (old text had none).
- `octShift`: new example (old text had none).
- `linkedMelody`: new example in the tooltip, and a second one in the glossary part.
- `linkedRoot`: new example. The reviewer found that "C major over D gives D major / D Dorian" is only true in Relative mode playback (in Parallel the scale's root sits on 1/1), so the linked-melody and linked-root examples now say "in Relative" or "heard in Relative".

**Places where the old text disagreed with the code, so the text changed:**
- `soundMenu`: the old text said the menu holds "where a mode root lands". The Sound popover actually holds Wave, 1/1 Hz, Volume and Scale preview. Its see-also list still points at mode playback; you may want scale preview there.
- `glossary`: the old text said hovering a label shows the same text as the glossary. Since M2 the tooltip shows only the short help.
- `duplicateTab`: the old `<name> copy` is now "named after the original with ' copy' added" (the guard test bans angle brackets). Same fact.
- `tabs`: gained a see-also link to `duplicateTab`.

**Style choices to confirm:**
- Bold only on names you can see on screen (Sine, Harmonic (7 partials), Parallel, Relative, Up, Up-down, Transpose, Re-root, Play scale, Play chord, Keys & Modes). "Melody root" and "Keyboard mode" are not bold because the controls only have a hidden label, not visible text.
- No italics anywhere except the `Example:` label.
- The Play buttons on screen read only "scale" and "chord" with a play icon; the entries keep the names "Play scale" and "Play chord".
- Not added: facts the old text lacked, such as the 12-tab limit or that the tab's cross only shows with more than one tab.

---

## Wave  (`wave`)

**Before** (one string, tooltip and glossary):

> The timbre the keys and Play buttons make. Sine is a pure tone with no overtones, so the slow beating between close notes is easiest to hear. Harmonic (7 partials) adds six overtones to every note, each 0.88 times as loud as the one below, which is the same sound the roughness score and the dissonance curve assume, so what you hear matches what they measure. Example: play 5/4 with 1/1 on Sine, then on Harmonic: the harmonic version beats less where the overtones line up (4:5) and more where they nearly miss.

**After, tooltip** (411 characters of prose):

> **Wave**
>
> The timbre the keys and Play buttons make. **Sine** is a pure tone with no overtones, so the slow beating between close notes is easiest to hear. **Harmonic (7 partials)** adds six overtones to every note, each 0.88 times as loud as the one below.
>
> *Example:* play 5/4 with 1/1 on **Sine**, then on **Harmonic (7 partials)**: the harmonic version beats less where the overtones line up (4:5) and more where they nearly miss.

**After, glossary adds** (below a rule, after the tooltip text):

> The harmonic wave is the same sound the roughness score and the dissonance curve assume, so what you hear matches what they measure.

See also: roughness

---

## 1/1 Hz  (`baseHz`)

**Before** (one string, tooltip and glossary):

> The pitch, in hertz, that the root of the scale (1/1) sounds at. Every other note is this frequency times its ratio. Example: 261.63 Hz is middle C, so 3/2 sounds at 392.44 Hz.

**After, tooltip** (174 characters of prose):

> **1/1 Hz**
>
> The pitch, in hertz, that the root of the scale (1/1) sounds at. Every other note is this frequency times its ratio.
>
> *Example:* with 1/1 at 261.63 Hz (middle C), 3/2 sounds at 392.44 Hz.

See also: modePlayback

---

## Volume  (`volume`)

**Before** (one string, tooltip and glossary):

> Output level of everything the lab plays. Chords add up, so a four-note chord is louder than one note at the same setting. Example: at 50 a single sine is comfortable; four notes together may need 30.

**After, tooltip** (190 characters of prose):

> **Volume**
>
> Output level of everything the lab plays. Chords add up, so a four-note chord is louder than one note at the same setting.
>
> *Example:* at 50 a single sine is comfortable; four notes together may need 30.

See also: (none)

---

## Play chord  (`playChord`)

**Before** (one string, tooltip and glossary):

> Plays a chord. If a chord is highlighted (point at a chord chip, or click one to keep it), it plays that chord at the chord's own pitches above the 1/1 Hz setting; otherwise it plays all selected notes together from the mode root. Example: with 1/1, 5/4 and 3/2 selected and nothing highlighted you hear a just major triad, 4:5:6; with the minor triad 10:12:15 on 5/4 highlighted you hear that triad instead.

**After, tooltip** (324 characters of prose):

> **Play chord**
>
> Plays a chord. If a chord is highlighted (point at a chord chip, or click one to keep it), it plays that chord at the chord's own pitches above the **1/1 Hz** setting. Otherwise it plays all selected notes together from the mode root.
>
> *Example:* with 1/1, 5/4 and 3/2 selected and nothing highlighted you hear a just major triad, 4:5:6.

**After, glossary adds** (below a rule, after the tooltip text):

> *Example:* with the minor triad 10:12:15 on 5/4 highlighted you hear that triad instead.

See also: (none)

---

## Stop  (`stop`)

**Before** (one string, tooltip and glossary):

> Silences everything that is sounding, including held keys. Example: press it if a note keeps sounding after you switch tabs.

**After, tooltip** (114 characters of prose):

> **Stop**
>
> Silences everything that is sounding, including held keys.
>
> *Example:* press it if a note keeps sounding after you switch tabs.

See also: (none)

---

## Tunings (tabs)  (`tabs`)

**Before** (one string, tooltip and glossary):

> Each tab is a separate tuning with its own generator settings, field and subset, so you can compare ideas without losing one. Click a tab to switch (Alt+1 to Alt+9 also works), double-click its name to rename it (clear the name to get the automatic one back), click the cross to close it, the copy button to duplicate it, and the plus to add a new one. Example: keep "Harmonics 8-15" in one tab and 19-EDO in another.

**After, tooltip** (180 characters of prose):

> **Tunings (tabs)**
>
> Each tab is a separate tuning with its own generator settings, field and subset, so you can compare ideas without losing one.
>
> Keys:
> - Click a tab: switch to it
> - Alt+1 to Alt+9: switch to that tab by number
> - Double-click its name: rename it
>
> *Example:* keep "Harmonics 8-15" in one tab and 19-EDO in another.

**After, glossary adds** (below a rule, after the tooltip text):

> Clear the name when renaming to get the automatic one back.
>
> The cross closes a tab, the copy button duplicates it (see Duplicate tab), and the plus adds a new one.

See also: duplicateTab  (changed from: none)

---

## Duplicate tab  (`duplicateTab`)

**Before** (one string, tooltip and glossary):

> Copies the current tuning into a new tab right after it, named "<name> copy": same generator settings, same selected notes, same mode root. Change the copy freely and the original stays as it was. Example: duplicate "Harmonics 8-15", then switch the copy to a different starting harmonic to compare the two.

**After, tooltip** (321 characters of prose):

> **Duplicate tab**
>
> Copies the current tuning into a new tab right after it, named after the original with " copy" added: same generator settings, same selected notes, same mode root. Change the copy freely and the original stays as it was.
>
> *Example:* duplicate "Harmonics 8-15", then switch the copy to a different starting harmonic to compare the two.

See also: tabs

---

## Mode playback (Parallel | Relative)  (`modePlayback`)

**Before** (one string, tooltip and glossary):

> Where the current mode sounds: mode previews, Play scale, Play chord and the computer keys (z is the mode root). In C major, Mode 2 is Dorian. Parallel plays it from the 1/1 pitch (C Dorian), the way the grid measures it, so the tonic stays put and the scale changes around it; Relative plays it from its own root 9/8 (D Dorian), so every note keeps its own pitch. In mode previews the listed-vs-pure comparison is the same, only moved. Press 0 to switch. In Relative a sounding tone lights a field note only where it lands exactly on one.

**After, tooltip** (444 characters of prose):

> **Mode playback (Parallel | Relative)**
>
> Where the current mode sounds: mode previews, **Play scale**, **Play chord** and the computer keys (z is the mode root). **Parallel** plays it from the 1/1 pitch, the way the grid measures it, so the tonic stays put and the scale changes around it. **Relative** plays it from its own root, so every note keeps its own pitch.
>
> Keys:
> - [0]: switch Parallel | Relative
>
> *Example:* in C major, Mode 2 is Dorian: Parallel plays C Dorian from the 1/1 pitch, Relative plays D Dorian from its own root 9/8.

**After, glossary adds** (below a rule, after the tooltip text):

> In mode previews the listed-vs-pure comparison is the same, only moved.
>
> In Relative a sounding tone lights a field note only where it lands exactly on one.

See also: modes, holdToPlay, baseHz, mode

---

## Keyboard mode (Notes | Chords | Split)  (`keyboardMode`)

**Before** (one string, tooltip and glossary):

> What the computer keys play. Notes: z x c v b n m a s d f g h j k l are the melody keys (the subset, degree by degree). Chords: q w e r t y u i o p play the first ten shelf chords of the current page, in shelf order; [ and ] page the shelf by ten. Split: the melody keys play the subset and q to p play shelf chords at the same time. Keys sound while held. The modes also take over the keys while the retuner is live (the dock shows the mode). Example: Split, stash a few chords, then hold q for a chord and play a melody over it. Other keys: 0 switches Parallel | Relative, = stashes the Sketch, , and . shift the melody, Alt+1 to Alt+9 switch tabs, and - (while pointing at something) opens the composite popup, which takes the digits while it is open.

**After, tooltip** (349 characters of prose):

> **Keyboard mode (Notes | Chords | Split)**
>
> What the computer keys play. **Notes**: z x c v b n m a s d f g h j k l are the melody keys (the subset, degree by degree). **Chords**: q w e r t y u i o p play the first ten shelf chords of the current page, in shelf order. **Split**: both at once. Keys sound while held.
>
> Keys:
> - [[]: previous page of the shelf (ten chords)
> - []]: next page of the shelf (ten chords)
>
> *Example:* Split, stash a few chords, then hold q for a chord and play a melody over it.

**After, glossary adds** (below a rule, after the tooltip text):

> The modes also take over the keys while the retuner is live (the dock shows the mode).
>
> Other keys:
>
> Keys:
> - [0]: switches Parallel | Relative
> - [=]: stashes the Sketch
> - [,] and [.]: shift the melody down or up
> - Alt+1 to Alt+9: switch tabs
> - [-]: while pointing at something, opens the composite popup, which takes the digits while it is open

See also: linkedMelody, shelfPanel, octShift, keyboardDock, sendToComposite

---

## Linked melody  (`linkedMelody`)

**Before** (one string, tooltip and glossary):

> Off by default. When on (Split mode), pressing a chord key makes the melody keys play the scale the chord came from (its source subset), on the chord's own root, following Parallel | Relative like the shelf does. Melody root decides how: Transpose moves the source scale rigidly so its mode root lands on the chord's root (a C major scale over a C chord, a D major scale over a D chord); Re-root plays the same notes of the source scale starting from the chord's root (D E F G A B C over D) and falls back to Transpose when the root is not one of them. Audio only: the views stay on the current tab and light only where a sounding pitch matches one of its notes (a ghost mark shows the rest). The last chord pressed stays linked until you press another chord key, change the mode or this option, or switch tab. A chord with no source leaves the melody on the active subset.

**After, tooltip** (356 characters of prose):

> **Linked melody**
>
> Off by default. When on (Split mode), pressing a chord key makes the melody keys play the scale the chord came from (its source subset), on the chord's own root, following Parallel | Relative like the shelf does. Melody root decides how.
>
> *Example:* a chord whose source scale is C major, rooted on D, heard in Relative: with **Transpose** the melody keys play D major.

**After, glossary adds** (below a rule, after the tooltip text):

> **Transpose** moves the source scale rigidly so its mode root lands on the chord's root (a C major scale over a C chord, a D major scale over a D chord).
>
> **Re-root** plays the same notes of the source scale starting from the chord's root, and falls back to Transpose when the root is not one of them.
>
> *Example:* Re-root over a D chord, with C major as the source scale: D E F G A B C.
>
> Audio only: the views stay on the current tab and light only where a sounding pitch matches one of its notes (a ghost mark shows the rest).
>
> The last chord pressed stays linked until you press another chord key, change the mode or this option, or switch tab.
>
> A chord with no source leaves the melody on the active subset.

See also: keyboardMode, linkedRoot, shelfPanel, modePlayback

---

## Melody root (Transpose | Re-root)  (`linkedRoot`)

**Before** (one string, tooltip and glossary):

> How the linked melody sits on the chord's root. Transpose: the source scale keeps its shape and moves so its mode root is the chord's root (C major over D becomes D major, so some notes may be off the current field and show as ghosts). Re-root: the scale keeps its own notes and is read from the chord's root (C major over D becomes D Dorian); if the root is not a note of the scale, Transpose is used for that chord. Shown while Linked melody is on. Until you choose, the Developer menu default applies.

**After, tooltip** (298 characters of prose):

> **Melody root (Transpose | Re-root)**
>
> How the linked melody sits on the chord's root. **Transpose**: the source scale keeps its shape and moves so its mode root is the chord's root. **Re-root**: the scale keeps its own notes and is read from the chord's root.
>
> *Example:* in Relative, C major over D: Transpose gives D major, Re-root gives D Dorian.

**After, glossary adds** (below a rule, after the tooltip text):

> With Transpose some notes may be off the current field and show as ghosts.
>
> If the root is not a note of the scale, Transpose is used for that chord.
>
> Shown while **Linked melody** is on.
>
> Until you choose, the Developer menu default applies.

See also: linkedMelody, linkedRootDefault

---

## Linked melody root default  (`linkedRootDefault`)

**Before** (one string, tooltip and glossary):

> Which Melody root (Transpose or Re-root) the linked melody uses until you pick one in the top bar. Once you pick, your choice is stored and this default no longer matters. Changing it here changes the current default straight away if you have not picked.

**After, tooltip** (334 characters of prose):

> **Linked melody root default**
>
> Which Melody root (Transpose or Re-root) the linked melody uses until you pick one in the top bar. Once you pick, your choice is stored and this default no longer matters.
>
> *Example:* with this default on Re-root and nothing picked in the top bar, the linked melody re-roots; once you pick Transpose there, it transposes whatever the default says.

**After, glossary adds** (below a rule, after the tooltip text):

> Changing it here changes the current default straight away if you have not picked.

See also: linkedRoot, linkedMelody, developerMenu

---

## Octave shift (, and .)  (`octShift`)

**Before** (one string, tooltip and glossary):

> Press , to move the melody keys down and . to move them up by one repeat of the generator (an octave for 2/1, a tritave for Bohlen-Pierce 3/1), up to 4 either way. A key you are already holding keeps its pitch. It applies to the retuner's keys too and resets when the page reloads.

**After, tooltip** (224 characters of prose):

> **Octave shift (, and .)**
>
> Moves the melody keys down or up by one repeat of the generator (an octave for 2/1, a tritave for Bohlen-Pierce 3/1), up to 4 either way.
>
> Keys:
> - [,]: down one repeat
> - [.]: up one repeat
>
> *Example:* in a 2/1 scale, press [.] twice and the melody keys sound two octaves higher.

**After, glossary adds** (below a rule, after the tooltip text):

> A key you are already holding keeps its pitch.
>
> It applies to the retuner's keys too and resets when the page reloads.

See also: keyboardMode, keyboardDock

---

## Scale preview  (`scalePreview`)

**Before** (one string, tooltip and glossary):

> How every scale preview runs, both Play scale and the preview of a key in Keys & Modes. Up plays the notes from the root up to the repeat. Up-down plays up and then comes back down to the root. Example: for 1/1, 9/8, 5/4 and a 2/1 repeat, Up plays 1/1 9/8 5/4 2/1; Up-down plays 1/1 9/8 5/4 2/1 5/4 9/8 1/1.

**After, tooltip** (313 characters of prose):

> **Scale preview**
>
> How every scale preview runs, both **Play scale** and the preview of a key in **Keys & Modes**. **Up** plays the notes from the root up to the repeat. **Up-down** plays up and then comes back down to the root.
>
> *Example:* for 1/1, 9/8, 5/4 and a 2/1 repeat, Up plays 1/1 9/8 5/4 2/1; Up-down plays 1/1 9/8 5/4 2/1 5/4 9/8 1/1.

See also: playScale, keyRings

---

## Glossary  (`glossary`)

**Before** (one string, tooltip and glossary):

> Every explanation in the lab in one searchable list. Hovering any label shows the same text. Example: search "comma" to find the syntonic comma and the drift readout.

**After, tooltip** (194 characters of prose):

> **Glossary**
>
> Every explanation in the lab in one searchable list. Hovering a label shows its short help; the glossary adds the longer teaching.
>
> *Example:* search "comma" to find the syntonic comma and the drift readout.

See also: (none)

---

## Keyboard  (`keyboardDock`)

**Before** (one string, tooltip and glossary):

> The notes of your subset as playable keys, one octave from the mode root. Click a key or press z, x, c, v, b, n, m and then a, s, d, f, g, h, j, k, l (16 keys) to climb up the subset; , and . shift the whole melody down or up by one repeat (Oct in the dock). The Keyboard mode switch can give the top row q to p to the shelf chords. The dock stays at the bottom so the keys are always next to the views they light. Example: collapse it when you only want to read; open it to play the scale while watching the circle.

**After, tooltip** (275 characters of prose):

> **Keyboard**
>
> The notes of your subset as playable keys, one octave from the mode root. Click a key or press z, x, c, v, b, n, m and then a, s, d, f, g, h, j, k, l (16 keys) to climb up the subset.
>
> Keys:
> - [,]: shift the whole melody down by one repeat (Oct in the dock)
> - [.]: shift the whole melody up by one repeat (Oct in the dock)
>
> *Example:* collapse it when you only want to read; open it to play the scale while watching the circle.

**After, glossary adds** (below a rule, after the tooltip text):

> The Keyboard mode switch can give the top row q to p to the shelf chords.
>
> The dock stays at the bottom so the keys are always next to the views they light.

See also: (none)

---

## Sound settings  (`soundMenu`)

**Before** (one string, tooltip and glossary):

> Wave shape, the pitch of 1/1 in hertz, volume and where a mode root lands. Example: set 1/1 to 261.63 Hz for middle C and pick Sine to hear beating most clearly.

**After, tooltip** (170 characters of prose):

> **Sound settings**
>
> Wave shape, the pitch of 1/1 in hertz, volume and the direction of scale previews.
>
> *Example:* set **1/1 Hz** to 261.63 Hz for middle C and pick **Sine** to hear beating most clearly.

See also: wave, baseHz, volume, modePlayback

---
