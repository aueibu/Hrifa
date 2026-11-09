import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { Surface } from '../../../components/Surface/Surface';
import {
  barHasValue,
  COLUMNS,
  currentRow,
  histogramBars,
  inBin,
  METRICS,
  rankOf,
  sameBin,
  showBarLabel,
  sortRows,
  type BinFilter,
  type Metric,
} from '../compare';
import { fmt, sgn1, TIP_RANGE_VS_EXPECTED, TIP_RANGE_VS_SIZE } from '../format';
import { binom, catalog, icvText, type CatalogRow, type PrimeConvention } from '../pitchSets';
import type { CompareSort, RankDirection } from '../settings';
import { COMPARE_TABLE_HINT } from '../texts';
import { OPACITY, ROLE, STROKE, useScaleStyle } from '../useScaleStyle';
import { Swatch } from './Legend';
import classes from '../ScaleExplorer.module.css';

export interface CompareEntry {
  z: number[];
  slot: number;
}

interface CompareTabProps {
  selection: number[];
  size: number;
  onSize: (n: number) => void;
  merge: boolean;
  onMerge: (on: boolean) => void;
  conv: PrimeConvention;
  onConv: (c: PrimeConvention) => void;
  rank: RankDirection;
  onRank: (r: RankDirection) => void;
  sort: CompareSort;
  onSort: (s: CompareSort) => void;
  compares: CompareEntry[];
  playingKey: string | null;
  onToggleCompare: (z: number[]) => void;
  onLoad: (z: number[]) => void;
  onPlay: (z: number[]) => void;
}

const tipFor = (tip?: 'rve' | 'zs') =>
  tip === 'rve' ? TIP_RANGE_VS_EXPECTED : tip === 'zs' ? TIP_RANGE_VS_SIZE : undefined;

