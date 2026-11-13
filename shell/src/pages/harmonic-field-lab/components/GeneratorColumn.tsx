/** Generator column (left of the ring): preset, ⚙ fold-out (prime filter, repeat), method tabs, then that method's parameters. */
import { useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  NativeSelect,
  Popover,
  SegmentedControl,
} from '@mantine/core';
import { PRESETS, fmtRatio, parseScl } from '../../../lib/harmonic-field';
import { PRIME_LABELS, mosFor, rangeText, type GenSpec, type Method } from '../state/generate';
import { GearIcon } from './icons';
import { CommitNumber, DebouncedText, DebouncedTextarea, Num, Tip, useLab } from './ui';
import classes from './lab.module.css';

const METHODS: { value: Method; label: string }[] = [
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
  return [
    { value: '', label: '(edited by hand)' },
    ...[...groups].map(([group, items]) => ({ group, items })),
  ];
}

function FieldSettings({ gen }: { gen: GenSpec }) {
  const { dispatch } = useLab();
  return (
    <div className={classes.formStack}>
      <div className={classes.rowBetween}>
        <Tip k="primeFilter">Prime filter</Tip>
        <span className={classes.inline}>
          <Tip k="primeAll" as="control">
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => dispatch({ type: 'gen/primes', on: true })}
            >
              All
            </Button>
          </Tip>
          <Tip k="primeNone" as="control">
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => dispatch({ type: 'gen/primes', on: false })}
            >
              None
            </Button>
          </Tip>
        </span>
      </div>
      <div className={classes.primes} role="group" aria-label="Prime filter">
        {PRIME_LABELS.map((p, slot) => (
          <button
            key={p}
            type="button"
            className={classes.switchChip}
            data-on={gen.mask[slot]}
            aria-pressed={gen.mask[slot]}
            onClick={() => dispatch({ type: 'gen/prime', slot })}
          >
            <Num>{p}</Num>
          </button>
        ))}
      </div>
      <Tip k="repeat" as="control" block>
        <DebouncedText
          size="xs"
          label="Repeat interval"
          value={gen.rep}
          onCommit={(rep) => dispatch({ type: 'gen/patch', patch: { rep } })}
          description="3/2, 3, 701.96c or 7&#92;12"
        />
      </Tip>
    </div>
  );
}

