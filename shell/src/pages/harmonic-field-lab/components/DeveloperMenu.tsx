/** Top-bar "Developer" popover: options for how the lab shows things, kept per viewer (state/developerOptions.ts). */
import { Button, NumberInput, Popover, SegmentedControl, Switch, Text } from '@mantine/core';
import { TOOLTIP_DELAY_MAX, useLabDeveloperOptions } from '../state/developerOptions';
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
            <Tip k="keepModeRoot" as="control" block>
              <Switch
                size="xs"
                label="Keep the mode root when notes are added or removed"
                checked={options.keepModeRoot}
                onChange={(e) => update({ keepModeRoot: e.currentTarget.checked })}
              />
            </Tip>
            <Tip k="linkedRootDefault" as="control" block>
              <Text size="xs">Linked melody root default</Text>
              <SegmentedControl
                size="xs"
                fullWidth
                aria-label="Linked melody root default"
                value={options.linkedRootDefault}
                onChange={(v) =>
                  update({ linkedRootDefault: v === 'reroot' ? 'reroot' : 'transpose' })
                }
                data={[
                  { label: 'Transpose', value: 'transpose' },
                  { label: 'Re-root', value: 'reroot' },
                ]}
              />
            </Tip>
            <Tip k="tooltips" as="control" block>
              <Switch
                size="xs"
                label="Tooltips"
                checked={options.tooltips}
                onChange={(e) => update({ tooltips: e.currentTarget.checked })}
              />
            </Tip>
            <Tip k="tooltipDelay" as="control" block>
              <NumberInput
                size="xs"
                label="Tooltip delay (ms)"
                min={0}
                max={TOOLTIP_DELAY_MAX}
                step={50}
                allowDecimal={false}
                allowNegative={false}
                clampBehavior="strict"
                disabled={!options.tooltips}
                value={options.tooltipDelay}
                onChange={(v) => update({ tooltipDelay: typeof v === 'number' ? v : 250 })}
              />
            </Tip>
          </div>
        </Popover.Dropdown>
      </Popover>
    </Tip>
  );
}
