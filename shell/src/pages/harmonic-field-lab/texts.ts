/**
 * One source of truth for every explanation in the lab. A hover tooltip shows `text`; the glossary drawer lists the same
 * entries (searchable) with their `see` links. Written plainly, each with a worked example. The glossary's single source:
 * every control, heading and analysis row of the lab has an entry here.
 */
export interface TextEntry {
  /** Name shown as the glossary term. */
  term: string;
  /** Plain explanation with an example. */
  text: string;
  /** Other entries worth reading next. */
  see?: readonly string[];
}

const entries = {
  /* ---- top bar ---- */
  wave: {
    term: 'Wave',
    text: 'The timbre the keys and Play buttons make. Sine is a pure tone with no overtones, so the slow beating between close notes is easiest to hear. Harmonic (7 partials) adds six overtones to every note, each 0.88 times as loud as the one below, which is the same sound the roughness score and the dissonance curve assume, so what you hear matches what they measure. Example: play 5/4 with 1/1 on Sine, then on Harmonic: the harmonic version beats less where the overtones line up (4:5) and more where they nearly miss.',
    see: ['roughness'],
  },
  baseHz: {
    term: '1/1 Hz',
    text: 'The pitch, in hertz, that the root of the scale (1/1) sounds at. Every other note is this frequency times its ratio. Example: 261.63 Hz is middle C, so 3/2 sounds at 392.44 Hz.',
    see: ['modeAtBase'],
  },
  volume: {
    term: 'Volume',
    text: 'Output level of everything the lab plays. Chords add up, so a four-note chord is louder than one note at the same setting. Example: at 50 a single sine is comfortable; four notes together may need 30.',
  },
  modeAtBase: {
    term: 'Mode root at 1/1 Hz',
    text: 'When on, turning to another mode moves the new root onto the 1/1 Hz pitch, so the tonic stays put and the scale changes around it. When off, the notes keep their absolute pitch and only the starting note changes. Example: with a major scale on, mode 5 starts a minor scale on the same C.',
    see: ['mode', 'baseHz'],
  },
  playScale: {
    term: 'Play scale',
    text: 'Plays the notes of the selected subset one after another, from the mode root up to the repeat (and back down, if Scale preview is set to Up-down in the Sound settings). Each note lights up in every view while it sounds. Example: with 1/1, 9/8, 5/4 selected you hear those three notes in turn, then the repeat.',
  },
  playChord: {
    term: 'Play chord',
    text: "Plays a chord. If a chord is highlighted (point at a chord chip, or click one to keep it), it plays that chord at the chord's own pitches above the 1/1 Hz setting; otherwise it plays all selected notes together from the mode root. Example: with 1/1, 5/4 and 3/2 selected and nothing highlighted you hear a just major triad, 4:5:6; with the minor triad 10:12:15 on 5/4 highlighted you hear that triad instead.",
  },
  stop: {
    term: 'Stop',
    text: 'Silences everything that is sounding, including held keys. Example: press it if a note keeps sounding after you switch tabs.',
  },
  tabs: {
    term: 'Tunings (tabs)',
    text: 'Each tab is a separate tuning with its own generator settings, field and subset, so you can compare ideas without losing one. Click a tab to switch (Alt+1 to Alt+9 also works), double-click its name to rename it (clear the name to get the automatic one back), click the cross to close it, the copy button to duplicate it, and the plus to add a new one. Example: keep "Harmonics 8-15" in one tab and 19-EDO in another.',
  },
  duplicateTab: {
    term: 'Duplicate tab',
    text: 'Copies the current tuning into a new tab right after it, named "<name> copy": same generator settings, same selected notes, same mode root. Change the copy freely and the original stays as it was. Example: duplicate "Harmonics 8-15", then switch the copy to a different starting harmonic to compare the two.',
    see: ['tabs'],
  },
  scalePreview: {
    term: 'Scale preview',
    text: 'How every scale preview runs, both Play scale and the preview of a key in Keys & Modes. Up plays the notes from the root up to the repeat. Up-down plays up and then comes back down to the root. Example: for 1/1, 9/8, 5/4 and a 2/1 repeat, Up plays 1/1 9/8 5/4 2/1; Up-down plays 1/1 9/8 5/4 2/1 5/4 9/8 1/1.',
    see: ['playScale', 'keyRings'],
  },
  glossary: {
    term: 'Glossary',
    text: 'Every explanation in the lab in one searchable list. Hovering any label shows the same text. Example: search "comma" to find the syntonic comma and the drift readout.',
  },
  keyboardDock: {
    term: 'Keyboard',
    text: 'The notes of your subset as playable keys, one octave from the mode root. Click a key or press z, x, c and so on (then a, s, d, and q, w, e) to climb up the subset. The dock stays at the bottom so the keys are always next to the views they light. Example: collapse it when you only want to read; open it to play the scale while watching the circle.',
  },

  /* ---- generator ---- */
  preset: {
    term: 'Preset',
    text: 'A ready-made starting point that fills in the method and its numbers. Example: "Harmonics 8-15" is one octave of the overtone series, whose 7th, 11th and 13th harmonics sit far from any 12-EDO note.',
    see: ['method'],
  },
  method: {
    term: 'Method',
    text: 'How the field of notes is built. Harmonic series takes consecutive overtones; Equal division splits the repeat into equal steps; Lattice stacks one or more generator intervals; Combination product set (CPS) multiplies chosen factors together; Custom takes ratios or a Scala file you type in. Example: Harmonic series starting at 8 gives 8/8, 9/8, 10/8, and so on up to 15/8.',
    see: ['repeat', 'field'],
  },
  repeat: {
    term: 'Repeat interval',
    text: 'The interval after which the scale starts over: its "octave". Most scales use 2/1, but 3/1 (a tritave) or 3/2 also work. Accepts ratios (3/2), whole numbers (3), cents (701.96 or 701.96c) and equal-division steps (7\\12). Example: 3/1 makes a scale that repeats every tritave.',
    see: ['field'],
  },
  startHarmonic: {
    term: 'Starting harmonic',
    text: 'The first overtone in the segment; the field runs from it up to twice its number. Example: 8 gives 8:9:10:11:12:13:14:15, which is one octave of the series; 16 gives 16 notes packed into the same octave.',
  },
  edoDivisions: {
    term: 'Divisions',
    text: 'How many equal steps the repeat is cut into. Example: 12 steps of an octave is ordinary piano tuning; 19 gives smaller steps of 63.2 cents.',
  },
  latticeShape: {
    term: 'Lattice shape',
    text: 'Box counts a fixed number of steps along each generator, like a grid. Diamond keeps everything within a total number of steps of 1/1. Example: generators 3/2 and 5/4, box 3 by 3, gives nine notes before reducing into the octave.',
  },
  diamondDistance: {
    term: 'Steps from the centre',
    text: 'For the Diamond shape: how many generator steps in total a note may be from 1/1, counting every axis together. Example: with generators 3/2 and 5/4 and 2 steps, 9/8 (two steps of 3/2) and 15/8 (one of each) are in, but 27/16 (three steps) is not.',
    see: ['latticeShape'],
  },
  genAxis: {
    term: 'Generator, count, centre',
    text: 'Generator is the interval stacked again and again (3/2 builds a chain of fifths). Count is how many to stack. Centre is how many steps go below 1/1. Example: 3/2, count 12, centre 0 builds the twelve notes up from the root; centre 6 spreads them both ways.',
    see: ['mos'],
  },
  mos: {
    term: 'MOS sizes',
    text: 'Moment of Symmetry: counts of generator steps where the chain folds into a scale with exactly two step sizes. For 3/2 inside an octave the sizes include 5 (pentatonic), 7 (diatonic) and 12. Click one to use it as the count. Example: 7 notes of a 3/2 chain give the diatonic 5L 2s pattern.',
    see: ['structure'],
  },
  cpsFactors: {
    term: 'Factors',
    text: 'The numbers that get multiplied together in pairs, triples and so on. Example: factors 1 3 5 7, choose 2 gives the hexany: 1x3, 1x5, 1x7, 3x5, 3x7, 5x7, each brought into the octave.',
  },
  cpsK: {
    term: 'Choose k',
    text: 'How many factors go into each product. Example: 1 3 5 7 with k = 2 is a hexany; with k = 3 it is 4 notes, a subharmonic tetrad; 1 3 5 7 9 with k = 2 is a 10-note dekany.',
  },
  customIntervals: {
    term: 'Custom intervals',
    text: 'Your own list of ratios, cents or EDO steps, one per line or separated by spaces. Example: 9/8 5/4 4/3 3/2 5/3 15/8 is the just major scale above 1/1.',
  },
  loadScl: {
    term: 'Load .scl',
    text: 'Reads a Scala scale file (the standard text format for tunings) and replaces the custom list with its notes. Example: a file from the Scala archive named "pyth_12.scl".',
  },
  primeFilter: {
    term: 'Prime filter',
    text: 'Switches off every note whose ratio uses a prime you have turned off. Example: with 11 and 13 off, Harmonics 8-15 loses 11/8 and 13/8, leaving a 7-limit field. Notes made only of cents (EDO steps) are not filtered.',
    see: ['primeLimit'],
  },
  primeAll: {
    term: 'All primes',
    text: 'Turns every prime on, so no note is filtered out. Example: use it to undo an earlier filter.',
  },
  primeNone: {
    term: 'No primes',
    text: 'Turns every prime off. Then switch on just the ones you want. Example: none, then 3 and 5 gives a 5-limit field.',
  },

  /* ---- field & subset ---- */
  field: {
    term: 'Field',
    text: 'The whole pool of notes the generator made, folded into one repeat and sorted by pitch. You pick a subset of it as your scale. Example: the field of Harmonics 8-15 has 8 notes; your subset can be any of them.',
    see: ['subset'],
  },
  subset: {
    term: 'Subset',
    text: 'The notes you have switched on: the scale you analyse and play. Example: switching off 11/8 leaves 7 of the 8 field notes.',
    see: ['mode'],
  },
  pitchCircle: {
    term: 'Pitch circle',
    text: 'Every field note placed round a circle by its pitch, the repeat being one full turn. Click a dot to include or exclude it; Alt+click pins it in the inspector (yellow ring) without changing the subset. Filled = in your subset, hollow = out; the pale grey shape joins the notes of the subset in circle order (the shape of the scale), under the blue shape of a highlighted chord; larger ring = sounding right now. Example: 3/2 sits just past the bottom of the circle, 702 of 1200 cents round.',
  },
  selectAll: {
    term: 'All',
    text: 'Puts every field note in the subset. Example: 8 of 8 notes selected.',
  },
  selectNone: {
    term: 'None',
    text: 'Empties the subset. Example: clear everything, then click just the dots you want.',
  },
  selectInvert: {
    term: 'Invert',
    text: 'Swaps the subset with everything that is outside it. Example: 7 of 8 selected becomes the 1 left out.',
  },
  mode: {
    term: 'Mode',
    text: "Which selected note is the scale's root. Moving it rotates the same notes into a new scale. Example: the white notes starting on C are major; starting on A they are natural minor.",
    see: ['modeAtBase', 'keysSummary'],
  },
  pickNearest: {
    term: 'Pick nearest',
    text: 'Chooses the field notes closest to a known scale or to an equal division. The menu also has "m-ED" (the nearest notes to an equal division) and "Odd limit..." (keep only the notes whose odd limit is at most the number you enter). Example: choosing "Major" with 12-EDO targets selects, for each degree of the major scale, the field note nearest to it; choosing "Odd limit..." with 15 keeps 15/8 but drops 17/16.',
  },
  nearTargets: {
    term: 'Targets',
    text: 'What the scale is measured against: 12-EDO means piano pitches, Just means the pure-ratio version of the scale. Example: the major third is 400 cents in 12-EDO but 386.3 cents (5/4) in Just.',
  },
  oddLimitPick: {
    term: 'Max odd limit',
    text: 'Keeps only notes whose ratio is simple enough: the largest odd number in it (after removing factors of 2) is at most the limit. Example: 15 keeps 15/8 (odd part 15) but drops 17/16.',
    see: ['oddLimit'],
  },
  keepNew: {
    term: 'Include new notes when the field changes',
    text: 'When on, notes that appear after you change the generator are added to your subset instead of left out. Example: raise the starting harmonic and the new notes join automatically.',
  },
  saveSubset: {
    term: 'Save',
    text: 'Stores the current subset under a name so you can come back to it. Saved subsets are listed below the name box. Example: name the seven-note scale No 11/8.',
  },
  exportScl: {
    term: 'Export .scl',
    text: 'Writes the subset as a Scala file other tuning software can open. Example: the seven notes become seven lines of ratios or cents.',
  },
  savedSubsets: {
    term: 'Saved subsets',
    text: 'Your named subsets for this tuning. Click a name to load it; point at one to preview it on the ring. Example: save the seven notes without 11/8 as "No 11/8", change the selection, then click it to get them back.',
  },
  compareTo: {
    term: 'Compare to',
    text: 'The target each note is measured against in the tuner strip: your picked scale, 12-EDO, just intonation up to an odd limit, or any equal division. Example: against 12-EDO, 13/8 reads +40.5, meaning 40.5 cents sharp of the nearest piano note.',
    see: ['tunerStrip', 'oddLimit'],
  },
  tunerStrip: {
    term: 'Tuner strip',
    text: 'Your scale laid out by pitch, with a faint reference line at every 100 c (1/1 as C): lighter where a piano white key would sit, darker for a black key. Saved subsets below use the same columns, so a note sits straight above and below itself. Each bar sits under its own dot: orange going up means that many cents sharp of its target, cyan going down means flat, and the printed number says how many. The letters under the notes are the steps between them. Example: "+40.5" over 13/8 means a bit under half a semitone sharp of 12-EDO\'s A-flat.',
    see: ['compareTo', 'cents'],
  },
  cents: {
    term: 'Cents',
    text: "The unit for pitch distance: 100 cents is one 12-EDO semitone and 1200 is one octave. Example: a just major third (5/4) is 386.3 cents, about 14 less than the piano's 400.",
  },
  lattice: {
    term: 'Lattice',
    text: 'Notes drawn as points on a grid whose directions are the primes (or generators): one step right is another factor of 3, one step up another 5, and so on. Notes that are close on the grid are closely related in ratio. Example: 3/2 and 9/8 are neighbours (one step of 3 apart).',
    see: ['latticeAxes', 'lattice3d'],
  },
  latticeAxes: {
    term: 'Lattice axes (primes)',
    text: "Which three primes become the three directions of the lattice, in 2D and in 3D. The list is ranked by fit: each choice shows how many of your selected notes sit on the grid with no stem (for example 3·5·7 — 7/7 on grid means all seven selected notes use only the primes 3, 5 and 7). The best fit is at the top; a tie goes to the choice whose notes are closer to 1/1. Auto, the default, always follows the best fit as you change the subset; pick a triple to keep it until you choose Auto again. Reading the primes: 3·5 is fifths and pure major thirds (classical just intonation), 3·7 is fifths plus harmonic sevenths. A note's place along an axis is its exponent of that prime; a note that uses another prime is drawn on a stem (see Off-axis notes). Example: with only 1/1, 3/2, 5/4 and 7/4 selected, 3·5·7 shows 4/4 on grid, while 3·5·11 shows 3/4 and puts 7/4 on a stem. Notes without a monzo (equal-division steps) cannot be placed and are left out of the count.",
    see: ['lattice', 'latticeStems', 'primePower'],
  },
  latticeStems: {
    term: 'Off-axis notes (stems)',
    text: "A note that uses a prime which is not one of the three chosen axes cannot sit on the grid, so it is drawn on a stem. A small hollow ring marks where it would be using the visible primes only. A dashed line in that prime's colour runs out from the ring, one lattice step long for each power of the prime, pointing the opposite way for a negative power. The note itself is the dot at the end, and its label carries a chip such as 11⁺¹ naming the hidden prime and its power (point at a chip to read what it means). Example: with axes 3, 5, 7, 11/8 has its ring at 1/1, one stem step of the 11 colour, and the chip 11⁺¹; 8/11 points the other way (11⁻¹); 143/128 has two stems chained, 11⁺¹ 13⁺¹.",
    see: ['latticeAxes', 'lattice3d', 'primePower'],
  },
  primePower: {
    term: 'Prime-power chip (e.g. 11⁺¹)',
    text: 'Names a prime that the note uses but the three chosen axes do not, and its power. The power is how many stem steps the note sits from its ring: ⁺¹ is one factor of the prime on top, ⁻¹ puts it underneath, ⁺² is two factors, and so on. Example: 11⁺¹ on 11/8 means one factor of 11 on top (11/8); 11⁻¹ would be 16/11; 11⁺² is two factors of 11, as in 121/64.',
    see: ['latticeStems', 'latticeAxes'],
  },
  fieldTable: {
    term: 'Field table',
    text: 'One line for every field note: ratio, cents and its distance from the nearest 12-EDO key, with a mark for whether it is in the subset. Point at a line to light the note everywhere and read it in the inspector; click to include or exclude it, Alt+click to pin it in the inspector. "Open full table" shows every column with sorting. Example: the 13/8 line reads 840.5 c, "Ab +40.5": a note 40.5 c sharp of the piano A-flat.',
  },
  colRatio: {
    term: 'Ratio',
    text: 'The note as a frequency ratio above 1/1. Example: 5/4 means 25 % higher in frequency.',
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
    text: 'The gaps between neighbouring notes, read upward from the mode root, as letters. L = large, M = medium, s = small; with more than three sizes the letters are a, b, c... from largest down. Example: the diatonic major scale is LLsLLLs.',
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
    text: 'The largest prime used by any ratio in the subset. 3 = Pythagorean, 5 = classical just intonation, 7 and up = harmonic-series colours. "Irrational" if any note is cents-only. Example: 13 here, because of 13/8.',
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
  scaleTable: {
    term: 'Scale',
    text: "The subset read from its mode root: degree, ratio, cents above the root, step to the next degree, and the step's size letter. Example: degree 2 is 5/4 at 386.31 c.",
  },
  spectrum: {
    term: 'Interval spectrum',
    text: 'For each generic interval (1 step, 2 steps...), every size it takes across the scale, with how often. One row per interval, so you read across. Example: "3 steps: 4 sizes" means starting from different degrees, a 4th comes out in 4 different widths.',
    see: ['variety', 'propriety', 'constantStructure'],
  },
  chordTolerance: {
    term: 'Tolerance (c)',
    text: 'How far a note may be from a chord template and still count as that chord, in cents. Example: 18 c accepts 12-EDO major thirds (14 c wide of 5/4) as the 4:5:6 chord; 5 c would not.',
    see: ['chordError'],
  },
  templates: {
    term: 'Chord templates',
    text: 'The chord shapes the finder looks for, written as ratios between notes. a:b:c means the notes are harmonics of one fundamental (4:5:6 is a major triad); 1/(a:b:c) means they are undertones. Edit them with the Edit templates button; the list is remembered between visits. Example: the template 4:5:6 finds every major triad in the subset.',
  },
  chordExact: {
    term: 'Chord: exact',
    text: "The matched notes make this chord with no error: every ratio is exactly the template's. Example: 1/1, 5/4, 3/2 is exactly 4:5:6.",
  },
  chordError: {
    term: 'Chord: error (c)',
    text: 'The worst-tuned note of the chord, in cents from the template; smaller is closer and 0 is exact. Colour (never alone, the number is always printed): cyan exact, green under 5 c, yellow 5-15 c, orange 15-30 c, red 30 c or more. Example: 13.7 means a note is 13.7 c from the template.',
    see: ['chordTolerance'],
  },
  keysSummary: {
    term: 'Keys',
    text: 'How many field notes can start your whole scale with every note still in the field (a complete key). Your current root always counts. Example: "1 of 8" means only the original key survives; Ellis\'s Duodene holds Ptolemy\'s major in 2 of 12.',
    see: ['mode'],
  },
  modes: {
    term: 'Modes (heat grid)',
    text: "The panel for rotation: a mode keeps the same notes and starts the scale on another degree (a key, in the Keys panel, moves the whole scale instead; C major to D dorian is a mode change, C major to G major a key change). One row per mode (the scale restarted from each degree), one column per degree of that mode; narrow panels wrap the degrees onto more lines, always under the same column. Each cell is coloured by how close that degree lands to a field note when the mode's root is moved to 1/1: cool means a field note is right there, warm means the field has nothing close. Hover a row to print the cents errors; click a row to make that mode the current one. Example: row 1 is the scale from 9/8; if its 5th degree misses by 21.5 c, that cell is orange.",
    see: ['mode', 'chordError'],
  },

  /* ---- retuner ---- */
  retunerOn: {
    term: 'Retuner on/off',
    text: 'When on, playing two or more keys makes the retuner pick the best card for that chord and retune everything around the pivot. Off leaves the tuning as it is. Example: switch it off while you edit cards so playing does not retune.',
    see: ['cards'],
  },
  cards: {
    term: 'Cards',
    text: 'A card is a candidate scale. The retuner moves their roots so the pivot note stays exactly where it was, then tests what the held chord would sound like in each one. Example: a major scale with a 9/8 second and one with a 10/9 second are two cards that differ by a syntonic comma.',
    see: ['homeCard', 'pivot'],
  },
  cardAdd: {
    term: 'Add current tab as card',
    text: 'Copies the scale you are looking at into the card list. Example: build a 10/9-second major scale in another tab, then add it here as a candidate.',
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
    text: 'The card the retuner chose last; the main views and the keyboard follow it. Example: after the ii chord the 10/9-second card is active.',
  },
  rootNow: {
    term: 'Root now',
    text: 'Where the 1/1 of the card sits right now compared with where it started. Example: after the progression I, vi, ii, V, I in Freestyle every card root reads 80/81, which is 21.5 cents below where it started; a root that has not moved reads 1/1.',
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
    text: 'When the retuner decides. Auto runs every time a chord of two or more keys is held. Manual waits until you press Retune now. Example: choose Manual to set up a chord, then press Retune now once it is right.',
  },
  retuneNow: {
    term: 'Retune now',
    text: 'Runs one retune on the keys held right now (used with the Manual trigger). Example: hold A, C and E, then press it to retune around them.',
  },
  scorer: {
    term: 'Scorer',
    text: 'How "good" a predicted chord is; the lowest score wins. Roughness (Sethares) adds up the beating between every pair of overtones and is the default. Lattice distance only looks at how simple the intervals are. Pitch-fair periodicity counts how quickly the waveform repeats. Infinitone parity copies Infinitone 2\'s own count. Example: switch from Roughness to Lattice distance and see whether the same card still wins.',
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
    text: 'The list on the left picks which analysis panel shows on the right; the figure beside each name is a live summary of your current subset. Everything on the left and in the middle (generator, circle, tuner strip) is always visible. Example: "Chords 10" means ten chords are found at the current tolerance; click it to see them.',
  },
  chords: {
    term: 'Chords',
    text: 'Chord shapes (templates such as 4:5:6) that your subset contains. Sections are by number of notes; inside each, one row per family (Major, Septimal, ...). Every chip is one voicing: the template, its root, the field notes used and the largest error in cents. When two field notes are both close enough to a chord tone, each gets its own chip. Example: "4:5:6 @ 1/1, 1/1 5/4 3/2" is a just major triad on the root; hovering a chip lights its notes on the circle.',
    see: ['chordTolerance', 'templates', 'chordLadder'],
  },
  cpsChords: {
    term: 'Chords inside this CPS',
    text: 'A CPS (combination product set) is made by multiplying every k-sized group of a few chosen factors. With factors 1 3 5 7 and k = 2 you get the hexany: 1x3, 1x5, 1x7, 3x5, 3x7 and 5x7, each divided by the lowest so it starts at 1/1. The notes of such a set are related in a regular way, and the chords inside it are read straight from which factors the notes share, not by a template. Click a chip to hear it and keep it highlighted (click again to clear); Shift-click makes its notes the subset. Example: in that hexany the notes that all use the factor 1 are one otonal chord.',
    see: ['otonal', 'utonal', 'latticeMode'],
  },
  otonal: {
    term: 'Otonal (harmonic)',
    text: 'A chord whose notes are all harmonics of one common fundamental (a slice of the overtone series, not necessarily neighbouring harmonics): it sounds as x1:x2:x3. In a CPS these are the notes that all share the same factors except one, and that one factor varies. Example: the notes 1x3, 1x5 and 1x7 all share the factor 1, and the varying factors give the chord 3:5:7.',
    see: ['utonal', 'cpsChords'],
  },
  utonal: {
    term: 'Utonal (subharmonic)',
    text: 'The mirror image of otonal: the notes are a slice of the undertone series, so the chord sounds as 1/x1:1/x2:1/x3. In a CPS these are the notes that sit inside the same larger group of factors, each leaving one factor out. Example: the notes 1x3, 1x5 and 3x5 all sit inside the factors 1, 3 and 5; they leave out 5, 3 and 1 in turn, giving the chord 1/1:1/3:1/5 (named by the factor each note leaves out, not listed by pitch).',
    see: ['otonal', 'cpsChords'],
  },
  chordFamily: {
    term: 'Chord families',
    text: 'Chords are grouped by how many notes they have (triads, tetrads, larger), then by family, a label you can edit on each template: Major, Minor, Septimal, Utonal and so on. Templates without a family go in an "Other" row. Example: 4:5:6 and 8:10:12:15 are both Major; 6:7:9 and 4:5:6:7 are Septimal.',
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
  chordLadder: {
    term: 'Tolerance ladder',
    text: 'The tolerances at which the number of chords changes. Dashed chips are chords that do not fit yet; clicking one (or a rung, or the + and - buttons) moves the tolerance to the value where it appears. Example: "+3 c: 2 more chords" means raising tolerance by 3 cents brings in two more chords.',
    see: ['chordTolerance'],
  },
  editTemplates: {
    term: 'Edit templates',
    text: 'Opens the list of chord shapes the finder uses, so you can add, rename or remove them. Write a:b:c for harmonics of one fundamental, or 1/(a:b:c) for undertones. Example: add 8:10:12:14 as "major 7th, septimal" to look for it in every scale you build.',
    see: ['templates'],
  },
  keysModes: {
    term: 'Keys (transposition)',
    text: 'The panel for moving your whole scale: transposition. A key is the same scale started on another field note, so every interval stays the same and only the starting pitch changes. This is different from a mode, which keeps the same notes and starts the scale on another degree (see Modes). Example: C major to G major is a key change (C D E F G A B becomes G A B C D E F#); C major to D dorian is a mode change (the same seven notes, now starting on D).',
    see: ['modes', 'keyRings', 'keyView', 'commonTones'],
  },
  keyRings: {
    term: 'Key rings',
    text: 'One small circle per possible key (each field note as the new root). Filled dots are scale notes that land on a field note; a cross marks a note the field does not have. A key with no crosses is complete (its ring has a border): the whole scale fits there. Under each ring, the root and the common-tone count. Hover a ring to compare it in the big view; click it to Switch to that key (the subset becomes the key, with its root as the mode root; on an incomplete ring only the notes the field does have). Shift+click adds the key instead (see Add key). Alt+click pins the root note of that key, as in every other view. Ctrl-click (Cmd on a Mac) plays the key as a scale, in the direction set by Scale preview. Example: only the 1/1 ring has no crosses in this field; clicking the 9/8 ring selects the few notes that do land.',
    see: ['keySwitch', 'keyAdd', 'commonTones', 'scalePreview'],
  },
  commonTones: {
    term: 'Common tones (x|y)',
    text: 'Under each key ring: x is how many notes the key shares with your current subset, y is how many notes the subset has. The bar is a separator, not a division. More shared notes means a closer key: a key with the same notes as the subset shows y|y. Example: for C major, the G major ring reads 6|7 (all but F, which becomes F#) and the F# major ring reads 2|7 (only B and F survive), so G major is a close key and F# major is a distant one.',
    see: ['keyView', 'keyRings'],
  },
  keyView: {
    term: 'Key comparison',
    text: 'One large circle comparing your subset with a key. It shows the key you point at in the small rings, else the one you last clicked, else the current key (your subset itself, where everything is common). It goes back to the current key whenever the subset changes any other way (a new selection, preset, method, mode or tab). Everything sounding is lit green, and pointing at a note here lights it in every view. The line under it counts the four groups in words. Example: from C major to G major it reads "6 common · +1 added · −1 dropped · 0 missing": F# would be added and F dropped.',
    see: ['keyMarks', 'keySwitch', 'keyAdd', 'commonTones'],
  },
  keyMarks: {
    term: 'Key comparison marks',
    text: 'Four kinds of mark, each with its own shape so colour is never the only clue. Filled dot: a common note, in both the subset and the key. Hollow dot with a plus: a note the key would add (in the key, not in your subset). Hollow dot struck through with a minus: a note the key would drop (in your subset, not in the key). Dashed circle: a degree of the key the field has no note for, so it can never be added. Example: for C major against G major, F# is a plus, F is a minus, and the other six are filled.',
    see: ['keyView'],
  },
  keySwitch: {
    term: 'Switch to key',
    text: 'Makes the shown key your subset: the notes of your subset move to that key, dropping the ones the key does not use. The key root becomes the mode root. Same as clicking its small ring. Notes the field does not have are left out. Example: with C major and the G major key shown, Switch gives G A B C D E F#; the F is gone.',
    see: ['keyAdd', 'keyRings'],
  },
  keyAdd: {
    term: 'Add key',
    text: 'Adds the notes of the shown key to your subset and keeps everything you already have; the mode root stays where it is. Same as Shift+click on its small ring. Notes the field does not have cannot be added. Example: with C major and the G major key shown, Add gives the eight notes C D E F F# G A B (F stays, F# joins), still rooted on C.',
    see: ['keySwitch', 'keyRings'],
  },
  inspector: {
    term: 'Note inspector',
    text: 'Shows one row of the field table for the note you point at, or pinned with Alt+click, anywhere (circle, strip, keys, lattice): ratio, cents, monzo (prime exponents), nearest 12-EDO key and how far off it is. Example: pointing at 13/8 reads 840.53 c, monzo 2^-3 13, and about 40 c sharp of Ab.',
    see: ['fieldTable'],
  },
  fieldSettings: {
    term: 'Field settings',
    text: 'Folds out the less-used generator settings: which primes are allowed, and the repeat interval. Example: switch 11 and 13 off to leave a 7-limit field; set the repeat to 3/1 for a tritave scale.',
    see: ['primeFilter', 'repeat'],
  },
  soundMenu: {
    term: 'Sound settings',
    text: 'Wave shape, the pitch of 1/1 in hertz, volume and where a mode root lands. Example: set 1/1 to 261.63 Hz for middle C and pick Sine to hear beating most clearly.',
    see: ['wave', 'baseHz', 'volume', 'modeAtBase'],
  },
  stepBars: {
    term: 'Step-size bars',
    text: 'One bar per distinct gap between neighbouring scale notes, as wide as the gap, with a letter and how often it occurs. Equal bars mean an even scale. Example: a = 203.9 c once, h = 111.7 c once: eight different sizes, so this is not a MOS scale.',
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
  retunerPanel: {
    term: 'Retuner',
    text: 'Re-roots a list of candidate scales around a held pivot note and picks the card whose predicted chord scores best. This panel is still a placeholder until the retuner milestone. Example: hold C-E-G and the card with the purest 4:5:6 wins.',
    see: ['cards', 'why'],
  },
  dockToggle: {
    term: 'Keyboard dock',
    text: 'Collapses the key row to a thin bar to give the workspace more room. The sounding notes stay listed. Example: collapse it while reading, open it to play along.',
    see: ['keyboardDock'],
  },
  methodParams: {
    term: 'Method options',
    text: 'The numbers belonging to the chosen method, shown beside the method tabs. Example: Harmonic series shows its starting harmonic; Equal division shows the number of divisions.',
    see: ['method'],
  },
  ringView: {
    term: 'Ring view: Chromatic | Fifths',
    text: 'Chromatic places each note by its pitch, so the angle is its cents within the repeat. Fifths places notes along a chain of generator steps (3/2 by default), the way the circle of fifths does: neighbours on the ring are a fifth apart. Example: in Fifths, 3/2 sits one step clockwise of 1/1 and 9/8 two steps; 5/4 sits at step +4 with a small offset because the pure third is 21.5 c flatter than four stacked fifths.',
    see: ['ringMenu', 'offChain'],
  },
  ringMenu: {
    term: 'Ring menu',
    text: 'Settings for the Fifths view: the generator that is stacked to build the chain (3/2 here) and how many positions the chain has. 12 gives the familiar circle of fifths; 17, 19 or 31 suit other tunings. Example: with 19 positions and a generator of about 694.7 c, a 19-EDO scale draws as an even ring.',
    see: ['ringView'],
  },
  offChain: {
    term: 'Off-chain note',
    text: 'In the Fifths view, a note more than half a chain step from every position, so no step describes it well. It is drawn as a small dashed mark inside the ring at its nearest step. Example: 11/8 is 53 c from F and 60 c from F-sharp, so it sits off the chain.',
    see: ['ringView'],
  },
  savedAll: {
    term: 'All collections',
    text: 'Saved subsets belong to the pitch collection they were saved on. By default the list shows only those of the collection in this tab; tick All to list every saved subset. Loading one from another collection switches this tab to that collection. Example: "Major 12-EDO" saved on 12-EDO is hidden while you work on Harmonics 8-15 until you tick All.',
    see: ['savedSubsets'],
  },
  renameSaved: {
    term: 'Rename saved subset',
    text: 'Gives a saved subset a new name; the notes stay the same. Example: rename "Subset 2" to "Dorian-ish".',
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
    term: 'Octave to repeat',
    text: 'When the repeat is not an octave, stretch the chosen scale so its octave spans your repeat instead of using its cents unchanged. Example: with a 3/1 repeat, a major scale is multiplied by 1.585, so its top note lands on 3/1.',
    see: ['pickNearest'],
  },
  auditionNote: {
    term: 'Play this note',
    text: 'Sounds this one field note for a moment at its own pitch above the 1/1 Hz setting, and lights it in every view. Example: press it on 5/4 to hear the major third before deciding to keep it.',
    see: ['baseHz'],
  },
  unpinNote: {
    term: 'Unpin',
    text: 'The inspector keeps showing the note you pinned (Alt+click, or Alt+Enter on a focused note, in any view) until you unpin it: Alt+click it again or press the pinned label. A pinned note is marked in yellow in every view. A plain click only includes or excludes the note. Example: Alt+click 5/4 on the ring, move the mouse over other notes to compare, then unpin to go back to following the mouse.',
    see: ['inspector'],
  },
  savedRow: {
    term: 'Saved subset',
    text: 'One saved selection of this pitch collection, drawn as a miniature tuner strip: a dot for every field note, bright when it is in the subset and dim when it is out, with small orange (sharp) and cyan (flat) bars for the distance from 12-EDO. Pointing at a row previews it on the ring; clicking loads it. Example: "Septimal tetrad 4:5:6:7" lights 1/1, 5/4, 3/2 and 7/4 and dims the rest.',
    see: ['savedSubsets'],
  },
  pinPanel: {
    term: 'Pin as a column',
    text: 'Gives this panel its own column beside the generator, so on a wide screen several analyses are visible at once. Click it and choose Pin left or Pin right: the column goes on that side, right next to the generator. Pinned columns can be moved left or right and reordered; the arrangement is remembered. A dimmed pin means it is pinned but there is no room for its column at this window width; it stays reachable through the switcher. Example: pin Keys & Modes and Chords on an ultrawide to watch both while you edit the subset.',
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
    text: 'Lists every other pinned panel whose column has room (a column holds up to three panels), with its side and how full it is, and moves this panel to the bottom of that column, so the panels share its height. It works across the generator and at any distance; a panel taken out of a stack leaves the others together. Disabled when every other column is full. Example: on Visualizer 3 - Dissonance curve choose "Visualizer 1 - Lattice (right, 1 of 3)" to see the lattice and the curve one above the other; then stack Visualizer 2 - EDO fit the same way to have all three in one column.',
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
    text: 'Drag this bar to change how a stacked column is shared, or focus it and press Up or Down to move it 5% (Home and End jump to its limits). A stack of three has two bars; each one only trades space between the two panels beside it. Every panel keeps at least 20% of the height or 6 rem, whichever is larger. Double-click either bar to go back to even shares. Example: drag the upper bar down to give Visualizer 1 - Lattice more room while Visualizer 3 - Dissonance curve stays the same size.',
    see: ['stackPin'],
  },
  /* ---- visualizer panels ---- */
  vizView: {
    term: 'Visualizer view',
    text: 'A visualizer panel can show any of four views of the same subset: Lattice, EDO fit, Dissonance curve or Isomorphic keyboard. The panel is named after the view it shows; pick another from this menu. There are three visualizer panels in the rail, so you can keep several views side by side. Example: leave the first visualizer on Lattice and switch the second to EDO fit to see the grid and the tuning fit together.',
    see: ['lattice', 'edoFit', 'dissCurve', 'isoKeyboard'],
  },
  vizPopOut: {
    term: 'Open in a large window',
    text: 'Shows the same view full size in a window over the page, with its own controls. Closing it changes nothing. Example: pop out the 3D lattice to rotate a big field with room for every label.',
    see: ['openFullTable'],
  },
  latticeMode: {
    term: 'Lattice axis mode',
    text: 'What the directions of the lattice mean. Primes (always available): one direction per prime, so a note sits at its prime exponents, as in 3/2 is one step of 3. Generators: one direction per generator of the Lattice method (for example 3/2 and 5/4), so a note sits at how many steps of each generator it took; a line is one step of one generator. Factors: for a CPS, one direction per factor, a note sits where its factors are (the first factor in the centre, the others around it, which makes the hexany a star); a line joins two notes that swap one factor. Generators needs a field built by the Lattice method and Factors needs the CPS method; otherwise they are greyed out. Example: with the Lattice method and generators 3/2 and 5/4, Generators shows the fifth-by-third grid you typed in.',
    see: ['lattice', 'latticeAltAxes', 'cpsChords'],
  },
  latticeAltAxes: {
    term: 'Axes (generators or factors)',
    text: 'The directions used in this mode, in order, shown as a small key at the bottom left of the lattice. For Generators they are the generators as you typed them; for Factors they are the CPS factors. Example: "generators 3/2, 5/4" means one step along the first axis multiplies by 3/2 and one along the second by 5/4.',
    see: ['latticeMode'],
  },
  latticeDim: {
    term: 'Lattice 2D | 3D',
    text: 'Switches the lattice between a flat picture and a rotatable 3D one. 2D squeezes every prime onto a plane, so two notes can look close when they are not. 3D gives three primes their own real direction (3D is only for the prime lattice; Generators and Factors are drawn flat). Example: in 3D, 15/8 sits one step along the 3 axis and one along the 5 axis from 1/1, while 11/8 is drawn on a stem so it never overlaps a real note.',
    see: ['lattice', 'lattice3d'],
  },
  lattice3d: {
    term: '3D lattice',
    text: 'The prime lattice in three dimensions. Each note is a small sphere placed by its prime exponents: how many steps of 3, of 5 and of 7 lie between it and 1/1. Neighbouring spheres joined by a line are one prime step apart. Drag to rotate, scroll to zoom, right-drag (or two-finger drag) to pan. Example: 9/8 is two steps out along the 3 axis, 5/4 one step along the 5 axis.',
    see: ['lattice', 'latticeAxes', 'latticeStems'],
  },
  lattice3dReset: {
    term: 'Reset view',
    text: 'Returns the 3D lattice camera to its starting angle and zoom, framing every note. Example: use it after rotating the lattice upside down.',
  },
  lattice3dView: {
    term: '3D view',
    text: 'The 3D lattice itself. Drag to rotate, scroll to zoom, right-drag to pan. Point at a sphere to read the note in the inspector; click to include or exclude it, Alt+click to pin it (yellow halo). Bright spheres are in your subset, dim ones are in the field but left out, a green sphere is sounding, and a blue ring marks a note of the highlighted chord. A hollow ring with a dashed coloured line is the base and stem of an off-axis note. Example: hover 3/2 and the inspector shows 701.96 c.',
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
    text: 'The number of divisions n runs along the bottom (5 to 72) and the error in cents runs up the side. Each bar is the largest error of any subset note in that n-EDO; the dot is the average error. Taller than the top of the chart is clipped. The best few n are drawn in violet and named. Point at a bar to read it; click a bar to keep it highlighted. Example: a bar at n = 22 with a worst of 7.1 c means every note of the 1/1, 5/4, 3/2 triad is within 7.1 c of a 22-EDO step.',
    see: ['edoFit', 'edoReadout'],
  },
  edoReadout: {
    term: 'EDO readout',
    text: 'The numbers behind the bar you point at or have clicked: n, the step size, the worst and the mean error in cents, and the worst error as a share of one step (0 % exact, 50 % is the worst possible). Example: for 1/1, 5/4, 3/2 at n = 31: step 38.7 c, worst 5.2 c, mean 2.0 c, 13 % of a step.',
    see: ['edoChart', 'edoRelative'],
  },
  edoRelative: {
    term: 'Error relative to the step',
    text: "The worst error divided by the size of one step of that division. Bigger divisions always shrink the error in cents, so this tells you whether a division fits better than its size alone would suggest. Example: 12-EDO's worst miss is 13.7 c (the major third 5/4) of a 100 c step (14 %); 22-EDO's worst miss is 7.1 c (the fifth 3/2) of a 54.5 c step (13 %), so they fit about equally well for their size.",
    see: ['edoFit'],
  },
  edoBestRow: {
    term: 'Best fits',
    text: 'A short list of the divisions worth trying. It keeps each n that fits your subset better than every smaller n (a new record), then names the few of those with the smallest error relative to their step. The lowest error overall would always just be 72. Example: for 1/1, 5/4, 3/2, 7/4 the record-setters include 22 and 31, and 31 beats 12-EDO by a wide margin (5.2 c against 31.2 c).',
    see: ['edoFit', 'edoRelative'],
  },
  dissCurve: {
    term: 'Dissonance curve',
    text: 'How rough two notes sound together, for every interval from a unison (0 c) up to the octave (1200 c). Both notes are given seven partials (the note and six overtones), and the roughness (Sethares model, the same one the retuner uses) adds up the beating between every pair of overtones. Low is smooth. The dips are the intervals that sound consonant for this sound. Your subset notes are marked on top. Example: the curve dips at 386 c (5/4), 498 c (4/3) and 702 c (3/2), which are the just major third, fourth and fifth.',
    see: ['roughness', 'dissMarks', 'dissDips'],
  },
  dissAxes: {
    term: 'Dissonance axes',
    text: "Across: the interval above the lower note, in cents (0 to 1200). Up: roughness, in the model's own units; only the relative height matters. The lower note is fixed at 261.63 Hz (middle C), because roughness also depends on how high the notes are. Example: a few tens of cents above the unison the two notes beat quickly against each other, and the curve is at its peak.",
    see: ['dissCurve', 'cents'],
  },
  dissMarks: {
    term: 'Scale marks on the curve',
    text: 'A vertical line at the cents of every field note. Bright lines are notes in your subset; faint lines are field notes you left out; green means sounding now. Read where a line meets the curve: a line at the bottom of a dip means that interval, measured from 1/1, is smooth. Example: the 3/2 line sits in the deep dip at 702 c, so 3/2 is smooth against 1/1; a line that lands on a peak is rougher against 1/1.',
    see: ['dissCurve', 'dissDips'],
  },
  dissDips: {
    term: 'Dips (smooth intervals)',
    text: 'The labelled low points of the curve, named by the simplest ratio nearby. They show where two notes with this sound blend best, which is not exactly where the ratios are for a different timbre. Example: with seven partials, the dip near 316 c is labelled 6/5 (315.6 c) and the one near 884 c is 5/3 (884.4 c).',
    see: ['dissCurve'],
  },
  dissReadout: {
    term: 'Dissonance readout',
    text: 'Shows the interval in cents and the roughness at the point you hover on the curve. Example: hovering 702 c reads a roughness near the bottom of the curve, hovering 100 c reads a much higher one.',
    see: ['dissCurve', 'dissAxes'],
  },
  isoKeyboard: {
    term: 'Isomorphic keyboard',
    text: 'A grid of hexagonal keys where an interval always has the same shape: one step right is the first generator (3/2 by default), one step up and to the right is the second (2/1 or 5/4). Each hexagon shows the field note nearest its pitch, if there is one within the tolerance; the rest stay blank. Example: with 3/2 and 2/1, a row of hexagons is a chain of fifths, so 1/1, 3/2, 9/8 run along it; with 5/4 as the second generator, up and right from 1/1 is the pure third 5/4.',
    see: ['isoG1', 'isoG2', 'isoTol', 'isoHex'],
  },
  isoG1: {
    term: 'Right step (generator 1)',
    text: 'The interval for one hexagon to the right. Example: 3/2 makes the horizontal rows chains of pure fifths; 4/3 gives chains of fourths.',
    see: ['isoKeyboard'],
  },
  isoG2: {
    term: 'Up-right step (generator 2)',
    text: 'The interval for one hexagon up and to the right. Example: 2/1 makes each row up an octave higher, like a normal keyboard; 5/4 makes it a pure third higher, which fills the grid with just major triads.',
    see: ['isoKeyboard'],
  },
  isoTol: {
    term: 'Match within',
    text: 'How close, in cents, a hexagon pitch must be to a field note to show it. A tight limit leaves most of the grid blank; a loose one shows notes that are a little out of tune. Example: the fourth step of a chain of fifths is 81/64, which is 21.5 c above 5/4; at 20 c that hexagon stays blank, at 35 c it shows 5/4.',
    see: ['isoKeyboard', 'cents'],
  },
  isoHex: {
    term: 'Hexagon',
    text: 'One key. Filled and bright: a note in your subset. Outlined: a field note that you left out. Blank: no field note near that pitch. A green dot means it is sounding now, and a blue outline marks a note of the highlighted chord. Point at a key to read it in the inspector; click to include or exclude the note, Alt+click to pin it (yellow outline). Example: the 3/2 key lights when you play 3/2 anywhere, and on every hexagon that lands on it.',
    see: ['isoKeyboard', 'inspector'],
  },
  isoReadout: {
    term: 'Keyboard readout',
    text: 'How many field notes appear on the grid, and how many hexagons are blank. Example: if it reads "7 of 8 notes, 31 blank", it means seven of the eight field notes are reachable within the tolerance and about half the grid has no match.',
    see: ['isoKeyboard'],
  },
} satisfies Record<string, TextEntry>;

export type TipKey = keyof typeof entries;
export const TIPS: Record<TipKey, TextEntry> = entries;
export const tipKeys = Object.keys(entries) as TipKey[];

/** Entries sorted by term, for the glossary. */
export const GLOSSARY: { key: TipKey; entry: TextEntry }[] = tipKeys
  .map((key) => ({ key, entry: TIPS[key] }))
  .sort((a, b) => a.entry.term.localeCompare(b.entry.term));
