import { pickerFor, type InputSpec } from './acceptance';
import {
  dataBlockTypeOf,
  dataBlockTypes,
  type DataBlockFamily,
  type StoredDataBlock,
} from './registry';

/**
 * The pure core of the data-block menu (B2, W-65): which desk data-blocks a control lists, in what
 * order, and what each row says. No React here. The list is `pickerFor`'s: exact matches first, then
 * (separately) the "Reinterpret as ..." rows from the conversions the input allows. Nothing converts
 * unless the person picks a reinterpret row.
 */

/** The theme hue a family's mark uses (`--mark-<hue>`) and its glyph. Browsing only. */
export const FAMILY_MARK: Record<DataBlockFamily, { hue: string; glyph: string; label: string }> = {
  pitch: { hue: 'blue', glyph: '♪', label: 'Pitch' },
  time: { hue: 'orange', glyph: '◷', label: 'Time' },
  placed: { hue: 'green', glyph: '▭', label: 'Placed' },
  composite: { hue: 'violet', glyph: '▦', label: 'Composite' },
  generic: { hue: 'cyan', glyph: '≡', label: 'Generic' },
};

/** What a Make source takes: every registered packet type, with no conversion. Read at call time. */
export function makeSourceInputSpec(): InputSpec {
  return {
    accepts: dataBlockTypes()
      .filter((def) => def.payload === 'packet')
      .map((def) => def.id),
  };
}

export interface MenuRow {
  block: StoredDataBlock;
  typeLabel: string;
  family: DataBlockFamily;
  /** How many places use it (from `dataBlockUsers`). */
  users: number;
  /** Set on a reinterpret row only: the conversion chosen by picking it. */
  conversion?: { id: string; label: string; describe: string };
  /** Why this row cannot be picked (a Make source refusing an empty data-block), or null. */
  refusal: string | null;
}

export interface MenuModel {
  exact: MenuRow[];
  reinterpret: MenuRow[];
}

export interface MenuOptions {
  spec: InputSpec;
  blocks: readonly StoredDataBlock[];
  /** Search text: matches the name, note or type label, ignoring case. Blank lists everything. */
  query?: string;
  usersOf(id: string): number;
  /** Per-row refusal (a Make source: makeSourceRefusal). */
  refuse?(block: StoredDataBlock): string | null;
  /** Ids left out (the data-block being replaced offers no replace-with-itself). */
  exclude?: readonly string[];
}

export function dataBlockMenuModel(options: MenuOptions): MenuModel {
  const needle = (options.query ?? '').trim().toLowerCase();
  const excluded = new Set(options.exclude ?? []);
  const blocks = options.blocks.filter((block) => !excluded.has(block.id));
  const picked = pickerFor(options.spec, blocks);
  const make = (block: StoredDataBlock, conversion?: MenuRow['conversion']): MenuRow => {
    const def = dataBlockTypeOf(block);
    return {
      block,
      typeLabel: def?.label ?? 'Unknown type',
      family: def?.family ?? 'generic',
      users: options.usersOf(block.id),
      ...(conversion ? { conversion } : {}),
      refusal: options.refuse?.(block) ?? null,
    };
  };
  const matches = (row: MenuRow) =>
    needle === '' ||
    `${row.block.name} ${row.block.note ?? ''} ${row.typeLabel}`.toLowerCase().includes(needle);
  return {
    exact: picked.exact.map(({ block }) => make(block)).filter(matches),
    reinterpret: picked.reinterpret
      .map(({ block, conversion }) =>
        make(block, { id: conversion.id, label: conversion.label, describe: conversion.describe })
      )
      .filter(matches),
  };
}
