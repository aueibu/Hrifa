import { useState } from 'react';
import { Button, Popover, Stack, Switch, Text } from '@mantine/core';
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
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
