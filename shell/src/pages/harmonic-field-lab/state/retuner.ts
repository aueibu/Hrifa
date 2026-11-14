/**
 * The retuner's lab state (M7): the card list, its settings, and the run (active card, card roots, held keys, the last
 * "why" result), as a pure reducer slice. No React, no DOM, no storage (persist.ts) and no audio (useLabAudio.ts).
 *
 * A card is a whole tab snapshot (`snap`: generation inputs, subset, mode, so the notes the engine needs are derived
 * from it and M8's shelf can restore the source) plus the derived `notes` / `rep` the engine reads. Only `{ name, snap }`
 * is stored (`...retuner.v1`). While the retuner is on, a computer or dock key is a degree of the ACTIVE card
 * (slot i = degree i mod N, floor(i / N) repeats up); with Auto and two or more keys held, every key-down runs
 * `retuneStep` and the held voices glide to the chosen card's pitches (the audio hook reads `heldHz`).
 */
import {
  REF_HZ,
  fmtRatio,
  mAdd,
  mCents,
  retuneStep,
  scoreLattice,
  scorePeriodicityFair,
  scorePeriodicityInfinitone,
  scoreRoughness,
  type Anchor,
  type Base,
  type HeldNote,
  type Note,
  type PivotMode,
  type RetuneResult,
  type RetuneScorer,
  type RetunerCard,
} from '../../../lib/harmonic-field';
import { slotTarget } from '../audio/keymap';
import type { Snapshot } from './persist';

export const MAX_CARDS = 24;
export const MAX_LOG = 24;
export const MAX_GLIDE_MS = 5000;

export const PIVOT_MODES: readonly PivotMode[] = [
  'manual',
  'lowest',
  'highest',
  'recent',
  'longest',
];
export const ANCHORS: readonly Anchor[] = ['freestyle', 'fixed'];
export const TRIGGERS = ['auto', 'manual'] as const;
export type Trigger = (typeof TRIGGERS)[number];
export const SCORER_IDS = ['roughness', 'lattice', 'fair', 'infinitone'] as const;
export type ScorerId = (typeof SCORER_IDS)[number];
export const SCORER_NAMES: Record<ScorerId, string> = {
  roughness: 'Roughness (Sethares)',
  lattice: 'Lattice distance',
  fair: 'Pitch-fair periodicity',
  infinitone: 'Infinitone parity',
};

/** Options of the scorers that have any: roughness (partials, rolloff) and lattice (odd limit). */
export interface ScorerOpts {
  harmonics: number;
  rolloff: number;
  oddLimit: number;
}

export interface RetSettings {
  pivot: PivotMode;
  /** The pivot degree of the Manual pivot (it need not be held), 0-based as in the engine. */
  manualDeg: number;
  anchor: Anchor;
  trigger: Trigger;
  scorer: ScorerId;
  scorerOpts: ScorerOpts;
  glideMs: number;
}

export const defaultRetSettings = (): RetSettings => ({
  pivot: 'longest',
  manualDeg: 0,
  anchor: 'freestyle',
  trigger: 'auto',
  scorer: 'roughness',
  scorerOpts: { harmonics: 7, rolloff: 0.88, oddLimit: 9 },
  glideMs: 120,
});

/** What is stored of a card. */
export interface RetCardSpec {
  name: string;
  snap: Snapshot;
}
/** A card in the state: the stored part plus what the engine reads (derived from `snap`). */
export interface RetCard extends RetCardSpec {
  /** Runtime identity (never stored; new at restore): keeps a row's pending edit on its own card when the list changes. */
  id: string;
  /** Degrees above the card's root (the subset read from its mode root); `notes[0]` is the root. */
  notes: Note[];
  rep: Note;
  /** Where the card's mode root sits above 1/1 (exact monzo when known): its start in Relative playback. */
  root: Base;
}

let cardSeq = 0;
/** A fresh runtime card id. */
export const newCardId = (): string => `rc${++cardSeq}`;

/** A stored card the page cannot play now (its inputs no longer build, or select nothing): carried and written back. */
export interface DormantCard {
  /** Its position in the stored list. */
  at: number;
  spec: RetCardSpec;
}

