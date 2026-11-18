/**
 * One source of truth for every explanation in the lab. A hover tooltip shows an entry's help; the glossary drawer lists the
 * same entries (searchable) with their `see` links, adding the teaching blocks after the help. Written plainly, each with a
 * worked example. The glossary's single source: every control, heading and analysis row of the lab has an entry here.
 *
 * Two forms are accepted (rules: the page ARCHITECTURE.md, "Help text: tooltips and glossary"; design record: `arcs/harmonic-field-lab/HELP-FORMAT.md`):
 * - old: `{ term, text }`, one string; the permanent form for short entries with no key or click gesture (it is cut at its
 *   `Example:` into a paragraph and an example block);
 * - new: `{ term, help, teaching?, see? }`, arrays of blocks (`p`, `example`, `keys`). Block text is markup: `**bold**`,
 *   `*italic*`, `{key:name}` (a key from `audio/shortcuts.ts`).
 */
import { legacyBlocks, plainText, type Block } from './markup';

export type { Block } from './markup';

/** An entry as written in this file. */
export type TextEntrySource =
  | { term: string; text: string; see?: readonly string[] }
  | {
      term: string;
      /** Shown in the tooltip and the glossary. About 300 to 500 characters. */
      help: readonly Block[];
      /** Shown in the glossary only, after the help. */
      teaching?: readonly Block[];
      see?: readonly string[];
    };

/** An entry as read everywhere else: both forms normalized. */
export interface TextEntry {
  /** Name shown as the glossary term. */
  term: string;
  /** All text as one plain string (markup removed): search, native `title`s, old readers. */
  text: string;
  /** The tooltip blocks (an old-form entry: its `text` cut into a paragraph and its `Example:` blocks). */
  help: readonly Block[];
  /** The glossary-only blocks (empty for an old-form entry). */
  teaching: readonly Block[];
  /** True for an old-form entry (still a single string in `texts.ts`; rendered through the same blocks as the new form). */
  legacy: boolean;
  /** Other entries worth reading next. */
  see?: readonly string[];
}

const p = (text: string): Block => ({ kind: 'p', text });
const example = (text: string): Block => ({ kind: 'example', text });
const keys = (rows: readonly { key: string; does: string }[]): Block => ({ kind: 'keys', rows });

function blockText(b: Block): string {
  return b.kind === 'keys'
    ? b.rows.map((r) => `${plainText(r.key)} ${plainText(r.does)}`).join(' ')
    : `${b.kind === 'example' ? 'Example: ' : ''}${plainText(b.text)}`;
}

