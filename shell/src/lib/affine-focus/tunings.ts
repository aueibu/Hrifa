import type { Fraction, GamutPitch, TuningGamut } from './types';

const EPS = 1e-6;

export function mod(n: number, m: number): number {
  if (m <= 0 || !Number.isFinite(m)) {
    return n;
  }
  return ((n % m) + m) % m;
}

/** Signed shortest modular residue in [-m/2, m/2). */
export function signedMod(n: number, m: number): number {
  if (m <= 0 || !Number.isFinite(m)) {
    return n;
  }
  const r = mod(n, m);
  return r >= m / 2 - EPS ? r - m : r;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

export function makeFraction(num: number, den = 1): Fraction | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return null;
  }
  const sign = den < 0 ? -1 : 1;
  const n = Math.round(num * sign);
  const d = Math.round(Math.abs(den));
  if (d === 0) {
    return null;
  }
  const g = gcd(n, d);
  const rn = n / g;
  const rd = d / g;
  if (!Number.isSafeInteger(rn) || !Number.isSafeInteger(rd)) {
    return null;
  }
  return { num: rn, den: rd };
}

export function numberToFraction(x: number, maxDen = 1024): Fraction | null {
  if (!Number.isFinite(x)) {
    return null;
  }
  if (Number.isInteger(x)) {
    return makeFraction(x, 1);
  }
  for (let d = 1; d <= maxDen; d += 1) {
    const n = Math.round(x * d);
    if (Math.abs(x - n / d) < 1e-9) {
      return makeFraction(n, d);
    }
  }
  return null;
}