function Params({ gen }: { gen: GenSpec }) {
  const { tab, dispatch } = useLab();
  const patch = (p: Partial<GenSpec>) => dispatch({ type: 'gen/patch', patch: p });
  const mos = useMemo(() => mosFor(gen), [gen]);
  const file = useRef<HTMLInputElement>(null);
  const [sclMsg, setSclMsg] = useState('');
  switch (gen.method) {
    case 'harmonic':
    case 'sub':
      return (
        <>
          <Tip k="startHarmonic" as="control" block>
            <CommitNumber
              size="xs"
              label="Starting harmonic"
              value={gen.h}
              min={1}
              max={256}
              onCommit={(h) => patch({ h })}
            />
          </Tip>
          <span className={classes.paramNote}>
            <Num>{rangeText(tab.field)}</Num> &middot; <Num>{tab.field.length}</Num> notes
          </span>
        </>
      );
    case 'edo':
      return (
        <Tip k="edoDivisions" as="control" block>
          <CommitNumber
            size="xs"
            label="Divisions"
            value={gen.edoN}
            min={1}
            max={2048}
            onCommit={(edoN) => patch({ edoN })}
          />
        </Tip>
      );
    case 'lattice': {
      const diamond = gen.shape === 'diamond';
      return (
        <>
          <Tip k="latticeShape" as="control" block>
            <NativeSelect
              size="xs"
              label="Shape"
              value={gen.shape}
              onChange={(e) =>
                patch({ shape: e.currentTarget.value === 'diamond' ? 'diamond' : 'box' })
              }
              data={[
                { value: 'box', label: 'Box (count × count × ...)' },
                { value: 'diamond', label: 'Diamond (within N steps)' },
              ]}
            />
          </Tip>
          <Tip k="genAxis" as="control" block>
            <div className={classes.axes}>
              <span className={classes.paramNote}>Axis</span>
              <span className={classes.paramNote}>Generator</span>
              <span className={classes.paramNote}>Count</span>
              <span className={classes.paramNote}>Centre</span>
              {gen.axes.map((a, i) => (
                <span key={i} className={classes.axisRow}>
                  {i === 0 ? (
                    <Num muted>1</Num>
                  ) : (
                    <Checkbox
                      size="xs"
                      checked={a.on}
                      aria-label={`Axis ${i + 1} on`}
                      onChange={(e) =>
                        dispatch({
                          type: 'gen/axis',
                          index: i,
                          patch: { on: e.currentTarget.checked },
                        })
                      }
                    />
                  )}
                  <DebouncedText
                    size="xs"
                    aria-label={`Axis ${i + 1} generator`}
                    value={a.g}
                    disabled={!a.on}
                    onCommit={(g) => dispatch({ type: 'gen/axis', index: i, patch: { g } })}
                  />
                  <CommitNumber
                    size="xs"
                    aria-label={`Axis ${i + 1} count`}
                    value={a.n}
                    min={1}
                    max={2048}
                    hideControls
                    disabled={!a.on || diamond}
                    onCommit={(n) => dispatch({ type: 'gen/axis', index: i, patch: { n } })}
                  />
                  <CommitNumber
                    size="xs"
                    aria-label={`Axis ${i + 1} centre`}
                    value={a.ctr}
                    min={0}
                    max={2048}
                    hideControls
                    disabled={!a.on || diamond}
                    onCommit={(ctr) => dispatch({ type: 'gen/axis', index: i, patch: { ctr } })}
                  />
                </span>
              ))}
            </div>
          </Tip>
          {diamond && (
            <>
              <Tip k="diamondDistance" as="control" block>
                <CommitNumber
                  size="xs"
                  label="Steps from the centre"
                  value={gen.dist}
                  min={0}
                  max={64}
                  onCommit={(dist) => patch({ dist })}
                />
              </Tip>
              <Checkbox
                size="xs"
                label="Both directions"
                checked={gen.bidir}
                onChange={(e) => patch({ bidir: e.currentTarget.checked })}
              />
            </>
          )}
          <span className={classes.paramNote}>
            <Tip k="mos">MOS sizes</Tip> for <Num>{gen.axes[0]?.g}</Num>:{' '}
            {mos.length === 0 ? (
              <Num muted>none</Num>
            ) : (
              mos.map((m) => (
                <button
                  key={m.n}
                  type="button"
                  className={classes.mosChip}
                  aria-label={`Use ${m.n} notes on axis 1`}
                  onClick={() => dispatch({ type: 'gen/axis', index: 0, patch: { n: m.n } })}
                >
                  {m.n}
                </button>
              ))
            )}
          </span>
        </>
      );
    }
    case 'cps':
      return (
        <>
          <Tip k="cpsFactors" as="control" block>
            <DebouncedText
              size="xs"
              label="Factors"
              value={gen.cpsF}
              onCommit={(cpsF) => patch({ cpsF })}
            />
          </Tip>
          <Tip k="cpsK" as="control" block>
            <CommitNumber
              size="xs"
              label="Choose k"
              value={gen.cpsK}
              min={1}
              max={64}
              onCommit={(cpsK) => patch({ cpsK })}
            />
          </Tip>
          <span className={classes.paramNote}>
            {gen.cpsF.trim()} choose {gen.cpsK}
            {gen.cpsF.trim().split(/\s+/).length === 4 && gen.cpsK === 2 ? ' is the hexany.' : '.'}
          </span>
        </>
      );
    default:
      return (
        <>
          <Tip k="customIntervals" as="control" block>
            <DebouncedTextarea
              size="xs"
              label="Intervals (one per line)"
              description="ratios, cents (701.96c) or 7&#92;12"
              rows={6}
              value={gen.custom}
              onCommit={(custom) => patch({ custom })}
            />
          </Tip>
          <Tip k="loadScl" as="control">
            <Button size="compact-xs" variant="default" onClick={() => file.current?.click()}>
              Load .scl file
            </Button>
          </Tip>
          <input
            ref={file}
            type="file"
            accept=".scl,text/plain"
            hidden
            aria-label="Scala file"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!f) {
                return;
              }
              void f.text().then((t) => {
                const s = parseScl(t);
                if (!s.pitches.length) {
                  setSclMsg('That file has no pitches.');
                  return;
                }
                setSclMsg('');
                dispatch({
                  type: 'gen/custom',
                  custom: s.pitches.slice(0, -1).join('\n'),
                  rep: s.pitches[s.pitches.length - 1],
                });
              });
            }}
          />
          {sclMsg && (
            <span className={classes.fieldMsg} data-kind="err" role="alert">
              {sclMsg}
            </span>
          )}
        </>
      );
  }
}

export function GeneratorColumn() {
  const { tab, dispatch } = useLab();
  const { gen } = tab;
  const data = useMemo(presetOptions, []);
  const info = PRESETS.find((p) => p.name === gen.preset)?.info;
  const failed = tab.err !== '' && !/^Truncated|^Prime filter/.test(tab.err);
  return (
    <div className={classes.genCol}>
      <div className={classes.genTop}>
        <Tip k="preset" as="control" extra={info}>
          <NativeSelect
            size="xs"
            aria-label="Preset"
            data={data}
            value={gen.preset}
            onChange={(e) => {
              const name = e.currentTarget.value;
              if (name) {
                dispatch({ type: 'gen/preset', name });
              }
            }}
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
              <FieldSettings gen={gen} />
            </Popover.Dropdown>
          </Popover>
        </Tip>
      </div>
      <Tip k="method" as="control" block>
        <SegmentedControl
          size="xs"
          fullWidth
          aria-label="Method"
          value={gen.method}
          onChange={(m) => dispatch({ type: 'gen/method', method: m as Method })}
          data={METHODS}
        />
      </Tip>
      <div className={classes.params} data-method={gen.method}>
        <Params gen={gen} />
      </div>
      {tab.err && (
        <span
          className={classes.fieldMsg}
          data-kind={failed ? 'err' : 'warn'}
          role={failed ? 'alert' : 'status'}
        >
          {tab.err}
        </span>
      )}
      <span className={classes.paramNote}>
        repeat <Num>{fmtRatio(tab.rep)}</Num> <Num muted>{tab.rep.c.toFixed(0)} c</Num>
      </span>
    </div>
  );
}