export function normalizeEntry(src: TextEntrySource): TextEntry {
  if ('text' in src) {
    return {
      term: src.term,
      text: src.text,
      help: legacyBlocks(src.text),
      teaching: [],
      legacy: true,
      see: src.see,
    };
  }
  const teaching = src.teaching ?? [];
  return {
    term: src.term,
    text: [...src.help, ...teaching].map(blockText).join(' '),
    help: src.help,
    teaching,
    legacy: false,
    see: src.see,
  };
}
const entries = {
  /* ---- top bar ---- */
  wave: {
    term: 'Wave',
    help: [
      p(
        'The timbre the keys and Play buttons make. **Sine** is a pure tone with no overtones, so the slow beating between close notes is easiest to hear. **Harmonic** adds overtones to every note, each a fixed fraction (the rolloff) as loud as the one below: 7 partials and 0.88 by default, or the Roughness Partials and Rolloff (see the Developer option).'
      ),
      example(
        'play 5/4 with 1/1 on **Sine**, then on **Harmonic**: the harmonic version beats less where the overtones line up (4:5) and more where they nearly miss.'
      ),
    ],
    teaching: [
      p(
        'The harmonic wave is the same sound the roughness score and the dissonance curve assume, so what you hear matches what they measure. With the Developer option on (the default) a change of the Roughness Partials or Rolloff is heard from the next note on; a note already sounding keeps its wave.'
      ),
    ],
    see: ['roughness', 'soundFollowsRoughness', 'scorerOptions'],
  },
  baseHz: {
    term: '1/1 Hz',
    help: [
      p(
        'The pitch, in hertz, that the root of the scale (1/1) sounds at. Every other note is this frequency times its ratio.'
      ),
      example('with 1/1 at 261.63 Hz (middle C), 3/2 sounds at 392.44 Hz.'),
    ],
    see: ['modePlayback'],
  },
  volume: {
    term: 'Volume',
    help: [
      p(
        'Output level of everything the lab plays. Chords add up, so a four-note chord is louder than one note at the same setting.'
      ),
      example('at 50 a single sine is comfortable; four notes together may need 30.'),
    ],
  },
  reverb: {
    term: 'Reverb',
    help: [
      p(
        'One reverb shared by every note: the sound of a space around the notes. **Dry** adds nothing (the default: exactly the sound without a reverb). **Room** has a short tail of about 0.9 s, **Hall** a long one of about 2.8 s, **Custom** uses an impulse you loaded. The Stop button cuts a ringing tail.'
      ),
      example('pick **Hall**, play a chord and let go: it keeps ringing for about 2.8 s.'),
    ],
    teaching: [
      p(
        'Room and Hall are made from decaying noise and are the same every time. A reverb smears the beating you hear between close notes, so judge beating on Dry.'
      ),
    ],
    see: ['reverbMix', 'reverbImpulse', 'volume'],
  },
  reverbMix: {
    term: 'Reverb mix',
    help: [
      p(
        'How much of what you hear is the reverb, from 0 (none) to 100 (only the reverb). The two parts are balanced so the loudness stays about the same as you move it. It does nothing while the preset is Dry.'
      ),
      example('Hall at 30 puts the chord in a room; at 100 you hear only the tail.'),
    ],
    see: ['reverb'],
  },
  reverbImpulse: {
    term: 'Load impulse',
    help: [
      p(
        'Picks an audio file whose sound is a space recorded as one click (an impulse response); the reverb then sounds like that space. WAV, AIFF, MP3 or OGG as far as your browser reads them, mono or stereo, at most 12 s and 8 MB. It is kept in this browser across reloads. **Remove custom impulse** deletes it and goes back to Hall.'
      ),
      example('a 2.4 s recording of a stairwell makes every note ring like the stairwell.'),
    ],
    see: ['reverb'],
  },
  soundFollowsRoughness: {
    term: 'Sound follows Roughness',
    help: [
      p(
        'A Developer option, on by default. On: the harmonic sound uses the Partials and Rolloff of the Retuner roughness scorer (the sound stops at 16 partials and a rolloff between 0.5 and 1), so what you hear is what the roughness numbers assume. A note already sounding keeps its wave. Off: 7 partials and 0.88, as before. Sine has no partials.'
      ),
      example(
        'Partials 3 and Rolloff 0.88: the next note has three partials at 1, 0.88 and 0.77; set Partials to 12 and the next note has twelve.'
      ),
    ],
    see: ['wave', 'scorerOptions', 'developerMenu'],
  },
  playScale: {
    term: 'Play scale',
    help: [
      p('Plays the selected notes one after another, from the mode root up to the repeat.'),
      example('with 1/1, 9/8, 5/4 selected you hear those three notes in turn, then the repeat.'),
    ],
    teaching: [
      p('Each note lights up in every view while it sounds.'),
      p(
        'If Scale preview is set to Up-down in the Sound settings, the scale also comes back down after the repeat.'
      ),
    ],
  },
  playChord: {
    term: 'Play chord',
    help: [
      p(
        "Plays a chord. If a chord is highlighted (point at a chord chip, or click one to keep it), it plays that chord at the chord's own pitches above the **1/1 Hz** setting. Otherwise it plays all selected notes together from the mode root."
      ),
      example(
        'with 1/1, 5/4 and 3/2 selected and nothing highlighted you hear a just major triad, 4:5:6.'
      ),
    ],
    teaching: [
      example('with the minor triad 10:12:15 on 5/4 highlighted you hear that triad instead.'),
    ],
  },
  stop: {
    term: 'Stop',
    help: [
      p('Silences everything that is sounding, including held keys.'),
      example('press it if a note keeps sounding after you switch tabs.'),
    ],
  },
  tabs: {
    term: 'Tunings (tabs)',
    help: [
      p(
        'Each tab is a separate tuning with its own generator settings, field and subset, so you can compare ideas without losing one.'
      ),
      keys([
        { key: 'Click a tab', does: 'switch to it' },
        { key: 'Alt+1 to Alt+9', does: 'switch to that tab by number' },
        { key: 'Double-click its name', does: 'rename it' },
      ]),
      example('keep "Harmonics 8-15" in one tab and 19-EDO in another.'),
    ],
    teaching: [
      p('Clear the name when renaming to get the automatic one back.'),
      p(
        'The cross closes a tab, the copy button duplicates it (see Duplicate tab), and the plus adds a new one.'
      ),
    ],
    see: ['duplicateTab'],
  },
  duplicateTab: {
    term: 'Duplicate tab',
    help: [
      p(
        'Copies the current tuning into a new tab right after it, named after the original with " copy" added: same generator settings, same selected notes, same mode root. Change the copy freely and the original stays as it was.'
      ),
      example(
        'duplicate "Harmonics 8-15", then switch the copy to a different starting harmonic to compare the two.'
      ),
    ],
    see: ['tabs'],
  },
  holdToPlay: {
    term: 'Hover and hold 1 (and 4, 5)',
    help: [
      p('Point at anything that can sound and hold a key to hear it for as long as you hold it.'),
      keys([
        {
          key: '{key:holdOwn}',
          does: 'plays what you point at (note, chord chip, key ring, saved subset)',
        },
        { key: '{key:holdField}', does: 'plays the chord on that note, as the field has it' },
        { key: '{key:holdExact}', does: "plays the chord's exact ratios" },
      ]),
      example(
        'in 12-EDO, point at a 200 c note with the 4:5:6 chip armed: {key:holdField} plays 200, 600, 900 c and {key:holdExact} plays 200, 586.3, 902 c.'
      ),
    ],
    teaching: [
      p(
        'Hold {key:holdField} plays the armed chord in Field mode on the note you point at: the real pitches of the chord (the notes a chord chip or shelf slot has, errors included) are taken as intervals above its own root and moved rigidly onto that note, for as long as you hold the key; sweep to another note while holding to move it there. Hold {key:holdExact} plays the EXACT ratios of the template on the note instead.'
      ),
      p(
        'A template you only picked in the Sketch row is realized as the field has it at the Sketch root where it can (notes the field lacks stay exact).'
      ),
      p(
        'For a positional chord (picked in the Sketch row or clicked in the Positional section) holds {key:holdField} and {key:holdExact} give the same pitches: it has no separate exact ratios, so both place its real intervals on the note.'
      ),
      p(
        'Hold {key:holdField} and {key:holdExact} also work with the pointer on a chord chip (ratio chip, CPS chip or Positional row): {key:holdField} plays that chord in Field mode and {key:holdExact} its exact ratios, on the root of the Sketch row stepper (the degree the last melody key moved it to), so you can play a root key and then audition chips on it. A CPS chip and a Positional row have no separate exact form: {key:holdExact} plays the same notes as {key:holdField}.'
      ),
      example(
        '12-EDO, stepper on D: point at the 4:5:6 chip and hold {key:holdField} for 200, 600, 900 c, hold {key:holdExact} for 200, 586.3, 902 c.'
      ),
      p(
        'Nothing needs to be in the field. Point at anything that can sound and hold {key:holdOwn} to hear it for as long as you hold the key: a note (on any ring, lattice, keyboard or table), a chord chip, a key ring (as a scale), a saved subset (as a scale).'
      ),
      p(
        'Sweep the pointer across tiles, notes or chips while holding to hear each one in turn (empty space keeps the last sound until you let go).'
      ),
      p(
        'A note and a chord sound until you let go; a scale steps through its notes while you hold the key (in the Scale preview direction) and stops when you let go or it ends. In the mode grid and on the tuner strip {key:holdPure} and {key:holdBoth} also play the pure pitch and both together (an exact degree plays once, nothing to beat against).'
      ),
      p(
        'Other keys: pressing a melody key (z x c ...) also moves the root of the Sketch row to the degree of that key, and {key:stash} stashes the current Sketch on the shelf. Key {key:modePlayback} switches mode previews between Parallel and Relative (see Mode playback).'
      ),
      p('Everything sounding lights green in every view.'),
      example('point at the G major key ring and hold {key:holdOwn} to hear its scale.'),
    ],
    see: ['scalePreview', 'modes', 'tunerStrip', 'modePlayback', 'sketchRow'],
  },
  modePlayback: {
    term: 'Mode playback (Parallel | Relative)',
    help: [
      p(
        'Where the current mode sounds: mode previews, **Play scale**, **Play chord** and the computer keys (z is the mode root). **Parallel** plays it from the 1/1 pitch, the way the grid measures it, so the tonic stays put and the scale changes around it. **Relative** plays it from its own root, so every note keeps its own pitch.'
      ),
      keys([{ key: '{key:modePlayback}', does: 'switch Parallel | Relative' }]),
      example(
        'in C major, Mode 2 is Dorian: Parallel plays C Dorian from the 1/1 pitch, Relative plays D Dorian from its own root 9/8.'
      ),
    ],
    teaching: [
      p('In mode previews the listed-vs-pure comparison is the same, only moved.'),
      p('In Relative a sounding tone lights a field note only where it lands exactly on one.'),
    ],
    see: ['modes', 'holdToPlay', 'baseHz', 'mode'],
  },
  keyboardMode: {
    term: 'Keyboard mode (Notes | Chords | Split)',
    help: [
      p(
        'What the computer keys play. **Notes**: z x c v b n m a s d f g h j k l are the melody keys (the subset, degree by degree). **Chords**: q w e r t y u i o p play the first ten shelf chords of the current page, in shelf order. **Split**: both at once. Keys sound while held.'
      ),
      keys([
        { key: '{key:pageBack}', does: 'previous page of the shelf (ten chords)' },
        { key: '{key:pageNext}', does: 'next page of the shelf (ten chords)' },
      ]),
      example('Split, stash a few chords, then hold q for a chord and play a melody over it.'),
    ],
    teaching: [
      p('The modes also take over the keys while the retuner is live (the dock shows the mode).'),
      p('Other keys:'),
      keys([
        { key: '{key:modePlayback}', does: 'switches Parallel | Relative' },
        { key: '{key:stash}', does: 'stashes the Sketch' },
        { key: '{key:shiftDown} and {key:shiftUp}', does: 'shift the melody down or up' },
        { key: 'Alt+1 to Alt+9', does: 'switch tabs' },
        {
          key: '{key:composite}',
          does: 'while pointing at something, opens the composite popup, which takes the digits while it is open',
        },
      ]),
    ],
    see: ['linkedMelody', 'shelfPanel', 'octShift', 'keyboardDock', 'sendToComposite'],
  },
  linkedMelody: {
    term: 'Linked melody',
    help: [
      p(
        "Off by default. When on (Split mode), pressing a chord key makes the melody keys play the scale the chord came from (its source subset), on the chord's own root, following Parallel | Relative like the shelf does. Melody root decides how."
      ),
      example(
        'a chord whose source scale is C major, rooted on D, heard in Relative: with **Transpose** the melody keys play D major.'
      ),
    ],
    teaching: [
      p(
        "**Transpose** moves the source scale rigidly so its mode root lands on the chord's root (a C major scale over a C chord, a D major scale over a D chord)."
      ),
      p(
        "**Re-root** plays the same notes of the source scale starting from the chord's root, and falls back to Transpose when the root is not one of them."
      ),
      example('Re-root over a D chord, with C major as the source scale: D E F G A B C.'),
      p(
        'Audio only: the views stay on the current tab and light only where a sounding pitch matches one of its notes (a ghost mark shows the rest).'
      ),
      p(
        'The last chord pressed stays linked until you press another chord key, change the mode or this option, or switch tab.'
      ),
      p('A chord with no source leaves the melody on the active subset.'),
    ],
    see: ['keyboardMode', 'linkedRoot', 'shelfPanel', 'modePlayback'],
  },
  linkedRoot: {
    term: 'Melody root (Transpose | Re-root)',
    help: [
      p(
        "How the linked melody sits on the chord's root. **Transpose**: the source scale keeps its shape and moves so its mode root is the chord's root. **Re-root**: the scale keeps its own notes and is read from the chord's root."
      ),
      example('in Relative, C major over D: Transpose gives D major, Re-root gives D Dorian.'),
    ],
    teaching: [
      p('With Transpose some notes may be off the current field and show as ghosts.'),
      p('If the root is not a note of the scale, Transpose is used for that chord.'),
      p('Shown while **Linked melody** is on.'),
      p('Until you choose, the Developer menu default applies.'),
    ],
    see: ['linkedMelody', 'linkedRootDefault'],
  },
  linkedRootDefault: {
    term: 'Linked melody root default',
    help: [
      p(
        'Which Melody root (Transpose or Re-root) the linked melody uses until you pick one in the top bar. Once you pick, your choice is stored and this default no longer matters.'
      ),
      example(
        'with this default on Re-root and nothing picked in the top bar, the linked melody re-roots; once you pick Transpose there, it transposes whatever the default says.'
      ),
    ],
    teaching: [
      p('Changing it here changes the current default straight away if you have not picked.'),
    ],
    see: ['linkedRoot', 'linkedMelody', 'developerMenu'],
  },
  octShift: {
    term: 'Octave shift (, and .)',
    help: [
      p(
        'Moves the melody keys down or up by one repeat of the generator (an octave for 2/1, a tritave for Bohlen-Pierce 3/1), up to 4 either way.'
      ),
      keys([
        { key: '{key:shiftDown}', does: 'down one repeat' },
        { key: '{key:shiftUp}', does: 'up one repeat' },
      ]),
      example(
        'in a 2/1 scale, press {key:shiftUp} twice and the melody keys sound two octaves higher.'
      ),
    ],
    teaching: [
      p('A key you are already holding keeps its pitch.'),
      p("It applies to the retuner's keys too and resets when the page reloads."),
    ],
    see: ['keyboardMode', 'keyboardDock'],
  },
  scalePreview: {
    term: 'Scale preview',
    help: [
      p(
        'How every scale preview runs, both **Play scale** and the preview of a key in **Keys & Modes**. **Up** plays the notes from the root up to the repeat. **Up-down** plays up and then comes back down to the root.'
      ),
      example(
        'for 1/1, 9/8, 5/4 and a 2/1 repeat, Up plays 1/1 9/8 5/4 2/1; Up-down plays 1/1 9/8 5/4 2/1 5/4 9/8 1/1.'
      ),
    ],
    see: ['playScale', 'keyRings'],
  },
  glossary: {
    term: 'Glossary',
    help: [
      p(
        'Every explanation in the lab in one searchable list. Hovering a label shows its short help; the glossary adds the longer teaching.'
      ),
      example('search "comma" to find the syntonic comma and the drift readout.'),
    ],
  },
  keyboardDock: {
    term: 'Keyboard',
    help: [
      p(
        'The notes of your subset as playable keys, one octave from the mode root. Click a key or press z, x, c, v, b, n, m and then a, s, d, f, g, h, j, k, l (16 keys) to climb up the subset.'
      ),
      keys([
        {
          key: '{key:shiftDown}',
          does: 'shift the whole melody down by one repeat (Oct in the dock)',
        },
        { key: '{key:shiftUp}', does: 'shift the whole melody up by one repeat (Oct in the dock)' },
      ]),
      example(
        'collapse it when you only want to read; open it to play the scale while watching the circle.'
      ),
    ],
    teaching: [
      p('The Keyboard mode switch can give the top row q to p to the shelf chords.'),
      p('The dock stays at the bottom so the keys are always next to the views they light.'),
    ],
  },

  /* ---- generator ---- */
  preset: {
    term: 'Preset',
    help: [
      p(
        'The generator this tab is on, shown by its name (the full folder path is the line under the control). Click to browse: type to search every preset at once, or open the folders (Built-in, My presets, Recent, Auto-saved). Choosing one fills in the method and its numbers.'
      ),
      example(
        'pick Harmonics 8-15, raise the starting harmonic, and an orange dot appears before the name.'
      ),
    ],
    teaching: [
      p(
        'The full path, shown under the control, looks like Equal divisions > Non-octave > Carlos Alpha.'
      ),
      p(
        'An orange dot before the name means you changed the generator since. The preset itself is untouched until you press **Update preset**, or you can keep the change with **Save as new**.'
      ),
      example(
        'Harmonics 8-15 is one octave of the overtone series, whose 7th, 11th and 13th harmonics sit far from any 12-EDO note.'
      ),
    ],
    see: ['method', 'presetUpdate', 'presetSaveNew'],
  },
  presetUpdate: {
    term: 'Update preset',
    help: [
      p(
        'Writes the generator you have edited into the preset it came from. Every subset of that preset is matched against the new notes: pitches that no longer exist are dropped, and a subset left with none is removed.'
      ),
      example(
        'a preset of harmonics 8-15 with a subset on 11/8; change it to harmonics 16-31 and Update: 11/8 is still found as 22/16, so the subset keeps it.'
      ),
    ],
    teaching: [
      p('A line next to the preset says what changed, and Undo puts everything back exactly.'),
      p(
        'Built-in presets cannot be changed (use **Save as new**). The button is grayed out, with the reason on hover, when nothing has changed.'
      ),
    ],
    see: ['preset', 'presetSaveNew', 'presetUndo'],
  },
  presetSaveNew: {
    term: 'Save as new',
    help: [
      p(
        'Saves the generator as a new preset of your own, with a name and an optional folder. The original preset is not changed.'
      ),
      keys([
        { key: 'Click', does: 'starts the new preset with no subsets' },
        {
          key: 'Shift+click (or the arrow beside the button)',
          does: "also copies the current preset's subsets, matched against this generator",
        },
      ]),
      example(
        'edit Hexany to use 1 3 5 11, then Shift+click **Save as new**, name it Hexany 11 in the folder Hexanies: the subsets you had carry over where their pitches still exist.'
      ),
    ],
    teaching: [
      p(
        'In the folder field, type Pools/Seven to make or reuse nested folders; existing folders are suggested.'
      ),
    ],
    see: ['preset', 'presetUpdate'],
  },
  presetUndo: {
    term: 'Undo update',
    help: [
      p(
        'Puts the preset and its subsets back exactly as they were before the last Update. Only what the Update changed is touched, so subsets you added since stay.'
      ),
      example('an Update removed two subsets; **Undo** brings them back at their old places.'),
    ],
    teaching: [
      p('The line disappears as soon as you edit the generator again or open another one.'),
    ],
    see: ['presetUpdate'],
  },
  presetShowRemoved: {
    term: 'Show removed',
    help: [
      p(
        'Lists the subsets the last Update (or copy) changed, drawn as small strips: pitches that survived are solid lines, pitches that no longer exist in the generator are dashed, and a subset that lost everything is all dashed.'
      ),
      example(
        'a subset of 1/1, 5/4 and 11/8 on a generator that lost 11/8 shows two solid lines and one dashed.'
      ),
    ],
    teaching: [p('It is only a review: nothing here can be edited, and it is not stored.')],
    see: ['presetUpdate'],
  },
  presetEdit: {
    term: 'Edit preset',
    help: [
      p(
        'Renames one of your presets, moves it to another folder or gives it a description. Its subsets and generator are unchanged.'
      ),
      example('move Hexany 11 from Hexanies to Pools/Seven.'),
    ],
    teaching: [
      p('The folder is a path such as Pools/Seven; empty puts it at the top of My presets.'),
    ],
    see: ['preset'],
  },
  presetDelete: {
    term: 'Delete preset',
    help: [
      p(
        'Removes one of your presets after you confirm. Its subsets are not lost: they stay under Auto-saved, with the generator the preset had.'
      ),
      example(
        'delete Hexany 11 with three subsets, and the three rows stay available under Auto-saved.'
      ),
    ],
    teaching: [p('A preset with no subsets is gone for good.')],
    see: ['preset', 'unassigned'],
  },
  presetDescription: {
    term: 'Preset description',
    help: [
      p(
        'A short note about one of your presets: what it is for. It shows under the preset name and at the bottom of the preset list when you point at the preset, and the list search finds it.'
      ),
      example('give Hexany 11 the note "hexany with 11 added, for the bright pad".'),
    ],
    teaching: [
      p(
        'Type it in the Description box when you edit the preset, or click the line under the name. Enter or leaving the box keeps it, Escape cancels, and clearing the text removes it. The most is 300 characters.'
      ),
      p('A built-in preset has its own fixed note, which you cannot change.'),
    ],
    see: ['preset', 'presetEdit'],
  },
  presetNewFolder: {
    term: 'New folder',
    help: [
      p('Makes a folder of your own under My presets. It stays, even empty, until you delete it.'),
      example('type Drones, or Pools/Seven to make a folder inside a folder, then press Enter.'),
    ],
    teaching: [
      p('A name that is already taken, or a built-in folder name, is refused with a message.'),
    ],
    see: ['preset', 'folderRename', 'folderDelete'],
  },
  folderRename: {
    term: 'Edit folder',
    help: [
      p(
        'Renames one of your folders or gives it a description. The presets stay inside it and keep their own descriptions.'
      ),
      example('rename Drones to Pedal tones: every preset in it moves with the name.'),
    ],
    teaching: [
      p(
        'A name that is already used by another folder is refused. Built-in folders cannot be edited.'
      ),
    ],
    see: ['presetNewFolder', 'folderDelete'],
  },
  folderDelete: {
    term: 'Delete folder',
    help: [
      p(
        'Deletes one of your folders after you confirm, together with the presets and folders inside it. The question names exactly what goes. The subsets of those presets are not lost: they stay under Auto-saved.'
      ),
      example(
        'Pools/Seven holds 3 presets and 1 folder: the question reads "Delete Pools/Seven, its 3 presets and 1 folder?"; Delete removes them all, Keep changes nothing.'
      ),
    ],
    teaching: [
      p(
        'To keep a preset, move it out first with the pencil on its row and a new Folder. Built-in folders have no delete button.'
      ),
    ],
    see: ['presetNewFolder', 'folderRename', 'presetEdit'],
  },
  presetRename: {
    term: 'Rename preset',
    help: [
      p(
        'Click the preset name at the end of the path to rename the preset in place. Enter or leaving the box keeps the new name, Escape cancels.'
      ),
      example('click Hexany 11, type Hexany 11 bright, press Enter.'),
    ],
    teaching: [
      p(
        'An empty name, or a name another preset in the same folder already has, is refused with a message under the path. A built-in preset cannot be renamed.'
      ),
    ],
    see: ['preset', 'presetEdit'],
  },
  shelfDescription: {
    term: 'Chord description',
    help: [
      p(
        'A short note about a chord on the shelf: what it is for or where it comes from. It is the second line of the card and the second line of the card tooltip.'
      ),
      example('type "bright cadence chord" on a major triad.'),
    ],
    teaching: [
      p(
        'Click the notepad, or the note itself, to type. Enter or leaving the box keeps it, Escape cancels, and clearing the text removes it. The most is 300 characters.'
      ),
    ],
    see: ['shelfPanel'],
  },
  method: {
    term: 'Method',
    help: [
      p(
        'How the field of notes is built. *Harmonic series* takes consecutive overtones; *Subharmonic series* is its mirror image, consecutive undertones; *Equal division* splits the repeat into equal steps; *Lattice* stacks one or more generator intervals; *Combination product set (CPS)* multiplies chosen factors together; *Custom* takes ratios or a Scala file you type in.'
      ),
      example('Harmonic series starting at 8 gives 8/8, 9/8, 10/8, and so on up to 15/8.'),
    ],
    teaching: [],
    see: ['repeat', 'field'],
  },
  repeat: {
    term: 'Repeat interval',
    help: [
      p(
        'The interval after which the scale starts over: its "octave". Most scales use 2/1, but 3/1 (a tritave) or 3/2 also work.'
      ),
      example('3/1 makes a scale that repeats every tritave.'),
    ],
    teaching: [
      p(
        'Accepts ratios (3/2), whole numbers (3), cents (701.96 or 701.96c) and equal-division steps (7\\12).'
      ),
    ],
    see: ['field'],
  },
  startHarmonic: {
    term: 'Starting harmonic',
    help: [
      p('The first overtone in the segment; the field runs from it up to twice its number.'),
      example(
        '8 gives 8:9:10:11:12:13:14:15, which is one octave of the series; 16 gives 16 notes packed into the same octave.'
      ),
    ],
    teaching: [],
  },
  edoDivisions: {
    term: 'Divisions',
    help: [
      p('How many equal steps the repeat is cut into.'),
      example('12 steps of an octave is ordinary piano tuning; 19 gives smaller steps of 63.2 c.'),
    ],
    teaching: [],
  },
  latticeShape: {
    term: 'Lattice shape',
    help: [
      p(
        '**Box** counts a fixed number of steps along each generator, like a grid. **Diamond** keeps everything within a total number of steps of 1/1.'
      ),
      example(
        'generators 3/2 and 5/4, box 3 by 3, gives nine notes before reducing into the octave.'
      ),
    ],
    teaching: [
      p(
        '**Genus (Euler-Fokker)** replaces the generators with one whole number: the field is every number that divides it, folded into the octave.'
      ),
    ],
    see: ['genusShape'],
  },
  diamondDistance: {
    term: 'Steps from the center',
    help: [
      p(
        'For the Diamond shape: how many generator steps in total a note may be from 1/1, counting every axis together.'
      ),
      example(
        'with generators 3/2 and 5/4 and 2 steps, 9/8 (two steps of 3/2) and 15/8 (one of each) are in, but 27/16 (three steps) is not.'
      ),
    ],
    teaching: [],
    see: ['latticeShape'],
  },
  genAxis: {
    term: 'Generator, count, center',
    help: [
      p(
        '**Generator** is the interval stacked again and again (3/2 builds a chain of fifths). **Count** is how many to stack. **Center** is how many steps go below 1/1.'
      ),
      example(
        '3/2, count 12, center 0 builds the twelve notes up from the root; center 6 spreads them both ways.'
      ),
    ],
    teaching: [],
    see: ['mos'],
  },
  mos: {
    term: 'MOS sizes',
    help: [
      p(
        '*Moment of Symmetry*: counts of generator steps where the chain folds into a scale with exactly two step sizes. Click one to use it as the count.'
      ),
      example('7 notes of a 3/2 chain give the diatonic 5L 2s pattern.'),
    ],
    teaching: [
      p('For 3/2 inside an octave the sizes include 5 (pentatonic), 7 (diatonic) and 12.'),
    ],
    see: ['structure'],
  },
  cpsFactors: {
    term: 'Factors',
    help: [
      p('The numbers that get multiplied together in pairs, triples and so on.'),
      example(
        'factors 1 3 5 7, choose 2 gives the hexany: 1x3, 1x5, 1x7, 3x5, 3x7, 5x7, each brought into the octave.'
      ),
    ],
    teaching: [],
  },
  cpsK: {
    term: 'Choose k',
    help: [
      p('How many factors go into each product.'),
      example(
        '1 3 5 7 with k = 2 is a hexany; with k = 3 it is 4 notes, a subharmonic tetrad; 1 3 5 7 9 with k = 2 is a 10-note dekany.'
      ),
    ],
    teaching: [],
  },
  customIntervals: {
    term: 'Custom intervals',
    help: [
      p('Your own list of ratios, cents or EDO steps, one per line or separated by spaces.'),
      example('9/8 5/4 4/3 3/2 5/3 15/8 is the just major scale above 1/1.'),
    ],
    teaching: [],
  },
  loadScl: {
    term: 'Load .scl',
    help: [
      p(
        'Reads a Scala scale file (the standard text format for tunings) and replaces the custom list with its notes.'
      ),
      example('a file from the Scala archive named "pyth_12.scl".'),
    ],
    teaching: [],
  },
  primeFilter: {
    term: 'Prime filter',
    help: [
      p('Switches off every note whose ratio uses a prime you have turned off.'),
      example('with 11 and 13 off, Harmonics 8-15 loses 11/8 and 13/8, leaving a 7-limit field.'),
    ],
    teaching: [p('Notes made only of cents (EDO steps) are not filtered.')],
    see: ['primeLimit', 'oddLimitFilter'],
  },
  primeAll: {
    term: 'All primes',
    help: [
      p('Turns every prime on, so no note is filtered out.'),
      example('use it to undo an earlier filter.'),
    ],
    teaching: [],
  },
  primeNone: {
    term: 'No primes',
    help: [
      p('Turns every prime off. Then switch on just the ones you want.'),
      example('none, then 3 and 5 gives a 5-limit field.'),
    ],
    teaching: [],
  },
  oddLimitFilter: {
    term: 'Odd limit filter',
    help: [
      p(
        'Keeps only the notes whose ratio has an odd limit of at most this number. To find the odd limit of a ratio, strip every factor of 2 from the top and the bottom and take the larger. 15/8 is 15, 9/8 is 9, 5/4 is 5.'
      ),
      example('harmonics 1 to 16 with the limit 9 keep 1/1, 9/8, 5/4, 3/2 and 7/4.'),
    ],
    teaching: [
      p(
        'Notes with no ratio (EDO notes) are kept. A note must pass this filter and the prime filter both. Leave the box empty for no filter.'
      ),
    ],
    see: ['primeFilter', 'oddLimit'],
  },
  genusShape: {
    term: 'Genus (Euler-Fokker)',
    help: [
      p(
        'The notes of one whole number: every number that divides it evenly, each moved by octaves into one octave. The lab shows how the number factors and how many notes that makes.'
      ),
      p(
        'Type it as 45, as a product like 3^2*5, or as factors separated by spaces, * or x: 3 3 5. Everything you type is multiplied together, so 65 67 means 65 x 67 = 4355, not two numbers.'
      ),
      example(
        '45 divides by 1, 3, 5, 9, 15 and 45, which give 1/1, 9/8, 5/4, 45/32, 3/2 and 15/8.'
      ),
    ],
    teaching: [
      p(
        '45, 3^2*5 and 3 3 5 are all the same number. Only digits, ^, *, x and spaces are read: there is no adding, dividing or brackets. A factor does not have to be prime (6 6 is 36).'
      ),
      p(
        'Powers of 2 vanish in the octave, so 32 gives one note. Primes up to 89 are allowed, and a genus may have at most 2048 notes.'
      ),
    ],
    see: ['latticeShape', 'oddLimitFilter'],
  },

  /* ---- field & subset ---- */
  field: {
    term: 'Field',
    text: 'The whole pool of notes the generator made, folded into one repeat and sorted by pitch. You pick a subset of it as your scale. Example: the field of Harmonics 8-15 has 8 notes; your subset can be any of them.',
    see: ['subset'],
  },
  subset: {
    term: 'Subset',
    text: 'The notes you have switched on: the scale you analyze and play. Example: switching off 11/8 leaves 7 of the 8 field notes.',
    see: ['mode'],
  },
  pitchCircle: {
    term: 'Pitch circle',
    help: [
      p(
        'Every field note placed round a circle by its pitch; the repeat is one full turn. A filled dot is in your subset, a hollow one is out.'
      ),
      keys([
        { key: 'Click a dot', does: 'include or exclude it' },
        {
          key: 'Alt+click a dot',
          does: 'pin it in the inspector (yellow ring) without changing the subset',
        },
      ]),
      example('3/2 sits just past the bottom of the circle, 702 of 1200 c round.'),
    ],
    teaching: [
      p(
        'The pale gray shape joins the notes of the subset in circle order (the shape of the scale), under the blue shape of a highlighted chord.'
      ),
      p('A larger green dot means the note is sounding right now.'),
      p('A bold chevron outside the ring, pointing in, marks the mode root.'),
    ],
  },
  selectAll: {
    term: 'All',
    text: 'Puts every field note in the subset. Example: 8 of 8 notes selected.',
  },
  selectNone: {
    term: 'None',
    help: [
      p('Empties the subset.'),
      example('clear everything, then click just the dots you want.'),
    ],
    teaching: [],
  },
  selectInvert: {
    term: 'Invert',
    text: 'Swaps the subset with everything that is outside it. Example: 7 of 8 selected becomes the 1 left out.',
  },
  mode: {
    term: 'Mode',
    text: "Which selected note is the scale's root. Moving it rotates the same notes into a new scale. Modes are numbered from 1: mode 1 starts on the first (lowest) selected note, mode 2 on the next, and so on. Example: the white notes starting on C (mode 1) are major; mode 2 starts on D (dorian) and mode 6 on A (natural minor).",
    see: ['modeRoot', 'modePlayback', 'keysSummary'],
  },
  modeRoot: {
    term: 'Mode root (chevron)',
    help: [
      p(
        'A bold chevron marks the note the current mode starts on, in every view that draws single notes.'
      ),
      example(
        'in C major, mode 2 starts on D (D dorian): the chevron moves from C to D, while the same seven notes stay selected.'
      ),
    ],
    teaching: [
      p(
        "It sits outside the pitch circle and the key circle pointing in at the note, beside the note's tick on the tuner strip (a small pair of chevrons facing each other), above a lattice node pointing down, in the row of the field table, on its isomorphic-keyboard key and on its mark on the dissonance curve."
      ),
      p(
        'It is drawn in the plain text color so it never clashes with the hover, pin, sounding or chord colors.'
      ),
    ],
    see: ['mode', 'subset'],
  },
  pickNearest: {
    term: 'Pick nearest',
    help: [
      p('Chooses the field notes closest to a known scale or to an equal division.'),
      p(
        'The menu also has "m-ED" (the nearest notes to an equal division) and "Odd limit..." (keep only the notes whose odd limit is at most the number you enter).'
      ),
      example(
        'choosing "Major" with 12-EDO targets selects, for each degree of the major scale, the field note nearest to it; choosing "Odd limit..." with 15 keeps 15/8 but drops 17/16.'
      ),
    ],
    teaching: [],
  },
  nearTargets: {
    term: 'Targets',
    text: 'What the scale is measured against: 12-EDO means piano pitches, Just means the pure-ratio version of the scale. Example: the major third is 400 cents in 12-EDO but 386.3 cents (5/4) in Just.',
  },
  oddLimitPick: {
    term: 'Max odd limit',
    text: 'Keeps only notes whose ratio is simple enough: the largest odd number in it (after removing factors of 2) is at most the limit. Example: 15 keeps 15/8 (odd part 15) but drops 17/16.',
    see: ['oddLimit', 'oddLimitFilter'],
  },
  keepNew: {
    term: 'Include new notes when the field changes',
    text: 'When on, notes that appear after you change the generator are added to your subset instead of left out. Example: raise the starting harmonic and the new notes join automatically.',
  },
  addSubset: {
    term: 'Add subset',
    help: [
      p(
        'Puts the current selection into the next new row of this generator, no name asked: it is called Subset 1, Subset 2 and so on. If a row with exactly these notes and the same mode root exists, that row lights up instead of making a copy.'
      ),
      keys([{ key: 'Click a row name', does: 'rename it' }]),
      example(
        'pick the seven notes you like, press Add, and a row "Subset 1" appears and flashes.'
      ),
    ],
    teaching: [],
    see: ['savedSubsets', 'renameSaved'],
  },
  unassigned: {
    term: 'Unassigned subsets',
    help: [
      p(
        'Subsets whose generator is gone (for example a built-in preset that was renamed in a newer version). They are kept, never deleted for you.'
      ),
      keys([
        { key: 'Open the group, click one', does: 'apply its pitches to the current generator' },
      ]),
      example(
        'a subset of 6 pitches loaded on a field that has 5 of them reports "1 of 6 pitches are not in this field".'
      ),
    ],
    teaching: [
      p(
        'If some pitches do not exist in the current generator, a line says how many were missing.'
      ),
    ],
    see: ['savedSubsets'],
  },
  exportScl: {
    term: 'Export .scl',
    text: 'Writes the subset as a Scala file other tuning software can open. Example: the seven notes become seven lines of ratios or cents.',
  },
  savedSubsets: {
    term: 'Saved subsets',
    help: [
      p(
        'The subsets of this generator (the preset shown above), one row each, drawn like the tuner strip. Switching preset swaps the list, because subsets belong to their generator.'
      ),
      keys([
        { key: 'Add', does: 'put the current selection in a new row' },
        { key: 'Click a name', does: 'rename it' },
        { key: 'Click a strip', does: 'load it' },
        { key: 'Point at a row', does: 'preview it on the ring' },
      ]),
      example(
        'add the seven notes without 11/8, rename the row "No 11/8", change the selection, then click its strip to get them back.'
      ),
    ],
    teaching: [],
  },
  compareTo: {
    term: 'Compare to',
    text: 'The target each note is measured against in the tuner strip: your picked scale, 12-EDO, just intonation up to an odd limit, or any equal division. Example: against 12-EDO, 13/8 reads +40.5, meaning 40.5 cents sharp of the nearest piano note.',
    see: ['tunerStrip', 'oddLimit'],
  },
  tunerStrip: {
    term: 'Tuner strip',
    help: [
      p(
        'Your scale laid out by pitch. Each bar sits under its own dot: orange going up means that many cents sharp of its target, cyan going down means flat, and the printed number says how many.'
      ),
      keys([
        { key: 'Click, Alt+click', does: 'toggle the note, pin it' },
        { key: 'Ctrl+click (Cmd on a Mac)', does: 'play the note as listed' },
        { key: 'Shift+click', does: 'play its target' },
        { key: 'Ctrl+Shift+click', does: 'play both at once' },
        {
          key: '{key:holdOwn}, {key:holdPure}, {key:holdBoth}',
          does: 'point at a note and hold: listed, target, both',
        },
      ]),
      example(
        'point at a note showing +40.5 and hold {key:holdBoth} to hear the beating for as long as you like; letting go stops it.'
      ),
    ],
    teaching: [
      p(
        'A faint reference line sits at every 100 c (1/1 as C): lighter where a piano white key would sit, darker for a black key. Saved subsets below use the same columns, so a note sits straight above and below itself.'
      ),
      p(
        'The letters under the notes are the steps between them. A small pair of chevrons facing each other beside a note marks the mode root.'
      ),
      example('"+40.5" over 13/8 means a bit under half a semitone sharp of 12-EDO\'s A-flat.'),
      p(
        'The target is the note moved by its error, so +40.5 plays 40.5 c lower. Ctrl+Shift+click plays both at once, held half as fast again, so a small difference is heard as a slow wobble (beating).'
      ),
      p(
        'A note with no error plays once, since there is nothing to beat against, and a pair shares the level so it is never louder than one note. The target tone lights only its own bar.'
      ),
      p(
        'You can also Tab to a note instead of pointing at it. The sound lasts as long as you hold the key.'
      ),
    ],
    see: ['compareTo', 'cents'],
  },
  cents: {
    term: 'Cents',
    text: "The unit for pitch distance: 100 cents is one 12-EDO semitone and 1200 is one octave. Example: a just major third (5/4) is 386.3 cents, about 14 less than the piano's 400.",
  },
  lattice: {
    term: 'Lattice',
    text: 'Notes drawn as points on a grid whose directions are the primes (or generators): one step right is another factor of 3, one step up another 5, and so on. Notes that are close on the grid are closely related in ratio. A bold chevron above a node, pointing down, marks the mode root. Example: 3/2 and 9/8 are neighbors (one step of 3 apart).',
    see: ['latticeAxes', 'lattice3d'],
  },
  latticeAxes: {
    term: 'Lattice axes (primes)',
    help: [
      p(
        'Which three primes become the three directions of the lattice, in 2D and in 3D. The list is ranked by fit: each choice shows how many of your selected notes sit on the grid with no stem.'
      ),
      p(
        'Auto, the default, always follows the best fit as you change the subset; pick a triple to keep it until you choose Auto again.'
      ),
      example(
        'with only 1/1, 3/2, 5/4 and 7/4 selected, 3·5·7 shows 4/4 on grid, while 3·5·11 shows 3/4 and puts 7/4 on a stem.'
      ),
    ],
    teaching: [
      p(
        'For example 3·5·7 — 7/7 on grid means all seven selected notes use only the primes 3, 5 and 7.'
      ),
      p('The best fit is at the top; a tie goes to the choice whose notes are closer to 1/1.'),
      p(
        'Reading the primes: 3·5 is fifths and pure major thirds (classical just intonation), 3·7 is fifths plus harmonic sevenths.'
      ),
      p(
        "A note's place along an axis is its exponent of that prime; a note that uses another prime is drawn on a stem (see Off-axis notes)."
      ),
      p(
        'Notes without a monzo (equal-division steps) cannot be placed and are left out of the count.'
      ),
    ],
    see: ['lattice', 'latticeStems', 'primePower'],
  },
  latticeStems: {
    term: 'Off-axis notes (stems)',
    help: [
      p(
        'A note that uses a prime which is not one of the three chosen axes cannot sit on the grid, so it is drawn on a stem. A small hollow ring marks where it would be using the visible primes only; the note itself is the dot at the end of a dashed line.'
      ),
      example(
        'with axes 3, 5, 7, 11/8 has its ring at 1/1, one stem step of the 11 color, and the chip 11⁺¹; 8/11 points the other way (11⁻¹).'
      ),
    ],
    teaching: [
      p(
        "The dashed line is in that prime's color, one lattice step long for each power of the prime, pointing the opposite way for a negative power."
      ),
      p(
        "The note's label carries a chip such as 11⁺¹ naming the hidden prime and its power (point at a chip to read what it means)."
      ),
      example('143/128 has two stems chained, 11⁺¹ 13⁺¹.'),
    ],
    see: ['latticeAxes', 'lattice3d', 'primePower'],
  },
  primePower: {
    term: 'Prime-power chip (e.g. 11⁺¹)',
    text: 'Names a prime that the note uses but the three chosen axes do not, and its power. The power is how many stem steps the note sits from its ring: ⁺¹ is one factor of the prime on top, ⁻¹ puts it underneath, ⁺² is two factors, and so on. Example: 11⁺¹ on 11/8 means one factor of 11 on top (11/8); 11⁻¹ would be 16/11; 11⁺² is two factors of 11, as in 121/64.',
    see: ['latticeStems', 'latticeAxes'],
  },
  fieldTable: {
    term: 'Field table',
    help: [
      p(
        'One line for every field note: ratio, cents and its distance from the nearest 12-EDO key, with a mark for whether it is in the subset and a chevron beside the mode root.'
      ),
      keys([
        { key: 'Point at a line', does: 'light the note everywhere and read it in the inspector' },
        { key: 'Click', does: 'include or exclude it' },
        { key: 'Alt+click', does: 'pin it in the inspector' },
      ]),
      example('the 13/8 line reads 840.5 c, "Ab +40.5": a note 40.5 c sharp of the piano A-flat.'),
    ],
    teaching: [p('"Open full table" shows every column with sorting.')],
  },
  colRatio: {
    term: 'Ratio',
    text: 'The note as a frequency ratio above 1/1. Example: 5/4 means 25 % higher in frequency.',
  },
  colTopBottom: {
    term: 'Top / bottom',
    text: 'The ratio as prime factors, top over bottom. Example: 15/8 reads 3·5 / 2³; a side with nothing on it reads 1. Shows a dash for a note with no exact ratio.',
  },
  colMonzo: {
    term: 'Monzo',
    text: 'The prime exponents as a vector, starting at 2 and including zeros. Example: 15/8 is [-3 1 1⟩, that is 2^-3 x 3 x 5. Shows a dash for a note with no exact ratio.',
  },
  colTenney: {
    term: 'Tenney',
    text: 'Tenney height, log2 of top x bottom: lower means simpler. Example: 3/2 is 2.58 and 15/8 is 6.91. Shows a dash for a note with no exact ratio.',
  },
  colCents: {
    term: 'Cents (c)',
    text: 'Height above 1/1 in cents. Example: 3/2 = 701.96 c.',
    see: ['cents'],
  },
  colStep: {
    term: 'Step (c)',
    text: 'Distance in cents up to the next field note. Example: from 9/8 (203.9) to 5/4 (386.3) is 182.4 c.',
  },
  colPrimeLimit: {
    term: 'Prime limit',
    text: 'The largest prime in the ratio. Example: 15/8 = 3 x 5 / 2^3, so its prime limit is 5.',
    see: ['primeLimit'],
  },
  colOddLimit: {
    term: 'Odd limit',
    text: 'The largest odd number in the ratio once powers of 2 are removed. Example: 15/8 has odd limit 15.',
    see: ['oddLimit'],
  },
  colVs12: {
    term: 'vs 12-EDO (c)',
    text: 'The nearest piano note and how many cents this note is above (+) or below (-) it. Example: "E -13.7" means 13.7 cents flat of E.',
  },
  colVsJI: {
    term: 'vs JI (c)',
    text: 'The nearest simple just ratio within the odd limit, and how far off. Example: "9/8 0.0" means exactly that ratio; a 12-EDO note would show a few cents.',
  },

  /* ---- analysis ---- */
  notes: {
    term: 'Notes',
    text: 'How many notes are in your subset, out of the whole field. Example: 7 of 8.',
  },
  period: {
    term: 'Period',
    text: 'The repeat interval: where the scale starts over (its "octave"), with its size in cents. Example: 2/1 (1200.00 c).',
  },
  stepPattern: {
    term: 'Step pattern',
    text: 'The gaps between neighboring notes, read upward from the mode root, as letters. L = large, M = medium, s = small; with more than three sizes the letters are a, b, c... from largest down. Example: the diatonic major scale is LLsLLLs.',
    see: ['stepSizes'],
  },
  stepSizes: {
    term: 'Step sizes',
    text: 'Each different gap in cents and how many times it occurs; the bar shows the size relative to the largest. Gaps within 0.01 c count as the same. Example: a = 315.64 c, once.',
    see: ['stepPattern', 'structure'],
  },
  structure: {
    term: 'Structure',
    text: 'Equal = every step the same size. MOS (Moment of Symmetry) = exactly two step sizes, arranged as evenly as possible (every interval class then comes in two sizes), like the diatonic 5L 2s. Otherwise the number of different sizes. Example: this subset has seven, so it is not MOS.',
    see: ['mos'],
  },
  primeLimit: {
    term: 'Prime limit',
    text: 'The largest prime used by any ratio in the subset. 3 = Pythagorean, 5 = classical just intonation, 7 and up = harmonic-series colors. "Irrational" if any note is cents-only. Example: 13 here, because of 13/8.',
  },
  oddLimit: {
    term: 'Odd limit',
    text: "A complexity ceiling: the largest odd number appearing in any ratio of the set. Example: 5/4 has 5, 7/4 has 7, 15/8 has 15, so the set's odd limit is 15.",
  },
  meanTenney: {
    term: 'Mean Tenney height',
    text: 'Average complexity of the ratios, log2(numerator x denominator). Lower is simpler and usually more consonant. Example: 3/2 is 2.6, 5/4 is 4.3, 15/8 is 6.9.',
  },
  variety: {
    term: 'Variety',
    text: 'For each generic interval (a 2nd is 1 step, a 3rd is 2 steps...) how many different sizes it comes in. The diatonic scale has variety 2 everywhere (its 3rds are 3 or 4 semitones). Here every interval has 7 sizes. Example: a scale with variety 3 for its 4ths has three different 4th sizes.',
    see: ['propriety', 'constantStructure'],
  },
  propriety: {
    term: 'Propriety',
    text: 'Rothenberg propriety: does a bigger generic interval always come out bigger? Strictly proper = every 3rd is smaller than every 4th, and so on, so size tells you step count. Improper = some 3rd is wider than some 4th. Example: here 28 such overlaps exist.',
    see: ['variety'],
  },
  constantStructure: {
    term: 'Constant structure',
    text: 'Does every interval size belong to only one generic interval? Yes means a size always spans the same number of steps, so you can name an interval by its size. Example: here 315.64 c is both a 2nd (1 step) and a 3rd (2 steps), so no.',
  },
  spectrum: {
    term: 'Interval spectrum',
    text: 'For each generic interval (1 step, 2 steps...), every size it takes across the scale, with how often. One row per interval, so you read across. Example: "3 steps: 4 sizes" means starting from different degrees, a 4th comes out in 4 different widths.',
    see: ['variety', 'propriety', 'constantStructure'],
  },
  matrix: {
    term: 'Pairs (interval matrix)',
    help: [
      p(
        'Every pair of degrees of the subset. Row = the degree an interval starts on, column = the degree it ends on. A cell shows the interval (a ratio when both notes are exact, else cents). An up arrow marks a pair that wraps to the next repeat.'
      ),
      keys([
        { key: 'Click a cell', does: 'hear the two notes, the upper one above the lower' },
        { key: 'Click a number', does: 'remove that degree from the subset' },
        { key: 'Alt+click a number', does: 'pin that degree' },
      ]),
      example(
        'in the 5-limit major scale, the cell from degree 4 (4/3) to degree 1 reads 3/2 with an arrow: 4/3 up to the next 1/1 is a fifth.'
      ),
    ],
    teaching: [
      p(
        'Every pair appears twice, once each way, so 3/2 and its inversion 4/3 are separate entries (the mirror cells). A subset of N notes has N times N-1 cells.'
      ),
      p(
        'Pointing at a degree lights its row and column. Pointing at a cell lights its two notes in the other views. A pair that sounds shows a green frame.'
      ),
      p(
        'The matrix is drawn for up to 32 notes. This is a count of pairs, not of chords: the chord finder still answers which chords exist.'
      ),
    ],
    see: ['matrixTable', 'matrixSearch', 'matrixColor', 'spectrum'],
  },
  matrixColor: {
    term: 'Color: Off | Error | Interval',
    help: [
      p(
        '**Error** colors each cell by how far its interval is from the nearest just ratio, on the same five steps as the Modes grid. **Interval** gives equal intervals the same tint, a continuous color wheel, not a few hues.'
      ),
      example(
        'with Error at odd limit 9, a 27/20 cell is orange: it is 21.5 c from the nearest ratio, 4/3.'
      ),
    ],
    teaching: [
      p(
        'The odd limit is the tuner strip\'s "vs JI" setting. The number is always written in the cell or the table, so color is never the only signal.'
      ),
      p(
        'Interval colors each interval by its size around the repeat, so equal intervals share a color. Two Developer options change it: Interval color (size wheel or by rank) and Interval intensity (simple ratios strong or faint). The table rows are the legend. Sounding, pinned and pointed notes stay visible on top.'
      ),
    ],
    see: ['modes', 'matrix', 'intervalColor', 'intervalIntensity'],
  },
  matrixSearch: {
    term: 'Find an interval',
    help: [
      p(
        'Type a ratio (it needs a slash or a colon, such as 3/2 or 3:2) or a size in cents (such as 700 c; the unit is optional), and a tolerance in cents. Every cell within the tolerance is outlined, with how many degrees have it.'
      ),
      example(
        '700 c with a tolerance of 3 finds the five 3/2 cells of the major scale (2 c off); with 25 it adds the 40/27 cell (19.6 c off).'
      ),
    ],
    teaching: [
      p(
        'The tolerance starts at the lab\'s tolerance setting. The figures: "k of N degrees have it above them" counts degrees that start a match; covered degrees are every degree in any match; used more than once and highest coverage count how often a degree is in a match.'
      ),
    ],
    see: ['matrix', 'matrixTable'],
  },
  matrixGrid: {
    term: 'The pair grid',
    help: [
      p(
        'Row = the degree an interval starts on, column = where it ends. Click a cell to hear its two notes. An up arrow marks a pair that wraps to the next repeat.'
      ),
      example('in the 5-limit major scale, degree 4 to degree 1 reads 3/2 with an arrow.'),
    ],
    see: ['matrix', 'matrixView'],
  },
  matrixView: {
    term: 'View: Intervals | Beats',
    help: [
      p(
        "**Intervals** writes each cell as the interval between its two notes. **Beats** writes the beat rate in Hz of that pair against the simple ratio it is near (the tolerance sets how near). A cell near no simple ratio stays empty. The axes then read each degree's interval from 1/1."
      ),
      example(
        'in the 5-limit major scale with a tolerance of 25 and 3/2 typed in Find, the 40/27 cell reads -10.90 and the five exact fifths read 0.00.'
      ),
    ],
    teaching: [
      p(
        'A negative beat means the upper note is flat of the ratio. The Hz come from the 1/1 Hz setting. With the Developer option Beat partial limit set, beats that need a higher partial are dimmed.'
      ),
    ],
    see: ['matrix', 'matrixSearch', 'matrixAdd'],
  },
  matrixAdd: {
    term: 'Add pitch',
    help: [
      p(
        'Type a ratio (with a slash or colon) or a size in cents and press Enter. It is not a subset note: it gets a dashed row and column after the subset, in both views, up to 4. Its x removes it. Added pitches are kept when you reload.'
      ),
      example(
        'in a C E G triad, adding 3/2 shows how each note sits against a just fifth above 1/1.'
      ),
    ],
    teaching: [
      p(
        'Added cells do not count in the totals above, and do not light or play. A pitch already in the subset is refused.'
      ),
    ],
    see: ['matrixView', 'matrix'],
  },
  matrixBeats: {
    term: 'Beats total, average, highest',
    help: [
      p(
        'Over the cells Find outlines, in Hz and without signs: the sum of the beat sizes, their mean, and the largest.'
      ),
      example('the 40/27 cell alone gives a total, average and highest of 10.90.'),
    ],
    see: ['matrixView', 'matrixSearch'],
  },
  matrixFindClear: {
    term: 'Clear Find',
    help: [
      p(
        'Empties the **Find** box in one click, so its outlines and result block go away and the cells stop stepping back. The tolerance stays as it is, and the cursor returns to the box. The button is there only while the box has text.'
      ),
      example(
        'after finding 700 c with a tolerance of 25, clear it and type 3/2: the 25 is still the tolerance.'
      ),
    ],
    see: ['matrixSearch'],
  },
  matrixTable: {
    term: 'Interval content',
    help: [
      p(
        'Each distinct interval of the subset with its size and how many cells have it, simplest first. Intervals within 0.01 c count as the same one.'
      ),
      keys([
        { key: 'Click a row', does: 'outline its cells and show its places' },
        { key: 'Point at a row', does: 'outline its cells while you point' },
      ]),
      example('the 5-limit major scale has 18 distinct intervals; 3/2 and 4/3 each occur 5 times.'),
    ],
    teaching: [
      p(
        'Simplest means lowest Tenney height. An interval with no exact ratio (an EDO step) goes after the ratios and is ordered by size. A row lights green while a pair of that interval sounds.'
      ),
    ],
    see: ['matrix', 'matrixSteps'],
  },
  matrixSteps: {
    term: 'By steps',
    help: [
      p(
        'The same intervals grouped by how many scale steps they span. One step is the step sizes of the scale.'
      ),
      example(
        'in the 5-limit major scale, 1 step: 9/8 x3, 10/9 x2, 16/15 x2; 4 steps: 3/2 x5, 40/27, 64/45.'
      ),
    ],
    see: ['matrixTable', 'spectrum'],
  },
  chordTolerance: {
    term: 'Tolerance (c)',
    help: [
      p(
        'How far a note may be from a chord template and still count as that chord, in cents. A chord appears once the tolerance is at least its worst note error; hover a chord chip to see which tolerance that is.'
      ),
      example(
        '18 c accepts 12-EDO major thirds (14 c wide of 5/4) as the 4:5:6 chord; 5 c would not.'
      ),
      example(
        '13/11 is 26.4 c flat of 6/5, so a minor chord (10:12:15) that uses it appears at a tolerance of 27 c or more.'
      ),
    ],
    see: ['chordError', 'errorKinds', 'chordChip'],
  },
  chordChip: {
    term: 'Chord chip',
    help: [
      p('A chord the finder found in your subset. Point at it to light its notes in every view.'),
      keys([
        { key: 'Click', does: 'hear it and keep it highlighted' },
        { key: 'Shift+click', does: 'make these notes the subset, the chip root as the mode root' },
        { key: '{key:holdOwn}', does: 'hold to hear it for as long as you hold the key' },
        {
          key: '{key:holdField}',
          does: 'hold to hear it on the root of the Sketch row stepper, as the field has it',
        },
        { key: '{key:holdExact}', does: 'hold to hear its exact ratios there' },
      ]),
      example('click the minor triad 10:12:15 on 5/4 to hear it and keep its notes lit.'),
    ],
    teaching: [
      p(
        'Playing a chip, or holding {key:holdOwn}, {key:holdField} or {key:holdExact} on it, also arms its template in the Sketch row (the Sketch root stays where it is).'
      ),
      p(
        'A grouped chip stands for one shape on several roots: its arrow shows the roots one by one. A dashed chip is not found at this tolerance yet: click it to raise the tolerance to the one it needs.'
      ),
      p(
        'A CPS chip and a Positional row have no separate exact form: {key:holdExact} plays the same notes as {key:holdField}.'
      ),
    ],
    see: ['holdToPlay', 'chordTolerance', 'chordError'],
  },
  templates: {
    term: 'Chord templates',
    text: 'The chord shapes the finder looks for, written as ratios between notes. a:b:c means the notes are harmonics of one fundamental (4:5:6 is a major triad); 1/(a:b:c) means they are undertones. Edit them with the Edit templates button; the list is remembered between visits. Example: the template 4:5:6 finds every major triad in the subset.',
  },
  chordError: {
    term: 'Chord: error (c)',
    help: [
      p(
        "The stat on a chord chip: the worst note's error in cents from the template's ideal ratio, then the average over the notes above the root in brackets. 0 is exact. The chord shows once the tolerance is at least the worst error."
      ),
      example('28.8 (17.6) c: the worst note is 28.8 c off its ideal, the average is 17.6 c.'),
    ],
    teaching: [
      p(
        'Hover the chip for each note on its own, such as "13/11 is −26.4 c from 6/5" or "3/2 is exact", and last the tolerance the chord appears at: the worst error rounded up to a whole cent. Minus means the note is flat of its ideal, plus sharp.'
      ),
      p(
        'Color (never alone: the number is always printed, or the word exact): neutral exact, a hint of yellow under 5 c, yellow 5-15 c, orange 15-30 c, red 30 c or more. Each note takes the color of its own error.'
      ),
    ],
    see: ['chordTolerance', 'errorKinds', 'chordChip'],
  },
  keysSummary: {
    term: 'Keys',
    text: 'How many field notes can start your whole scale with every note still in the field (a complete key). Your current root always counts. Example: "1 of 8" means only the original key survives; Ellis\'s Duodene holds Ptolemy\'s major in 2 of 12.',
    see: ['mode'],
  },
  modes: {
    term: 'Modes (heat grid)',
    help: [
      p(
        'One row per mode (the same notes restarted on each degree), one column per degree. A cell is cool where a field note lands close and warm where the field has nothing close. + means the nearest field note is sharp, − that it is flat.'
      ),
      keys([
        { key: 'Click', does: 'make this the current mode' },
        { key: 'Ctrl+click', does: "hear it with the field's notes" },
        { key: 'Shift+click', does: 'hear it pure' },
        { key: 'Ctrl+Shift+click', does: 'both together (beating)' },
      ]),
      example(
        "a cell reading −21.5 c on hover: the field's note is 21.5 c flat of what the mode wants."
      ),
    ],
    teaching: [
      p(
        "This panel is for rotation: a mode keeps the same notes and starts the scale on another degree (one row per mode: the scale restarted from each degree). A cell's color is measured with the mode's root moved to 1/1. A key (the Keys panel) moves the whole scale instead; C major to D dorian is a mode change, C major to G major a key change. Modes are numbered from 1."
      ),
      p(
        'Narrow panels wrap the degrees onto more lines, always under the same column. Each cell shows a + or − when it is not exact (the color still tells how large the miss is). Point at a row to print the cents errors, with their signs.'
      ),
      example(
        "row 1 is the scale from 1/1 and row 2 the scale from 9/8; if row 2's 5th degree wants 3/2 above 9/8 (81/64) but the field only has 5/4, the field's note is 21.5 c flat of it: that cell is orange, shows − and reads −21.5 c on hover."
      ),
      p(
        "Hear a mode without selecting it or changing the subset: click the mode's number and root. Ctrl+click (Cmd on a Mac) plays it with the field's nearest notes as listed (errors included), Shift+click plays it pure (the mode's exact intervals from 1/1, so the cell errors vanish), and Ctrl+Shift+click plays each degree as a listed and a pure tone together, held half as fast again, so the error is heard as beating (a degree with no error plays once, nothing to beat against; a pair shares the level so it is never louder than one note). The same clicks on one cell play just that degree. Playback follows the Scale preview Up or Up-down setting."
      ),
      example(
        'in a 5-limit field: Shift+click Mode 2 to hear D dorian with pure ratios; Ctrl+Shift+click a cell showing −21.5 c to hear its field note against the pure pitch: two tones 21.5 c apart near 440 Hz differ by about 5.5 Hz, so they beat about 5 times a second.'
      ),
      p('Pure tones off the field light nothing; field notes light everywhere.'),
      p(
        "You can also just point and hold a number key, with no clicking: point at a cell (one degree) or at a mode's number and root (the whole mode) and hold {key:holdOwn} for the listed notes, {key:holdPure} for the pure ones, {key:holdBoth} for both. A cell keeps sounding for as long as you hold the key, so you can listen to the beating as long as you like; a whole mode steps through its degrees while the key is down (both is half as fast again) and stops when you let go or it reaches the end."
      ),
      p(
        'While you hold the key, moving the pointer onto another tile or mode moves the sound there (a whole mode starts again from its first step); moving it onto empty space keeps the last sound until you let go, so small gaps between tiles do not cut it out.'
      ),
      example(
        'point at a tile and hold {key:holdBoth} to hear the beating between its listed and pure notes.'
      ),
      p(
        'Alt+1 to Alt+9 still switch tabs. The top-bar switch Parallel | Relative (key {key:modePlayback}) chooses whether a mode is played from 1/1 or from its own root (see Mode playback). Point at a note anywhere else and {key:holdOwn} plays that note too (see Hover and hold 1).'
      ),
    ],
    see: ['mode', 'chordError', 'holdToPlay', 'modePlayback'],
  },

  /* ---- retuner ---- */
  retunerOn: {
    term: 'Retuner on/off',
    help: [
      p(
        'The switch for the whole retuner. On: the keys play the active card instead of the tab (the first key is degree 1 of the card). Off: the tuning stays as it is and the keys play the tab again.'
      ),
      example('switch it off while you edit cards so playing does not retune.'),
    ],
    teaching: [
      p(
        'With the Auto trigger, playing two or more keys makes the retuner pick the best card for that chord and retune everything around the pivot, gliding the held notes.'
      ),
    ],
    see: ['cards'],
  },
  cards: {
    term: 'Cards',
    text: 'A card is a candidate scale. The retuner moves their roots so the pivot note stays exactly where it was, then tests what the held chord would sound like in each one. Example: a major scale with a 9/8 second and one with a 10/9 second are two cards that differ by a syntonic comma.',
    see: ['homeCard', 'pivot'],
  },
  cardAdd: {
    term: 'Add current tab as card',
    text: 'Copies the tab you are looking at into the card list as a saved copy: its generation, subset and mode. Later changes to the tab do not change the card. Example: build a 10/9-second major scale in another tab, then add it here as a candidate.',
  },
  subsetProduct: {
    term: 'Product',
    text: 'Places a shape on every source note, Up, Down or Both, Steps times. New pitches show as dashed marks on the ring; Add puts them in a Relative field (a new tab from any other method) and selects them. Merge within joins pitches that close in cents. Example: the major triad on itself gives 1/1, 9/8, 5/4, 3/2, 25/16, 15/8.',
    see: ['mergeTolerance'],
  },
  productSources: {
    term: 'Product sources',
    text: 'The notes the shape is placed on: this subset or a saved one. Click a dot on the ring to leave that note out (it dims), or use All, None and Invert. Example: the major triad as sources with only 3/2 left lit puts the shape on 3/2 alone.',
  },
  productShape: {
    term: 'Product shape',
    text: 'The ratios placed on each source note: this subset or a saved one, drawn on the ring below. Example: with the major triad as the shape, every source gets a 1/1, a 5/4 and a 3/2 placed on it.',
  },
  productResult: {
    term: 'Product result',
    text: 'The pitches the product makes, on a ring like the other two. A grey dot is a pitch already in the field, a green plus is a new pitch, and a blue double bar is a pitch that merged into another one within the Merge tolerance. Example: the major triad on itself, with the triad as the field, shows 3 grey dots (1/1, 5/4, 3/2) and 3 green plus marks (9/8, 25/16, 15/8).',
  },
  productDirection: {
    term: 'Direction',
    text: 'Up multiplies each source by each shape ratio, Down divides each source by each shape ratio, Both gives the two sets together. Example, the major triad (1/1, 5/4, 3/2) as sources and shape: Up gives 1/1, 9/8, 5/4, 3/2, 25/16, 15/8; Down gives 1/1, 6/5, 5/4, 4/3, 3/2, 8/5, 5/3 (the tonality diamond).',
  },
  productSteps: {
    term: 'Steps',
    text: 'How many times the shape is applied in a row, 1 to 4. Steps 2 is Sources times Shape times Shape. Example: the major triad on itself with Steps 2 (Up) gives 27 products and 10 distinct pitches.',
  },
  productMerge: {
    term: 'Merge within (c)',
    text: 'Products this close, in cents, to a note already in the field or to an earlier product count as the same note and are not added twice. 0 keeps only exact equals. Example: 6561/4096 lands 1.95 c from 8/5, so it merges into 8/5 at 5 c and stays its own note at 0 c.',
    see: ['mergeTolerance'],
  },
  productAdd: {
    term: 'Add product',
    text: 'Three choices for the products. Open in new tab: a new Relative tab holding 1/1 and the products. Create as composite: the send-to-composite popup, with the products as one item. Replace current field: this tab becomes a Relative field of 1/1 and the products. Example: the major triad on itself gives 1/1, 9/8, 5/4, 3/2, 25/16 and 15/8.',
  },
  fillCards: {
    term: 'Fill cards',
    text: 'Builds several candidate cards at once from the current tab, shows them in a list first, and adds the ones you keep. Your cards stay as they are and the new ones go at the end. Example: with a major scale as card 0, Fill cards with Modes adds Mode 2 to Mode 7, so the retuner can also choose a Dorian-like card.',
    see: ['cards', 'fillSources'],
  },
  fillSources: {
    term: 'Fill sources',
    help: [
      p(
        "Where the candidate cards come from. There are three sources: **Modes of the current subset**, **Keys that fit the field** and **This generator's subsets**. Each works alone and together they are merged, duplicates removed."
      ),
      example('modes + keys on a 7-note major scale give its 7 modes plus the other keys it fits.'),
    ],
    teaching: [
      p('Modes: the current subset started on each of its notes.'),
      p(
        'Keys that fit: the subset moved to every field note where all its notes still exist (the Keys panel).'
      ),
      p("This generator's subsets: the subsets saved under the tab's generator."),
    ],
    see: ['fillTags'],
  },
  fillTags: {
    term: 'Retuned notes | Different notes',
    help: [
      p(
        "Compared with card 0 (home), degree by degree. *Retuned notes*: the same number of notes and every degree within 30 c of home's, a comma-sized change, so the card is the same scale tuned differently. *Different notes*: it substitutes notes, like a mode or a smaller subset."
      ),
      example('a major scale with a 10/9 second is "retuned" (22 c off at one degree).'),
    ],
    teaching: [
      p('Dorian is "different": its second degree is 10/9 but its third is 32/27, 70 c from 5/4.'),
    ],
  },
  fillApply: {
    term: 'Apply (Fill cards)',
    text: 'Adds the checked cards in list order. The list never goes beyond 24 cards, counting cards stored but not playable; what does not fit is left out and the footer says how many. Adding resets the run like any other card change. Example: with 20 cards, 7 checked rows add 4 and say "3 would exceed the 24-card limit".',
  },
  cardOrder: {
    term: 'Move card',
    text: 'Changes the position of the card in the list. Order matters only for ties: when two cards score the same, the earlier one wins. Example: put your favourite card first so it wins ties.',
  },
  cardDelete: {
    term: 'Delete card',
    text: 'Removes the card from the list. Example: drop a card you never want chosen.',
  },
  cardSetHome: {
    term: 'Make home',
    text: 'Makes this card the home card (card 0): the tuning that drift is measured against. Example: make the Pythagorean card home to measure drift against it.',
  },
  cardActive: {
    term: 'Active card',
    text: 'The card the retuner chose last: the keys play it, and this panel shows it. The main views stay on your tab; everything that sounds still lights in every view when it coincides with a note of the tab. Example: after the ii chord the 10/9-second card is active.',
  },
  retHeld: {
    term: 'Held',
    text: 'The keys the last retune ran on, as degrees of the scale they were played in (1 is the root, a prime mark is one repeat higher). Example: 1 3 5 is root, third and fifth; 5 1 3 with a mark after the 1 and the 3 is the fifth, then the root and third an octave up.',
  },
  retTieBreak: {
    term: 'Tie-break',
    text: 'What decides between cards with the same score: the one earlier in the card list wins. Example: two cards that play a chord with the same notes both score 4.45, so the card nearer the top is chosen.',
    see: ['cardOrder'],
  },
  retResult: {
    term: 'Result',
    text: 'Marks the card that won (chosen) and the cards that could not take part (not a candidate: in Fixed anchor card 0 never competes, and a card without a degree the chord needs cannot play it). Example: with Fixed anchor card 0 reads not a candidate.',
    see: ['anchor'],
  },
  pivotDeg: {
    term: 'Pivot degree',
    text: 'Used by the Manual pivot: the degree of the scale that stays put while the cards switch. Degree 1 is the root; it does not have to be held. Example: 5 keeps the fifth degree fixed, so every card is moved until its fifth lands where the active card had it.',
    see: ['pivot'],
  },
  retunerOdd: {
    term: 'Odd limit (lattice scorer)',
    text: 'How complex a ratio the lattice scorer may use to explain an interval that is not exact. Higher finds more exotic ratios. Example: 9 explains a slightly flat 3/2 as 3/2; 3 would only allow fifths and octaves.',
    see: ['scorer'],
  },
  retuneReset: {
    term: 'Reset roots',
    text: 'Puts every card root back on its starting pitch (1/1 Hz in Parallel, the card mode root in Relative), makes card 0 active and clears the history and the drift. Example: use it after a long progression to start from home again.',
    see: ['drift'],
  },
  rootNow: {
    term: 'Root now',
    text: 'How far the root (1/1) of the card has moved from where it started (1/1 Hz in Parallel, the card mode root in Relative). Example: after the progression I, vi, ii, V, I in Freestyle every card root reads 80/81, which is 21.5 cents below where it started; a root that has not moved reads 1/1.',
    see: ['comma', 'drift'],
  },
  predicted: {
    term: 'Predicted chord (Hz)',
    text: 'The frequencies the held keys would sound in this card, after its root is moved so the pivot stays put. Example: for D F A in the 10/9 card they are in the ratio 10:12:15.',
  },
  score: {
    term: 'Score',
    text: 'The number the chosen scorer gives for the predicted chord. Lower is better; each scorer has its own scale, so compare cards within one column, not between scorers. Example: 4.45 beats 5.15 because it is lower.',
    see: ['scorer'],
  },
  rank: {
    term: 'Rank',
    text: '1 is the lowest (best) score. Ties are ranked by card order; the earlier card wins. Example: scores 4.5, 5.6, 5.6 rank 1, 2, 3.',
  },
  scorerOptions: {
    term: 'Scorer options',
    text: 'Partials: how many harmonics each note contributes to the roughness sum, counting the note itself (7 is the default: the note and six overtones). Rolloff: how quickly they fade (0.88 means each is 88 % of the one below). Example: 7 partials at rolloff 0.88 is the default.',
    see: ['roughness'],
  },
  homeCard: {
    term: 'Home card',
    text: 'Card 0, the tuning you started in. In Fixed anchor it never moves and is never a candidate; drift is measured from where each card started. Example: the Ptolemy major you started with is card 0.',
    see: ['anchor'],
  },
  pivot: {
    term: 'Pivot',
    text: 'The one held note that does not move while the retuner switches cards. Longest = the note held longest; Lowest, Highest, Recent likewise; Manual lets you name the degree. Example: playing A then C and E with Longest keeps A fixed and retunes C and E around it.',
    see: ['anchor'],
  },
  anchor: {
    term: 'Anchor',
    text: 'What the cards are re-rooted against. Freestyle uses the card that is active now, so tuning can wander (drift). Fixed always uses the home card, so the home scale never moves. Example: after five chords Freestyle may be 21.5 c flat of home; Fixed is exactly 0.',
    see: ['drift'],
  },
  trigger: {
    term: 'Trigger',
    help: [
      p(
        'When the retuner decides. **Auto** runs every time a chord of two or more keys is held. **Manual** waits until you press **Retune now**.'
      ),
      example('choose Manual to set up a chord, then press Retune now once it is right.'),
    ],
    teaching: [],
  },
  retuneNow: {
    term: 'Retune now',
    help: [
      p('Runs one retune on the keys held right now (used with the Manual trigger).'),
      example('hold A, C and E, then press it to retune around them.'),
    ],
    teaching: [],
  },
  scorer: {
    term: 'Scorer',
    help: [
      p(
        'How "good" a predicted chord is; the lowest score wins. There are four scorers: **Roughness (Sethares)**, the default, **Lattice distance**, **Pitch-fair periodicity** and **Infinitone parity**.'
      ),
      example(
        'switch from Roughness to Lattice distance and see whether the same card still wins.'
      ),
    ],
    teaching: [
      p('Roughness (Sethares) adds up the beating between every pair of overtones.'),
      p('Lattice distance only looks at how simple the intervals are.'),
      p('Pitch-fair periodicity counts how quickly the waveform repeats.'),
      p("Infinitone parity copies Infinitone 2's own count."),
    ],
    see: ['roughness', 'why'],
  },
  roughness: {
    term: 'Roughness',
    text: 'Plomp-Levelt / Sethares model: two close partials beat against each other and sound rough. A chord scores by the total beating among all overtones of all its notes. Example: 4:5:6 scores lower than the equal-tempered major triad because its overtones line up.',
  },
  glide: {
    term: 'Glide (ms)',
    text: 'How long held notes take to slide into their new pitch when the retuner switches cards. 0 jumps instantly. Example: 120 ms is a quick, mostly unnoticed slide.',
  },
  why: {
    term: 'Why this card won',
    text: "Every card's prediction for the chord you are holding: where its root now sits, the exact pitches of the held notes, its score and rank. The lowest score wins; ties go to the earlier card. Example: the 10/9 card wins the ii chord because its D F A is exactly 10:12:15.",
    see: ['scorer'],
  },
  drift: {
    term: 'Drift',
    text: 'How far the active card has moved from where it started, as cents and, when the notes are exact, as the ratio that was accumulated. Example: -21.51 c and 80/81 is the syntonic comma, collected by the progression I, vi, ii, V, I in Freestyle.',
    see: ['anchor', 'comma'],
  },
  comma: {
    term: 'Syntonic comma',
    text: 'The tiny interval 81/80 (21.5 cents): the gap between a stack of four fifths (81/64) and a pure major third (5/4). It is why just-intonation chord progressions drift unless the tuning is allowed to wander. Example: C-E-G, A-C-E, D-F-A, G-B-D: the D of ii (10/9) and the D of V (9/8) differ by 81/80.',
  },
  /* ---- workspace: rail, settings, inspector ---- */
  analysisRail: {
    term: 'Analysis panels',
    help: [
      p(
        'The list on the left picks which analysis panel shows on the right; the figure beside each name is a live summary of your current subset. Everything on the left and in the middle (generator, circle, tuner strip) is always visible.'
      ),
      example(
        '"Chords 10" means ten chords are found at the current tolerance; click it to see them.'
      ),
    ],
    teaching: [],
  },
  chords: {
    term: 'Chords',
    help: [
      p(
        'Chord shapes (templates such as 4:5:6) that your subset contains. Sections are by number of notes; inside each, one row per family (Major, Septimal, ...). Every chip is one voicing: the template, its root, the field notes used and the largest error in cents.'
      ),
      keys([
        {
          key: '{key:holdOwn}',
          does: 'point at a chip and hold: hear the chord for as long as you hold the key',
        },
      ]),
      example(
        '"4:5:6 @ 1/1, 1/1 5/4 3/2" is a just major triad on the root; hovering a chip lights its notes on the circle.'
      ),
    ],
    teaching: [
      p('When two field notes are both close enough to a chord tone, each gets its own chip.'),
    ],
    see: ['chordTolerance', 'templates', 'chordLadder', 'holdToPlay'],
  },
  cpsChords: {
    term: 'Chords inside this CPS',
    help: [
      p(
        'The chords inside a CPS (combination product set), read straight from which factors the notes share, not by a template.'
      ),
      keys([
        { key: 'Click a chip', does: 'hear it and keep it highlighted (click again to clear)' },
        { key: 'Shift+click a chip', does: 'make its notes the subset' },
        { key: '{key:holdOwn}', does: 'point at a chip and hold: hear the chord while you hold' },
        { key: 'Click the header', does: 'fold this section away (it is remembered)' },
      ]),
      example(
        'in the hexany from factors 1 3 5 7 with k = 2, the notes that all use the factor 1 are one otonal chord.'
      ),
    ],
    teaching: [
      p(
        'A CPS (combination product set) is made by multiplying every k-sized group of a few chosen factors.'
      ),
      p(
        'With factors 1 3 5 7 and k = 2 you get the hexany: 1x3, 1x5, 1x7, 3x5, 3x7 and 5x7, each divided by the lowest so it starts at 1/1.'
      ),
      p(
        'The notes of such a set are related in a regular way, and the chords inside it are read straight from which factors the notes share, not by a template.'
      ),
    ],
    see: ['otonal', 'utonal', 'latticeMode', 'holdToPlay'],
  },
  otonal: {
    term: 'Otonal (harmonic)',
    text: 'A chord whose notes are all harmonics of one common fundamental (a slice of the overtone series, not necessarily neighboring harmonics): it sounds as x1:x2:x3. In a CPS these are the notes that all share the same factors except one, and that one factor varies. Example: the notes 1x3, 1x5 and 1x7 all share the factor 1, and the varying factors give the chord 3:5:7.',
    see: ['utonal', 'cpsChords'],
  },
  utonal: {
    term: 'Utonal (subharmonic)',
    help: [
      p(
        'The mirror image of otonal: the notes are a slice of the undertone series, so the chord sounds as 1/x1:1/x2:1/x3. In a CPS these are the notes that sit inside the same larger group of factors, each leaving one factor out.'
      ),
      example(
        'the notes 1x3, 1x5 and 3x5 all sit inside the factors 1, 3 and 5; they leave out 5, 3 and 1 in turn, giving the chord 1/1:1/3:1/5.'
      ),
    ],
    teaching: [p('The chord is named by the factor each note leaves out, not listed by pitch.')],
    see: ['otonal', 'cpsChords'],
  },
  chordFamily: {
    term: 'Chord families',
    help: [
      p(
        'Chords are grouped by how many notes they have (triads, tetrads, larger), then by family, a label you can edit on each template: Major, Minor, Septimal, Utonal and so on. Templates without a family go in an "Other" row.'
      ),
      keys([
        {
          key: 'Click a chevron header',
          does: 'fold the whole group, a size (Triads, Tetrads, Larger) or one family; the count stays in the header and the choice is remembered',
        },
      ]),
      example('4:5:6 and 8:10:12:15 are both Major; 6:7:9 and 4:5:6:7 are Septimal.'),
    ],
    teaching: [p('A chord sent to a composite carries its family (Septimal, ...).')],
    see: ['templates'],
  },
  templateName: {
    term: 'Template name',
    text: 'A label for the chord shape, shown in the chip tooltips. It does not change what is found. Example: "major triad" for 4:5:6.',
    see: ['templates'],
  },
  templateRatios: {
    term: 'Template ratios',
    text: 'The shape itself: whole numbers joined by colons, a:b:c, for harmonics of one fundamental, or 1/(a:b:c) for undertones. Example: 4:5:6 is a major triad (a root, a note 5/4 above it and one 3/2 above it); 1/(4:5:6:7) is the utonal tetrad. A line that cannot be read is flagged and skipped by the finder.',
    see: ['templates'],
  },
  templateFamily: {
    term: 'Template family',
    text: 'The row the chord chips are grouped into inside Triads, Tetrads or Larger. Leave it empty to put the shape in Other. Example: give 4:5:6 and 8:10:12:15 the family Major so they sit on one row.',
    see: ['chordFamily'],
  },
  templateAdd: {
    term: 'Add template',
    text: 'Adds a new row to the list with an editable shape. Example: add 4:5:6:7:9, name it "harmonic 9th chord" and give it the family Septimal.',
  },
  templateReset: {
    term: 'Reset list',
    text: 'Puts back the twelve standard shapes (major, minor, septimal and so on) and discards your edits. Example: use it after experimenting with a long list.',
  },
  templateRemove: {
    term: 'Remove template',
    text: 'Deletes this row from the list. Example: remove 3:5:7 if you never want it reported.',
  },
  collapseAllChords: {
    term: 'Collapse all',
    help: [
      p(
        'Folds every section of the Chords panel at once: the CPS chords, Positional and each pattern group, the ratio chords with every size and family row. The counts stay beside the names.'
      ),
      example('with the panel long and busy, press Collapse all, then open only the Major triads.'),
    ],
    teaching: [p('The choice is remembered, like folding one section.')],
    see: ['expandAllChords'],
  },
  expandAllChords: {
    term: 'Expand all',
    text: 'Opens every section of the Chords panel at once, undoing Collapse all and any section you folded by hand.',
    see: ['collapseAllChords'],
  },
  groupShapes: {
    term: 'Group shapes',
    text: 'Merge chords that have the same notes on different roots into one card. In 12-EDO with all 12 notes, the major triad is one card marked 12 roots instead of twelve. The arrow on the card shows the per-root cards. Off: every chord on every root.',
  },
  chordSort: {
    term: 'Sort chords',
    help: [
      p(
        'Orders the cards inside each row and the roots inside a group. **Default** keeps the row order (ratio chords: smallest error first). **Root** goes from the lowest root up. **Simplicity** puts the smallest numbers first. **Reverse** flips the active order. Rows and folds stay put; dashed cards stay last.'
      ),
      example(
        'in a 5-limit major scale, Root lists the minor chords D, E, A; Simplicity puts 4:5:6 before 10:12:15.'
      ),
    ],
    teaching: [
      p(
        'Simplicity is the Tenney height of the chord: the log2 of the product of its whole numbers in lowest terms. With Group shapes on, a group takes the place of its best member.'
      ),
    ],
    see: ['groupShapes', 'chordFamily'],
  },
  cardNoteErrors: {
    term: 'Note errors on chord cards',
    help: [
      p(
        "A Developer option, off by default. On: a chord card gets an **Error** line with each note's own error in cents against its template (root first, the root is 0). Pitches and errors are tinted by the same bands as the stat. The hover tooltip always shows Pitches, Steps, each note's own error as a sentence, and the tolerance the chord appears at."
      ),
      example(
        'a minor chord 0, 322, 673.2 c against 10:12:15 shows 0, +6.4, -28.8; the stat reads 28.8 (17.6) c: the worst error, and the average over the notes above the root.'
      ),
    ],
    teaching: [
      p(
        'Two chords can both say 28.8 c while one is off in two notes and the other in one; the line shows where the error sits. Cards with no error data (CPS, dashed, Positional, shelf) have no Error line.'
      ),
    ],
    see: ['errorKinds', 'chordTolerance', 'developerMenu'],
  },
  errorKinds: {
    term: 'What each error measures',
    help: [
      p(
        'Cents of error appear in several views, and they answer different questions. A chord chip compares a chord with its template. The Mode grid and the Sketch tiles compare a pitch with the nearest note of the field. The tuner strip and the Pairs grid compare with a tuning ruler.'
      ),
      example(
        'a minor chord chip says 28.8 c: its notes are that far from 10:12:15. A Sketch tile says +73.6 c to 11/10: the field has no note there, and the nearest one is 11/10.'
      ),
    ],
    teaching: [
      p(
        '**Chord chip and card.** Each note above the root: its interval from the root minus the template ideal (4:5:6 and so on). The notes come from the selected subset. The stat reads worst (average); the tooltip gives each note\'s own error ("13/11 is −26.4 c from 6/5") and the tolerance the chord appears at.'
      ),
      p(
        '**Mode grid.** Each degree of a mode, placed from that mode root, minus the nearest note of the whole field. + means the field note is sharp of the pitch the mode wants.'
      ),
      p(
        '**Sketch tiles.** Each pitch of the sketched chord minus the nearest note of the whole field, with that note named. A guide, not the chord error: moving the notes onto their nearest field notes would give a different chord.'
      ),
      p(
        '**Tuner strip.** Each field note against the Compare to setting: 12-EDO, a picked scale, JI up to an odd limit, or m-EDO.'
      ),
      p(
        '**Pairs, Error color.** Each pair interval (not each note) against the nearest ratio up to an odd limit. It takes only the odd-limit number from the tuner strip and is always JI, whatever Compare to says.'
      ),
      p(
        'One color scale carries all of them: neutral for exact, a hint of yellow under 5 c, yellow to 15 c, orange to 30 c, red beyond. The scale is the same; the reference is not, so read the view first and then the color.'
      ),
    ],
    see: ['chordTolerance', 'sketchNearest', 'cardNoteErrors', 'compareTo', 'modes'],
  },
  sketchNearest: {
    term: 'Distance to the nearest field note',
    help: [
      p(
        "A guide, not the chord's error. For a sketched note the field does not have, the tile shows how far the nearest note of the WHOLE field is (+ means that note is above), and names it. Moving the notes onto their nearest field notes would give a different chord."
      ),
      example(
        '9/8 +73.6 c to 11/10: the field has no 9/8; its nearest note is 11/10, 73.6 c above.'
      ),
    ],
    teaching: [
      p(
        "A chord card's error is a different measurement: how far the field's notes in a found chord are from the template's ideal intervals, among the selected notes. The tile compares an ideal pitch with the whole field, so it says what the field has near that pitch, not how well a chord is tuned."
      ),
    ],
    see: ['errorKinds', 'chordTolerance'],
  },
  chordLadder: {
    term: 'Tolerance ladder',
    help: [
      p(
        'The tolerances at which the number of chords changes. Seven tiles show at a time with the current one in the middle. Dashed chips are chords that do not fit yet.'
      ),
      keys([
        { key: 'Click a tile', does: 'move the tolerance to it' },
        { key: 'Click a +n tile', does: 'pick the nearest hidden tolerance on that side' },
        { key: 'Click a dashed chip', does: 'move the tolerance to the value where it appears' },
        { key: 'Click the + and - buttons', does: 'step to the next tolerance up or down' },
      ]),
      example('"+3 c → 2 more" means raising the tolerance by 3 c brings in two more chords.'),
    ],
    teaching: [
      p('Near either end of the ladder the current tile sits off-center.'),
      p('A +n tile at an edge means n more tolerances are hidden on that side.'),
      p('The line beside the buttons also says how many fewer chords a lower tolerance gives.'),
    ],
    see: ['chordTolerance'],
  },
  editTemplates: {
    term: 'Edit templates',
    text: 'Opens the list of chord shapes the finder uses, so you can add, rename or remove them. Write a:b:c for harmonics of one fundamental, or 1/(a:b:c) for undertones. Example: add 8:10:12:14 as "major 7th, septimal" to look for it in every scale you build.',
    see: ['templates', 'chordLibrary'],
  },
  chordLibrary: {
    term: 'Chord library',
    help: [
      p(
        "Scala's list of named chords, written as ratios. Each heading is one shape (the same notes, whichever is the root) with its inversions inside; open it to see the rows. Add puts a chord in your templates. Check looks for it in your subset without adding it. The ring at the bottom draws the chord you point at."
      ),
      example('search "dominant seventh" to find 4:5:6:7 and its three inversions.'),
    ],
    teaching: [
      p('Chord list by Manuel Op de Coul, from Scala (chordnam.par).'),
      p(
        'Only the chords written as ratios are here. A row with two notes on the same pitch in this repeat (an octave folded in) can be added, but the chord finder skips it here and Check is off for it. It is found again in a repeat that keeps its notes apart.'
      ),
      p(
        'The dialog keeps your checks, filters, search and open shapes when you close it and when you reload the page. Nothing else from the library is saved except the chords you add to your templates.'
      ),
      p(
        "Point at a row, a shape heading or a root row of the roots table and hold {key:holdOwn}, {key:holdField} or {key:holdExact} to hear the chord: {key:holdOwn} as a chord card plays it (the finder notes, from the root the ring shows), {key:holdField} rounded to the nearest notes and {key:holdExact} at its exact ratios, both from the Sketch stepper's root. A root row you point at or pin is used by all three."
      ),
    ],
    see: [
      'chordTolerance',
      'templates',
      'editTemplates',
      'libraryFilters',
      'libraryCheck',
      'libraryAdd',
      'libraryRing',
    ],
  },
  libraryRing: {
    term: 'Chord ring',
    help: [
      p(
        'The chord you last pointed at or checked, on a one-repeat ring, 1/1 at the top. Grey dots are field notes; each chord note is a larger dot at its exact pitch. A bar runs to the nearest note: orange if the chord note is above, teal if below, none if exact.'
      ),
      keys([
        { key: 'Point at a row', does: 'show it here' },
        {
          key: '{key:holdOwn}, {key:holdField}, {key:holdExact}',
          does: "hold to hear it: finder notes on the shown root; rounded or exact on the Sketch stepper's root",
        },
        {
          key: 'Point at a dot',
          does: '{key:holdOwn} hear that note; {key:holdField} the chord on it, rounded; {key:holdExact} its exact ratios',
        },
        { key: 'Field | Subset', does: 'compare with the whole field or your subset' },
      ]),
      example('on a 5-limit major scale, 4:5:6:7 from 5/4 has 35/32 in teal, −48.8 c from 9/8.'),
    ],
    teaching: [
      p(
        'A bar is never shorter than 4 degrees of the ring, so a very small error is still visible. The readout gives the real number.'
      ),
      p(
        "The chord stands on the root where Check finds it. Found on several roots, it uses your Sketch stepper's root when that is one of them, else the lowest. Not found, it uses the stepper's root, or 1/1 when there is none."
      ),
      p('Each chord note is named by its pitch above 1/1, as the ring draws it.'),
      p(
        "{key:holdOwn} follows the root the ring shows. {key:holdField} and {key:holdExact} follow the Sketch stepper's root, as the chord chips do; point at a root row to use that root for all three. {key:holdField} puts each chord note on its nearest note, in its own octave, as the bars and the readout do."
      ),
      p(
        'Pointing at a field dot is choosing a root, as pointing at a root row is, and it beats the Sketch stepper: {key:holdOwn} plays that field note alone, {key:holdField} the shown chord on it with each note moved to the nearest note of the set the ring compares with (octave kept), {key:holdExact} its exact ratios on it. With no chord shown, only {key:holdOwn} sounds.'
      ),
      p(
        "While a key sounds, the notes you hear are lit green over the chord's dots; a sound that matches no field note is a green dashed circle."
      ),
    ],
    see: ['libraryCheck', 'chordLibrary', 'holdToPlay'],
  },
  libraryRoots: {
    term: 'In your subset: found on N roots',
    help: [
      p(
        "Every root where the chord is found in your subset at your tolerance, low to high, with the chord's Worst error (the largest) and Avg error (the mean over the notes except the root), in cents. The numbers are the same as on the chord cards: the finder's rule on your subset. Looking adds and checks nothing."
      ),
      keys([
        {
          key: 'Point at a root',
          does: 'preview the chord on it: the ring, the readout and the hold keys follow',
        },
        {
          key: 'Click a root',
          does: 'pin it, so it stays after the pointer leaves; click again to unpin',
        },
      ]),
      example(
        'on a 5-limit major scale at tolerance 90, 4:5:6:7 is found on 1/1, 5/4, 4/3, 3/2 and 5/3; on 3/2 it is Worst 27.3, Avg 9.1.'
      ),
    ],
    teaching: [
      p(
        "Without a pin, the ring shows the chord from the root the ring rule picks (your Sketch stepper's root when it is one of these, else the lowest). A new chord clears the pin, and a pinned root that stops being found is dropped. Nothing here is saved."
      ),
      p(
        'The numbers use the heat colors of the chord cards. The ring has its own colors: orange and teal show whether a chord note is above or below its nearest note.'
      ),
      p(
        'Hold {key:holdOwn}, {key:holdField} or {key:holdExact} with the pointer on a root to hear the chord from that root: a root you point at here, or the pinned one, is used by all three keys. Without one, {key:holdOwn} follows the root the ring shows and the other two the Sketch stepper.'
      ),
    ],
    see: ['libraryRing', 'libraryCheck', 'chordTolerance'],
  },
  libraryRow: {
    term: 'Library chord',
    help: [
      p(
        'One chord of the list. Pointing at it shows it on the ring below. Check looks for it in your subset; Add puts it in your templates.'
      ),
      keys([
        { key: 'Point at it', does: 'show it on the ring' },
        {
          key: '{key:holdOwn}',
          does: 'hold to hear it as your subset has it, on the root the ring shows',
        },
        {
          key: '{key:holdField}',
          does: "hold to hear it rounded to the nearest notes, on the Sketch stepper's root",
        },
        {
          key: '{key:holdExact}',
          does: "hold to hear the exact ratios, on the Sketch stepper's root",
        },
        { key: 'Point at a root row', does: 'all three keys then use that root' },
      ]),
      example(
        'point at 4:5:6:7 and hold {key:holdExact}: you hear the dominant seventh in pure ratios.'
      ),
    ],
    teaching: [
      p(
        "{key:holdOwn} follows the root the ring shows: the root you point at in the roots table, else the pinned root, else the ring's own rule. {key:holdField} and {key:holdExact} follow the root of the Sketch row stepper, like the chord chips, wherever the chord is found (1/1 when your subset is empty). A root you point at or pin is a choice you made, so all three keys use it. Move the stepper while a key is held and the sound moves with it."
      ),
      p(
        "{key:holdOwn} is the chord as a chord card plays it: the finder's voicing on that root, in your own field notes. When the finder does not find the chord on that root at your tolerance (or the chord folds in this repeat), it plays like {key:holdField} rooted on the field's 1/1 note, or on the Sketch stepper's root when the field has no 1/1. {key:holdField} puts each chord note on the nearest note of the set the ring compares with (the Field | Subset switch), keeping the chord note's own octave, so it is what the ring's bars and readout say. Nothing is ever silent."
      ),
    ],
    see: ['libraryRing', 'libraryCheck', 'libraryAdd'],
  },
  libraryFilters: {
    term: 'Chord library filters',
    help: [
      p(
        'Search matches a name or a ratio. Cardinality is how many notes the chord has: type a min, a max or both. Odd limit up to keeps chords whose largest odd number (after removing factors of 2) is at most the box. Prime limit up to keeps chords whose largest prime factor is at most the box. Leave a box empty for no limit.'
      ),
      example('odd limit up to 9 with 4 notes keeps 4:5:6:7 (7) and 3:5:7:9 (9) but not 4:5:6:11.'),
    ],
    teaching: [
      p(
        'Family is the group a chord goes into when you add it. A shape stays in the list when any of its rows matches, and its heading says how many do.'
      ),
      p(
        'Checked only lists just the rows you checked, each shape open with only those rows. Clear checks (with the count) unchecks them all.'
      ),
    ],
    see: ['chordLibrary'],
  },
  libraryExpandAll: {
    term: 'Expand all',
    text: 'Opens every shape in the list below, so all of its entries show. With a search or a filter on, it opens only the shapes that are listed. The choice is remembered.',
    see: ['libraryCollapseAll'],
  },
  libraryCollapseAll: {
    term: 'Collapse all',
    text: 'Closes every shape in the library, leaving only the headings. The choice is remembered.',
    see: ['libraryExpandAll'],
  },
  libraryCheck: {
    term: 'Check a library chord',
    help: [
      p(
        'Compares this chord to your current subset and shows where it is found. It uses your current tolerance and only looks: it never changes your templates. Every row you checked stays checked and updates when you change the subset, the mode or the tolerance.'
      ),
      example('Minor Triad on the 5-limit major scale at tolerance 0: found on 5/4 and 5/3.'),
    ],
    teaching: [
      p(
        'Checking is cheap because it runs one chord, not the whole library. It needs a subset of 2 to 128 notes, like the chord finder. After 40 checked rows, the next Check replaces the oldest.'
      ),
    ],
    see: ['chordTolerance', 'templates', 'chordLibrary'],
  },
  libraryAdd: {
    term: 'Add a library chord',
    help: [
      p(
        'Puts the chord in your templates, with its name and in the family of its category. Add all adds every row of the shape. It is all or nothing: if your list would pass 64 templates, or a chord is already there, nothing is added and the reason is shown.'
      ),
      example('Add on 10:12:15 gives a template named Minor Triad in the family Minor.'),
    ],
    teaching: [
      p(
        'Once added, the chord is an ordinary template: edit or remove it with Edit templates. A row that is already in your templates says so.'
      ),
    ],
    see: ['templates', 'editTemplates', 'chordLibrary'],
  },
  keysModes: {
    term: 'Keys (transposition)',
    help: [
      p(
        'The panel for moving your whole scale: transposition. A key is the same scale started on another field note, so every interval stays the same and only the starting pitch changes. A mode keeps the same notes and starts the scale on another degree instead (see Modes).'
      ),
      example('C major to G major is a key change (C D E F G A B becomes G A B C D E F#).'),
    ],
    teaching: [p('C major to D dorian is a mode change: the same seven notes, now starting on D.')],
    see: ['modes', 'keyRings', 'keyView', 'commonTones'],
  },
  keyRings: {
    term: 'Key rings',
    help: [
      p('A scale from one root, drawn as a ring of its notes.'),
      keys([
        { key: 'Click', does: 'switch to this key' },
        { key: 'Shift+click', does: 'add its notes to the subset' },
        { key: 'Ctrl+click (Cmd on a Mac)', does: 'hear it as a scale' },
        { key: '{key:holdOwn}', does: 'hold to hear it as a scale for as long as you hold it' },
      ]),
      example(
        'only the 1/1 ring has no crosses in this field; clicking the 9/8 ring selects the few notes that do land.'
      ),
    ],
    teaching: [
      p(
        'One small circle per possible key (each field note as the new root). Filled dots are scale notes that land on a field note; a cross marks a note the field does not have. A key with no crosses is complete (its ring has a border): the whole scale fits there. Under each ring, the root and the common-tone count.'
      ),
      p(
        'Hover a ring to compare it in the big view. Click it to Switch to that key (the subset becomes the key, with its root as the mode root; on an incomplete ring only the notes the field does have). Shift+click adds the key instead (see Add key). Alt+click pins the root note of that key, as in every other view.'
      ),
      p(
        'Ctrl+click (Cmd on a Mac) plays the key as a scale, in the direction set by Scale preview. Or just point at a ring and hold {key:holdOwn} to hear the scale as long as you hold the key.'
      ),
    ],
    see: ['keySwitch', 'keyAdd', 'commonTones', 'scalePreview', 'holdToPlay'],
  },
  commonTones: {
    term: 'Common tones (x|y)',
    help: [
      p(
        'Under each key ring: x is how many notes the key shares with your current subset, y is how many notes the subset has. More shared notes means a closer key.'
      ),
      example(
        'for C major, the G major ring reads 6|7 (all but F, which becomes F#) and the F# major ring reads 2|7 (only B and F survive), so G major is a close key and F# major is a distant one.'
      ),
    ],
    teaching: [
      p('The bar is a separator, not a division.'),
      p('A key with the same notes as the subset shows y|y.'),
    ],
    see: ['keyView', 'keyRings'],
  },
  keyView: {
    term: 'Key comparison',
    help: [
      p(
        'One large circle comparing your subset with a key. It shows the key you point at in the small rings, else the one you last clicked, else the current key (your subset itself, where everything is common). The line under it counts the four groups in words.'
      ),
      example(
        'from C major to G major it reads "6 common · +1 added · −1 dropped · 0 missing": F# would be added and F dropped.'
      ),
    ],
    teaching: [
      p(
        'It goes back to the current key whenever the subset changes any other way (a new selection, preset, method, mode or tab).'
      ),
      p('Everything sounding is lit green, and pointing at a note here lights it in every view.'),
      p(
        'The bold chevron outside the circle marks the root note of the shown key (the mode root you would get by switching to it).'
      ),
    ],
    see: ['keyMarks', 'keySwitch', 'keyAdd', 'commonTones'],
  },
  keyMarks: {
    term: 'Key comparison marks',
    help: [
      p(
        'Four kinds of mark, each with its own shape and color so neither is the only clue: a filled neutral dot (**common**), a green hollow dot with a plus (**+added**), a red hollow dot struck through with a minus (**−dropped**) and an orange dashed circle (**missing**).'
      ),
      example(
        'for C major against G major, F# is a plus, F is a minus, and the other six are filled.'
      ),
    ],
    teaching: [
      p('Filled neutral dot: a common note, in both the subset and the key.'),
      p('Green hollow dot with a plus: a note the key would add (in the key, not in your subset).'),
      p(
        'Red hollow dot struck through with a minus: a note the key would drop (in your subset, not in the key).'
      ),
      p(
        'Orange dashed circle: a degree of the key the field has no note for, so it can never be added.'
      ),
    ],
    see: ['keyView'],
  },
  keySwitch: {
    term: 'Switch to key',
    text: 'Makes the shown key your subset: the notes of your subset move to that key, dropping the ones the key does not use. The key root becomes the mode root. Same as clicking its small ring. Notes the field does not have are left out. Example: with C major and the G major key shown, Switch gives G A B C D E F#; the F is gone.',
    see: ['keyAdd', 'keyRings'],
  },
  keyAdd: {
    term: 'Add key',
    help: [
      p(
        'Adds the notes of the shown key to your subset and keeps everything you already have; the mode root stays where it is. Notes the field does not have cannot be added.'
      ),
      keys([{ key: 'Shift+click a small ring', does: 'the same as Add key' }]),
      example(
        'with C major and the G major key shown, Add gives the eight notes C D E F F# G A B (F stays, F# joins), still rooted on C.'
      ),
    ],
    teaching: [],
    see: ['keySwitch', 'keyRings'],
  },
  inspector: {
    term: 'Note inspector',
    help: [
      p(
        'Shows one row of the field table for the note you point at, or pinned, anywhere (circle, strip, keys, lattice): ratio, cents, monzo (prime exponents as a vector), top / bottom prime factors, Tenney height, nearest 12-EDO key and how far off it is.'
      ),
      keys([
        { key: 'Point at a note', does: 'show it here' },
        { key: 'Alt+click a note', does: 'pin it' },
      ]),
      example(
        'pointing at 13/8 reads 840.53 c, monzo [-3 0 0 0 0 1⟩, top / bottom 13 / 2³, Tenney 6.70, and about 40 c sharp of Ab.'
      ),
    ],
    teaching: [],
    see: ['fieldTable'],
  },
  fieldSettings: {
    term: 'Field settings',
    text: 'Opens a small popover with the less-used generator settings: which primes are allowed, an odd limit, the repeat interval, and whether newly appearing notes are selected when the field changes. The icon turns the accent color while a filter (primes or odd limit) is on. Example: switch 11 and 13 off to leave a 7-limit field; set the repeat to 3/1 for a tritave scale.',
    see: ['primeFilter', 'oddLimitFilter', 'repeat'],
  },
  developerMenu: {
    term: 'Developer menu',
    text: 'Small switches for how the lab shows things, kept per viewer in this browser (they are not part of a saved tuning). They are grouped by what they affect: Tooltips, Mode display, Playback and keys, Pairs panel, Tiles, Composites. Example: "Mode tiles: always show ± sign" can be turned off if the signs make the heat grid look busy.',
    see: ['modeSignAlways', 'tooltips', 'modes', 'mergeTolerance'],
  },
  keepModeRoot: {
    term: 'Keep the mode root when notes are added or removed',
    help: [
      p(
        'On (the default): adding or removing a note keeps the same note as the mode root, so the mode number follows it. Off: the mode number stays and may now point at a different note.'
      ),
      example(
        'with 1/1, 5/4, 3/2 and 15/8 selected on mode 2 (root 5/4), add 9/8. The set becomes 1/1, 9/8, 5/4, 3/2, 15/8: with this on, the root stays 5/4 and the mode becomes 3; with it off, the mode stays 2 and now starts on 9/8.'
      ),
    ],
    teaching: [p('If the root itself is removed, the mode number stays either way.')],
    see: ['mode', 'developerMenu'],
  },
  modeSignAlways: {
    term: 'Mode tiles: always show ± sign',
    text: 'On (the default): every inexact tile in the Modes heat grid carries a + or −, so you can see the direction of each miss without pointing at it. Off: the sign appears only with the number when you point at the row. + means the nearest field note is sharp of the pitch the mode wants, − means flat. Example: a tile for a 5th that needs 81/64 where the field only has 5/4 shows − (21.5 c flat).',
    see: ['modes', 'developerMenu'],
  },
  intervalColor: {
    term: 'Interval color',
    help: [
      p(
        'How **Color: Interval** in the Pairs panel picks a hue. **Size wheel** (the default) puts each interval at its size around the repeat, so close sizes look alike. **By rank** spaces the sizes far apart on the wheel, so neighboring sizes contrast.'
      ),
      example(
        'on the size wheel 9/8 (204 c) and 10/9 (182 c) are almost the same hue; by rank they differ clearly.'
      ),
    ],
    teaching: [
      p(
        'On the size wheel an interval and its inversion sit on opposite sides of the wheel mirrored about the start: 4/3 and 3/2 add up to a full turn.'
      ),
    ],
    see: ['matrixColor', 'intervalIntensity', 'developerMenu'],
  },
  intervalIntensity: {
    term: 'Interval intensity',
    help: [
      p(
        'How strong and how wide the Interval tint is. **Complex strong** (the default) makes complex ratios wide and vivid and simple ones narrow and faint. **Simple strong** is the reverse.'
      ),
      example('complex strong: 64/45 is wide and vivid and 3/2 is narrow and faint.'),
    ],
    teaching: [
      p(
        'Simplicity is the Tenney height of the ratio. An interval with no ratio (an EDO step) always gets the middle strength.'
      ),
    ],
    see: ['matrixColor', 'intervalColor', 'tintScale', 'tintBand', 'developerMenu'],
  },
  tintScale: {
    term: 'Tint strength scale',
    help: [
      p(
        'How the Interval tint measures "simple". **Fixed** (the default) judges each interval by its own Tenney height against set bounds, so 129/128 is faint in every subset. **Relative** spreads the strength over this subset\'s simplest and most complex interval. The width of the band is always relative to the subset.'
      ),
      example(
        'a subset of just 129/128 and 151/150: fixed makes both faint; relative makes one strong and one faint.'
      ),
    ],
    teaching: [
      p(
        'Strength says how simple the interval is in absolute terms; the band width says how simple it is among these intervals. The Solid look is always a full fill, so it shows strength only.'
      ),
    ],
    see: ['matrixColor', 'intervalIntensity', 'tintBand', 'developerMenu'],
  },
  tintBand: {
    term: 'Tint band',
    help: [
      p(
        "Where the Interval tint sits in a cell. **Center** (the default) draws a full-height band in the middle of the cell. **Left** starts the band at the cell's left edge. The band's width is relative simplicity; outside it the cell shows the panel color."
      ),
      example(
        'a wide band almost fills the cell; a narrow one is a stripe, centered or at the left.'
      ),
    ],
    teaching: [
      p(
        'The Solid look is always a full fill, so it has no band. While a search is active, cells that do not match keep their band in fainter colors.'
      ),
    ],
    see: ['matrixColor', 'intervalIntensity', 'tintScale', 'developerMenu'],
  },
  beatPartialLimit: {
    term: 'Beat partial limit',
    help: [
      p(
        'Off (the default): the Beats view shows every beat the same. A whole number from 1 to 64 dims the cells whose ratio needs a partial above it, and their name says so. It does not change any number.'
      ),
      example(
        'with 7, the 15/8 cells (partials 15 and 8) are dimmed and a 3/2 cell (partials 3 and 2) is not.'
      ),
    ],
    teaching: [
      p(
        "A beat between the lower note's p-th and the upper note's q-th partial needs a sound that has both. The limit is for judging what a sound with that many harmonics would show; the lab itself plays 7."
      ),
    ],
    see: ['matrixView', 'developerMenu'],
  },
  tileLook: {
    term: 'Tile look',
    help: [
      p(
        'How the colored tiles in the Modes grid and the Pairs panel look, in both schemes. **Tinted** (the default) is a soft hue fill with strong text. **Outlined** is a plain tile with a hue border. **Solid** is a full hue fill with black or white text. The colors are Radix Colors steps.'
      ),
      example(
        'Tinted turns a 20-cent error into a soft orange tile; Solid turns it into a full orange tile.'
      ),
    ],
    see: ['modes', 'matrixColor', 'developerMenu', 'tileOutline'],
  },
  tileOutline: {
    term: 'Tile outline',
    help: [
      p(
        'Stacks a 1 px outline on Tinted and Solid tiles. On by default. It is always on in Outlined.'
      ),
      example('Tinted with the outline on: a pale tile with a thin hue edge.'),
    ],
    see: ['tileLook', 'developerMenu'],
  },
  tooltips: {
    term: 'Tooltips',
    help: [
      p(
        'On (the default): pointing at or focusing a control or a dotted term shows its explanation. Off: no tooltip appears anywhere in the lab.'
      ),
      example(
        'turn **Tooltips** off while you play, and the explanations stop appearing over the keys and tiles.'
      ),
    ],
    teaching: [
      p(
        "With Tooltips off the Glossary still has every entry, and a preset's description still shows in the Preset browser."
      ),
      p("Native hover hints (such as the mode tiles' degree notes) are removed too."),
    ],
    see: ['tooltipDelay', 'developerMenu'],
  },
  tooltipDelay: {
    term: 'Tooltip delay (ms)',
    text: "How long the pointer must rest on something before its tooltip appears, in milliseconds (0 to 5000; the default is 250). Example: 800 keeps tooltips out of the way while you move across the screen, and still shows one when you pause. A few hover hints the browser draws itself (the mode-root chevron, ghost marks, the dissonance and roughness marks and lattice nodes) keep the browser's own timing, which cannot be changed.",
    see: ['tooltips', 'developerMenu'],
  },
  mergeTolerance: {
    term: 'Merge tolerance (c)',
    text: 'How close two pitches must be, in cents, to count as one note when a composite is merged (0 to 50; the default is 5). Pitches this close or closer become one note; 0 merges only identical pitches. Example: a 12-EDO major third (400 c) and a just one (386.3 c) are 13.7 c apart, so they stay two notes at 5 c and become one at 15 c, while a 700 c and a 702 c fifth merge at 5 c.',
    see: ['mergeKeeps', 'developerMenu'],
  },
  mergeKeeps: {
    term: 'Merged note keeps',
    text: 'When pitches merge into one composite note, which pitch the note shows: the first one added (the default) or the most recent one. A pitch with an exact ratio is never replaced by a cents-only twin of the same size. Example: 700 c was added first and 702 c second; First keeps 700 c, Most recent keeps 702 c.',
    see: ['mergeTolerance', 'developerMenu'],
  },
  soundMenu: {
    term: 'Sound settings',
    help: [
      p(
        'Wave shape, the pitch of 1/1 in hertz, volume, the reverb (preset, mix and your own impulse) and the direction of scale previews.'
      ),
      example(
        'set **1/1 Hz** to 261.63 Hz for middle C and pick **Sine** to hear beating most clearly.'
      ),
    ],
    see: ['wave', 'baseHz', 'volume', 'reverb', 'modePlayback'],
  },
  stepBars: {
    term: 'Step-size bars',
    text: 'One bar per distinct gap between neighboring scale notes, as wide as the gap, with a letter and how often it occurs. Equal bars mean an even scale. Example: a = 203.9 c once, h = 111.7 c once: eight different sizes, so this is not a MOS scale.',
    see: ['stepSizes'],
  },
  shape: {
    term: 'Shape',
    text: 'Three quick verdicts on how regular the scale is: propriety (does a larger interval ever come out smaller than a smaller one?), constant structure (does one size always mean one kind of interval?) and variety (how many sizes each interval takes). Example: "improper, not CS, variety 8" is an irregular scale.',
    see: ['propriety', 'constantStructure', 'variety'],
  },
  openFullTable: {
    term: 'Open full table',
    text: 'Opens the complete field table in a large window with every column, sticky headers and sortable columns. Example: sort by "vs 12-EDO" to see which notes are furthest from the piano.',
    see: ['fieldTable'],
  },
  shelfPanel: {
    term: 'Shelf',
    help: [
      p(
        'Chords you stashed, each with the exact pitches that were heard and where they came from. In Parallel a chord sounds from the 1/1 pitch, in Relative at the pitches it was stashed at.'
      ),
      keys([
        { key: 'Click a slot', does: 'hear it and keep it highlighted' },
        {
          key: '{key:holdOwn}',
          does: 'point at a slot and hold it (on one of several selected slots, all the selected ones layer)',
        },
        { key: 'Tick slots, Play selected', does: 'hear them together' },
      ]),
      example(
        'stash a major triad on degree 1 and another on degree 5, tick both and press Play selected.'
      ),
    ],
    teaching: [
      p(
        'Click the name to rename, use the arrows to reorder, the copy button to reload the source of the chord as a new tab, the bin to delete.'
      ),
      p('The bin asks for a second click ("Delete?") before it deletes.'),
    ],
    see: ['sketchRow', 'stashChord', 'holdToPlay', 'modePlayback'],
  },
  compositesPanel: {
    term: 'Composites',
    help: [
      p(
        'Up to nine numbered collections of chords, subsets and single notes (from any generator, any tab), merged onto ONE ring: a new gamut you can work on like any other. Pitches closer than the merge tolerance (5 c by default, set in the Developer menu) become one note.'
      ),
      keys([{ key: 'Click a name', does: 'rename it' }]),
      example(
        'send a 12-EDO major triad and a just 4:5:6 to one composite; at 5 c they merge into 4 notes (400 c and 386.3 c stay apart, 700 c and 702 c become one).'
      ),
    ],
    teaching: [
      p(
        'A row shows its number, name, the merged note count, a small ring, and the items it holds (open them to remove one).'
      ),
      p(
        'Each item shows four lines: its template, kind and root (such as 4:5:6 major triad on 200.0 c; a positional chord shows its name such as 2-2 on 4), what it is and how many notes, its cents (a positional chord adds its tail), and its source.'
      ),
      p('Point at an item to light, on the ring of its row, the notes it gives the composite.'),
      p(
        'Open as tab makes a NEW tab with the merged notes as they are now; later changes to the composite do not touch that tab.'
      ),
      p('Delete takes two clicks.'),
    ],
    see: ['sendToComposite', 'compositeOpen', 'shelfPanel'],
  },
  compositeOpen: {
    term: 'Open as tab',
    help: [
      p(
        'Makes a new tab, at the end, whose generator is the Composite method: the merged notes of this composite as they are at this moment. Your other tabs are not touched.'
      ),
      example(
        'with three chords collected, press **Open as tab**, then look for chords inside the new gamut.'
      ),
    ],
    teaching: [
      p('Every panel works on it (ring, keys, lattice, Sketch, shelf, Retuner).'),
      p('Changing or deleting the composite later changes nothing in that tab.'),
    ],
    see: ['compositesPanel'],
  },
  sendToComposite: {
    term: 'Send to a composite (- key, right-click)',
    help: [
      p(
        'Sends what the pointer is on to a numbered composite: a chord chip, a shelf chord, a saved subset, a key ring, a note anywhere or an item of a composite. A small popup lists the composites; right-click the same things for a menu instead.'
      ),
      keys([
        {
          key: '{key:composite}',
          does: 'open the popup on what the pointer is on (again to close it); the plain key only, not with Ctrl, Alt, Cmd or Shift',
        },
        { key: '1 to 9', does: 'popup open: send it to that composite' },
        { key: '0', does: 'popup open: send it to a new composite' },
        { key: 'Esc', does: 'popup open: cancel' },
        { key: '{key:sendFlip}', does: 'popup open: flip the Field | Exact slider' },
      ]),
      example('point at the minor triad chip, press {key:composite}, then 2.'),
    ],
    teaching: [
      p(
        'Each composite is drawn as a small ring: small dots are notes it already has, a plus is a new note, a filled mark merges into a note it has (within the merge tolerance), a struck-through mark is dropped because it doubles another pitch of the same item.'
      ),
      p('An item already in a composite is grayed out and says so.'),
      p(
        'The popup also lists the pitch values as text (cents for every note; ratio and monzo when sending Exact) and the note counts.'
      ),
      p(
        'Its Field | Exact slider starts on the choice made on the shelf and changes the preview and the send; it is disabled, with the reason, for a stashed shelf chord, a positional chord and anything without separate exact ratios.'
      ),
      p(
        'While the popup is open the {key:sendFlip} key flips the slider and the digit keys belong to it (no hold previews, Alt+digit tabs or Parallel | Relative on {key:modePlayback}).'
      ),
      p(
        'The right-click menu: a chord chip also offers **Stash on shelf**; **Send to composite** offers the three most recently used composites, **New composite** and **All composites**. Shift+click on a composite sends in the other mode (Field or Exact).'
      ),
      p('On the shelf, tick chords and use **Add selected to composite**.'),
    ],
    see: ['compositesPanel', 'holdToPlay'],
  },
  shelfPlaySelected: {
    term: 'Play selected',
    text: 'Plays every ticked slot of the shelf together. Example: tick two chords a fifth apart to hear them layered.',
    see: ['shelfPanel'],
  },
  positionalChords: {
    term: 'Positional chords',
    help: [
      p(
        'Chords made by POSITION in the subset, not by ratios. A pattern says how many subset notes to step over: 2-2 takes every other note (a triad in a 7-note scale). Every degree of the subset gets one chord, smoothest first.'
      ),
      keys([
        { key: 'Click a row', does: 'hear it, keep it highlighted, arm it in the Sketch row' },
        { key: '{key:holdOwn}', does: 'point at a row and hold it to hear it while held' },
        {
          key: '{key:holdField} or {key:holdExact}',
          does: 'on any note you point at, the armed chord; on the row itself, it plays on the Sketch row root',
        },
        { key: 'The + button on a row', does: 'stash it with its pattern' },
      ]),
      example(
        'in 12-EDO C major (7 notes), 2-2 on 1 is C E G (0, 400, 700 c) and 2-2 on 2 is D F A (200, 500, 900 c).'
      ),
    ],
    teaching: [
      p(
        'Other patterns: 2-2-2 gives a four-note chord, 1-1 three neighbors, 2-3 and 3-2 mixed steps.'
      ),
      p(
        'Smoothest means the lowest Sethares roughness of its shape; there is no tolerance, so it works in any tuning.'
      ),
      p(
        'A row is named "2-2 on 4" (pattern and start degree). The second line says what it is in THIS tuning: "7 of 12-EDO" (subset size and generator), then the cents of each step, like "400-300 c", and "~ 4:5:6" only when every note is within 5 c of a simple ratio chord.'
      ),
      p('Every pattern is its own foldable group: click its header to fold it.'),
      p('Parallel puts the chord on its own root, Relative plays the real pitches.'),
    ],
    see: ['positionalPatterns', 'sketchRow', 'stashChord', 'modePlayback'],
  },
  positionalPick: {
    term: 'Positional pattern group',
    help: [
      p(
        'One step pattern of your own list, with one chord for every degree of the subset, ranked among the chords of this pattern only (rank 1 = smoothest of the group).'
      ),
      keys([{ key: 'Click the header', does: 'fold the group away, or open it again' }]),
      example(
        '3-3 lists chords built from every third note, which are wider than triads, and 2-3 can be folded away while 2-2 stays open.'
      ),
    ],
    teaching: [
      p('The row count stays in the header, and a folded group is not ranked until you open it.'),
      p(
        'Add, edit, reorder and restore the patterns under **Edit templates**, Positional patterns.'
      ),
    ],
    see: ['positionalChords', 'positionalPatterns'],
  },
  positionalOrder: {
    term: 'Positional order',
    text: 'Applies in every pattern group. Smoothest lists the chords best score first (lowest roughness). Scale order lists them by the degree they start on, 1 to N, and each row then shows its roughness score and its rank (rank 1 = smoothest of its group). Example: 12-EDO C major, 2-2: scale order gives C E G, D F A, E G B and so on, with the C, F and G chords ranked ahead of the diminished one.',
    see: ['positionalChords', 'positionalPick'],
  },
  positionalPatterns: {
    term: 'Positional patterns (editor)',
    help: [
      p(
        'Your list of step patterns, kept apart from the ratio templates. A pattern is digits 1 to 9 joined by dashes, 1 to 8 steps: 2-2, 2-3-2, 1-1-1.'
      ),
      keys([
        { key: 'Enter, or leave the box', does: 'keeps your edit of a pattern' },
        { key: 'Escape', does: 'gives the old text back' },
        { key: 'Arrows, bin', does: 'reorder, delete' },
        { key: '**Add pattern**', does: 'adds a new one' },
      ]),
      example(
        'type 2-3-2 and press **Add pattern**; it joins the Positional picker and the Sketch row.'
      ),
    ],
    teaching: [
      p(
        'A pattern that is not valid or is already in the list is refused, and the reason is shown under the list.'
      ),
    ],
    see: ['positionalChords', 'positionalRestore'],
  },
  positionalRestore: {
    term: 'Restore defaults (patterns)',
    text: 'Puts back the seven standard patterns (2-2, 2-2-2, 2-2-2-2, 2-3, 3-2, 1-1, 3-3) in that order and discards your changes to the pattern list; the ratio templates are not touched. Example: use it after deleting a pattern you wanted.',
    see: ['positionalPatterns'],
  },
  sketchRealization: {
    term: 'Field | Exact',
    help: [
      p(
        'Which pitches **Play sketch** and **Stash** use. Field: the chord as the field gives it (the shape of the chord you armed from a chip or shelf slot, else the template found at the Sketch root, errors included; a note the field lacks stays exact). Exact: the true ratios of the template.'
      ),
      keys([
        {
          key: '{key:holdField} and {key:holdExact}',
          does: 'the same two choices for any note you point at',
        },
      ]),
      example(
        'in 12-EDO, 4:5:6 on the first note is 0, 400, 700 c in Field mode and 0, 386.3, 702 c exact.'
      ),
    ],
    teaching: [
      p(
        'The switch is off while a positional chord is picked in the Sketch row: it has no separate exact ratios, so Play sketch, Stash and holds {key:holdField} and {key:holdExact} all use its field notes.'
      ),
    ],
    see: ['sketchRow', 'holdToPlay'],
  },
  sketchRow: {
    term: 'Sketch row',
    help: [
      p(
        'Puts any chord template on any note of the subset, even when the field lacks some of its notes. **Play sketch** sounds the chord as the Field | Exact switch says (default Field: as the field gives it; Exact: the true ratios).'
      ),
      keys([
        { key: '{key:stash}', does: 'stash the current sketch on the shelf' },
        {
          key: '{key:holdField} or {key:holdExact}',
          does: 'point at any note and hold it to hear this chord there: as the field has it, or the exact ratios',
        },
      ]),
      example(
        '4:5:6:7 on a 12-EDO field shows the 7 as about -31 c, the nearest piano note being flatter than the true seventh harmonic.'
      ),
    ],
    teaching: [
      p(
        'A note the field has is marked with the chord color; one it lacks is dashed with its distance in cents to the nearest field note (+ means that note is above).'
      ),
      p('The root stepper moves along the subset from the mode root (1 is the mode root).'),
      p(
        'The template list also has a Positional group (your step patterns, such as 2-2). Picking one makes the row show that positional chord at the root degree, its name and tail replacing the template line; picking a ratio template goes back.'
      ),
      p(
        'Play sketch, Stash, {key:stash} and holds {key:holdField} and {key:holdExact} all use the positional chord while it is picked.'
      ),
    ],
    see: ['stashChord', 'holdToPlay', 'chords'],
  },
  stashChord: {
    term: 'Stash',
    help: [
      p(
        'Puts the chord on the shelf with the exact pitches it plays now, plus where it came from.'
      ),
      keys([
        { key: 'The Stash button on the Sketch row', does: 'stash the current Sketch' },
        { key: '{key:stash}', does: 'the same, from the keyboard' },
        {
          key: 'The + button on a chord chip',
          does: 'stash that chord (a found chord, a positional row or a CPS chip)',
        },
      ]),
      example('stash 4:5:6 on degree 3, then reload it later to get its source back as a new tab.'),
    ],
    teaching: [
      p(
        'What the shelf keeps about where it came from: generator, subset, template, root, tolerance, tab, date, 1/1 Hz and Parallel or Relative.'
      ),
    ],
    see: ['shelfPanel', 'sketchRow'],
  },
  retunerPanel: {
    term: 'Retuner',
    help: [
      p(
        'Re-roots a list of candidate scales around a held pivot note and picks the card whose predicted chord scores best.'
      ),
      example('hold C-E-G and the card with the purest 4:5:6 wins.'),
    ],
    teaching: [],
    see: ['cards', 'why'],
  },
  dockToggle: {
    term: 'Keyboard dock',
    text: 'Collapses the key row to a thin bar to give the workspace more room. The sounding notes stay listed. Example: collapse it while reading, open it to play along.',
    see: ['keyboardDock'],
  },
  ringView: {
    term: 'Ring view: Chromatic | Fifths',
    help: [
      p(
        'Chromatic places each note by its pitch, so the angle is its cents within the repeat. Fifths places notes along a chain of generator steps (3/2 by default), the way the circle of fifths does: neighbors on the ring are a fifth apart.'
      ),
      example('in Fifths, 3/2 sits one step clockwise of 1/1 and 9/8 two steps.'),
    ],
    teaching: [
      p(
        '5/4 sits at step +4 with a small offset because the pure third is 21.5 c flatter than four stacked fifths.'
      ),
    ],
    see: ['ringMenu', 'offChain'],
  },
  ringMenu: {
    term: 'Ring menu',
    text: 'Settings for the Fifths view: the generator that is stacked to build the chain (3/2 here) and how many positions the chain has. 12 gives the familiar circle of fifths; 17, 19 or 31 suit other tunings. Example: with 19 positions and a generator of about 694.7 c, a 19-EDO scale draws as an even ring.',
    see: ['ringView'],
  },
  relativeMenu: {
    term: 'Relative menu',
    help: [
      p(
        'Shift+click a ring note to open the picker on it; a click toggles it in the subset, right-click or Delete removes it (not 1/1). In the picker, click a ratio to add it above that note, Alt+click below. Hold {key:holdOwn} to hear the new pitch, {key:holdField} with the picked note, {key:holdExact} with the whole field.'
      ),
      p('Monzo: move over the matrix to paint exponents, click to add.'),
      example('Shift+click 3/2, then click 11/6: 11/8 is added (folded).'),
    ],
    teaching: [
      p(
        'Rings, Near and Monzo under the Method picker also open the picker. 3 and 2 step through the rings; Shift jumps by prime, Ctrl+Shift by five primes. Ctrl+click a ratio to see every ratio within 50 c of it. A ghost dot shows where a ratio lands.'
      ),
      p(
        'Monzo: Ctrl paints a straight line, Alt moves without painting. Rows gives −/+ buttons; the box takes a ratio or cents.'
      ),
    ],
    see: ['method', 'repeat'],
  },
  relativeOpen: {
    term: 'Open the relative picker',
    help: [
      p(
        'Rings, Near and Monzo open the full-screen picker in that view, on the note it was last open on (1/1 if that note is gone or it has not been opened yet), the same as Shift+clicking that note. The picker uses the Chromatic ring, so from the Fifths view the ring switches to Chromatic. Bands: From note or Fixed is remembered, also across reloads.'
      ),
      example('Shift+click 5/4 and close the picker; Near then opens the near ring on 5/4.'),
    ],
    teaching: [],
    see: ['relativeMenu'],
  },
  offChain: {
    term: 'Off-chain note',
    text: 'In the Fifths view, a note more than half a chain step from every position, so no step describes it well. It is drawn as a small dashed mark inside the ring at its nearest step. Example: 11/8 is 53 c from F and 60 c from F-sharp, so it sits off the chain.',
    see: ['ringView'],
  },
  savedAll: {
    term: 'All generators',
    text: 'Subsets belong to the generator they were added on. By default the list shows only those of the generator in this tab; tick All to list every subset. Loading one from another generator switches this tab to that generator. Example: "Major" added on 12-EDO is hidden while you work on Harmonics 8-15 until you tick All.',
    see: ['savedSubsets'],
  },
  subsetPartialMatch: {
    term: 'Subset only partly in these settings',
    help: [
      p(
        "A slightly dimmed row with a halftone (dotted) bar at its left edge: some of the subset's pitches do not exist in the generator as it is now (for example after you edited it without pressing **Update preset**). Loading it still selects the pitches that do exist."
      ),
      keys([
        { key: 'Point at the bar', does: 'says how many pitches are found and which are missing' },
      ]),
      example(
        'a 7-note subset on a field that has 5 of its pitches shows: 5 of 7 notes in these settings. Missing: 7/4, 11/8.'
      ),
    ],
    teaching: [],
    see: ['savedSubsets', 'subsetNoMatch'],
  },
  subsetNoMatch: {
    term: 'Subset not in these settings',
    help: [
      p(
        "A strongly dimmed row with a solid gray bar at its left edge: none of the subset's pitches exist in the generator as it is now, so clicking the row does nothing."
      ),
      example(
        'a subset of 12-EDO notes seen while the tab is on a 7-limit just field shows: No notes in common with these settings.'
      ),
    ],
    teaching: [
      p('You can still rename or delete it.'),
      p('Change the settings back, or open the generator it belongs to, to use it again.'),
    ],
    see: ['savedSubsets', 'subsetPartialMatch'],
  },
  renameSaved: {
    term: 'Rename saved subset',
    help: [
      p('Type a new name for a saved subset. The notes stay the same.'),
      keys([
        { key: 'Click the name of a row', does: 'start typing a new one' },
        { key: 'Enter, or leave the box', does: 'keeps it' },
        { key: 'Escape', does: 'cancels' },
      ]),
      example('rename "Subset 2" to "Dorian-ish".'),
    ],
    teaching: [],
    see: ['savedSubsets'],
  },
  deleteSaved: {
    term: 'Delete saved subset',
    text: 'Removes a saved subset from the list for good. Example: delete a try-out you no longer need.',
    see: ['savedSubsets'],
  },
  compareM: {
    term: 'Divisions of the repeat',
    text: 'For the m-EDO comparison: into how many equal steps to cut the repeat. Example: 19 compares every note with the nearest of 19 equal steps of the octave (63.2 c each).',
    see: ['compareTo'],
  },
  nearStretch: {
    term: 'Octave → repeat',
    text: 'When the repeat is not an octave, stretch the chosen scale so its octave spans your repeat instead of using its cents unchanged. Example: with a 3/1 repeat, a major scale is multiplied by 1.585, so its top note lands on 3/1.',
    see: ['pickNearest'],
  },
  auditionNote: {
    term: 'Play this note',
    help: [
      p(
        'Sounds this one field note for a moment at its own pitch above the 1/1 Hz setting, and lights it in every view.'
      ),
      example('press it on 5/4 to hear the major third before deciding to keep it.'),
    ],
    teaching: [],
    see: ['baseHz'],
  },
  unpinNote: {
    term: 'Unpin',
    help: [
      p(
        'The inspector keeps showing the note you pinned until you unpin it. A pinned note is marked in yellow in every view. A plain click only includes or excludes the note.'
      ),
      keys([
        { key: 'Alt+click', does: 'pin a note in any view (Alt+Enter on a focused note)' },
        { key: 'Alt+click it again, or press the pinned label', does: 'unpin' },
      ]),
      example(
        'Alt+click 5/4 on the ring, move the mouse over other notes to compare, then unpin to go back to following the mouse.'
      ),
    ],
    teaching: [],
    see: ['inspector'],
  },
  savedRow: {
    term: 'Saved subset',
    help: [
      p(
        'One saved selection of this pitch collection, drawn as a miniature tuner strip: a dot for every field note, bright when it is in the subset and dim when it is out, with small orange (sharp) and cyan (flat) bars for the distance from the scale chosen in Compare to (12-EDO by default). A small chevron above a column marks the mode root of that subset.'
      ),
      keys([
        { key: 'Point at a row', does: 'preview it on the ring' },
        { key: 'Click', does: 'load it' },
        {
          key: '{key:holdOwn}',
          does: 'point at a row and hold it to hear the subset as a scale from its mode root',
        },
      ]),
      example('"Septimal tetrad 4:5:6:7" lights 1/1, 5/4, 3/2 and 7/4 and dims the rest.'),
    ],
    teaching: [],
    see: ['savedSubsets', 'holdToPlay'],
  },
  pinPanel: {
    term: 'Pin as a column',
    help: [
      p(
        'Gives this panel its own column beside the generator, so on a wide screen several analyses are visible at once. Pinned columns can be moved left or right and reordered; the arrangement is remembered.'
      ),
      keys([
        {
          key: 'Click the pin',
          does: 'choose **Pin left** or **Pin right**: the column goes on that side, right next to the generator',
        },
      ]),
      example(
        'pin Keys & Modes and Chords on an ultrawide to watch both while you edit the subset.'
      ),
    ],
    teaching: [
      p(
        'A dimmed pin means it is pinned but there is no room for its column at this window width; it stays reachable through the switcher.'
      ),
    ],
    see: ['movePin', 'analysisRail'],
  },
  movePin: {
    term: 'Move column',
    text: 'Moves this pinned panel one place left or right as its own column. Moving toward the generator past the innermost column crosses to the other side of it; moving outward past the screen edge does nothing (the button is dimmed). A panel in a stack first leaves the stack. Example: on the left side, the right arrow on the innermost column sends it to the right of the generator.',
    see: ['pinPanel'],
  },
  unpinColumn: {
    term: 'Unpin',
    text: 'Closes this column. The panel is still in the rail and can be shown in the switcher column or pinned again. Example: unpin Spectrum when you need the room, then pin it back later; it returns to the outer end of the side with fewer columns.',
    see: ['pinPanel'],
  },
  fieldIn: {
    term: 'In subset',
    text: 'A filled dot means the note is in your subset; a hollow ring means it is in the field but left out. Example: 11/8 is hollow in the example subset.',
    see: ['fieldTable'],
  },
  pinHere: {
    term: 'Pin from here',
    text: 'Pins the panel you are looking at in the switcher as its own column, on the left or the right of the generator, next to it. Example: you are reading Visualizer 3 - Dissonance curve in the switcher; choose Pin right and it moves to a column beside the generator.',
    see: ['pinPanel'],
  },
  stackPin: {
    term: 'Stack with',
    help: [
      p(
        'Lists every other pinned panel whose column has room (a column holds up to three panels), with its side and how full it is, and moves this panel to the bottom of that column, so the panels share its height. Disabled when every other column is full.'
      ),
      example(
        'on Visualizer 3 - Dissonance curve choose "Visualizer 1 - Lattice (right, 1 of 3)" to see the lattice and the curve one above the other; then stack Visualizer 2 - EDO fit the same way to have all three in one column.'
      ),
    ],
    teaching: [
      p('It works across the generator and at any distance.'),
      p('A panel taken out of a stack leaves the others together.'),
    ],
    see: ['pinPanel', 'unstackPin'],
  },
  unstackPin: {
    term: 'Unstack',
    text: 'Splits this panel out of its stack into a column of its own, next to the one it leaves, on the side nearer the screen edge. Example: unstack Lattice to give it the full height again; it uses one more column of width.',
    see: ['stackPin'],
  },
  swapStack: {
    term: 'Move up or down in the stack',
    text: 'Moves this panel one slot up or down inside its stack; in a stack of two that swaps the pair. The panel keeps its own share of the height. Example: move Chords up to put the chip list in the top slot above Keys & Modes.',
    see: ['stackPin'],
  },
  splitter: {
    term: 'Stack splitter',
    help: [
      p(
        'The bar between two stacked panels, for changing how a stacked column is shared. A stack of three has two bars; each one only trades space between the two panels beside it.'
      ),
      keys([
        { key: 'Drag', does: 'change the shares' },
        { key: 'Up or Down (bar focused)', does: 'move it 5%' },
        { key: 'Home or End', does: 'jump to its limits' },
        { key: 'Double-click either bar', does: 'back to even shares' },
      ]),
      example(
        'drag the upper bar down to give Visualizer 1 - Lattice more room while Visualizer 3 - Dissonance curve stays the same size.'
      ),
    ],
    teaching: [p('Every panel keeps at least 20% of the height or 6 rem, whichever is larger.')],
    see: ['stackPin'],
  },
  /* ---- visualizer panels ---- */
  vizView: {
    term: 'Visualizer view',
    help: [
      p(
        'A visualizer panel can show any of five views: Lattice, EDO fit, Dissonance curve, Live roughness or Isomorphic keyboard. The panel is named after the view it shows; pick another from this menu.'
      ),
      example(
        'leave the first visualizer on Lattice and switch the second to EDO fit to see the grid and the tuning fit together.'
      ),
    ],
    teaching: [
      p('Live roughness follows what sounds now, the others follow the subset.'),
      p(
        'There are five visualizer panels in the rail, so you can keep several views side by side.'
      ),
    ],
    see: ['lattice', 'edoFit', 'dissCurve', 'liveRoughness', 'isoKeyboard'],
  },
  vizPopOut: {
    term: 'Open in a large window',
    text: 'Shows the same view full size in a window over the page, with its own controls. Closing it changes nothing. Example: pop out the 3D lattice to rotate a big field with room for every label.',
    see: ['openFullTable'],
  },
  pairsPopOut: {
    term: 'Open Pairs in a large window',
    help: [
      p(
        'Shows the same Pairs view full size over the page, with bigger cells and text. The color choice, the picked interval and the search stay as they are when you close it.'
      ),
      keys([
        { key: 'Escape', does: 'close the window' },
        { key: 'Click outside', does: 'close the window' },
      ]),
      example('open it on a 12-note subset to read every ratio in its cell without scrolling.'),
    ],
    teaching: [
      p(
        'Hovering, clicking and Alt+clicking inside the window do what they do in the panel: the ring, strip and lattice behind it light up as usual.'
      ),
    ],
    see: ['matrix', 'vizPopOut'],
  },
  modesPopOut: {
    term: 'Open Modes in a large window',
    help: [
      p(
        'Shows the same Modes grid full size over the page, with taller tiles and bigger text. Closing it changes nothing.'
      ),
      keys([
        { key: 'Click a row', does: 'make this the current mode' },
        { key: 'Ctrl+click or Shift+click', does: 'hear a mode or one degree, as in the panel' },
        { key: 'Escape', does: 'close the window' },
        { key: 'Click outside', does: 'close the window' },
      ]),
      example('open it on a 12-note subset to read every cents error without squinting.'),
    ],
    see: ['modes', 'vizPopOut'],
  },
  latticeMode: {
    term: 'Lattice axis mode',
    help: [
      p(
        'What the directions of the lattice mean. **Primes** (always available): one direction per prime, so a note sits at its prime exponents; for example 3/2 is one step of 3.'
      ),
      p(
        '**Generators**: one direction per generator of the Lattice method (for example 3/2 and 5/4), so a note sits at how many steps of each generator it took; a line is one step of one generator.'
      ),
      example(
        'with the Lattice method and generators 3/2 and 5/4, Generators shows the fifth-by-third grid you typed in.'
      ),
    ],
    teaching: [
      p(
        '**Factors**: for a CPS, one direction per factor. A note sits where its factors are (the first factor in the center, the others around it, which makes the hexany a star); a line joins two notes that swap one factor.'
      ),
      p(
        'Generators needs a field built by the Lattice method and Factors needs the CPS method; otherwise they are grayed out.'
      ),
    ],
    see: ['lattice', 'latticeAltAxes', 'cpsChords'],
  },
  latticeAltAxes: {
    term: 'Axes (generators or factors)',
    text: 'The directions used in this mode, in order, shown as a small key at the bottom left of the lattice. For Generators they are the generators as you typed them; for Factors they are the CPS factors. Example: "generators 3/2, 5/4" means one step along the first axis multiplies by 3/2 and one along the second by 5/4.',
    see: ['latticeMode'],
  },
  latticeDim: {
    term: 'Lattice 2D | 3D',
    help: [
      p(
        'Switches the lattice between a flat picture and a rotatable 3D one. 2D squeezes every prime onto a plane, so two notes can look close when they are not. 3D gives three primes their own real direction. 3D is only for the prime lattice; Generators and Factors are drawn flat.'
      ),
      example('in 3D, 15/8 sits one step along the 3 axis and one along the 5 axis from 1/1.'),
    ],
    teaching: [p('In 3D, 11/8 is drawn on a stem so it never overlaps a real note.')],
    see: ['lattice', 'lattice3d'],
  },
  lattice3d: {
    term: '3D lattice',
    help: [
      p(
        'The prime lattice in three dimensions. Each note is a small sphere placed by its prime exponents: how many steps of 3, of 5 and of 7 lie between it and 1/1. Neighboring spheres joined by a line are one prime step apart.'
      ),
      keys([
        { key: 'Drag', does: 'rotate' },
        { key: 'Scroll', does: 'zoom' },
        { key: 'Right-drag (or two-finger touch drag)', does: 'pan' },
      ]),
      example('9/8 is two steps out along the 3 axis, 5/4 one step along the 5 axis.'),
    ],
    teaching: [p('A bold chevron floating above a sphere marks the mode root.')],
    see: ['lattice', 'latticeAxes', 'latticeStems', 'modeRoot'],
  },
  lattice3dReset: {
    term: 'Reset view',
    text: 'Returns the 3D lattice camera to its starting angle and zoom, framing every note. Example: use it after rotating the lattice upside down.',
  },
  lattice3dView: {
    term: '3D view',
    help: [
      p('The 3D lattice itself.'),
      keys([
        { key: 'Drag', does: 'rotate' },
        { key: 'Scroll', does: 'zoom' },
        { key: 'Right-drag', does: 'pan' },
        { key: 'Point at a sphere', does: 'read the note in the inspector' },
        { key: 'Click', does: 'include or exclude the note' },
        { key: 'Alt+click', does: 'pin it (yellow halo)' },
      ]),
      example('hover 3/2 and the inspector shows 701.96 c.'),
    ],
    teaching: [
      p(
        'Bright spheres are in your subset, dim ones are in the field but left out, a green sphere is sounding, and a blue ring marks a note of the highlighted chord.'
      ),
      p('A hollow ring with a dashed colored line is the base and stem of an off-axis note.'),
    ],
    see: ['lattice3d', 'inspector'],
  },
  edo: {
    term: 'EDO (equal division)',
    text: 'An equal division of the repeat into n equal steps, written n-EDO. 12-EDO is the piano: the octave in 12 steps of 100 cents. Every note you play in an EDO is a whole number of steps, so a just ratio can only be approximated. Example: 5/4 is 386.3 c, and 12-EDO only has 400 c, so it is 13.7 c sharp; 31-EDO has 387.1 c, only 0.8 c off.',
    see: ['edoFit', 'cents'],
  },
  edoFit: {
    term: 'EDO fit',
    text: 'How well each equal division from 5 to 72 notes can play your subset: every note is moved to the nearest step of the division and the error is measured in cents. Bars show the worst error; a dot on each bar marks the mean. Lower is a closer fit. Example: for 1/1, 5/4, 3/2 the bar at 12 is 13.7 c tall (the major third), while 53 is only 1.4 c, which is why 53-EDO is famous for just major thirds.',
    see: ['edo', 'edoChart', 'edoBestRow'],
  },
  edoChart: {
    term: 'EDO fit chart',
    help: [
      p(
        'The number of divisions n runs along the bottom (5 to 72) and the error in cents runs up the side. Each bar is the largest error of any subset note in that n-EDO; the dot is the average error.'
      ),
      keys([
        { key: 'Point at a bar', does: 'read it' },
        { key: 'Click a bar', does: 'keep it highlighted' },
      ]),
      example(
        'a bar at n = 22 with a worst of 7.1 c means every note of the 1/1, 5/4, 3/2 triad is within 7.1 c of a 22-EDO step.'
      ),
    ],
    teaching: [
      p('A bar taller than the top of the chart is clipped.'),
      p('The best few n are drawn in violet and named.'),
    ],
    see: ['edoFit', 'edoReadout'],
  },
  edoReadout: {
    term: 'EDO readout',
    text: 'The numbers behind the bar you point at or have clicked: n, the step size, the worst and the mean error in cents, and the worst error as a share of one step (0 % exact, 50 % is the worst possible). Example: for 1/1, 5/4, 3/2 at n = 31: step 38.7 c, worst 5.2 c, mean 2.0 c, 13 % of a step.',
    see: ['edoChart', 'edoRelative'],
  },
  edoRelative: {
    term: 'Error relative to the step',
    help: [
      p(
        'The worst error divided by the size of one step of that division. Bigger divisions always shrink the error in cents, so this tells you whether a division fits better than its size alone would suggest.'
      ),
      example(
        "12-EDO's worst miss is 13.7 c (the major third 5/4) of a 100 c step (14 %); 22-EDO's worst miss is 7.1 c (the fifth 3/2) of a 54.5 c step (13 %), so they fit about equally well for their size."
      ),
    ],
    teaching: [p('0 % would be exact and 50 % the worst possible (see EDO readout).')],
    see: ['edoFit'],
  },
  edoBestRow: {
    term: 'Best fits',
    text: 'A short list of the divisions worth trying. It keeps each n that fits your subset better than every smaller n (a new record), then names the few of those with the smallest error relative to their step. The lowest error overall would always just be 72. Example: for 1/1, 5/4, 3/2, 7/4 the record-setters include 22 and 31, and 31 beats 12-EDO by a wide margin (5.2 c against 31.2 c).',
    see: ['edoFit', 'edoRelative'],
  },
  dissCurve: {
    term: 'Dissonance curve',
    help: [
      p(
        'How rough two notes sound together, for every interval from a unison (0 c) up to the octave (1200 c). Low is smooth. The dips are the intervals that sound consonant for this sound. Your subset notes are marked on top.'
      ),
      example(
        'the curve dips at 386 c (5/4), 498 c (4/3) and 702 c (3/2), which are the just major third, fourth and fifth.'
      ),
    ],
    teaching: [
      p(
        'Both notes are given seven partials (the note and six overtones), and the roughness (Sethares model, the same one the retuner uses) adds up the beating between every pair of overtones.'
      ),
    ],
    see: ['roughness', 'dissMarks', 'dissDips'],
  },
  dissAxes: {
    term: 'Dissonance axes',
    text: "Across: the interval above the lower note, in cents (0 to the repeat: 1200 for an octave). Up: roughness, in the model's own units; only the relative height matters. The lower note is fixed at 261.63 Hz (middle C), because roughness also depends on how high the notes are. Example: a few tens of cents above the unison the two notes beat quickly against each other, and the curve is at its peak.",
    see: ['dissCurve', 'cents'],
  },
  dissMarks: {
    term: 'Scale marks on the curve',
    help: [
      p(
        'A vertical line at the cents of every field note. Bright lines are notes in your subset; faint lines are field notes you left out; green means sounding now; a small bold chevron above a line marks the mode root.'
      ),
      example('the 3/2 line sits in the deep dip at 702 c, so 3/2 is smooth against 1/1.'),
    ],
    teaching: [
      p(
        'Read where a line meets the curve: a line at the bottom of a dip means that interval, measured from 1/1, is smooth.'
      ),
      p('A line that lands on a peak is rougher against 1/1.'),
    ],
    see: ['dissCurve', 'dissDips'],
  },
  dissDips: {
    term: 'Dips (smooth intervals)',
    text: 'The labeled low points of the curve, named by the simplest ratio nearby. They show where two notes with this sound blend best, which is not exactly where the ratios are for a different timbre. Example: with seven partials, the dip near 316 c is labeled 6/5 (315.6 c) and the one near 884 c is 5/3 (884.4 c).',
    see: ['dissCurve'],
  },
  dissReadout: {
    term: 'Dissonance readout',
    text: 'Shows the interval in cents and the roughness at the point you hover on the curve. Example: hovering 702 c reads a roughness near the bottom of the curve, hovering 100 c reads a much higher one.',
    see: ['dissCurve', 'dissAxes'],
  },
  liveRoughness: {
    term: 'Live roughness',
    help: [
      p(
        'The Sethares roughness of the notes sounding right now (field notes, notes outside the field, held keys and held chord previews). It shows the total, one bar per pair of notes, and a curve of what the total would be if one more note were added.'
      ),
      example(
        'hold C, G and B of 12-EDO and the total is 4.79; hold C, F-sharp and A-flat and it is 6.70, so the first chord is smoother.'
      ),
    ],
    teaching: [
      p(
        'It uses the same seven-partial sound as the dissonance curve, with the lowest sounding note at its own pitch above the 1/1 Hz setting.'
      ),
      p('It updates as notes start and stop.'),
    ],
    see: ['roughness', 'liveRoughTotal', 'liveRoughPairs', 'liveRoughCurve', 'dissCurve'],
  },
  liveRoughTotal: {
    term: 'Total roughness (live)',
    text: 'One number for everything sounding: the beating among all overtones of all the notes, each note against the others and against itself. Lower is smoother. No scale or threshold is claimed: compare one chord with another, in the same register. Example: 4.79 for C G B against 5.43 for C E G in 12-EDO means C G B beats less.',
    see: ['liveRoughness', 'roughness'],
  },
  liveRoughPairs: {
    term: 'Roughness by pair',
    text: 'One bar per pair of sounding notes, the roughest first, with the bar length in proportion to the largest. It shows which two notes cause the beating. Example: in C F-sharp A-flat the F-sharp to A-flat bar (2.46) is the longest, so that minor second is the roughest pair.',
    see: ['liveRoughness', 'liveRoughTotal'],
  },
  liveRoughCurve: {
    term: 'Next-note curve',
    help: [
      p(
        'Across: the interval above the lowest sounding note, in cents, over one repeat. Up: the total roughness if one more note were added at that interval. The dips, named by the nearest simple ratio, are the notes that blend best with what is playing.'
      ),
      keys([{ key: 'Point at the curve', does: 'read a value' }]),
      example(
        'over C and G, the curve dips at E (about 386 c) and the octave, so those are the notes that sit best on top of the fifth.'
      ),
    ],
    teaching: [p('The notes that sound now are marked on the curve.')],
    see: ['liveRoughness', 'dissCurve', 'dissDips'],
  },
  isoKeyboard: {
    term: 'Isomorphic keyboard',
    help: [
      p(
        'A grid of hexagonal keys where an interval always has the same shape: one step right is the first generator (3/2 by default), one step up and to the right is the second (2/1 or 5/4). Each hexagon shows the field note nearest its pitch, if there is one within the tolerance; the rest stay blank.'
      ),
      example(
        'with 3/2 and 2/1, a row of hexagons is a chain of fifths, so 1/1, 3/2, 9/8 run along it.'
      ),
    ],
    teaching: [p('With 5/4 as the second generator, up and right from 1/1 is the pure third 5/4.')],
    see: ['isoG1', 'isoG2', 'isoTol', 'isoHex'],
  },
  isoG1: {
    term: 'Right step (generator 1)',
    text: 'The interval for one hexagon to the right. Example: 3/2 makes the horizontal rows chains of pure fifths; 4/3 gives chains of fourths.',
    see: ['isoKeyboard'],
  },
  isoG2: {
    term: 'Up-right step (generator 2)',
    help: [
      p('The interval for one hexagon up and to the right.'),
      example(
        '2/1 makes each row up an octave higher, like a normal keyboard; 5/4 makes it a pure third higher, which fills the grid with just major triads.'
      ),
    ],
    teaching: [],
    see: ['isoKeyboard'],
  },
  isoTol: {
    term: 'Match within',
    text: 'How close, in cents, a hexagon pitch must be to a field note to show it. A tight limit leaves most of the grid blank; a loose one shows notes that are a little out of tune. Example: the fourth step of a chain of fifths is 81/64, which is 21.5 c above 5/4; at 20 c that hexagon stays blank, at 35 c it shows 5/4.',
    see: ['isoKeyboard', 'cents'],
  },
  isoHex: {
    term: 'Hexagon',
    help: [
      p(
        'One key. Filled and bright: a note in your subset. Outlined: a field note that you left out. Blank: no field note near that pitch.'
      ),
      keys([
        { key: 'Point at a key', does: 'read it in the inspector' },
        { key: 'Click', does: 'include or exclude the note' },
        { key: 'Alt+click', does: 'pin it (yellow outline)' },
      ]),
      example(
        'the 3/2 key lights when you play 3/2 anywhere, and on every hexagon that lands on it.'
      ),
    ],
    teaching: [
      p(
        'A green dot means it is sounding now, a blue outline marks a note of the highlighted chord, and a small bold chevron at the top of the key marks the mode root.'
      ),
    ],
    see: ['isoKeyboard', 'inspector'],
  },
  isoReadout: {
    term: 'Keyboard readout',
    text: 'How many field notes appear on the grid, and how many hexagons are blank. Example: if it reads "7 of 8 · 31 blank", it means seven of the eight field notes are reachable within the tolerance and about half the grid has no match.',
    see: ['isoKeyboard'],
  },
} satisfies Record<string, TextEntrySource>;

export type TipKey = keyof typeof entries;
/** The mode-root tooltip as one string, for native `title`s on the chevron glyphs that cannot host a tooltip. */
export const MODE_ROOT_TIP = `${entries.modeRoot.term}: ${normalizeEntry(entries.modeRoot).text}`;
export const TIPS = Object.fromEntries(
  Object.entries(entries).map(([k, v]) => [k, normalizeEntry(v as TextEntrySource)])
) as Record<TipKey, TextEntry>;
export const tipKeys = Object.keys(entries) as TipKey[];

/** Entries sorted by term, for the glossary. */
export const GLOSSARY: { key: TipKey; entry: TextEntry }[] = tipKeys
  .map((key) => ({ key, entry: TIPS[key] }))
  .sort((a, b) => a.entry.term.localeCompare(b.entry.term));
