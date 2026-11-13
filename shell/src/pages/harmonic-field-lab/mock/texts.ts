/**
 * One source of truth for every explanation in the lab. A hover tooltip shows `text`; the glossary drawer lists the same
 * entries (searchable) with their `see` links. Written plainly, each with a worked example. The mock holds a
 * representative set; M6 completes it for every control and analysis row.
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
    text: 'The shape of the sound the keys and Play buttons make. Sine is a pure tone with no overtones, so the beating between close notes is easiest to hear. Saw is bright and buzzy, with every overtone present. Example: play 9/8 against 1/1 on Sine to hear a slow throb, then on Saw to hear it much more roughly.',
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
    text: 'Plays the notes of the selected subset one after another, from the mode root up to the repeat. Each note lights up in every view while it sounds. Example: with 1/1, 9/8, 5/4 selected you hear those three notes in turn.',
  },
  playChord: {
    term: 'Play chord',
    text: 'Plays all selected notes together as one chord. Example: with 1/1, 5/4 and 3/2 selected you hear a just major triad, 4:5:6.',
  },
  stop: {
    term: 'Stop',
    text: 'Silences everything that is sounding, including held keys. Example: press it if a note keeps sounding after you switch tabs.',
  },
  tabs: {
    term: 'Tunings (tabs)',
    text: 'Each tab is a separate tuning with its own generator settings, field and subset, so you can compare ideas without losing one. Example: keep "Harmonics 8-15" in one tab and 19-EDO in another.',
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
    text: 'Every field note placed round a circle by its pitch, the repeat being one full turn. Click a dot to include or exclude it. Filled with an outline = in your subset; hollow = out; larger ring = sounding right now. Example: 3/2 sits just past the bottom of the circle, 702 of 1200 cents round.',
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
    text: 'Chooses the field notes closest to a known scale or to an equal division. Example: choosing "Major" with 12-EDO targets selects, for each degree of the major scale, the field note nearest to it.',
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
    text: 'Your named subsets for this tuning. Click a name to load it. Example: "No 11/8" loads the seven-note scale used in this mock.',
  },
  compareTo: {
    term: 'Compare to',
    text: 'The target each note is measured against in the tuner strip: your picked scale, 12-EDO, just intonation up to an odd limit, or any equal division. Example: against 12-EDO, 13/8 reads +40.5, meaning 40.5 cents sharp of the nearest piano note.',
    see: ['tunerStrip', 'oddLimit'],
  },
  tunerStrip: {
    term: 'Tuner strip',
    text: 'Your scale laid out by pitch, with a faint reference line at every 100 c (1/1 as C): lighter where a piano white key would sit, darker for a black key. Saved subsets below use the same columns, so a note sits straight above and below itself. Each bar sits under its own dot: pink going up means that many cents sharp of its target, cyan going down means flat, and the printed number says how many. The letters under the notes are the steps between them. Example: "+40.5" over 13/8 means a bit under half a semitone sharp of 12-EDO\'s A-flat.',
    see: ['compareTo', 'cents'],
  },
  cents: {
    term: 'Cents',
    text: "The unit for pitch distance: 100 cents is one 12-EDO semitone and 1200 is one octave. Example: a just major third (5/4) is 386.3 cents, about 14 less than the piano's 400.",
  },
  lattice: {
    term: 'Lattice',
    text: 'Notes drawn as points on a grid whose directions are the primes (or generators): one step right is another factor of 3, one step up another 5, and so on. Notes that are close on the grid are closely related in ratio. Example: 3/2 and 9/8 are neighbours (one step of 3 apart).',
    see: ['latticeAxes'],
  },
  latticeAxes: {
    term: 'Lattice axes',
    text: 'What the grid directions mean: Auto picks sensibly, Generators uses your stacked intervals, Factors uses CPS factors, Primes uses each prime number. Example: Primes puts powers of 3 on one axis and powers of 5 on another.',
  },
  fieldTable: {
    term: 'Field table',
    text: 'One row for every field note, with the subset tick in the first column. Click a row to include it or play it. Example: the 13/8 row reads 840.53 cents, prime limit 13, "Ab +40.5" against 12-EDO.',
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
    text: 'The chord shapes the finder looks for, written as ratios between notes. a:b:c means the notes are harmonics of one fundamental (4:5:6 is a major triad); 1/(a:b:c) means they are undertones. One per line, with an optional # name. Example: the line 4:5:6 # major triad finds every major triad in the subset.',
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
    text: "One row per mode (the scale restarted from each degree), one column per degree of that mode. Each cell is coloured by how close that degree lands to a field note when the mode's root is moved to 1/1: cool means a field note is right there, warm means the field has nothing close. Hover a row to print the cents errors. Example: row 1 is the scale from 9/8; if its 5th degree misses by 21.5 c, that cell is orange.",
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
    text: 'Overtones: how many harmonics each note contributes to the roughness sum (7 is the default). Rolloff: how quickly overtones fade (0.88 means each is 88 % of the one below). Example: 7 overtones at rolloff 0.88 is the default.',
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
  chordFamily: {
    term: 'Chord families',
    text: 'Chords are grouped by how many notes they have (triads, tetrads, larger), then by family, a label you can edit on each template: Major, Minor, Septimal, Utonal and so on. Templates without a family go in an "Other" row. Example: 4:5:6 and 8:10:12:15 are both Major; 6:7:9 and 4:5:6:7 are Septimal.',
    see: ['templates'],
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
    term: 'Keys and modes',
    text: 'One panel for the two ways of "starting the scale somewhere else". Modes keep the same notes and change the starting degree; keys move the whole scale onto another field note. Example: the mode that starts on 9/8 still uses the same seven notes, but moving the whole scale up to start on 9/8 needs notes this field does not have.',
    see: ['modes', 'keyRings'],
  },
  keyRings: {
    term: 'Key rings',
    text: 'One small circle per possible key (each field note as the new root). Filled dots are scale notes that land on a field note; a cross marks a note the field does not have. A key with no crosses is complete: the whole scale fits there. Example: only the 1/1 ring has no crosses in this field.',
    see: ['keysSummary'],
  },
  inspector: {
    term: 'Note inspector',
    text: 'Shows one row of the field table for the note you point at or click anywhere (circle, strip, keys, lattice): ratio, cents, monzo (prime exponents), nearest 12-EDO key and how far off it is. Example: pointing at 13/8 reads 840.53 c, monzo 2^-3 13, and about 40 c sharp of Ab.',
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
    text: 'Re-roots a list of candidate scales around a held pivot note and picks the card whose predicted chord scores best. Placeholder in this layout mock. Example: hold C-E-G and the card with the purest 4:5:6 wins.',
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
  savedRow: {
    term: 'Saved subset',
    text: 'One saved selection of this pitch collection, drawn as a miniature tuner strip: a dot for every field note, bright when it is in the subset and dim when it is out, with small pink (sharp) and cyan (flat) bars for the distance from 12-EDO. Pointing at a row previews it on the ring; clicking loads it. Example: "Septimal tetrad 4:5:6:7" lights 1/1, 5/4, 3/2 and 7/4 and dims the rest.',
    see: ['savedSubsets'],
  },
} satisfies Record<string, TextEntry>;

export type TipKey = keyof typeof entries;
export const TIPS: Record<TipKey, TextEntry> = entries;
export const tipKeys = Object.keys(entries) as TipKey[];

/** Entries sorted by term, for the glossary. */
export const GLOSSARY: { key: TipKey; entry: TextEntry }[] = tipKeys
  .map((key) => ({ key, entry: TIPS[key] }))
  .sort((a, b) => a.entry.term.localeCompare(b.entry.term));
