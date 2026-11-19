import type { ReadyValue } from '../components/readyState';
import { chordReady } from './chordReady';
import { useChordSelector, useChordSession } from './ChordSessionProvider';

/**
 * The Chords panel's ready value, read from the page chord session: the one value the ready line and the picker's
 * blocked-insert tooltip share. Re-reads when the target says its fields (the selection) changed.
 */
export function useChordReady(): ReadyValue {
  const session = useChordSession();
  const target = useChordSelector((state) => state.target);
  useChordSelector((state) => state.targetVersion);
  const wanted = useChordSelector((state) => state.pickerWanted);
  const anchor = useChordSelector((state) => state.anchor);
  return chordReady({
    hasTarget: target !== null,
    targetName: target?.label ?? '',
    meter: target?.meter,
    canInsertMany: !target?.selectedNotes || !!target.insertMany,
    mode: wanted ? 'anchor' : 'selection',
    rollHost: !!target?.selectedNotes,
    anchor,
    selectedNotes: session.selectionAnchors()?.length ?? null,
  });
}
