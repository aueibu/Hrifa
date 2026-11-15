/**
 * Fill cards (M7c): candidate retuner cards from the current tab, as pure helpers. Three sources, each on its own:
 * the modes of the current subset, the keys that fit the field completely (the Keys panel's transpositions), and the
 * subsets of the tab's generator. Every candidate is a whole tab snapshot built with `cardFromTab`; duplicates are
 * removed (same notes in cents to 0.01 c at the same root, across and within sources, and against the existing cards);
 * each candidate is tagged "retuned notes" (card 0's notes within a comma) or "different notes" (it substitutes notes).
 * No React, no storage. The reducer is unchanged: Apply sends each checked card through `ret/add`.
 */
import {
  resolveSubset,
  type NamedPitchSet,
  type Note,
  type Transposition,
} from '../../../lib/harmonic-field';
import { MAX_MODES, noteLabel } from './derive';
import { fixMode, type Tab } from './labState';
import { MAX_CARDS, type RetCard } from './retuner';
import { cardFromTab } from './retunerCards';

export type FillSource = 'modes' | 'keys' | 'subsets';
export const FILL_SOURCES: readonly FillSource[] = ['modes', 'keys', 'subsets'];
export type FillTag = 'retuned' | 'different';

/** A degree within this many cents of home's degree counts as "retuned" (a comma-sized change; the syntonic comma is 21.5 c). */
export const RETUNED_TOL_C = 30;
/** Notes in cents and the root are the same within this many cents. */
export const SAME_CARD_C = 0.01;
/** Most candidates one source adds (a guard for huge fields). */
export const MAX_FILL_CANDIDATES = 400;

export interface FillCandidate {
  /** Stable while the card stays a candidate of its source (source + notes), so a row's check survives a source change. */
  key: string;
  source: FillSource;
  card: RetCard;
  tag: FillTag;
}

export interface FillInput {
  tab: Tab;
  /** The Keys panel's transpositions of the subset (null when it is over the size cap). */
  keys: readonly Transposition[] | null;
  /** The subsets of the tab's generator (empty when it has no owner). */
  subsets: readonly NamedPitchSet[];
  /** The list now: live cards (card 0 is home) and the count of stored dormant cards. */
  cards: readonly RetCard[];
  dormant: number;
  /** Relative playback: a card's root matters. In Parallel every card starts on 1/1, so only the intervals do. Default true. */
  relative?: boolean;
}

const sig = (c: Pick<RetCard, 'notes' | 'root'>, relative = true): string =>
  `${relative ? Math.round(c.root.c * 100) : 0}|${c.notes.map((n) => Math.round(n.c * 100)).join(',')}`;

/** True when both cards have the same note list in cents (to 0.01 c) at the same root (the root only counts in Relative). */
export const sameCard = (
  a: Pick<RetCard, 'notes' | 'root'>,
  b: Pick<RetCard, 'notes' | 'root'>,
  relative = true
) =>
  a.notes.length === b.notes.length &&
  (!relative || Math.abs(a.root.c - b.root.c) < SAME_CARD_C) &&
  a.notes.every((n, i) => Math.abs(n.c - b.notes[i].c) < SAME_CARD_C);

/** Circular distance in cents round a repeat of `rep` cents. */
const circ = (d: number, rep: number): number => {
  const x = Math.abs(d) % rep;
  return rep > 0 ? Math.min(x, rep - x) : Math.abs(d);
};

/**
 * "retuned" when, degree by degree against `home`, the card has the same number of notes and every degree is within
 * `RETUNED_TOL_C` of home's degree; else "different" (it substitutes notes, e.g. a mode).
 */
export function tagOf(
  card: Pick<RetCard, 'notes'>,
  home: Pick<RetCard, 'notes' | 'rep'>,
  tol = RETUNED_TOL_C
): FillTag {
  if (card.notes.length !== home.notes.length) {
    return 'different';
  }
  const rep = home.rep.c;
  return card.notes.every((n, i) => circ(n.c - home.notes[i].c, rep) <= tol)
    ? 'retuned'
    : 'different';
}

const clone = (n: Note): Note => ({ m: n.m ? { ...n.m } : null, c: n.c });

/** Mode cards: the subset read from each of its notes as the root; "Mode 1" is the lowest note (as the Modes panel numbers them). */
function modeCards(tab: Tab): { name: string; card: RetCard }[] {
  const n = tab.sel.length;
  if (n === 0 || n > MAX_MODES) {
    return [];
  }
  const out: { name: string; card: RetCard }[] = [];
  for (let j = 0; j < n; j++) {
    const card = cardFromTab({ ...tab, mode: j });
    if (card) {
      out.push({ name: `Mode ${j + 1}`, card });
    }
  }
  return out;
}

