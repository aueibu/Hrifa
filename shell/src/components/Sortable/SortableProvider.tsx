/**
 * The shared drag layer's context: one dnd-kit `DndContext` that can host several `Sortable` lists and `useDropTarget` targets. It owns
 * the sensors (4 px pointer activation; keyboard Space with dnd-kit's sortable coordinates), the collision rule (the pointer is over an
 * item), the pause-to-swap state (`reorder.ts`: resting `SWAP_DWELL_MS` on a card makes it a swap target), the click suppression after
 * a drag and the Esc contract (`onActiveChange` stays true until the Escape that cancels has been handled everywhere, so a modal behind
 * it does not also close).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type PointerSensorOptions,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { canAccept, type Payload } from './payload';
import {
  SWAP_DWELL_MS,
  dwellMode,
  moveFor,
  noDwell,
  pointInRect,
  trackOver,
  type Dwell,
  type Move,
  type SortLayout,
} from './reorder';

/** A drag starts after the pointer moves this many pixels, so a plain click still fires the item's click. */
export const DRAG_START_PX = 4;
/** The swap timer fires this much after the dwell so it is never early (a timer can fire a hair before its time). */
const TIMER_SLACK_MS = 4;

/** What a draggable carries in dnd-kit's `data`. */
export interface DragData {
  /** The sortable the item belongs to (`undefined` for a lone drag source). */
  group?: string;
  itemId?: string;
  payload: Payload | null;
}

/** What a sortable item or drop target is, in a droppable's `data` (an item's `data` is both this and a `DragData`). */
export interface DropData extends Partial<DragData> {
  kind: 'item' | 'target';
  index?: number;
  layout?: SortLayout;
  accepts?: readonly string[];
}

export interface GroupEntry {
  ids: readonly string[];
  layout: SortLayout;
  onMove: (move: Move) => void;
}
export interface TargetEntry {
  accepts: readonly string[];
  onDrop: (payload: Payload) => void;
}

export interface SortableContextValue {
  activeKey: string | null;
  activePayload: Payload | null;
  /** The key (`group/id`) of the item the pointer is on, or `null` (the last one stays while the pointer is in a gap). */
  overKey: string | null;
  /** The key of the swap target (the pointer has rested on it), or `null`. */
  swapKey: string | null;
  /** True while the click that follows a drag (or the Space that ends a keyboard drag) must be ignored. */
  suppressClick: () => boolean;
  groups: React.MutableRefObject<Map<string, GroupEntry>>;
  targets: React.MutableRefObject<Map<string, TargetEntry>>;
}

export const SortableCtx = createContext<SortableContextValue | null>(null);
export const useSortableContext = (): SortableContextValue | null => useContext(SortableCtx);

