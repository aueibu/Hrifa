/**
 * Top-bar "Developer" popover: options for how the lab shows and behaves, kept per viewer (state/developerOptions.ts).
 * Rule (human, 2026-11-15): the controls are grouped into sections by what and where they affect (Tooltips, Mode display,
 * Playback and keys, Composites); a new control goes into the section it affects, or a new section.
 */
import type { ReactNode } from 'react';
import { Button, NumberInput, Popover, SegmentedControl, Switch, Text } from '@mantine/core';
import {
  BEAT_PARTIAL_LIMIT_MAX,
  MERGE_TOL_DEFAULT,
  MERGE_TOL_MAX,
} from '../../../lib/harmonic-field';
import {
  TOOLTIP_DELAY_MAX,
  sanitizeTileLook,
  useLabDeveloperOptions,
} from '../state/developerOptions';
import { Tip } from './ui';
import classes from './lab.module.css';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className={classes.formStack}>
      <Text size="xs" fw={600} c="dimmed" component="h3" m={0}>
        {title}
      </Text>
      {children}
    </div>
  );
}

export function DeveloperMenu() {
  const [options, update] = useLabDeveloperOptions();
  return (
    <Tip k="developerMenu" as="control">
      <Popover position="bottom-end" width={280} transitionProps={{ duration: 0 }}>
        <Popover.Target>
          <Button variant="default" size="compact-xs" aria-label="Developer options">
            Developer
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <div className={classes.formStack}>
            <Section title="Tooltips">
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
            </Section>
            <Section title="Mode display">
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
            </Section>
            <Section title="Playback and keys">
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
            </Section>
            <Section title="Pairs panel">
              <Tip k="intervalColor" as="control" block>
                <Text size="xs">Interval color</Text>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  aria-label="Interval color"
                  value={options.intervalColor}
                  onChange={(v) => update({ intervalColor: v === 'rank' ? 'rank' : 'size' })}
                  data={[
                    { label: 'Size wheel', value: 'size' },
                    { label: 'By rank', value: 'rank' },
                  ]}
                />
              </Tip>
              <Tip k="intervalIntensity" as="control" block>
                <Text size="xs">Interval intensity</Text>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  aria-label="Interval intensity"
                  value={options.intervalIntensity}
                  onChange={(v) =>
                    update({ intervalIntensity: v === 'strong' ? 'strong' : 'faint' })
                  }
                  data={[
                    { label: 'Complex strong', value: 'faint' },
                    { label: 'Simple strong', value: 'strong' },
                  ]}
                />
              </Tip>
              <Tip k="tintScale" as="control" block>
                <Text size="xs">Tint strength scale</Text>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  aria-label="Tint strength scale"
                  value={options.tintScale}
                  onChange={(v) => update({ tintScale: v === 'relative' ? 'relative' : 'fixed' })}
                  data={[
                    { label: 'Fixed', value: 'fixed' },
                    { label: 'Relative', value: 'relative' },
                  ]}
                />
              </Tip>
              <Tip k="tintBand" as="control" block>
                <Text size="xs">Tint band</Text>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  aria-label="Tint band"
                  value={options.tintBand}
                  onChange={(v) => update({ tintBand: v === 'left' ? 'left' : 'center' })}
                  data={[
                    { label: 'Center', value: 'center' },
                    { label: 'Left', value: 'left' },
                  ]}
                />
              </Tip>
              <Tip k="beatPartialLimit" as="control" block>
                <NumberInput
                  size="xs"
                  label="Beat partial limit"
                  placeholder="Off"
                  min={1}
                  max={BEAT_PARTIAL_LIMIT_MAX}
                  step={1}
                  allowDecimal={false}
                  allowNegative={false}
                  clampBehavior="strict"
                  value={options.beatPartialLimit ?? ''}
                  onChange={(v) => update({ beatPartialLimit: typeof v === 'number' ? v : null })}
                />
              </Tip>
            </Section>
            <Section title="Tiles">
              <Tip k="tileLook" as="control" block>
                <Text size="xs">Tile look (Modes and Pairs)</Text>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  aria-label="Tile look"
                  value={options.tileLook}
                  onChange={(v) => update({ tileLook: sanitizeTileLook(v) })}
                  data={[
                    { label: 'Tinted', value: 'tinted' },
                    { label: 'Outlined', value: 'outlined' },
                    { label: 'Solid', value: 'solid' },
                  ]}
                />
              </Tip>
              <Tip k="tileOutline" as="control" block>
                <Switch
                  size="xs"
                  label="Stack an outline on Tinted and Solid tiles"
                  checked={options.tileOutline}
                  onChange={(e) => update({ tileOutline: e.currentTarget.checked })}
                />
              </Tip>
            </Section>
            <Section title="Composites">
              <Tip k="mergeTolerance" as="control" block>
                <NumberInput
                  size="xs"
                  label="Merge tolerance (c)"
                  min={0}
                  max={MERGE_TOL_MAX}
                  step={1}
                  decimalScale={1}
                  allowNegative={false}
                  clampBehavior="strict"
                  value={options.mergeTolerance}
                  onChange={(v) =>
                    update({ mergeTolerance: typeof v === 'number' ? v : MERGE_TOL_DEFAULT })
                  }
                />
              </Tip>
              <Tip k="mergeKeeps" as="control" block>
                <Text size="xs">Merged note keeps</Text>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  aria-label="Merged note keeps"
                  value={options.mergeKeeps}
                  onChange={(v) => update({ mergeKeeps: v === 'recent' ? 'recent' : 'first' })}
                  data={[
                    { label: 'First', value: 'first' },
                    { label: 'Most recent', value: 'recent' },
                  ]}
                />
              </Tip>
            </Section>
          </div>
        </Popover.Dropdown>
      </Popover>
    </Tip>
  );
}
