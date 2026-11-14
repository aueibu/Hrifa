/**
 * What to play, as plain data: the Hz and the field note each sound belongs to (so the page can light it). Pure; the
 * hook in `useLabAudio.ts` hands these plans to the voice engine.
 */
import type { Note, RelNote } from '../../../lib/harmonic-field';
import { chordAmp, hzOf } from './engine';
import { slotTarget } from './keymap';

export interface Planned {
  hz: number;
  /** Field index of the note (lights in every view while it sounds). */
  src: number;
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
