/**
 * Dynamic retuner engine (behavioural parity with Infinitone 2's Auto Retuner, see README "Retuner").
 * Pure: no audio, no DOM. A "card" is a scale with a base pitch; the engine keeps a pivot note fixed, re-roots the
 * cards around it, predicts the held chord in each card, scores each prediction and picks the best card.
 */
import { mAdd, mCents, mulNotes } from './intervals';
import { scorePeriodicityInfinitone, type ScoreResult } from './scorers';
import type { Note } from './types';

/** A pitch in cents above the reference pitch (`refHz`), with the exact monzo when known. Same shape as a Note. */
export type Base = Pick<Note, 'm' | 'c'>;

export interface RetunerCard {
  name: string;
  /** Degrees above the card's root, in cents order; `notes[0]` is the root (1/1). */
  notes: Note[];
  /** The repeat (period) of the scale, e.g. 2/1. */
  rep: Note;
  /** Where the card's root sits now (cents above `refHz`). Exact monzo when possible so drift shows as a ratio. */
  base: Base;
  /** Optional: where the card started. Drift is measured against it (default: the base passed to the step). */
  home?: Base;
}

export type PivotMode = 'manual' | 'lowest' | 'highest' | 'recent' | 'longest';
export type Anchor = 'freestyle' | 'fixed';

/** A held key. `deg`/`oct` are in the ACTIVE card; `key` is the keyboard note number; `t` is the note-on time. */
export interface HeldNote {
  key: number;
  deg: number;
  oct: number;
  t: number;
}

/** Reference pitch (middle C): `base.c = 0` means this frequency. */
export const REF_HZ = 261.6255653005986;
/** Score given to an empty or impossible prediction (Infinitone's value). */
export const EMPTY_SCORE = 999999;

const hzOf = (c: number, refHz: number) => refHz * 2 ** (c / 1200);

/**
 * Pivot choice. Lowest/Highest = smallest/largest key number, Recent = latest `t`, Longest = earliest `t`. Ties (same
 * `t`) go to the lower key. Manual returns `null` (the user sets the degree). An empty held set gives `null`.
 */
export function pickPivot<T extends HeldNote>(held: readonly T[], mode: PivotMode): T | null {
  if (mode === 'manual' || held.length === 0) {
    return null;
  }
  let best: T = held[0];
  for (const h of held.slice(1)) {
    let better: boolean;
    switch (mode) {
      case 'lowest':
        better = h.key < best.key;
        break;
      case 'highest':
        better = h.key > best.key;
        break;
      case 'recent':
        better = h.t > best.t || (h.t === best.t && h.key < best.key);
        break;
      default:
        better = h.t < best.t || (h.t === best.t && h.key < best.key);
    }
    if (better) {
      best = h;
    }
  }
  return best;
}

/** The degree of `card` whose pitch equals `cents` above the card's root (reduced into the repeat), or `null`. */
export function degreeOf(
  card: Pick<RetunerCard, 'notes' | 'rep'>,
  cents: number,
  tolCents = 0.02
): { deg: number; oct: number } | null {
  const rc = card.rep.c;
  const oct = Math.floor(cents / rc + 1e-9);
  const r = cents - oct * rc;
  for (let i = 0; i < card.notes.length; i++) {
    if (Math.abs(card.notes[i].c - r) < tolCents) {
      return { deg: i, oct };
    }
  }
  if (Math.abs(rc - r) < tolCents) {
    return { deg: 0, oct: oct + 1 };
  }
  return null;
}

/**
 * Nearest degree of `card` to a frequency. `hz` is reduced into the repeat above the card's root (`refHz` and
 * `card.base` give the root's Hz). Metric 'ratio' (Infinitone, default) compares linear frequency ratios inside the
 * repeat and never wraps (assumed: unknown whether Infinitone cards include 2/1); 'cents' compares cents and may wrap to degree 0 of the next repeat. Ties: lowest degree.
 */
