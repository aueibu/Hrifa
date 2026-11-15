import { Text } from '@mantine/core';
import { useDeveloperOptions } from '../developerOptions';
import { ChordPicker } from './ChordPicker';
import { useChordSession, useChordSelector } from './ChordSessionProvider';

const NO_TARGET_HINT = 'No chord target. Open something that can take a chord.';
const DEFAULT_HINT = 'Choose where the chord goes.';

/**
 * The chord picker body bound to the chord session: it reads the session's values and the active
 * claim's target (pitch set, empty-state hint) and writes back through the session, so it works for
 * any host that claims the session (the clip editor's v1 Stage today, a progression list in a test,
 * a panel of its own at M6). Without a claim it shows an empty state; without an anchor, the
 * target's hint. A frame (`ChordPickerHost`) is optional and the caller's.
 */
export function ChordPickerPanel() {
  const session = useChordSession();
  const target = useChordSelector((state) => state.target);
  // Re-read the target's fields when the host says they changed.
  useChordSelector((state) => state.targetVersion);
  const anchor = useChordSelector((state) => state.anchor);
  const override = useChordSelector((state) => state.override);
  const voicing = useChordSelector((state) => state.voicing);
  const storedMode = useChordSelector((state) => state.mode);
  const ctrlOpen = useChordSelector((state) => state.ctrlOpen);
  const continuous = useChordSelector((state) => state.continuous);
  const allPitches = useChordSelector((state) => state.allPitches);
  const tier = useChordSelector((state) => state.tier);
  const [developerOptions] = useDeveloperOptions();
  if (!target) {
    return (
      <Text size="xs" c="dimmed">
        {NO_TARGET_HINT}
      </Text>
    );
  }
  if (!anchor) {
    return (
      <Text size="xs" c="dimmed">
        {target.hint ?? DEFAULT_HINT}
      </Text>
    );
  }
  return (
    <ChordPicker
      anchor={anchor}
      onNote={anchor.note !== undefined}
      noteOffsetCents={anchor.note ? anchor.note.pitchMidicents - anchor.pitchMidicents : 0}
      pitchSet={target.pitchSet}
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
      onClose={session.closePicker}
    />
  );
}
