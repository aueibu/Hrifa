/**
 * A reorderable list or grid on dnd-kit's sortable: `Sortable` is the container (it registers the item order and the move callback with
 * the drag layer and owns the `SortableContext`), `SortableItem` is one slot. While a card is dragged the others slide into the new
 * order; resting `SWAP_DWELL_MS` on a card turns it into a swap target (the preview then shows the trade). A copy of the card follows
 * the pointer (`DragOverlay`) and the card's own slot stays as a dimmed placeholder. The page renders the card itself through the
 * render prop and puts `handle` on the element that should start a drag (and take the keyboard focus). See README.md.
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { DragOverlay } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';
import type { Payload } from './payload';
import type { Move, SortLayout } from './reorder';
import {
  SortableProvider,
  useSortableContext,
  type DragData,
  type DropData,
  type SortableProviderProps,
} from './SortableProvider';
import classes from './sortable.module.css';

interface GroupValue {
  id: string;
  ids: readonly string[];
  layout: SortLayout;
  payload: (id: string) => Payload;
}
const GroupCtx = createContext<GroupValue | null>(null);

const cx = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ') || undefined;
const keyOf = (group: string, id: string) => `${group}/${id}`;

export interface SortableProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Names this list inside the drag layer (unique among the lists in one provider). */
  id: string;
  /** The item ids in order. Each `SortableItem` id must be one of them. */
  items: readonly string[];
  layout?: SortLayout;
  /** A drop that reorders: `insert` (`to` = the moved item's final index, `arrayMove`'s meaning) or `swap` (`to` = the other index). Apply it with your own pure helper. */
  onMove: (move: Move) => void;
  /** What an item carries when it leaves for a drop target. Default `{ type: id, data: itemId }`. */
  getPayload?: (itemId: string) => Payload;
  /** A drag started or ended (see `SortableProvider`); used only when this list creates its own provider. */
  onActiveChange?: SortableProviderProps['onActiveChange'];
  children: ReactNode;
}

export function Sortable(props: SortableProps) {
  const parent = useSortableContext();
  const { onActiveChange, ...rest } = props;
  const body = <SortableGroup {...rest} />;
  // inside a SortableProvider this list shares its drag context; alone it brings its own
  return parent ? (
    body
  ) : (
    <SortableProvider onActiveChange={onActiveChange}>{body}</SortableProvider>
  );
}

function SortableGroup({
  id,
  items,
  layout = 'grid',
  onMove,
  getPayload,
  children,
  ...divProps
}: Omit<SortableProps, 'onActiveChange'>) {
  const ctx = useSortableContext()!;
  // registered every render: the drop reads the newest order and callback
  useLayoutEffect(() => {
    ctx.groups.current.set(id, { ids: items, layout, onMove });
  });
  useLayoutEffect(() => {
    const groups = ctx.groups.current;
    return () => {
      groups.delete(id);
    };
  }, [ctx.groups, id]);
  const payload = useCallback(
    (itemId: string): Payload => (getPayload ? getPayload(itemId) : { type: id, data: itemId }),
    [getPayload, id]
  );
  const value = useMemo<GroupValue>(
    () => ({ id, ids: items, layout, payload }),
    [id, items, layout, payload]
  );
  const keys = useMemo(() => items.map((i) => keyOf(id, i)), [id, items]);

  // The preview: from the pointer's card (`overKey`), not dnd-kit's own `over`, so a pointer resting in a gap keeps the last order.
  // Live: dnd-kit's strategy for the layout, translation only (no scale: cards of different widths are not stretched).
  // Swap: only the dragged slot and the target trade places; every other card is back where it was.
  const { activeKey, overKey, swapKey } = ctx;
  const base = layout === 'list' ? verticalListSortingStrategy : rectSortingStrategy;
  const strategy = useMemo<SortingStrategy>(
    () => (args) => {
      const a = activeKey === null ? -1 : keys.indexOf(activeKey);
      const o = overKey === null ? -1 : keys.indexOf(overKey);
      if (a < 0 || o < 0) {
        return null;
      }
      if (swapKey !== null && swapKey === overKey) {
        const from = args.rects[a];
        const to = args.rects[o];
        if (!from || !to || (args.index !== a && args.index !== o)) {
          return null;
        }
        const [src, dst] = args.index === a ? [from, to] : [to, from];
        return { x: dst.left - src.left, y: dst.top - src.top, scaleX: 1, scaleY: 1 };
      }
      const t = base({ ...args, activeIndex: a, overIndex: o });
      return t && { x: t.x, y: t.y, scaleX: 1, scaleY: 1 };
    },
    [activeKey, overKey, swapKey, keys, base]
  );

  return (
    <GroupCtx.Provider value={value}>
      <SortableContext items={keys} strategy={strategy}>
        <div {...divProps}>{children}</div>
      </SortableContext>
    </GroupCtx.Provider>
  );
}

/** Spread on the element that starts the drag: pointer and keyboard listeners, the aria attributes, the ref, the click guard. */
export type HandleProps = HTMLAttributes<HTMLElement> & { ref: (el: HTMLElement | null) => void };

export interface SortableItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  id: string;
  /** Extra class on the box inside the slot (the page's card sits inside it). */
  innerClassName?: string;
  style?: CSSProperties;
  children: (handle: HandleProps) => ReactNode;
}

const NO_HANDLE: HandleProps = { ref: () => undefined };

export function SortableItem({
  id,
  innerClassName,
  className,
  style,
  children,
  ...slotProps
}: SortableItemProps) {
  const group = useContext(GroupCtx)!;
  const ctx = useSortableContext()!;
  const key = keyOf(group.id, id);
  const sortable = useSortable({
    id: key,
    data: {
      kind: 'item',
      group: group.id,
      itemId: id,
      index: group.ids.indexOf(id),
      layout: group.layout,
      payload: group.payload(id),
    } satisfies DropData & DragData,
    // after a drop the new order is already in the DOM: no slide back
    animateLayoutChanges: () => false,
  });

  const swapTarget = ctx.swapKey === key;
  const handle: HandleProps = {
    ...sortable.attributes,
    ...sortable.listeners,
    ref: sortable.setActivatorNodeRef,
    onClickCapture: (e) => {
      // the click that follows a drag (or the Space that dropped it) is not the item's own
      if (ctx.suppressClick()) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };

  return (
    <div
      {...slotProps}
      ref={sortable.setNodeRef}
      className={cx(classes.slot, className)}
      style={{
        ...style,
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      data-dragging={sortable.isDragging ? true : undefined}
      data-over={swapTarget ? true : undefined}
    >
      <div className={cx(classes.inner, innerClassName)} data-over={swapTarget ? true : undefined}>
        {children(handle)}
      </div>
      {sortable.isDragging
        ? createPortal(
            <DragOverlay dropAnimation={null}>
              <div className={cx(classes.inner, innerClassName)} data-overlay="">
                {children(NO_HANDLE)}
              </div>
            </DragOverlay>,
            document.body
          )
        : null}
    </div>
  );
}
