/**
 * Cards from tabs and from stored snapshots: the notes the retuner engine needs are the card's subset read from its mode
 * root (the same `rotateSubset` the keyboard plays), derived from the tab or rebuilt from the stored snapshot.
 */
import { rotateSubset, type Note } from '../../../lib/harmonic-field';
import { generateField } from './generate';
import { matchCents, rootIndex, tabName, type Tab } from './labState';
import { sanitizeSnapshot, toSnapshot, type Snapshot } from './persist';
import { newCardId, type RetCard } from './retuner';

const plain = (rel: readonly Note[]): Note[] => rel.map((n) => ({ m: n.m, c: n.c }));

/** The current tab as a card; null when it has no subset (a card needs at least one note). */
export function cardFromTab(tab: Tab): RetCard | null {
  if (!tab.sel.length || !tab.field.length) {
    return null;
  }
  const rel = rotateSubset(tab.field, tab.sel, tab.mode, tab.rep);
  const root = tab.field[rootIndex(tab)];
  return {
    id: newCardId(),
    name: tabName(tab),
    snap: toSnapshot(tab),
    notes: plain(rel),
    rep: tab.rep,
    root: { m: root.m, c: root.c },
  };
}

/** A card from a stored snapshot (rebuilds the field); null when the inputs do not build or select nothing. */
export function cardFromSnapshot(name: string, snap: Snapshot): RetCard | null {
  const parts = sanitizeSnapshot(snap);
  if (!parts) {
    return null;
  }
  const g = generateField(parts.gen);
  if (!g.ok || g.field.length === 0) {
    return null;
  }
  const sel = matchCents(g.field, parts.selCents);
  if (!sel.length) {
    return null;
  }
  const mode = parts.mode < sel.length ? parts.mode : 0;
  const root = g.field[sel[mode]];
  return {
    id: newCardId(),
    name,
    snap,
    notes: plain(rotateSubset(g.field, sel, mode, g.rep)),
    rep: g.rep,
    root: { m: root.m, c: root.c },
  };
}