/** A held key: `key` is the dock slot, `deg`/`oct` are in the active card when it went down. */
export type RetHeld = HeldNote;

export interface RetLogEntry {
  step: number;
  held: RetHeld[];
  chosen: number;
  chosenName: string;
  /** Drift of the chosen card against its home, after this step. */
  drift: Base;
}

export interface RetLast {
  result: RetuneResult;
  /** The keys the step ran on. */
  held: RetHeld[];
  step: number;
}

export interface RetState {
  cards: RetCard[];
  /** Stored cards that cannot play; never shown, never dropped: a save writes them back in place (`storedCards`). */
  dormant: DormantCard[];
  settings: RetSettings;
  /** Parallel | Relative playback (mirrors `ui.modePlayback`): where the cards start. */
  relative: boolean;
  /** Transient (never stored): the retuner takes over the keys. */
  on: boolean;
  /** The card that sounds now (index into `cards`). */
  active: number;
  /** Where every card's root sits now (cents above 1/1 Hz, exact monzo while JI). Index-parallel to `cards`. */
  bases: Base[];
  held: RetHeld[];
  last: RetLast | null;
  log: RetLogEntry[];
}

/** Parallel: every card starts with its root on 1/1 Hz. */
export const HOME_BASE: Base = { m: {}, c: 0 };

/**
 * Where a card starts, and what its drift is measured against. Parallel: its root on 1/1 Hz. Relative (the one switch,
 * `ui.modePlayback`, as `relHz` applies it to the keys and Play scale): its root at its own mode root's pitch above 1/1.
 */
export const startBase = (c: Pick<RetCard, 'root'>, relative: boolean): Base =>
  relative ? { m: c.root.m, c: c.root.c } : HOME_BASE;

export const initialRetuner = (
  cards: RetCard[] = [],
  settings: RetSettings = defaultRetSettings(),
  dormant: DormantCard[] = [],
  relative = false
): RetState => ({
  cards,
  dormant,
  settings,
  relative,
  on: false,
  active: 0,
  bases: cards.map((c) => startBase(c, relative)),
  held: [],
  last: null,
  log: [],
});

/** What a save writes: the live cards with the dormant ones put back at their stored positions. */
export function storedCards(r: Pick<RetState, 'cards' | 'dormant'>): RetCardSpec[] {
  const out: RetCardSpec[] = r.cards.map((c) => ({ name: c.name, snap: c.snap }));
  for (const d of [...r.dormant].sort((a, b) => a.at - b.at)) {
    out.splice(Math.min(d.at, out.length), 0, d.spec);
  }
  return out;
}

/** The retuner owns the keys: on, and there is a card to play. */
export const retunerLive = (r: RetState): boolean => r.on && r.cards.length > 0;

