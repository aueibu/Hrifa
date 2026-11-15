/**
 * Positional chords (M9, H-9). Pure: no React, no DOM, no storage.
 *
 * A positional chord type is a STEP PATTERN over the ACTIVE SUBSET: steps are counted in the subset (not the whole field),
 * the subset read from its mode root as `rotateSubset` does. [2,2] = every other note (a tertian triad in a 7-note scale),
 * [2,2,2] a tetrad, [1,1] a cluster, [2,3] and [3,2] mixed. The chord starts on a subset degree and takes the notes the
 * pattern lands on, wrapping around the subset; a member that wraps is stacked ABOVE the root by one repeat (root position,
 * true to the ratios; voicings and inversions come later). Its identity is the pattern, not the ratios, so it exists in any
 * tuning; the ratios are the result and are only named when they fit tightly.
 *
 * Degrees in this API are 0-based (like `Sketch.rootDeg`); labels show them 1-based like the mode numbering.
 */
import { DEFAULT_TEMPLATES, parseTemplate, type ChordTemplate } from './chords';
import { mod, mulNotes } from './intervals';
import { scoreRoughness } from './scorersMore';
import type { Note } from './types';

export const MAX_PATTERN_STEPS = 8;
export const MAX_STEP = 9;
/** A ratio name is given only when every note is within this many cents of the ratio chord. */
export const RATIO_NAME_TOL = 5;
export const POSITIONAL_BASE_HZ = 261.6256;

/** The preset patterns, in the default list order. */
export const PRESET_PATTERNS: readonly string[] = [
  '2-2',
  '2-2-2',
  '2-2-2-2',
  '2-3',
  '3-2',
  '1-1',
  '3-3',
];

/** "2-3-2" -> [2,3,2]. Digits 1 to 9 joined by single dashes, 1 to 8 steps; anything else is null. Whitespace around is ignored. */
export function parsePattern(text: string | null | undefined): number[] | null {
  const t = String(text ?? '').trim();
  if (!/^[1-9](-[1-9])*$/.test(t)) {
    return null;
  }
  const steps = t.split('-').map(Number);
  return steps.length <= MAX_PATTERN_STEPS ? steps : null;
}

/** [2,3,2] -> "2-3-2". */
export function patternName(pattern: readonly number[]): string {
  return pattern.join('-');
}

export interface PositionalChord {
  /** The pattern, e.g. [2, 2]. */
  pattern: number[];
  /** 0-based start degree in the subset read from its mode root. */
  degree: number;
  /** Field indices of the members, root first (a wrapped member repeats its field index; its pitch is a repeat higher). */
  members: number[];
  /** The exact pitches, field-absolute, root first, ascending above the root. */
  pitches: Note[];
}

/**
 * The chord of `pattern` starting at subset degree `degree` (any integer, taken mod the subset size). `subsetIdx` = the
 * active subset's field indices in field order, `mode` = the mode root degree (as `rotateSubset`), `rep` = the repeat.
 * Null for an empty subset or an empty pattern. Exact monzos are kept; cents-only notes stay cents-only.
 */
export function positionalChord(
  field: readonly Note[],
  subsetIdx: readonly number[],
  pattern: readonly number[],
  degree: number,
  mode: number,
  rep: Note
): PositionalChord | null {
  const N = subsetIdx.length;
  if (!N || !pattern.length || !Number.isInteger(degree)) {
    return null;
  }
  const r = mod(mode, N);
  const d = mod(degree, N);
  const at = (u: number) => ({ idx: subsetIdx[(r + u) % N], wraps: Math.floor((r + u) / N) });
  const root = at(d);
  const members: number[] = [];
  const pitches: Note[] = [];
  let u = d;
  for (let j = 0; j <= pattern.length; j++) {
    if (j > 0) {
      u += pattern[j - 1];
    }
    const m = at(u);
    const base = field[m.idx];
    if (!base) {
      return null;
    }
    const k = m.wraps - root.wraps;
    pitches.push(k ? mulNotes(base, rep, k) : { m: base.m ? { ...base.m } : null, c: base.c });
    members.push(m.idx);
  }
  return { pattern: [...pattern], degree: d, members, pitches };
}

