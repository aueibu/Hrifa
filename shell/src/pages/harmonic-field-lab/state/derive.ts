/**
 * Everything computed from a tab (the field, the subset and its mode), as pure functions. The page calls them inside
 * `useMemo` keyed on the tab's field, selection and mode, so nothing here holds module-level data or caches.
 *
 * `deriveBase` is cheap and always runs. The heavier analyses (spectrum, chords, keys, visualizers) are separate
 * functions, each called by the panel that needs it, with the size caps the prototype used.
 */
import {
  DEFAULT_TEMPLATES,
  FIFTH_CENTS,
  analyzeSubset,
  closestChord,
  constantStructure,
  curveMinima,
  deviations,
  deviationsJI,
  dissonanceCurve,
  edoFit,
  bestEdos,
  edoTargets,
  fifthsLayout,
  findChordVoicings,
  fmtHidden,
  fmtRatio,
  intervalSpectrum,
  isoGrid,
  latticeCoords,
  latticeEdges,
  latticeCoords2d,
  latticeCoords3d,
  mod,
  oddLimit,
  parseInterval,
  primeLimit,
  primeSlot,
  propriety,
  rotateSubset,
  semitoneTargets,
  transpositions,
  vs12,
  vsJI,
  type ChordTemplate,
  type FifthsLayout,
  type IsoCell,
  type Lattice3d,
  type Note,
  type RelNote,
  type Voicing,
} from '../../../lib/harmonic-field';
import type { GenSpec } from './generate';
import type { Tab } from './labState';
import type { LatMode } from './vizState';

/** Size caps from the prototype: analyses that grow quickly with the number of notes. */
export const MAX_SPECTRUM = 64;
export const MAX_CHORDS = 128;
export const MAX_MODES = 32;
export const MAX_KEYS_WORK = 400000;
export const MAX_KEYS_NOTES = 256;

/** The repeat interval for the stats: the ratio when it is exact, then its size, e.g. `2/1 (1200.00 c)`; cents alone otherwise. */
export const periodText = (rep: Note): string =>
  rep.m ? `${fmtRatio(rep)} (${rep.c.toFixed(2)} c)` : `${rep.c.toFixed(2)} c`;

export type SubsetAnalysisT = NonNullable<ReturnType<typeof analyzeSubset>>;

export interface Base {
  field: Note[];
  rep: Note;
  repC: number;
  repText: string;
  /** Field ratio text, by index. */
  ratios: string[];
  /** Selected field indices, ascending. */
  idx: number[];
  selected: ReadonlySet<number>;
  /** The subset read from the mode root. */
  rel: RelNote[];
  /** Cents of the mode root above 1/1. */
  rootC: number;
  analysis: SubsetAnalysisT | null;
  mode: number;
}

/** A note's label: its ratio, or its cents (one decimal, e.g. "386.3 c") when it has none (EDO steps, cents generators). */
export const noteLabel = (n: Note): string => (n.m ? fmtRatio(n) : `${n.c.toFixed(1)} c`);

export function deriveBase(tab: Tab): Base {
  const { field, rep, sel, mode } = tab;
  const rel = rotateSubset(field, sel, mode, rep);
  const rootIdx = sel.length ? sel[mode % sel.length] : 0;
  return {
    field,
    rep,
    repC: rep.c,
    repText: noteLabel(rep),
    ratios: field.map(noteLabel),
    idx: sel,
    selected: new Set(sel),
    rel,
    rootC: sel.length ? (field[rootIdx]?.c ?? 0) : 0,
    analysis: analyzeSubset(rel, rep),
    mode,
  };
}

/* ------------------------------------------------------------------------------------------ field table */
/** Monzo as prime powers, e.g. 3^2 5^-1 (the factor 2 is shown too: 2^-3 3^2). */
export const fmtMonzo = (n: Note): string =>
  n.m
    ? Object.entries(n.m)
        .filter(([, e]) => e !== 0)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([p, e]) => (e === 1 ? p : `${p}^${e}`))
        .join(' ') || '1'
    : 'irrational';

export interface FieldRow {
  i: number;
  monzo: string;
  ratio: string;
  cents: number;
  step: number;
  prime: number | null;
  odd: string;
  vs12: string;
  vsJI: string;
}

