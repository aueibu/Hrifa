# src/lib/stage: the Stage layout core

Pure TypeScript (no React, no DOM, no storage, no imports from pages or the lab). Everything is re-exported from `index.ts`. Decisions: `DECISIONS.md` STAGE-1 to STAGE-4.

## Size (`size.ts`)

Tokens (rem): `SIZE_UNIT_REM = 6`, `SIZE_SMALL_MAX_REM = 30`, `SIZE_LARGE_MIN_REM = 42`, `SIZE_MIN_WIDTH_REM = 12`, `SIZE_MIN_HEIGHT_REM = 6`, `SIZE_HYSTERESIS_REM = 0.5`.

Types: `WidthClass` (`narrow | regular | wide`), `HeightClass` (`short | regular | tall`), `SlotSize = { width, height }`.

- `classifyWidth(rem)`, `classifyHeight(rem)`: plain rule, below 30 small, 30 to under 42 regular, 42 and up large. NaN and negatives are the smallest class.
- `nextWidthClass(prev, rem)`, `nextHeightClass(prev, rem)`, `sizeOf(w, h, prev?)`: with hysteresis.
- `sizeAtLeast(a, b)`, `sameSize`, `nearestSupportedSize(size, supported)` (largest supported that fits inside `size`, else the smallest supported), `slotSizeAttr(size)` (`"narrow-tall"`), `pxToRem(px, rootPx = 16)`.

**Hysteresis rule.** For each boundary B (30, 42) and H = 0.5: a class below B moves up across B only when the value is at least B + H; a class above B moves down across B only when the value is below B - H. Inside [B - H, B + H) the previous class holds. With no previous class the plain rule applies. Several boundaries are applied together, so a big jump lands on the right class at once.

## Registry (`registry.ts`)

`ModuleMeta = { id, title, sizes: readonly SlotSize[], minSize }` (no render function; the React layer attaches it by id). `ModuleRegistry = ReadonlyMap<string, ModuleMeta>`, an open set of plain string ids. `createRegistry(metas)` (throws on a repeated id), `hasModule`, `sizesSatisfyMin(meta)`, `registryProblems(registry)`.

## Layout (`layout.ts`)

```ts
Layout = { version: 1; columns: Column[] }
Column = { slots: string[] /* 1..3, top first */; width?: number /* rem, default 36 */; shares?: number[] /* sum 1, default even */ }
```

`columns` is one ordered row, left to right. The lab's left and right sides around a fixed workspace are gone: there is no fixed middle on the Stage, so operations take a direction in the row instead of a side.

All operations return a new `Layout`; unknown or impossible input returns the same object (`next === prev` means nothing happened). Module-based operations take a module id; column-based ones take a column index.

- `addModule(l, id, index?)`, `removeModule(l, id)`.
- `moveColumn(l, id, 'left' | 'right')`, `canMoveColumn`: moves the whole column holding `id`; a stack is not split.
- `stackOnto(l, id, targetId)`, `canStackOnto`, `stackTargets(l, id)`: to the bottom of the target's column, at most `MAX_STACK = 3`.
- `unstack(l, id)`: the module becomes its own column right of the old one.
- `moveInStack(l, id, 'up' | 'down')`: its share moves with it.
- Changing a column's slots drops its `shares`; its `width` is kept.
- Widths: `setColumnWidth(l, column, rem)` (clamped to `MIN_COLUMN_REM = 12` .. `MAX_COLUMN_REM = 96`), `columnWidth(col)`, `dragColumnSplitter(l, index, leftRem)`, `nudgeColumnSplitter(l, index, key)`. The splitter between columns `index` and `index + 1` trades width between those two; their total is constant and both stay within the limits. Keys: Left/Right 1 rem (`COLUMN_STEP_REM`), Home/End to the limits.
- Stack shares: `columnShares`, `setColumnShares`, `dragStackSplitter(l, column, index, boundary, heightRem)`, `nudgeStackSplitter`, `clampColumnShares`. Each slot keeps at least `max(6 rem, 20%)` of the column height. Number-level versions (`minShare`, `clampShares`, `splitterRange`, `splitterAt`, `dragSplitter`, `nudgeSplitter`, `evenShares`) are in `splitters.ts`.
- `fitColumns(widthRem, l)`: how many leading whole columns fit. Each column costs its width plus `COLUMN_GAP_REM = 0.25`. Columns are taken left to right and the first that does not fit ends the list (no column is skipped to fit a later one); 0 when not even the first fits. `visibleColumns(l, widthRem)` returns `{ visible, hidden }` in layout order; hidden columns stay in the layout and a switcher (M3) reaches them. A stack is one column and is never split.
- `locate`, `moduleIds`.

## Persistence (`persist.ts`)

`LAYOUT_STORAGE_KEY = 'hrifa.stage.layout.v1'` (a string only), `serializeLayout(layout)`, `parseLayout(raw, known?, fallback = DEFAULT_LAYOUT)` where `known` is a `Set<string>` or a registry. M3 passes its real default columns as `fallback`. `parseLayout` never throws. It drops unknown ids, repeats, empty columns and stack members past 3, clamps widths, drops bad shares (renormalises ones within 0.02 of 1, drops even ones and ones whose slots were dropped). Garbage JSON, wrong types, a `version` that is not an integer >= 1, a missing `columns` array, or a non-empty column list with nothing usable give `fallback`; a valid stored layout with zero columns is genuinely empty and stays empty (not the fallback). `DEFAULT_LAYOUT` has no columns. The returned `version` is always the current one (`LAYOUT_VERSION = 1`); a later version number is read with the same sanitising.

There is no migration hook yet because no older shape exists; add one when `LAYOUT_VERSION` first changes.

A stored `shares` of `[0, 1]` is accepted as given; the React layer must call `clampColumnShares` with the column height. `unstack` gives the new column the default width. `fitColumns` can return 0.
