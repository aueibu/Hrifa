/** Generator column (left of the ring): preset, ⚙ fold-out (prime filter, odd limit, repeat), method tabs, then that method's parameters. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  NativeSelect,
  Popover,
  SegmentedControl,
} from '@mantine/core';
import { fmtRatio, genusSummary, parseGenusN, parseScl } from '../../../lib/harmonic-field';
import {
  MAX_ODD_LIMIT,
  PRIME_LABELS,
  filterSummary,
  mosFor,
  rangeText,
  type GenSpec,
  type Method,
} from '../state/generate';
import { GearIcon } from './icons';
import { LibraryActions, LibraryNotice } from './LibraryBar';
import { PresetBrowser, PresetCrumb } from './PresetBrowser';
import {
  CommitNumber,
  CommitOptionalNumber,
  DebouncedText,
  DebouncedTextarea,
  Num,
  Tip,
  useLab,
} from './ui';
import classes from './lab.module.css';

const COMPOSITE_METHOD = { value: 'composite' as Method, label: 'Comp' };
const METHODS: { value: Method; label: string }[] = [
  { value: 'harmonic', label: 'Harm' },
  { value: 'sub', label: 'Sub' },
  { value: 'edo', label: 'EDO' },
  { value: 'lattice', label: 'Latt' },
  { value: 'cps', label: 'CPS' },
  { value: 'custom', label: 'Cust' },
  { value: 'relative', label: 'Rel' },
];

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
      <Tip k="oddLimitFilter" as="control" block>
        <CommitOptionalNumber
          size="xs"
          label="Odd limit"
          prefix="odd ≤ "
          placeholder="no limit"
          value={gen.oddLimit ?? null}
          min={1}
          max={MAX_ODD_LIMIT}
          hideControls
          onCommit={(limit) => dispatch({ type: 'gen/oddLimit', limit })}
        />
      </Tip>
      <Tip k="repeat" as="control" block>
        <DebouncedText
          size="xs"
          label="Repeat interval"
          value={gen.rep}
          onCommit={(rep) => dispatch({ type: 'gen/patch', patch: { rep } })}
          description="3/2, 3, 701.96c or 7&#92;12"
        />
      </Tip>
      <Tip k="keepNew" as="control" block>
        <Checkbox
          size="xs"
          label="Include new notes when the field changes"
          checked={gen.keepNew}
          onChange={(e) => dispatch({ type: 'gen/keepNew', on: e.currentTarget.checked })}
        />
      </Tip>
    </div>
  );
}

/** The number the stored genus has, as the box shows it (its digits); empty when there is none. */
const genusText = (gen: GenSpec) => gen.genusN ?? '';

/**
 * The Genus shape of the Lattice method: one box for the number n replaces the axes. The text typed is UI state (`text`, what
 * the box last committed); only the digits go into the generator, and only when `parseGenusN` accepts the text. A refused
 * text shows its sentence under the box and the field stays as it was. When the tab or the stored number changes under the
 * box (another tab, a preset), the text is rebuilt from the stored digits unless it already means that number.
 */
