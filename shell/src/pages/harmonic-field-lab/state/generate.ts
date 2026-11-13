/**
 * Generation inputs of one tab (`GenSpec`) and the pure function that turns them into a field. No React.
 *
 * Every user-typed interval goes through `parseInterval`; a parse failure is returned as `err` (shown inline by the
 * page), never thrown. A failed generation keeps the previous field (the reducer decides), as the prototype did.
 */
import {
  EPS,
  MAXN,
  PRESETS,
  PRIMES,
  buildField,
  fmtRatio,
  genAdditive,
  genCps,
  genEdo,
  genHarmonic,
  genOrthoplex,
  mosSizes,
  parseCustom,
  parseInterval,
  slotOf,
  type AdditiveAxis,
  type MosSize,
  type Note,
  type Preset,
} from '../../../lib/harmonic-field';

export type Method = 'harmonic' | 'sub' | 'edo' | 'lattice' | 'cps' | 'custom';
export const METHODS: readonly Method[] = ['harmonic', 'sub', 'edo', 'lattice', 'cps', 'custom'];
export const PRIME_SLOTS = 25;

export interface AxisSpec {
  on: boolean;
  g: string;
  n: number;
  ctr: number;
}

export interface GenSpec {
  /** Name of the preset these inputs came from; '' once anything was edited by hand. */
  preset: string;
  method: Method;
  /** The repeat interval as typed ('2/1', '3', '701.96c', '7\\12'). */
  rep: string;
  /** Harmonic and subharmonic: the starting harmonic. */
  h: number;
  /** EDO: divisions. */
  edoN: number;
  /** Lattice. */
  shape: 'box' | 'diamond';
  axes: AxisSpec[];
  dist: number;
  bidir: boolean;
  /** CPS factors, space separated, and k. */
  cpsF: string;
  cpsK: number;
  /** Custom intervals, one per line. */
  custom: string;
  /** Prime filter: 25 switches (2 .. 89, then the shared 97+ slot). */
  mask: boolean[];
  /** When the field changes, also select any newly appearing notes. */
  keepNew: boolean;
}

export const DEFAULT_AXES: AxisSpec[] = [
  { on: true, g: '3/2', n: 12, ctr: 0 },
  { on: true, g: '5/4', n: 3, ctr: 1 },
  { on: false, g: '7/4', n: 3, ctr: 1 },
];

export function defaultGen(): GenSpec {
  return {
    preset: '',
    method: 'harmonic',
    rep: '2/1',
    h: 8,
    edoN: 12,
    shape: 'box',
    axes: DEFAULT_AXES.map((a) => ({ ...a })),
    dist: 3,
    bidir: true,
    cpsF: '1 3 5 7',
    cpsK: 2,
    custom: '9/8\n5/4\n4/3\n3/2\n5/3\n15/8',
    mask: Array<boolean>(PRIME_SLOTS).fill(true),
    keepNew: false,
  };
}

const METHOD_OF: Record<Preset['gen'], Method> = {
  harmonic: 'harmonic',
  subharmonic: 'sub',
  edo: 'edo',
  additive: 'lattice',
  cps: 'cps',
  custom: 'custom',
};

/** The inputs a preset fills in (everything else is the default). */
export function genFromPreset(p: Preset): GenSpec {
  const g = defaultGen();
  g.preset = p.name;
  g.method = METHOD_OF[p.gen];
  g.rep = p.rep;
  if (p.h != null) {
    g.h = p.h;
  }
  if (p.n != null) {
    g.edoN = p.n;
  }
  if (p.axes) {
    g.axes = [0, 1, 2].map((i) => {
      const a = p.axes?.[i];
      return a ? { on: true, g: a.g, n: a.n, ctr: a.ctr } : { ...DEFAULT_AXES[i], on: i === 0 };
    });
    g.shape = p.shape ?? 'box';
    if (p.dist != null) {
      g.dist = p.dist;
    }
    g.bidir = p.bidir !== false;
  }
  if (p.factors != null) {
    g.cpsF = p.factors;
    g.cpsK = p.k ?? g.cpsK;
  }
  if (p.text != null) {
    g.custom = p.text.trim().split(/\s+/).join('\n');
  }
  g.mask = Array<boolean>(PRIME_SLOTS).fill(!p.primes);
  if (p.primes) {
    for (const q of p.primes) {
      g.mask[slotOf(q)] = true;
    }
  }
  return g;
}

export const presetByName = (name: string): Preset | undefined =>
  PRESETS.find((p) => p.name === name);

/** The text the tab shows when the user has not named it: the preset, or a short description of the inputs. */
export function autoName(g: GenSpec): string {
  if (g.preset) {
    return g.preset;
  }
  switch (g.method) {
    case 'harmonic':
      return `Harmonics from ${g.h}`;
    case 'sub':
      return `Subharmonics from ${g.h}`;
    case 'edo':
      return `${g.edoN}-EDO`;
    case 'lattice':
      return 'Lattice';
    case 'cps':
      return `CPS ${g.cpsF.trim().split(/\s+/).join(' ')} choose ${g.cpsK}`;
    default:
      return 'Custom scale';
  }
}

/**
 * What the field depends on: two specs with the same key build the same field (the "pitch collection" a saved subset
 * belongs to). The preset name, the keepNew switch and unused inputs of other methods are left out.
 */