export function addFrac(a: Fraction, b: Fraction): Fraction | null {
  return makeFraction(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function subFrac(a: Fraction, b: Fraction): Fraction | null {
  return makeFraction(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mulFrac(a: Fraction, b: Fraction): Fraction | null {
  return makeFraction(a.num * b.num, a.den * b.den);
}

export function divFrac(a: Fraction, b: Fraction): Fraction | null {
  if (b.num === 0) {
    return null;
  }
  return makeFraction(a.num * b.den, a.den * b.num);
}

export function invFrac(a: Fraction): Fraction | null {
  if (a.num === 0) {
    return null;
  }
  return makeFraction(a.den, a.num);
}

export function powFrac(a: Fraction, exp: number): Fraction | null {
  if (!Number.isInteger(exp)) {
    return null;
  }
  if (exp === 0) {
    return { num: 1, den: 1 };
  }
  if (exp < 0) {
    const inv = invFrac(a);
    return inv ? powFrac(inv, -exp) : null;
  }
  let acc: Fraction = { num: 1, den: 1 };
  for (let i = 0; i < exp; i += 1) {
    const next = mulFrac(acc, a);
    if (!next) {
      return null;
    }
    acc = next;
  }
  return acc;
}

export function fractionValue(f: Fraction): number {
  return f.num / f.den;
}

export function fractionToCents(f: Fraction): number {
  const v = fractionValue(f);
  if (v <= 0) {
    return 0;
  }
  return 1200 * Math.log2(v);
}

export function formatFraction(f: Fraction): string {
  return `${f.num}/${f.den}`;
}

export function sameFraction(a: Fraction | null, b: Fraction | null): boolean {
  if (!a || !b) {
    return false;
  }
  return a.num === b.num && a.den === b.den;
}

/**
 * Folds a positive rational ratio into [1, R) by multiplying or dividing by repeatRatio R.
 */
export function foldFraction(f: Fraction, repeatRatio: Fraction | null): Fraction | null {
  if (f.num <= 0 || f.den <= 0 || !repeatRatio) {
    return null;
  }
  const rVal = fractionValue(repeatRatio);
  if (rVal <= 1 + EPS) {
    return f;
  }
  let cur: Fraction | null = f;
  let safety = 0;
  while (cur && fractionValue(cur) < 1 - 1e-12 && safety < 64) {
    cur = mulFrac(cur, repeatRatio);
    safety += 1;
  }
  while (cur && fractionValue(cur) >= rVal - 1e-12 && safety < 128) {
    cur = divFrac(cur, repeatRatio);
    safety += 1;
  }
  return cur;
}

export function formatCents(c: number, decimals = 1): string {
  const rounded = Number(c.toFixed(decimals));
  const clean = Object.is(rounded, -0) ? 0 : rounded;
  return `${clean.toFixed(decimals)} c`;
}

export function makeRatioPitch(
  unfoldedRatio: Fraction,
  repeatCents = 1200,
  repeatRatio: Fraction | null = { num: 2, den: 1 },
  index = -1,
  folded = true
): GamutPitch {
  const unfoldedCents = fractionToCents(unfoldedRatio);
  const foldedRatio = foldFraction(unfoldedRatio, repeatRatio) ?? unfoldedRatio;
  const foldedCents = foldedRatio
    ? mod(fractionToCents(foldedRatio), repeatCents)
    : mod(unfoldedCents, repeatCents);
  const unfoldedLabel = formatFraction(unfoldedRatio);
  const foldedLabel = formatFraction(foldedRatio);
  return {
    index,
    cents: folded ? foldedCents : unfoldedCents,
    foldedCents,
    unfoldedCents,
    ratio: folded ? foldedRatio : unfoldedRatio,
    unfoldedRatio,
    label: folded ? foldedLabel : unfoldedLabel,
    unfoldedLabel,
    snapErrorCents: 0,
    idealLabel: folded ? foldedLabel : unfoldedLabel,
  };
}

export function makeEdoStepPitch(
  step: number,
  edoSteps: number,
  repeatCents = 1200,
  repeatRatio: Fraction | null = { num: 2, den: 1 },
  folded = true
): GamutPitch {
  const foldedStep = mod(step, edoSteps);
  const stepSize = repeatCents / edoSteps;
  const unfoldedCents = step * stepSize;
  const foldedCents = foldedStep * stepSize;
  const isUnison = foldedStep === 0;
  const foldedRatio = isUnison ? { num: 1, den: 1 } : null;
  const wraps = Math.floor(step / edoSteps);
  const unfoldedRatio = isUnison && repeatRatio ? powFrac(repeatRatio, wraps) : null;
  const foldedLabel = String(foldedStep);
  const unfoldedLabel =
    wraps === 0 ? foldedLabel : `${step} (${foldedLabel}${wraps > 0 ? `+${wraps}R` : `${wraps}R`})`;
  return {
    index: foldedStep,
    cents: folded ? foldedCents : unfoldedCents,
    foldedCents,
    unfoldedCents,
    ratio: folded ? foldedRatio : unfoldedRatio,
    unfoldedRatio,
    label: folded ? foldedLabel : String(step),
    unfoldedLabel,
    snapErrorCents: 0,
    idealLabel: folded ? foldedLabel : String(step),
  };
}

export function makeCentsPitch(
  unfoldedCents: number,
  repeatCents = 1200,
  index = -1,
  folded = true
): GamutPitch {
  const foldedCents = mod(unfoldedCents, repeatCents);
  const foldedLabel = formatCents(foldedCents);
  const unfoldedLabel = formatCents(unfoldedCents);
  return {
    index,
    cents: folded ? foldedCents : unfoldedCents,
    foldedCents,
    unfoldedCents,
    ratio: Math.abs(foldedCents) < 1e-6 ? { num: 1, den: 1 } : null,
    unfoldedRatio: Math.abs(unfoldedCents) < 1e-6 ? { num: 1, den: 1 } : null,
    label: folded ? foldedLabel : unfoldedLabel,
    unfoldedLabel,
    snapErrorCents: 0,
    idealLabel: folded ? foldedLabel : unfoldedLabel,
  };
}

export function buildRatioGamut(
  id: string,
  name: string,
  family: TuningGamut['family'],
  description: string,
  ratios: [number, number][],
  repeat: [number, number] = [2, 1]
): TuningGamut {
  const repeatRatio = makeFraction(repeat[0], repeat[1]) ?? { num: 2, den: 1 };
  const repeatCents = fractionToCents(repeatRatio);
  const pitches = ratios.map(([n, d], idx) => {
    const frac = makeFraction(n, d) ?? { num: 1, den: 1 };
    return makeRatioPitch(frac, repeatCents, repeatRatio, idx, true);
  });
  return {
    id,
    name,
    family,
    description,
    repeatCents,
    repeatRatio,
    pitches,
  };
}

export function buildEdoGamut(
  steps: number,
  repeat: [number, number] = [2, 1],
  id = `${steps}-edo`,
  name = `${steps}-EDO`,
  description = `${steps} equal divisions of ${repeat[0]}/${repeat[1]}`
): TuningGamut {
  const repeatRatio = makeFraction(repeat[0], repeat[1]) ?? { num: 2, den: 1 };
  const repeatCents = fractionToCents(repeatRatio);
  const pitches = Array.from({ length: steps }, (_, i) =>
    makeEdoStepPitch(i, steps, repeatCents, repeatRatio, true)
  );
  return {
    id,
    name,
    family: repeat[0] === 2 && repeat[1] === 1 ? 'edo' : 'non-octave',
    description,
    repeatCents,
    repeatRatio,
    pitches,
    edoSteps: steps,
  };
}

export const TUNING_PRESETS: TuningGamut[] = [
  buildEdoGamut(
    12,
    [2, 1],
    '12-edo',
    '12-EDO Chromatic',
    '12 equal divisions of the octave (100 c steps)'
  ),
  buildRatioGamut(
    '7-ji-ptolemy',
    '7-Note JI Diatonic (Ptolemy)',
    'ji',
    "Ptolemy's intense diatonic scale (5-limit Just Intonation)",
    [
      [1, 1],
      [9, 8],
      [5, 4],
      [4, 3],
      [3, 2],
      [5, 3],
      [15, 8],
    ]
  ),
  buildRatioGamut(
    '12-ji',
    '12-Note Just Intonation (JI12)',
    'ji',
    'Standard 5-limit 12-note chromatic Just Intonation gamut',
    [
      [1, 1],
      [16, 15],
      [9, 8],
      [6, 5],
      [5, 4],
      [4, 3],
      [45, 32],
      [3, 2],
      [8, 5],
      [5, 3],
      [9, 5],
      [15, 8],
    ]
  ),
  buildRatioGamut(
    '6-cps-hexany',
    '1·3·5·7 Hexany (CPS)',
    'cps',
    'Erv Wilson 2-out-of-4 combination product set (4 otonal + 4 utonal triads)',
    [
      [1, 1],
      [7, 6],
      [5, 4],
      [7, 5],
      [3, 2],
      [7, 4],
    ]
  ),
  buildRatioGamut(
    '12-duodene',
    'Ellis Duodene (3×4 JI Lattice)',
    'ji',
    'Alexander Ellis 12-note 5-limit lattice block (4 fifths × 3 major thirds)',
    [
      [1, 1],
      [16, 15],
      [9, 8],
      [6, 5],
      [5, 4],
      [4, 3],
      [45, 32],
      [3, 2],
      [8, 5],
      [5, 3],
      [16, 9],
      [15, 8],
    ]
  ),
  buildEdoGamut(
    19,
    [2, 1],
    '19-edo',
    '19-EDO Meantone',
    '19 equal divisions of the octave (63.16 c steps)'
  ),
  buildEdoGamut(
    31,
    [2, 1],
    '31-edo',
    '31-EDO Quarter-Comma',
    '31 equal divisions of the octave (38.71 c steps)'
  ),
  buildEdoGamut(
    7,
    [2, 1],
    '7-edo',
    '7-EDO Equiheptatonic',
    '7 equal divisions of the octave (171.43 c steps)'
  ),
  buildEdoGamut(
    5,
    [2, 1],
    '5-edo',
    '5-EDO Equipentatonic',
    '5 equal divisions of the octave (240.0 c steps)'
  ),
  buildEdoGamut(
    13,
    [3, 1],
    '13-ed3-bp',
    'Bohlen–Pierce 13-ED3',
    '13 equal divisions of the 3/1 tritave (146.30 c steps)'
  ),
  buildRatioGamut(
    '9-ji-bp',
    'Bohlen–Pierce 9-Note JI Lambda',
    'non-octave',
    'Odd-harmonic 3·5·7 Just Intonation Bohlen–Pierce Lambda scale in 3/1 repeat',
    [
      [1, 1],
      [25, 21],
      [9, 7],
      [7, 5],
      [5, 3],
      [9, 5],
      [15, 7],
      [7, 3],
      [25, 9],
    ],
    [3, 1]
  ),
];

export function getPresetGamut(id: string): TuningGamut {
  return TUNING_PRESETS.find((g) => g.id === id) ?? TUNING_PRESETS[0];
}

const NOTE_NAME_MAP: Record<string, number> = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  F: 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11,
};

/**
 * Parses a single interval token ('5/4', '386.3c', '4\12', '700.0') into a GamutPitch.
 */
export function parseIntervalToken(
  token: string,
  repeatCents = 1200,
  repeatRatio: Fraction | null = { num: 2, den: 1 },
  index = -1
): GamutPitch | null {
  const clean = token.trim();
  if (!clean) {
    return null;
  }
  const slashMatch = clean.match(/^(\d+)\s*[/:]\s*(\d+)$/);
  if (slashMatch) {
    const num = Number(slashMatch[1]);
    const den = Number(slashMatch[2]);
    const frac = makeFraction(num, den);
    if (!frac || frac.num <= 0 || frac.den <= 0) {
      return null;
    }
    return makeRatioPitch(frac, repeatCents, repeatRatio, index, true);
  }
  const edoMatch = clean.match(/^(-?\d+)\s*\\\s*(\d+)$/);
  if (edoMatch) {
    const step = Number(edoMatch[1]);
    const edo = Number(edoMatch[2]);
    if (edo >= 1) {
      return makeEdoStepPitch(step, edo, repeatCents, repeatRatio, true);
    }
  }
  const centsMatch = clean.match(/^(-?\d+(?:\.\d+)?)\s*c?$/i);
  if (centsMatch) {
    const c = Number(centsMatch[1]);
    if (Number.isFinite(c)) {
      if (Math.abs(c) < EPS) {
        return makeRatioPitch({ num: 1, den: 1 }, repeatCents, repeatRatio, index, true);
      }
      return makeCentsPitch(c, repeatCents, index, true);
    }
  }
  return null;
}

/**
 * Builds a custom TuningGamut from user-entered intervals and a repeat specification ('2/1', '3/1', '1200c').
 */
export function parseCustomGamut(
  intervalsText: string,
  repeatText = '2/1',
  name = 'Custom Gamut'
): { gamut: TuningGamut; error?: string } {
  let repeatRatio: Fraction | null = { num: 2, den: 1 };
  let repeatCents = 1200;

  const repClean = repeatText.trim();
  const repSlash = repClean.match(/^(\d+)\s*[/:]\s*(\d+)$/);
  if (repSlash) {
    const f = makeFraction(Number(repSlash[1]), Number(repSlash[2]));
    if (f && fractionValue(f) > 1.01) {
      repeatRatio = f;
      repeatCents = fractionToCents(f);
    }
  } else {
    const repNum = Number(repClean.replace(/c$/i, ''));
    if (Number.isFinite(repNum) && repNum > 10) {
      repeatCents = repNum;
      repeatRatio = null;
    }
  }

  const tokens = intervalsText
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const parsed: GamutPitch[] = [];
  for (const tok of tokens) {
    const p = parseIntervalToken(tok, repeatCents, repeatRatio, -1);
    if (p) {
      parsed.push(p);
    }
  }

  // Always ensure 1/1 (0 c) is present and deduplicate within 0.05 c
  const unison = makeRatioPitch({ num: 1, den: 1 }, repeatCents, repeatRatio, 0, true);
  const all = [unison, ...parsed].sort((a, b) => a.foldedCents - b.foldedCents);
  const unique: GamutPitch[] = [];
  for (const p of all) {
    if (p.foldedCents >= repeatCents - 0.05 && unique.length > 0) {
      continue;
    }
    const last = unique[unique.length - 1];
    if (!last || Math.abs(p.foldedCents - last.foldedCents) > 0.05) {
      unique.push({ ...p, index: unique.length });
    } else if (!last.ratio && p.ratio) {
      unique[unique.length - 1] = { ...p, index: unique.length - 1 };
    }
  }

  if (unique.length < 2) {
    return {
      gamut: TUNING_PRESETS[0],
      error: 'Custom gamut needs at least 2 distinct pitches inside the repeat.',
    };
  }

  return {
    gamut: {
      id: 'custom',
      name,
      family: 'custom',
      description: `${unique.length} custom pitches in ${repeatRatio ? formatFraction(repeatRatio) : formatCents(repeatCents)}`,
      repeatCents,
      repeatRatio,
      pitches: unique,
    },
  };
}

/**
 * Finds the nearest pitch in `gamut` measured circularly mod `gamut.repeatCents`.
 */
export function snapPitchToGamut(
  unfoldedCents: number,
  gamut: TuningGamut,
  folding: 'folded' | 'unfolded' = 'folded',
  idealLabel?: string
): GamutPitch {
  const R = gamut.repeatCents;
  const targetFolded = mod(unfoldedCents, R);
  const wraps = Math.floor((unfoldedCents + EPS) / R);

  let best = gamut.pitches[0];
  let bestSignedErr = signedMod(best.foldedCents - targetFolded, R);

  for (let i = 1; i < gamut.pitches.length; i += 1) {
    const candidate = gamut.pitches[i];
    const err = signedMod(candidate.foldedCents - targetFolded, R);
    if (Math.abs(err) < Math.abs(bestSignedErr) - 1e-9) {
      best = candidate;
      bestSignedErr = err;
    }
  }

  const snappedUnfoldedCents = best.foldedCents + wraps * R;
  let snappedUnfoldedRatio: Fraction | null = null;
  if (best.ratio && gamut.repeatRatio) {
    const repPow = powFrac(gamut.repeatRatio, wraps);
    if (repPow) {
      snappedUnfoldedRatio = mulFrac(best.ratio, repPow);
    }
  }

  const isFolded = folding === 'folded';
  const unfoldedLabel = snappedUnfoldedRatio
    ? formatFraction(snappedUnfoldedRatio)
    : wraps === 0
      ? best.label
      : formatCents(snappedUnfoldedCents);

  return {
    index: best.index,
    cents: isFolded ? best.foldedCents : snappedUnfoldedCents,
    foldedCents: best.foldedCents,
    unfoldedCents: snappedUnfoldedCents,
    ratio: isFolded ? best.ratio : snappedUnfoldedRatio,
    unfoldedRatio: snappedUnfoldedRatio,
    label: isFolded ? best.label : unfoldedLabel,
    unfoldedLabel,
    snapErrorCents: Math.abs(bestSignedErr) < 1e-6 ? 0 : bestSignedErr,
    idealLabel: idealLabel ?? best.label,
  };
}

/**
 * Parses a seed input string into a list of GamutPitch items against the active gamut.
 * Accepts:
 *  - ratios ('1/1, 5/4, 3/2' or '1/1 5/4 3/2')
 *  - step indices ('0, 2, 4' or '0 4 7')
 *  - 12-EDO note names ('C E G')
 *  - cents ('0c 386.3c 702c')
 */
export function parseSeedInput(
  seedText: string,
  gamut: TuningGamut,
  deduplicate = false
): { pitches: GamutPitch[]; notices: string[]; error?: string } {
  const rawTokens = seedText
    .replace(/[[\]{}()]/g, ' ')
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (rawTokens.length === 0) {
    return { pitches: [], notices: [], error: 'Seed set is empty.' };
  }

  const notices: string[] = [];
  const pitches: GamutPitch[] = [];
  const N = gamut.pitches.length;

  for (const tok of rawTokens) {
    const upper = tok.toUpperCase();
    if (N === 12 && upper in NOTE_NAME_MAP) {
      const idx = NOTE_NAME_MAP[upper];
      pitches.push(gamut.pitches[idx]);
      continue;
    }

    const slashMatch = tok.match(/^(\d+)\s*[/:]\s*(\d+)$/);
    if (slashMatch) {
      const frac = makeFraction(Number(slashMatch[1]), Number(slashMatch[2]));
      if (!frac || frac.num <= 0 || frac.den <= 0) {
        return { pitches: [], notices, error: `Invalid ratio token "${tok}".` };
      }
      const exactMatch = gamut.pitches.find((gp) => sameFraction(gp.ratio, frac));
      if (exactMatch) {
        pitches.push(exactMatch);
      } else {
        const rp = makeRatioPitch(frac, gamut.repeatCents, gamut.repeatRatio, -1, true);
        const nearMatch = gamut.pitches.find(
          (gp) => Math.abs(gp.foldedCents - rp.foldedCents) < 0.05
        );
        pitches.push(nearMatch ?? rp);
      }
      continue;
    }

    if (tok.toLowerCase().endsWith('c') || tok.includes('.')) {
      const val = Number(tok.replace(/c$/i, ''));
      if (!Number.isFinite(val)) {
        return { pitches: [], notices, error: `Invalid cents token "${tok}".` };
      }
      const foldedVal = mod(val, gamut.repeatCents);
      const nearMatch = gamut.pitches.find((gp) => Math.abs(gp.foldedCents - foldedVal) < 0.05);
      pitches.push(nearMatch ?? makeCentsPitch(val, gamut.repeatCents, -1, true));
      continue;
    }

    const intVal = Number(tok);
    if (Number.isInteger(intVal)) {
      const norm = mod(intVal, N);
      if (intVal < 0 || intVal >= N) {
        notices.push(`${intVal} → ${norm} mod ${N}`);
      }
      pitches.push(gamut.pitches[norm]);
      continue;
    }

    return { pitches: [], notices, error: `Unrecognized pitch token "${tok}".` };
  }

  if (deduplicate) {
    const seen = new Set<string>();
    const unique: GamutPitch[] = [];
    for (const p of pitches) {
      const k = pitchIdentityKey(p);
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(p);
      }
    }
    unique.sort((a, b) => a.foldedCents - b.foldedCents);
    return { pitches: unique, notices };
  }

  return { pitches, notices };
}

export function pitchIdentityKey(p: GamutPitch, folding: 'folded' | 'unfolded' = 'folded'): string {
  if (folding === 'folded') {
    if (p.index >= 0 && Math.abs(p.snapErrorCents) < 1e-6) {
      return `g:${p.index}`;
    }
    if (p.ratio) {
      return `r:${p.ratio.num}/${p.ratio.den}`;
    }
    return `c:${p.foldedCents.toFixed(2)}`;
  }
  if (p.unfoldedRatio) {
    return `ur:${p.unfoldedRatio.num}/${p.unfoldedRatio.den}`;
  }
  return `uc:${p.unfoldedCents.toFixed(2)}`;
}

export function canonicalPitchListKey(
  pitches: readonly GamutPitch[],
  identity: 'unordered-set' | 'ordered-tuple',
  folding: 'folded' | 'unfolded'
): string {
  if (identity === 'ordered-tuple') {
    return pitches.map((p) => pitchIdentityKey(p, folding)).join('|');
  }
  const sorted = [...pitches].sort((a, b) =>
    folding === 'folded' ? a.foldedCents - b.foldedCents : a.unfoldedCents - b.unfoldedCents
  );
  const seen = new Set<string>();
  const uniqueKeys: string[] = [];
  for (const p of sorted) {
    const k = pitchIdentityKey(p, folding);
    if (!seen.has(k)) {
      seen.add(k);
      uniqueKeys.push(k);
    }
  }
  return uniqueKeys.join(',');
}
