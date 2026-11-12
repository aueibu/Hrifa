/**
 * Chord finder by template. Pure.
 *
 * A template is a small-number chord written a:b:c[:d...] (otonal: the numbers are harmonics) or 1/(a:b:c) (utonal: the
 * pitches are the INVERSES 1/a : 1/b : 1/c, so 1/(4:5:6) has the same intervals as 10:12:15). See README.md.
 */
import { EPS } from './intervals';
import type { RelNote } from './types';

export type ParsedTemplate =
  | {
      ok: true;
      text: string;
      utonal: boolean;
      cents: number[];
      /** Equivalent integer ratio in lowest terms, e.g. "10:12:15". */
      otonal: string;
      key: string;
    }
  | { ok: false; error: string };

type OkTemplate = Extract<ParsedTemplate, { ok: true }>;

export interface ChordTemplate {
  text: string;
  name?: string;
}

function gcdBig(x: bigint, y: bigint): bigint {
  let a = x;
  let b = y;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Whitespace is ignored. Numbers: whole numbers 1 ... 1e6, 2 ... 8 of them, all different.
 * "1/4:5:6" (no brackets) is an error ("1/4:5" is ambiguous). Never throws.
 */
export function parseTemplate(text: string | null | undefined): ParsedTemplate {
  const t = String(text == null ? '' : text).replace(/\s+/g, '');
  if (!t) {
    return { ok: false, error: 'Empty template. Write it like 4:5:6 or 1/(4:5:6).' };
  }
  let utonal = false;
  let body = t;
  let m: RegExpExecArray | null;
  if ((m = /^1\/\(([^()]*)\)$/.exec(t))) {
    utonal = true;
    body = m[1];
  } else if (/^1\//.test(t)) {
    return {
      ok: false,
      error: `"${String(text).trim()}": write utonal chords as 1/(4:5:6:7), with brackets.`,
    };
  }
  if (!/^\d+(:\d+)*$/.test(body)) {
    return {
      ok: false,
      error: `"${String(
        text
      ).trim()}" is not a template. Use whole numbers joined by colons, like 4:5:6, or 1/(4:5:6) for the utonal form.`,
    };
  }
  const nums = body.split(':').map(Number);
  if (nums.length < 2) {
    return { ok: false, error: 'A chord needs at least 2 numbers, like 4:5:6.' };
  }
  if (nums.length > 8) {
    return { ok: false, error: 'At most 8 numbers per template.' };
  }
  if (nums.some((x) => !(x >= 1 && x <= 1e6))) {
    return { ok: false, error: 'Numbers must be whole numbers from 1 to 1000000.' };
  }
  if (new Set(nums).size !== nums.length) {
    return {
      ok: false,
      error: 'The numbers must all be different (a chord needs distinct notes).',
    };
  }
  const mx = Math.max(...nums);
  const mn = Math.min(...nums);
  const cents = nums
    .map((x) => (utonal ? 1200 * Math.log2(mx / x) : 1200 * Math.log2(x / mn)))
    .sort((a, b) => a - b);
  let ints: bigint[];
  if (utonal) {
    let L = 1n;
    for (const x of nums) {
      const b = BigInt(x);
      L = (L / gcdBig(L, b)) * b;
    }
    ints = nums.map((x) => L / BigInt(x));
  } else {
    ints = nums.map(BigInt);
  }
  ints.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let g = ints[0];
  for (const x of ints) {
    g = gcdBig(g, x);
  }
  return {
    ok: true,
    text: utonal ? `1/(${body})` : body,
    utonal,
    cents,
    otonal: ints.map((x) => String(x / g)).join(':'),
    key: cents.map((c) => c.toFixed(6)).join(','),
  };
}

/** The template's cents reduced into [0, repC) (an interval within 1e-6 c of repC becomes 0). */
function reduceCents(pt: OkTemplate, repC: number): number[] {
  return pt.cents.map((c) => {
    let x = ((c % repC) + repC) % repC;
    if (repC - x < 1e-6) {
      x = 0;
    }
    return x;
  });
}

/**
 * Duplicate key of a template in a given repeat: its cents reduced mod repC, sorted (so 4:5:6, 8:10:12, 2:5:6 and
 * 1:3:5 share one key, as do 3:5:7 and 6:7:10).
 */
export function templateKey(pt: OkTemplate, repC: number): string {
  return reduceCents(pt, repC)
    .slice()
    .sort((a, b) => a - b)
    .map((c) => c.toFixed(5))
    .join(',');
}

/**
 * True when two members of the template land on the same pitch class (or on the root) in this repeat, e.g. 1:2, 1:2:3,
 * 4:5:6:8 in 2/1. Such a chord can never be found.
 */
export function templateFolds(pt: OkTemplate, repC: number): boolean {
  const r = reduceCents(pt, repC).sort((a, b) => a - b);
  for (let i = 1; i < r.length; i++) {
    if (r[i] - r[i - 1] < 1e-6) {
      return true;
    }
  }
  return false;
}

/** `name` is optional; the label shows both: "major triad (4:5:6)". */
export function templateLabel(t: ChordTemplate): string {
  return t.name && t.name.indexOf(t.text) < 0 ? `${t.name} (${t.text})` : t.name || t.text;
}

export const DEFAULT_TEMPLATES: ChordTemplate[] = [
  { name: 'major triad', text: '4:5:6' },
  { name: 'minor triad', text: '10:12:15' },
  { name: 'harmonic 7th chord', text: '4:5:6:7' },
  { name: 'subminor triad', text: '6:7:9' },
  { name: 'supermajor triad', text: '14:18:21' },
  { name: 'neutral triad', text: '18:22:27' },
  { name: 'septimal diminished triad', text: '5:6:7' },
  { name: 'suspended 4th triad', text: '6:8:9' },
  { name: 'major 7th chord', text: '8:10:12:15' },
  { name: 'minor 7th chord', text: '10:12:15:18' },
  { name: 'utonal tetrad', text: '1/(4:5:6:7)' },
  { name: '3:5:7 triad', text: '3:5:7' },
];

export interface FoundChord {
  /** Index in `templates`. */
  t: number;
  /** The duplicate key. */
  tkey: string;
  /** Normalised template text. */
  template: string;
  name: string;
  /** Field index of the root. */
  root: number;
  /** Field indices, template order, root first. */
  members: number[];
  /** Signed error in cents of each member (note - template). */
  errors: number[];
  maxErr: number;
  /** Every note involved is rational and every error < 1e-6 c. */
  exact: boolean;
}

/**
 * rel = rotateSubset(...) (each note has `src`). templates = [{text, name?} | string]. For every degree as root and
 * every template: each template member (its cents above the root, reduced mod repC) is matched to the NEAREST subset
 * note (circular); error = note - template, in cents. Voicing-agnostic. A chord is accepted when every |error| <= tolC
 * AND the matched notes are all different. Unparseable, duplicate (same reduced pitch classes) or self-folding
 * templates are skipped. Results are sorted by maxErr, then by root position.
 */
export function findChords(
  rel: RelNote[],
  repC: number,
  templates: (ChordTemplate | string)[],
  tolC: number
): FoundChord[] {
  const N = rel.length;
  const out: (FoundChord & { _pos?: number })[] = [];
  const seen = new Set<string>();
  const circ = (input: number): number => {
    const x = ((input % repC) + repC) % repC;
    return x > repC / 2 ? x - repC : x;
  };
  templates.forEach((tp, ti) => {
    const src: ChordTemplate = typeof tp === 'string' ? { text: tp } : tp;
    const pt = parseTemplate(src.text);
    if (!pt.ok) {
      return;
    }
    const tkey = templateKey(pt, repC);
    if (seen.has(tkey) || templateFolds(pt, repC)) {
      return;
    }
    seen.add(tkey);
    const tc = reduceCents(pt, repC);
    for (let i = 0; i < N; i++) {
      const used = new Set<number>([i]);
      const mem = [rel[i].src];
      const errs = [0];
      let ok = true;
      let maxErr = 0;
      let exact = !!rel[i].m;
      for (let k = 1; k < tc.length && ok; k++) {
        let best = -1;
        let be = Infinity;
        for (let j = 0; j < N; j++) {
          const e = circ(rel[j].c - rel[i].c - tc[k]);
          if (Math.abs(e) < Math.abs(be)) {
            be = e;
            best = j;
          }
        }
        if (best < 0 || used.has(best) || Math.abs(be) > tolC + 1e-9) {
          ok = false;
          break;
        }
        used.add(best);
        mem.push(rel[best].src);
        errs.push(be);
        maxErr = Math.max(maxErr, Math.abs(be));
        if (!rel[best].m) {
          exact = false;
        }
      }
      if (ok) {
        out.push({
          t: ti,
          tkey,
          template: pt.text,
          name: src.name || '',
          root: rel[i].src,
          members: mem,
          errors: errs,
          maxErr,
          exact: exact && maxErr < EPS,
          _pos: i,
        });
      }
    }
  });
  out.sort((a, b) => a.maxErr - b.maxErr || (a._pos as number) - (b._pos as number));
  out.forEach((r) => delete r._pos);
  return out;
}

export type ClosestChord = { chord: FoundChord; tol: number } | { chord: null; reason: string };

/**
 * The chord findChords would return with NO tolerance limit and the smallest maxErr, i.e. "what tolerance would make
 * this template show up". Ties in maxErr (within 1e-9) go to the root earliest in `rel`.
 */
export function closestChord(
  rel: RelNote[],
  repC: number,
  template: ChordTemplate | string
): ClosestChord {
  const src: ChordTemplate = typeof template === 'string' ? { text: template } : template;
  const pt = parseTemplate(src.text);
  if (!pt.ok) {
    return { chord: null, reason: 'the template could not be read' };
  }
  if (templateFolds(pt, repC)) {
    return {
      chord: null,
      reason:
        'two of its notes land on the same pitch class in this repeat, so they can never be told apart',
    };
  }
  const need = pt.cents.length;
  if (rel.length < need) {
    return {
      chord: null,
      reason: `the subset has only ${rel.length} note${rel.length === 1 ? '' : 's'} and the template needs ${need} different ones`,
    };
  }
  const list = findChords(rel, repC, [src], Infinity);
  if (!list.length) {
    return {
      chord: null,
      reason:
        'whichever note is the root, two of the notes of the template would land on the same subset note (or on the root), so no chord of this shape fits this subset',
    };
  }
  const best = list[0].maxErr;
  const pos = (r: FoundChord): number => rel.findIndex((n) => n.src === r.root);
  const c = list.filter((r) => r.maxErr <= best + 1e-9).sort((a, b) => pos(a) - pos(b))[0];
  return { chord: c, tol: c.maxErr };
}

export interface LadderRung {
  tol: number;
  count: number;
}

export interface ChordLadder {
  rungs: LadderRung[];
  reason?: string;
}

/**
 * Every tolerance at which this template gains chords. Chords whose maxErr lie within 1e-9 share a rung; `count` is
 * cumulative. Empty (with a reason) when no chord can ever be found.
 */
export function chordLadder(
  rel: RelNote[],
  repC: number,
  template: ChordTemplate | string
): ChordLadder {
  const src: ChordTemplate = typeof template === 'string' ? { text: template } : template;
  const list = findChords(rel, repC, [src], Infinity);
  if (!list.length) {
    const c = closestChord(rel, repC, src);
    return { rungs: [], reason: c.chord === null ? c.reason : undefined };
  }
  const rungs: LadderRung[] = [];
  list.forEach((r, i) => {
    const L = rungs[rungs.length - 1];
    if (L && r.maxErr - L.tol <= 1e-9) {
      L.count = i + 1;
    } else {
      rungs.push({ tol: r.maxErr, count: i + 1 });
    }
  });
  return { rungs };
}
