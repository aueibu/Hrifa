import { useState } from 'react';
import { Button, NumberInput, Popover, Select, Stack, Text } from '@mantine/core';
import {
  MAX_CLIP_BARS,
  MIN_CLIP_BARS,
  useClipDefaults,
  writeClipDefaults,
} from '../clipPreferences';
import { barsLength, clipTypeById, listClipTypes } from '../clipTypes';
import { useCompositionSettings } from '../compositionSettings';
import { useDesk } from '../desk';
import type { Snippet } from '../snippet';

/**
 * The desk's "New clip" split button. The main button adds an empty clip of the default type and
 * length at once (one undo step) and hands it to `onCreated` so it can be opened; the chevron beside
 * it sets those defaults. The defaults are a per-viewer preference (see clipPreferences.ts).
 */
export function NewClipPopover({ onCreated }: { onCreated?(snippet: Snippet): void }) {
  const { addBlankClip, loading, locked } = useDesk();
  const { settings } = useCompositionSettings();
  const [defaults] = useClipDefaults();
  const [opened, setOpened] = useState(false);
  const types = listClipTypes();
  const typeId = clipTypeById(defaults.typeId) ? defaults.typeId : (types[0]?.id ?? '');
  const refusal = loading
    ? 'The desk is still loading, so a clip cannot be added yet.'
    : locked
      ? 'The saved desk could not be read, so changes to it are turned off.'
      : null;

  function create() {
    const clip = addBlankClip(typeId, barsLength(settings.transport.meter, defaults.bars), {
      timeSignature: settings.transport.meter,
    });
    if (clip) {
      onCreated?.(clip);
    }
  }

  return (
    <Button.Group>
      <Button
        size="compact-xs"
        variant="default"
        disabled={refusal !== null}
        data-info={
          refusal ?? 'Add an empty clip of the default type and length and open it in the panel.'
        }
        onClick={create}
      >
        New clip
      </Button>
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        withArrow
        trapFocus
        returnFocus
      >
        <Popover.Target>
          <Button
            size="compact-xs"
            variant="default"
            px={4}
            aria-label="New clip defaults"
            disabled={refusal !== null}
            data-info={refusal ?? 'Set the type and length that New clip starts with.'}
            onClick={() => setOpened((current) => !current)}
          >
            <span aria-hidden>▾</span>
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={200}>
            <Select
              size="xs"
              label="Type"
              allowDeselect={false}
              comboboxProps={{ withinPortal: false }}
              data={types.map((type) => ({ value: type.id, label: type.label }))}
              value={typeId}
              onChange={(value) => value && writeClipDefaults({ typeId: value })}
            />
            <NumberInput
              size="xs"
              label="Length (bars)"
              min={MIN_CLIP_BARS}
              max={MAX_CLIP_BARS}
              allowDecimal={false}
              clampBehavior="strict"
              value={defaults.bars}
              onChange={(value) => {
                if (typeof value === 'number' && Number.isInteger(value)) {
                  writeClipDefaults({ bars: value });
                }
              }}
            />
            <Text size="xs" c="dimmed">
              Bars of {settings.transport.meter}.
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Button.Group>
  );
}
