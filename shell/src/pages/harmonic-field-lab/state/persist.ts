/**
 * Persistence of the lab (shell pattern: `loadSettings` / `saveSettings` / `sanitizeSettings`), page-local keys only.
 *
 *   hrifa.harmonic-field-lab.settings.v1   UiSettings (per-viewer UI: active panel, dock, tolerance, ring, sound ...)
 *   hrifa.harmonic-field-lab.layout.v1     the pinned-panel layout (migrated from the mock's ...mock.layout.v3 / v2 / v1)
 *   hrifa.harmonic-field-lab.tabs.v1       { list: [{ id, name, snap }], active }
 *   hrifa.harmonic-field-lab.subsets.v1    [{ id, name, ...snap }]   (saved subsets)
 *   hrifa.harmonic-field-lab.chordfinder.v1  { templates: [{ text, name?, family? }] }   (the chord templates)
 *   hrifa.harmonic-field-lab.retuner.v1    { cards: [{ name, snap }], settings: { pivot, manualDeg, anchor, trigger, scorer, scorerOpts, glideMs } }
 *
 * A `snap` is the prototype's snapshot shape (flat generator inputs, `selCents`, `mode`, pick/compare settings), every
 * field optional with a default, so an older snapshot still loads and a newer one with extra fields is read as far as it
 * goes. Sanitising is entry by entry: a bad entry is dropped or defaulted, never the whole list (a future new view or
 * panel therefore cannot wipe a stored layout). Nothing here throws; storage may be blocked.
 */
import { DEFAULT_TEMPLATES, PRESETS, type ChordTemplate } from '../../../lib/harmonic-field';
import { MODE_PLAYBACKS } from '../audio/plan';
import {
  DEFAULT_AXES,
  PRIME_SLOTS,
  defaultGen,
  type AxisSpec,
  type GenSpec,
  type Method,
} from './generate';
import {
  CMP_REFS,
  SCALE_DIRS,
  WAVES,
  defaultCmp,
  defaultUi,
  emptyPick,
  MAX_TABS,
  MAX_TEMPLATES,
  type CmpRef,
  type Saved,
  type Tab,
  type UiSettings,
} from './labState';
import {
  DEFAULT_LAYOUT,
  PANEL_IDS,
  VIZ_IDS,
  migrateV1,
  parseLayout,
  migrateV2,
  type Layout,
} from './layout';
import {
  ANCHORS,
  MAX_CARDS,
  MAX_GLIDE_MS,
  PIVOT_MODES,
  SCORER_IDS,
  TRIGGERS,
  defaultRetSettings,
  type RetCardSpec,
  type RetSettings,
} from './retuner';
import {
  DEFAULT_SETTINGS as DEFAULT_VIZ,
  ISO_G1,
  LAT_MODES,
  ISO_G2,
  ISO_TOLS,
  type VizSettings,
} from './vizState';

export const KEY_SETTINGS = 'hrifa.harmonic-field-lab.settings.v1';
export const KEY_LAYOUT = 'hrifa.harmonic-field-lab.layout.v1';
export const KEY_TABS = 'hrifa.harmonic-field-lab.tabs.v1';
export const KEY_SUBSETS = 'hrifa.harmonic-field-lab.subsets.v1';
export const KEY_CHORDFINDER = 'hrifa.harmonic-field-lab.chordfinder.v1';
export const KEY_RETUNER = 'hrifa.harmonic-field-lab.retuner.v1';
/** The mock's layout keys (read once, to migrate). */
export const MOCK_LAYOUT_KEYS = [
  'hrifa.harmonic-field-lab.mock.layout.v3',
  'hrifa.harmonic-field-lab.mock.layout.v2',
  'hrifa.harmonic-field-lab.mock.layout.v1',
] as const;

/* ---------------------------------------------------------------------------------------------- primitives */
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[], d: T): T =>
  allowed.includes(x as T) ? (x as T) : d;
