/** The field table: a compact block for the side column, and the full dense table in a large window. */
import { useMemo, useState } from 'react';
import { Button, Checkbox, Modal } from '@mantine/core';
import { fieldRowsOf, type FieldRow } from '../state/derive';
import { PlayIcon, TableIcon } from './icons';
import { Num, Tip, useLab } from './ui';
import mock from './lab.module.css';
import classes from './panels.module.css';

type SortKey = 'i' | 'ratio' | 'cents' | 'step' | 'prime' | 'odd' | 'vs12' | 'vsJI';
const COLS: {
  key: SortKey;
  label: string;
  tip: Parameters<typeof Tip>[0]['k'] | null;
  left?: boolean;
}[] = [
  { key: 'i', label: '#', tip: null },
  { key: 'ratio', label: 'Ratio', tip: 'colRatio', left: true },
  { key: 'cents', label: 'Cents (c)', tip: 'colCents' },
  { key: 'step', label: 'Step (c)', tip: 'colStep' },
  { key: 'prime', label: 'Prime limit', tip: 'colPrimeLimit' },
  { key: 'odd', label: 'Odd limit', tip: 'colOddLimit' },
  { key: 'vs12', label: 'vs 12-EDO', tip: 'colVs12', left: true },
  { key: 'vsJI', label: 'vs JI', tip: 'colVsJI', left: true },
];
type Row = FieldRow & { on: boolean };
const val = (r: Row, k: SortKey): number | string => {
  switch (k) {
    case 'i':
      return r.i;
    case 'ratio':
      return r.cents;
    case 'cents':
      return r.cents;
    case 'step':
      return r.step;
    case 'prime':
      return r.prime ?? 0;
    case 'odd':
      return Number(r.odd) || 0;
    case 'vs12':
      return Math.abs(parseFloat(r.vs12.replace(/[^0-9.+-]/g, '')) || 0);
    case 'vsJI':
      return Math.abs(parseFloat(r.vsJI.replace(/[^0-9.+-]/g, '')) || 0);
  }
};

/** The field rows with the "in the subset" flag from the current selection. */
function useRows(): Row[] {
  const { base } = useLab();
  const rows = useMemo(() => fieldRowsOf(base.field, base.repC), [base.field, base.repC]);
  return useMemo(
    () => rows.map((r) => ({ ...r, on: base.selected.has(r.i) })),
    [rows, base.selected]
  );
}

export function FieldTable() {
  const lab = useLab();
  const all = useRows();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'i', dir: 1 });
  const rows = useMemo(
    () =>
      [...all].sort((a, b) => {
        const x = val(a, sort.key);
        const y = val(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      }),
    [all, sort]
  );
  return (
    <div className={classes.tableWrap}>
      <table className={classes.dt}>
        <thead>
          <tr>
            <th className={classes.l}>In</th>
            <th aria-label="Play" />
            {COLS.map((c) => (
              <th
                key={c.key}
                className={c.left ? classes.l : undefined}
                aria-sort={
                  sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
                }
              >
                {c.tip ? <Tip k={c.tip}>{c.label}</Tip> : c.label}
                <button
                  type="button"
                  className={classes.sortBtn}
                  aria-label={`Sort by ${c.label}`}
                  onClick={() =>
                    setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : 1 }))
                  }
                >
                  <span aria-hidden="true">
                    {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.i}
              data-off={!r.on}
              data-pin={lab.pin === r.i}
              data-lit={lab.sounding.has(r.i)}
              onMouseEnter={() => lab.setHover(r.i)}
              onMouseLeave={() => lab.setHover(null)}
              onClick={() => lab.setPin(lab.pin === r.i ? null : r.i)}
            >
              <td className={classes.l}>
                <Checkbox
                  size="xs"
                  checked={r.on}
                  aria-label={`Include ${r.ratio}`}
                  onChange={() => lab.dispatch({ type: 'sel/toggle', i: r.i })}
                  onClick={(e) => e.stopPropagation()}
                />
              </td>
              <td>
                <Tip k="auditionNote" as="control">
                  <button
                    type="button"
                    className={classes.playBtn}
                    aria-label={`Play ${r.ratio}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      lab.audio.playNote(r.i);
                    }}
                  >
                    <PlayIcon />
                  </button>
                </Tip>
              </td>
              <td>
                <Num muted>{r.i}</Num>
              </td>
              <td className={classes.l}>
                <Num>{r.ratio}</Num>
              </td>
              <td>
                <Num>{r.cents.toFixed(2)}</Num>
              </td>
              <td>
                <Num>{r.step.toFixed(2)}</Num>
              </td>
              <td>
                <Num>{r.prime}</Num>
              </td>
              <td>
                <Num>{r.odd}</Num>
              </td>
              <td className={classes.l}>
                <Num>{r.vs12}</Num>
              </td>
              <td className={classes.l}>
                <Num>{r.vsJI}</Num>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A dense field table for the side column under Step sizes: one line per note, scrolling inside a fixed box. */
export function FieldCompact() {
  const lab = useLab();
  const fieldRows = useRows();
  const [open, setOpen] = useState(false);
  return (
    <section className={mock.fieldBlock} aria-label="Field table">
      <div className={mock.fieldHead}>
        <h3 className={mock.sideHead}>
          <Tip k="fieldTable">Field table</Tip> <Num muted>{fieldRows.length}</Num>
        </h3>
        <Tip k="openFullTable" as="control">
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<TableIcon />}
            onClick={() => setOpen(true)}
          >
            Open full table
          </Button>
        </Tip>
      </div>
      <div className={mock.fieldBox}>
        <table className={mock.fieldDt} aria-label="Field notes">
          <thead>
            <tr>
              <th>
                <Tip k="fieldIn">In</Tip>
              </th>
              <th>
                <Tip k="colRatio">Ratio</Tip>
              </th>
              <th>
                <Tip k="colCents">Cents</Tip>
              </th>
              <th>
                <Tip k="colVs12">±12-EDO</Tip>
              </th>
            </tr>
          </thead>
          <tbody>
            {fieldRows.map((r) => (
              <tr
                key={r.i}
                data-off={!r.on}
                data-pin={lab.pin === r.i}
                data-lit={lab.sounding.has(r.i)}
                onMouseEnter={() => lab.setHover(r.i)}
                onMouseLeave={() => lab.setHover(null)}
                onClick={() => lab.clickNote(r.i)}
              >
                <td>
                  <span
                    className={mock.inMark}
                    data-on={r.on}
                    role="img"
                    aria-label={r.on ? 'in subset' : 'not in subset'}
                  />
                </td>
                <td>
                  <Num>{r.ratio}</Num>
                </td>
                <td>
                  <Num>{r.cents.toFixed(1)}</Num>
                </td>
                <td>
                  <Num>{r.vs12}</Num>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Field table"
        size="min(60rem, 94vw)"
        transitionProps={{ duration: 0 }}
      >
        <FieldTable />
      </Modal>
    </section>
  );
}
