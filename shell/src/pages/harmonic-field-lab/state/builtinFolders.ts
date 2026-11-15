/**
 * How the built-in presets are filed in the preset browser (M7b step 2). The lib's `PRESETS` stay the vector contract and
 * are not edited: this is a presentation table keyed by preset name. A built-in sits at `Built-in > <group> [> <subfolder>]`;
 * a preset that is not listed here sits at the top of its group. Pure data and two lookups, no React.
 */
import { PRESETS } from '../../../lib/harmonic-field';

/** group -> subfolder -> preset names (exact names from `presets.ts`, in browser order). */
export const BUILTIN_SUBFOLDERS: Record<string, Record<string, readonly string[]>> = {
  'Equal divisions': {
    'Small (5 to 12)': ['5-EDO', '7-EDO', '12-EDO'],
    'Medium (19 to 31)': ['19-EDO', '22-EDO', '24-EDO (quarter tones)', '31-EDO'],
    'Large (41 to 72)': ['41-EDO', '53-EDO', '72-EDO'],
    'Non-octave': [
      'Bohlen–Pierce (13 ED 3/1)',
      'Carlos Alpha (9 ED 3/2)',
      'Carlos Beta (11 ED 3/2)',
      'Carlos Gamma (20 ED 3/2)',
    ],
  },
  'Additive / lattice': {
    Pythagorean: ['Pythagorean pentatonic', 'Pythagorean diatonic', 'Pythagorean chromatic'],
    Meantone: ['1/4-comma meantone', '1/3-comma meantone, 19 notes'],
    'Just lattices': [
      "Ellis's Duodene",
      '7-limit 3×3×3 box',
      '5-limit diamond, distance 2',
      '7-limit diamond, distance 1',
      '7-limit diamond, distance 2',
    ],
  },
  'Combination product sets': {
    Tetrads: [
      '1)4 harmonic tetrad (1 3 5 7, choose 1)',
      '3)4 subharmonic tetrad (1 3 5 7, choose 3)',
    ],
    Hexany: [
      'Hexany (1 3 5 7, choose 2)',
      'Hexany on 1 3 5 9',
      'Hexany on 3 5 7 11 (no 1)',
      'Hexany on 1 3 7 9',
    ],
    Dekany: [
      'Dekany (1 3 5 7 9, choose 2)',
      'Dekany 3)5 (1 3 5 7 9, choose 3)',
      'Dekany on 1 3 5 7 11',
    ],
    Pentadekany: [
      'Pentadekany (1 3 5 7 9 11, choose 2)',
      'Pentadekany 4)6 (1 3 5 7 9 11, choose 4)',
    ],
    Eikosany: ['Eikosany (1 3 5 7 9 11, choose 3)', 'Eikosany on 1 3 5 7 11 13'],
    'Larger sets': [
      '3)7 CPS, 35 notes (1 3 5 7 9 11 13)',
      '4)7 CPS, 35 notes (mirror)',
      'Hebdomekontany (1 3 5 7 11 13 17 19, choose 4)',
    ],
  },
  'Historic & custom': {
    European: ["Ptolemy's intense diatonic", 'Werckmeister III (1691)'],
  },
};

const subfolderOf = new Map<string, string>();
for (const subs of Object.values(BUILTIN_SUBFOLDERS)) {
  for (const [sub, names] of Object.entries(subs)) {
    for (const n of names) {
      subfolderOf.set(n, sub);
    }
  }
}

/** `[group]` or `[group, subfolder]`: the folders above a built-in preset (no `Built-in` root, no name). */
export function builtinFolders(name: string): string[] {
  const p = PRESETS.find((x) => x.name === name);
  if (!p) {
    return [];
  }
  const sub = subfolderOf.get(name);
  return sub ? [p.group, sub] : [p.group];
}
