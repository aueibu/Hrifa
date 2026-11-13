/** Generator row: preset, ⚙ fold-out (prime filter, repeat interval), method tabs with their numbers inline. */
import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  NativeSelect,
  NumberInput,
  Popover,
  SegmentedControl,
  TextInput,
} from '@mantine/core';
import { PRESETS, PRIMES } from '../../../lib/harmonic-field';
import { GearIcon } from './icons';
import { field, presetInfo, repC, repText } from './mockData';
import { Num, Tip } from './ui';
import classes from './mock.module.css';

const PRIME_LABELS = [...PRIMES.slice(0, 24).map(String), '97+'];
const METHODS = [
  { value: 'harmonic', label: 'Harmonic' },
  { value: 'sub', label: 'Sub' },
  { value: 'edo', label: 'EDO' },
  { value: 'lattice', label: 'Lattice' },
  { value: 'cps', label: 'CPS' },
  { value: 'custom', label: 'Custom' },
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

function MethodParams({ method }: { method: string }) {
  switch (method) {
    case 'harmonic':
    case 'sub':
      return (
        <>
          <Tip k="startHarmonic" as="control">
            <NumberInput
              size="xs"
              aria-label="Starting harmonic"
              prefix="from "
              defaultValue={8}
              min={1}
              max={256}
              w={84}
            />
          </Tip>
          <span className={classes.paramNote}>
            <Num>8/8</Num> to <Num>15/8</Num>, <Num>{field.length}</Num> notes
          </span>
        </>
      );
    case 'edo':
      return (
        <Tip k="edoDivisions" as="control">
          <NumberInput
            size="xs"
            aria-label="Divisions"
            suffix=" divisions"
            defaultValue={19}
            w={112}
          />
        </Tip>
      );
    case 'lattice':
      return (
        <>
          <Tip k="latticeShape" as="control">
            <NativeSelect size="xs" aria-label="Lattice shape" data={['Box', 'Diamond']} w={84} />
          </Tip>
          <Tip k="genAxis" as="control">
            <span className={classes.inline}>
              {[
                ['3/2', 12],
                ['5/4', 3],
                ['7/4', 3],
              ].map(([g, n], i) => (
                <span key={g} className={classes.inline}>
                  <TextInput
                    size="xs"
                    aria-label={`Axis ${i + 1} generator`}
                    defaultValue={g as string}
                    w={52}
                  />
                  <NumberInput
                    size="xs"
                    aria-label={`Axis ${i + 1} count`}
                    prefix="×"
                    defaultValue={n as number}
                    hideControls
                    w={44}
                  />
                </span>
              ))}
            </span>
          </Tip>
        </>
      );
    case 'cps':
      return (
        <>
          <Tip k="cpsFactors" as="control">
            <TextInput size="xs" aria-label="Factors" defaultValue="1 3 5 7" w={108} />
          </Tip>
          <Tip k="cpsK" as="control">
            <NumberInput size="xs" aria-label="Choose k" prefix="choose " defaultValue={2} w={92} />
          </Tip>
        </>
      );
    default:
      return (
        <>
          <Tip k="customIntervals" as="control">
            <TextInput
              size="xs"
              aria-label="Intervals"
              defaultValue="9/8 5/4 4/3 3/2 5/3 15/8"
              w={220}
            />
          </Tip>
          <Tip k="loadScl" as="control">
            <Button size="compact-xs" variant="default">
              Load .scl
            </Button>
          </Tip>
        </>
      );
  }
}

export function GeneratorBar() {
  const data = useMemo(presetOptions, []);
  const [method, setMethod] = useState('harmonic');
  return (
    <div className={classes.genBar}>
      <div className={classes.genRow}>
        <Tip k="preset" as="control" extra={presetInfo.info}>
          <NativeSelect
            size="xs"
            aria-label="Preset"
            data={data}
            defaultValue={presetInfo.name}
            w={176}
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
        <Tip k="method" as="control">
          <SegmentedControl
            size="xs"
            aria-label="Method"
            value={method}
            onChange={setMethod}
            data={METHODS}
          />
        </Tip>
        <Tip k="methodParams" as="control">
          <span className={classes.inline} data-method={method}>
            <MethodParams method={method} />
          </span>
        </Tip>
        <span className={classes.grow} />
        <span className={classes.paramNote}>
          repeat <Num>{repText}</Num> <Num muted>{repC.toFixed(0)} c</Num>
        </span>
      </div>
    </div>
  );
}