/** Key cards: each complete transposition as its found notes, its root the mode root. */
function keyCards(tab: Tab, keys: readonly Transposition[] | null) {
  const out: { name: string; card: RetCard }[] = [];
  for (const k of keys ?? []) {
    if (!k.complete) {
      continue;
    }
    const sel = [...new Set(k.idx.filter((i): i is number => i !== null))].sort((a, b) => a - b);
    const card = cardFromTab({ ...tab, sel, mode: Math.max(0, sel.indexOf(k.root)) });
    if (card) {
      out.push({ name: `Key on ${noteLabel(tab.field[k.root])}`, card });
    }
    if (out.length >= MAX_FILL_CANDIDATES) {
      break;
    }
  }
  return out;
}

/** Subset cards: each stored subset resolved against the tab's field (no match at all: skipped). */
function subsetCards(tab: Tab, subsets: readonly NamedPitchSet[]) {
  const out: { name: string; card: RetCard }[] = [];
  for (const s of subsets) {
    const r = resolveSubset(tab.field, { pitches: s.pitches.map(clone), root: s.root });
    if (r.sel.length === 0) {
      continue;
    }
    const card = cardFromTab({ ...tab, sel: r.sel, mode: fixMode(r.mode, r.sel.length) });
    if (card) {
      out.push({ name: s.name, card });
    }
    if (out.length >= MAX_FILL_CANDIDATES) {
      break;
    }
  }
  return out;
}

/** A name not in `taken` (suffix " 2", " 3", ... when needed); adds it to `taken`. */
function uniqueName(name: string, taken: Set<string>): string {
  const base = name.replace(/\s+/g, ' ').trim().slice(0, 56) || 'Card';
  let out = base;
  for (let i = 2; taken.has(out.toLowerCase()); i++) {
    out = `${base} ${i}`;
  }
  taken.add(out.toLowerCase());
  return out;
}

/**
 * The candidates for the checked sources, in source order (modes, keys, subsets), duplicates removed (the first source's
 * name wins) and anything equal to an existing card dropped. Tags compare with card 0 (the tab's own card when the list
 * is empty).
 */
export function fillCandidates(
  input: FillInput,
  sources: ReadonlySet<FillSource>
): FillCandidate[] {
  const { tab, cards } = input;
  const home = cards[0] ?? cardFromTab(tab);
  if (!home) {
    return [];
  }
  const rel = input.relative ?? true;
  const seen = new Set(cards.map((c) => sig(c, rel)));
  const taken = new Set(cards.map((c) => c.name.toLowerCase()));
  const out: FillCandidate[] = [];
  const add = (source: FillSource, list: { name: string; card: RetCard }[]) => {
    for (const { name, card } of list) {
      const s = sig(card, rel);
      if (seen.has(s) || cards.some((c) => sameCard(c, card, rel))) {
        continue;
      }
      seen.add(s);
      out.push({
        key: `${source}|${s}`,
        source,
        card: { ...card, name: uniqueName(name, taken) },
        tag: tagOf(card, home),
      });
    }
  };
  if (sources.has('modes')) {
    add('modes', modeCards(tab));
  }
  if (sources.has('keys')) {
    add('keys', keyCards(tab, input.keys));
  }
  if (sources.has('subsets')) {
    add('subsets', subsetCards(tab, input.subsets));
  }
  return out;
}

export interface FillPlan {
  /** The checked candidates that fit, in list order: what Apply adds. */
  add: FillCandidate[];
  /** How many checked candidates do not fit under the card cap. */
  over: number;
  /** Free places (the cap counts stored dormant cards too). */
  room: number;
}

/** What Apply adds: the checked candidates in list order up to the cap (live + dormant + new <= MAX_CARDS). */
export function planFill(
  candidates: readonly FillCandidate[],
  checked: ReadonlySet<string>,
  live: number,
  dormant: number
): FillPlan {
  const room = Math.max(0, MAX_CARDS - live - dormant);
  const picked = candidates.filter((c) => checked.has(c.key));
  return { add: picked.slice(0, room), over: Math.max(0, picked.length - room), room };
}

/** "3 cards will be added; 2 would exceed the 24-card limit." */
export function planText(p: FillPlan): string {
  const n = p.add.length;
  const head = `${n} ${n === 1 ? 'card' : 'cards'} will be added`;
  return p.over > 0 ? `${head}; ${p.over} would exceed the ${MAX_CARDS}-card limit.` : `${head}.`;
}

/** Why a source is unavailable, or null. */
export function sourceBlocker(
  source: FillSource,
  input: FillInput,
  hasOwner: boolean
): string | null {
  const n = input.tab.sel.length;
  if (n === 0) {
    return 'Select some notes in the tab first.';
  }
  if (source === 'modes' && n > MAX_MODES) {
    return `Too many notes (more than ${MAX_MODES}) to list every mode.`;
  }
  if (source === 'keys' && input.keys === null) {
    return 'The Keys panel is over its size limit for this field.';
  }
  if (source === 'subsets') {
    if (!hasOwner) {
      return 'This tab’s generator is not saved, so it has no subsets.';
    }
    if (input.subsets.length === 0) {
      return 'This generator has no saved subsets yet.';
    }
  }
  return null;
}
