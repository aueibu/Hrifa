import { useState } from 'react';
import { Popover, Stack } from '@mantine/core';
import { ScrubNumber, SegmentedControl, Switch, Button } from '../../../ui';
import {
  MAX_BASE_OCTAVE,
  MAX_OFFSET,
  MIN_BASE_OCTAVE,
  useAuditionSettings,
} from '../auditionPreferences';
import { getDataBlockType } from '../dataBlocks/registry';

/** Which of the listener's settings a data-block type uses (R3), read from its registration. */
export function auditionControlsOf(typeId: string) {
  const declared = getDataBlockType(typeId)?.auditionControls ?? [];
  return {
    mode: declared.includes('mode'),
    pitchClasses: declared.includes('octave') || declared.includes('offset'),
    loop: declared.includes('loop'),
  };
}

/**
 * The small settings control next to a desk card's Play: the viewer's Play mode, Base octave, Offset
 * and Loop. The dropdown floats over the page (a popover), and the button is the same size
 * whatever is set, so nothing on the card moves. The settings are the viewer's and are never
 * written to the data-block (`auditionPreferences.ts`).
 */
export function AuditionSettingsPopover({ typeId }: { typeId: string }) {
  const [opened, setOpened] = useState(false);
  const [settings, update] = useAuditionSettings();
  const controls = auditionControlsOf(typeId);
  if (!controls.mode && !controls.loop) {
    return null;
  }
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      withArrow
      trapFocus
      returnFocus
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <Button
          variant="default"
          px={4}
          aria-label="Audition settings"
          data-info="How this data-block is played: Play mode, Base octave, Offset and Loop. They are yours, not stored in the data-block."
          onClick={() => setOpened((current) => !current)}
        >
          <span aria-hidden>⚙</span>
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={200}>
          {controls.mode && (
            <SegmentedControl
              fullWidth
              aria-label="Play mode"
              data={[
                { value: 'sequence', label: 'In sequence' },
                { value: 'together', label: 'Together' },
              ]}
              value={settings.mode}
              onChange={(value) => update({ mode: value === 'together' ? 'together' : 'sequence' })}
            />
          )}
          {controls.pitchClasses && (
            <>
              <ScrubNumber
                label="Base octave"
                range={[MIN_BASE_OCTAVE, MAX_BASE_OCTAVE]}
                value={settings.baseOctave}
                onChange={(value) => update({ baseOctave: Math.trunc(value) })}
              />
              <ScrubNumber
                label="Offset"
                range={[-MAX_OFFSET, MAX_OFFSET]}
                defaultValue={0}
                value={settings.offset}
                onChange={(value) => update({ offset: Math.trunc(value) })}
              />
            </>
          )}
          {controls.loop && (
            <Switch
              label="Loop"
              checked={settings.loop}
              onChange={(event) => update({ loop: event.currentTarget.checked })}
            />
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
