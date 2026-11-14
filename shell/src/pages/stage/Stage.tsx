/**
 * The Stage: renders a layout (columns of stacked slots) through the registry.
 *
 * Mounted-once: every module in the layout is rendered exactly once, here at the root, in a list keyed by module id,
 * through `createPortal` into a persistent host element the Stage owns for that id. A slot body only adopts its
 * module's host element (see Slot.tsx). So a move, stack, unstack, reorder or resize changes where the host element
 * hangs in the document, never the React element that owns the module's state. Only closing a module (removing it from
 * the layout) unmounts it. Hidden columns stay mounted too (their hosts are simply detached from the document).
 *
 * A module is handed its size class only (nearest to the measured one that it supports); never the layout, a column,
 * or pixels.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clampColumnShares,
  columnShares,
  columnWidth,
  locate,
  moduleIds,
  moveColumn,
  moveInStack,
  nearestSupportedSize,
  pxToRem,
  removeModule,
  splitterAt,
  stackOnto,
  stackTargets,
  type Layout,
} from '../../lib/stage';
import type { StageRegistry } from './registry';
import { INITIAL_SIZE, withMeasure, type SlotSizes } from './sizeState';
import { Slot, TOOL_LABEL, type SlotTools } from './Slot';
import { Splitter } from './Splitter';
import {
  columnSplitterBounds,
  dragColumnSplitterMin,
  dragStackSplitterMin,
  nudgeStackSplitterMin,
  stackSplitterBounds,
  guarded,
  nudgeColumnSplitterMin,
  shownColumnCount,
  unstackWithMin,
} from './stageOps';
import classes from './stage.module.css';

export interface StageProps {
  registry: StageRegistry;
  layout: Layout;
  /** Apply a change to the latest layout (a React state updater). */
  update(fn: (l: Layout) => Layout): void;
  /** The window width in rem; with the column widths it decides how many columns are shown. */
  widthRem: number;
  /** Spike only: overlay each slot's measured size class. */
  showSizes?: boolean;
}

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const pct = (v: number) => Math.round(v * 100);

