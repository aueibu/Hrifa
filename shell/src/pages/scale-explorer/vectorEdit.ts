/** The Edit Vector tab's logic: nudge entries of the interval vector and find the set classes that result. */
import { compareRotations, type CatalogRow, type PrimeConvention } from './pitchSets';

export const IC_NAMES = ['m2 / M7', 'M2 / m7', 'm3 / M6', 'M3 / m6', 'P4 / P5', 'Tritone'];

export const ZERO_DELTAS = [0, 0, 0, 0, 0, 0];

export interface SwapMove {
  /** Interval class index 0-5. */
  i: number;
  dir: 1 | -1;
}

export interface VectorEdit {
  /** Free-edit mode: how far each entry has been pushed from the loaded vector. */
  deltas: number[];
  /** Strict-swap mode: the chosen move. */
  move: SwapMove | null;
}

export const emptyEdit = (): VectorEdit => ({ deltas: [...ZERO_DELTAS], move: null });

/** A row one swap away from `base` in the given move: entry i changes by dir, exactly one other changes the opposite way. */
export function strictOk(
  r: Pick<CatalogRow, 'icv'>,
  i: number,
  dir: number,
  base: number[]
): boolean {
  let total = 0;
  let ok = true;
  for (let q = 0; q < 6; q++) {
    const d = r.icv[q] - base[q];
    total += Math.abs(d);
    if (q === i && d !== dir) {
      ok = false;
    }
  }
  return ok && total === 2;
}

/** Whether a row's vector equals the target on every locked (edited) entry. */
export function matchesTarget(
  r: Pick<CatalogRow, 'icv'>,
  target: number[],
  locked: boolean[]
): boolean {
  for (let i = 0; i < 6; i++) {
    if (locked[i] && r.icv[i] !== target[i]) {
      return false;
    }
  }
  return true;
}

export const countMatches = (rows: CatalogRow[], target: number[], locked: boolean[]) =>
  rows.filter((r) => matchesTarget(r, target, locked)).length;

export interface StepButton {
  disabled: boolean;
  /** Count shown beside the button, or "undo". */
  ghost: string;
  /** Strict mode: this is the active move. */
  on: boolean;
  label: string;
}

/** State of the + / − button under interval class `i`. */
export function stepButton(
  rows: CatalogRow[],
  base: number[],
  edit: VectorEdit,
  strict: boolean,
  i: number,
  dir: 1 | -1
): StepButton {
  const word = dir > 0 ? 'Raise' : 'Lower';
  if (strict) {
    const count = rows.filter((r) => strictOk(r, i, dir, base)).length;
    const on = !!edit.move && edit.move.i === i && edit.move.dir === dir;
    return {
      disabled: count === 0 && !on,
      ghost: `(${count})`,
      on,
      label: `${word} interval class ${i + 1} by one and move one other the opposite way, ${count} set ${count === 1 ? 'class' : 'classes'}`,
    };
  }
  const next = [...edit.deltas];
  next[i] += dir;
  const target = base.map((v, j) => v + next[j]);
  const locked = next.map((d) => d !== 0);
  const undo = edit.deltas[i] * dir < 0;
  const count = target[i] < 0 ? 0 : countMatches(rows, target, locked);
  return {
    disabled: !undo && count === 0,
    ghost: undo ? 'undo' : `(${count})`,
    on: false,
    label: `${word} interval class ${i + 1} to ${target[i]}${
      undo ? ', undoing an edit' : `, ${count} set ${count === 1 ? 'class' : 'classes'}`
    }`,
  };
}

export type MatchRow = CatalogRow & { dist: number };

export interface EditResult {
  /** Whether any edit has been made (so there is something to show). */
  any: boolean;
  target: number[];
  locked: boolean[];
  matches: MatchRow[];
}

/** Total entry-by-entry distance between a row's vector and the loaded one. */
export const vectorDistance = (icv: number[], base: number[]) =>
  icv.reduce((sum, v, q) => sum + Math.abs(v - base[q]), 0);

/** The set classes matching the current edit, closest to the loaded vector first. */
export function editResult(
  rows: CatalogRow[],
  base: number[],
  edit: VectorEdit,
  strict: boolean,
  conv: PrimeConvention
): EditResult {
  let target = base.map((v, i) => v + edit.deltas[i]);
  let locked = edit.deltas.map((d) => d !== 0);
  const any = strict ? !!edit.move : locked.some(Boolean);
  if (!any) {
    return { any, target, locked, matches: [] };
  }
  let found: CatalogRow[];
  if (strict && edit.move) {
    const { i, dir } = edit.move;
    locked = locked.map((_, q) => q === i);
    target = [...base];
    found = rows.filter((r) => strictOk(r, i, dir, base));
  } else {
    found = rows.filter((r) => matchesTarget(r, target, locked));
  }
  const matches = found
    .map((r) => ({ ...r, dist: vectorDistance(r.icv, base) }))
    .sort((a, b) => a.dist - b.dist || compareRotations(a.z, b.z, conv));
  return { any, target, locked, matches };
}
