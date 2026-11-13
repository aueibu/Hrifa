/** Note selection, under the pitch ring: All/None/Invert stacked, the mode stepper centred, nearest scale and odd limit on the right. */
import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  NativeSelect,
  NumberInput,
  SegmentedControl,
} from '@mantine/core';
import { SCALE_LIBRARY, melakarta } from '../../../lib/harmonic-field';
import { PICK_ED, resolveScale } from '../state/labState';
import { Num, Tip, useLab } from './ui';
import classes from './lab.module.css';

function scaleOptions() {
  return [
    { value: PICK_ED, label: 'm-ED (equal division)' },
    {
      group: 'Western',
      items: SCALE_LIBRARY.map((s) => ({ value: `w:${s.name}`, label: s.name })),
    },
    {
      group: 'Melakarta (1–72)',
      items: Array.from({ length: 72 }, (_, i) => {
        const m = melakarta(i + 1);
        return { value: `m${i + 1}`, label: `${i + 1} ${m?.name ?? ''}` };
      }),
    },
  ];
}

export function SubsetRow() {
  const { tab, base, dispatch } = useLab();
  const [odd, setOdd] = useState<string | number>(15);
  const options = useMemo(scaleOptions, []);
  const n = tab.sel.length;
  const root = n ? base.ratios[tab.sel[tab.mode]] : '–';
  const { pick } = tab;
  const isEd = pick.scale === PICK_ED;
  const octave = Math.abs(tab.rep.c - 1200) < 0.01;
  const desc = resolveScale(pick.scale)?.desc;
  return (
    <div className={classes.selectBar} role="group" aria-label="Note selection">
      <div className={classes.selectLeft}>
        <div className={classes.selectStack}>
          <Tip k="selectAll" as="control" block>
            <Button
              size="compact-xs"
              variant="default"
              fullWidth
              onClick={() => dispatch({ type: 'sel/all' })}
            >
              All
            </Button>
          </Tip>
          <Tip k="selectNone" as="control" block>
            <Button
              size="compact-xs"
              variant="default"
              fullWidth
              onClick={() => dispatch({ type: 'sel/none' })}
            >
              None
            </Button>
          </Tip>
          <Tip k="selectInvert" as="control" block>
            <Button
              size="compact-xs"
              variant="default"
              fullWidth
              onClick={() => dispatch({ type: 'sel/invert' })}
            >
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
              disabled={n < 2}
              onClick={() => dispatch({ type: 'mode/step', by: -1 })}
            >
              &lsaquo;
            </ActionIcon>
            <span className={classes.modeLabel}>
              mode <Num>{tab.mode}</Num> <Num muted>· {root}</Num>
            </span>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label="Next mode"
              disabled={n < 2}
              onClick={() => dispatch({ type: 'mode/step', by: 1 })}
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
              value={pick.kind === 'ji' ? 'JI' : '12'}
              onChange={(v) =>
                dispatch({ type: 'pick/set', patch: { kind: v === 'JI' ? 'ji' : 'edo12' } })
              }
              className={classes.tinySeg}
            />
          </Tip>
        </span>
        <div className={classes.pickRow}>
          <NativeSelect
            size="xs"
            aria-label="Scale to match"
            data={options}
            value={pick.scale}
            onChange={(e) =>
              dispatch({ type: 'pick/set', patch: { scale: e.currentTarget.value, msg: '' } })
            }
          />
          {isEd && (
            <NumberInput
              size="xs"
              aria-label="Equal divisions"
              suffix="-ED"
              min={1}
              max={1000}
              allowDecimal={false}
              hideControls
              value={pick.m}
              onChange={(v) => {
                if (typeof v === 'number') {
                  dispatch({ type: 'pick/set', patch: { m: v } });
                }
              }}
            />
          )}
          <Button size="xs" variant="default" onClick={() => dispatch({ type: 'pick/apply' })}>
            Select
          </Button>
        </div>
        {!isEd && !octave && (
          <Tip k="nearStretch" as="control">
            <Checkbox
              size="xs"
              label="Octave → repeat"
              checked={pick.stretch}
              onChange={(e) =>
                dispatch({ type: 'pick/set', patch: { stretch: e.currentTarget.checked } })
              }
            />
          </Tip>
        )}
        {pick.msg && (
          <span
            className={classes.fieldMsg}
            data-kind={pick.ok ? 'note' : 'err'}
            role={pick.ok ? 'status' : 'alert'}
            title={desc || undefined}
          >
            {pick.msg}
          </span>
        )}
        <span className={classes.pickHead}>
          <Tip k="oddLimitPick">Odd limit</Tip>
        </span>
        <div className={classes.pickRow}>
          <NumberInput
            size="xs"
            aria-label="Max odd limit"
            prefix="odd ≤ "
            value={odd}
            onChange={setOdd}
            min={1}
            allowDecimal={false}
            hideControls
          />
          <Button
            size="xs"
            variant="default"
            onClick={() =>
              dispatch({ type: 'odd/select', limit: typeof odd === 'number' ? odd : 15 })
            }
          >
            Select
          </Button>
        </div>
      </div>
    </div>
  );
}
