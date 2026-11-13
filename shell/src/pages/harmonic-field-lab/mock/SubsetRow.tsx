/** Note selection, under the pitch ring: All/None/Invert stacked, the mode stepper centred, nearest scale and odd limit on the right. */
import { ActionIcon, Button, NativeSelect, NumberInput, SegmentedControl } from '@mantine/core';
import { SCALE_LIBRARY, fmtRatio } from '../../../lib/harmonic-field';
import { rel } from './mockData';
import { Num, Tip, useLab } from './ui';
import classes from './mock.module.css';

const SCALES = SCALE_LIBRARY.slice(0, 14).map((s) => s.name);

export function SubsetRow() {
  const lab = useLab();
  const root = fmtRatio(rel[lab.mode]);
  return (
    <div className={classes.selectBar} role="group" aria-label="Note selection">
      <div className={classes.selectLeft}>
        <div className={classes.selectStack}>
          <Tip k="selectAll" as="control" block>
            <Button size="compact-xs" variant="default" fullWidth>
              All
            </Button>
          </Tip>
          <Tip k="selectNone" as="control" block>
            <Button size="compact-xs" variant="default" fullWidth>
              None
            </Button>
          </Tip>
          <Tip k="selectInvert" as="control" block>
            <Button size="compact-xs" variant="default" fullWidth>
              Invert
            </Button>
          </Tip>
        </div>
        <Tip k="mode" as="control">
          <span className={classes.modeStep}>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label="Previous mode"
              onClick={() => lab.setMode((lab.mode + 6) % 7)}
            >
              &lsaquo;
            </ActionIcon>
            <span className={classes.modeLabel}>
              mode <Num>{lab.mode}</Num> <Num muted>· {root}</Num>
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
      </div>
      <div className={classes.pickStack}>
        <span className={classes.pickHead}>
          <Tip k="pickNearest">Nearest scale</Tip>
          <Tip k="nearTargets" as="control">
            <SegmentedControl
              size="xs"
              aria-label="Targets"
              data={['12', 'JI']}
              className={classes.tinySeg}
            />
          </Tip>
        </span>
        <div className={classes.pickRow}>
          <NativeSelect size="xs" aria-label="Scale to match" data={SCALES} />
          <Button size="xs" variant="default">
            Select
          </Button>
        </div>
        <span className={classes.pickHead}>
          <Tip k="oddLimitPick">Odd limit</Tip>
        </span>
        <div className={classes.pickRow}>
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
      </div>
    </div>
  );
}
