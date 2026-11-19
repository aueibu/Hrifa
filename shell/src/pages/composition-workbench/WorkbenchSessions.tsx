import type { ReactNode } from 'react';
import type { ChordSession } from './chordInput/chordSession';
import { ChordSessionProvider } from './chordInput/ChordSessionProvider';
import type { ClipEditorSession } from './clipEditorSession';
import { ClipEditorSessionProvider } from './ClipEditorSessionProvider';
import type { CompositionInspectorTarget } from './compositionWorkspace';
import type { InputScope } from './inputScope';
import { InputScopeProvider } from './InputScopeProvider';
import { WorkbenchSelectionProvider } from './WorkbenchSelection';

/**
 * The page-level sessions of the workbench (design one-stage 7.2): state that must outlive any one
 * panel and sit ABOVE the Stage, so no React `key` above it is ever needed. It holds the chord
 * session (M4a), the clip editor session, the input scope tracker and the read-only selection chain
 * (M4b).
 *
 * Mounted by the page (M4c) around the whole app shell, with no key, so every editor, the picker
 * host and the inspector share one set of sessions. Everything that reads a session also works
 * WITHOUT this wrapper above it by mounting a private one (`NoteClipEditor` does), which is what
 * tests that render an editor alone get.
 *
 * Page wiring: the page passes `inspectorTarget` and `clipId` (the page's `editorClipTarget`) so the
 * selection chain can read them; the stored shapes stay where they are.
 *
 * It needs the composition settings provider and the audio engine provider above it (the audition
 * mounts while a claim wants the picker).
 */
export function WorkbenchSessions({
  chordSession,
  clipEditorSession,
  inputScope,
  inspectorTarget,
  clipId,
  children,
}: {
  /** Sessions made by the caller (tests); by default the wrapper creates them. */
  chordSession?: ChordSession;
  clipEditorSession?: ClipEditorSession;
  inputScope?: InputScope;
  /** The page's inspector target, for the selection chain. */
  inspectorTarget?: CompositionInspectorTarget | null;
  /** The page's open clip (`editorClipTarget`), for the selection chain. */
  clipId?: string | null;
  children: ReactNode;
}) {
  return (
    <InputScopeProvider scope={inputScope}>
      <ClipEditorSessionProvider session={clipEditorSession}>
        <ChordSessionProvider session={chordSession}>
          <WorkbenchSelectionProvider inspectorTarget={inspectorTarget} clipId={clipId}>
            {children}
          </WorkbenchSelectionProvider>
        </ChordSessionProvider>
      </ClipEditorSessionProvider>
    </InputScopeProvider>
  );
}
