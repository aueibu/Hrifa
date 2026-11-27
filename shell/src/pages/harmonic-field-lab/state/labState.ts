/**
 * The lab's one state: tabs (each a pitch collection with its subset), saved subsets, what is pointed at or sounding,
 * the UI settings and the pinned-panel layout. A pure reducer, no React: every rule is testable without rendering.
 *
 * Nothing here is derived analysis (see derive.ts) and nothing here touches storage (see persist.ts). The field of a tab
 * is part of the state (built by `generateField`) so selection can be carried across a regeneration inside the reducer.
 */
import {
  DEFAULT_TEMPLATES,
  HE_BLUR_DEFAULT,
  EPS,
  addLibraryEntries,
  addedPitchError,
  RELATIVE_MAX_NOTES,
  addProductNotes,
  addRelativeNote,
  clampExp,
  MONZO_PRIMES,
  productTooMany,
  noteText,
  readNoteText,
  reduceInto,
  removeRelativePitch,
  zeroMonzo,
  type MonzoExps,
  pitchPlace,
  resolveSubset,
  subsetFromSelection,
  type UpdateReport,
  SCALE_LIBRARY,
  carrySelection,
  compositeNotes,
  fmtRatio,
  melakarta,
  mergeComposite,
  mod,
  nearestEdSubset,
  nearestScaleSubset,
  oddLimitSubset,
  scaleTargets,
  scaleTargetsLabeled,
  type ChordTemplate,
  type LibraryEntry,
  type Note,
  type TargetPoint,
} from '../../../lib/harmonic-field';
import { CHORD_PAGE, clampShift, type KeyboardMode, type LinkedRoot } from '../audio/keymap';
import type { ModePlayback, ScaleDir } from '../audio/plan';
import { defaultReverb, type ReverbSettings } from '../audio/reverb';
import {
  cloneSource,
  emptyShelf,
  shelfReduce,
  stashChord,
  type ShelfAction,
  type ShelfState,
} from './chordShelf';
import {
  compositesReduce,
  emptyComposites,
  type CompositeAction,
  type CompositesState,
} from './composites';
import {
  createFolder,
  deleteFolder,
  deleteFolderTree,
  describeFolder,
  renameFolder,
  type FolderResult,
} from './folderRecords';
import {
  autoName,
  capOddLimit,
  defaultGen,
  genFromPreset,
  genKey,
  generateField,
  presetByName,
  type CompositeSnap,
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
  describePreset,
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
import { REL_COLOR_DEFAULT, type RelColor } from './intervalColor';
import { REACH_DEFAULT, type ReachSettings } from './jiReach';
import { DEFAULT_LAYOUT, type Layout, type PanelId, type VizId } from './layout';
import type { LibSort } from './librarySort';
import {
  MAX_LIB_OPEN,
  addChecked,
  defaultLibFilters,
  sameLibFilters,
  sanitizeKeyList,
  sanitizeLibFilters,
  setOpen,
  type LibCmp,
  type LibFilters,
} from './libraryState';
import {
  defaultPatterns,
  patternsReduce,
  type PatternAction,
  type PatternsState,
} from './patterns';
import { emptyPins, type Pins } from './pins';
import { MONZO_SPLIT_DEFAULT, type MonzoSplit } from './primeSplit';
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

/** Pairs panel Color control: no color, the error severities, or the interval wheel. */
export type PairsColor = 'off' | 'error' | 'interval';
export const PAIRS_COLORS: readonly PairsColor[] = ['off', 'error', 'interval'];

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
  /** Legacy (M9): the pattern the Positional section used to show. Still loaded and saved so stored data survives, but since M8f every pattern is its own group and nothing reads it. Optional in storage. */
  positionalPattern: string | null;
  /** The Positional list order (M8e): Smoothest (default) or Scale order. Optional in storage. */
  positionalOrder: 'smoothest' | 'scale';
  /** Folded sections of the Chords panel (M8f): ids to true when folded (see `foldId`; `Record<string, boolean>`, only true is stored); absent = open. Ids starting `grp:` mean the opposite: a stored `grp:` id is an EXPANDED shape group (M8i). Optional in storage. */
  folds: Record<string, boolean>;
  /** M8i: merge chords with the same shape on different roots into one card (default true). Optional in storage. */
  groupShapes: boolean;
  /** M4 (H-24): the order of the cards inside a Chords-panel row and of the roots inside a shape group: Default (today's order), Root or Simplicity. Optional in storage. */
  chordSort: 'default' | 'root' | 'simplicity';
  /** M4 (H-24): reverse the active chord sort (Default included; default false). Optional in storage. */
  chordSortReverse: boolean;
  /** The Pairs panel Color control (M1, Scala-tools arc): Off (default), Error or Interval. Optional in storage. */
  pairsColor: PairsColor;
  /** Relative picker (M8e, H-34): how the bands are turned, From note (start at the source note's angle) or Fixed (unison at noon). Optional in storage. */
  relBands: 'from' | 'fixed';
  /** Relative picker (M8f, H-35): the interval pin bar's two ordered lists of exact ratio texts (ring pins for Rings and Near, monzo pins for Monzo), at most 128 each, no duplicates. Optional in storage. */
  pins: Pins;
  /** Relative picker (M8o, H-37): the Color menu shared by Rings, Near and Monzo and the pin cards: metric (Off, Prime default, Tenney, Odd limit, Error, Interval, Roughness), range (Fixed default | Fit to view) and the Monzo octave (Exact default | Reduced). Optional in storage. */
  relColor: RelColor;
  /** Relative picker (M9f, H-42): the Monzo header's per-prime complexity split: Norm (L1 default, L2, L-inf), Count octaves (default on) and Fit (default off). Optional in storage. */
  monzoSplit: MonzoSplit;
  /** Harmonic entropy (M9, H-39): the blur s in cents, 8 to 20 (default 17), one value for the Dissonance view, the picker Color metric and the Near overlay. Optional in storage. */
  heBlur: number;
  /** JI reach view (M10, H-43): the odd limit (5, 7, 9, 11, 13 or 15; default 7) and the tolerance in cents (0 to 100; default 15). Optional in storage. */
  reach: ReachSettings;
  /** The Pairs panel's added pitches (M3, H-20): canonical texts ("3/2", "701.955 c"), at most 4. Optional in storage. */
  pairsAdded: string[];
  /** The chord library dialog's search text and filters, Checked only included (M7c, H-30); kept when the dialog closes and across reloads. Optional in storage. */
  libFilters: LibFilters;
  /** The keys of the rows checked in the chord library, oldest first, at most 40 (M7c, H-30). Keys the library no longer has are dropped when it is read. Optional in storage. */
  libChecked: string[];
  /** The ids of the library shapes that are open (M7c, H-30). Optional in storage. */
  libOpen: string[];
  /** What the library ring compares a chord with: the whole field (default) or the subset (M7c, H-30). Optional in storage. */
  libCmp: LibCmp;
  /** The width of the chord library's ring panel in rem, set by dragging the splitter in the dialog (20 to 64; default 36). The ring scales with it. Optional in storage. */
  libSplit: number;
  /** The chord library table's sort (the column header last clicked and its direction), or null for the library's own order. Kept across reloads. Optional in storage. */
  libSort: LibSort | null;
  /** The shared reverb (A1, H-31): preset and mix; default Dry, mix 0 (the sound is unchanged). The impulse file is in IndexedDB, not here. Optional in storage. */
  reverb: ReverbSettings;
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

/**
 * Runtime state of the Relative pitches menu (M8, H-33; never stored, reset on reload): the Monzo exponents (kept between
 * menu openings, zeroed by Reset) and the last quiet line (a duplicate, a refused delete, the cap).
 */
export interface RelativeRuntime {
  monzo: MonzoExps;
  message: string | null;
  /** M8e: a request from the generator column's Rings | Near | Monzo buttons to open the picker in that view (the ring panel acts on it; `n` makes each press new). */
  open?: { view: RelativeOpenView; n: number } | null;
  /** M8g: the Product dialog's preview, the products not yet in the field (cents), drawn as ghost marks on the main ring while the dialog is open. */
  productGhosts?: readonly number[] | null;
}
export type RelativeOpenView = 'rings' | 'near' | 'monzo';

export interface Notice {
  kind: 'update' | 'copy';
  owner: OwnerKey;
  /** The generator's name when the notice was made. */
  name: string;
  report: UpdateReport;
  /** Update only: restores the generator and its exact previous subsets. */
  undo: UpdateUndo | null;
}

/** One sounding pitch: cents above 1/1 as played, and the field index it lights (-1 for none). */
export interface SoundingPitch {
  c: number;
  src: number;
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
  /** The hovered chord's real pitches (cents above 1/1, stacked octaves kept) when its card carries them; else null. */
  chordHoverPitches: readonly number[] | null;
  chordPick: ReadonlySet<number> | null;
  /** A saved subset pointed at: shown on the ring and strip instead of the selection. */
  preview: readonly number[] | null;
  /** Field indices that sound right now (every view lights them). */
  sounding: ReadonlySet<number>;
  /** Field indices whose strip mark alone is lit: a pure target tone that is no field note (a Shift+click on a strip note). */
  soundingMarks: ReadonlySet<number>;
  /** Cents above 1/1 of sounding pitches that match no field note (drawn as ghost marks on the ring and strip). */
  soundingGhosts: readonly number[];
  /** Every sounding pitch as played (cents above 1/1 from the real Hz, stacked octaves kept) and the field note it lights (-1 none). */
  soundingPitches: readonly SoundingPitch[];
  /** Shelf chord ids that sound now (a chord key, hold 1, a click, Play selected): their Shelf cards light. Runtime only. */
  soundingChords: readonly string[];
  ui: UiSettings;
  layout: Layout;
  /** The chord finder's templates (user-editable; stored in `...chordfinder.v1`). */
  templates: ChordTemplate[];
  /**
   * M7: the outcome of the last `templates/addLibrary` (a chord added from the library, or the sentence saying why nothing
   * was): runtime only, never stored; ended by the next `templates/set` or `templates/addLibrary`.
   */
  templateNote: { text: string; refused: boolean } | null;
  /** The positional chord patterns (M9): the user's list, stored in `...patterns.v1` (see patterns.ts). */
  patterns: PatternsState;
  /** The retuner: card list, settings (stored in `...retuner.v1`) and the run (see retuner.ts). */
  retuner: RetState;
  /** The chord shelf: stashed chords, selection, sketch row (stored in `...chordshelf.v1`, see chordShelf.ts). */
  shelf: ShelfState;
  /** The composite gamuts (M8c): up to nine, stored in `...composites.v1` (see composites.ts). */
  composites: CompositesState;
  /** The computer keys' runtime state: melody shift, shelf page, linked chord (M8b). */
  keys: KeysRuntime;
  /** The Relative pitches menu's runtime state (M8, H-33). */
  relative: RelativeRuntime;
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
    positionalPattern: null,
    positionalOrder: 'smoothest',
    folds: {},
    groupShapes: true,
    chordSort: 'default',
    chordSortReverse: false,
    pairsColor: 'off',
    relBands: 'from',
    pins: emptyPins(),
    relColor: { ...REL_COLOR_DEFAULT },
    monzoSplit: { ...MONZO_SPLIT_DEFAULT },
    heBlur: HE_BLUR_DEFAULT,
    reach: { ...REACH_DEFAULT },
    pairsAdded: [],
    libFilters: defaultLibFilters(),
    libChecked: [],
    libOpen: [],
    libCmp: 'field',
    libSplit: 36,
    libSort: null,
    reverb: defaultReverb(),
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
    chordHoverPitches: null,
    chordPick: null,
    preview: null,
    sounding: new Set(),
    soundingMarks: new Set(),
    soundingGhosts: [],
    soundingPitches: [],
    soundingChords: [],
    ui: defaultUi(),
    layout: DEFAULT_LAYOUT,
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
    templateNote: null,
    patterns: defaultPatterns(),
    retuner: initialRetuner(),
    shelf: emptyShelf(),
    composites: emptyComposites(),
    keys: { shift: 0, page: 0, link: null },
    relative: { monzo: zeroMonzo(), message: null },
  };
}

