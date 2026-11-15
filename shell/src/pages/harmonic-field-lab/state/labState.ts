/**
 * The lab's one state: tabs (each a pitch collection with its subset), saved subsets, what is pointed at or sounding,
 * the UI settings and the pinned-panel layout. A pure reducer, no React: every rule is testable without rendering.
 *
 * Nothing here is derived analysis (see derive.ts) and nothing here touches storage (see persist.ts). The field of a tab
 * is part of the state (built by `generateField`) so selection can be carried across a regeneration inside the reducer.
 */
import {
  DEFAULT_TEMPLATES,
  EPS,
  resolveSubset,
  subsetFromSelection,
  type UpdateReport,
  SCALE_LIBRARY,
  carrySelection,
  melakarta,
  mod,
  nearestEdSubset,
  nearestScaleSubset,
  oddLimitSubset,
  scaleTargets,
  scaleTargetsLabeled,
  type ChordTemplate,
  type Note,
  type TargetPoint,
} from '../../../lib/harmonic-field';
import { CHORD_PAGE, clampShift, type KeyboardMode, type LinkedRoot } from '../audio/keymap';
import type { ModePlayback, ScaleDir } from '../audio/plan';
import {
  cloneSource,
  emptyShelf,
  shelfReduce,
  stashChord,
  type ShelfAction,
  type ShelfState,
} from './chordShelf';
import {
  autoName,
  defaultGen,
  genFromPreset,
  genKey,
  generateField,
  presetByName,
  type GenSpec,
  type Method,
} from './generate';
import {
  addSubset,
  cleanName,
  cloneGen,
  copySubsetsTo,
  deletePreset,
  deleteSubset,
  emptyLibrary,
  ensureUntitled,
  isModified,
  movePreset,
  ownerGen,
  ownerLabel,
  ownerOfTab,
  parseOwner,
  promoteUntitled,
  pushRecent,
  renamePreset,
  renameSubset,
  saveUserPreset,
  builtinKey,
  undoUpdate,
  updateBlocker,
  updateOwner,
  userKey,
  type GenLibrary,
  type OwnerKey,
  type UpdateUndo,
} from './generatorLibrary';
import { DEFAULT_LAYOUT, type Layout, type PanelId, type VizId } from './layout';
import { initialRetuner, retunerReduce, type RetAction, type RetState } from './retuner';
import { defaultSettings as defaultVizSettings, type VizSettings } from './vizState';

/* --------------------------------------------------------------------------------------------------- shapes */
export type CmpRef = 'edo12' | 'picked' | 'ji' | 'medo';
export const CMP_REFS: readonly CmpRef[] = ['edo12', 'picked', 'ji', 'medo'];

/** The scale the last "Nearest scale" pick used: its targets above the mode root. */
export interface PickRef {
  name: string;
  kind: 'edo12' | 'ji';
  stretch: boolean;
  targets: TargetPoint[];
}

export interface Tab {
  id: string;
  /** Name typed by the user; null means the automatic name. */
  name: string | null;
  gen: GenSpec;
  /** Built from `gen`; not stored. */
  field: Note[];
  rep: Note;
  /** Inline message from the last generation (an error or a warning); '' when fine. */
  err: string;
  /** Selected field indices, ascending. */
  sel: number[];
  /** Which selected note is the root (an index into `sel`). */
  mode: number;
  /**
   * The stored selection (cents) and mode of a tab restored while its inputs did not build (a repeat saved mid-edit): kept
   * so the next save does not lose it, and re-matched by the first good build.
   */
  pending?: { cents: number[]; mode: number };
  /** Method of the last successful generation: a regeneration with the same method keeps the selection. */
  lastMethod: Method | null;
  /** The generator (an `OwnerKey`) this tab is linked to; see `ownerOfTab` for how an unlinked tab finds its owner. */
  link?: OwnerKey;
  /** The shelf chord this tab was reloaded from; chords stashed from the tab record it as their parent. */
  fromChord?: string;
  cmp: { ref: CmpRef; odd: number; m: number };
  pick: {
    scale: string;
    kind: 'edo12' | 'ji';
    stretch: boolean;
    m: number;
    /** The odd limit of the "Odd limit..." entry of the scale menu. */
    odd: number;
    ref: PickRef | null;
    /** Message after the last pick (or '' ). */
    msg: string;
    ok: boolean;
  };
}

/** The legacy flat saved subset (`subsets.v1`): read only to migrate into the generator library. */
export interface Saved {
  id: string;
  name: string;
  gen: GenSpec;
  selCents: number[];
  mode: number;
}

export type RingView = 'chromatic' | 'fifths';
export type Wave = 'sine' | 'harmonic';
/** How a scale preview runs: up to the repeat, or up and back down. */
export type { ModePlayback, ScaleDir };
export const SCALE_DIRS: readonly ScaleDir[] = ['up', 'updown'];
export const WAVES: readonly Wave[] = ['sine', 'harmonic'];

/** Per-viewer UI settings (persisted in `settings.v1`). */
export interface UiSettings {
  /** The analysis panel the switcher column shows. */
  panel: PanelId;
  dockOpen: boolean;
  /** Chord finder tolerance in cents. */
  tol: number;
  ringView: RingView;
  ringSteps: number;
  /** Generator of the Fifths ring as typed. */
  ringGen: string;
  viz: Record<VizId, VizSettings>;
  wave: Wave;
  baseHz: number;
  /** 0 to 1. */
  volume: number;
  modeAtBase: boolean;
  /** Direction of every scale preview (Play scale, a key ring's preview). */
  scalePreview: ScaleDir;
  /** Mode previews from 1/1 (Parallel) or from the mode's own root (Relative); key 0 toggles. */
  modePlayback: ModePlayback;
  /** Saved list: show subsets of every collection, not only the current one. */
  savedAll: boolean;
  /** What the computer keys play (M8b): melody notes, shelf chords, or both. Optional in storage (absent = Notes). */
  keyboardMode: KeyboardMode;
  /** Linked melody (M8b, default off): the melody keys play the last pressed chord key's source subset. Optional in storage. */
  linkedMelody: boolean;
  /** Linked melody root (M8b, 2026-11-15): null = not chosen, the Developer menu default applies. Optional in storage. */
  linkedRoot: LinkedRoot | null;
}