/** Every set class of one size, ranked and filterable, for picking sets to compare with the loaded one. */
export function CompareTab(props: CompareTabProps) {
  const { selection, size, merge, conv, rank, sort, compares, playingKey } = props;
  const [filter, setFilter] = useState<BinFilter | null>(null);

  const rows = useMemo(() => catalog(size, merge, conv), [size, merge, conv]);
  const current = currentRow(rows, selection, size, merge, conv);
  const hasRve = rows.length > 0 && rows[0].rve !== null;
  const metrics = METRICS.filter((m) => (m.k !== 'rve' && m.k !== 'zsz') || hasRve);

  const shown = filter
    ? rows.filter((r) => {
        const v = r[filter.k];
        return v !== null && inBin(v, filter);
      })
    : rows;
  const sorted = sortRows(shown, sort.k, sort.dir, conv);
  const columns = COLUMNS.filter((c) => hasRve || (c.k !== 'rve' && c.k !== 'zsz'));
  const filterMetric = filter ? METRICS.find((m) => m.k === filter.k) : undefined;

  const resetFilter =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      setFilter(null);
      fn(v);
    };

  return (
    <Stack gap="md">
      <Surface aria-label="Compare settings">
        <Stack gap="sm">
          <Group gap="xs" align="end">
            <Select
              size="xs"
              label="Set Size"
              w={110}
              allowDeselect={false}
              value={String(size)}
              data={Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1),
                label: `${i + 1} ${i === 0 ? 'note' : 'notes'}`,
              }))}
              onChange={(v) => v && resetFilter(props.onSize)(Number(v))}
            />
            <Select
              size="xs"
              label="Prime Form"
              w={210}
              allowDeselect={false}
              value={conv}
              data={[
                { value: 'rahn', label: 'Rahn (ties from the left)' },
                { value: 'forte', label: 'Forte (ties from the right)' },
              ]}
              onChange={(v) => v && props.onConv(v as PrimeConvention)}
            />
            <Select
              size="xs"
              label="Rank"
              w={170}
              allowDeselect={false}
              value={rank}
              data={[
                { value: 'high', label: 'Highest value first' },
                { value: 'low', label: 'Lowest value first' },
              ]}
              onChange={(v) => v && props.onRank(v as RankDirection)}
            />
            <Checkbox
              size="xs"
              label="Merge mirror images (inversion)"
              checked={merge}
              onChange={(e) => resetFilter(props.onMerge)(e.currentTarget.checked)}
            />
          </Group>
          <Text size="xs" c="dimmed">
            {rows.length} {merge ? 'classes with mirror images merged' : 'classes by transposition'}{' '}
            from {binom(12, size)} possible {size}-note sets.{' '}
            {current
              ? 'Your set is marked in a darker bar in each chart, with its rank at the top right.'
              : 'Your current set has a different size, so nothing is marked.'}
          </Text>
        </Stack>
      </Surface>

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md" aria-label="Distributions">
        {metrics.map((m) => (
          <MetricChart
            key={m.k}
            metric={m}
            rows={rows}
            current={current}
            rank={rank}
            filter={filter}
            onFilter={(f) => setFilter((prev) => (sameBin(prev, f) ? null : f))}
          />
        ))}
      </SimpleGrid>

      <Surface p={0} aria-label="All sets of this size">
        {filter && filterMetric && (
          <Group p="sm" gap="sm">
            <Text size="sm">
              Showing <b>{shown.length}</b> of {rows.length} sets where <b>{filterMetric.label}</b>{' '}
              is{' '}
              <b>
                {filter.ex
                  ? filterMetric.format(filter.lo)
                  : `${filterMetric.format(Math.round(filter.lo * 100) / 100)} to ${filterMetric.format(Math.round(filter.hi * 100) / 100)}`}
              </b>
            </Text>
            <Button size="compact-xs" variant="default" onClick={() => setFilter(null)}>
              Clear filter
            </Button>
          </Group>
        )}
        <Table.ScrollContainer minWidth={0}>
          <Table verticalSpacing={4} stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                {columns.map((c) => (
                  <Table.Th key={c.k}>
                    <Tooltip label={tipFor(c.tip)} disabled={!c.tip} multiline w={320} withArrow>
                      <UnstyledButton
                        fz="xs"
                        fw={700}
                        onClick={() =>
                          props.onSort(
                            sort.k === c.k
                              ? { k: c.k, dir: sort.dir === 1 ? -1 : 1 }
                              : { k: c.k, dir: 1 }
                          )
                        }
                      >
                        {c.label}
                        {sort.k === c.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                      </UnstyledButton>
                    </Tooltip>
                  </Table.Th>
                ))}
                <Table.Th>Mirror</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map((r) => (
                <SetRow
                  key={r.key}
                  r={r}
                  merge={merge}
                  hasRve={hasRve}
                  me={current?.key === r.key}
                  entry={compares.find((c) => c.z.join(',') === r.z.join(','))}
                  playing={playingKey === `p:${r.z.join(',')}`}
                  onToggle={() => props.onToggleCompare(r.z)}
                  onPlay={() => props.onPlay(r.z)}
                  onLoad={() => props.onLoad(r.z)}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="xs" c="dimmed" p="sm">
          {COMPARE_TABLE_HINT}
        </Text>
      </Surface>
    </Stack>
  );
}

interface SetRowProps {
  r: CatalogRow;
  merge: boolean;
  hasRve: boolean;
  me: boolean;
  entry: CompareEntry | undefined;
  playing: boolean;
  onToggle: () => void;
  onPlay: () => void;
  onLoad: () => void;
}

function SetRow({ r, merge, hasRve, me, entry, playing, onToggle, onPlay, onLoad }: SetRowProps) {
  const mirror = r.self ? 'self' : `${merge ? 'also ' : ''}[${r.mirrorKey}]`;
  return (
    <Table.Tr className={classes.compareRow} data-me={me} onClick={onToggle}>
      <Table.Td>
        <ActionIcon
          size="sm"
          variant="default"
          aria-label="Play this scale"
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
        >
          {playing ? '■' : '▶'}
        </ActionIcon>
      </Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          {entry && <Swatch slot={entry.slot} />}
          <Data size="sm">{`[${r.key}]`}</Data>
        </Group>
      </Table.Td>
      <Table.Td>
        <Data size="sm">{r.forte ?? '—'}</Data>
      </Table.Td>
      <Table.Td>{r.hem}</Table.Td>
      <Table.Td>{r.coh}</Table.Td>
      <Table.Td>{fmt(r.ratio)}</Table.Td>
      <Table.Td>{r.run}</Table.Td>
      <Table.Td>{r.modes}</Table.Td>
      <Table.Td>{r.fr}</Table.Td>
      {hasRve && (
        <>
          <Table.Td>{sgn1(r.rve ?? 0)}</Table.Td>
          <Table.Td>{sgn1(r.zsz ?? 0)}</Table.Td>
        </>
      )}
      <Table.Td>
        <Data size="sm">{icvText(r.icv)}</Data>
      </Table.Td>
      <Table.Td>{r.p5}</Table.Td>
      <Table.Td>{r.chain}</Table.Td>
      <Table.Td>{r.rp5}</Table.Td>
      <Table.Td>
        <Data size="sm">{mirror}</Data>
      </Table.Td>
      <Table.Td>
        <Button
          size="compact-xs"
          variant="default"
          onClick={(e) => {
            e.stopPropagation();
            onLoad();
          }}
        >
          Load
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

interface MetricChartProps {
  metric: Metric;
  rows: CatalogRow[];
  current: CatalogRow | null;
  rank: RankDirection;
  filter: BinFilter | null;
  onFilter: (f: BinFilter) => void;
}

const W = 240;
const H = 100;
const TOP = 12;
const BASE = 78;

function MetricChart({ metric, rows, current, rank, filter, onFilter }: MetricChartProps) {
  const style = useScaleStyle();
  const vals = rows.map((r) => r[metric.k] as number);
  const cur = current ? (current[metric.k] as number | null) : null;
  const hist = histogramBars(vals, metric.format);
  const maxC = Math.max(...hist.bars.map((b) => b.count)) || 1;
  const bw = (W - 16) / hist.bars.length;
  const rk = cur !== null ? rankOf(vals, cur, rank) : null;
  const pct = (c: number) => `${Math.round((c / vals.length) * 100)}%`;

  return (
    <Surface>
      <Group justify="space-between" mb={4}>
        <Tooltip label={tipFor(metric.tip)} disabled={!metric.tip} multiline w={320} withArrow>
          <Title order={3} size="h6">
            {metric.label}
          </Title>
        </Tooltip>
        {rk && (
          <Badge variant="light" size="sm">
            #{rk.place} of {rk.total}
            {rk.tied > 0 ? ` · tied with ${rk.tied}` : ''}
          </Badge>
        )}
      </Group>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Histogram of ${metric.label}`}
      >
        <line
          stroke={ROLE.border}
          strokeWidth={STROKE.hairline}
          x1={8}
          y1={BASE}
          x2={W - 8}
          y2={BASE}
        />
        {hist.bars.map((b, k) => {
          const h = (b.count / maxC) * (BASE - TOP);
          const x = 8 + k * bw;
          const isSel = sameBin(filter, {
            k: metric.k,
            lo: b.lo,
            hi: b.hi,
            ex: hist.exact,
            last: false,
          });
          return (
            <g key={k}>
              {b.count > 0 && (
                <>
                  <rect
                    fill={style.accent}
                    fillOpacity={barHasValue(hist, k, cur) ? 1 : OPACITY.soft}
                    stroke={isSel ? ROLE.text : 'none'}
                    strokeWidth={STROKE.line}
                    x={x + 1}
                    y={BASE - h}
                    width={Math.max(1, bw - 2)}
                    height={h}
                  />
                  <text className={classes.chartCount} x={x + bw / 2} y={BASE - h - 2}>
                    {b.count}
                  </text>
                  <rect
                    className={classes.hit}
                    role="button"
                    tabIndex={-1}
                    aria-label={`Show the ${b.count} sets in this bar`}
                    x={x}
                    y={TOP}
                    width={bw}
                    height={BASE - TOP}
                    onClick={() =>
                      onFilter({
                        k: metric.k,
                        lo: b.lo,
                        hi: b.hi,
                        ex: hist.exact,
                        last: k === hist.bars.length - 1,
                      })
                    }
                  />
                </>
              )}
              {showBarLabel(hist, k) && (
                <text className={classes.chartText} x={x + bw / 2} y={BASE + 12}>
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Text size="xs" c="dimmed">
        {rk && cur !== null ? (
          <>
            Your set: <b>{metric.format(cur)}</b> · {pct(rk.lower)} lower · {pct(rk.equal)} equal ·{' '}
            {pct(rk.higher)} higher
          </>
        ) : (
          `Range ${metric.format(Math.min(...vals))} to ${metric.format(Math.max(...vals))}`
        )}
      </Text>
    </Surface>
  );
}
