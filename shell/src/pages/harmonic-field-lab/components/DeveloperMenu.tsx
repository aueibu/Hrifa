/** Top-bar "Developer" popover: options for how the lab shows things, kept per viewer (state/developerOptions.ts). */
import { Button, Popover, Switch } from '@mantine/core';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { Tip } from './ui';
import classes from './lab.module.css';

export function DeveloperMenu() {
  const [options, update] = useLabDeveloperOptions();
  return (
    <Tip k="developerMenu" as="control">
      <Popover position="bottom-end" width={260} transitionProps={{ duration: 0 }}>
        <Popover.Target>
          <Button variant="default" size="compact-xs" aria-label="Developer options">
            Developer
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <div className={classes.formStack}>
            <Tip k="modeSignAlways" as="control" block>
              <Switch
                size="xs"
                label="Mode tiles: always show ± sign"
                checked={options.modeSignAlways}
                onChange={(e) => update({ modeSignAlways: e.currentTarget.checked })}
              />
            </Tip>
          </div>
        </Popover.Dropdown>
      </Popover>
    </Tip>
  );
}