/**
 * Runtime state of the computer keys (never stored, reset on reload): the melody shift in repeats (`,` / `.`), the shelf page
 * (`[` / `]`, ten chords per page) and the chord the linked melody follows (a shelf chord id).
 */
export interface KeysRuntime {
  shift: number;
  page: number;
  link: string | null;
}

export interface Notice {
  kind: 'update' | 'copy';
  owner: OwnerKey;
  /** The generator's name when the notice was made. */
  name: string;
  report: UpdateReport;
  /** Update only: restores the generator and its exact previous subsets. */
  undo: UpdateUndo | null;
}

export interface LabState {
  tabs: Tab[];
  active: number;
  nextTab: number;
  /** The generator library: user presets, Untitled generators, and every generator's subsets as pitches. */
  library: GenLibrary;
  /** The notice after an Update (with its undo) or a copy; runtime only, cleared by the next generator edit. */
  notice: Notice | null;
  /** Set when a library action was refused (a cap, an unbuildable generator); cleared by the next library action. */
  refusal: { reason: string } | null;
  /** The last `subset/load`: how many of the subset's pitches the field had; runtime only. */
  lastLoad: { id: string; found: number; missing: number } | null;
  /** The row the last Add produced or found (`duplicate`); runtime only. */
  lastAdded: { id: string; duplicate: boolean } | null;
  /**
   * Set when `subset/add` forked the tab into a new Untitled generator because it was edited or unsaved (the key of that
   * generator); runtime only, ended like the notice (a generator edit, switch or library change). Additive: nothing else reads it.
   */
  forkNote: { owner: OwnerKey; reason: 'unsaved' | 'edited' } | null;
  /** Field index pointed at, and the one pinned in the inspector. */
  hover: number | null;
  pin: number | null;
  /** Chord notes of a hovered chip (temporary) and of a clicked chip (kept). */
  chordHover: ReadonlySet<number> | null;
  chordPick: ReadonlySet<number> | null;
  /** A saved subset pointed at: shown on the ring and strip instead of the selection. */
  preview: readonly number[] | null;
  /** Field indices that sound right now (every view lights them). */
  sounding: ReadonlySet<number>;
  /** Field indices whose strip mark alone is lit: a pure target tone that is no field note (a Shift+click on a strip note). */
  soundingMarks: ReadonlySet<number>;
  /** Cents above 1/1 of sounding pitches that match no field note (drawn as ghost marks on the ring and strip). */
  soundingGhosts: readonly number[];
  /** Shelf chord ids that sound now (a chord key, hold 1, a click, Play selected): their Shelf cards light. Runtime only. */
  soundingChords: readonly string[];
  ui: UiSettings;
  layout: Layout;
  /** The chord finder's templates (user-editable; stored in `...chordfinder.v1`). */
  templates: ChordTemplate[];
  /** The retuner: card list, settings (stored in `...retuner.v1`) and the run (see retuner.ts). */
  retuner: RetState;
  /** The chord shelf: stashed chords, selection, sketch row (stored in `...chordshelf.v1`, see chordShelf.ts). */
  shelf: ShelfState;
  /** The computer keys' runtime state: melody shift, shelf page, linked chord (M8b). */
  keys: KeysRuntime;
}

/* ----------------------------------------------------------------------------------------------- defaults */
export const DEFAULT_PRESET = 'Harmonics 8–15';
export const DEFAULT_BASE_HZ = 261.6256;
export const DEFAULT_TOL = 18;
export const MAX_TABS = 12;
export const MAX_TEMPLATES = 64;

export function defaultUi(): UiSettings {
  return {
    panel: 'chords',
    dockOpen: true,
    tol: DEFAULT_TOL,
    ringView: 'chromatic',
    ringSteps: 12,
    ringGen: '3/2',
    viz: defaultVizSettings(),
    wave: 'sine',
    baseHz: DEFAULT_BASE_HZ,
    volume: 0.5,
    modeAtBase: true,
    scalePreview: 'up',
    modePlayback: 'parallel',
    savedAll: false,
    keyboardMode: 'notes',
    linkedMelody: false,
    linkedRoot: null,
  };
}

const num = (a: number, b: number) => a - b;
const uniqSorted = (xs: Iterable<number>) => [...new Set(xs)].sort(num);
export const emptyPick = (): Tab['pick'] => ({
  scale: 'ed',
  kind: 'edo12',
  stretch: false,
  m: 12,
  odd: 15,
  ref: null,
  msg: '',
  ok: true,
});
export const defaultCmp = (): Tab['cmp'] => ({ ref: 'edo12', odd: 15, m: 12 });

/** Build a tab from generation inputs; every note starts selected. Falls back to an empty field when the inputs fail. */
export function makeTab(id: string, gen: GenSpec, name: string | null = null): Tab {
  const g = generateField(gen);
  const rep = g.ok ? g.rep : { m: { '2': 1 }, c: 1200 };
  const field = g.ok ? g.field : [];
  return {
    id,
    name,
    gen,
    field,
    rep,
    err: g.ok ? g.warn : g.err,
    sel: field.map((_, i) => i),
    mode: 0,
    lastMethod: g.ok ? gen.method : null,
    cmp: defaultCmp(),
    pick: emptyPick(),
  };
}

export function presetGen(name: string = DEFAULT_PRESET): GenSpec {
  const p = presetByName(name);
  return p ? genFromPreset(p) : defaultGen();
}

