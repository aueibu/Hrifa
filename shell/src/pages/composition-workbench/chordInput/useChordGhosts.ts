import { useMemo } from "react";
import { useDeveloperOptions } from "../developerOptions";
import { buildChordGhosts, type ChordGhostNotes } from "./chordGhosts";
import type { Chord } from "./chords";
import type { ChordTarget } from "./chordSession";
import { useChordSelector, useChordSession } from "./ChordSessionProvider";
import { mergeChordInserts, type ExistingNote } from "./placeChords";

/**
 * Selection mode (M6c): the ghosts of the chord the picker would insert on EVERY selected note of this host's
 * claim, computed by the code Insert runs (the session's selection requests through `mergeChordInserts` against
 * the clip's notes, nothing committed), so notes the stack rule or the same-onset merge drops are not ghosted.
 * The pinned chord shows as 'pinned' and a different hovered one as 'hover', like anchor mode. undefined while the
 * claim is not in selection mode or nothing is selected.
 */
export function useSelectionGhosts(
  target: ChordTarget,
  edo: number,
  existing: readonly ExistingNote[],
): ChordGhostNotes | undefined {
  const session = useChordSession();
  const selectionOn = useChordSelector(
    (state) => state.target === target && !state.pickerWanted && state.panelShown,
  );
  const targetVersion = useChordSelector((state) => state.targetVersion);
  const hoverChord = useChordSelector((state) => state.hoverChord);
  const pinnedChord = useChordSelector((state) => state.pinnedChord);
  const voicing = useChordSelector((state) => state.voicing);
  const mode = useChordSelector((state) => state.mode);
  const ctrlOpen = useChordSelector((state) => state.ctrlOpen);
  return useMemo(() => {
    if (!selectionOn) {
      return undefined;
    }
    const ghosts: ChordGhostNotes = [];
    const shown: [Chord | null, "pinned" | "hover"][] = [
      [pinnedChord, "pinned"],
      [hoverChord && hoverChord.name === pinnedChord?.name ? null : hoverChord, "hover"],
    ];
    for (const [chord, variant] of shown) {
      const requests = chord ? session.selectionRequests(chord, target) : null;
      if (requests) {
        for (const note of mergeChordInserts(requests, existing, edo)) {
          ghosts.push({
            pitchMidicents: note.pitchMidicents,
            start: note.start,
            duration: note.duration,
            variant,
          });
        }
      }
    }
    return ghosts.length > 0 ? ghosts : undefined;
    // targetVersion: the host bumps it when its selection or notes change.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session,
    target,
    selectionOn,
    targetVersion,
    hoverChord,
    pinnedChord,
    voicing,
    mode,
    ctrlOpen,
    existing,
    edo,
  ]);
}

/**
 * The ghosts of the chord session for a roll host: undefined unless `active` (the Chords tool is on).
 * It re-renders its host only when a value that changes the ghosts changes, which includes the hover
 * cell (only while the Chords tool is on: the roll reports hover only then).
 */
export function useChordGhosts(
  active: boolean,
  edo: number,
  entryLength: number | null | undefined,
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
    ],
  );
}
