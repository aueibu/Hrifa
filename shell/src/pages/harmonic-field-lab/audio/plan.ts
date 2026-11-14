/**
 * What to play, as plain data: the Hz and the field note each sound belongs to (so the page can light it). Pure; the
 * hook in `useLabAudio.ts` hands these plans to the voice engine.
 */
import { rotateSubset, type Note, type RelNote } from '../../../lib/harmonic-field';
import { wrapSigned } from '../state/derive';
import { chordAmp, hzOf } from './engine';
import { slotTarget } from './keymap';

export interface Planned {
  hz: number;
  /** Field index of the note (lights in every view while it sounds); -1 lights nothing (a pure tone off the field). */
  src: number;
  /** Light only the tuner-strip mark of `src` (a pure target tone that is no field note), not the other views. */
  markOnly?: boolean;
  /** Seconds after the start of the plan, and length in seconds. */
  delay: number;
  dur: number;
  amp: number;
}

export interface PitchBase {
  baseHz: number;
  /** Cents of the mode root above 1/1. */
  rootC: number;
  /** When on, the mode root sounds at the 1/1 Hz setting; when off, notes keep their absolute pitch. */
  modeAtBase: boolean;
}

/** Hz of a note `cents` above the mode root. */
export const relHz = (p: PitchBase, cents: number): number =>
  hzOf(p.baseHz, (p.modeAtBase ? 0 : p.rootC) + cents);

/** Hz of a field note at its own pitch above 1/1. */
export const absHz = (p: PitchBase, cents: number): number => hzOf(p.baseHz, cents);

/** The pitch of a dock or computer key: slot i is degree i mod N, floor(i / N) repeats up. Null for no such key. */
export function slotPitch(
  slot: number,
  rel: readonly RelNote[],
  repC: number,
  p: PitchBase
): { hz: number; src: number } | null {
  const t = slotTarget(slot, rel.length);
  if (!t) {
    return null;
  }
  return { hz: relHz(p, rel[t.deg].c + t.oct * repC), src: rel[t.deg].src };
}

/** Direction of a scale preview: up to the repeat, or up and then back down to the start. */
export type ScaleDir = 'up' | 'updown';

const SCALE_STEP = 0.28;
const SCALE_DUR = 0.26;

/** A run of notes one after another (`ascending` is every pitch up to and including the top); up-down walks back down. */
function runPlan(ascending: readonly { hz: number; src: number }[], dir: ScaleDir): Planned[] {
  const order =
    dir === 'updown' ? [...ascending, ...ascending.slice(0, -1).reverse()] : [...ascending];
  return order.map((n, i) => ({
    hz: n.hz,
    src: n.src,
    delay: i * SCALE_STEP,
    dur: SCALE_DUR,
    amp: 1,
  }));
}

/** Play scale: every subset note from the root up, then the repeat; 0.28 s apart. Up-down comes back down to the root. */
export function scalePlan(
  rel: readonly RelNote[],
  repC: number,
  p: PitchBase,
  dir: ScaleDir = 'up'
): Planned[] {
  const n = rel.length;
  const up: { hz: number; src: number }[] = [];
  for (let i = 0; i <= n && n > 0; i++) {
    const deg = i % n;
    up.push({ hz: relHz(p, rel[deg].c + Math.floor(i / n) * repC), src: rel[deg].src });
  }
  return runPlan(up, dir);
}

/**
 * A scale made of field notes in degree order (a key ring's notes: root first), each at its own pitch above 1/1. Each note
 * is lifted by the repeat until it is above the one before, so the run only climbs; then the root once more, a repeat up.
 */
export function fieldScalePlan(
  field: readonly Note[],
  order: readonly number[],
  repC: number,
  p: PitchBase,
  dir: ScaleDir = 'up'
): Planned[] {
  const idx = order.filter((i) => i >= 0 && i < field.length);
  if (!idx.length || !(repC > 0)) {
    return [];
  }
  const up: { hz: number; src: number }[] = [];
  let prev = -Infinity;
  for (const i of idx) {
    let c = field[i].c;
    while (c < prev) {
      c += repC;
    }
    prev = c;
    up.push({ hz: absHz(p, c), src: i });
  }
  up.push({ hz: absHz(p, field[idx[0]].c + repC), src: idx[0] });
  return runPlan(up, dir);
}