const numIn = (x: unknown, min: number, max: number, d: number) =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : d;
const intIn = (x: unknown, min: number, max: number, d: number) => {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : d;
};
const text = (x: unknown, d: string, max = 4000) => (typeof x === 'string' ? x.slice(0, max) : d);

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}
/** Store a value; false when storage is unavailable or full (the page says so where it matters). */
function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------------------------------- UI */
function sanitizeViz(raw: unknown): VizSettings {
  const d = DEFAULT_VIZ;
  if (!isObj(raw)) {
    return { ...d };
  }
  const ax = raw.axes3;
  const axes3 =
    Array.isArray(ax) &&
    ax.length === 3 &&
    ax.every((p) => Number.isInteger(p) && p >= 3 && p <= 1000) &&
    new Set(ax).size === 3
      ? (ax as number[])
      : null;
  return {
    dim: oneOf(raw.dim, ['2d', '3d'], d.dim),
    axes3,
    labels: bool(raw.labels, d.labels),
    latMode: oneOf(raw.latMode, LAT_MODES, d.latMode),
    isoG1: oneOf(raw.isoG1, ISO_G1, d.isoG1),
    isoG2: oneOf(raw.isoG2, ISO_G2, d.isoG2),
    isoTol: (ISO_TOLS as readonly unknown[]).includes(raw.isoTol)
      ? (raw.isoTol as number)
      : d.isoTol,
    edoPick: ((n) => (n === -1 ? null : n))(intIn(raw.edoPick, 5, 72, -1)),
  };
}

/** Coerce whatever is in storage into valid UI settings, falling back per field. */
export function sanitizeSettings(raw: unknown): UiSettings {
  const d = defaultUi();
  if (!isObj(raw)) {
    return d;
  }
  const viz = isObj(raw.viz) ? raw.viz : {};
  return {
    panel: oneOf(raw.panel, PANEL_IDS, d.panel),
    dockOpen: bool(raw.dockOpen, d.dockOpen),
    tol: intIn(raw.tol, 0, 100, d.tol),
    ringView: oneOf(raw.ringView, ['chromatic', 'fifths'], d.ringView),
    ringSteps: [12, 17, 19, 31].includes(raw.ringSteps as number) ? (raw.ringSteps as number) : 12,
    ringGen: text(raw.ringGen, d.ringGen, 40),
    viz: Object.fromEntries(VIZ_IDS.map((id) => [id, sanitizeViz(viz[id])])) as UiSettings['viz'],
    wave: oneOf(raw.wave, WAVES, d.wave),
    baseHz: numIn(raw.baseHz, 20, 5000, d.baseHz),
    volume: numIn(raw.volume, 0, 1, d.volume),
    modeAtBase: bool(raw.modeAtBase, d.modeAtBase),
    scalePreview: oneOf(raw.scalePreview, SCALE_DIRS, d.scalePreview),
    // older settings had a separate "Mode root at 1/1 Hz" switch: off carries over as Relative
    modePlayback: oneOf(
      raw.modePlayback,
      MODE_PLAYBACKS,
      raw.modeAtBase === false ? 'relative' : d.modePlayback
    ),
    savedAll: bool(raw.savedAll, d.savedAll),
  };
}

export function loadSettings(): UiSettings {
  return sanitizeSettings(readJson(KEY_SETTINGS));
}
export function saveSettings(s: UiSettings): boolean {
  return writeJson(KEY_SETTINGS, s);
}

/* ------------------------------------------------------------------------------------------ chord templates */
/**
 * `{ templates: [{ text, name?, family? }] }`. Entry by entry: an entry without a text is dropped, over-long strings are
 * cut, at most 64 are kept. A text that is not a valid template is kept (the editor shows it and the finder skips it).
 * Anything that is not that shape, or an array whose every entry is bad, gives the defaults; a stored empty list is the
 * user's own choice and stays empty.
 */
export function sanitizeTemplates(raw: unknown): ChordTemplate[] {
  const defaults = () => DEFAULT_TEMPLATES.map((t) => ({ ...t }));
  const list = isObj(raw) ? raw.templates : undefined;
  if (!Array.isArray(list)) {
    return defaults();
  }
  const out: ChordTemplate[] = [];
  for (const e of list.slice(0, 1000)) {
    if (!isObj(e) || typeof e.text !== 'string' || !e.text.trim()) {
      continue;
    }
    const t: ChordTemplate = { text: e.text.trim().slice(0, 80) };
    if (typeof e.name === 'string' && e.name.trim()) {
      t.name = e.name.trim().slice(0, 60);
    }
    if (typeof e.family === 'string' && e.family.trim()) {
      t.family = e.family.trim().slice(0, 40);
    }
    out.push(t);
    if (out.length >= MAX_TEMPLATES) {
      break;
    }
  }
  return out.length === 0 && list.length > 0 ? defaults() : out;
}
export function loadTemplates(): ChordTemplate[] {
  return sanitizeTemplates(readJson(KEY_CHORDFINDER));
}
export function saveTemplates(templates: ChordTemplate[]): boolean {
  return writeJson(KEY_CHORDFINDER, { templates });
}

