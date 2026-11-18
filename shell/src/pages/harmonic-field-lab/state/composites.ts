/**
 * Composite gamuts (M8c): up to nine numbered composites, each a list of collected items (chords, subsets, single notes,
 * selections) whose pitches merge into one gamut (lib `composite.ts`). Pure: no React, no storage (compositeStore.ts stores it
 * as `hrifa.harmonic-field-lab.composites.v1`). The action that needs the tabs (`composite/openTab`) is handled in labState.ts.
 *
 * A composite's number (1 to 9) is its stable id: it is freed when the composite is deleted and the lowest free number is
 * reused by the next new one (the keyboard path sends digits to it). An item's pitches are FIELD-ABSOLUTE (as H-7), monzo +
 * cents, copied at the moment of adding; `rep` is the repeat of the field it came from; `source` is its provenance (generator
 * inputs, tab name, date), null when unknown. Nothing is ever dropped silently: a refused action leaves `refusal` with a reason.
 */
import { samePitches, type Note } from '../../../lib/harmonic-field';
import { MAX_TEMPLATE_CHARS, sanitizePitch } from './chordShelf';
import type { GenSpec } from './generate';
import { cleanName } from './generatorLibrary';
import { canonicalPattern } from './patterns';

/** In-memory caps, equal to the load caps in compositeStore (what a session accepts, a reload keeps). */
export const MAX_COMPOSITES = 9;
export const MAX_COMPOSITE_ITEMS = 64;
/** A whole field can be an item (a field holds at most 2048 notes). */
export const MAX_ITEM_PITCHES = 2048;

export type ItemKind = 'chord' | 'subset' | 'note' | 'selection';
export const ITEM_KINDS: readonly ItemKind[] = ['chord', 'subset', 'note', 'selection'];

/** Where an item came from: the generator inputs of the tab, its name and the date of adding (ISO). */
export interface ItemSource {
  gen: GenSpec;
  tab: string;
  date: string;
}

/**
 * M8d (H-10): extra detail an item carries, all optional text. Additive in storage: an item stored before M8d has
 * `detail: null`. Chords and selections always get one; subsets and notes only when the sender gives it. The cents list is NOT
 * stored: it is derived from the item's pitches wherever it is shown (`centsList`); a legacy stored `cents` array is ignored.
 */
export interface ItemDetail {
  /** The ratio template text ("4:5:6") or null. */
  template: string | null;
  /** The chord root as the sender shows it ("3/2", "degree 4") or null. */
  root: string | null;
  /** The positional step pattern ("2-2") or null. */
  pattern: string | null;
  /** The positional tail line ("7 of 12-EDO · 400-300 c") or null. */
  tail: string | null;
  /**
   * M8f: the template family of a ratio chord chip ("Septimal") or absent. Additive and optional: present only when set (a
   * detail without it keeps its stored shape, old items load unchanged), shown as the last part of the item's second line.
   */
  family?: string;
}

/** Longest family label kept. */
export const MAX_FAMILY_CHARS = 80;

const detailText = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() && v.length <= MAX_TEMPLATE_CHARS ? v.trim() : null;

/** A detail made plain, entry by entry (load and add use the same rules). Null when `raw` is not a detail record. */
export function sanitizeDetail(raw: unknown): ItemDetail | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const family =
    typeof r.family === 'string' && r.family.trim()
      ? r.family.trim().slice(0, MAX_FAMILY_CHARS)
      : '';
  return {
    template: detailText(r.template),
    root: detailText(r.root),
    pattern: typeof r.pattern === 'string' ? canonicalPattern(r.pattern) : null,
    tail: detailText(r.tail),
    ...(family ? { family } : {}),
  };
}

/** The pitches in cents above 1/1, in item order, two decimals: derived for display, never stored. */
export const centsList = (pitches: readonly Note[]): number[] =>
  pitches.map((p) => Math.round(p.c * 100) / 100);

export interface CompositeItem {
  /** `i<N>`, unique inside its composite, never reused while the composite lives. */
  id: string;
  kind: ItemKind;
  label: string;
  /** The exact pitches, field-absolute, monzo + cents. */
  pitches: Note[];
  /** The repeat of the field the item came from, or null when unknown. */
  rep: Note | null;
  source: ItemSource | null;
  /** M8d: extra detail (see `ItemDetail`), or null (items stored before M8d, subsets and notes without one). */
  detail: ItemDetail | null;
  /** H-10 amendment: the mode root of a subset or selection item (additive, absent = unknown); chords and notes use `pitches[0]`. */
  root?: Note | null;
}