/** The name a tab shows. */
export const tabName = (t: Tab): string => t.name ?? autoName(t.gen);
export const activeTab = (s: LabState): Tab => s.tabs[s.active] ?? s.tabs[0];

/** Add pitch checks (M3) against the active tab's subset: its notes' places above 1/1 and the stored added pitches. */
export function checkAddedPitch(s: LabState, text: string) {
  const t = activeTab(s);
  const places = t.sel.map((i) => pitchPlace(t.field[i]?.c ?? 0, t.rep.c));
  return addedPitchError(text, places, s.ui.pairsAdded, t.rep.c);
}

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
  /** M6: the odd limit filter; null (or anything that is not a whole number of at least 1) clears it. */
  | { type: 'gen/oddLimit'; limit: number | null }
  | { type: 'gen/preset'; name: string }
  | { type: 'gen/method'; method: Method }
  | { type: 'gen/custom'; custom: string; rep?: string }
  /** Clear (Cust and Rel only; any other method: no change): Cust text emptied, Rel notes back to just 1/1. */
  | { type: 'gen/clear' }
  /** Make cust: the current field becomes the Cust text and the tab switches to Cust (no change when already Cust). */
  | { type: 'gen/makeCust' }
  /**
   * Relative pitches (M8, H-33), on the active tab when its method is `relative` (else no change): add a note as pitch text
   * (a ratio `11/8` or cents `700 c`, folded into the repeat; a pitch already there, unreadable text or the 256 cap changes
   * nothing and leaves a quiet line in `relative.message`).
   */
  | { type: 'relative/add'; text: string }
  /** Remove the note at this FIELD index (every stored note that folds to that pitch); 1/1 is refused with a quiet line (it always stays). */
  | { type: 'relative/remove'; index: number }
  /**
   * M8p: the picker hands back its painted Monzo once, when it closes (clamped to -12..+12; runtime only). Painting itself is local
   * to the picker (`useLocalMonzo`): do not add a per-cell dispatch here, it re-renders the whole page on every cell.
   */
  | { type: 'relative/monzoSet'; monzo: MonzoExps }
  /** Clear the quiet line. */
  | { type: 'relative/dismiss' }
  | { type: 'relative/open'; view: RelativeOpenView }
  /** M8g: the Product dialog's ghost preview (cents of the products not in the field; null clears it). Runtime only. */
  | { type: 'product/preview'; cents: readonly number[] | null }
  /**
   * M8g: a subset product as a field. `pitches` are the distinct products as pitch text. `product/tab` opens a NEW Relative tab
   * (1/1 and the products) from any method and activates it; `product/replace` makes the active tab's field 1/1 and the products (a
   * non-Relative tab becomes Relative). Either way the subset becomes exactly the products. Over the 256-note limit, at the tab cap or
   * with inputs that do not build: nothing changes (a line in `relative.message`).
   */
  | { type: 'product/tab'; pitches: readonly string[] }
  | { type: 'product/replace'; pitches: readonly string[] }
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
  | {
      type: 'preset/save';
      name: string;
      folder: string;
      copySubsets?: boolean;
      /** M5: the new preset's description (optional; cleaned, empty = none). */
      description?: string;
    }
  | { type: 'preset/rename'; id: string; name: string }
  /** M5: set a user preset's description; empty text removes it. */
  | { type: 'preset/describe'; id: string; description: string }
  | { type: 'preset/move'; id: string; folder: string }
  | { type: 'preset/delete'; id: string }
  | { type: 'preset/update' }
  /**
   * M5 folder records (`folderRecords.ts`): `path` is a user folder path under My presets. A refusal leaves the state as it
   * was except `refusal` (a plain sentence, cleared by the next library action, like the other library refusals). `rename`
   * takes the NEW FULL PATH.
   */
  | { type: 'folder/create'; path: string }
  | { type: 'folder/describe'; path: string; description: string }
  | { type: 'folder/delete'; path: string }
  | { type: 'folder/delete-tree'; path: string }
  | { type: 'folder/rename'; from: string; to: string }
  | { type: 'tab/link'; owner: OwnerKey | null }
  | { type: 'notice/undo' }
  | { type: 'notice/dismiss' }
  | { type: 'recent/push'; owner: OwnerKey }
  | { type: 'templates/set'; templates: ChordTemplate[] }
  /**
   * M7: add chord library entries to the templates, all or nothing (`addLibraryEntries`, in the active tab's repeat, up to
   * `MAX_TEMPLATES`). The outcome, added or refused with its sentence, is `templateNote`; a refusal changes nothing else.
   * M7c: a folding entry (two notes on one pitch in this repeat) is added too, stored as written; its sentence says the
   * finder skips it here.
   */
  | { type: 'templates/addLibrary'; entries: readonly LibraryEntry[] }
  | { type: 'hover'; i: number | null }
  | { type: 'pin'; i: number | null }
  | { type: 'pin/toggle'; i: number }
  | { type: 'chord/hover'; set: ReadonlySet<number> | null; pitches?: readonly number[] }
  | { type: 'chord/pick'; set: ReadonlySet<number> | null }
  | { type: 'preview'; idx: readonly number[] | null }
  | {
      type: 'sounding';
      idx: readonly number[];
      marks?: readonly number[];
      /** Sounding pitches (cents above 1/1) that match no field note. */
      ghosts?: readonly number[];
      /** Every sounding pitch as played. */
      pitches?: readonly SoundingPitch[];
      /** Shelf chord ids that sound. */
      chords?: readonly string[];
    }
  | { type: 'ui'; patch: Partial<UiSettings> }
  /** M7c (H-30): merges a patch into the chord library's filters (cleaned like stored ones); the same state when nothing changes. */
  | { type: 'lib/filters'; patch: Partial<LibFilters> }
  /** M7c: checks these library rows (each moves to the end; past 40 the oldest go). */
  | { type: 'lib/check'; keys: readonly string[] }
  /** M7c: unchecks every row. */
  | { type: 'lib/clearChecks' }
  /** M7c: opens or closes a library shape (`open` omitted toggles). */
  | { type: 'lib/open'; id: string; open?: boolean }
  /** M7c: the library's opened shapes become exactly these ids (Expand all passes the listed ones, Collapse all passes none). */
  | { type: 'lib/openSet'; ids: readonly string[] }
  /** M7c: what the ring compares a chord with. */
  | { type: 'lib/cmp'; cmp: LibCmp }
  /** Pairs panel Add pitch (M3, H-20): runs `addedPitchError` against the CURRENT subset; on any error or a duplicate the state is unchanged (the UI calls `checkAddedPitch` first to show the message). */
  | { type: 'pairs/addPitch'; text: string }
  /** Removes the added pitch at this index of `ui.pairsAdded`. */
  | { type: 'pairs/removePitch'; index: number }
  | { type: 'viz'; id: VizId; patch: Partial<VizSettings> }
  | { type: 'layout'; fn: (l: Layout) => Layout }
  | { type: 'shelf/stash'; stash: StashRequest }
  | { type: 'shelf/reload'; id: string }
  | ShelfAction
  | CompositeAction
  | PatternAction
  | RetAction;