export function initialState(): LabState {
  return {
    tabs: [makeTab('t1', presetGen())],
    active: 0,
    nextTab: 2,
    library: emptyLibrary(),
    notice: null,
    lastAdded: null,
    forkNote: null,
    refusal: null,
    lastLoad: null,
    hover: null,
    pin: null,
    chordHover: null,
    chordPick: null,
    preview: null,
    sounding: new Set(),
    soundingMarks: new Set(),
    soundingGhosts: [],
    soundingChords: [],
    ui: defaultUi(),
    layout: DEFAULT_LAYOUT,
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
    retuner: initialRetuner(),
    shelf: emptyShelf(),
    keys: { shift: 0, page: 0, link: null },
  };
}

/** The name a tab shows. */
export const tabName = (t: Tab): string => t.name ?? autoName(t.gen);
export const activeTab = (s: LabState): Tab => s.tabs[s.active] ?? s.tabs[0];

/** Selected indices that exist in a field of `n` notes. */
export const fixSel = (sel: readonly number[], n: number): number[] =>
  uniqSorted(sel.filter((i) => Number.isInteger(i) && i >= 0 && i < n));
export const fixMode = (mode: number, count: number) =>
  count > 0 && Number.isInteger(mode) && mode >= 0 && mode < count ? mode : 0;

/** Indices of the field notes whose cents match (within 0.01 c) any of `cents`. */
export function matchCents(field: Note[], cents: readonly number[]): number[] {
  return field.map((_, i) => i).filter((i) => cents.some((c) => Math.abs(c - field[i].c) < 0.01));
}

/* ------------------------------------------------------------------------------------------------ regenerate */
/**
 * Rebuild a tab's field from new inputs. A failed build keeps the old field and shows the message. With `fresh` (a
 * preset, a new method) every note is selected; otherwise the selection follows its pitches (carrySelection).
 */
export function regenTab(tab: Tab, gen: GenSpec, fresh = false): Tab {
  const g = generateField(gen);
  if (!g.ok) {
    return { ...tab, gen, err: g.err };
  }
  const same = !fresh && tab.lastMethod === gen.method && tab.field.length > 0;
  if (tab.pending && g.field.length > 0) {
    // the first good build of a tab restored with a broken input: bring the stored selection back
    const sel = matchCents(g.field, tab.pending.cents);
    const { pending, ...rest } = tab;
    return {
      ...rest,
      gen,
      field: g.field,
      rep: g.rep,
      err: g.warn,
      sel,
      mode: fixMode(pending.mode, sel.length),
      lastMethod: gen.method,
    };
  }
  const sel = uniqSorted(carrySelection(tab.field, tab.sel, g.field, same, gen.keepNew));
  return {
    ...tab,
    gen,
    field: g.field,
    rep: g.rep,
    err: g.warn,
    sel,
    mode: fixMode(tab.mode, sel.length),
    lastMethod: gen.method,
  };
}

/* -------------------------------------------------------------------------------------------- nearest scale */
export const PICK_ED = 'ed';
/** The scale menu's "Odd limit..." entry: keep the notes whose odd limit is at most `pick.odd`. */
export const PICK_ODD = 'odd';
/** `w:<name>` (Western library) or `m<n>` (melakarta). */
export function resolveScale(
  id: string
): { name: string; edo12: number[]; ji: string[]; swaras?: string[]; desc: string } | null {
  if (id.startsWith('w:')) {
    const sc = SCALE_LIBRARY.find((s) => s.name === id.slice(2));
    return sc ? { name: sc.name, edo12: sc.edo12, ji: sc.ji, desc: sc.desc } : null;
  }
  if (/^m\d+$/.test(id)) {
    const m = melakarta(Number(id.slice(1)));
    return m
      ? { name: `${m.n} ${m.name}`, edo12: m.edo12, ji: m.ji, swaras: m.swaras, desc: '' }
      : null;
  }
  return null;
}

const isOctave = (rep: Note) => Math.abs(rep.c - 1200) < 0.01;

/** The mode root as a field index (the first note at 0 c when nothing is selected). */
export function rootIndex(t: Tab): number {
  if (t.sel.length) {
    return t.sel[mod(t.mode, t.sel.length)];
  }
  const z = t.field.findIndex((n) => Math.abs(n.c) < EPS);
  return z >= 0 ? z : 0;
}

function applyNearest(t: Tab): Tab {
  const { scale, kind, m } = t.pick;
  const repC = t.rep.c;
  const sc = resolveScale(scale);
  if (!t.field.length) {
    return { ...t, pick: { ...t.pick, ok: false, msg: 'There are no notes to pick from.' } };
  }
  if (scale === PICK_ODD) {
    const limit = Math.min(
      255,
      Math.max(1, Math.trunc(Number.isFinite(t.pick.odd) ? t.pick.odd : 15))
    );
    const sel = uniqSorted(oddLimitSubset(t.field, limit));
    if (sel.length === 0) {
      return {
        ...t,
        pick: {
          ...t.pick,
          odd: limit,
          ok: false,
          msg: `No notes within odd limit ${limit} (notes without a ratio, such as EDO steps, have none). The subset was not changed.`,
        },
      };
    }
    return {
      ...t,
      sel,
      mode: 0,
      pick: {
        ...t.pick,
        odd: limit,
        ok: true,
        msg: `Picked ${sel.length} notes with odd limit ${limit} or less.`,
      },
    };
  }
  if (!sc) {
    const n = Math.min(1000, Math.max(1, Math.trunc(Number.isFinite(m) ? m : 12)));
    const sel = uniqSorted(nearestEdSubset(t.field, repC, n));
    return {
      ...t,
      sel,
      mode: 0,
      cmp: { ...t.cmp, ref: 'medo', m: n },
      pick: {
        ...t.pick,
        ok: true,
        msg: `Picked ${sel.length} notes nearest ${n} equal divisions.`,
      },
    };
  }
  const stretch = t.pick.stretch && !isOctave(t.rep);
  const root = rootIndex(t);
  const r = nearestScaleSubset(
    t.field,
    scaleTargets(sc, kind, stretch ? repC : undefined),
    repC,
    root
  );
  if (!r.ok) {
    return { ...t, pick: { ...t.pick, ok: false, msg: `${r.reason} The subset was not changed.` } };
  }
  const sel = uniqSorted(r.idx);
  let msg = `Picked ${r.idx.length} notes: max ±${r.maxErr.toFixed(2)} c, mean ${r.meanAbsErr.toFixed(2)} c (the root is the mode root).`;
  if (!isOctave(t.rep) && !stretch) {
    msg += ` The repeat is ${repC.toFixed(2)} c, not an octave: the scale's cents above the root were used unchanged (any that exceed the repeat wrap around it). Tick Octave → repeat to stretch it.`;
  }
  if (stretch) {
    msg += ` Stretched: the scale's octave now spans the repeat (×${(repC / 1200).toFixed(3)}).`;
  }
  return {
    ...t,
    sel,
    mode: Math.max(0, sel.indexOf(root)),
    cmp: { ...t.cmp, ref: 'picked' },
    pick: {
      ...t.pick,
      ok: true,
      msg,
      ref: {
        name: sc.name,
        kind,
        stretch,
        targets: scaleTargetsLabeled(sc, kind, stretch ? repC : undefined),
      },
    },
  };
}

