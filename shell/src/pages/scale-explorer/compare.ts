/** Logic behind the Compare tab: the metrics, histogram bins, rank, filter, and row sorting. */
import { fmt, sgn1 } from './format';
import {
  compareRotations,
  icvText,
  keyOf,
  pickRep,
  type CatalogRow,
  type PrimeConvention,
} from './pitchSets';

export type MetricKey =
  | 'hem'
  | 'coh'
  | 'ratio'
  | 'fr'
  | 'rve'
  | 'zsz'
  | 'modes'
  | 'p5'
  | 'chain'
  | 'rp5';

export interface Metric {
  k: MetricKey;
  label: string;
  format: (v: number) => string;
  tip?: 'rve' | 'zs';
}

const plain = (v: number) => String(v);

export const METRICS: Metric[] = [
  { k: 'hem', label: 'Hemitonia', format: plain },
  { k: 'coh', label: 'Cohemitonia', format: plain },
  { k: 'ratio', label: 'Chaining (Coh ÷ Hem)', format: fmt },
  { k: 'fr', label: 'Fifths Brightness Range', format: plain },
  { k: 'rve', label: 'Range vs Expected', format: sgn1, tip: 'rve' },
  { k: 'zsz', label: 'Range vs Size Average', format: sgn1, tip: 'zs' },
  { k: 'modes', label: 'Distinct Modes', format: plain },
  { k: 'p5', label: 'Notes with a P5 Above', format: plain },
  { k: 'chain', label: 'Longest Fifth Chain', format: plain },
  { k: 'rp5', label: 'Modes with a P5 on the Root', format: plain },
];

export const metricValue = (row: CatalogRow, k: MetricKey): number | null => row[k];

export interface Bar {
  lo: number;
  hi: number;
  count: number;
  label: string;
}

export interface Histogram {
  bars: Bar[];
  /** One bar per distinct value (as opposed to twelve equal-width bins). */
  exact: boolean;
}

/** One bar per distinct value when there are at most 14 of them, otherwise 12 equal-width bins. */
export function histogramBars(vals: number[], format: (v: number) => string): Histogram {
  const distinct = [...new Set(vals)].sort((a, b) => a - b);
  if (distinct.length <= 14) {
    const bars: Bar[] = distinct.map((v) => ({ lo: v, hi: v, count: 0, label: format(v) }));
    vals.forEach((v) => {
      bars[distinct.indexOf(v)].count++;
    });
    return { bars, exact: true };
  }
  const mn = distinct[0];
  const mx = distinct[distinct.length - 1];
  const nb = 12;
  const w = (mx - mn) / nb;
  const bars: Bar[] = Array.from({ length: nb }, (_, i) => ({
    lo: mn + i * w,
    hi: mn + (i + 1) * w,
    count: 0,
    label: '',
  }));
  vals.forEach((v) => {
    bars[Math.min(nb - 1, Math.floor((v - mn) / w))].count++;
  });
  bars[0].label = format(mn);
  bars[nb - 1].label = format(mx);
  return { bars, exact: false };
}

/** Whether a bar contains the current set's value. */
export function barHasValue(h: Histogram, k: number, cur: number | null): boolean {
  if (cur === null) {
    return false;
  }
  const b = h.bars[k];
  return h.exact ? b.lo === cur : cur >= b.lo && (cur < b.hi || k === h.bars.length - 1);
}

/** Whether the bar's tick label should be drawn (thinned out when there are many bars). */
export function showBarLabel(h: Histogram, k: number): boolean {
  const b = h.bars[k];
  return (
    b.label !== '' && (h.bars.length <= 8 || k % 2 === 0 || (k === h.bars.length - 1 && !h.exact))
  );
}

export interface BinFilter {
  k: MetricKey;
  lo: number;
  hi: number;
  /** An exact-value bar (compare with equality) rather than a range. */
  ex: boolean;
  /** The last bar includes its upper edge. */
  last: boolean;
}

export function inBin(v: number, f: BinFilter): boolean {
  return f.ex
    ? Math.abs(v - f.lo) < 1e-9
    : v >= f.lo - 1e-9 && (v < f.hi - 1e-9 || (f.last && v <= f.hi + 1e-9));
}

export const sameBin = (a: BinFilter | null, b: BinFilter) =>
  !!a && a.k === b.k && Math.abs(a.lo - b.lo) < 1e-9 && Math.abs(a.hi - b.hi) < 1e-9;

export interface Rank {
  /** 1-based, counting ties as sharing the better place. */
  place: number;
  total: number;
  tied: number;
  lower: number;
  equal: number;
  higher: number;
}

export function rankOf(vals: number[], v: number, direction: 'high' | 'low'): Rank {
  let lower = 0;
  let equal = 0;
  let higher = 0;
  vals.forEach((x) => {
    if (x < v - 1e-9) {
      lower++;
    } else if (x > v + 1e-9) {
      higher++;
    } else {
      equal++;
    }
  });
  return {
    place: (direction === 'high' ? higher : lower) + 1,
    total: vals.length,
    tied: equal - 1,
    lower,
    equal,
    higher,
  };
}

/** The catalog row for the loaded set, if its size matches the catalog's. */
export function currentRow(
  rows: CatalogRow[],
  selection: number[],
  size: number,
  merge: boolean,
  conv: PrimeConvention
): CatalogRow | null {
  if (selection.length !== size) {
    return null;
  }
  const key = keyOf(pickRep(selection, merge, conv).rep);
  return rows.find((r) => r.key === key) ?? null;
}

export type SortKey =
  | 'rep'
  | 'forte'
  | 'hem'
  | 'coh'
  | 'ratio'
  | 'run'
  | 'modes'
  | 'fr'
  | 'rve'
  | 'zsz'
  | 'icv'
  | 'p5'
  | 'chain'
  | 'rp5';

export const COLUMNS: { k: SortKey; label: string; tip?: 'rve' | 'zs' }[] = [
  { k: 'rep', label: 'Set' },
  { k: 'forte', label: 'Forte' },
  { k: 'hem', label: 'Hem' },
  { k: 'coh', label: 'Coh' },
  { k: 'ratio', label: 'Chaining' },
  { k: 'run', label: 'Run' },
  { k: 'modes', label: 'Modes' },
  { k: 'fr', label: 'Fifths Range' },
  { k: 'rve', label: 'Range vs Expected', tip: 'rve' },
  { k: 'zsz', label: 'Range vs Size Average', tip: 'zs' },
  { k: 'icv', label: 'Interval Vector' },
  { k: 'p5', label: 'P5s' },
  { k: 'chain', label: 'Fifth Chain' },
  { k: 'rp5', label: 'Root P5' },
];

export function sortRows(
  rows: CatalogRow[],
  col: SortKey | string,
  dir: 1 | -1,
  conv: PrimeConvention
): CatalogRow[] {
  return [...rows].sort((a, b) => {
    let d: number;
    if (col === 'rep') {
      d = compareRotations(a.z, b.z, conv);
    } else if (col === 'forte') {
      d = a.forteOrder - b.forteOrder;
    } else if (col === 'icv') {
      const x = icvText(a.icv);
      const y = icvText(b.icv);
      d = x < y ? -1 : x > y ? 1 : 0;
    } else {
      d =
        ((a as unknown as Record<string, number>)[col] ?? 0) -
        ((b as unknown as Record<string, number>)[col] ?? 0);
    }
    return d * dir || compareRotations(a.z, b.z, conv);
  });
}
