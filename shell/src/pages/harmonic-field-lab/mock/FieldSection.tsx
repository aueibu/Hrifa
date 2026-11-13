/** Field & subset section: pitch circle, subset controls (clusters), tuner strip, lattice, field table. */
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  NumberInput,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { SCALE_LIBRARY, fmtRatio } from '../../../lib/harmonic-field';
import { Article } from './Article';
import { LIT } from './KeyboardDock';
import {
  analysis,
  devs,
  field,
  fieldRows,
  lattice,
  rel,
  repC,
  subsetIdx,
  widestMiss,
} from './mockData';
import { Cluster, Num, Row, SectionHead, Tip, signed } from './ui';
import classes from './mock.module.css';

/* The example subset indices in field order, and which of them are lit (1/1, 5/4, 3/2 = field indices 0, 2, 4). */
const LIT_FIELD = new Set([...LIT].map((k) => subsetIdx[k]));
const selected = new Set(subsetIdx);

/* ------------------------------------------------------------------------------------------------ pitch circle */
function Dot({ x, y, i, r = 6 }: { x: number; y: number; i: number; r?: number }) {
  const on = selected.has(i);
  const lit = LIT_FIELD.has(i);
  const cls = lit ? classes.dotLit : on ? classes.dotOn : classes.dotOff;
  return (
    <circle
      className={cls}
      cx={x}
      cy={y}
      r={lit ? r * 1.6 : r}
      data-chord={lit ? 'true' : undefined}
    />
  );
}

