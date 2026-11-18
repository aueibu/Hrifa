/**
 * M8d (meta ring): every ratio near one interval (any prime; the center may be a ratio or plain cents). All ratios p/q folded into
 * (1, 2) with coprime odd parts, odd limit at most `oddCap`, whose cents lie within +-spanC/2 of the center (fold-aware: a ratio
 * just under 2/1 is near one just over 1/1). Pure, no React.
 */
import { fmtRatio, passesMask, ratioNote } from './intervals';
import type { Note, PrimeMask } from './types';

export type NearOrder = 'odd' | 'tenney';

export interface NearOpts {
  /** The whole window in cents (the center is in the middle). */
  spanC: number;
  /** Largest odd limit (the larger odd part of numerator and denominator). */
  oddCap: number;
  /** Which complexity orders the result (and decides what the cap keeps). Default odd limit, ties by Tenney. */
  order?: NearOrder;
  /** Keep at most this many (default all). */
  max?: number;
  /** Prime filter (25 slots, as the generator's): a ratio is dropped when it uses a prime that is off. The center always stays. */
  mask?: PrimeMask;
}

export interface NearRatio {
  note: Note;
  /** `p/q` folded into (1, 2). */
  text: string;
  /** Cents from the center (positive = higher). */
  offsetC: number;
  /** The larger odd part of numerator and denominator. */
  odd: number;
  /** log2 of numerator times denominator of the folded ratio. */
  tenney: number;
}

export interface NearResult {
  /** In complexity order, capped at `max`. */
  items: NearRatio[];
  /** How many matched before the cap. */
  total: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** `p/q` for odd p and q folded by powers of two into [1, 2). */
function foldPair(p: number, q: number): [number, number] {
  let n = p;
  let d = q;
  while (n >= 2 * d) {
    d *= 2;
  }
  while (n < d) {
    n *= 2;
  }
  return [n, d];
}

const wrap = (x: number, period: number): number => ((x % period) + period) % period;

const cache = new Map<string, NearResult>();
const CACHE_MAX = 24;

/** Every ratio within +-spanC/2 of `center` (the center itself included when it has a ratio); empty when it has none. */
export function nearRatios(center: Note, opts: NearOpts): NearResult {
  const text = fmtRatio(center);
  const order = opts.order ?? 'odd';
  const max = opts.max ?? Infinity;
  const maskKey = opts.mask && opts.mask.some((on) => !on) ? opts.mask.map(Number).join('') : '';
  const key = `${text}|${center.c.toFixed(6)}|${opts.spanC}|${opts.oddCap}|${order}|${max}|${maskKey}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const result = compute(center, text, { ...opts, order, max });
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, result);
  return result;
}

interface Raw {
  n: number;
  d: number;
  odd: number;
  tenney: number;
  offsetC: number;
}

function compute(
  center: Note,
  centerText: string,
  opts: Required<Pick<NearOpts, 'order' | 'max'>> & NearOpts
): NearResult {
  const half = opts.spanC / 2;
  const t = wrap(center.c, 1200);
  const raws: Raw[] = [];
  const centerParts = centerText.split('/').map(Number);
  const make = (n: number, d: number, odd: number, x: number): Raw => ({
    n,
    d,
    odd,
    tenney: Math.log2(n * d),
    offsetC: wrap(x - t + 600, 1200) - 600,
  });
  let hasCenter = false;
  const filtering = !!opts.mask && opts.mask.some((on) => !on);
  for (let a = 1; a <= opts.oddCap; a += 2) {
    for (let b = 1; b <= opts.oddCap; b += 2) {
      if (a === b || gcd(a, b) !== 1) {
        continue;
      }
      const x = wrap(1200 * Math.log2(a / b), 1200);
      const off = wrap(x - t + 600, 1200) - 600;
      if (Math.abs(off) <= half + 1e-9) {
        const [n, d] = foldPair(a, b);
        if (`${n}/${d}` === centerText) {
          hasCenter = true;
        } else if (filtering && !passesMask(ratioNote(n, d), opts.mask as PrimeMask)) {
          continue;
        }
        raws.push(make(n, d, Math.max(a, b), x));
      }
    }
  }
  if (!hasCenter && centerParts.length === 2 && centerParts.every((v) => v > 0)) {
    const [n, d] = centerParts;
    const oddOf = (v: number) => {
      let m = v;
      while (m % 2 === 0) {
        m /= 2;
      }
      return m;
    };
    raws.push({ n, d, odd: Math.max(oddOf(n), oddOf(d)), tenney: Math.log2(n * d), offsetC: 0 });
  }
  const primary = opts.order === 'odd' ? 'odd' : 'tenney';
  const secondary = primary === 'odd' ? 'tenney' : 'odd';
  raws.sort((p, q) => p[primary] - q[primary] || p[secondary] - q[secondary] || p.n - q.n);
  const total = raws.length;
  const kept = raws.slice(0, opts.max);
  // the center always stays, even when the cap would drop it
  if (!kept.some((r) => `${r.n}/${r.d}` === centerText)) {
    const c = raws.find((r) => `${r.n}/${r.d}` === centerText);
    if (c) {
      kept.push(c);
    }
  }
  return {
    items: kept.map((r) => ({
      note: ratioNote(r.n, r.d),
      text: `${r.n}/${r.d}`,
      offsetC: r.offsetC,
      odd: r.odd,
      tenney: r.tenney,
    })),
    total,
  };
}