/** One row per field note; not tied to the selection (the table adds the "in" flag). */
export function fieldRowsOf(field: Note[], repC: number): FieldRow[] {
  return field.map((n, i) => ({
    i,
    monzo: fmtMonzo(n),
    ratio: fmtRatio(n),
    cents: n.c,
    step: (i < field.length - 1 ? field[i + 1].c : repC) - n.c,
    prime: primeLimit(n),
    odd: String(oddLimit(n) ?? '-'),
    vs12: vs12(n.c),
    vsJI: vsJI(n.c, 15, repC),
  }));
}

/* ----------------------------------------------------------------------------------------------- strip */
export interface StripDev {
  ratio: string;
  c: number;
  dev: number;
  label: string;
}

/**
 * Deviation of every field note from the chosen reference, measured above the mode root (as the prototype did): the
 * reference notes sit above the root, so a note's offset is its cents above the root, wrapped into the repeat.
 */
export function stripDevs(base: Base, tab: Tab): { devs: StripDev[]; caption: string } {
  const { field, repC, rootC, ratios } = base;
  const shifted = field.map((n) => ({ c: mod(n.c - rootC, repC) }));
  const { ref, odd, m } = tab.cmp;
  let caption = 'vs 12-EDO semitones above the mode root';
  let list: { dev: number; label: string }[];
  if (ref === 'picked' && tab.pick.ref) {
    const p = tab.pick.ref;
    list = deviations(shifted, p.targets, repC);
    caption = `vs ${p.name} (${p.kind === 'ji' ? 'just' : '12-EDO'} targets${p.stretch ? ', stretched' : ''})`;
  } else if (ref === 'ji') {
    list = deviationsJI(shifted, odd, repC);
    caption = `vs nearest just ratio, odd limit ${odd}`;
  } else if (ref === 'medo') {
    list = deviations(shifted, edoTargets(m, repC), repC);
    caption = `vs ${m}-EDO steps above the mode root`;
  } else {
    list = deviations(shifted, semitoneTargets(repC), repC);
  }
  return {
    devs: field.map((n, i) => ({
      ratio: ratios[i],
      c: n.c,
      dev: list[i]?.dev ?? 0,
      label: list[i]?.label ?? '',
    })),
    caption,
  };
}

/** Scale degrees for the strip's steps row. */
export const FIFTHS_DEFAULT_GEN = FIFTH_CENTS;

/** The Fifths ring view: each field note on a generator chain; a generator that does not parse falls back to 3/2. */
export function fifthsFor(
  field: Note[],
  repC: number,
  genText: string,
  steps: number
): FifthsLayout {
  const g = parseInterval(genText);
  return fifthsLayout(field, {
    gen: g && g.c > 0 ? g.c : FIFTH_CENTS,
    period: repC,
    steps,
  });
}

/* ----------------------------------------------------------------------------------------------- spectrum */
export function spectrumOf(base: Base) {
  const { rel, repC } = base;
  if (rel.length < 2 || rel.length > MAX_SPECTRUM) {
    return null;
  }
  const spectrum = intervalSpectrum(rel, repC);
  return { spectrum, prop: propriety(spectrum), cs: constantStructure(rel, repC, 0.01, spectrum) };
}
export type SpectrumData = NonNullable<ReturnType<typeof spectrumOf>>;

/* ------------------------------------------------------------------------------------------------ chords */
export const SIZES = ['Triads', 'Tetrads', 'Larger'] as const;
export type Size = (typeof SIZES)[number];
const sizeOf = (n: number): Size => (n <= 3 ? SIZES[0] : n === 4 ? SIZES[1] : SIZES[2]);
export const OTHER_FAMILY = 'Other';

/** Family rows in the order the templates introduce them; user families follow, then Other. */
export const familyOrder = (
  names: string[],
  templates: ChordTemplate[] = DEFAULT_TEMPLATES
): string[] => {
  const seen = [...new Set(templates.map((t) => t.family ?? OTHER_FAMILY))];
  const extra = [...new Set(names)].filter((n) => !seen.includes(n));
  return [
    ...seen.filter((n) => n !== OTHER_FAMILY),
    ...extra.filter((n) => n !== OTHER_FAMILY),
  ].concat(OTHER_FAMILY);
};

export interface ChordChip {
  name: string;
  template: string;
  size: Size;
  family: string;
  root: string;
  /** Field index of the chord's root. */
  rootIdx: number;
  members: string[];
  memberIdx: number[];
  maxErr: number;
  /** Tolerance (c) at which the chord appears; for a found chip, its own error. */
  needs: number;
  found: boolean;
}