function PitchCircle() {
  const cx = 130;
  const cy = 130;
  const R = 86;
  const pos = (c: number, rad = R) => {
    const a = (c / repC) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  };
  const chord = [...LIT_FIELD].map((i) => pos(field[i].c));
  return (
    <div className={classes.stack}>
      <svg
        viewBox="0 0 260 260"
        className={classes.circleSvg}
        role="img"
        aria-label={`Pitch circle: ${rel.length} of ${field.length} notes selected, 1/1, 5/4 and 3/2 sounding`}
      >
        <circle className={classes.ringLine} cx={cx} cy={cy} r={R} />
        <polygon
          className={classes.chordFill}
          points={chord.map((p) => `${p.x},${p.y}`).join(' ')}
        />
        {field.map((n, i) => {
          const p = pos(n.c);
          const l = pos(n.c, R + 26);
          return (
            <g key={i}>
              <Dot x={p.x} y={p.y} i={i} />
              <text
                x={l.x}
                y={l.y}
                className={classes.svgLabel}
                data-on={selected.has(i)}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {fieldRows[i].ratio}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={classes.legend}>
        <span className={classes.legendItem}>
          <svg width="14" height="14" aria-hidden="true">
            <circle className={classes.dotOn} cx="7" cy="7" r="5" />
          </svg>
          In subset
        </span>
        <span className={classes.legendItem}>
          <svg width="14" height="14" aria-hidden="true">
            <circle className={classes.dotOff} cx="7" cy="7" r="5" />
          </svg>
          Out
        </span>
        <span className={classes.legendItem}>
          <svg width="18" height="18" aria-hidden="true">
            <circle className={classes.dotLit} data-chord="true" cx="9" cy="9" r="7" />
          </svg>
          Sounding, in chord 4:5:6
        </span>
      </div>
      <Cluster title="In the subset">
        <div className={classes.chips}>
          {rel.map((n, i) => (
            <span key={i} className={classes.sizeChip}>
              <Num>{fmtRatio(n)}</Num>
            </span>
          ))}
        </div>
        <Text size="xs" c="dimmed">
          Out: <Num>11/8</Num>. Click a dot, or a ratio in the field table, to change this.
        </Text>
      </Cluster>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ subset controls */
function SubsetControls() {
  const scales = SCALE_LIBRARY.slice(0, 14).map((s) => s.name);
  return (
    <div className={classes.clusters}>
      <Cluster title="Selection">
        <Group gap="xs">
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
              Invert
            </Button>
          </Tip>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm">
            <Tip k="mode">Mode</Tip>
          </Text>
          <Tip k="mode" as="control">
            <Group gap={4} wrap="nowrap">
              <ActionIcon variant="default" size="sm" aria-label="Previous mode">
                &lsaquo;
              </ActionIcon>
              <Num>0</Num>
              <ActionIcon variant="default" size="sm" aria-label="Next mode">
                &rsaquo;
              </ActionIcon>
            </Group>
          </Tip>
          <Text size="xs" c="dimmed">
            root <Num>1/1</Num>
          </Text>
        </Group>
        <Tip k="keepNew" as="control" block>
          <Checkbox size="xs" label="Include new notes when the field changes" />
        </Tip>
      </Cluster>

      <Cluster title="Pick nearest scale">
        <Tip k="pickNearest" as="control" block>
          <NativeSelect size="xs" aria-label="Scale to match" data={scales} />
        </Tip>
        <Group gap="xs" wrap="nowrap">
          <Tip k="nearTargets" as="control">
            <NativeSelect size="xs" aria-label="Targets" data={['12-EDO', 'Just (JI)']} w={104} />
          </Tip>
          <Tip k="pickNearest" as="control">
            <NumberInput
              size="xs"
              aria-label="Equal division"
              defaultValue={12}
              w={64}
              hideControls
            />
          </Tip>
          <Button size="xs" variant="default">
            Select
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          <Tip k="nearTargets">Targets</Tip>: piano pitches or pure ratios.
        </Text>
      </Cluster>

      <Cluster title="Limit by odd limit">
        <Group gap="xs" wrap="nowrap">
          <Tip k="oddLimitPick">
            <Text size="sm">Max odd limit</Text>
          </Tip>
          <Tip k="oddLimitPick" as="control">
            <NumberInput
              size="xs"
              aria-label="Max odd limit"
              defaultValue={15}
              w={64}
              hideControls
            />
          </Tip>
          <Button size="xs" variant="default">
            Select
          </Button>
        </Group>
      </Cluster>

      <Cluster title="Save and export">
        <Group gap="xs" wrap="nowrap">
          <TextInput size="xs" aria-label="Subset name" placeholder="Subset name" flex={1} />
          <Tip k="saveSubset" as="control">
            <Button size="xs" variant="default">
              Save
            </Button>
          </Tip>
          <Tip k="exportScl" as="control">
            <Button size="xs" variant="default">
              Export .scl
            </Button>
          </Tip>
        </Group>
        <Text size="xs" c="dimmed">
          <Tip k="savedSubsets">Saved subsets</Tip>
        </Text>
        <ul className={classes.savedList}>
          <li>
            <span>No 11/8</span>
            <Num muted>7 notes</Num>
          </li>
          <li>
            <span>Otonal 4:5:6:7</span>
            <Num muted>4 notes</Num>
          </li>
          <li>
            <span>Odd 9</span>
            <Num muted>5 notes</Num>
          </li>
        </ul>
      </Cluster>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- tuner strip */
function TunerStrip() {
  const W = 1000;
  const padX = 50;
  const x = (c: number) => padX + (c / repC) * (W - 2 * padX);
  const base = 100;
  const k = 0.7;
  return (
    <div className={classes.stack}>
      <div className={classes.inlineControls}>
        <Group gap="xs" wrap="nowrap">
          <Tip k="compareTo">
            <Text size="sm">Compare to</Text>
          </Tip>
          <Tip k="compareTo" as="control">
            <NativeSelect
              size="xs"
              aria-label="Compare to"
              data={['Picked scale', '12-EDO', 'JI (odd limit)', 'm-EDO']}
              defaultValue="12-EDO"
              w={140}
            />
          </Tip>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tip k="oddLimitPick">
            <Text size="sm">Odd limit</Text>
          </Tip>
          <Tip k="oddLimitPick" as="control">
            <NumberInput size="xs" aria-label="Odd limit" defaultValue={15} w={64} hideControls />
          </Tip>
        </Group>
        <Text size="xs" c="dimmed">
          Bars above the line are sharp, bars below are flat.
        </Text>
      </div>
      <svg
        viewBox={`0 0 ${W} 190`}
        className={classes.wideSvg}
        role="img"
        aria-label="Tuner strip: how far each note is from 12-EDO, in cents"
      >
        {Array.from({ length: 13 }, (_, i) => (
          <line
            key={i}
            className={classes.tickLine}
            x1={x(i * 100)}
            x2={x(i * 100)}
            y1={26}
            y2={i % 12 === 0 ? 42 : 36}
          />
        ))}
        <line className={classes.ringLine} x1={x(0)} x2={x(repC)} y1={30} y2={30} />
        <line className={classes.zeroLine} x1={x(0)} x2={x(repC)} y1={base} y2={base} />
        {devs.map((d, i) => {
          const cx = x(d.c);
          const h = Math.abs(d.dev12) * k;
          const sharp = d.dev12 >= 0;
          const yEnd = sharp ? base - h : base + h;
          return (
            <g key={i}>
              <line className={classes.dashLine} x1={cx} x2={cx} y1={30} y2={base} />
              <circle
                className={LIT.has(i) ? classes.dotLit : classes.dotOn}
                data-chord={LIT.has(i) ? 'true' : undefined}
                cx={cx}
                cy={30}
                r={LIT.has(i) ? 9 : 5.5}
              />
              <text className={classes.svgLabel} data-on="true" x={cx} y={14} textAnchor="middle">
                {d.ratio}
              </text>
              <rect
                className={sharp ? classes.barSharp : classes.barFlat}
                x={cx - 9}
                width={18}
                y={sharp ? yEnd : base}
                height={Math.max(h, 1)}
              />
              <text
                className={classes.svgNum}
                x={cx}
                y={sharp ? yEnd - 6 : yEnd + 16}
                textAnchor="middle"
              >
                {signed(d.dev12)}
              </text>
            </g>
          );
        })}
        <text className={classes.svgAxis} x={padX} y={178}>
          1/1 (0 c)
        </text>
        <text className={classes.svgAxis} x={W - padX} y={178} textAnchor="end">
          2/1 (1200 c)
        </text>
        <text className={classes.svgAxis} x={W / 2} y={178} textAnchor="middle">
          ticks every 100 c = 12-EDO keys
        </text>
      </svg>
      <div className={classes.legend}>
        <span className={classes.legendItem}>
          <span className={classes.swatchSharp} aria-hidden="true" /> Sharp of target (bar up,
          number with +)
        </span>
        <span className={classes.legendItem}>
          <span className={classes.swatchFlat} aria-hidden="true" /> Flat of target (bar down,
          number with -)
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------- lattice */
function Lattice() {
  const on = new Set(lattice.pts.filter((p) => p.on).map((p) => p.i));
  const at = new Map(lattice.pts.map((p) => [p.i, p]));
  return (
    <div className={classes.latticeWrap}>
      <svg
        viewBox="0 0 640 300"
        className={classes.latticeSvg}
        role="img"
        aria-label="Lattice of the field, notes placed by prime exponents"
      >
        {lattice.edges.map(([a, b], j) => {
          const pa = at.get(a);
          const pb = at.get(b);
          if (!pa || !pb) {
            return null;
          }
          const both = on.has(a) && on.has(b);
          const chord = LIT_FIELD.has(a) && LIT_FIELD.has(b);
          return (
            <line
              key={j}
              className={chord ? classes.edgeChord : both ? classes.edgeOn : classes.edgeOff}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
            />
          );
        })}
        {lattice.pts.map((p) => {
          const lit = LIT_FIELD.has(p.i);
          return (
            <g key={p.i}>
              <circle
                className={lit ? classes.dotLit : p.on ? classes.dotOn : classes.dotOff}
                data-chord={lit ? 'true' : undefined}
                cx={p.x}
                cy={p.y}
                r={lit ? 10 : 6}
              />
              <text
                className={classes.svgLabel}
                data-on={p.on}
                x={p.x + 10}
                y={p.on ? p.y - 10 : p.y + 20}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={classes.latticeSide}>
        <Cluster title="View">
          <Group gap="xs" wrap="nowrap">
            <Tip k="latticeAxes">
              <Text size="sm">Axes</Text>
            </Tip>
            <Tip k="latticeAxes" as="control">
              <NativeSelect
                size="xs"
                aria-label="Axes"
                data={['Auto', 'Generators', 'Factors (CPS)', 'Primes']}
                defaultValue="Primes"
                w={130}
              />
            </Tip>
          </Group>
          <Checkbox size="xs" defaultChecked label="Ratio labels" />
        </Cluster>
        <Cluster title="Reading it">
          <Row name="Axes">
            primes <Num>{lattice.axes.join(', ')}</Num>
          </Row>
          <Row name="Notes">
            <Num>{lattice.pts.length}</Num> placed
          </Row>
          <Text size="xs" c="dimmed">
            Each step along an axis multiplies by that prime; the factor 2 is folded into the
            repeat. Neighbours on the grid are closely related ratios.
          </Text>
        </Cluster>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- field table */
export function FieldTable() {
  return (
    <div className={classes.tableWrap}>
      <Table
        className={classes.dt}
        verticalSpacing={4}
        horizontalSpacing="xs"
        withRowBorders={false}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th className={classes.l}>In</Table.Th>
            <Table.Th>#</Table.Th>
            <Table.Th className={classes.l}>
              <Tip k="colRatio">Ratio</Tip>
            </Table.Th>
            <Table.Th>
              <Tip k="colCents">Cents (c)</Tip>
            </Table.Th>
            <Table.Th>
              <Tip k="colStep">Step (c)</Tip>
            </Table.Th>
            <Table.Th>
              <Tip k="colPrimeLimit">Prime limit</Tip>
            </Table.Th>
            <Table.Th>
              <Tip k="colOddLimit">Odd limit</Tip>
            </Table.Th>
            <Table.Th>
              <Tip k="colVs12">vs 12-EDO (c)</Tip>
            </Table.Th>
            <Table.Th>
              <Tip k="colVsJI">vs JI (c)</Tip>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {fieldRows.map((r) => (
            <Table.Tr key={r.i} data-off={!r.on}>
              <Table.Td className={classes.l}>
                <Checkbox size="xs" defaultChecked={r.on} aria-label={`Include ${r.ratio}`} />
              </Table.Td>
              <Table.Td>
                <Num muted>{r.i}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                <Num>{r.ratio}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{r.cents.toFixed(2)}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{r.step.toFixed(2)}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{r.prime}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{r.odd}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{r.vs12}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{r.vsJI}</Num>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}

export function FieldSection() {
  return (
    <section id="sec-field" className={classes.section} aria-labelledby="sec-field-h">
      <SectionHead
        id="sec-field-h"
        title="Field & subset"
        lede="Pick which field notes make your scale, and see how far each sits from a target."
      />
      <div className={classes.grid}>
        <Article
          id="blk-circle"
          title="Pitch circle"
          tip="pitchCircle"
          lede={
            <>
              <Num>{rel.length}</Num> of <Num>{field.length}</Num> field notes are in the subset;
              11/8 is out.
            </>
          }
        >
          <PitchCircle />
        </Article>
        <Article
          id="blk-subset"
          title="Subset controls"
          tip="subset"
          lede={
            <>
              Mode <Num>0</Num> (root <Num>1/1</Num>), three saved subsets; four labelled groups.
            </>
          }
        >
          <SubsetControls />
        </Article>
        <Article
          id="blk-tuner"
          title="Tuner strip"
          tip="tunerStrip"
          span={2}
          lede={
            <>
              Widest miss from 12-EDO: <Num>{widestMiss.ratio}</Num>,{' '}
              <Num>{signed(widestMiss.dev12)} c</Num> (nearest {widestMiss.label12}).
            </>
          }
        >
          <TunerStrip />
        </Article>
        <Article
          id="blk-lattice"
          title="Lattice"
          tip="lattice"
          span={2}
          lede={
            <>
              <Num>{lattice.pts.length}</Num> notes on <Num>{lattice.axes.length}</Num> prime axes (
              <Num>{lattice.axes.join(', ')}</Num>); 4:5:6 is highlighted.
            </>
          }
        >
          <Lattice />
        </Article>
        <Article
          id="blk-fieldtable"
          title="Field table"
          tip="fieldTable"
          span={2}
          lede={
            <>
              <Num>{field.length}</Num> notes, <Num>{rel.length}</Num> selected, prime limit{' '}
              <Num>{analysis.primeLimit}</Num>.
            </>
          }
        >
          <FieldTable />
        </Article>
      </div>
    </section>
  );
}
