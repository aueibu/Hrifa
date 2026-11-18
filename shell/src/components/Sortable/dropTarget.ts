/**
 * The cross-panel hooks: a drop target that says which payload types it accepts, and a lone drag source (a picker or generator
 * output, not part of a list). Both live in one `SortableProvider`, next to any `Sortable` lists. No cross-panel feature uses them yet.
 */
import { useLayoutEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { canAccept, type Payload } from './payload';
import { useSortableContext, type DragData, type DropData } from './SortableProvider';

export interface DropTargetOptions {
  id: string;
  /** The payload types this target takes (`Payload.type`). Anything else never reaches it: it neither lights up nor drops. */
  accepts: readonly string[];
  onDrop: (payload: Payload) => void;
  disabled?: boolean;
}

export function useDropTarget({ id, accepts, onDrop, disabled }: DropTargetOptions) {
  const ctx = useSortableContext();
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled,
    data: { kind: 'target', accepts } satisfies DropData,
  });
  // registered every render so the drop calls the newest callback
  useLayoutEffect(() => {
    ctx?.targets.current.set(id, { accepts, onDrop });
  });
  useLayoutEffect(() => {
    const targets = ctx?.targets.current;
    return () => {
      targets?.delete(id);
    };
  }, [ctx, id]);
  const payload = ctx?.activePayload ?? null;
  return {
    setNodeRef,
    /** A drag is in progress and this target would take what it carries. */
    canDrop: !disabled && canAccept(accepts, payload),
    /** The pointer is on this target (only ever true for a payload it accepts). */
    isOver: isOver && !disabled,
    /** What is being dragged, or `null`. */
    payload,
  };
}

export interface DragSourceOptions {
  id: string;
  payload: Payload;
  disabled?: boolean;
}

/** A draggable that is not in a list: spread `handleProps` on the element that starts the drag. */
export function useDragSource({ id, payload, disabled }: DragSourceOptions) {
  const drag = useDraggable({ id, disabled, data: { payload } satisfies DragData });
  return {
    setNodeRef: drag.setNodeRef,
    handleProps: {
      ...drag.attributes,
      ...drag.listeners,
      ref: drag.setActivatorNodeRef,
    },
    isDragging: drag.isDragging,
  };
}