export function nearestDegree(
  card: Pick<RetunerCard, 'notes' | 'rep' | 'base'>,
  hz: number,
  opts: { metric?: 'ratio' | 'cents'; refHz?: number } = {}
): { deg: number; oct: number } {
  const { metric = 'ratio', refHz = REF_HZ } = opts;
  const x = hz / hzOf(card.base.c, refHz);
  const lr = (Math.LN2 * card.rep.c) / 1200;
  const oct = Math.floor(Math.log(x) / lr + 1e-9);
  const xc = card.rep.c * (Math.log(x) / lr - oct);
  let best = 0;
  let bestD = Infinity;
  card.notes.forEach((n, i) => {
    const d =
      metric === 'ratio' ? Math.abs(2 ** (n.c / 1200) - 2 ** (xc / 1200)) : Math.abs(n.c - xc);
    if (d < bestD - 1e-12) {
      best = i;
      bestD = d;
    }
  });
  if (metric === 'cents' && Math.abs(card.rep.c - xc) < bestD - 1e-12) {
    return { deg: 0, oct: oct + 1 };
  }
  return { deg: best, oct };
}

/** base(C) = base(R) + R.notes[D] - C.notes[D] (in cents; a product of ratios), exact when every part is exact. */
function rerootOne(ref: RetunerCard, card: RetunerCard, D: number): Base {
  const t = mulNotes(mulNotes(ref.base as Note, ref.notes[D]), card.notes[D], -1);
  return { m: t.m, c: t.m ? mCents(t.m) : t.c };
}

/**
 * Re-root every card so the pivot degree `D` keeps the pitch it has in the reference card `refIdx`:
 * `base(C) = base(R) * ratio_R[D] / ratio_C[D]`. The reference keeps its base. A card that has no degree `D` cannot be
 * re-rooted: its entry is `null`.
 */
export function rerootCards(
  cards: readonly RetunerCard[],
  refIdx: number,
  D: number
): (Base | null)[] {
  const ref = cards[refIdx];
  return cards.map((c, i) => {
    if (i === refIdx) {
      return { m: c.base.m, c: c.base.c };
    }
    if (!ref || D < 0 || D >= ref.notes.length || D >= c.notes.length) {
      return null;
    }
    return rerootOne(ref, c, D);
  });
}

export interface RetunerState {
  cards: readonly RetunerCard[];
  /** Index of the card currently sounding. */
  active: number;
  held: readonly HeldNote[];
}

/** Scores a predicted chord (Hz). Receives the card index too (tests use it; real scorers ignore it). */
export type RetuneScorer = (freqsHz: number[], cardIndex: number) => ScoreResult | number;

export interface RetuneOpts {
  pivotMode?: PivotMode;
  /** Manual mode: the pivot degree, chosen by the user; it need not be held. Wins over `manualKey`. */
  manualDeg?: number;
  /** Manual mode alternative: key of a held note whose degree is the pivot (used only when `manualDeg` is absent). */
  manualKey?: number;
  anchor?: Anchor;
  /** Default: the Infinitone-parity periodicity scorer. */
  scorer?: RetuneScorer;
  refHz?: number;
}

export interface RetuneWhyEntry {
  card: number;
  name: string;
  /** False when the card was not a candidate (Fixed card 0, or it lacks a degree the chord needs). */
  eligible: boolean;
  base: Base;
  /** The held chord as this card would play it (Hz, in held order). */
  predicted: number[];
  score: number;
  detail?: Record<string, unknown>;
  /** 1 = best. `null` when not eligible. */
  rank: number | null;
  chosen: boolean;
}

export interface RetuneWhy {
  /** `key` is absent when the pivot is a user-chosen degree (Manual) rather than a held note. */
  pivot: { key?: number; deg: number; mode: PivotMode } | null;
  reference: number;
  anchor: Anchor;
  tieBreak: 'lowest index';
  /** Why nothing changed, when it did not. */
  reason?: string;
  entries: RetuneWhyEntry[];
}

export interface RetuneResult {
  /** New base of every card (unchanged where not re-rooted). */
  bases: Base[];
  /** Predicted chord per card in Hz (empty for non-candidates). */
  predictions: number[][];
  scores: number[];
  chosen: number;
  /** New base of the chosen card minus its `home` (or its pre-step base): `m` is the comma as a monzo. */
  drift: Base;
  why: RetuneWhy;
}

const asResult = (r: ScoreResult | number): ScoreResult =>
  typeof r === 'number' ? { score: r } : r;

function subBase(a: Base, b: Base): Base {
  if (a.m && b.m) {
    const m = mAdd(a.m, b.m, -1);
    return { m, c: mCents(m) };
  }
  return { m: null, c: a.c - b.c };
}

const ZERO: Base = { m: {}, c: 0 };

