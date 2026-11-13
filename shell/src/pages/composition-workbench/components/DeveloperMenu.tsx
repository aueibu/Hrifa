import { useState } from 'react';
import { Button, Popover, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import { useDeveloperOptions } from '../developerOptions';

/** Top-bar menu for options that are for working on the workbench, not for composing in it. */
export function DeveloperMenu() {
  const [opened, setOpened] = useState(false);
  const [options, update] = useDeveloperOptions();
  return (
    <Popover
      position="bottom-end"
      withArrow
      shadow="md"
      width={300}
      opened={opened}
      onChange={setOpened}
    >
      <Popover.Target>
        <Button variant="default" size="xs" onClick={() => setOpened((value) => !value)}>
          Developer
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Developer
          </Text>
          <Switch
            size="xs"
            label="Open transport and sounds too"
            description="Off keeps your current tempo, metronome, and voices."
            checked={options.openIncludesSettings}
            onChange={(event) => update({ openIncludesSettings: event.currentTarget.checked })}
          />
          <Stack gap={4}>
            <Text size="xs" fw={500}>
              Chord anchor note name
            </Text>
            <SegmentedControl
              size="xs"
              aria-label="Chord anchor note name placement"
              data={[
                { value: 'on-note', label: 'On the note' },
                { value: 'side', label: 'Beside it' },
              ]}
              value={options.chordAnchorLabel}
              onChange={(value) =>
                update({ chordAnchorLabel: value === 'side' ? 'side' : 'on-note' })
              }
            />
            <Text size="xs" c="dimmed">
              Where the Chords tool writes the clicked note's name on the roll.
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" fw={500}>
              Chord preview
            </Text>
            <SegmentedControl
              size="xs"
              aria-label="Preview: on click / Ctrl+click"
              data={[
                { value: 'click', label: 'On click' },
                { value: 'ctrl-click', label: 'Ctrl+click' },
              ]}
              value={options.chordPreviewGate}
              onChange={(value) =>
                update({ chordPreviewGate: value === 'ctrl-click' ? 'ctrl-click' : 'click' })
              }
            />
            <Text size="xs" c="dimmed">
              Preview: on click / Ctrl+click. Whether a chord, inversion or spread click sounds
              alone or needs Ctrl (Cmd on a Mac). Hover never sounds.
            </Text>
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