export function genKey(g: GenSpec): string {
  // an interval by its pitch, so "2" and "2/1" are the same repeat; unreadable text stays as typed
  const iv = (t: string) => {
    const n = parseInterval(t);
    return n ? `${n.c.toFixed(6)}` : `?${t.trim()}`;
  };
  const common = { m: g.method, r: iv(g.rep), k: g.mask.map((b) => (b ? 1 : 0)).join('') };
  switch (g.method) {
    case 'harmonic':
    case 'sub':
      return JSON.stringify({ ...common, h: g.h });
    case 'edo':
      return JSON.stringify({ ...common, n: g.edoN });
    case 'lattice': {
      // a diamond uses only the generators of the axes that are on, a box also their counts and centres
      const axes = g.axes.filter((a, i) => i === 0 || a.on);
      return g.shape === 'diamond'
        ? JSON.stringify({ ...common, s: 'd', a: axes.map((a) => iv(a.g)), d: g.dist, b: g.bidir })
        : JSON.stringify({ ...common, s: 'b', a: axes.map((a) => [iv(a.g), a.n, a.ctr]) });
    }
    case 'cps':
      return JSON.stringify({
        ...common,
        f: g.cpsF
          .trim()
          .split(/[\s,]+/)
          .map(iv),
        ck: g.cpsK,
      });
    default:
      return JSON.stringify({ ...common, t: g.custom.trim().split(/\s+/).map(iv) });
  }
}

export type Generated =
  | { ok: true; field: Note[]; rep: Note; warn: string }
  | { ok: false; err: string };

const posInt = (x: unknown, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER) => {
  const n = typeof x === 'number' ? x : parseInt(String(x), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};

/** The repeat interval as a note, or an inline error. */
export function parseRepeat(text: string): { rep: Note } | { err: string } {
  const rep = parseInterval(text);
  if (!rep) {
    return { err: `Repeat interval: cannot read "${text.trim()}" (try 2/1, 3, 701.96c or 7\\12)` };
  }
  if (rep.c <= EPS) {
    return { err: 'Repeat interval must be larger than 1/1' };
  }
  return { rep };
}

/** Axes of the lattice generator, or an inline error naming the bad one. */
function readAxes(g: GenSpec): { axes: AdditiveAxis[] } | { err: string } {
  const axes: AdditiveAxis[] = [];
  for (let i = 0; i < 3; i++) {
    const a = g.axes[i];
    if (!a || (i > 0 && !a.on)) {
      continue;
    }
    const note = parseInterval(a.g);
    if (!note || Math.abs(note.c) < EPS) {
      return { err: `Axis ${i + 1}: cannot read the generator "${a.g.trim()}"` };
    }
    axes.push({ g: note, n: posInt(a.n, 1), ctr: posInt(a.ctr, 0, 0) });
  }
  return { axes };
}

/** Build the field for a spec. Never throws. */
export function generateField(g: GenSpec): Generated {
  const r = parseRepeat(g.rep);
  if ('err' in r) {
    return { ok: false, err: r.err };
  }
  const rep = r.rep;
  let notes: Note[];
  try {
    switch (g.method) {
      case 'harmonic':
      case 'sub':
        notes = genHarmonic(posInt(g.h, 1), rep, g.method === 'sub');
        break;
      case 'edo':
        notes = genEdo(posInt(g.edoN, 1, 1, MAXN), rep);
        break;
      case 'lattice': {
        const ax = readAxes(g);
        if ('err' in ax) {
          return { ok: false, err: ax.err };
        }
        notes =
          g.shape === 'diamond'
            ? genOrthoplex(
                ax.axes.map((a) => ({ g: a.g })),
                posInt(g.dist, 0, 0),
                g.bidir
              )
            : genAdditive(ax.axes);
        break;
      }
      case 'cps': {
        const toks = g.cpsF.split(/[\s,]+/).filter(Boolean);
        const f: Note[] = [];
        for (const t of toks) {
          const n = parseInterval(t);
          if (!n) {
            return { ok: false, err: `CPS factor: cannot read "${t}"` };
          }
          f.push(n);
        }
        notes = genCps(f, posInt(g.cpsK, 1));
        break;
      }
      default:
        notes = parseCustom(g.custom, rep);
    }
    const built = buildField(notes, rep, g.mask);
    const warn = built.truncated
      ? `Truncated to ${MAXN} notes`
      : built.notes.length === 0
        ? 'Prime filter removed every note'
        : '';
    return { ok: true, field: built.notes, rep, warn };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : 'Could not build the field' };
  }
}

/** Chain sizes of the first lattice axis that form a MOS (the clickable chips), or none when the inputs do not parse. */
export function mosFor(g: GenSpec): MosSize[] {
  const a = g.axes[0];
  const gen = a ? parseInterval(a.g) : null;
  const r = parseRepeat(g.rep);
  if (!gen || 'err' in r || Math.abs(gen.c) < EPS) {
    return [];
  }
  return mosSizes(gen.c, r.rep.c, 60).slice(0, 12);
}

export const PRIME_LABELS = [...PRIMES.slice(0, 24).map(String), '97+'];

/** "1/1 to 15/8" style range text for the parameter note under the harmonic method. */
export function rangeText(field: Note[]): string {
  return field.length ? `${fmtRatio(field[0])} to ${fmtRatio(field[field.length - 1])}` : 'empty';
}
