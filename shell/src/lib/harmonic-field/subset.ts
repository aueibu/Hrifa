/** Subsets of a field: carrying a selection across regeneration, rotation to a mode root, nearest-ED and odd-limit picks. Pure. */
import { EPS, mod, mulNotes, oddLimit } from './intervals';
import type { Note, RelNote } from './types';

/** Indices (into the new field) to select after regenerating, matching old selected pitches within 0.01c. */
export function carrySelection(
  oldField: Note[],
  oldSelIdx: number[],
  newField: Note[],
  sameGen: boolean,
  keepNew: boolean
): Set<number> {
  const sel = new Set<number>();
  const oldSel = oldSelIdx.map((i) => oldField[i]).filter(Boolean);
  newField.forEach((n, i) => {
    if (!sameGen) {
      sel.add(i);
      return;
    }
    const was = oldSel.some((o) => Math.abs(o.c - n.c) < 0.01);
    const isNew = !oldField.some((o) => Math.abs(o.c - n.c) < 0.01);
    if (was || (isNew && keepNew)) {
      sel.add(i);
    }
  });
  return sel;
}

/** The subset as a scale starting on mode degree `mode`: notes relative to that root, wrapped into [0, repeat). */
export function rotateSubset(field: Note[], idx: number[], mode: number, rep: Note): RelNote[] {
  const N = idx.length;
  if (!N) {
    return [];
  }
  const r = mod(mode, N);
  const root = field[idx[r]];
  return idx.map((_, i) => {
    const src = idx[(r + i) % N];
    let n = mulNotes(field[src], root, -1);
    if (n.c < -EPS) {
      n = mulNotes(n, rep, 1);
    }
    return { ...n, src };
  });
}

/** For j = 0 ... m-1, pick the unused field note nearest j*repeat/m (circular distance). */
export function nearestEdSubset(field: Note[], repC: number, m: number): Set<number> {
  const sel = new Set<number>();
  for (let j = 0; j < m; j++) {
    const t = (j * repC) / m;
    let best = -1;
    let bd = Infinity;
    field.forEach((n, i) => {
      if (sel.has(i)) {
        return;
      }
      const d = Math.min(Math.abs(n.c - t), Math.abs(n.c + repC - t), Math.abs(n.c - repC - t));
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) {
      sel.add(best);
    }
  }
  return sel;
}

/** Field indices whose odd limit is at most L (irrational notes are never included). */
export function oddLimitSubset(field: Note[], limit: number | bigint): Set<number> {
  const L = BigInt(limit);
  return new Set(
    field
      .map((_, i) => i)
      .filter((i) => {
        const o = oddLimit(field[i]);
        return o != null && o <= L;
      })
  );
}
