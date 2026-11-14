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
import type { ScaleDir } from '../audio/plan';
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
import { DEFAULT_LAYOUT, type Layout, type PanelId, type VizId } from './layout';
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
export type { ScaleDir };
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
  /** Saved list: show subsets of every collection, not only the current one. */
  savedAll: boolean;
}

export interface LabState {
  tabs: Tab[];
  active: number;
  nextTab: number;
  saved: Saved[];
  nextSaved: number;
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
  ui: UiSettings;
  layout: Layout;
  /** The chord finder's templates (user-editable; stored in `...chordfinder.v1`). */
  templates: ChordTemplate[];
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
    savedAll: false,
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
    saved: [],
    nextSaved: 1,
    hover: null,
    pin: null,
    chordHover: null,
    chordPick: null,
    preview: null,
    sounding: new Set(),
    ui: defaultUi(),
    layout: DEFAULT_LAYOUT,
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
  };
}

/** The name a tab shows. */
export const tabName = (t: Tab): string => t.name ?? autoName(t.gen);
export const activeTab = (s: LabState): Tab => s.tabs[s.active] ?? s.tabs[0];

/** Selected indices that exist in a field of `n` notes. */
export const fixSel = (sel: readonly number[], n: number): number[] =>
  uniqSorted(sel.filter((i) => Number.isInteger(i) && i >= 0 && i < n));
const fixMode = (mode: number, count: number) =>
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
  | { type: 'tab/rename'; index: number; name: string }
  | { type: 'gen/patch'; patch: Partial<GenSpec> }
  | { type: 'gen/axis'; index: number; patch: Partial<GenSpec['axes'][number]> }
  | { type: 'gen/keepNew'; on: boolean }
  | { type: 'gen/prime'; slot: number }
  | { type: 'gen/primes'; on: boolean }
  | { type: 'gen/preset'; name: string }
  | { type: 'gen/method'; method: Method }
  | { type: 'gen/custom'; custom: string; rep?: string }
  | { type: 'sel/toggle'; i: number }
  | { type: 'sel/all' }
  | { type: 'sel/none' }
  | { type: 'sel/invert' }
  | { type: 'sel/set'; idx: readonly number[]; mode?: number }
  | { type: 'mode/set'; mode: number }
  | { type: 'mode/step'; by: number }
  | { type: 'pick/set'; patch: Partial<Tab['pick']> }
  | { type: 'pick/apply' }
  | { type: 'cmp/set'; patch: Partial<Tab['cmp']> }
  | { type: 'saved/save'; name: string }
  | { type: 'saved/delete'; id: string }
  | { type: 'saved/rename'; id: string; name: string }
  | { type: 'saved/load'; id: string }
  | { type: 'saved/sync'; saved: Saved[] }
  | { type: 'templates/set'; templates: ChordTemplate[] }
  | { type: 'hover'; i: number | null }
  | { type: 'pin'; i: number | null }
  | { type: 'pin/toggle'; i: number }
  | { type: 'chord/hover'; set: ReadonlySet<number> | null }
  | { type: 'chord/pick'; set: ReadonlySet<number> | null }
  | { type: 'preview'; idx: readonly number[] | null }
  | { type: 'sounding'; idx: readonly number[] }
  | { type: 'ui'; patch: Partial<UiSettings> }
  | { type: 'viz'; id: VizId; patch: Partial<VizSettings> }
  | { type: 'layout'; fn: (l: Layout) => Layout };

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
});

/** Apply a tab change; when the field changed, drop the pointers and lights that referred to the old one. */
function editTab(s: LabState, fn: (t: Tab) => Tab): LabState {
  const before = activeTab(s);
  const next = withTab(s, fn);
  return activeTab(next).field === before.field ? next : clearPointers(next);
}

export const cleanName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, 60);

export function labReducer(s: LabState, a: Action): LabState {
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
      return p ? editTab(s, (t) => regenTab({ ...t, mode: 0 }, genFromPreset(p), true)) : s;
    }
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
        return { ...t, sel, mode: fixMode(t.mode, sel.length) };
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
    case 'saved/save': {
      const t = activeTab(s);
      const name = cleanName(a.name) || `Subset ${s.saved.length + 1}`;
      const saved: Saved = {
        id: `s${s.nextSaved}`,
        name,
        gen: t.gen,
        selCents: t.sel.map((i) => t.field[i].c),
        mode: t.mode,
      };
      return { ...s, saved: [...s.saved, saved], nextSaved: s.nextSaved + 1 };
    }
    case 'saved/delete':
      return { ...s, saved: s.saved.filter((x) => x.id !== a.id), preview: null };
    case 'saved/rename': {
      const name = cleanName(a.name);
      return name ? { ...s, saved: s.saved.map((x) => (x.id === a.id ? { ...x, name } : x)) } : s;
    }
    case 'saved/load': {
      const sv = s.saved.find((x) => x.id === a.id);
      if (!sv) {
        return s;
      }
      const out = editTab(s, (t) => {
        const base = genKey(t.gen) === genKey(sv.gen) ? t : regenTab(t, { ...sv.gen }, true);
        const sel = matchCents(base.field, sv.selCents);
        return { ...base, sel, mode: fixMode(sv.mode, sel.length) };
      });
      return { ...out, preview: null };
    }
    case 'saved/sync': {
      const top = a.saved.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0);
      return { ...s, saved: a.saved, nextSaved: Math.max(s.nextSaved, top + 1), preview: null };
    }
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
      const same = next.size === s.sounding.size && [...next].every((i) => s.sounding.has(i));
      return same ? s : { ...s, sounding: next };
    }
    case 'templates/set':
      return {
        ...s,
        templates: a.templates.slice(0, MAX_TEMPLATES),
        chordPick: null,
        chordHover: null,
      };
    case 'ui':
      return { ...s, ui: { ...s.ui, ...a.patch } };
    case 'viz':
      return {
        ...s,
        ui: { ...s.ui, viz: { ...s.ui.viz, [a.id]: { ...s.ui.viz[a.id], ...a.patch } } },
      };
    case 'layout': {
      const layout = a.fn(s.layout);
      return layout === s.layout ? s : { ...s, layout };
    }
  }
}