export interface ChordModel {
  chordsAt: (tol: number) => Voicing[];
  chipsAt: (tol: number) => ChordChip[];
  ladder: { tol: number; count: number }[];
  templateCount: number;
}

/** Chord finder for the current subset: voicings at any tolerance (cached inside this object) and the tolerance ladder. */
export function chordModel(
  base: Base,
  templates: ChordTemplate[] = DEFAULT_TEMPLATES
): ChordModel | null {
  const { rel, repC, ratios } = base;
  if (rel.length < 2 || rel.length > MAX_CHORDS) {
    return null;
  }
  const toChip = (c: Voicing, name: string, needs: number, found: boolean): ChordChip => ({
    name,
    template: c.template,
    size: sizeOf(c.members.length),
    family: c.family || OTHER_FAMILY,
    root: ratios[c.root],
    rootIdx: c.root,
    members: c.members.map((i) => ratios[i]),
    memberIdx: c.members,
    maxErr: c.maxErr,
    needs,
    found,
  });
  const closest = templates.flatMap((t) => {
    const r = closestChord(rel, repC, t);
    return r.chord
      ? [toChip({ ...r.chord, family: t.family }, t.name ?? t.text, r.tol, false)]
      : [];
  });
  const cache = new Map<number, Voicing[]>();
  const chordsAt = (tol: number) => {
    let hit = cache.get(tol);
    if (!hit) {
      hit = findChordVoicings(rel, repC, templates, tol).chords;
      cache.set(tol, hit);
    }
    return hit;
  };
  const chipsAt = (tol: number): ChordChip[] => {
    const found = chordsAt(tol);
    const have = new Set(found.map((c) => c.template));
    return [
      ...found.map((c) => toChip(c, c.name || c.template, c.maxErr, true)),
      ...closest.filter((c) => !have.has(c.template)),
    ];
  };
  const all = findChordVoicings(rel, repC, templates, 60).chords;
  const rungs = [...new Set(all.map((c) => Math.ceil(c.maxErr - 1e-9)))].sort((a, b) => a - b);
  const ladder = rungs.map((tol) => ({ tol, count: chordsAt(tol).length }));
  return { chordsAt, chipsAt, ladder, templateCount: templates.length };
}

/* ---------------------------------------------------------------------------------------- keys and modes */
export interface KeyRingData {
  root: string;
  rootIdx: number;
  complete: boolean;
  missing: number;
  moved: { c: number; found: boolean }[];
  /** Field indices the key's degrees land on (the whole scale when `complete`), in degree order; null where one is missing. */
  idx: (number | null)[];
}
export interface ModeFit {
  mode: number;
  root: string;
  errs: number[];
  ok: number;
}

const circ = (d: number, repC: number) => {
  const x = ((Math.abs(d) % repC) + repC) % repC;
  return x > repC / 2 ? repC - x : x;
};

export function keysOf(base: Base, tol: number) {
  const { field, rep, repC, idx, rel, mode, ratios } = base;
  const n = rel.length;
  if (n < 1 || n > MAX_KEYS_NOTES || n * field.length > MAX_KEYS_WORK) {
    return null;
  }
  const keys = transpositions(field, idx, mode, rep, tol);
  const keyRings: KeyRingData[] = keys.map((k) => ({
    root: ratios[k.root],
    rootIdx: k.root,
    complete: k.complete,
    missing: k.missing,
    idx: k.idx,
    moved: rel.map((note, d) => ({
      c: (field[k.root].c + note.c) % repC,
      found: k.idx[d] !== null,
    })),
  }));
  const modeFit: ModeFit[] =
    n > MAX_MODES
      ? []
      : idx.map((rootIdx, j) => {
          // row j is mode j of the subset (its j-th note as the root), whatever mode is current
          const r = rotateSubset(field, idx, j, rep);
          const errs = r.map((note) => Math.min(...field.map((f) => circ(f.c - note.c, repC))));
          return { mode: j, root: ratios[rootIdx], errs, ok: errs.filter((e) => e <= tol).length };
        });
  return { keys, completeKeys: keys.filter((k) => k.complete), keyRings, modeFit };
}
export type KeysData = NonNullable<ReturnType<typeof keysOf>>;