/** Play chord with a highlighted chord: its field notes together, at their own pitch above 1/1. */
export function chordPlan(
  field: readonly Note[],
  members: Iterable<number>,
  p: PitchBase
): Planned[] {
  const idx = [...members].filter((i) => i >= 0 && i < field.length).sort((a, b) => a - b);
  const amp = chordAmp(idx.length);
  return idx.map((i) => ({ hz: absHz(p, field[i].c), src: i, delay: 0, dur: 1.8, amp }));
}

/** Play chord with nothing highlighted: the whole subset sounding together, from the mode root. */
export function subsetChordPlan(rel: readonly RelNote[], p: PitchBase): Planned[] {
  const amp = chordAmp(rel.length);
  return rel.map((n) => ({ hz: relHz(p, n.c), src: n.src, delay: 0, dur: 2.2, amp }));
}

/** What a modifier click previews: the field's own (listed) pitch, the pure pitch, or both together. */
export type PreviewKind = 'listed' | 'pure' | 'both';

/**
 * What the pointer (or keyboard focus) is on, for the hold-1/2/3 previews: a whole mode (its title), one mode degree (a
 * tile) or a tuner-strip note with its deviation from the compare-to reference.
 */
export type PreviewTarget =
  | { kind: 'mode'; mode: number }
  | { kind: 'tile'; mode: number; degree: number }
  | { kind: 'strip'; i: number; dev: number }
  /** Anywhere a single field note is drawn (a ring dot, a lattice point, a table row): hold 1 sounds it. */
  | { kind: 'note'; i: number }
  /** A chord chip: hold 1 sounds its field notes together. */
  | { kind: 'chord'; idx: readonly number[] }
  /** A key ring or a saved subset: its field notes in degree order (root first); hold 1 steps through them as a scale. */
  | { kind: 'scale'; idx: readonly number[] };

/** Stable identity of a target, so a pointer leaving one target does not clear a newer one. */
export const previewTargetKey = (t: PreviewTarget): string => {
  switch (t.kind) {
    case 'mode':
      return `m${t.mode}`;
    case 'tile':
      return `t${t.mode}.${t.degree}`;
    case 'strip':
      return `s${t.i}`;
    case 'note':
      return `n${t.i}`;
    case 'chord':
      return `c${t.idx.join(',')}`;
    case 'scale':
      return `k${t.idx.join(',')}`;
  }
};

/** The held digit keys: 1 = listed, 2 = pure / target, 3 = both. */
export const HOLD_DIGITS: Readonly<Record<string, PreviewKind>> = {
  '1': 'listed',
  '2': 'pure',
  '3': 'both',
};

/** Both tones together: every step is held this much longer, so the beating can be heard. */
export const PAIR_HOLD = 1.5;

/** One sound inside a step: its Hz and what it lights (see `Planned`). */
export interface Tone {
  hz: number;
  src: number;
  markOnly?: boolean;
}

/**
 * Steps one after another; a step's tones start together and last the same time (a pair for "both"). A step is
 * `step` seconds apart and sounds for `dur`, both times `hold`.
 */
export function stepsPlan(
  steps: readonly (readonly Tone[])[],
  hold = 1,
  step = SCALE_STEP,
  dur = SCALE_DUR
): Planned[] {
  const amp = steps.some((s) => s.length > 1) ? chordAmp(2) : 1;
  return steps.flatMap((tones, i) =>
    tones.map((t) => ({ ...t, delay: i * step * hold, dur: dur * hold, amp }))
  );
}