export interface Composite {
  /** 1 to 9. */
  id: number;
  /** Automatic "Composite N", renamable. */
  name: string;
  items: CompositeItem[];
  /** Item id counter (`i<next>`). */
  next: number;
  /** ISO date-time of the last change. */
  updated: string;
}

export interface CompositesState {
  /** Ascending by id. */
  list: Composite[];
  /** Most recently used composite ids first (runtime only; feeds the right-click menu). */
  recent: number[];
  /** The last successful add (runtime only): drives the brief confirmation. */
  lastAdded: { composite: number; item: string } | null;
  /** Set when an action was refused; cleared by the next successful composite action. */
  refusal: { reason: string } | null;
}

export const emptyComposites = (): CompositesState => ({
  list: [],
  recent: [],
  lastAdded: null,
  refusal: null,
});

/** The pieces an add supplies (the id is made here; pitches are made plain as load does). */
export interface ItemInput {
  kind: ItemKind;
  label: string;
  pitches: Note[];
  rep?: Note | null;
  source?: ItemSource | null;
  /** M8d: what the sender knows (template, root, pattern, tail). */
  detail?: Partial<ItemDetail> | null;
  root?: Note | null;
}

const clonePitch = (p: Note): Note => ({ m: p.m ? { ...p.m } : null, c: p.c });

export const cloneSource = (s: ItemSource): ItemSource => ({
  gen: {
    ...s.gen,
    axes: s.gen.axes.map((a) => ({ ...a })),
    mask: s.gen.mask.slice(),
    ...(s.gen.notes ? { notes: s.gen.notes.slice() } : {}),
    ...(s.gen.snap
      ? {
          snap: {
            ...s.gen.snap,
            rep: clonePitch(s.gen.snap.rep),
            notes: s.gen.snap.notes.map(clonePitch),
          },
        }
      : {}),
  },
  tab: s.tab,
  date: s.date,
});

/** The lowest free number in 1..9, or null when nine exist. */
export function freeCompositeId(list: readonly Composite[]): number | null {
  for (let n = 1; n <= MAX_COMPOSITES; n++) {
    if (!list.some((c) => c.id === n)) {
      return n;
    }
  }
  return null;
}

export const autoCompositeName = (id: number) => `Composite ${id}`;

/** An item's id counter raised past every id in use. */
export function nextItemId(items: readonly CompositeItem[], want = 1): number {
  let n = Math.max(1, want);
  for (const it of items) {
    const k = /^i(\d+)$/.exec(it.id);
    if (k && Number(k[1]) >= n) {
      n = Number(k[1]) + 1;
    }
  }
  return n;
}

const refuse = (s: CompositesState, reason: string): CompositesState => ({
  ...s,
  refusal: { reason },
});

const pushRecent = (recent: readonly number[], id: number): number[] => [
  id,
  ...recent.filter((x) => x !== id),
];

const byId = (a: Composite, b: Composite) => a.id - b.id;

/** A new empty composite on the lowest free number; refused at nine. */
export function addComposite(s: CompositesState, date: string, name?: string): CompositesState {
  const id = freeCompositeId(s.list);
  if (id === null) {
    return refuse(s, `There are already ${MAX_COMPOSITES} composites; delete one first.`);
  }
  const c: Composite = {
    id,
    name: (name && cleanName(name)) || autoCompositeName(id),
    items: [],
    next: 1,
    updated: date,
  };
  return {
    ...s,
    list: [...s.list, c].sort(byId),
    recent: pushRecent(s.recent, id),
    refusal: null,
  };
}

/**
 * Add an item to composite `to` (a number, or 'new' to make a new one first). Refused with a reason (never silent) when: the
 * composite does not exist, the item has no usable pitch or more than 2048, the composite holds 64 items, or an item with the same
 * pitches is already in it ("Already in Composite N").
 */