/* ---------------------------------------------------------------------------------------------------- actions */
export type Action =
  | { type: 'restore'; state: Partial<LabState> & Pick<LabState, 'tabs'> }
  | { type: 'tab/add'; gen?: GenSpec }
  | { type: 'tab/duplicate'; index?: number }
  | { type: 'tab/close'; index: number }
  | { type: 'tab/switch'; index: number }
  | { type: 'keys/shift'; by: number }
  | { type: 'keys/page'; by: number }
  | { type: 'keys/link'; id: string | null }
  | { type: 'tab/rename'; index: number; name: string }
  | { type: 'gen/patch'; patch: Partial<GenSpec> }
  | { type: 'gen/axis'; index: number; patch: Partial<GenSpec['axes'][number]> }
  | { type: 'gen/keepNew'; on: boolean }
  | { type: 'gen/prime'; slot: number }
  | { type: 'gen/primes'; on: boolean }
  | { type: 'gen/preset'; name: string }
  | { type: 'gen/method'; method: Method }
  | { type: 'gen/custom'; custom: string; rep?: string }
  | { type: 'sel/toggle'; i: number; keepRoot?: boolean }
  | { type: 'sel/all' }
  | { type: 'sel/none' }
  | { type: 'sel/invert' }
  | { type: 'sel/set'; idx: readonly number[]; mode?: number }
  | { type: 'sel/join'; idx: readonly number[] }
  | { type: 'mode/set'; mode: number }
  | { type: 'mode/step'; by: number }
  | { type: 'pick/set'; patch: Partial<Tab['pick']> }
  | { type: 'pick/apply' }
  | { type: 'cmp/set'; patch: Partial<Tab['cmp']> }
  | { type: 'subset/add'; name?: string }
  | { type: 'subset/rename'; id: string; name: string }
  | { type: 'subset/delete'; id: string }
  | { type: 'subset/load'; id: string }
  | { type: 'lib/sync'; library: GenLibrary }
  | { type: 'preset/open'; owner: OwnerKey }
  | { type: 'preset/save'; name: string; folder: string; copySubsets?: boolean }
  | { type: 'preset/rename'; id: string; name: string }
  | { type: 'preset/move'; id: string; folder: string }
  | { type: 'preset/delete'; id: string }
  | { type: 'preset/update' }
  | { type: 'tab/link'; owner: OwnerKey | null }
  | { type: 'notice/undo' }
  | { type: 'notice/dismiss' }
  | { type: 'recent/push'; owner: OwnerKey }
  | { type: 'templates/set'; templates: ChordTemplate[] }
  | { type: 'hover'; i: number | null }
  | { type: 'pin'; i: number | null }
  | { type: 'pin/toggle'; i: number }
  | { type: 'chord/hover'; set: ReadonlySet<number> | null }
  | { type: 'chord/pick'; set: ReadonlySet<number> | null }
  | { type: 'preview'; idx: readonly number[] | null }
  | {
      type: 'sounding';
      idx: readonly number[];
      marks?: readonly number[];
      /** Sounding pitches (cents above 1/1) that match no field note. */
      ghosts?: readonly number[];
      /** Shelf chord ids that sound. */
      chords?: readonly string[];
    }
  | { type: 'ui'; patch: Partial<UiSettings> }
  | { type: 'viz'; id: VizId; patch: Partial<VizSettings> }
  | { type: 'layout'; fn: (l: Layout) => Layout }
  | { type: 'shelf/stash'; stash: StashRequest }
  | { type: 'shelf/reload'; id: string }
  | ShelfAction
  | RetAction;

/** What the UI hands `shelf/stash`: the exact pitches heard; everything else is read from the active tab and the settings. */
export interface StashRequest {
  pitches: Note[];
  template?: string | null;
  /** The chord root's degree in the active subset read from its mode root, when known. */
  rootDeg?: number | null;
  name?: string;
  /** ISO date-time (passed in so the reducer stays pure). */
  date: string;
}

const withTab = (s: LabState, fn: (t: Tab) => Tab): LabState => {
  const t = activeTab(s);
  const next = fn(t);
  return next === t ? s : { ...s, tabs: s.tabs.map((x) => (x === t ? next : x)) };
};

/** Pointers into the old field mean nothing in a new one. */
const clearPointers = (s: LabState): LabState => ({
  ...s,
  hover: null,
  pin: null,
  chordHover: null,
  chordPick: null,
  preview: null,
  sounding: new Set(),
  soundingMarks: new Set(),
  soundingGhosts: [],
  soundingChords: [],
  // the linked melody belongs to the tab it was pressed on
  keys: s.keys.link === null ? s.keys : { ...s.keys, link: null },
});

/** Apply a tab change; when the field changed, drop the pointers and lights that referred to the old one. */
function editTab(s: LabState, fn: (t: Tab) => Tab): LabState {
  const before = activeTab(s);
  const next = withTab(s, fn);
  return activeTab(next).field === before.field ? next : clearPointers(next);
}