/** A mode's degrees: the pitch it wants (cents above its root), the field note nearest it and the signed distance. */
export function modeDegrees(
  field: readonly Note[],
  idx: readonly number[],
  mode: number,
  rep: Note,
  repC: number
): { wanted: number; near: number; d: number }[] {
  const r = rotateSubset(field as Note[], idx as number[], mode, rep);
  return r.map((n) => {
    let near = -1;
    let d = Infinity;
    field.forEach((f, i) => {
      const x = wrapSigned(f.c - n.c, repC);
      if (Math.abs(x) < Math.abs(d)) {
        d = x;
        near = i;
      }
    });
    return { wanted: n.c, near, d: near < 0 ? 0 : d };
  });
}

/**
 * Preview of mode `mode` of the subset, from its root (the mode root sounds at the 1/1 Hz setting or at its own pitch,
 * as for Play scale). Listed: the nearest field notes (errors included). Pure: the exact intervals; a pure tone lights
 * a field note only when it is exact. Both: each degree as a pair, held 1.5x. Up/Up-down like Play scale; with `only`
 * just that degree (a tile click). Up ends on the repeat, like Play scale.
 */
export function modePreviewPlan(
  field: readonly Note[],
  idx: readonly number[],
  mode: number,
  rep: Note,
  repC: number,
  p: PitchBase,
  kind: PreviewKind,
  dir: ScaleDir = 'up',
  only?: number
): Planned[] {
  const m = idx.length;
  if (!m || mode < 0 || mode >= m || !(repC > 0)) {
    return [];
  }
  const pj: PitchBase = { ...p, rootC: field[idx[mode]].c };
  const degs = modeDegrees(field, idx, mode, rep, repC);
  const tones = (g: (typeof degs)[number], lift: number): Tone[] => {
    const listed: Tone = { hz: relHz(pj, g.wanted + g.d + lift), src: g.near };
    const pure: Tone = {
      hz: relHz(pj, g.wanted + lift),
      src: Math.abs(g.d) < 1e-6 ? g.near : -1,
    };
    return kind === 'listed' ? [listed] : kind === 'pure' ? [pure] : [listed, pure];
  };
  const hold = kind === 'both' ? PAIR_HOLD : 1;
  if (only !== undefined) {
    return degs[only] ? stepsPlan([tones(degs[only], 0)], hold) : [];
  }
  const up = [...degs.map((g) => tones(g, 0)), tones(degs[0], repC)];
  const order = dir === 'updown' ? [...up, ...up.slice(0, -1).reverse()] : up;
  return stepsPlan(order, hold);
}

/**
 * A tuner-strip note: listed (its own pitch), pure (the target: the note minus its deviation from the compare-to
 * reference) or both held 1.5x. The target lights only the note's strip mark; the listed tone lights it everywhere.
 */
export function stripPreviewPlan(
  field: readonly Note[],
  i: number,
  dev: number,
  p: PitchBase,
  kind: PreviewKind
): Planned[] {
  const f = field[i];
  if (!f) {
    return [];
  }
  const listed: Tone = { hz: absHz(p, f.c), src: i };
  const target: Tone = { hz: absHz(p, f.c - dev), src: i, markOnly: Math.abs(dev) >= 1e-6 };
  const tones = kind === 'listed' ? [listed] : kind === 'pure' ? [target] : [listed, target];
  return stepsPlan([tones], kind === 'both' ? PAIR_HOLD : 1, 0, 0.6);
}

/** Count of sounding voices per field index; `on`/`off` return true when the index's lit state changed. */
export class LightCounter {
  private readonly counts = new Map<number, number>();
  on(i: number): boolean {
    const c = this.counts.get(i) ?? 0;
    this.counts.set(i, c + 1);
    return c === 0;
  }
  off(i: number): boolean {
    const c = this.counts.get(i) ?? 0;
    if (c <= 1) {
      this.counts.delete(i);
      return c === 1;
    }
    this.counts.set(i, c - 1);
    return false;
  }
  clear(): void {
    this.counts.clear();
  }
  lit(): number[] {
    return [...this.counts.keys()];
  }
}