export function Stage({ registry, layout, update, widthRem, showSizes }: StageProps) {
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const hostFor = (id: string) => {
    let host = hosts.current.get(id);
    if (!host) {
      host = document.createElement('div');
      host.className = classes.host;
      host.dataset.moduleHost = id;
      hosts.current.set(id, host);
    }
    return host;
  };

  const [sizes, setSizes] = useState<SlotSizes>({});
  const measure = useCallback(
    (id: string, w: number, h: number) => setSizes((s) => withMeasure(s, id, w, h)),
    []
  );

  const root = useRef<HTMLDivElement>(null);
  const [heightRem, setHeightRem] = useState(0);
  const heightRef = useRef(0);
  heightRef.current = heightRem;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) {
      return undefined;
    }
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) {
        setHeightRem(pxToRem(r.height, rootPx()));
      }
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // stored shares below the minimum are repaired once the column height is known
  useEffect(() => {
    if (heightRem > 0) {
      update((l) =>
        l.columns.reduce(
          (n, c, i) => (c.slots.length > 1 ? clampColumnShares(n, i, heightRem) : n),
          l
        )
      );
    }
  }, [heightRem, layout, update]);

  // a module that left the layout is closed: drop its host element
  useEffect(() => {
    const live = new Set(moduleIds(layout));
    for (const [id, host] of hosts.current) {
      if (!live.has(id)) {
        host.remove();
        hosts.current.delete(id);
      }
    }
  }, [layout]);

  // After a tool moved a slot, focus goes to the same tool in the module's new slot (the pressed button is gone)
  const pendingFocus = useRef<{ id: string; label: string; at: number; from: Layout } | null>(null);
  useLayoutEffect(() => {
    const p = pendingFocus.current;
    if (!p || p.from === layout) {
      return;
    }
    pendingFocus.current = null;
    if (Date.now() - p.at > 1000) {
      return;
    }
    const section = [
      ...(root.current?.querySelectorAll<HTMLElement>('section[data-slot-id]') ?? []),
    ].find((el) => el.dataset.slotId === p.id);
    const tool = section
      ? [...section.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.getAttribute('aria-label') === p.label && !b.disabled
        )
      : undefined;
    (tool ?? section)?.focus({ preventScroll: true });
  }, [layout]);
  const focusAfter = (id: string, label: string, fn: () => void) => {
    pendingFocus.current = { id, label, at: Date.now(), from: layoutRef.current };
    fn();
  };

  /** Apply an edit, refusing it when it would give a slot less than its module's minimum size. */
  const apply = useCallback(
    (fn: (l: Layout) => Layout) =>
      update((l) => guarded(l, fn(l), registry.meta, heightRef.current)),
    [update, registry]
  );

  const preview = (next: Layout) => guarded(layout, next, registry.meta, heightRem) !== layout;
  const title = (id: string) => registry.meta.get(id)?.title ?? id;

  const toolsFor = (id: string): SlotTools => {
    const at = locate(layout, id);
    return {
      canLeft: preview(moveColumn(layout, id, 'left')),
      canRight: preview(moveColumn(layout, id, 'right')),
      canUp: preview(moveInStack(layout, id, 'up')),
      canDown: preview(moveInStack(layout, id, 'down')),
      stacked: (at?.count ?? 1) > 1,
      stackTargets: stackTargets(layout, id).map((t) => ({
        id: t.id,
        title: title(t.id),
        enabled: preview(stackOnto(layout, id, t.id)),
      })),
      onLeft: () =>
        focusAfter(id, TOOL_LABEL.left(title(id)), () => apply((l) => moveColumn(l, id, 'left'))),
      onRight: () =>
        focusAfter(id, TOOL_LABEL.right(title(id)), () => apply((l) => moveColumn(l, id, 'right'))),
      onUp: () =>
        focusAfter(id, TOOL_LABEL.up(title(id)), () => apply((l) => moveInStack(l, id, 'up'))),
      onDown: () =>
        focusAfter(id, TOOL_LABEL.down(title(id)), () => apply((l) => moveInStack(l, id, 'down'))),
      onStack: (target) =>
        focusAfter(id, TOOL_LABEL.stack(title(id)), () => apply((l) => stackOnto(l, id, target))),
      onUnstack: () =>
        focusAfter(id, TOOL_LABEL.unstack(title(id)), () =>
          apply((l) => unstackWithMin(l, registry.meta, id))
        ),
      onClose: () => update((l) => removeModule(l, id)),
    };
  };

  /** The column index of the splitter whose columns hold `leftId` and `rightId`, looked up now; -1 if not adjacent. */
  const pairIndex = (l: Layout, leftId: string, rightId: string) => {
    const a = locate(l, leftId);
    const b = locate(l, rightId);
    return a && b && b.column === a.column + 1 ? a.column : -1;
  };

  const shown = shownColumnCount(layout, widthRem);
  const visible = layout.columns.slice(0, shown);

  const columnSplitter = (leftId: string, rightId: string, index: number) => {
    const bounds = columnSplitterBounds(layout, registry.meta, index);
    return (
      <Splitter
        orientation="vertical"
        label={`Resize columns of ${title(leftId)} and ${title(rightId)}`}
        valueNow={Math.round(bounds?.now ?? 0)}
        valueMin={Math.round(bounds?.min ?? 0)}
        valueMax={Math.round(bounds?.max ?? 0)}
        valueText={`${Math.round(bounds?.now ?? 0)} rem`}
        keys={['ArrowLeft', 'ArrowRight', 'Home', 'End']}
        onKey={(key) =>
          update((l) => {
            const at = pairIndex(l, leftId, rightId);
            return at < 0
              ? l
              : nudgeColumnSplitterMin(
                  l,
                  registry.meta,
                  at,
                  key as 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'
                );
          })
        }
        onDragStart={() => {
          const l = layoutRef.current;
          const at = pairIndex(l, leftId, rightId);
          if (at < 0) {
            return null;
          }
          const start = columnWidth(l.columns[at]);
          const px = rootPx();
          return (dx) =>
            update((l2) => {
              const now = pairIndex(l2, leftId, rightId);
              return now < 0 ? l2 : dragColumnSplitterMin(l2, registry.meta, now, start + dx / px);
            });
        }}
      />
    );
  };

  const stackSplitter = (aboveId: string, belowId: string, column: number, index: number) => {
    const bounds = stackSplitterBounds(layout, registry.meta, column, index, heightRem);
    return (
      <Splitter
        orientation="horizontal"
        label={`Resize ${title(aboveId)} and ${title(belowId)}`}
        valueNow={pct(bounds?.now ?? 0)}
        valueMin={pct(bounds?.min ?? 0)}
        valueMax={pct(bounds?.max ?? 0)}
        valueText={`${pct(bounds?.now ?? 0)}%`}
        keys={['ArrowUp', 'ArrowDown', 'Home', 'End']}
        onKey={(key) =>
          update((l) => {
            const at = locate(l, aboveId);
            return !at || at.index + 1 >= at.count
              ? l
              : nudgeStackSplitterMin(
                  l,
                  registry.meta,
                  at.column,
                  at.index,
                  key as 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
                  heightRef.current
                );
          })
        }
        onDragStart={(target) => {
          const l = layoutRef.current;
          const at = locate(l, aboveId);
          const heightPx = target.parentElement?.getBoundingClientRect().height ?? 0;
          if (!at || at.index + 1 >= at.count || heightPx <= 0) {
            return null;
          }
          const startBoundary = splitterAt(columnShares(l, at.column), at.index);
          const colRem = pxToRem(heightPx, rootPx());
          return (_dx, dy) =>
            update((l2) => {
              const a = locate(l2, aboveId);
              return !a || a.index + 1 >= a.count
                ? l2
                : dragStackSplitterMin(
                    l2,
                    registry.meta,
                    a.column,
                    a.index,
                    startBoundary + dy / heightPx,
                    colRem
                  );
            });
        }}
      />
    );
  };

  const ids = moduleIds(layout);

  return (
    <div className={classes.root} ref={root} data-stage-root>
      <div className={classes.columns}>
        {layout.columns.length === 0 && (
          <p className={classes.empty}>No modules on the Stage. Add one from the Modules menu.</p>
        )}
        {visible.map((col, i) => {
          const shares = columnShares(layout, i);
          const rows = col.slots.length > 1 ? shares : [1];
          return (
            <Fragment key={col.slots.join('+')}>
              {i > 0 && columnSplitter(visible[i - 1].slots[0], col.slots[0], i - 1)}
              <div
                className={classes.column}
                style={{
                  width: `${columnWidth(col)}rem`,
                  gridTemplateRows: rows
                    .map((s) => `minmax(0, ${s}fr)`)
                    .join(' var(--splitter-thickness) '),
                }}
              >
                {col.slots.map((id, k) => (
                  <Fragment key={id}>
                    {k > 0 && stackSplitter(col.slots[k - 1], id, i, k - 1)}
                    <Slot
                      id={id}
                      title={title(id)}
                      host={hostFor(id)}
                      size={sizes[id] ?? INITIAL_SIZE}
                      onMeasure={measure}
                      tools={toolsFor(id)}
                      showSize={showSizes}
                    />
                  </Fragment>
                ))}
              </div>
            </Fragment>
          );
        })}
      </div>
      {ids.map((id) => {
        const module = registry.modules.get(id);
        if (!module) {
          return null;
        }
        const size = nearestSupportedSize(sizes[id] ?? INITIAL_SIZE, module.sizes);
        return createPortal(module.render(size), hostFor(id), id);
      })}
    </div>
  );
}
