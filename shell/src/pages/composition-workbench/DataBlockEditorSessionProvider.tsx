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
  DataBlockEditorSession,
  type DataBlockEditorCommandOf,
  type DataBlockEditorCommandType,
} from './dataBlockEditorSession';

const DataBlockEditorSessionContext = createContext<DataBlockEditorSession | null>(null);

/** Provides one data-block editor session to the tree below (`WorkbenchSessions` mounts it). */
export function DataBlockEditorSessionProvider({
  session: given,
  children,
}: {
  session?: DataBlockEditorSession;
  children: ReactNode;
}) {
  const [own] = useState(() => given ?? new DataBlockEditorSession());
  return (
    <DataBlockEditorSessionContext.Provider value={given ?? own}>
      {children}
    </DataBlockEditorSessionContext.Provider>
  );
}

/** The session above, or null when none is provided (the editor then mounts a private one). */
export function useOptionalDataBlockEditorSession(): DataBlockEditorSession | null {
  return useContext(DataBlockEditorSessionContext);
}

export function useDataBlockEditorSession(): DataBlockEditorSession {
  const session = useContext(DataBlockEditorSessionContext);
  if (!session) {
    throw new Error('useDataBlockEditorSession needs a DataBlockEditorSessionProvider above it.');
  }
  return session;
}

/**
 * `useState` over one slot of the data-block's session state: the same tuple, a stable setter that accepts
 * a function, and the state resets when another data-block opens.
 */
export function useDataBlockSlot<T>(
  session: DataBlockEditorSession,
  dataBlockId: string,
  key: string,
  init: () => T
): [T, (next: T | ((current: T) => T)) => void] {
  const initRef = useRef(init);
  initRef.current = init;
  const value = useSyncExternalStore(
    session.subscribe,
    () => session.read(dataBlockId, key, () => initRef.current()),
    () => session.read(dataBlockId, key, () => initRef.current())
  );
  const set = useCallback(
    (next: T | ((current: T) => T)) =>
      session.write(dataBlockId, key, () => initRef.current(), next),
    [session, dataBlockId, key]
  );
  return [value, set];
}

/** Holds the data-block's state for as long as an editor for it is mounted. */
export function useDataBlockAttachment(session: DataBlockEditorSession, dataBlockId: string) {
  useEffect(() => session.attach(dataBlockId), [session, dataBlockId]);
}

/** Registers the receiving panel's handler for a command type while the panel is mounted. */
export function useCommand<T extends DataBlockEditorCommandType>(
  session: DataBlockEditorSession,
  type: T,
  handler: (command: DataBlockEditorCommandOf<T>) => void
) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => session.onCommand(type, (command) => latest.current(command)), [session, type]);
}
