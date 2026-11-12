import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Cursors for the editor tools (opt-in through the roll's and lane's `toolCursors`). Each is a small
 * inline SVG with a light fill and a dark outline, so it reads on both colour schemes, followed by a
 * stock CSS cursor as the fallback. A cursor is an image, not themed UI, so the paint is named colors
 * inside the art only; nothing here is a theme color.
 *
 * The stylesheets read them as custom properties (`var(--cursor-pencil, cell)`), set once on the roll
 * and the lane's track from `toolCursorStyle`.
 */
const ART = `fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"`;

function cursor(body: string, hotX: number, hotY: number, fallback: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${ART}>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, ${fallback}`;
}

export const toolCursors = {
  // A pencil pointing down-left; the hotspot is its tip.
  pencil: cursor(
    '<path d="M3 21l1.2-5L16 4.2a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8L8 20z"/>',
    3,
    21,
    'cell'
  ),
  // A tilted paint can pouring; the hotspot is the drip.
  paint: cursor(
    '<path d="M5 11l7-7 7 7-6 6a2.4 2.4 0 0 1-3.4 0z"/><path d="M20 14c1.4 2 2 3 2 4a2 2 0 0 1-4 0c0-1 .6-2 2-4z"/>',
    20,
    21,
    'cell'
  ),
  // A blade, the hotspot at its point.
  knife: cursor('<path d="M3 21L16 3l3 3-5 14z"/><path d="M14 20l5-3"/>', 3, 21, 'col-resize'),
  // An eraser block, the hotspot at its middle.
  eraser: cursor(
    '<path d="M4 15l9-9 7 7-6 6H8z"/><path d="M9 11l7 7"/><path d="M8 19h12"/>',
    12,
    12,
    'not-allowed'
  ),
  // An I-beam with end ticks (a span), the hotspot at its middle.
  time: cursor('<path d="M9 4h6M9 20h6M12 4v16"/><path d="M4 9v6M20 9v6"/>', 12, 12, 'text'),
};

/** The custom properties to set on the element the cursor stylesheet rules are scoped to. */
export const toolCursorStyle = Object.fromEntries(
  Object.entries(toolCursors).map(([name, value]) => [`--cursor-${name}`, value])
) as CSSProperties;

export interface ModifierKeys {
  alt: boolean;
  /** Ctrl or Cmd. */
  copy: boolean;
}

const none: ModifierKeys = { alt: false, copy: false };

/**
 * Tracks the Alt and Ctrl/Cmd state while `active`, so a cursor can change on the keydown and keyup
 * itself and not only at the next pointer move. The window listeners exist only while `active` (the
 * roll or lane is hovered or in a gesture) and are removed with it; a blur resets the state. `sync`
 * lets a pointer event (which carries the modifier state too) correct it. `onKey` also receives
 * the raw key event, for a gesture that reads the modifiers live.
 */
export function useModifierKeys(active: boolean, onKey?: (event: KeyboardEvent) => void) {
  const [keys, setKeys] = useState<ModifierKeys>(none);
  const keyHandler = useRef(onKey);
  keyHandler.current = onKey;
  const set = useCallback((next: ModifierKeys) => {
    setKeys((previous) =>
      previous.alt === next.alt && previous.copy === next.copy ? previous : next
    );
  }, []);
  const sync = useCallback(
    (event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
      set({ alt: event.altKey, copy: event.ctrlKey || event.metaKey }),
    [set]
  );
  useEffect(() => {
    if (!active) {
      set(none);
      return undefined;
    }
    const onChange = (event: KeyboardEvent) => {
      sync(event);
      keyHandler.current?.(event);
    };
    const reset = () => set(none);
    window.addEventListener('keydown', onChange);
    window.addEventListener('keyup', onChange);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onChange);
      window.removeEventListener('keyup', onChange);
      window.removeEventListener('blur', reset);
    };
  }, [active, set, sync]);
  return [keys, sync] as const;
}
