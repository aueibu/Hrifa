/**
 * Field presets (data only). Fields: group, name, info, gen, rep, and the generator's own settings:
 *   harmonic/subharmonic: h | edo: n | additive: axes [{g,n,ctr}], shape 'box'|'diamond', dist, bidir
 *   cps: factors, k | custom: text | optional primes: [enabled primes] (default all)
 */

export interface PresetAxis {
  g: string;
  n: number;
  ctr: number;
}

export interface Preset {
  group: string;
  name: string;
  info: string;
  gen: 'harmonic' | 'subharmonic' | 'edo' | 'additive' | 'cps' | 'custom';
  /** The repeat as interval text, e.g. '2/1'. */
  rep: string;
  h?: number;
  n?: number;
  axes?: PresetAxis[];
  shape?: 'box' | 'diamond';
  dist?: number;
  bidir?: boolean;
  /** CPS factors, space separated. */
  factors?: string;
  k?: number;
  /** Custom interval text. */
  text?: string;
  /** Enabled primes (default all). */
  primes?: number[];
}

export const PRESETS: Preset[] = [
  // ---------- harmonic / subharmonic ----------
  {
    group: 'Harmonic series',
    name: 'Harmonics 8–15',
    gen: 'harmonic',
    rep: '2/1',
    h: 8,
    info: 'One octave of the overtone series. The 7th, 11th and 13th harmonics land far from 12-EDO.',
  },
  {
    group: 'Harmonic series',
    name: 'Otonal tetrad 4:5:6:7',
    gen: 'harmonic',
    rep: '2/1',
    h: 4,
    info: 'The "harmonic seventh" chord. Play chord to hear how smooth it is.',
  },
  {
    group: 'Harmonic series',
    name: 'Harmonics 16–31',
    gen: 'harmonic',
    rep: '2/1',
    h: 16,
    info: 'Sixteen notes with ever-smaller steps. Try Pick nearest 12 or Max odd limit 15.',
  },
  {
    group: 'Harmonic series',
    name: '7-limit harmonics 24–47',
    gen: 'harmonic',
    rep: '2/1',
    h: 24,
    primes: [2, 3, 5, 7],
    info: 'The prime filter keeps only harmonics built from 2, 3, 5 and 7.',
  },
  {
    group: 'Harmonic series',
    name: 'Harmonics 9–26 in a tritave',
    gen: 'harmonic',
    rep: '3/1',
    h: 9,
    info: 'Repeats at 3/1 instead of the octave, the frame Bohlen–Pierce uses.',
  },
  {
    group: 'Harmonic series',
    name: 'Subharmonics 8–16 (utonality)',
    gen: 'subharmonic',
    rep: '2/1',
    h: 8,
    info: 'The mirror image of Harmonics 8–15. Partch called this utonality: a minor-ish world.',
  },
  {
    group: 'Harmonic series',
    name: 'Subharmonics 12–24',
    gen: 'subharmonic',
    rep: '2/1',
    h: 12,
    info: 'A wider utonal field to carve subsets from.',
  },

  // ---------- equal divisions ----------
  {
    group: 'Equal divisions',
    name: '12-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 12,
    info: 'The standard. A reference point for everything else.',
  },
  {
    group: 'Equal divisions',
    name: '5-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 5,
    info: 'Close to some Javanese slendro tunings (real gamelans vary).',
  },
  {
    group: 'Equal divisions',
    name: '7-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 7,
    info: 'Close to traditional Thai tuning: seven nearly equal steps.',
  },
  {
    group: 'Equal divisions',
    name: '19-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 19,
    info: 'Close to 1/3-comma meantone (Salinas, 16th c.). Try Pick nearest 12 for a new chromatic.',
  },
  {
    group: 'Equal divisions',
    name: '22-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 22,
    info: 'Good 7-limit harmony that is not meantone (Paul Erlich). Same count as the Indian 22 śruti.',
  },
  {
    group: 'Equal divisions',
    name: '24-EDO (quarter tones)',
    gen: 'edo',
    rep: '2/1',
    n: 24,
    info: 'Used in 20th-century Arabic maqam theory and by Ives, Wyschnegradsky.',
  },
  {
    group: 'Equal divisions',
    name: '31-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 31,
    info: "Huygens (17th c.) and Fokker's organ. Nearly 1/4-comma meantone, with a good 7/4.",
  },
  {
    group: 'Equal divisions',
    name: '41-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 41,
    info: 'Very accurate fifths and 5-limit thirds; used by the Kite guitar.',
  },
  {
    group: 'Equal divisions',
    name: '53-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 53,
    info: 'Mercator and Holder (17th c.). Nearly Pythagorean and 5-limit just at once; Turkish makam theory counts in 53rds.',
  },
  {
    group: 'Equal divisions',
    name: '72-EDO',
    gen: 'edo',
    rep: '2/1',
    n: 72,
    info: 'Twelfth tones; used in Byzantine chant theory and the Boston microtonal school.',
  },
  {
    group: 'Equal divisions',
    name: 'Bohlen–Pierce (13 ED 3/1)',
    gen: 'edo',
    rep: '3/1',
    n: 13,
    info: 'No octave at all: 13 equal steps of the tritave, built for odd harmonics 3:5:7.',
  },
  {
    group: 'Equal divisions',
    name: 'Carlos Alpha (9 ED 3/2)',
    gen: 'edo',
    rep: '3/2',
    n: 9,
    info: 'Wendy Carlos, 1986: ~78c steps, good 3/2, 5/4 and 6/5, no octave.',
  },
  {
    group: 'Equal divisions',
    name: 'Carlos Beta (11 ED 3/2)',
    gen: 'edo',
    rep: '3/2',
    n: 11,
    info: '~63.8c steps.',
  },
  {
    group: 'Equal divisions',
    name: 'Carlos Gamma (20 ED 3/2)',
    gen: 'edo',
    rep: '3/2',
    n: 20,
    info: '~35.1c steps, very accurate 5-limit.',
  },

  // ---------- additive / lattice ----------
  {
    group: 'Additive / lattice',
    name: 'Pythagorean pentatonic',
    gen: 'additive',
    rep: '2/1',
    axes: [{ g: '3/2', n: 5, ctr: 0 }],
    info: 'Four stacked fifths: C G D A E. The oldest scale family on the planet.',
  },
  {
    group: 'Additive / lattice',
    name: 'Pythagorean diatonic',
    gen: 'additive',
    rep: '2/1',
    axes: [{ g: '3/2', n: 7, ctr: 1 }],
    info: 'F C G D A E B: the 5L 2s MOS. Step through the modes with ‹ ›.',
  },
  {
    group: 'Additive / lattice',
    name: 'Pythagorean chromatic',
    gen: 'additive',
    rep: '2/1',
    axes: [{ g: '3/2', n: 12, ctr: 3 }],
    info: 'Eb … G#. The leftover gap is the "wolf" fifth.',
  },
  {
    group: 'Additive / lattice',
    name: '1/4-comma meantone',
    gen: 'additive',
    rep: '2/1',
    axes: [{ g: '696.578c', n: 12, ctr: 3 }],
    info: 'Renaissance/Baroque keyboards: fifths narrowed so major thirds are a pure 5/4.',
  },
  {
    group: 'Additive / lattice',
    name: '1/3-comma meantone, 19 notes',
    gen: 'additive',
    rep: '2/1',
    axes: [{ g: '694.786c', n: 19, ctr: 9 }],
    info: 'Salinas (1577). Pure minor thirds; nearly 19-EDO.',
  },
  {
    group: 'Additive / lattice',
    name: 'Golden generator',
    gen: 'additive',
    rep: '2/1',
    axes: [{ g: '741.641c', n: 13, ctr: 0 }],
    info: 'Generator = octave ÷ φ. Never closes, and its MOS sizes are the Fibonacci numbers.',
  },
  {
    group: 'Additive / lattice',
    name: "Ellis's Duodene",
    gen: 'additive',
    rep: '2/1',
    axes: [
      { g: '3/2', n: 4, ctr: 1 },
      { g: '5/4', n: 3, ctr: 1 },
    ],
    info: 'A 4×3 block of fifths and thirds (A. J. Ellis, 1874): the classic 12-note just intonation.',
  },
  {
    group: 'Additive / lattice',
    name: '7-limit 3×3×3 box',
    gen: 'additive',
    rep: '2/1',
    axes: [
      { g: '3/2', n: 3, ctr: 1 },
      { g: '5/4', n: 3, ctr: 1 },
      { g: '7/4', n: 3, ctr: 1 },
    ],
    info: '27 notes, one step either way on the 3, 5 and 7 axes and all their combinations.',
  },
  {
    group: 'Additive / lattice',
    name: '5-limit diamond, distance 2',
    gen: 'additive',
    rep: '2/1',
    shape: 'diamond',
    dist: 2,
    bidir: true,
    axes: [
      { g: '3/2', n: 3, ctr: 1 },
      { g: '5/4', n: 3, ctr: 1 },
    ],
    info: 'Everything within two steps of 1/1 on the fifth/third lattice.',
  },
  {
    group: 'Additive / lattice',
    name: '7-limit diamond, distance 1',
    gen: 'additive',
    rep: '2/1',
    shape: 'diamond',
    dist: 1,
    bidir: true,
    axes: [
      { g: '3/2', n: 3, ctr: 1 },
      { g: '5/4', n: 3, ctr: 1 },
      { g: '7/4', n: 3, ctr: 1 },
    ],
    info: '1/1 plus one step up or down each axis: 3/2 4/3 5/4 8/5 7/4 8/7.',
  },
  {
    group: 'Additive / lattice',
    name: '7-limit diamond, distance 2',
    gen: 'additive',
    rep: '2/1',
    shape: 'diamond',
    dist: 2,
    bidir: true,
    axes: [
      { g: '3/2', n: 3, ctr: 1 },
      { g: '5/4', n: 3, ctr: 1 },
      { g: '7/4', n: 3, ctr: 1 },
    ],
    info: '25 notes. Look for the triangles in the lattice: those are triads.',
  },

  // ---------- combination product sets ----------
  {
    group: 'Combination product sets',
    name: '1)4 harmonic tetrad (1 3 5 7, choose 1)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7',
    k: 1,
    info: 'The smallest CPS: the factors themselves. 1:3:5:7 is one otonal chord used as a scale — the seed the hexany grows from.',
  },
  {
    group: 'Combination product sets',
    name: '3)4 subharmonic tetrad (1 3 5 7, choose 3)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7',
    k: 3,
    info: 'The mirror of 1)4: products of three factors form one utonal chord. Compare its lattice with 1)4.',
  },
  {
    group: 'Combination product sets',
    name: 'Hexany (1 3 5 7, choose 2)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7',
    k: 2,
    info: "Erv Wilson's hexany: 6 notes, an octahedron of 8 triads with no tonic. Sits exactly between 1)4 and 3)4.",
  },
  {
    group: 'Combination product sets',
    name: 'Hexany on 1 3 5 9',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 9',
    k: 2,
    info: 'Swap 7 for 9 (= 3·3): every note is 5-limit, so the hexany becomes a set of classical just triads.',
  },
  {
    group: 'Combination product sets',
    name: 'Hexany on 3 5 7 11 (no 1)',
    gen: 'cps',
    rep: '2/1',
    factors: '3 5 7 11',
    k: 2,
    info: 'Leaving out 1 changes every interval: an 11-limit hexany with no pure 3/2 in it. Same shape, new colour.',
  },
  {
    group: 'Combination product sets',
    name: 'Hexany on 1 3 7 9',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 7 9',
    k: 2,
    info: 'A septimal hexany without 5: 3, 7 and 9 only, so thirds are the 7-limit kind (7/6, 9/7).',
  },
  {
    group: 'Combination product sets',
    name: 'Dekany (1 3 5 7 9, choose 2)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 9',
    k: 2,
    info: '10 notes. Each harmonic chord has 4 notes.',
  },
  {
    group: 'Combination product sets',
    name: 'Dekany 3)5 (1 3 5 7 9, choose 3)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 9',
    k: 3,
    info: 'The mirror dekany: same 10-note size, but now the subharmonic chords have 4 notes and the harmonic ones 3.',
  },
  {
    group: 'Combination product sets',
    name: 'Dekany on 1 3 5 7 11',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 11',
    k: 2,
    info: 'Five distinct primes, so no shortcuts via 9: a clean 11-limit dekany.',
  },
  {
    group: 'Combination product sets',
    name: 'Pentadekany (1 3 5 7 9 11, choose 2)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 9 11',
    k: 2,
    info: '15 notes, 11-limit.',
  },
  {
    group: 'Combination product sets',
    name: 'Pentadekany 4)6 (1 3 5 7 9 11, choose 4)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 9 11',
    k: 4,
    info: 'The mirror of 2)6: still 15 notes, with harmonic and subharmonic chord sizes swapped.',
  },
  {
    group: 'Combination product sets',
    name: 'Eikosany (1 3 5 7 9 11, choose 3)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 9 11',
    k: 3,
    info: "Wilson's most famous CPS: 20 notes, 30 tetrads, perfectly balanced between harmonic and subharmonic.",
  },
  {
    group: 'Combination product sets',
    name: 'Eikosany on 1 3 5 7 11 13',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 11 13',
    k: 3,
    info: 'The eikosany with 13 instead of 9: 1 plus five primes, 13-limit, a stranger and more exotic colour.',
  },
  {
    group: 'Combination product sets',
    name: '3)7 CPS, 35 notes (1 3 5 7 9 11 13)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 9 11 13',
    k: 3,
    info: 'Seven factors choose 3: 35 notes. Harmonic chords have 5 notes, subharmonic chords 4.',
  },
  {
    group: 'Combination product sets',
    name: '4)7 CPS, 35 notes (mirror)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 9 11 13',
    k: 4,
    info: 'The mirror of 3)7: 35 notes, with 4-note harmonic and 5-note subharmonic chords.',
  },
  {
    group: 'Combination product sets',
    name: 'Hebdomekontany (1 3 5 7 11 13 17 19, choose 4)',
    gen: 'cps',
    rep: '2/1',
    factors: '1 3 5 7 11 13 17 19',
    k: 4,
    info: '70 notes (8 choose 4). Factors are 1 and primes so no two products coincide. A huge, even field to carve subsets from.',
  },

  // ---------- custom / historic ----------
  {
    group: 'Historic & custom',
    name: "Ptolemy's intense diatonic",
    gen: 'custom',
    rep: '2/1',
    text: '9/8 5/4 4/3 3/2 5/3 15/8',
    info: '2nd century CE: the 5-limit just major scale.',
  },
  {
    group: 'Historic & custom',
    name: 'Werckmeister III (1691)',
    gen: 'custom',
    rep: '2/1',
    text: '90.225 192.180 294.135 390.225 498.045 588.270 696.090 792.180 888.270 996.090 1092.180',
    info: 'A well temperament: every key playable, each with its own colour. Bach-era organs.',
  },
  {
    group: 'Historic & custom',
    name: 'Indian 22 śruti (one JI reading)',
    gen: 'custom',
    rep: '2/1',
    text: '256/243 16/15 10/9 9/8 32/27 6/5 5/4 81/64 4/3 27/20 45/32 729/512 3/2 128/81 8/5 5/3 27/16 16/9 9/5 15/8 243/128',
    info: 'A common modern just-intonation interpretation; the historical theory is debated.',
  },
  {
    group: 'Historic & custom',
    name: 'Partch 43-tone',
    gen: 'custom',
    rep: '2/1',
    text: '81/80 33/32 21/20 16/15 12/11 11/10 10/9 9/8 8/7 7/6 32/27 6/5 11/9 5/4 14/11 9/7 21/16 4/3 27/20 11/8 7/5 10/7 16/11 40/27 3/2 32/21 14/9 11/7 8/5 18/11 5/3 27/16 12/7 7/4 16/9 9/5 20/11 11/6 15/8 40/21 64/33 160/81',
    info: "Harry Partch's 11-limit scale (Genesis of a Music, 1949). Symmetric around the octave.",
  },
  {
    group: 'Historic & custom',
    name: 'Bohlen–Pierce just chromatic',
    gen: 'custom',
    rep: '3/1',
    text: '27/25 25/21 9/7 7/5 75/49 5/3 9/5 49/25 15/7 7/3 63/25 25/9',
    info: 'The just version of Bohlen–Pierce: 13 notes per 3/1 from odd numbers only.',
  },
];