/* ------------------------------------------------------------------------------------------- visualizers */
/** Colour of a hidden prime's stem and chip: a core hue per prime (blue, green, orange and cyan are kept for chord, sounding, sharp and flat). */
const STEM_HUES = ['violet', 'pink', 'red', 'yellow'] as const;
export const stemHue = (prime: number): (typeof STEM_HUES)[number] =>
  STEM_HUES[primeSlot(prime) % STEM_HUES.length];

export interface Lattice2dView {
  pts: {
    i: number;
    x: number;
    y: number;
    bx: number;
    by: number;
    stems: { prime: number; x1: number; y1: number; x2: number; y2: number }[];
    hidden: { prime: number; exp: number }[];
    chip: string;
    label: string;
  }[];
  edges: [number, number][];
  axes: number[];
  available: number[];
}

/** The 2D lattice in a 640x300 box (notes on stems drawn at their tips, a ring at the base, a segment per prime). */
export function lattice2dOf(
  field: Note[],
  rep: Note,
  axes: readonly number[] | null
): Lattice2dView {
  const L = latticeCoords2d(field, rep, axes ?? undefined);
  const xs = L.pts.flatMap((p) => [p.pos[0], p.base[0]]);
  const ys = L.pts.flatMap((p) => [p.pos[1], p.base[1]]);
  const [minU, maxU, minV, maxV] = xs.length
    ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    : [0, 0, 0, 0];
  const W = 640;
  const H = 300;
  const pad = 40;
  const k = Math.min(150, (W - 2 * pad) / (maxU - minU || 1), (H - 2 * pad) / (maxV - minV || 1));
  const ox = W / 2 - (k * (minU + maxU)) / 2;
  const oy = H / 2 + (k * (minV + maxV)) / 2;
  const sx = (u: number) => ox + k * u;
  const sy = (v: number) => oy - k * v; // the lattice has y up
  return {
    pts: L.pts.map((p) => ({
      i: p.i,
      x: sx(p.pos[0]),
      y: sy(p.pos[1]),
      bx: sx(p.base[0]),
      by: sy(p.base[1]),
      stems: p.stems.map((s) => ({
        prime: s.prime,
        x1: sx(s.from[0]),
        y1: sy(s.from[1]),
        x2: sx(s.to[0]),
        y2: sy(s.to[1]),
      })),
      hidden: p.hidden,
      chip: p.hidden.map(fmtHidden).join(' '),
      label: fmtRatio(field[p.i]),
    })),
    edges: L.edges.map(([a, b]) => [a, b]),
    axes: L.axes,
    available: L.available,
  };
}

/** Which lattice axis modes the field can use: generators need generator exponents, factors need the CPS method. */
export interface LatAvail {
  gen: boolean;
  cps: boolean;
}
export function latAvail(field: Note[], rep: Note, method: GenSpec['method']): LatAvail {
  return {
    gen: latticeCoords(field, rep, 'gen') !== null,
    cps: method === 'cps' && latticeCoords(field, rep, 'cps') !== null,
  };
}
/** The mode a lattice draws: the stored one when this field can use it, else primes. */
export const effectiveLatMode = (mode: LatMode, a: LatAvail): LatMode =>
  mode === 'gen' && a.gen ? 'gen' : mode === 'cps' && a.cps ? 'cps' : 'prime';

/** The generators of a lattice field in axis order (the same ones `generateField` multiplies), as typed. */
export const genAxisNames = (g: GenSpec): string[] =>
  g.axes
    .slice(0, 3)
    .filter((a, i) => i === 0 || a.on)
    .map((a) => a.g.trim());
/** The CPS factors as typed. */
export const cpsFactorNames = (g: GenSpec): string[] => g.cpsF.split(/[\s,]+/).filter(Boolean);

/** One arrow of the axis key drawn beside a generator or factor lattice. */
export interface AxisKeyMark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tx: number;
  ty: number;
  label: string;
}

/** The 2D lattice in generator or factor coordinates: the same point shape as `Lattice2dView`, no stems, plus the axis key. */
export interface AltLattice2dView extends Lattice2dView {
  mode: 'gen' | 'cps';
  names: string[];
  key: AxisKeyMark[];
}

/**
 * The generator-step ('gen') or CPS-factor ('cps') lattice in a 640x300 box, as the prototype drew it. 'cps': the first
 * factor at the centre and the others evenly round a circle (for four factors, Wilson's star), a line joins two notes that
 * swap one factor; 'gen': one direction per generator (0, 90 degrees for two, 0, 60, 120 for three; a golden-angle spread
 * beyond that), a line is one step of one generator. Null when the field has no such coordinates.
 */