/** What the UI hands `shelf/stash`: the exact pitches heard; everything else is read from the active tab and the settings. */
export interface StashRequest {
  pitches: Note[];
  template?: string | null;
  /** The chord root's degree in the active subset read from its mode root, when known. */
  rootDeg?: number | null;
  /** M9: the positional pattern when the chord is a positional one (`template` is then its display text). */
  pattern?: string | null;
  /** M8d: the positional tail line ("7 of 12-EDO · 400-300 c") when the chord is a positional one. */
  tail?: string | null;
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
  chordHoverPitches: null,
  chordPick: null,
  preview: null,
  sounding: new Set(),
  soundingMarks: new Set(),
  soundingGhosts: [],
  soundingPitches: [],
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

/**
 * Open a composite as a NEW tab at the end (current tabs untouched, the new one becomes active): a Composite generation method
 * holding a FROZEN snapshot of the merged notes (repeat, notes, the composite's number and name). Later edits or deletion of
 * the composite change nothing here; panels work on the tab like on any field. Nothing is written to the library. Refused
 * (a reason on `composites.refusal`) at the tab cap, for an empty composite, or when the snapshot does not build.
 */
function openComposite(
  s: LabState,
  id: number,
  merge?: { tol: number; keep: 'first' | 'recent' }
): LabState {
  const c = s.composites.list.find((x) => x.id === id);
  if (!c) {
    return s;
  }
  const refuse = (reason: string): LabState => ({
    ...s,
    composites: { ...s.composites, refusal: { reason } },
  });
  if (!c.items.length) {
    return refuse(`${c.name} is empty: add something to it first.`);
  }
  if (s.tabs.length >= MAX_TABS) {
    return refuse(`There are already ${MAX_TABS} tabs; close one first.`);
  }
  const merged = mergeComposite(c.items, activeTab(s).rep, merge);
  const snap: CompositeSnap = {
    id: c.id,
    name: c.name,
    rep: { m: merged.rep.m ? { ...merged.rep.m } : null, c: merged.rep.c },
    notes: compositeNotes(merged),
  };
  const gen: GenSpec = {
    ...defaultGen(),
    method: 'composite',
    rep: merged.rep.m ? fmtRatio(merged.rep) : `${merged.rep.c}c`,
    snap,
  };
  const tab = makeTab(`t${s.nextTab}`, gen);
  if (!tab.field.length) {
    return refuse(`${c.name} does not build a field: ${tab.err || 'no notes'}.`);
  }
  return clearPointers({
    ...s,
    tabs: [...s.tabs, tab],
    active: s.tabs.length,
    nextTab: s.nextTab + 1,
    composites: compositesReduce({ ...s.composites, refusal: null }, { type: 'composite/use', id }),
  });
}

/** The tab with its subset set to the field notes at these pitch texts (mode 0); unchanged when none is found. */
function selectPitchTexts(tab: Tab, pitches: readonly string[]): Tab {
  const rep = tab.rep.c;
  const places = pitches.flatMap((t) => {
    const n = readNoteText(t);
    return n ? [reduceInto(n, tab.rep).c] : [];
  });
  const near = (a: number, b: number) => {
    const d = Math.abs(a - b) % rep;
    return Math.min(d, rep - d) < 1e-4;
  };
  const sel = tab.field.flatMap((n, i) => (places.some((p) => near(n.c, p)) ? [i] : []));
  return sel.length ? { ...tab, sel, mode: 0 } : tab;
}

/**
 * Switching to Cust or Rel carries the tab's current field over as that method's own text, so a scale can be edited there:
 * Rel's `notes` are the field's pitch texts (`3/2`, `700 c`); Cust's `custom` is one pitch per line with no 1/1 (the parser adds
 * it) and cents written `700c` (a bare number would read as a ratio, and `700 c` would split into two tokens). An empty field
 * (the tab has an error) carries nothing, so the method keeps its own text. Only a Cust to Rel (or Rel to Cust) switch carries:
 * leaving a generated mode never overwrites hand-made text; `gen/makeCust` is the explicit way to take a generated field.
 */
function carriedText(t: Tab, to: Method): Partial<GenSpec> {
  if (!t.field.length || (t.gen.method !== 'custom' && t.gen.method !== 'relative')) {
    return {};
  }
  if (to === 'relative') {
    return { notes: t.field.slice(0, RELATIVE_MAX_NOTES).map(noteText) };
  }
  return to === 'custom' ? custText(t) : {};
}

function custText(t: Tab): Partial<GenSpec> {
  const lines = t.field
    .filter((n) => n.c > 1e-6)
    .map((n) => (n.m ? noteText(n) : `${Number(n.c.toFixed(6))}c`));
  return { custom: lines.join('\n') };
}

/**
 * M8g: a subset product as a field. `new` opens a new Relative tab (1/1 and the products) from any method, as the active tab;
 * `replace` makes the active tab's field 1/1 and the products (a Relative tab keeps its method, any other becomes Relative; the
 * saved generator it was linked to is untouched, the tab is just no longer exactly that preset). The subset becomes exactly the
 * products. Over the limit, at the tab cap or with inputs that do not build: nothing changes and `relative.message` says why.
 */
function applyProduct(s: LabState, pitches: readonly string[], how: 'new' | 'replace'): LabState {
  const t = activeTab(s);
  const refuse = (message: string): LabState => ({ ...s, relative: { ...s.relative, message } });
  const notes = addProductNotes(['1/1'], pitches, t.rep);
  if (notes.length > RELATIVE_MAX_NOTES) {
    return refuse(productTooMany(notes.length));
  }
  if (how === 'replace') {
    const out = editTab(s, (x) =>
      selectPitchTexts(
        regenTab({ ...x, mode: 0 }, { ...x.gen, method: 'relative', preset: '', notes }, true),
        pitches
      )
    );
    const now = activeTab(out);
    if (now.err && now.field === t.field) {
      return refuse(`The product does not build a field: ${now.err}.`);
    }
    return { ...out, relative: { ...out.relative, message: null } };
  }
  if (s.tabs.length >= MAX_TABS) {
    return refuse(`There are already ${MAX_TABS} tabs; close one first.`);
  }
  const gen: GenSpec = { ...defaultGen(), method: 'relative', rep: t.gen.rep, notes };
  const made = makeTab(`t${s.nextTab}`, gen);
  if (!made.field.length) {
    return refuse(`The product does not build a field: ${made.err || 'no notes'}.`);
  }
  return clearPointers({
    ...s,
    tabs: [...s.tabs, selectPitchTexts(made, pitches)],
    active: s.tabs.length,
    nextTab: s.nextTab + 1,
    relative: { ...s.relative, message: null },
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
  type === 'relative/add' ||
  type === 'relative/remove' ||
  type === 'product/tab' ||
  type === 'product/replace' ||
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
  type.startsWith('subset/') ||
  type.startsWith('preset/') ||
  type.startsWith('folder/') ||
  type === 'lib/sync';

const refuse = (s: LabState, reason: string): LabState => ({ ...s, refusal: { reason } });

/** A folder action's outcome: refused gives the reason in `refusal`; no change gives the same state; else the new library. */
const folderResult = (s: LabState, r: FolderResult): LabState =>
  r.refused !== undefined
    ? refuse(s, r.refused)
    : r.lib === s.library
      ? s
      : { ...s, library: r.lib };

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
        chordHoverPitches: null,
        chordPick: null,
        preview: null,
        sounding: new Set(),
        soundingMarks: new Set(),
        soundingGhosts: [],
        soundingPitches: [],
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
    case 'gen/oddLimit':
      return editTab(s, (t) => {
        const limit = capOddLimit(a.limit);
        const { oddLimit: _was, ...rest } = t.gen;
        return regenTab(t, { ...rest, preset: '', ...(limit === null ? {} : { oddLimit: limit }) });
      });
    case 'gen/preset': {
      const p = presetByName(a.name);
      return p ? openOwner(s, builtinKey(p.name)) : s;
    }
    case 'preset/open':
      return openOwner(s, a.owner);
    case 'gen/method':
      return editTab(s, (t) =>
        t.gen.method === a.method || (a.method === 'composite' && !t.gen.snap)
          ? t
          : regenTab(
              { ...t, mode: 0 },
              { ...t.gen, method: a.method, preset: '', ...carriedText(t, a.method) },
              true
            )
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
    case 'gen/makeCust':
      // Make cust: the current field becomes the Cust text and the tab switches to Cust (replacing any Cust text)
      return editTab(s, (t) =>
        t.gen.method === 'custom' || !t.field.length
          ? t
          : regenTab(
              { ...t, mode: 0 },
              { ...t.gen, method: 'custom', preset: '', ...custText(t) },
              true
            )
      );
    case 'gen/clear':
      // a fresh start for a hand-made scale: Cust loses its text, Rel keeps only 1/1; other methods are untouched
      return editTab(s, (t) =>
        t.gen.method === 'custom'
          ? regenTab(t, { ...t.gen, preset: '', custom: '' })
          : t.gen.method === 'relative'
            ? regenTab(t, { ...t.gen, preset: '', notes: ['1/1'] })
            : t
      );
    case 'relative/add':
    case 'relative/remove': {
      const t = activeTab(s);
      if (t.gen.method !== 'relative') {
        return s;
      }
      const notes = t.gen.notes ?? ['1/1'];
      let edit;
      if (a.type === 'relative/add') {
        edit = addRelativeNote(notes, a.text, t.rep);
      } else {
        const note = t.field[a.index];
        if (!note) {
          return s;
        }
        edit = removeRelativePitch(notes, note.c, t.rep);
      }
      if (edit.notes === notes) {
        return s.relative.message === edit.message
          ? s
          : { ...s, relative: { ...s.relative, message: edit.message } };
      }
      const out = editTab(s, (x) => regenTab(x, { ...x.gen, preset: '', notes: edit.notes }));
      return { ...out, relative: { ...out.relative, message: null } };
    }
    case 'relative/monzoSet': {
      // M8p: the picker hands back its painted monzo once, when it closes
      const next = zeroMonzo();
      for (const p of MONZO_PRIMES) {
        next[p] = clampExp(a.monzo[p]);
      }
      return MONZO_PRIMES.every((p) => s.relative.monzo[p] === next[p])
        ? s
        : { ...s, relative: { ...s.relative, monzo: next } };
    }
    case 'relative/dismiss':
      return s.relative.message === null ? s : { ...s, relative: { ...s.relative, message: null } };
    case 'relative/open':
      return {
        ...s,
        relative: { ...s.relative, open: { view: a.view, n: (s.relative.open?.n ?? 0) + 1 } },
      };
    case 'product/preview': {
      const cur = s.relative.productGhosts ?? null;
      const same =
        cur === a.cents ||
        (cur !== null &&
          a.cents !== null &&
          cur.length === a.cents.length &&
          cur.every((c, i) => c === a.cents![i]));
      return same ? s : { ...s, relative: { ...s.relative, productGhosts: a.cents } };
    }
    case 'product/tab':
      return applyProduct(s, a.pitches, 'new');
    case 'product/replace':
      return applyProduct(s, a.pitches, 'replace');
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
        const r = promoteUntitled(lib, o.ref, {
          name: a.name,
          folder: a.folder,
          description: a.description,
        });
        if (!r) {
          return refuse(s, 'Too many presets: delete one before saving another.');
        }
        lib = r.lib;
        key = r.key;
      } else {
        const r = saveUserPreset(lib, {
          name: a.name,
          folder: a.folder,
          gen: t.gen,
          description: a.description,
        });
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
      const cur = s.library.presets.find((p) => p.id === a.id);
      const nm = cleanName(a.name);
      if (cur && !nm) {
        return refuse(s, 'Give the preset a name.');
      }
      // a name another preset of the same folder already has is refused (the same preset keeping its name is no change)
      if (
        cur &&
        nm.toLowerCase() !== cur.name.toLowerCase() &&
        s.library.presets.some(
          (p) =>
            p.id !== cur.id && p.folder === cur.folder && p.name.toLowerCase() === nm.toLowerCase()
        )
      ) {
        return refuse(
          s,
          `A preset named ${nm} already exists in ${cur.folder === '' ? 'My presets' : cur.folder}.`
        );
      }
      const library = renamePreset(s.library, a.id, a.name);
      return library === s.library ? s : { ...s, library };
    }
    case 'preset/describe': {
      const library = describePreset(s.library, a.id, a.description);
      return library === s.library ? s : { ...s, library };
    }
    case 'folder/create':
      return folderResult(s, createFolder(s.library, a.path));
    case 'folder/describe':
      return folderResult(s, describeFolder(s.library, a.path, a.description));
    case 'folder/delete':
      return folderResult(s, deleteFolder(s.library, a.path));
    case 'folder/delete-tree': {
      // the folder with everything inside: each preset goes as `preset/delete` does (subsets stay under Auto-saved)
      const r = deleteFolderTree(s.library, a.path);
      if (r.refused !== undefined) {
        return refuse(s, r.refused);
      }
      if (r.lib === s.library) {
        return s;
      }
      const to = new Map(r.moved.map((m) => [m.from, m.to]));
      return {
        ...s,
        library: r.lib,
        tabs: s.tabs.map((t) =>
          t.link !== undefined && to.has(t.link) ? withLink(t, to.get(t.link) ?? null) : t
        ),
        notice: s.notice && to.has(s.notice.owner) ? null : s.notice,
        preview: r.moved.length > 0 ? null : s.preview,
      };
    }
    case 'folder/rename':
      return folderResult(s, renameFolder(s.library, a.from, a.to));
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
      return { ...s, chordHover: a.set, chordHoverPitches: a.pitches ?? null };
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
      const pitches = a.pitches ?? [];
      const samePitches =
        pitches.length === s.soundingPitches.length &&
        pitches.every(
          (p, i) => p.c === s.soundingPitches[i].c && p.src === s.soundingPitches[i].src
        );
      return same(next, s.sounding) &&
        same(marks, s.soundingMarks) &&
        sameGhosts &&
        sameChords &&
        samePitches
        ? s
        : {
            ...s,
            sounding: next,
            soundingMarks: marks,
            soundingGhosts: ghosts,
            soundingPitches: pitches,
            soundingChords: chords,
          };
    }
    case 'templates/set':
      return {
        ...s,
        templates: a.templates.slice(0, MAX_TEMPLATES),
        templateNote: null,
        chordPick: null,
        chordHover: null,
        chordHoverPitches: null,
      };
    case 'templates/addLibrary': {
      const r = addLibraryEntries(s.templates, a.entries, activeTab(s).rep.c, MAX_TEMPLATES);
      if (r.refused !== undefined) {
        return { ...s, templateNote: { text: r.refused, refused: true } };
      }
      if (!r.added.length) {
        return s;
      }
      return {
        ...s,
        templates: r.templates,
        templateNote: { text: r.message, refused: false },
        chordPick: null,
        chordHover: null,
        chordHoverPitches: null,
      };
    }
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
    case 'lib/filters': {
      const next = sanitizeLibFilters({ ...s.ui.libFilters, ...a.patch });
      return sameLibFilters(next, s.ui.libFilters)
        ? s
        : { ...s, ui: { ...s.ui, libFilters: next } };
    }
    case 'lib/check': {
      const next = addChecked(s.ui.libChecked, a.keys);
      return next === s.ui.libChecked ? s : { ...s, ui: { ...s.ui, libChecked: next as string[] } };
    }
    case 'lib/clearChecks':
      return s.ui.libChecked.length ? { ...s, ui: { ...s.ui, libChecked: [] } } : s;
    case 'lib/open': {
      const next = setOpen(s.ui.libOpen, a.id, a.open);
      return next === s.ui.libOpen ? s : { ...s, ui: { ...s.ui, libOpen: next as string[] } };
    }
    case 'lib/openSet': {
      const next = sanitizeKeyList(a.ids, MAX_LIB_OPEN);
      const same =
        next.length === s.ui.libOpen.length && next.every((id, i) => id === s.ui.libOpen[i]);
      return same ? s : { ...s, ui: { ...s.ui, libOpen: next } };
    }
    case 'lib/cmp':
      return a.cmp === s.ui.libCmp ? s : { ...s, ui: { ...s.ui, libCmp: a.cmp } };
    case 'pairs/addPitch': {
      const r = checkAddedPitch(s, a.text);
      return r.ok ? { ...s, ui: { ...s.ui, pairsAdded: [...s.ui.pairsAdded, r.canon] } } : s;
    }
    case 'pairs/removePitch':
      return a.index >= 0 && a.index < s.ui.pairsAdded.length
        ? { ...s, ui: { ...s.ui, pairsAdded: s.ui.pairsAdded.filter((_, i) => i !== a.index) } }
        : s;
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
        pattern: st.pattern ?? null,
        tail: st.tail ?? null,
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
    case 'shelf/describe':
    case 'shelf/move':
    case 'shelf/delete':
    case 'shelf/select':
    case 'shelf/selectAll':
    case 'shelf/clear':
    case 'shelf/selectNone':
    case 'shelf/sync':
    case 'sketch/set':
    case 'sketch/arm':
    case 'sketch/armPositional':
    case 'sketch/disarm': {
      const shelf = shelfReduce(s.shelf, a);
      return shelf === s.shelf ? s : { ...s, shelf };
    }
    case 'composite/openTab':
      return openComposite(s, a.id, a.merge);
    case 'patterns/add':
    case 'patterns/edit':
    case 'patterns/delete':
    case 'patterns/move':
    case 'patterns/restore':
    case 'patterns/sync': {
      const patterns = patternsReduce(s.patterns, a);
      return patterns === s.patterns ? s : { ...s, patterns };
    }
    case 'composite/new':
    case 'composite/rename':
    case 'composite/delete':
    case 'composite/clear':
    case 'composite/addItem':
    case 'composite/removeItem':
    case 'composite/use':
    case 'composite/sync': {
      const composites = compositesReduce(s.composites, a);
      return composites === s.composites ? s : { ...s, composites };
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
