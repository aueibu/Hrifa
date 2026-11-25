import { useState } from 'react';
import { Popover, Stack } from '@mantine/core';
import { NumberInput, SegmentedControl, Switch, Button } from '../../../ui';
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
              <NumberInput
                label="Base octave"
                min={MIN_BASE_OCTAVE}
                max={MAX_BASE_OCTAVE}
                allowDecimal={false}
                clampBehavior="strict"
                value={settings.baseOctave}
                onChange={(value) => {
                  if (typeof value === 'number' && Number.isInteger(value)) {
                    update({ baseOctave: value });
                  }
                }}
              />
              <NumberInput
                label="Offset"
                min={-MAX_OFFSET}
                max={MAX_OFFSET}
                allowDecimal={false}
                clampBehavior="strict"
                value={settings.offset}
                onChange={(value) => {
                  if (typeof value === 'number' && Number.isInteger(value)) {
                    update({ offset: value });
                  }
                }}
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