/* ------------------------------------------------------------------------------------------------- layout */
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Own key first; otherwise the mock's v3, v2 or v1 layout (the same shapes) is read once; otherwise the defaults. */
export function loadLayout(): Layout {
  const own = readRaw(KEY_LAYOUT);
  if (own !== null) {
    return parseLayout(own);
  }
  const [v3, v2, v1] = MOCK_LAYOUT_KEYS.map(readRaw);
  if (v3 !== null) {
    return parseLayout(v3);
  }
  if (v2 !== null) {
    return migrateV2(v2);
  }
  return v1 !== null ? migrateV1(v1) : DEFAULT_LAYOUT;
}
export function saveLayout(l: Layout): boolean {
  return writeJson(KEY_LAYOUT, l);
}

/* ------------------------------------------------------------------------------------------------ snapshots */
const SNAP_GEN: Record<Method, string> = {
  harmonic: 'harmonic',
  sub: 'subharmonic',
  edo: 'edo',
  lattice: 'additive',
  cps: 'cps',
  custom: 'custom',
};
const GEN_SNAP: Record<string, Method> = Object.fromEntries(
  Object.entries(SNAP_GEN).map(([k, v]) => [v, k as Method])
);

/** The flat shape stored for a tab or a saved subset (the prototype's snapshot, plus optional extras). */
export interface Snapshot {
  gen: string;
  rep: string;
  h: number;
  edoN: number;
  axes: { on: boolean; g: string; n: number; ctr: number }[];
  shape: string;
  dist: number;
  bidir: boolean;
  cpsF: string;
  cpsK: number;
  custom: string;
  mask: boolean[];
  selCents: number[];
  mode: number;
  preset: string;
  keepNew: boolean;
  pickScale: string;
  pickKind: string;
  pickStretch: boolean;
  pickM: number;
  pickOdd: number;
  pickRef: unknown;
  cmpRef: string;
  cmpOdd: number;
  cmpM: number;
}

export interface TabParts {
  gen: GenSpec;
  selCents: number[];
  mode: number;
  cmp: Tab['cmp'];
  pick: Tab['pick'];
}

export function toSnapshot(
  t: Pick<Tab, 'gen' | 'sel' | 'field' | 'mode' | 'cmp' | 'pick' | 'pending'>
): Snapshot {
  const g = t.gen;
  // a tab whose inputs did not build keeps the selection it was restored with
  const held = t.pending && t.field.length === 0 ? t.pending : null;
  return {
    gen: SNAP_GEN[g.method],
    rep: g.rep,
    h: g.h,
    edoN: g.edoN,
    axes: g.axes.map((a) => ({ ...a })),
    shape: g.shape,
    dist: g.dist,
    bidir: g.bidir,
    cpsF: g.cpsF,
    cpsK: g.cpsK,
    custom: g.custom,
    mask: g.mask.slice(),
    selCents: held ? held.cents.slice() : t.sel.map((i) => t.field[i].c),
    mode: held ? held.mode : t.mode,
    preset: g.preset,
    keepNew: g.keepNew,
    pickScale: t.pick.scale,
    pickKind: t.pick.kind,
    pickStretch: t.pick.stretch,
    pickM: t.pick.m,
    pickOdd: t.pick.odd,
    pickRef: t.pick.ref,
    cmpRef: t.cmp.ref,
    cmpOdd: t.cmp.odd,
    cmpM: t.cmp.m,
  };
}
export const savedToSnapshot = (s: Saved): Snapshot => ({
  ...toSnapshot({
    gen: s.gen,
    sel: [],
    field: [],
    mode: s.mode,
    cmp: defaultCmp(),
    pick: emptyPick(),
  }),
  selCents: s.selCents.slice(),
});

function sanitizeAxes(raw: unknown): AxisSpec[] {
  const list = Array.isArray(raw) ? raw : [];
  return DEFAULT_AXES.map((d, i) => {
    const a = list[i];
    if (!isObj(a)) {
      return { ...d };
    }
    return {
      on: i === 0 ? true : bool(a.on, d.on),
      g: text(a.g, d.g, 60),
      n: intIn(a.n, 1, 2048, d.n),
      ctr: intIn(a.ctr, 0, 2048, d.ctr),
    };
  });
}

function sanitizePickRef(raw: unknown): Tab['pick']['ref'] {
  if (!isObj(raw) || !Array.isArray(raw.targets)) {
    return null;
  }
  const targets = raw.targets
    .filter(
      (t): t is { c: number; label?: unknown } =>
        isObj(t) && typeof t.c === 'number' && Number.isFinite(t.c)
    )
    .map((t) => ({ c: t.c, label: text(t.label, '', 20) }));
  if (!targets.length) {
    return null;
  }
  return {
    name: text(raw.name, 'scale', 80),
    kind: raw.kind === 'ji' ? 'ji' : 'edo12',
    stretch: bool(raw.stretch, false),
    targets,
  };
}

