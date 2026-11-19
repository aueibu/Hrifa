import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  ClipEditorSession,
  type ClipEditorCommandOf,
  type ClipEditorCommandType,
} from './clipEditorSession';

const ClipEditorSessionContext = createContext<ClipEditorSession | null>(null);

/** Provides one clip editor session to the tree below (`WorkbenchSessions` mounts it). */
export function ClipEditorSessionProvider({
  session: given,
  children,
}: {
  session?: ClipEditorSession;
  children: ReactNode;
}) {
  const [own] = useState(() => given ?? new ClipEditorSession());
  return (
    <ClipEditorSessionContext.Provider value={given ?? own}>
      {children}
    </ClipEditorSessionContext.Provider>
  );
}

/** The session above, or null when none is provided (the editor then mounts a private one). */
export function useOptionalClipEditorSession(): ClipEditorSession | null {
  return useContext(ClipEditorSessionContext);
}

export function useClipEditorSession(): ClipEditorSession {
  const session = useContext(ClipEditorSessionContext);
  if (!session) {
    throw new Error('useClipEditorSession needs a ClipEditorSessionProvider above it.');
  }
  return session;
}

/**
 * `useState` over one slot of the clip's session state: the same tuple, a stable setter that accepts
 * a function, and the state resets when another clip opens.
 */
export function useClipSlot<T>(
  session: ClipEditorSession,
  clipId: string,
  key: string,
  init: () => T
): [T, (next: T | ((current: T) => T)) => void] {
  const initRef = useRef(init);
  initRef.current = init;
  const value = useSyncExternalStore(
    session.subscribe,
    () => session.read(clipId, key, () => initRef.current()),
    () => session.read(clipId, key, () => initRef.current())
  );
  const set = useCallback(
    (next: T | ((current: T) => T)) => session.write(clipId, key, () => initRef.current(), next),
    [session, clipId, key]
  );
  return [value, set];
}

/** Holds the clip's state for as long as an editor for it is mounted. */
export function useClipAttachment(session: ClipEditorSession, clipId: string) {
  useEffect(() => session.attach(clipId), [session, clipId]);
}

/** Registers the receiving panel's handler for a command type while the panel is mounted. */
export function useCommand<T extends ClipEditorCommandType>(
  session: ClipEditorSession,
  type: T,
  handler: (command: ClipEditorCommandOf<T>) => void
) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => session.onCommand(type, (command) => latest.current(command)), [session, type]);
}