/** The pointer sensor, except it ignores a press that starts on a `data-no-drag` element (a remove button inside a card). */
class ItemPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        { nativeEvent: event }: React.PointerEvent,
        { onActivation }: PointerSensorOptions
      ): boolean => {
        if (!event.isPrimary || event.button !== 0) {
          return false;
        }
        if ((event.target as HTMLElement | null)?.closest?.('[data-no-drag]')) {
          return false;
        }
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

const SCREEN_READER_INSTRUCTIONS =
  'To pick up an item, press the space bar. While dragging, use the arrow keys to move it between positions. Press space again to drop it, or Escape to cancel.';

export interface SortableProviderProps {
  children: ReactNode;
  /** A drag started or ended. The `false` is delayed past the key event that ended it (a modal behind must not see that Escape as free). */
  onActiveChange?: (active: boolean) => void;
  /** What follows the pointer for a lone drag source (`useDragSource`). A list item's own card follows the pointer without this. */
  renderOverlay?: (payload: Payload) => ReactNode;
}

export function SortableProvider({
  children,
  onActiveChange,
  renderOverlay,
}: SortableProviderProps) {
  const [active, setActive] = useState<{
    key: string;
    payload: Payload | null;
    grouped: boolean;
  } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const groups = useRef(new Map<string, GroupEntry>());
  const targets = useRef(new Map<string, TargetEntry>());
  const notifyRef = useRef(onActiveChange);
  notifyRef.current = onActiveChange;
  const suppressRef = useRef(false);
  // what the drop acts on, kept in refs so the drop never reads a stale render
  const overRef = useRef<{ key: string; data: DropData } | null>(null);
  const swapRef = useRef<string | null>(null);
  /** The pointer left every card since the last over: coming back onto the same card restarts its swap clock. */
  const leftRef = useRef(false);
  const dwellRef = useRef<Dwell>(noDwell);
  /** The group member the pointer is actually on (set by collision detection; null in a gap or off the bar). Read in `onDragMove`. */
  const pointerOnRef = useRef<string | null>(null);
  const timerRef = useRef(0);
  // where inside the dragged rect the pointer grabbed it: the pointer in scroll-adjusted space is the rect plus this
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  const clearTimer = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  };
  const dragActiveRef = useRef(false);
  useEffect(
    () => () => {
      clearTimer();
      // unmounted mid-drag: no end event will come, so release whoever waits on the drag
      if (dragActiveRef.current) {
        dragActiveRef.current = false;
        notifyRef.current?.(false);
      }
    },
    []
  );

  const suppressNextClick = useCallback((keyboard: boolean) => {
    suppressRef.current = true;
    let timer = 0;
    const clear = () => {
      suppressRef.current = false;
      window.removeEventListener('keyup', onKeyUp, true);
      window.clearTimeout(timer);
    };
    // a click follows a pointer release in the same task; a Space click follows the key release
    function onKeyUp() {
      window.setTimeout(clear, 0);
    }
    if (keyboard) {
      window.addEventListener('keyup', onKeyUp, true);
      timer = window.setTimeout(clear, 800);
    } else {
      timer = window.setTimeout(clear, 0);
    }
  }, []);

  const sensors = useSensors(
    useSensor(ItemPointerSensor, { activationConstraint: { distance: DRAG_START_PX } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space],
      },
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const {
      active: act,
      collisionRect,
      pointerCoordinates,
      droppableRects,
      droppableContainers,
    } = args;
    if (pointerCoordinates && !grab.current) {
      grab.current = {
        dx: pointerCoordinates.x - collisionRect.left,
        dy: pointerCoordinates.y - collisionRect.top,
      };
    }
    const point = grab.current
      ? { x: collisionRect.left + grab.current.dx, y: collisionRect.top + grab.current.dy }
      : null;
    const data = act.data.current as DragData | undefined;
    if (data?.group) {
      const members = droppableContainers.filter((c) => {
        const d = c.data.current as DropData | undefined;
        return d?.kind === 'item' && d.group === data.group && droppableRects.has(c.id);
      });
      // the pointer decides; a keyboard drag has none, so the nearest item to the moved rect does
      const hit = point
        ? members
            .filter((c) => pointInRect(point, droppableRects.get(c.id)!))
            .map((c) => ({ id: c.id, data: { droppableContainer: c } }))
        : closestCenter({ ...args, droppableContainers: members });
      pointerOnRef.current = hit.length > 0 ? String(hit[0].id) : null;
      if (hit.length > 0) {
        return [hit[0]];
      }
      // a gap or off the bar: the last card stays over, so the live order stays on screen and a drop does what is shown
      const last = overRef.current;
      if (last?.data.kind === 'item' && last.data.group === data.group) {
        const keep = members.find((c) => c.id === last.key);
        if (keep) {
          return [{ id: keep.id, data: { droppableContainer: keep } }];
        }
      }
    } else {
      pointerOnRef.current = null;
    }
    if (!point) {
      return [];
    }
    return droppableContainers
      .filter((c) => {
        const d = c.data.current as DropData | undefined;
        const rect = droppableRects.get(c.id);
        return (
          d?.kind === 'target' &&
          !!rect &&
          canAccept(d.accepts ?? [], data?.payload) &&
          pointInRect(point, rect)
        );
      })
      .map((c) => ({ id: c.id, data: { droppableContainer: c } }));
  }, []);

  const reset = () => {
    clearTimer();
    overRef.current = null;
    swapRef.current = null;
    dwellRef.current = noDwell;
    leftRef.current = false;
    pointerOnRef.current = null;
    grab.current = null;
    setOverKey(null);
    setSwapKey(null);
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData | undefined;
    reset();
    dragActiveRef.current = true;
    setActive({ key: String(e.active.id), payload: data?.payload ?? null, grouped: !!data?.group });
    notifyRef.current?.(true);
    if (e.activatorEvent instanceof KeyboardEvent) {
      // the Space that picked it up must not click the card when it is released
      suppressNextClick(true);
    }
  };
  const onDragOver = (e: DragOverEvent) => {
    const data = e.over?.data.current as DropData | undefined;
    if (!e.over || !data) {
      // off every item the last one stays (the list keeps its order); off a target it no longer takes the drop
      if (overRef.current?.data.kind === 'target') {
        overRef.current = null;
        setOverKey(null);
      }
      // leaving the swap target in any direction (a gap, off the bar) ends the swap; the last card keeps the live order
      clearTimer();
      if (swapRef.current !== null) {
        swapRef.current = null;
        setSwapKey(null);
      }
      dwellRef.current = noDwell;
      leftRef.current = true;
      return;
    }
    const key = String(e.over.id);
    if (overRef.current?.key === key && !leftRef.current) {
      return;
    }
    leftRef.current = false;
    overRef.current = { key, data };
    setOverKey(key);
    // pause to swap: a new card restarts the clock; a keyboard drag never swaps
    clearTimer();
    swapRef.current = null;
    setSwapKey(null);
    startDwell(key, data.kind === 'item', String(e.active.id), e.activatorEvent);
  };
  /** The pointer rests on `key`: restart the clock and, for another card, arm the swap timer. A keyboard drag never swaps. */
  const startDwell = (key: string, isItem: boolean, activeKey: string, activator: Event | null) => {
    dwellRef.current = trackOver(dwellRef.current, key, performance.now());
    if (isItem && key !== activeKey && !(activator instanceof KeyboardEvent)) {
      timerRef.current = window.setTimeout(() => {
        const { mode, target } = dwellMode(dwellRef.current, activeKey, performance.now());
        if (mode === 'swap') {
          swapRef.current = target;
          setSwapKey(target);
        }
      }, SWAP_DWELL_MS + TIMER_SLACK_MS);
    }
  };
  /**
   * The collision rule keeps the last card over in a gap, so `onDragOver` does not fire there: the pointer's own position decides here.
   * Leaving the card ends a swap or a running clock; coming back onto the same card restarts it.
   */
  const onDragMove = (e: DragMoveEvent) => {
    const over = overRef.current;
    if (!over || over.data.kind !== 'item') {
      return;
    }
    const on = pointerOnRef.current;
    if (on !== over.key) {
      if (swapRef.current !== null || timerRef.current !== 0 || !leftRef.current) {
        clearTimer();
        if (swapRef.current !== null) {
          swapRef.current = null;
          setSwapKey(null);
        }
        dwellRef.current = trackOver(dwellRef.current, null, performance.now());
        leftRef.current = true;
      }
    } else if (leftRef.current) {
      leftRef.current = false;
      startDwell(over.key, true, String(e.active.id), e.activatorEvent);
    }
  };
  const finish = (keyboard: boolean) => {
    dragActiveRef.current = false;
    suppressNextClick(keyboard);
    setActive(null);
    reset();
    // after the key event that ended it has reached everyone (a modal's Escape handling)
    window.setTimeout(() => notifyRef.current?.(false), 0);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const over = overRef.current;
    const data = e.active.data.current as DragData | undefined;
    if (over?.data.kind === 'item' && data?.group && over.data.group === data.group) {
      const grp = groups.current.get(data.group);
      if (grp) {
        const move = moveFor(
          grp.ids,
          data.itemId ?? '',
          over.data.itemId ?? null,
          swapRef.current === over.key ? 'swap' : 'insert'
        );
        if (move) {
          grp.onMove(move);
        }
      }
    } else if (over?.data.kind === 'target' && data?.payload) {
      const t = targets.current.get(over.key);
      if (t && canAccept(t.accepts, data.payload)) {
        t.onDrop(data.payload);
      }
    }
    finish(e.activatorEvent instanceof KeyboardEvent);
  };

  const value = useMemo<SortableContextValue>(
    () => ({
      activeKey: active?.key ?? null,
      activePayload: active?.payload ?? null,
      overKey,
      swapKey,
      suppressClick: () => suppressRef.current,
      groups,
      targets,
    }),
    [active, overKey, swapKey]
  );

  return (
    <SortableCtx.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{ screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => finish(false)}
      >
        {children}
        {renderOverlay ? (
          <DragOverlay dropAnimation={null}>
            {active?.payload && !active.grouped ? renderOverlay(active.payload) : null}
          </DragOverlay>
        ) : null}
      </DndContext>
    </SortableCtx.Provider>
  );
}