export function latticeAltOf(
  field: Note[],
  rep: Note,
  mode: 'gen' | 'cps',
  names: readonly string[]
): AltLattice2dView | null {
  const L = latticeCoords(field, rep, mode);
  if (!L || !L.pts.length) {
    return null;
  }
  const d = L.pts[0].x.length;
  const dirs = Array.from({ length: d }, (_, i): [number, number] => {
    if (mode === 'cps') {
      if (i === 0) {
        return [0, 0];
      }
      const m = d - 1;
      const half = m % 2 === 0 && i - 1 >= m / 2;
      const a = Math.PI / 2 + (2 * Math.PI * (i - 1)) / m + (half ? Math.PI / (2 * m) : 0);
      const r = half ? 0.75 : 1;
      return [r * Math.cos(a), -r * Math.sin(a)];
    }
    const a = d <= 3 ? (Math.PI * i) / Math.max(d, 2) : i * 2.39996;
    const len = d <= 3 ? 1 - 0.1 * i : Math.max(0.6, 1 - 0.05 * i);
    return [len * Math.cos(a), -len * Math.sin(a)];
  });
  const proj = (x: number[]): [number, number] => {
    let u = 0;
    let v = 0;
    x.forEach((e, i) => {
      u += e * dirs[i][0];
      v += e * dirs[i][1];
    });
    return [u, v];
  };
  const P = L.pts.map((p) => proj(p.x));
  const us = P.map((p) => p[0]);
  const vs = P.map((p) => p[1]);
  const [minU, maxU, minV, maxV] = [
    Math.min(...us),
    Math.max(...us),
    Math.min(...vs),
    Math.max(...vs),
  ];
  const W = 640;
  const H = 300;
  const pad = 40;
  const k = Math.min(110, (W - 2 * pad) / (maxU - minU || 1), (H - 2 * pad) / (maxV - minV || 1));
  const ox = W / 2 - (k * (minU + maxU)) / 2;
  const oy = H / 2 - (k * (minV + maxV)) / 2;
  const pts = L.pts.map((p, j) => {
    const x = ox + k * P[j][0];
    const y = oy + k * P[j][1];
    return {
      i: p.i,
      x,
      y,
      bx: x,
      by: y,
      stems: [],
      hidden: [],
      chip: '',
      label: noteLabel(field[p.i]),
    };
  });
  // the axis key sits left of the notes, bottom row
  const bx = Math.min(...pts.map((p) => p.x)) - 58;
  const by = Math.max(...pts.map((p) => p.y));
  const key = dirs.map((dv, i) => ({
    x1: bx,
    y1: by,
    x2: bx + dv[0] * 22,
    y2: by + dv[1] * 22,
    tx: bx + dv[0] * 32,
    ty: by + dv[1] * 32 + 3,
    label: names[i] ?? '',
  }));
  return {
    mode,
    names: dirs.map((_, i) => names[i] ?? ''),
    key,
    pts,
    edges: latticeEdges(L.pts, mode === 'cps' ? 'swap' : 'step').map(([a, b]) => [a, b]),
    axes: [],
    available: [],
  };
}

export const lattice3dOf = (field: Note[], rep: Note, axes: readonly number[] | null): Lattice3d =>
  latticeCoords3d(field, rep, axes ?? undefined);

/** EDO fit of the subset to every n-EDO from 5 to 72, and the few n worth naming. */
export function edoOf(base: Base) {
  const rows = edoFit(
    base.rel.map((n) => n.c),
    base.repC
  );
  return { rows, best: bestEdos(rows, 4) };
}

/** Sethares roughness of two harmonic tones over one repeat (1 c steps) and its dips. */
export function dissOf(repC: number) {
  const curve = dissonanceCurve(261.63, repC, 1);
  return { curve, dips: curveMinima(curve) };
}

/** The isomorphic keyboard for generators given as ratio text; unreadable text falls back to 3/2 and 2/1. */
export function isoOf(base: Base, g1: string, g2: string, tol: number): IsoCell[] {
  const c = (t: string, d: number) => {
    const n = parseInterval(t);
    return n && Number.isFinite(n.c) ? n.c : d;
  };
  return isoGrid(
    base.field.map((n) => n.c),
    base.repC,
    { g1: c(g1, FIFTH_CENTS), g2: c(g2, 1200), tol }
  );
}