function GenusForm({ gen }: { gen: GenSpec }) {
  const { tab, dispatch } = useLab();
  const [text, setText] = useState(genusText(gen));
  const stored = genusText(gen);
  useEffect(() => {
    setText((t) => {
      const g = parseGenusN(t, tab.rep);
      return 'error' in g || g.n.toString() !== stored ? stored : t;
    });
  }, [tab.id, stored, tab.rep]);
  const parsed = parseGenusN(text, tab.rep);
  const commit = (t: string) => {
    setText(t);
    const g = parseGenusN(t, tab.rep);
    if ('error' in g || (gen.shape === 'genus' && g.n.toString() === stored)) {
      return;
    }
    dispatch({ type: 'gen/patch', patch: { shape: 'genus', genusN: g.n.toString() } });
  };
  return (
    <>
      <Tip k="genusShape" as="control" block>
        <DebouncedText size="xs" label="Number n" placeholder="45" value={text} onCommit={commit} />
      </Tip>
      {'error' in parsed ? (
        <span className={classes.fieldMsg} data-kind="err" role="alert" data-testid="genus-refusal">
          {parsed.error}
        </span>
      ) : (
        <span
          className={`${classes.paramNote} ${classes.paramNoteWrap}`}
          data-testid="genus-summary"
        >
          <Num>{genusSummary(parsed)}</Num>
        </span>
      )}
    </>
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
      const shapeSelect = (
        <Tip k="latticeShape" as="control" block>
          <NativeSelect
            size="xs"
            label="Shape"
            value={gen.shape}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === 'genus') {
                // the axes stay stored as they were; a number is needed, so a first visit starts from 45
                patch({ shape: 'genus', genusN: gen.genusN ?? '45' });
              } else {
                patch({ shape: v === 'diamond' ? 'diamond' : 'box' });
              }
            }}
            data={[
              { value: 'box', label: 'Box (count × count × ...)' },
              { value: 'diamond', label: 'Diamond (within N steps)' },
              { value: 'genus', label: 'Genus (Euler-Fokker)' },
            ]}
          />
        </Tip>
      );
      if (gen.shape === 'genus') {
        return (
          <>
            {shapeSelect}
            <GenusForm gen={gen} />
          </>
        );
      }
      return (
        <>
          {shapeSelect}
          <Tip k="genAxis" as="control" block>
            <div className={classes.axes}>
              <span className={classes.paramNote}>Axis</span>
              <span className={classes.paramNote}>Generator</span>
              <span className={classes.paramNote}>Count</span>
              <span className={classes.paramNote}>Center</span>
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
                    aria-label={`Axis ${i + 1} center`}
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
                  label="Steps from the center"
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
    case 'relative':
      // placeholder (no controls yet): the notes are placed from the ring's radial menu (RelativeMenu.tsx)
      return (
        <span className={classes.paramNote}>
          Relative pitches, <Num>{tab.field.length}</Num> notes.
        </span>
      );
    case 'composite':
      return (
        <span className={classes.paramNote}>
          {gen.snap ? `${gen.snap.name}: ` : ''}composite, <Num>{tab.field.length}</Num> notes. Made
          when the composite was opened as a tab: changing the composite later does not change this
          field.
        </span>
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
  const failed = tab.err !== '' && !/^Truncated|^Prime filter|^Odd limit/.test(tab.err);
  const filtering = filterSummary(gen);
  return (
    <div className={classes.genCol}>
      <div className={classes.genTop}>
        <PresetBrowser />
        <Tip k="fieldSettings" as="control" extra={filtering ?? undefined}>
          <Popover position="bottom-start" width={296} transitionProps={{ duration: 0 }}>
            <Popover.Target>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label="Field settings"
                aria-description={filtering ?? undefined}
                className={classes.gearBtn}
                data-filtering={filtering ? 'true' : undefined}
              >
                <GearIcon />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <FieldSettings gen={gen} />
            </Popover.Dropdown>
          </Popover>
        </Tip>
      </div>
      <PresetCrumb />
      <LibraryActions />
      <LibraryNotice />
      <Tip k="method" as="control" block>
        {/* two rows acting as one picker (seven methods do not fit one row); a row whose methods are not chosen shows no selection */}
        <div className={classes.methodRows} role="group" aria-label="Method">
          {[
            METHODS.slice(0, 4),
            gen.snap ? [...METHODS.slice(4), COMPOSITE_METHOD] : METHODS.slice(4),
          ].map((row) => (
            <SegmentedControl
              key={row[0].value}
              size="xs"
              fullWidth
              value={row.some((x) => x.value === gen.method) ? gen.method : ''}
              onChange={(m) => dispatch({ type: 'gen/method', method: m as Method })}
              data={row}
            />
          ))}
        </div>
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