/** One snapshot into its parts; null when it is not an object. Every field falls back to its default. */
export function sanitizeSnapshot(raw: unknown): TabParts | null {
  if (!isObj(raw)) {
    return null;
  }
  const d = defaultGen();
  // the prototype stored the preset as an index into its list; this lab stores the name
  let preset = typeof raw.preset === 'string' ? raw.preset : '';
  if (/^\d+$/.test(preset)) {
    preset = PRESETS[Number(preset)]?.name ?? '';
  } else if (preset && !PRESETS.some((p) => p.name === preset)) {
    preset = '';
  }
  const mask =
    Array.isArray(raw.mask) && raw.mask.length === PRIME_SLOTS
      ? raw.mask.map((b) => b !== false)
      : d.mask;
  const gen: GenSpec = {
    preset,
    method: typeof raw.gen === 'string' && raw.gen in GEN_SNAP ? GEN_SNAP[raw.gen] : d.method,
    rep: text(raw.rep, d.rep, 60) || d.rep,
    h: intIn(raw.h, 1, 100000, d.h),
    edoN: intIn(raw.edoN, 1, 2048, d.edoN),
    shape: raw.shape === 'diamond' ? 'diamond' : 'box',
    axes: sanitizeAxes(raw.axes),
    dist: intIn(raw.dist, 0, 64, d.dist),
    bidir: bool(raw.bidir, d.bidir),
    cpsF: text(raw.cpsF, d.cpsF, 400),
    cpsK: intIn(raw.cpsK, 1, 64, d.cpsK),
    custom: text(raw.custom, d.custom, 20000),
    mask,
    keepNew: bool(raw.keepNew, false),
  };
  const dc = defaultCmp();
  return {
    gen,
    selCents: Array.isArray(raw.selCents)
      ? raw.selCents
          .filter((c): c is number => typeof c === 'number' && Number.isFinite(c))
          .slice(0, 4096)
      : [],
    mode: intIn(raw.mode, 0, 100000, 0),
    cmp: {
      ref: oneOf<CmpRef>(raw.cmpRef, CMP_REFS, dc.ref),
      odd: intIn(raw.cmpOdd, 1, 255, dc.odd),
      m: intIn(raw.cmpM, 1, 1000, dc.m),
    },
    pick: {
      ...emptyPick(),
      scale: text(raw.pickScale, 'ed', 80),
      kind: raw.pickKind === 'ji' ? 'ji' : 'edo12',
      stretch: bool(raw.pickStretch, false),
      m: intIn(raw.pickM, 1, 1000, 12),
      odd: intIn(raw.pickOdd, 1, 255, 15),
      ref: sanitizePickRef(raw.pickRef),
    },
  };
}

/* ------------------------------------------------------------------------------------------------- tabs */
export interface StoredTab extends TabParts {
  id: string;
  name: string | null;
}
export interface StoredTabs {
  tabs: StoredTab[];
  active: number;
}

/** The stored tab list; a bad entry is dropped, no valid entry at all gives null (the caller starts fresh). */
export function sanitizeTabs(raw: unknown): StoredTabs | null {
  if (!isObj(raw) || !Array.isArray(raw.list)) {
    return null;
  }
  const seen = new Set<string>();
  const tabs: StoredTab[] = [];
  for (const entry of raw.list.slice(0, MAX_TABS * 2)) {
    if (!isObj(entry) || tabs.length >= MAX_TABS) {
      continue;
    }
    const parts = sanitizeSnapshot(entry.snap);
    if (!parts) {
      continue;
    }
    let id = typeof entry.id === 'string' && /^t\d{1,6}$/.test(entry.id) ? entry.id : '';
    if (!id || seen.has(id)) {
      id = `t${tabs.length + 1}`;
      while (seen.has(id)) {
        id = `t${Number(id.slice(1)) + 1}`;
      }
    }
    seen.add(id);
    const name =
      typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 60) : null;
    tabs.push({ ...parts, id, name });
  }
  if (!tabs.length) {
    return null;
  }
  return { tabs, active: intIn(raw.active, 0, tabs.length - 1, 0) };
}

export function loadTabs(): StoredTabs | null {
  return sanitizeTabs(readJson(KEY_TABS));
}
export function saveTabs(tabs: Tab[], active: number): boolean {
  return writeJson(KEY_TABS, {
    active,
    list: tabs.map((t) => ({ id: t.id, name: t.name, snap: toSnapshot(t) })),
  });
}