/* ---------------------------------------------------------------------------------------------- settings */
const clampInt = (x: unknown, min: number, max: number, d: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, Math.trunc(x))) : d;
const clampNum = (x: unknown, min: number, max: number, d: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d;

/** Bring typed settings into range (the reducer's guard; persist.ts does the same from untyped data). */
export function clampSettings(s: RetSettings): RetSettings {
  const d = defaultRetSettings();
  return {
    pivot: PIVOT_MODES.includes(s.pivot) ? s.pivot : d.pivot,
    manualDeg: clampInt(s.manualDeg, 0, 255, d.manualDeg),
    anchor: ANCHORS.includes(s.anchor) ? s.anchor : d.anchor,
    trigger: TRIGGERS.includes(s.trigger) ? s.trigger : d.trigger,
    scorer: SCORER_IDS.includes(s.scorer) ? s.scorer : d.scorer,
    scorerOpts: {
      harmonics: clampInt(s.scorerOpts?.harmonics, 1, 16, d.scorerOpts.harmonics),
      rolloff: clampNum(s.scorerOpts?.rolloff, 0.01, 1, d.scorerOpts.rolloff),
      oddLimit: clampInt(s.scorerOpts?.oddLimit, 1, 255, d.scorerOpts.oddLimit),
    },
    glideMs: clampInt(s.glideMs, 0, MAX_GLIDE_MS, d.glideMs),
  };
}

/** The scorer the settings name, as the engine wants it (lower = better). */
export function makeScorer(s: RetSettings): RetuneScorer {
  const o = s.scorerOpts;
  switch (s.scorer) {
    case 'lattice':
      return (f) => scoreLattice(f, { oddLimit: o.oddLimit });
    case 'fair':
      return (f) => scorePeriodicityFair(f);
    case 'infinitone':
      return (f) => scorePeriodicityInfinitone(f);
    default:
      return (f) => scoreRoughness(f, { harmonics: o.harmonics, rolloff: o.rolloff });
  }
}

/* ---------------------------------------------------------------------------------------------- the engine */
const engineCards = (r: RetState): RetunerCard[] =>
  r.cards.map((c, i) => ({
    name: c.name,
    notes: c.notes,
    rep: c.rep,
    base: r.bases[i] ?? startBase(c, r.relative),
    home: startBase(c, r.relative),
  }));

/** Hz of a held key in the active card, at its current root; null when the card has no such degree. */
export function heldHz(r: RetState, h: RetHeld, refHz: number = REF_HZ): number | null {
  const c = r.cards[r.active];
  if (!c || h.deg < 0 || h.deg >= c.notes.length) {
    return null;
  }
  const b = r.bases[r.active] ?? startBase(c, r.relative);
  return refHz * 2 ** ((b.c + c.notes[h.deg].c + h.oct * c.rep.c) / 1200);
}

/**
 * One retune on the held keys. The chosen card becomes the active one and every root moves to its re-rooted base; when
 * the engine keeps the current card (no pivot, nothing held, no candidate) nothing moves and only `last` records why.
 */
export function runStep(r: RetState, refHz: number = REF_HZ): RetState {
  const s = r.settings;
  const result = retuneStep(
    { cards: engineCards(r), active: r.active, held: r.held },
    {
      pivotMode: s.pivot,
      manualDeg: s.pivot === 'manual' ? s.manualDeg : undefined,
      anchor: s.anchor,
      scorer: makeScorer(s),
      refHz,
    }
  );
  const step = (r.last?.step ?? 0) + 1;
  const last: RetLast = { result, held: r.held, step };
  if (result.why.reason) {
    return { ...r, last };
  }
  const log = [
    ...r.log,
    {
      step,
      held: r.held,
      chosen: result.chosen,
      chosenName: r.cards[result.chosen]?.name ?? '',
      drift: result.drift,
    },
  ].slice(-MAX_LOG);
  return { ...r, bases: result.bases, active: result.chosen, last, log };
}

/** Drift of the active card against its home: zero before any step. */
export const driftOf = (r: RetState): Base => r.last?.result.drift ?? { m: {}, c: 0 };

/** How far card `i`'s root `base` is from where that card started (exact when both are): what "Root now" shows. */
export function shiftOf(r: Pick<RetState, 'cards' | 'relative'>, i: number, base: Base): Base {
  const s = r.cards[i] ? startBase(r.cards[i], r.relative) : HOME_BASE;
  if (base.m && s.m) {
    const m = mAdd(base.m, s.m, -1);
    return { m, c: mCents(m) };
  }
  return { m: null, c: base.c - s.c };
}

/** A card root or a drift as text: the ratio when exact, else cents. */
export const fmtBase = (n: Base): string => (n.m ? fmtRatio(n as Note) : `${n.c.toFixed(2)} c`);

/** Index (into `noteCents`, the tab's field) a retuned pitch coincides with (within 0.5 c, reduced into the repeat), or -1: what lights. */
export function litIndex(noteCents: readonly number[], repC: number, cents: number): number {
  if (!(repC > 0) || noteCents.length === 0) {
    return -1;
  }
  const r = ((cents % repC) + repC) % repC;
  for (let i = 0; i < noteCents.length; i++) {
    const c = noteCents[i];
    if (Math.abs(c - r) < 0.5 || Math.abs(c - r - repC) < 0.5 || Math.abs(c - r + repC) < 0.5) {
      return i;
    }
  }
  return -1;
}

/* ---------------------------------------------------------------------------------------------- reducer */
export type RetSettingsPatch = Partial<Omit<RetSettings, 'scorerOpts'>> & {
  scorerOpts?: Partial<ScorerOpts>;
};

export type RetAction =
  | { type: 'ret/add'; card: RetCard }
  | { type: 'ret/rename'; index: number; name: string }
  | { type: 'ret/move'; index: number; by: -1 | 1 }
  | { type: 'ret/delete'; index: number }
  | { type: 'ret/home'; index: number }
  | { type: 'ret/settings'; patch: RetSettingsPatch }
  | { type: 'ret/on'; on: boolean }
  | { type: 'ret/reset' }
  | { type: 'ret/relative'; relative: boolean }
  | { type: 'ret/down'; slot: number; t: number }
  | { type: 'ret/up'; slot: number }
  | { type: 'ret/release' }
  | { type: 'ret/retune' };

const cleanCardName = (name: string, d: string): string =>
  name.replace(/\s+/g, ' ').trim().slice(0, 60) || d;

/** A new card list: every root back on 1/1, card 0 active, no keys held, no history. */
const withCards = (r: RetState, cards: RetCard[], relative = r.relative): RetState => ({
  ...r,
  cards,
  relative,
  bases: cards.map((c) => startBase(c, relative)),
  active: 0,
  held: [],
  last: null,
  log: [],
});

export function retunerReduce(r: RetState, a: RetAction, refHz: number = REF_HZ): RetState {
  switch (a.type) {
    case 'ret/add':
      return r.cards.length + r.dormant.length >= MAX_CARDS || a.card.notes.length === 0
        ? r
        : withCards(r, [
            ...r.cards,
            {
              ...a.card,
              id: newCardId(),
              name: cleanCardName(a.card.name, `Card ${r.cards.length + 1}`),
            },
          ]);
    case 'ret/rename': {
      const c = r.cards[a.index];
      if (!c) {
        return r;
      }
      const name = cleanCardName(a.name, c.name);
      return name === c.name
        ? r
        : { ...r, cards: r.cards.map((x, i) => (i === a.index ? { ...x, name } : x)) };
    }
    case 'ret/move': {
      const to = a.index + a.by;
      if (!r.cards[a.index] || to < 0 || to >= r.cards.length) {
        return r;
      }
      const cards = r.cards.slice();
      [cards[a.index], cards[to]] = [cards[to], cards[a.index]];
      return withCards(r, cards);
    }
    case 'ret/delete':
      return r.cards[a.index]
        ? withCards(
            r,
            r.cards.filter((_, i) => i !== a.index)
          )
        : r;
    case 'ret/home': {
      const c = r.cards[a.index];
      return !c || a.index === 0
        ? r
        : withCards(r, [c, ...r.cards.filter((_, i) => i !== a.index)]);
    }
    case 'ret/settings': {
      const { scorerOpts, ...rest } = a.patch;
      const settings = clampSettings({
        ...r.settings,
        ...rest,
        scorerOpts: { ...r.settings.scorerOpts, ...scorerOpts },
      });
      return JSON.stringify(settings) === JSON.stringify(r.settings) ? r : { ...r, settings };
    }
    case 'ret/on':
      return r.on === a.on ? r : { ...r, on: a.on, held: [] };
    case 'ret/relative':
      return r.relative === a.relative ? r : withCards(r, r.cards, a.relative);
    case 'ret/reset':
      return { ...withCards(r, r.cards), on: r.on };
    case 'ret/down': {
      const c = r.cards[r.active];
      if (!retunerLive(r) || !c || r.held.some((h) => h.key === a.slot)) {
        return r;
      }
      const t = slotTarget(a.slot, c.notes.length);
      if (!t) {
        return r;
      }
      const next = { ...r, held: [...r.held, { key: a.slot, deg: t.deg, oct: t.oct, t: a.t }] };
      return r.settings.trigger === 'auto' && next.held.length >= 2 ? runStep(next, refHz) : next;
    }
    case 'ret/up':
      return r.held.some((h) => h.key === a.slot)
        ? { ...r, held: r.held.filter((h) => h.key !== a.slot) }
        : r;
    case 'ret/release':
      return r.held.length ? { ...r, held: [] } : r;
    case 'ret/retune':
      return retunerLive(r) && r.held.length > 0 ? runStep(r, refHz) : r;
  }
}