/** Every degree's chord for the pattern (degree 0 to N-1). */
export function positionalChords(
  field: readonly Note[],
  subsetIdx: readonly number[],
  pattern: readonly number[],
  mode: number,
  rep: Note
): PositionalChord[] {
  const out: PositionalChord[] = [];
  for (let d = 0; d < subsetIdx.length; d++) {
    const c = positionalChord(field, subsetIdx, pattern, d, mode, rep);
    if (c) {
      out.push(c);
    }
  }
  return out;
}

export interface RankedPositional extends PositionalChord {
  /** The score (lower = smoother). */
  score: number;
}

/**
 * Default score: Sethares roughness of the chord's SHAPE (its intervals above its own root) with the root put at `baseHz`,
 * so the score does not depend on where the chord sits: identical shapes tie. Lower = smoother.
 */
export function roughnessOf(pitches: readonly Note[], baseHz = POSITIONAL_BASE_HZ): number {
  const r = pitches[0]?.c ?? 0;
  return scoreRoughness(pitches.map((p) => baseHz * 2 ** ((p.c - r) / 1200))).score;
}

/**
 * Chords with their score, smoothest first; equal scores (within 1e-9, e.g. identical shapes) keep degree order (stable tie-break). `score` can be
 * replaced (tests, a later lattice scorer).
 */
export function rankPositional(
  chords: readonly PositionalChord[],
  baseHz = POSITIONAL_BASE_HZ,
  score: (pitches: readonly Note[]) => number = (p) => roughnessOf(p, baseHz)
): RankedPositional[] {
  return chords
    .map((c) => ({ ...c, score: score(c.pitches) }))
    .sort((a, b) => (Math.abs(a.score - b.score) < 1e-9 ? a.degree - b.degree : a.score - b.score));
}

/** The main label: pattern + 1-based start degree, "2-2 on 4". */
export function positionalLabel(pattern: readonly number[], degree: number): string {
  return `${patternName(pattern)} on ${degree + 1}`;
}

/** Cents of each step between consecutive members, whole cents. */
export function stepCents(pitches: readonly Note[]): number[] {
  return pitches.slice(1).map((p, i) => Math.round(p.c - pitches[i].c));
}

/**
 * The simple ratio chord every note is within `tolC` of (default 5 c), as "~ 4:5:6", else null. Reuses the chord templates
 * (default: DEFAULT_TEMPLATES); the chord is compared as stacked above its root. The closest fit wins.
 */
export function ratioName(
  pitches: readonly Note[],
  templates: readonly (ChordTemplate | string)[] = DEFAULT_TEMPLATES,
  tolC = RATIO_NAME_TOL
): string | null {
  if (pitches.length < 2) {
    return null;
  }
  const iv = pitches.map((p) => p.c - pitches[0].c);
  let best: { err: number; name: string } | null = null;
  for (const t of templates) {
    const pt = parseTemplate(typeof t === 'string' ? t : t.text);
    if (!pt.ok || pt.cents.length !== iv.length) {
      continue;
    }
    const err = Math.max(...pt.cents.map((c, i) => Math.abs(c - iv[i])));
    if (err <= tolC + 1e-9 && (!best || err < best.err - 1e-9)) {
      best = { err, name: pt.otonal };
    }
  }
  return best ? `~ ${best.name}` : null;
}

export interface PositionalNaming {
  /** "2-2 on 4". */
  label: string;
  /** "7 of 12-EDO · 400-300 c". */
  tail: string;
  /** "~ 4:5:6" or null. */
  ratio: string | null;
}

/** The three naming parts. `subsetSize` and `genName` (the generator's display name) come from the caller (the lib has no UI). */
export function positionalNaming(
  chord: Pick<PositionalChord, 'pattern' | 'degree' | 'pitches'>,
  subsetSize: number,
  genName: string,
  templates?: readonly (ChordTemplate | string)[]
): PositionalNaming {
  return {
    label: positionalLabel(chord.pattern, chord.degree),
    tail: `${subsetSize} of ${genName} · ${stepCents(chord.pitches).join('-')} c`,
    ratio: ratioName(chord.pitches, templates),
  };
}
