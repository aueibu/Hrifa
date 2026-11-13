/** Subset tools as one small group under the method settings: select, mode, nearest scale, odd limit, save, export. */
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
import { field, rel, savedSubsets } from './mockData';
import { Num, Tip, useLab } from './ui';
import classes from './mock.module.css';

const SCALES = SCALE_LIBRARY.slice(0, 14).map((s) => s.name);

export function SubsetRow() {
  const lab = useLab();
  const root = fmtRatio(rel[lab.mode]);
  const count = savedSubsets[lab.loaded].idx.length;
  return (
    <section className={classes.subsetBox} aria-label="Subset tools">
      <div className={classes.subsetHead}>
        <Tip k="subset">Subset</Tip>
        <Num muted>
          {count} of {field.length}
        </Num>
      </div>
      <div className={classes.subsetTriple} role="group" aria-label="Select">
        <Tip k="selectAll" as="control">
          <Button size="compact-xs" variant="default" fullWidth>
            All
          </Button>
        </Tip>
        <Tip k="selectNone" as="control">
          <Button size="compact-xs" variant="default" fullWidth>
            None
          </Button>
        </Tip>
        <Tip k="selectInvert" as="control">
          <Button size="compact-xs" variant="default" fullWidth>
            Invert
          </Button>
        </Tip>
      </div>
      <Tip k="mode" as="control" block>
        <div className={classes.modeStep}>
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Previous mode"
            onClick={() => lab.setMode((lab.mode + 6) % 7)}
          >
            &lsaquo;
          </ActionIcon>
          <span className={classes.modeLabel}>
            mode <Num>{lab.mode}</Num> <Num muted>on {root}</Num>
          </span>
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Next mode"
            onClick={() => lab.setMode((lab.mode + 1) % 7)}
          >
            &rsaquo;
          </ActionIcon>
        </div>
      </Tip>
      <Tip k="pickNearest" as="control" block>
        <Popover position="right-start" width={260} transitionProps={{ duration: 0 }}>
          <Popover.Target>
            <Button size="compact-xs" variant="default" fullWidth>
              Nearest scale…
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
      <Tip k="oddLimitPick" as="control" block>
        <div className={classes.subsetPair}>
          <NumberInput
            size="xs"
            aria-label="Max odd limit"
            prefix="odd ≤ "
            defaultValue={15}
            hideControls
          />
          <Button size="xs" variant="default">
            Select
          </Button>
        </div>
      </Tip>
      <div className={classes.subsetPair2}>
        <Tip k="saveSubset" as="control" block>
          <Popover position="right-start" width={240} transitionProps={{ duration: 0 }}>
            <Popover.Target>
              <Button size="compact-xs" variant="default" fullWidth leftSection={<SaveIcon />}>
                Save
              </Button>
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
        <Tip k="exportScl" as="control" block>
          <Button
            size="compact-xs"
            variant="default"
            fullWidth
            leftSection={<DownloadIcon />}
            aria-label="Export .scl"
          >
            .scl
          </Button>
        </Tip>
      </div>
    </section>
  );
}
