/** Generator column (left of the ring): preset, ⚙ fold-out (prime filter, repeat), method tabs, then that method's parameters. */
import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  NativeSelect,
  NumberInput,
  Popover,
  SegmentedControl,
  Textarea,
  TextInput,
} from '@mantine/core';
import { PRESETS, PRIMES } from '../../../lib/harmonic-field';
import { GearIcon } from './icons';
import { field, presetInfo, repC, repText } from './mockData';
import { Num, Tip } from './ui';
import classes from './mock.module.css';

const PRIME_LABELS = [...PRIMES.slice(0, 24).map(String), '97+'];
const METHODS = [
  { value: 'harmonic', label: 'Harm' },
  { value: 'sub', label: 'Sub' },
  { value: 'edo', label: 'EDO' },
  { value: 'lattice', label: 'Latt' },
  { value: 'cps', label: 'CPS' },
  { value: 'custom', label: 'Cust' },
];

function presetOptions() {
  const groups = new Map<string, string[]>();
  for (const p of PRESETS) {
    groups.set(p.group, [...(groups.get(p.group) ?? []), p.name]);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

function FieldSettings() {
  const [on, setOn] = useState<Set<string>>(() => new Set(PRIME_LABELS));
  const toggle = (p: string) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(p)) {
        n.delete(p);
      } else {
        n.add(p);
      }
      return n;
    });
  return (
    <div className={classes.formStack}>
      <div className={classes.rowBetween}>
        <Tip k="primeFilter">Prime filter</Tip>
        <span className={classes.inline}>
          <Tip k="primeAll" as="control">
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => setOn(new Set(PRIME_LABELS))}
            >
              All
            </Button>
          </Tip>
          <Tip k="primeNone" as="control">
            <Button size="compact-xs" variant="default" onClick={() => setOn(new Set())}>
              None
            </Button>
          </Tip>
        </span>
      </div>
      <div className={classes.primes} role="group" aria-label="Prime filter">
        {PRIME_LABELS.map((p) => (
          <button
            key={p}
            type="button"
            className={classes.switchChip}
            data-on={on.has(p)}
            aria-pressed={on.has(p)}
            onClick={() => toggle(p)}
          >
            <Num>{p}</Num>
          </button>
        ))}
      </div>
      <Tip k="repeat" as="control" block>
        <TextInput
          size="xs"
          label="Repeat interval"
          defaultValue={repText}
          description="3/2, 3, 701.96c or 7&#92;12"
        />
      </Tip>
    </div>
  );
}

function Params({ method }: { method: string }) {
  switch (method) {
    case 'harmonic':
    case 'sub':
      return (
        <>
          <Tip k="startHarmonic" as="control" block>
            <NumberInput size="xs" label="Starting harmonic" defaultValue={8} min={1} max={256} />
          </Tip>
          <span className={classes.paramNote}>
            <Num>8/8</Num> to <Num>15/8</Num> &middot; <Num>{field.length}</Num> notes
          </span>
        </>
      );
    case 'edo':
      return (
        <Tip k="edoDivisions" as="control" block>
          <NumberInput size="xs" label="Divisions" defaultValue={19} />
        </Tip>
      );
    case 'lattice':
      return (
        <>
          <Tip k="latticeShape" as="control" block>
            <NativeSelect
              size="xs"
              label="Shape"
              data={['Box (count × count × ...)', 'Diamond (within N steps)']}
            />
          </Tip>
          <Tip k="genAxis" as="control" block>
            <div className={classes.axes}>
              <span className={classes.paramNote}>Axis</span>
              <span className={classes.paramNote}>Generator</span>
              <span className={classes.paramNote}>Count</span>
              <span className={classes.paramNote}>Centre</span>
              {(
                [
                  ['3/2', 12, 0],
                  ['5/4', 3, 1],
                  ['7/4', 3, 1],
                ] as const
              ).map(([g, n, ctr], i) => (
                <span key={g} className={classes.axisRow}>
                  <Num muted>{i + 1}</Num>
                  <TextInput size="xs" aria-label={`Axis ${i + 1} generator`} defaultValue={g} />
                  <NumberInput
                    size="xs"
                    aria-label={`Axis ${i + 1} count`}
                    defaultValue={n}
                    min={1}
                    hideControls
                  />
                  <NumberInput
                    size="xs"
                    aria-label={`Axis ${i + 1} centre`}
                    defaultValue={ctr}
                    min={0}
                    hideControls
                  />
                </span>
              ))}
            </div>
          </Tip>
          <span className={classes.paramNote}>
            <Tip k="mos">MOS sizes</Tip> for 3/2: <Num>5</Num> <Num>7</Num> <Num>12</Num>
          </span>
        </>
      );
    case 'cps':
      return (
        <>
          <Tip k="cpsFactors" as="control" block>
            <TextInput size="xs" label="Factors" defaultValue="1 3 5 7" />
          </Tip>
          <Tip k="cpsK" as="control" block>
            <NumberInput size="xs" label="Choose k" defaultValue={2} />
          </Tip>
          <span className={classes.paramNote}>1 3 5 7 choose 2 is the hexany.</span>
        </>
      );
    default:
      return (
        <>
          <Tip k="customIntervals" as="control" block>
            <Textarea
              size="xs"
              label="Intervals (one per line)"
              description="ratios, cents (701.96c) or 7&#92;12"
              rows={6}
              defaultValue={'9/8\n5/4\n4/3\n3/2\n5/3\n15/8'}
            />
          </Tip>
          <Tip k="loadScl" as="control">
            <Button size="compact-xs" variant="default">
              Load .scl file
            </Button>
          </Tip>
        </>
      );
  }
}

export function GeneratorColumn() {
  const data = useMemo(presetOptions, []);
  const [method, setMethod] = useState('harmonic');
  return (
    <div className={classes.genCol}>
      <div className={classes.genTop}>
        <Tip k="preset" as="control" extra={presetInfo.info}>
          <NativeSelect
            size="xs"
            aria-label="Preset"
            data={data}
            defaultValue={presetInfo.name}
            w="100%"
          />
        </Tip>
        <Tip k="fieldSettings" as="control">
          <Popover position="bottom-start" width={296} transitionProps={{ duration: 0 }}>
            <Popover.Target>
              <ActionIcon variant="default" size="sm" aria-label="Field settings">
                <GearIcon />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <FieldSettings />
            </Popover.Dropdown>
          </Popover>
        </Tip>
      </div>
      <Tip k="method" as="control" block>
        <SegmentedControl
          size="xs"
          fullWidth
          aria-label="Method"
          value={method}
          onChange={setMethod}
          data={METHODS}
        />
      </Tip>
      <div className={classes.params} data-method={method}>
        <Params method={method} />
      </div>
      <span className={classes.paramNote}>
        repeat <Num>{repText}</Num> <Num muted>{repC.toFixed(0)} c</Num>
      </span>
    </div>
  );
}