export function addItem(
  s: CompositesState,
  to: number | 'new',
  input: ItemInput,
  date: string
): CompositesState {
  const pitches = input.pitches.map(sanitizePitch);
  if (!pitches.length || pitches.some((p) => p === null)) {
    return refuse(s, 'There is nothing usable to add: the item has no pitch.');
  }
  if (pitches.length > MAX_ITEM_PITCHES) {
    return refuse(s, `An item holds at most ${MAX_ITEM_PITCHES} pitches.`);
  }
  let base = s;
  let id: number;
  if (to === 'new') {
    base = addComposite(s, date);
    if (base === s || base.refusal) {
      return base;
    }
    id = base.recent[0];
  } else {
    id = to;
  }
  const c = base.list.find((x) => x.id === id);
  if (!c) {
    return refuse(s, `There is no Composite ${id}.`);
  }
  const plain = pitches as Note[];
  if (c.items.some((it) => samePitches(it.pitches, plain))) {
    return refuse(s, `Already in ${c.name}.`);
  }
  if (c.items.length >= MAX_COMPOSITE_ITEMS) {
    return refuse(s, `${c.name} is full (${MAX_COMPOSITE_ITEMS} items).`);
  }
  const rep = input.rep ? sanitizePitch(input.rep) : null;
  const root = input.root ? sanitizePitch(input.root) : null;
  const kind: ItemKind = ITEM_KINDS.includes(input.kind) ? input.kind : 'selection';
  const detail =
    input.detail != null || kind === 'chord' || kind === 'selection'
      ? sanitizeDetail({ ...input.detail })
      : null;
  const item: CompositeItem = {
    id: `i${c.next}`,
    kind,
    label: cleanName(input.label) || 'Item',
    pitches: plain,
    rep: rep && rep.c > 0 ? rep : null,
    source: input.source ? cloneSource(input.source) : null,
    detail,
    ...(root ? { root } : {}),
  };
  const next: Composite = { ...c, items: [...c.items, item], next: c.next + 1, updated: date };
  return {
    ...base,
    list: base.list.map((x) => (x === c ? next : x)),
    recent: pushRecent(base.recent, id),
    lastAdded: { composite: id, item: item.id },
    refusal: null,
  };
}

export type CompositeAction =
  /** A new empty composite on the lowest free number. */
  | { type: 'composite/new'; date: string; name?: string }
  | { type: 'composite/rename'; id: number; name: string; date: string }
  | { type: 'composite/delete'; id: number }
  /** Delete every composite (numbers are freed). */
  | { type: 'composite/clear' }
  /** Add an item to a composite (`to` 'new' makes one); a duplicate or a cap is refused with a reason. */
  | { type: 'composite/addItem'; to: number | 'new'; item: ItemInput; date: string }
  | { type: 'composite/removeItem'; id: number; item: string; date: string }
  /** Mark a composite as just used (the menu order). */
  | { type: 'composite/use'; id: number }
  /** Another window saved the composites: take its list (recent and refusal are kept where they still apply). */
  | { type: 'composite/sync'; composites: CompositesState }
  /** Build a NEW tab from the composite (handled in labState.ts). `merge` is the Developer-menu tolerance and keep rule. */
  | { type: 'composite/openTab'; id: number; merge?: { tol: number; keep: 'first' | 'recent' } };

/** Actions of the pure slice (`composite/openTab` needs the tabs and is in labState.ts). */
export function compositesReduce(
  s: CompositesState,
  a: Exclude<CompositeAction, { type: 'composite/openTab' }>
): CompositesState {
  switch (a.type) {
    case 'composite/new':
      return addComposite(s, a.date, a.name);
    case 'composite/rename': {
      const name = cleanName(a.name);
      const c = s.list.find((x) => x.id === a.id);
      if (!c || !name || c.name === name) {
        return s;
      }
      return {
        ...s,
        list: s.list.map((x) => (x === c ? { ...c, name, updated: a.date } : x)),
        refusal: null,
      };
    }
    case 'composite/delete': {
      if (!s.list.some((c) => c.id === a.id)) {
        return s;
      }
      return {
        ...s,
        list: s.list.filter((c) => c.id !== a.id),
        recent: s.recent.filter((x) => x !== a.id),
        lastAdded: s.lastAdded?.composite === a.id ? null : s.lastAdded,
        refusal: null,
      };
    }
    case 'composite/clear':
      return s.list.length ? { ...s, list: [], recent: [], lastAdded: null, refusal: null } : s;
    case 'composite/addItem':
      return addItem(s, a.to, a.item, a.date);
    case 'composite/removeItem': {
      const c = s.list.find((x) => x.id === a.id);
      if (!c || !c.items.some((it) => it.id === a.item)) {
        return s;
      }
      return {
        ...s,
        list: s.list.map((x) =>
          x === c ? { ...c, items: c.items.filter((it) => it.id !== a.item), updated: a.date } : x
        ),
        lastAdded:
          s.lastAdded?.composite === a.id && s.lastAdded.item === a.item ? null : s.lastAdded,
        refusal: null,
      };
    }
    case 'composite/use':
      return s.list.some((c) => c.id === a.id) && s.recent[0] !== a.id
        ? { ...s, recent: pushRecent(s.recent, a.id) }
        : s;
    case 'composite/sync': {
      const have = new Set(a.composites.list.map((c) => c.id));
      return {
        ...s,
        list: a.composites.list,
        recent: s.recent.filter((x) => have.has(x)),
        lastAdded: s.lastAdded && have.has(s.lastAdded.composite) ? s.lastAdded : null,
        refusal: null,
      };
    }
  }
}
