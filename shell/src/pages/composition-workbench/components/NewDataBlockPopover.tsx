import { useState } from 'react';
import { Button, NumberInput, Popover, Select, Stack, Text } from '@mantine/core';
import { useCompositionSettings } from '../compositionSettings';
import type { DataBlock } from '../dataBlock';
import {
  MAX_DATA_BLOCK_BARS,
  MIN_DATA_BLOCK_BARS,
  useDataBlockDefaults,
  writeDataBlockDefaults,
} from '../dataBlockPreferences';
import { barsLength, dataBlockTypeById, listDataBlockTypes } from '../dataBlockTypes';
import { useDesk } from '../desk';

/**
 * The desk's "New data-block" split button. The main button adds an empty data-block of the default type and
 * length at once (one undo step) and hands it to `onCreated` so it can be opened; the chevron beside
 * it sets those defaults. The defaults are a per-viewer preference (see dataBlockPreferences.ts).
 */
export function NewDataBlockPopover({ onCreated }: { onCreated?(dataBlock: DataBlock): void }) {
  const { addBlankDataBlock, loading, locked } = useDesk();
  const { settings } = useCompositionSettings();
  const [defaults] = useDataBlockDefaults();
  const [opened, setOpened] = useState(false);
  const types = listDataBlockTypes();
  const typeId = dataBlockTypeById(defaults.typeId) ? defaults.typeId : (types[0]?.id ?? '');
  const refusal = loading
    ? 'The desk is still loading, so a data-block cannot be added yet.'
    : locked
      ? 'The saved desk could not be read, so changes to it are turned off.'
      : null;

  function create() {
    const dataBlock = addBlankDataBlock(
      typeId,
      barsLength(settings.transport.meter, defaults.bars),
      {
        timeSignature: settings.transport.meter,
      }
    );
    if (dataBlock) {
      onCreated?.(dataBlock);
    }
  }

  return (
    <Button.Group>
      <Button
        size="compact-xs"
        variant="default"
        disabled={refusal !== null}
        data-info={
          refusal ??
          'Add an empty data-block of the default type and length and open it in the panel.'
        }
        onClick={create}
      >
        New data-block
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
            aria-label="New data-block defaults"
            disabled={refusal !== null}
            data-info={refusal ?? 'Set the type and length that New data-block starts with.'}
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
              onChange={(value) => value && writeDataBlockDefaults({ typeId: value })}
            />
            <NumberInput
              size="xs"
              label="Length (bars)"
              min={MIN_DATA_BLOCK_BARS}
              max={MAX_DATA_BLOCK_BARS}
              allowDecimal={false}
              clampBehavior="strict"
              value={defaults.bars}
              onChange={(value) => {
                if (typeof value === 'number' && Number.isInteger(value)) {
                  writeDataBlockDefaults({ bars: value });
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