/* ---------------------------------------------------------------------------------------------- subsets */
/** The saved subsets; a bad entry is dropped. */
export function sanitizeSubsets(raw: unknown): Saved[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Saved[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const parts = sanitizeSnapshot(entry);
    if (!parts || !isObj(entry)) {
      continue;
    }
    let id = typeof entry.id === 'string' && /^s\d{1,6}$/.test(entry.id) ? entry.id : '';
    if (!id || seen.has(id)) {
      id = `s${out.length + 1}`;
      while (seen.has(id)) {
        id = `s${Number(id.slice(1)) + 1}`;
      }
    }
    seen.add(id);
    const name =
      typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim().slice(0, 60)
        : `Subset ${out.length + 1}`;
    out.push({ id, name, gen: parts.gen, selCents: parts.selCents, mode: parts.mode });
  }
  return out;
}
export function loadSubsets(): Saved[] {
  return sanitizeSubsets(readJson(KEY_SUBSETS));
}
export function saveSubsets(saved: Saved[]): boolean {
  return writeJson(
    KEY_SUBSETS,
    saved.map((s) => ({ id: s.id, name: s.name, ...savedToSnapshot(s) }))
  );
}

/* ---------------------------------------------------------------------------------------------- retuner */
/** A card's snapshot cleaned into the plain stored shape (every field defaulted); null when it is not a snapshot. */
function cleanSnapshot(raw: unknown): Snapshot | null {
  const p = sanitizeSnapshot(raw);
  if (!p) {
    return null;
  }
  return {
    ...toSnapshot({ gen: p.gen, sel: [], field: [], mode: p.mode, cmp: p.cmp, pick: p.pick }),
    selCents: p.selCents,
  };
}

export interface StoredRetuner {
  cards: RetCardSpec[];
  settings: RetSettings;
}

/** Settings field by field (a bad field falls back to its default). */
export function sanitizeRetSettings(raw: unknown): RetSettings {
  const d = defaultRetSettings();
  if (!isObj(raw)) {
    return d;
  }
  const o = isObj(raw.scorerOpts) ? raw.scorerOpts : {};
  return {
    pivot: oneOf(raw.pivot, PIVOT_MODES, d.pivot),
    manualDeg: intIn(raw.manualDeg, 0, 255, d.manualDeg),
    anchor: oneOf(raw.anchor, ANCHORS, d.anchor),
    trigger: oneOf(raw.trigger, TRIGGERS, d.trigger),
    scorer: oneOf(raw.scorer, SCORER_IDS, d.scorer),
    scorerOpts: {
      harmonics: intIn(o.harmonics, 1, 16, d.scorerOpts.harmonics),
      rolloff: numIn(o.rolloff, 0.01, 1, d.scorerOpts.rolloff),
      oddLimit: intIn(o.oddLimit, 1, 255, d.scorerOpts.oddLimit),
    },
    glideMs: intIn(raw.glideMs, 0, MAX_GLIDE_MS, d.glideMs),
  };
}

/**
 * `{ cards: [{ name, snap }], settings }`. Entry by entry: a card without a usable snapshot is dropped (the rest is kept),
 * names are cut to 60 characters and defaulted, at most 24 cards. Anything that is not that shape gives no cards and the
 * default settings.
 */
export function sanitizeRetuner(raw: unknown): StoredRetuner {
  if (!isObj(raw)) {
    return { cards: [], settings: defaultRetSettings() };
  }
  const cards: RetCardSpec[] = [];
  for (const e of Array.isArray(raw.cards) ? raw.cards.slice(0, MAX_CARDS * 2) : []) {
    const snap = isObj(e) ? cleanSnapshot(e.snap) : null;
    if (!isObj(e) || !snap || cards.length >= MAX_CARDS) {
      continue;
    }
    const name =
      typeof e.name === 'string' && e.name.trim()
        ? e.name.trim().slice(0, 60)
        : `Card ${cards.length + 1}`;
    cards.push({ name, snap });
  }
  return { cards, settings: sanitizeRetSettings(raw.settings) };
}
export function loadRetuner(): StoredRetuner {
  return sanitizeRetuner(readJson(KEY_RETUNER));
}
export function saveRetuner(cards: readonly RetCardSpec[], settings: RetSettings): boolean {
  return writeJson(KEY_RETUNER, {
    cards: cards.map((c) => ({ name: c.name, snap: c.snap })),
    settings,
  });
}
