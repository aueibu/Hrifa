/**
 * The stored shape of a layout: a JSON string with a version field. No storage access here (the page reads and writes
 * the string under LAYOUT_STORAGE_KEY). `parseLayout` sanitises entry by entry and never throws: unknown module ids,
 * repeats, empty columns and extra stack members are dropped, widths clamped, bad shares dropped or renormalised;
 * anything that is not a layout at all is the default layout. A module added or removed in a later version therefore
 * never discards what the user arranged.
 */
import { DEFAULT_LAYOUT, LAYOUT_VERSION, MAX_STACK, type Column, type Layout } from './layout';
import type { ModuleId, ModuleRegistry } from './registry';
import { clampColumnWidth, isEvenShares } from './splitters';

export const LAYOUT_STORAGE_KEY = 'hrifa.stage.layout.v1';

const round4 = (x: number) => Math.round(x * 10000) / 10000;

type Known = ReadonlySet<string> | ModuleRegistry | undefined;
const isKnown = (known: Known, id: string): boolean => (known ? known.has(id) : true);

function cleanShares(raw: unknown, count: number, originalCount: number): number[] | undefined {
  if (count < 2 || count !== originalCount || !Array.isArray(raw) || raw.length !== count) {
    return undefined;
  }
  if (!raw.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1)) {
    return undefined;
  }
  const sum = (raw as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.02) {
    return undefined;
  }
  const out = (raw as number[]).map((v) => round4(v / sum));
  out[out.length - 1] = round4(1 - out.slice(0, -1).reduce((a, b) => a + b, 0));
  return isEvenShares(out) ? undefined : out;
}

function cleanColumns(raw: unknown[], known: Known): Column[] {
  const taken = new Set<ModuleId>();
  const out: Column[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const { slots, width, shares } = entry as {
      slots?: unknown;
      width?: unknown;
      shares?: unknown;
    };
    if (!Array.isArray(slots)) {
      continue;
    }
    const ids: ModuleId[] = [];
    for (const id of slots) {
      if (
        typeof id === 'string' &&
        id !== '' &&
        isKnown(known, id) &&
        !taken.has(id) &&
        ids.length < MAX_STACK
      ) {
        taken.add(id);
        ids.push(id);
      }
    }
    if (ids.length === 0) {
      continue;
    }
    const col: Column = { slots: ids };
    if (typeof width === 'number' && Number.isFinite(width)) {
      col.width = clampColumnWidth(width);
    }
    const s = cleanShares(shares, ids.length, slots.length);
    if (s) {
      col.shares = s;
    }
    out.push(col);
  }
  return out;
}

/**
 * Validate a stored layout string. Never throws. Garbage, a missing columns array, a bad version (not an integer >= 1)
 * and a non-empty column list that sanitises to nothing return `fallback` (M3 passes its real default columns); a
 * valid layout with zero columns is genuinely empty and returns an empty layout.
 */
export function parseLayout(
  raw: string | null | undefined,
  known?: Known,
  fallback: Layout = DEFAULT_LAYOUT
): Layout {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return fallback;
    }
    const { version, columns } = v as { version?: unknown; columns?: unknown };
    if (!Number.isInteger(version) || (version as number) < 1 || !Array.isArray(columns)) {
      return fallback;
    }
    const cleaned = cleanColumns(columns, known);
    if (columns.length > 0 && cleaned.length === 0) {
      return fallback;
    }
    return { version: LAYOUT_VERSION, columns: cleaned };
  } catch {
    return fallback;
  }
}

/** The string to store for a layout. */
export const serializeLayout = (layout: Layout): string => JSON.stringify(layout);
