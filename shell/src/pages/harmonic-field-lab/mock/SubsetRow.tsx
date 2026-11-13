/** Subset tool row: selection, mode, nearest scale, odd limit, save and export, all as compact controls. */
import {
  ActionIcon,
  Button,
  Checkbox,
  NativeSelect,
  NumberInput,
  Popover,
  TextInput,
} from '@mantine/core';
import { SCALE_LIBRARY, fmtRatio } from '../../../lib/harmonic-field';
import { DownloadIcon, SaveIcon } from './icons';
import { rel } from './mockData';
import { Num, Tip, useLab } from './ui';
import classes from './mock.module.css';

const SCALES = SCALE_LIBRARY.slice(0, 14).map((s) => s.name);

export function SubsetRow() {
  const lab = useLab();
  const root = fmtRatio(rel[lab.mode]);
  return (
    <div className={classes.toolRow} role="group" aria-label="Subset tools">
      <span className={classes.inline}>
        <Tip k="selectAll" as="control">
          <Button size="compact-xs" variant="default">
            All
          </Button>
        </Tip>
        <Tip k="selectNone" as="control">
          <Button size="compact-xs" variant="default">
            None
          </Button>
        </Tip>
        <Tip k="selectInvert" as="control">
          <Button size="compact-xs" variant="default">
            Inv
          </Button>
        </Tip>
      </span>
      <Tip k="mode" as="control">
        <span className={classes.inline}>
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Previous mode"
            onClick={() => lab.setMode((lab.mode + 6) % 7)}
          >
            &lsaquo;
          </ActionIcon>
          <span className={classes.modeLabel}>
            mode <Num>{lab.mode}</Num> <Num muted>{root}</Num>
          </span>
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Next mode"
            onClick={() => lab.setMode((lab.mode + 1) % 7)}
          >
            &rsaquo;
          </ActionIcon>
        </span>
      </Tip>
      <Tip k="pickNearest" as="control">
        <Popover position="top" width={260} transitionProps={{ duration: 0 }}>
          <Popover.Target>
            <Button size="compact-xs" variant="default">
              Nearest scale
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <div className={classes.formStack}>
              <NativeSelect size="xs" aria-label="Scale to match" data={SCALES} />
              <span className={classes.inline}>
                <Tip k="nearTargets" as="control">
                  <NativeSelect
                    size="xs"
                    aria-label="Targets"
                    data={['12-EDO', 'Just (JI)']}
                    w={104}
                  />
                </Tip>
                <NumberInput
                  size="xs"
                  aria-label="Equal division"
                  defaultValue={12}
                  w={60}
                  hideControls
                />
                <Button size="xs" variant="default">
                  Select
                </Button>
              </span>
            </div>
          </Popover.Dropdown>
        </Popover>
      </Tip>
      <Tip k="oddLimitPick" as="control">
        <span className={classes.inline}>
          <NumberInput
            size="xs"
            aria-label="Max odd limit"
            prefix="odd ≤ "
            defaultValue={15}
            w={78}
            hideControls
          />
          <Button size="compact-xs" variant="default">
            Select
          </Button>
        </span>
      </Tip>
      <span className={classes.grow} />
      <Tip k="saveSubset" as="control">
        <Popover position="top-end" width={240} transitionProps={{ duration: 0 }}>
          <Popover.Target>
            <ActionIcon variant="default" size="sm" aria-label="Save subset">
              <SaveIcon />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <div className={classes.formStack}>
              <span className={classes.inline}>
                <TextInput size="xs" aria-label="Subset name" placeholder="Name" flex={1} />
                <Button size="xs" variant="default">
                  Save
                </Button>
              </span>
              <Checkbox size="xs" label="Include new notes when the field changes" />
            </div>
          </Popover.Dropdown>
        </Popover>
      </Tip>
      <Tip k="exportScl" as="control">
        <ActionIcon variant="default" size="sm" aria-label="Export .scl">
          <DownloadIcon />
        </ActionIcon>
      </Tip>
    </div>
  );
}
