import type { ReactNode } from 'react';
import type { ChordSession } from './chordInput/chordSession';
import { ChordSessionProvider } from './chordInput/ChordSessionProvider';
import type { CompositionInspectorTarget } from './compositionWorkspace';
import type { DataBlockEditorSession } from './dataBlockEditorSession';
import { DataBlockEditorSessionProvider } from './DataBlockEditorSessionProvider';
import type { InputScope } from './inputScope';
import { InputScopeProvider } from './InputScopeProvider';
import { WorkbenchSelectionProvider } from './WorkbenchSelection';

/**
 * The page-level sessions of the workbench (design one-stage 7.2): state that must outlive any one
 * panel and sit ABOVE the Stage, so no React `key` above it is ever needed. It holds the chord
 * session (M4a), the data-block editor session, the input scope tracker and the read-only selection chain
 * (M4b).
 *
 * Mounted by the page (M4c) around the whole app shell, with no key, so every editor, the picker
 * host and the inspector share one set of sessions. Everything that reads a session also works
 * WITHOUT this wrapper above it by mounting a private one (`NotesEditor` does), which is what
 * tests that render an editor alone get.
 *
 * Page wiring: the page passes `inspectorTarget` and `dataBlockId` (the page's `editorTarget`) so the
 * selection chain can read them; the stored shapes stay where they are.
 *
 * It needs the composition settings provider and the audio engine provider above it (the audition
 * mounts while a claim wants the picker).
 */
export function WorkbenchSessions({
  chordSession,
  dataBlockEditorSession,
  inputScope,
  inspectorTarget,
  dataBlockId,
  children,
}: {
  /** Sessions made by the caller (tests); by default the wrapper creates them. */
  chordSession?: ChordSession;
  dataBlockEditorSession?: DataBlockEditorSession;
  inputScope?: InputScope;
  /** The page's inspector target, for the selection chain. */
  inspectorTarget?: CompositionInspectorTarget | null;
  /** The page's open data-block (`editorTarget`), for the selection chain. */
  dataBlockId?: string | null;
  children: ReactNode;
}) {
  return (
    <InputScopeProvider scope={inputScope}>
      <DataBlockEditorSessionProvider session={dataBlockEditorSession}>
        <ChordSessionProvider session={chordSession}>
          <WorkbenchSelectionProvider inspectorTarget={inspectorTarget} dataBlockId={dataBlockId}>
            {children}
          </WorkbenchSelectionProvider>
        </ChordSessionProvider>
      </DataBlockEditorSessionProvider>
    </InputScopeProvider>
  );
}
