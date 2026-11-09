/** Explanatory copy carried over verbatim from the artifact. */

export const PLAYBACK_HINT =
  "Each mode plays upward from its first note to the octave. Rotation keeps the original pitches, so the modes of C major play as D Dorian, E Phrygian and so on. Set to zero moves every mode onto C, or onto the drone pitch when one is chosen, so you hear C Dorian, C Phrygian and so on. With the drone pitch on follow, the drone moves to each mode's root.";

export const CALCULATION_HINT =
  "Fifths brightness adds each note's position on the line of fifths from the root (P5 +1, M2 +2, M6 +3, M3 +4, M7 +5, P4 −1, ♭7 −2, ♭3 −3, ♭6 −4, ♭2 −5). The tritone can sit at either end of the line of fifths, +6 as a sharp fourth or −6 as a flat fifth. It takes the end that keeps the chain of the other notes shortest (the smaller span from lowest to highest position), and counts 0 when both ends give the same span. Perfect fifth rows use the set-to-zero values: each note x looks for x + 7 (mod 12) in the same mode, and a dash means it is missing. The fifth chain is the longest run of consecutive fifths among the notes, such as F C G D A E B. Hemitonia counts pairs of pitch classes a semitone apart, including B to C, and density divides that by the number of notes. Cohemitonia counts three consecutive semitone-spaced pitch classes, which is two semitones sharing a note. The chaining ratio is cohemitonia divided by hemitonia: 0 means every semitone stands alone, and values near 1 mean the semitones pile into clusters. On the ring, a chained semitone is one that touches another semitone. Modes with identical set-to-zero forms are merged into one row. Spelled notes give each degree its own letter name when that needs at most single sharps or flats. Otherwise a letter repeats, as in C C♯ D for a chromatic cluster. Sets of nine notes or more use your sharps/flats setting. Show fifths draws each perfect fifth as a green arrow from a note to the note seven semitones up, and a red stub where that note is missing. Each row has a small ring of its own: the first note is circled and drawn in a deeper blue, semitones are marked like the main ring, and notes light up as they play. Inversion reflects pitch classes about an axis. Each mode around its root reverses the distance list, so Lydian becomes Locrian. I0 to I11 map each pitch class p to n − p; dashed orange circles on the ring show the inverted set, and the rows show the modes of that inverted set, with the original mode each one mirrors.";

export const CHORD_VOCABULARY_HINT =
  "Shapes are semitones above the chord root, stacked upward from the mode's notes. Colored edges on the chord chips mark the family. The alternate name is an extra label for the same shape. German and French sixth and Tristan appear only in the tooltip, because they depend on context. A chord that matches nothing here shows its intervals instead.";

export const COMPARE_TABLE_HINT =
  "Each row is one set class, written in its most compact form starting on 0 using the chosen prime form convention. Click a column heading to sort, or click a bar in a chart to show only the sets in it. Click up to four rows to compare them with the loaded set in the panel on the left, press play to hear a set, and press Load to replace the loaded set. Fifths range is the highest minus the lowest fifths brightness among the set's distinct modes. P5s counts notes with a perfect fifth above them, Fifth chain is the longest run of consecutive fifths, and Root P5 counts the distinct modes that have a perfect fifth above their first note. The shaded row is your current set.";

export const NEIGHBOURS_HINT =
  'Each circle is a mode (its number), placed by fifths brightness from darkest to brightest. Arcs join modes that differ by the chosen number of notes or fewer when played from the same root, colored by how many notes differ, as the legend and the matrix show. Each open mode row lists its neighbors the same way, with the notes that change written as semitones above the root (11→10 means the 7th drops a semitone).';

export const MODES_HINT =
  'Click a mode to open it. Click a circle in the Modal neighbors chart to jump to its row.';

export const chordFootnote = (n: number, anchor: boolean) =>
  `Expansion Ek stacks every (k + 1)th note of the mode, counting around it: E0 takes adjacent notes, E1 every other note (degrees 1, 3, 5 and 1, 3, 5, 7), E2 every third note, and so on up to E${n - 1}, which lands back on the same note. ${
    anchor
      ? 'Each chord is named from the note it was stacked from, its anchor, so C A F stays a C chord built on C. Where the notes also read as a familiar chord on another root, that reading follows an equals sign, such as = F maj/C. Chords with no standard name show their stacked intervals.'
      : 'A chord keeps the scale note it was stacked from as its root whenever that gives a complete chord, so C E G A reads C maj6. Only when that reading is incomplete is another note tried as root, preferring the fewest extra notes beyond a plain triad or seventh, with the lowest note after a slash, such as A min/C.'
  }`;