/**
 * One retune: pick the pivot, re-root (reference = active card in Freestyle, card 0 in Fixed), predict the held
 * chord in every candidate card (Fixed: card 0 is never a candidate), score, choose the lowest score (ties: lowest
 * index). With no pivot (Manual with neither `manualDeg` nor a held `manualKey`, or nothing held) or no candidate, the active card is kept.
 */
export function retuneStep(state: RetunerState, opts: RetuneOpts = {}): RetuneResult {
  const {
    pivotMode = 'longest',
    manualDeg,
    manualKey,
    anchor = 'freestyle',
    scorer = (f: number[]) => scorePeriodicityInfinitone(f),
    refHz = REF_HZ,
  } = opts;
  const { cards, active, held } = state;
  const ref = anchor === 'fixed' ? 0 : active;
  let pv: { key?: number; deg: number } | null;
  if (pivotMode === 'manual') {
    const byKey = held.find((h) => h.key === manualKey);
    pv =
      manualDeg !== undefined
        ? { deg: manualDeg }
        : byKey
          ? { key: byKey.key, deg: byKey.deg }
          : null;
  } else {
    pv = pickPivot(held, pivotMode);
  }
  const noMove = (reason: string): RetuneResult => {
    const bases = cards.map((c) => ({ m: c.base.m, c: c.base.c }));
    const cur = bases[active] ?? ZERO;
    return {
      bases,
      predictions: cards.map(() => []),
      scores: cards.map(() => EMPTY_SCORE),
      chosen: active,
      drift: subBase(cur, cards[active]?.home ?? cur),
      why: {
        pivot: pv
          ? { ...(pv.key !== undefined && { key: pv.key }), deg: pv.deg, mode: pivotMode }
          : null,
        reference: ref,
        anchor,
        tieBreak: 'lowest index',
        reason,
        entries: cards.map((c, i) => ({
          card: i,
          name: c.name,
          eligible: false,
          base: bases[i],
          predicted: [],
          score: EMPTY_SCORE,
          rank: null,
          chosen: i === active,
        })),
      },
    };
  };
  if (cards.length === 0 || held.length === 0 || !pv) {
    return noMove(held.length === 0 ? 'nothing held' : 'no pivot');
  }
  const newBases = rerootCards(cards, ref, pv.deg);
  const predictions: number[][] = [];
  const scores: number[] = [];
  const details: (Record<string, unknown> | undefined)[] = [];
  const eligible: boolean[] = [];
  cards.forEach((c, i) => {
    const nb = newBases[i];
    const ok =
      nb !== null &&
      !(anchor === 'fixed' && i === 0) &&
      held.every((h) => h.deg >= 0 && h.deg < c.notes.length);
    eligible.push(ok);
    if (!ok || !nb) {
      predictions.push([]);
      scores.push(EMPTY_SCORE);
      details.push(undefined);
      return;
    }
    const freqs = held.map((h) => hzOf(nb.c + c.notes[h.deg].c + h.oct * c.rep.c, refHz));
    const raw = asResult(scorer(freqs, i));
    const r = Number.isFinite(raw.score) ? raw : { ...raw, score: EMPTY_SCORE };
    predictions.push(freqs);
    scores.push(r.score);
    details.push(r.detail);
  });
  let chosen = -1;
  for (let i = 0; i < cards.length; i++) {
    if (eligible[i] && (chosen < 0 || scores[i] < scores[chosen])) {
      chosen = i;
    }
  }
  if (chosen < 0) {
    return noMove('no candidate card');
  }
  const bases: Base[] = cards.map((c, i) => newBases[i] ?? { m: c.base.m, c: c.base.c });
  const order = cards.map((_, i) => i).filter((i) => eligible[i]);
  order.sort((a, b) => scores[a] - scores[b] || a - b);
  return {
    bases,
    predictions,
    scores,
    chosen,
    drift: subBase(bases[chosen], cards[chosen].home ?? cards[chosen].base),
    why: {
      pivot: { ...(pv.key !== undefined && { key: pv.key }), deg: pv.deg, mode: pivotMode },
      reference: ref,
      anchor,
      tieBreak: 'lowest index',
      entries: cards.map((c, i) => ({
        card: i,
        name: c.name,
        eligible: eligible[i],
        base: bases[i],
        predicted: predictions[i],
        score: scores[i],
        detail: details[i],
        rank: eligible[i] ? order.indexOf(i) + 1 : null,
        chosen: i === chosen,
      })),
    },
  };
}
