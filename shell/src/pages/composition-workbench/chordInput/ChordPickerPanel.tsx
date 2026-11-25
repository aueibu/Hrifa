import { useEffect, useMemo } from 'react';
import { Text } from '@mantine/core';
import { useCompositionSettings } from '../compositionSettings';
import { useDeveloperOptions } from '../developerOptions';
import { ChordAudition } from './ChordAudition';
import { ChordPicker } from './ChordPicker';
import { insertBlockedReason } from './chordReady';
import { AUDITION_ANCHOR } from './chordSession';
import { useChordSession, useChordSelector } from './ChordSessionProvider';
import { useChordReady } from './useChordReady';

const DEFAULT_HINT = 'Choose where the chord goes.';

/**
 * The chord picker body bound to the chord session: it reads the session's values and the active
 * claim's target (pitch set, empty-state hint) and writes back through the session, so it works for
 * any host that claims the session (the Notes editor, a progression list in a test). Three states:
 *
 * - **Anchor mode** (the claim wants the picker: the Chords tool): the target's hint until an anchor is set, then the
 *   picker at the anchor.
 * - **Selection mode** (a claim whose tool is not Chords, M6b): the picker at the first selected note (middle C when
 *   nothing is selected), audition always on; Insert acts on the selected notes through the session.
 * - **No claim**: an audition-only picker (middle C, the project's scale); a chord is heard on click.
 *
 * The ready line (the frame's) and the chord buttons' tooltip read the same value (`useChordReady`). The frame is the
 * caller's (`ChordsPanel`).
 */
export function ChordPickerPanel() {
  const session = useChordSession();
  const target = useChordSelector((state) => state.target);
  // Re-read the target's fields (and the selection) when the host says they changed.
  const targetVersion = useChordSelector((state) => state.targetVersion);
  const wanted = useChordSelector((state) => state.pickerWanted);
  const anchor = useChordSelector((state) => state.anchor);
  const override = useChordSelector((state) => state.override);
  const voicing = useChordSelector((state) => state.voicing);
  const storedMode = useChordSelector((state) => state.mode);
  const ctrlOpen = useChordSelector((state) => state.ctrlOpen);
  const continuous = useChordSelector((state) => state.continuous);
  const allPitches = useChordSelector((state) => state.allPitches);
  const tier = useChordSelector((state) => state.tier);
  const [developerOptions] = useDeveloperOptions();
  const { settings } = useCompositionSettings();
  const ready = useChordReady();
  const noTarget = target === null;
  const selectionMode = target !== null && !wanted;
  // The audition-only picker needs an anchor for its ghosts and voicing; the session's own anchor serves.
  useEffect(() => {
    if (noTarget && session.getState().anchor === null) {
      session.setAnchor(AUDITION_ANCHOR);
    }
  }, [noTarget, anchor, session]);
  // Selection mode: the picker lists chords from the first selected note; the same object while nothing changed.
  const selectionAnchor = useMemo(
    () => (selectionMode ? session.viewAnchor() : null),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [selectionMode, session, target, targetVersion]
  );
  if (target && wanted && !anchor) {
    return <Text c="dimmed">{target.hint ?? DEFAULT_HINT}</Text>;
  }
  const shownAnchor = selectionAnchor ?? anchor ?? AUDITION_ANCHOR;
  return (
    <>
      {/* The provider mounts the audition only while a claim wants the picker; with none, or in selection mode, this panel does. */}
      {(noTarget || selectionMode) && <ChordAudition sourceId="chords:panel" session={session} />}
      <ChordPicker
        anchor={shownAnchor}
        onNote={shownAnchor.note !== undefined}
        noteOffsetCents={
          shownAnchor.note ? shownAnchor.note.pitchMidicents - shownAnchor.pitchMidicents : 0
        }
        pitchSet={target?.pitchSet ?? settings.pitchSet}
        override={override}
        onOverrideChange={session.setOverride}
        controlRef={session.controlRef}
        continuous={continuous}
        onContinuousChange={session.setContinuous}
        // The Root | Common tone buttons commit the stored mode; Ctrl/Cmd+click opened common-tone
        // mode for one click only.
        mode={ctrlOpen ? 'common' : storedMode}
        onModeChange={session.setMode}
        tier={tier}
        onTierChange={session.setTier}
        allPitches={allPitches}
        onAllPitchesChange={session.setAllPitches}
        voicing={voicing}
        onVoicingChange={session.changeVoicing}
        previewGate={developerOptions.chordPreviewGate}
        onHover={session.setHoverChord}
        onPin={session.pinChord}
        onInsert={session.insertChord}
        insertBlockedReason={insertBlockedReason(ready)}
        selectionMode={selectionMode}
        // With no target there is nothing to close or insert into; in selection mode there is no anchor to clear.
        onClose={noTarget || selectionMode ? () => undefined : session.closePicker}
      />
    </>
  );
}
