import { useMemo } from 'react';
import { useDeveloperOptions } from '../developerOptions';
import { buildChordGhosts, type ChordGhostNotes } from './chordGhosts';
import { useChordSelector } from './ChordSessionProvider';

/**
 * The ghosts of the chord session for a roll host: undefined unless `active` (the Chords tool is on).
 * It re-renders its host only when a value that changes the ghosts changes, which includes the hover
 * cell (only while the Chords tool is on: the roll reports hover only then).
 */
export function useChordGhosts(
  active: boolean,
  edo: number,
  entryLength: number | null | undefined
): ChordGhostNotes | undefined {
  const anchor = useChordSelector((state) => state.anchor);
  const hoverCell = useChordSelector((state) => state.hoverCell);
  const hoverChord = useChordSelector((state) => state.hoverChord);
  const pinnedChord = useChordSelector((state) => state.pinnedChord);
  const voicing = useChordSelector((state) => state.voicing);
  const mode = useChordSelector((state) => state.mode);
  const ctrlOpen = useChordSelector((state) => state.ctrlOpen);
  const [{ chordAnchorLabel }] = useDeveloperOptions();
  return useMemo(
    () =>
      active
        ? buildChordGhosts({
            anchor,
            hoverCell,
            hoverChord,
            pinnedChord,
            voicing,
            mode,
            ctrlOpen,
            edo,
            entryLength,
            labelPlacement: chordAnchorLabel,
          })
        : undefined,
    [
      active,
      anchor,
      hoverCell,
      hoverChord,
      pinnedChord,
      voicing,
      mode,
      ctrlOpen,
      edo,
      entryLength,
      chordAnchorLabel,
    ]
  );
}
