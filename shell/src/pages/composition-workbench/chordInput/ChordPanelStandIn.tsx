import { useChordSelector } from './ChordSessionProvider';
import { ChordsPanel } from './ChordsPanel';

/**
 * Stands in for the dock Stage in tests that render a chord host without a Stage: it shows the Chords panel while the
 * active claim wants the picker (what `ChordPanelBridge` makes the Stage do on the page) and nothing otherwise (`always`: shown whatever the tool, to test selection mode). Needs a
 * `ChordSessionProvider` (or `WorkbenchSessions`) above it, and the editor beside it under the same provider.
 */
export function ChordPanelStandIn({ always = false }: { always?: boolean }) {
  const wanted = useChordSelector((state) => state.pickerWanted && state.target !== null);
  // `always`: the panel stays open after the tool is left (decision 1b), as it does on the page.
  return wanted || always ? <ChordsPanel /> : null;
}
