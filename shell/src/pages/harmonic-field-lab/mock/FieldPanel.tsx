/** Field table panel: a compact note list that feeds the inspector, and the full dense table in a large window. */
import { useMemo, useState } from 'react';
import { Button, Checkbox, Modal } from '@mantine/core';
import { TableIcon } from './icons';
import { fieldRows, rel, type FieldRow } from './mockData';
import { Num, Row, Strip, Tip, useLab } from './ui';
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
const val = (r: FieldRow, k: SortKey): number | string => {
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

export function FieldTable() {
  const lab = useLab();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'i', dir: 1 });
  const rows = useMemo(
    () =>
      [...fieldRows].sort((a, b) => {
        const x = val(a, sort.key);
        const y = val(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      }),
    [sort]
  );
  return (
    <div className={classes.tableWrap}>
      <table className={classes.dt}>
        <thead>
          <tr>
            <th className={classes.l}>In</th>
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
              onMouseEnter={() => lab.setHover(r.i)}
              onMouseLeave={() => lab.setHover(null)}
              onClick={() => lab.setPin(lab.pin === r.i ? null : r.i)}
            >
              <td className={classes.l}>
                <Checkbox size="xs" defaultChecked={r.on} aria-label={`Include ${r.ratio}`} />
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

export function FieldPanel() {
  const lab = useLab();
  const [open, setOpen] = useState(false);
  const i = lab.hover ?? lab.pin ?? 0;
  const r = fieldRows[i];
  return (
    <>
      <Strip title={<Tip k="fieldTable">Field table</Tip>}>
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
      </Strip>
      <div className={classes.panelBody}>
        <h3 className={classes.familyHead}>
          <Tip k="inspector">Note</Tip>
          <Num muted>{lab.hover !== null || lab.pin !== null ? 'pointed at' : 'first note'}</Num>
        </h3>
        <div className={classes.verdicts}>
          <Row name="Ratio">
            <Num>{r.ratio}</Num> {r.on ? '(in subset)' : '(out of subset)'}
          </Row>
          <Row name={<Tip k="colCents">Cents</Tip>}>
            <Num>{r.cents.toFixed(2)} c</Num>
          </Row>
          <Row name="Monzo">
            <Num>{r.monzo}</Num>
          </Row>
          <Row name={<Tip k="colStep">Step up</Tip>}>
            <Num>{r.step.toFixed(2)} c</Num>
          </Row>
          <Row name={<Tip k="colPrimeLimit">Prime / odd limit</Tip>}>
            <Num>
              {r.prime} / {r.odd}
            </Num>
          </Row>
          <Row name={<Tip k="colVs12">Nearest 12-EDO</Tip>}>
            <Num>{r.vs12}</Num>
          </Row>
          <Row name={<Tip k="colVsJI">Nearest JI</Tip>}>
            <Num>{r.vsJI}</Num>
          </Row>
        </div>
        <h3 className={classes.familyHead}>
          Notes
          <Num muted>
            {rel.length} of {fieldRows.length} in the subset
          </Num>
        </h3>
        <div className={classes.noteChips} role="group" aria-label="Field notes">
          {fieldRows.map((n) => (
            <button
              key={n.i}
              type="button"
              className={classes.noteChip}
              data-on={n.on}
              aria-pressed={lab.pin === n.i}
              onMouseEnter={() => lab.setHover(n.i)}
              onMouseLeave={() => lab.setHover(null)}
              onFocus={() => lab.setHover(n.i)}
              onBlur={() => lab.setHover(null)}
              onClick={() => lab.setPin(lab.pin === n.i ? null : n.i)}
            >
              <Num>{n.ratio}</Num>
            </button>
          ))}
        </div>
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
    </>
  );
}