export { cleanName };

/** Open an owner's generator in the active tab (a preset pick): fresh build, linked, pushed to Recent. */
function openOwner(s: LabState, key: OwnerKey): LabState {
  const g = ownerGen(s.library, key);
  if (!g) {
    return s;
  }
  const out = editTab(s, (t) => withLink(regenTab({ ...t, mode: 0 }, g, true), key));
  return { ...out, library: pushRecent(out.library, key) };
}

/**
 * Reload a shelf chord's source as a NEW tab at the end (current tabs untouched, the new one becomes active): the stored
 * generator inputs are rebuilt, the stored subset is re-resolved against that field, and the tab links to the matching preset or
 * Auto-saved generator by the owner lookup (no link when there is none; nothing is created). Chords stashed from it record
 * the chord as their parent. Refused (a reason on the shelf) at the tab cap, without a stored source, or when the inputs do not build.
 */
function reloadChord(s: LabState, id: string): LabState {
  const chord = s.shelf.chords.find((c) => c.id === id);
  const refuse = (reason: string): LabState => ({
    ...s,
    shelf: { ...s.shelf, refusal: { reason } },
  });
  if (!chord) {
    return s;
  }
  if (!chord.source) {
    return refuse(`'${chord.name}' has no stored source to reload.`);
  }
  if (s.tabs.length >= MAX_TABS) {
    return refuse(`There are already ${MAX_TABS} tabs; close one first.`);
  }
  const src = cloneSource(chord.source);
  const base = makeTab(`t${s.nextTab}`, src.gen, src.tab ? cleanName(src.tab) || null : null);
  if (!base.field.length) {
    return refuse(`The source of '${chord.name}' does not build: ${base.err || 'no notes'}.`);
  }
  const r = resolveSubset(base.field, src.subset);
  const sel = r.sel.length ? r.sel : base.field.map((_, i) => i);
  // link only to an owner whose generator really builds this field (a stored preset label alone is not trusted)
  const want = genKey(src.gen);
  let owner: OwnerKey | null = null;
  let gen: GenSpec = { ...src.gen, preset: '' };
  for (const g of [src.gen, { ...src.gen, preset: '' }]) {
    const key = ownerOfTab(s.library, { gen: g });
    const ownerInputs = key ? ownerGen(s.library, key) : null;
    if (key && ownerInputs && genKey(ownerInputs) === want) {
      owner = key;
      gen = g; // the inputs that matched: a stale preset label is cleared
      break;
    }
  }
  const tab: Tab = {
    ...base,
    gen,
    sel,
    mode: r.sel.length ? r.mode : 0,
    fromChord: chord.id,
    ...(owner ? { link: owner } : {}),
  };
  return clearPointers({
    ...s,
    tabs: [...s.tabs, tab],
    active: s.tabs.length,
    nextTab: s.nextTab + 1,
    shelf: {
      ...s.shelf,
      refusal: null,
      lastReload: { id: chord.id, found: r.found.length, missing: r.missing.length },
    },
  });
}

/** A tab linked to `to` (no link when null). */
function withLink(t: Tab, to: OwnerKey | null): Tab {
  const { link, ...rest } = t;
  return link === undefined && to === null ? t : to === null ? rest : { ...rest, link: to };
}

/** Link the active tab to an owner (null: unlink). */
function setLink(s: LabState, key: OwnerKey | null): LabState {
  const t = activeTab(s);
  if ((t.link ?? null) === key) {
    return s;
  }
  return { ...s, tabs: s.tabs.map((x) => (x === t ? withLink(x, key) : x)) };
}

/** A generator edit (or any switch of what the tab is) ends the Update notice. */
const endsNotice = (type: Action['type']) =>
  (type.startsWith('gen/') && type !== 'gen/keepNew') ||
  type === 'preset/open' ||
  type === 'lib/sync' ||
  (type.startsWith('tab/') && type !== 'tab/link') ||
  type === 'subset/add' ||
  type === 'subset/delete' ||
  type === 'subset/rename' ||
  type === 'preset/save' ||
  type === 'preset/delete' ||
  type === 'preset/rename' ||
  type === 'preset/move';

const isLibraryAction = (type: Action['type']) =>
  type.startsWith('subset/') || type.startsWith('preset/') || type === 'lib/sync';

const refuse = (s: LabState, reason: string): LabState => ({ ...s, refusal: { reason } });

export function labReducer(s: LabState, a: Action): LabState {
  let next = reduce(s, a);
  // a notice made by this very action (copy) stays; any other library or generator change ends the old one
  if (next.notice && next.notice === s.notice && next !== s && endsNotice(a.type)) {
    next = { ...next, notice: null };
  }
  if (next.forkNote && next.forkNote === s.forkNote && next !== s && endsNotice(a.type)) {
    next = { ...next, forkNote: null };
  }
  if (next.refusal && next.refusal === s.refusal && isLibraryAction(a.type)) {
    next = { ...next, refusal: null };
  }
  // an armed chord's shape belongs to the field it came from: another tab or a changed field disarms it (template stays)
  const sk = next.shelf.sketch;
  if (next !== s && (sk.armed || sk.shape)) {
    const before = activeTab(s);
    const after = activeTab(next);
    if (after.id !== before.id || after.field !== before.field) {
      next = { ...next, shelf: { ...next.shelf, sketch: { ...sk, armed: false, shape: null } } };
    }
  }
  return next;
}

