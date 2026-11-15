import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ChordAudition } from './ChordAudition';
import { ChordSession, type ChordSessionState } from './chordSession';

const ChordSessionContext = createContext<ChordSession | null>(null);

/**
 * Provides a chord session to the tree below and runs its window-level side effects: the W-20 key
 * listeners (capture phase, so the picker's keys precede the roll's own arrow handling and the
 * picker's buttons) and Escape, installed while the active claim wants the picker and an anchor
 * exists; the audition, mounted while the claim wants the picker; the re-pin after a keyed anchor
 * move. The provider subscribes only to the values it needs (anchor, target, picker wanted), so a
 * hover update never re-renders it or its children.
 *
 * `WorkbenchSessions` mounts one for the page; a `NoteClipEditor` with none above it mounts a
 * private one.
 */
export function ChordSessionProvider({
  session: given,
  children,
}: {
  session?: ChordSession;
  children: ReactNode;
}) {
  const [own] = useState(() => given ?? new ChordSession());
  const session = given ?? own;
  const anchored = useChordSessionValue(session, (state) => state.anchor !== null);
  const wanted = useChordSessionValue(session, (state) => state.pickerWanted);
  const targetId = useChordSessionValue(session, (state) => state.target?.id ?? null);
  const anchor = useChordSessionValue(session, (state) => state.anchor);
  const pickerOpen = wanted && anchored;
  useEffect(() => {
    if (!pickerOpen) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => session.handleKey(event);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', session.handleKeyUp, true);
    window.addEventListener('keydown', session.handleEscape);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', session.handleKeyUp, true);
      window.removeEventListener('keydown', session.handleEscape);
    };
  }, [pickerOpen, session]);
  // After a Shift+arrow anchor move the picker has re-listed the chords (its effects ran first).
  useEffect(() => {
    session.afterAnchorChange();
  }, [anchor, session]);
  return (
    <ChordSessionContext.Provider value={session}>
      {children}
      {wanted && targetId !== null && (
        <ChordAudition sourceId={`chords:${targetId}`} session={session} />
      )}
    </ChordSessionContext.Provider>
  );
}

/** The session above, or null when none is provided (a host then mounts a private one). */
export function useOptionalChordSession(): ChordSession | null {
  return useContext(ChordSessionContext);
}

export function useChordSession(): ChordSession {
  const session = useContext(ChordSessionContext);
  if (!session) {
    throw new Error('useChordSession needs a ChordSessionProvider above it.');
  }
  return session;
}

/**
 * One value of the session, re-rendering only when that value changes (the selector must return a
 * stable reference for an unchanged state: a field, a primitive, a boolean).
 */
export function useChordSessionValue<T>(
  session: ChordSession,
  selector: (state: ChordSessionState) => T
): T {
  const read = () => selector(session.getState());
  return useSyncExternalStore(session.subscribe, read, read);
}

/** `useChordSessionValue` against the session from context. */
export function useChordSelector<T>(selector: (state: ChordSessionState) => T): T {
  return useChordSessionValue(useChordSession(), selector);
}
