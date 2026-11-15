import type { ReactNode } from 'react';
import type { ChordSession } from './chordInput/chordSession';
import { ChordSessionProvider } from './chordInput/ChordSessionProvider';

/**
 * The page-level sessions of the workbench (design one-stage 7.2): state that must outlive any one
 * panel and sit ABOVE the Stage, so no React `key` above it is ever needed. M4a holds the chord
 * session; M4b adds the clip editor session, the input scope and the selection chain here.
 *
 * Mounted by the page around the Stage at M5; until then nothing mounts it (tests wrap it
 * themselves). Everything that reads a session also works WITHOUT this wrapper above it by mounting
 * a private one (`NoteClipEditor` does), so it can be adopted without touching consumers.
 *
 * It needs the composition settings provider and the audio engine provider above it (the audition
 * mounts while a claim wants the picker).
 */
export function WorkbenchSessions({
  chordSession,
  children,
}: {
  /** A session made by the caller (tests); by default the wrapper creates one. */
  chordSession?: ChordSession;
  children: ReactNode;
}) {
  return <ChordSessionProvider session={chordSession}>{children}</ChordSessionProvider>;
}