function reduce(s: LabState, a: Action): LabState {
  switch (a.type) {
    case 'restore':
      return {
        ...s,
        ...a.state,
        hover: null,
        pin: null,
        chordHover: null,
        chordPick: null,
        preview: null,
        sounding: new Set(),
        soundingMarks: new Set(),
        soundingGhosts: [],
        soundingChords: [],
      };
    case 'tab/add': {
      if (s.tabs.length >= MAX_TABS) {
        return s;
      }
      const tab = makeTab(`t${s.nextTab}`, a.gen ?? presetGen());
      return clearPointers({
        ...s,
        tabs: [...s.tabs, tab],
        active: s.tabs.length,
        nextTab: s.nextTab + 1,
      });
    }
    case 'tab/duplicate': {
      const at = a.index ?? s.active;
      const src = s.tabs[at];
      if (!src || s.tabs.length >= MAX_TABS) {
        return s;
      }
      // a fresh build of the same inputs, then the selection, mode and settings of the original
      const gen: GenSpec = {
        ...src.gen,
        axes: src.gen.axes.map((x) => ({ ...x })),
        mask: src.gen.mask.slice(),
      };
      const copy: Tab = {
        ...makeTab(`t${s.nextTab}`, gen, cleanName(`${tabName(src)} copy`)),
        sel: src.sel.slice(),
        mode: src.mode,
        cmp: { ...src.cmp },
        pick: { ...src.pick },
        ...(src.link ? { link: src.link } : {}),
        ...(src.fromChord ? { fromChord: src.fromChord } : {}),
        ...(src.pending
          ? { pending: { cents: src.pending.cents.slice(), mode: src.pending.mode } }
          : {}),
      };
      const tabs = [...s.tabs.slice(0, at + 1), copy, ...s.tabs.slice(at + 1)];
      return clearPointers({ ...s, tabs, active: at + 1, nextTab: s.nextTab + 1 });
    }
    case 'tab/close': {
      if (s.tabs.length < 2 || a.index < 0 || a.index >= s.tabs.length) {
        return s;
      }
      const tabs = s.tabs.filter((_, i) => i !== a.index);
      const active = a.index < s.active ? s.active - 1 : Math.min(s.active, tabs.length - 1);
      return clearPointers({ ...s, tabs, active });
    }
    case 'tab/switch':
      return a.index === s.active || a.index < 0 || a.index >= s.tabs.length
        ? s
        : clearPointers({ ...s, active: a.index });
    case 'tab/rename': {
      const name = cleanName(a.name);
      if (a.index < 0 || a.index >= s.tabs.length) {
        return s;
      }
      return {
        ...s,
        tabs: s.tabs.map((t, i) => (i === a.index ? { ...t, name: name || null } : t)),
      };
    }
    case 'gen/patch':
      // a hand edit: no longer exactly the preset
      return editTab(s, (t) => regenTab(t, { ...t.gen, ...a.patch, preset: a.patch.preset ?? '' }));
    case 'gen/axis':
      return editTab(s, (t) =>
        regenTab(t, {
          ...t.gen,
          preset: '',
          axes: t.gen.axes.map((x, i) => (i === a.index ? { ...x, ...a.patch } : x)),
        })
      );
    case 'gen/keepNew':
      return withTab(s, (t) => ({ ...t, gen: { ...t.gen, keepNew: a.on } }));
    case 'gen/prime':
      return editTab(s, (t) => {
        const mask = t.gen.mask.slice();
        if (a.slot >= 0 && a.slot < mask.length) {
          mask[a.slot] = !mask[a.slot];
        }
        return regenTab(t, { ...t.gen, preset: '', mask });
      });
    case 'gen/primes':
      return editTab(s, (t) =>
        // None keeps 2, so the octave-reduced 1/1 survives
        regenTab(t, { ...t.gen, preset: '', mask: t.gen.mask.map((_, i) => a.on || i === 0) })
      );
    case 'gen/preset': {
      const p = presetByName(a.name);
      return p ? openOwner(s, builtinKey(p.name)) : s;
    }
    case 'preset/open':
      return openOwner(s, a.owner);
    case 'gen/method':
      return editTab(s, (t) =>
        t.gen.method === a.method
          ? t
          : regenTab({ ...t, mode: 0 }, { ...t.gen, method: a.method, preset: '' }, true)
      );
    case 'gen/custom':
      return editTab(s, (t) =>
        regenTab(t, {
          ...t.gen,
          preset: '',
          method: 'custom',
          custom: a.custom,
          rep: a.rep ?? t.gen.rep,
        })
      );
    case 'sel/toggle':
      return withTab(s, (t) => {
        if (a.i < 0 || a.i >= t.field.length) {
          return t;
        }
        const sel = t.sel.includes(a.i)
          ? t.sel.filter((x) => x !== a.i)
          : uniqSorted([...t.sel, a.i]);
        // keep the same note as the mode root when it survives (its position shifts when a note is added or removed below it)
        const root = t.sel[t.mode];
        const kept = a.keepRoot && root !== undefined ? sel.indexOf(root) : -1;
        return { ...t, sel, mode: kept >= 0 ? kept : fixMode(t.mode, sel.length) };
      });
    case 'sel/all':
      return withTab(s, (t) => ({ ...t, sel: t.field.map((_, i) => i), mode: 0 }));
    case 'sel/none':
      return withTab(s, (t) => ({ ...t, sel: [], mode: 0 }));
    case 'sel/invert':
      return withTab(s, (t) => {
        const on = new Set(t.sel);
        return { ...t, sel: t.field.map((_, i) => i).filter((i) => !on.has(i)), mode: 0 };
      });
    case 'sel/set':
      return withTab(s, (t) => {
        const sel = fixSel(a.idx, t.field.length);
        return { ...t, sel, mode: fixMode(a.mode ?? 0, sel.length) };
      });
    case 'sel/join':
      // Add key: the notes join the subset, the mode root stays the same note
      return withTab(s, (t) => {
        const root = t.sel.length ? t.sel[t.mode % t.sel.length] : null;
        const sel = fixSel([...t.sel, ...a.idx], t.field.length);
        return { ...t, sel, mode: root === null ? 0 : fixMode(sel.indexOf(root), sel.length) };
      });
    case 'mode/set':
      return withTab(s, (t) => ({ ...t, mode: fixMode(a.mode, t.sel.length) }));
    case 'mode/step':
      return withTab(s, (t) => ({
        ...t,
        mode: t.sel.length ? mod(t.mode + a.by, t.sel.length) : 0,
      }));
    case 'pick/set':
      return withTab(s, (t) => ({ ...t, pick: { ...t.pick, ...a.patch } }));
    case 'pick/apply':
      return withTab(s, applyNearest);
    case 'cmp/set':
      return withTab(s, (t) => {
        const cmp = { ...t.cmp, ...a.patch };
        cmp.odd = Math.min(255, Math.max(1, Math.trunc(Number.isFinite(cmp.odd) ? cmp.odd : 15)));
        cmp.m = Math.min(1000, Math.max(1, Math.trunc(Number.isFinite(cmp.m) ? cmp.m : 12)));
        if (!CMP_REFS.includes(cmp.ref) || (cmp.ref === 'picked' && !t.pick.ref)) {
          cmp.ref = 'edo12';
        }
        return { ...t, cmp };
      });
    case 'subset/add': {
      const t = activeTab(s);
      if (t.sel.length === 0 || t.field.length === 0) {
        return s;
      }
      const set = subsetFromSelection(t.field, t.sel, t.mode);
      let lib = s.library;
      let key = ownerOfTab(lib, t);
      let forked: 'unsaved' | 'edited' | null = null;
      // an unsaved or edited generator forks into an Untitled generator, so the subset is never orphaned
      if (key === null || isModified(lib, t)) {
        const reason = key === null ? 'unsaved' : 'edited';
        const u = ensureUntitled(lib, t.gen);
        if (u.key === null) {
          return refuse(s, u.refused ?? 'Too many Auto-saved generators.');
        }
        lib = u.lib;
        key = u.key;
        forked = reason;
      }
      const r = addSubset(lib, key, set, a.name);
      if (r.refused) {
        return refuse(s, r.refused);
      }
      return {
        ...setLink(s, key),
        library: pushRecent(r.lib, key),
        lastAdded: { id: r.id, duplicate: r.duplicate },
        forkNote: forked ? { owner: key, reason: forked } : null,
      };
    }
    case 'subset/delete':
      return { ...s, library: deleteSubset(s.library, a.id), preview: null };
    case 'subset/rename': {
      const library = renameSubset(s.library, a.id, a.name);
      return library === s.library ? s : { ...s, library };
    }
    case 'subset/load': {
      const sv = s.library.subsets.find((x) => x.id === a.id);
      if (!sv) {
        return s;
      }
      const same = ownerOfTab(s.library, activeTab(s)) === sv.owner;
      const g = same ? null : ownerGen(s.library, sv.owner);
      // an orphan (its owner is gone) is applied to the current tab from its own pitches, and the tab is not relinked
      const orphan = !same && !g;
      let load = { id: sv.id, found: 0, missing: 0 };
      const out = editTab(s, (t) => {
        const base = g ? regenTab({ ...t, mode: 0 }, g, true) : t;
        const r = resolveSubset(base.field, sv);
        load = { id: sv.id, found: r.found.length, missing: r.missing.length };
        const linked = orphan ? base : { ...base, link: sv.owner };
        return { ...linked, sel: r.sel, mode: fixMode(r.mode, r.sel.length) };
      });
      return {
        ...out,
        preview: null,
        lastLoad: load,
        library: orphan ? out.library : pushRecent(out.library, sv.owner),
      };
    }
    case 'lib/sync':
      return { ...s, library: a.library, preview: null, lastAdded: null };
    case 'tab/link':
      return setLink(s, a.owner);
    case 'recent/push':
      return { ...s, library: pushRecent(s.library, a.owner) };
    case 'preset/save': {
      const t = activeTab(s);
      const cur = ownerOfTab(s.library, t);
      const o = cur ? parseOwner(cur) : null;
      let key: OwnerKey;
      let lib = s.library;
      let notice: Notice | null = s.notice;
      // copied subsets re-resolve against what the edited inputs build now (the tab's field can be stale after a failed edit)
      const built = a.copySubsets ? generateField(t.gen) : null;
      if (built && !built.ok) {
        return refuse(
          s,
          `The generator does not build, so the subsets cannot be copied: ${built.err}`
        );
      }
      if (o && o.kind === 'untitled' && !isModified(lib, t)) {
        // naming an Untitled generator: it becomes the preset, its subsets move with it
        const r = promoteUntitled(lib, o.ref, { name: a.name, folder: a.folder });
        if (!r) {
          return refuse(s, 'Too many presets: delete one before saving another.');
        }
        lib = r.lib;
        key = r.key;
      } else {
        const r = saveUserPreset(lib, { name: a.name, folder: a.folder, gen: t.gen });
        if (r.key === null) {
          return refuse(s, r.refused ?? 'Too many presets.');
        }
        lib = r.lib;
        key = r.key;
        if (built && built.ok && cur && built.field.length > 0) {
          const c = copySubsetsTo(lib, cur, key, built.field);
          if (c.refused) {
            return refuse(s, c.refused);
          }
          lib = c.lib;
          notice = {
            kind: 'copy',
            owner: key,
            name: ownerLabel(lib, key),
            report: c.report,
            undo: null,
          };
        }
      }
      return { ...setLink(s, key), library: pushRecent(lib, key), notice };
    }
    case 'preset/rename': {
      const library = renamePreset(s.library, a.id, a.name);
      return library === s.library ? s : { ...s, library };
    }
    case 'preset/move': {
      const library = movePreset(s.library, a.id, a.folder);
      return library === s.library ? s : { ...s, library };
    }
    case 'preset/delete': {
      const r = deletePreset(s.library, a.id);
      if (r.refused) {
        return refuse(s, r.refused);
      }
      if (r.lib === s.library) {
        return s;
      }
      const from = userKey(a.id);
      return {
        ...s,
        library: r.lib,
        tabs: s.tabs.map((t) => (t.link === from ? withLink(t, r.moved) : t)),
        notice: s.notice && s.notice.owner === from ? null : s.notice,
        preview: null,
      };
    }
    case 'preset/update': {
      const t = activeTab(s);
      const key = ownerOfTab(s.library, t);
      const built = generateField(t.gen);
      if (key === null || !built.ok || updateBlocker(s.library, t) !== null) {
        return s;
      }
      const r = updateOwner(s.library, key, t.gen, built.field);
      if (!r) {
        return s;
      }
      return {
        ...setLink(s, key),
        library: pushRecent(r.lib, key),
        notice: {
          kind: 'update',
          owner: key,
          name: ownerLabel(r.lib, key),
          report: r.report,
          undo: r.undo,
        },
        preview: null,
      };
    }
    case 'notice/undo': {
      const n = s.notice;
      if (!n || !n.undo) {
        return s;
      }
      return { ...s, library: undoUpdate(s.library, n.undo), notice: null, preview: null };
    }
    case 'notice/dismiss':
      return s.notice ? { ...s, notice: null } : s;
    case 'hover':
      return s.hover === a.i ? s : { ...s, hover: a.i };
    case 'pin':
      return s.pin === a.i ? s : { ...s, pin: a.i };
    case 'pin/toggle':
      return { ...s, pin: s.pin === a.i ? null : a.i };
    case 'chord/hover':
      return { ...s, chordHover: a.set };
    case 'chord/pick':
      return { ...s, chordPick: a.set };
    case 'preview':
      return { ...s, preview: a.idx };
    case 'sounding': {
      const next = new Set(a.idx);
      const marks = new Set(a.marks ?? []);
      const same = (x: ReadonlySet<number>, y: ReadonlySet<number>) =>
        x.size === y.size && [...x].every((i) => y.has(i));
      const ghosts = a.ghosts ?? [];
      const sameGhosts =
        ghosts.length === s.soundingGhosts.length &&
        ghosts.every((g, i) => g === s.soundingGhosts[i]);
      const chords = a.chords ?? [];
      const sameChords =
        chords.length === s.soundingChords.length &&
        chords.every((c, i) => c === s.soundingChords[i]);
      return same(next, s.sounding) && same(marks, s.soundingMarks) && sameGhosts && sameChords
        ? s
        : {
            ...s,
            sounding: next,
            soundingMarks: marks,
            soundingGhosts: ghosts,
            soundingChords: chords,
          };
    }
    case 'templates/set':
      return {
        ...s,
        templates: a.templates.slice(0, MAX_TEMPLATES),
        chordPick: null,
        chordHover: null,
      };
    case 'keys/shift': {
      const shift = clampShift(s.keys.shift + a.by);
      return shift === s.keys.shift ? s : { ...s, keys: { ...s.keys, shift } };
    }
    case 'keys/page': {
      const last = Math.max(0, Math.ceil(s.shelf.chords.length / CHORD_PAGE) - 1);
      const page = Math.min(last, Math.max(0, Math.min(s.keys.page, last) + Math.sign(a.by)));
      return page === s.keys.page ? s : { ...s, keys: { ...s.keys, page } };
    }
    case 'keys/link':
      return a.id === s.keys.link ? s : { ...s, keys: { ...s.keys, link: a.id } };
    case 'ui': {
      const ui = { ...s.ui, ...a.patch };
      // a change of keyboard mode or of the linked-melody option ends the link
      const keys =
        s.keys.link !== null &&
        (ui.keyboardMode !== s.ui.keyboardMode || ui.linkedMelody !== s.ui.linkedMelody)
          ? { ...s.keys, link: null }
          : s.keys;
      // the one Parallel | Relative switch also decides where the retuner's cards start (and resets its run)
      const relative = ui.modePlayback === 'relative';
      return {
        ...s,
        ui,
        keys,
        retuner:
          relative === s.retuner.relative
            ? s.retuner
            : retunerReduce(s.retuner, { type: 'ret/relative', relative }, ui.baseHz),
      };
    }
    case 'viz':
      return {
        ...s,
        ui: { ...s.ui, viz: { ...s.ui.viz, [a.id]: { ...s.ui.viz[a.id], ...a.patch } } },
      };
    case 'layout': {
      const layout = a.fn(s.layout);
      return layout === s.layout ? s : { ...s, layout };
    }
    case 'shelf/stash': {
      const t = activeTab(s);
      const st = a.stash;
      const set = subsetFromSelection(t.field, t.sel, t.mode);
      const shelf = stashChord(s.shelf, {
        name: st.name,
        pitches: st.pitches,
        template: st.template ?? null,
        rootDeg: st.rootDeg ?? null,
        tol: s.ui.tol,
        date: st.date,
        refHz: s.ui.baseHz,
        frame: s.ui.modePlayback,
        parent: t.fromChord ?? null,
        source: set.pitches.length
          ? { gen: cloneGen(t.gen, t.gen.preset), subset: set, tab: tabName(t) }
          : null,
      });
      return shelf === s.shelf ? s : { ...s, shelf };
    }
    case 'shelf/reload':
      return reloadChord(s, a.id);
    case 'shelf/rename':
    case 'shelf/move':
    case 'shelf/delete':
    case 'shelf/select':
    case 'shelf/selectAll':
    case 'shelf/clear':
    case 'shelf/selectNone':
    case 'shelf/sync':
    case 'sketch/set':
    case 'sketch/arm':
    case 'sketch/disarm': {
      const shelf = shelfReduce(s.shelf, a);
      return shelf === s.shelf ? s : { ...s, shelf };
    }
    case 'ret/add':
    case 'ret/rename':
    case 'ret/move':
    case 'ret/delete':
    case 'ret/home':
    case 'ret/settings':
    case 'ret/on':
    case 'ret/reset':
    case 'ret/relative':
    case 'ret/down':
    case 'ret/up':
    case 'ret/release':
    case 'ret/retune': {
      const retuner = retunerReduce(s.retuner, a, s.ui.baseHz);
      return retuner === s.retuner ? s : { ...s, retuner };
    }
  }
}
