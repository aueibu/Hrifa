import { createContext, useContext, useState, type ReactNode } from 'react';
import classes from './canvasTakeover.module.css';

/**
 * The canvas takeover: a named slot over the canvas (desk) area of the stage, above the bottom
 * panel, that an editor can fill (through a portal) to show a larger tool body while its roll stays
 * visible below. It is a slot, not a window: it always fills the whole area, can't be moved, and is
 * empty (hidden) unless something is portalled into it. The stage owns the slot; an editor that
 * finds no slot (a standalone test, another host) falls back to its own dock.
 */
const TakeoverContext = createContext<HTMLElement | null>(null);
const SetTakeoverContext = createContext<(element: HTMLElement | null) => void>(() => undefined);

/** Provides the slot to everything below it (the stage's top pane and its bottom panel). */
export function CanvasTakeoverProvider({
  children,
  available = true,
}: {
  children: ReactNode;
  /** False while the area the slot covers sits over a hidden roll (the detail panel is collapsed): editors then use their dock. */
  available?: boolean;
}) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return (
    <SetTakeoverContext.Provider value={setElement}>
      <TakeoverContext.Provider value={available ? element : null}>
        {children}
      </TakeoverContext.Provider>
    </SetTakeoverContext.Provider>
  );
}

/** The slot's element: place it last inside a `position: relative` area to cover it. */
export function CanvasTakeoverSlot() {
  const setElement = useContext(SetTakeoverContext);
  return <div ref={setElement} className={classes.slot} data-slot="canvas-takeover" />;
}

/** The slot element to portal into, or null when no stage provides one. */
export function useCanvasTakeoverElement(): HTMLElement | null {
  return useContext(TakeoverContext);
}
