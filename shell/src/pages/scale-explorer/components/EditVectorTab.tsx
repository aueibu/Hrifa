import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { Surface } from '../../../components/Surface/Surface';
import { catalog, icvOf, icvText, type PrimeConvention } from '../pitchSets';
import { spectrumChange, spectrumOf } from '../spectrum';
import { SPECTRUM_CHANGE_HINT, VECTOR_RESULTS_HINT } from '../texts';
import {
  editResult,
  emptyEdit,
  IC_NAMES,
  stepButton,
  type MatchRow,
  type VectorEdit,
} from '../vectorEdit';
import type { CompareEntry } from './CompareTab';
import { Swatch } from './Legend';
import {
  SpectrumChart,
  SpectrumModeToggle,
  type SpectrumMode,
  type SpectrumSet,
} from './SpectrumChart';
import classes from '../ScaleExplorer.module.css';

interface EditVectorTabProps {
  selection: number[];
  merge: boolean;
  onMerge: (on: boolean) => void;
  strict: boolean;
  onStrict: (on: boolean) => void;
  conv: PrimeConvention;
  compares: CompareEntry[];
  spectrumMode: SpectrumMode;
  onSpectrumMode: (mode: SpectrumMode) => void;
  playingKey: string | null;
  onToggleCompare: (z: number[]) => void;
  onLoad: (z: number[]) => void;
  onPlay: (z: number[]) => void;
}

const signed = (d: number) => `${d > 0 ? '+' : '−'}${Math.abs(d)}`;

/** Nudge one entry of the loaded set's interval vector and see which set classes have the edited vector. */
export function EditVectorTab(props: EditVectorTabProps) {
  const { selection, merge, strict, conv, compares, playingKey } = props;
  const n = selection.length;
  const base = useMemo(() => icvOf(selection), [selection]);
  const sig = `${n}:${base.join(',')}`;
  const [state, setState] = useState<{ sig: string; edit: VectorEdit }>({
    sig: '',
    edit: emptyEdit(),
  });
  const edit = state.sig === sig ? state.edit : emptyEdit();
  const setEdit = (next: VectorEdit) => setState({ sig, edit: next });

  const rows = useMemo(() => (n >= 2 ? catalog(n, merge, conv) : []), [n, merge, conv]);
  const result = editResult(rows, base, edit, strict, conv);

  const s0 = selection[0] ?? 0;
  const sets: SpectrumSet[] = [
    { name: 'Loaded', abs: selection, slot: 'L' },
    ...compares.map((c, i) => ({
      name: `Comparison ${i + 1}`,
      abs: c.z.map((x) => (x + s0) % 12).sort((a, b) => a - b),
      slot: c.slot,
    })),
  ];
  const loadedSpectrum = spectrumOf(selection);

  const press = (i: number, dir: 1 | -1) => {
    if (strict) {
      const same = edit.move?.i === i && edit.move.dir === dir;
      setEdit({ ...edit, move: same ? null : { i, dir } });
    } else {
      const deltas = [...edit.deltas];
      deltas[i] += dir;
      setEdit({ ...edit, deltas });
    }
  };

  const changeStrict = (on: boolean) => {
    setEdit(emptyEdit());
    props.onStrict(on);
  };

  if (n < 2) {
    return (
      <Surface>
        <Text c="dimmed">Select at least two notes to see and edit an interval vector.</Text>
      </Surface>
    );
  }

  const count = result.matches.length;
  let info: React.ReactNode;
  if (!result.any) {
    info = strict
      ? 'Press + or − under any value to see the set classes one swap away: that value moves by one and exactly one other value moves the opposite way.'
      : 'Press + or − under any value to see the set classes with that vector.';
  } else if (strict && edit.move) {
    const up = edit.move.dir > 0;
    info = (
      <>
        <b>{count}</b> {n}-note set {count === 1 ? 'class is' : 'classes are'} one swap away: IC
        {edit.move.i + 1} {up ? 'rises' : 'falls'} by one and exactly one other value{' '}
        {up ? 'falls' : 'rises'} by one, so the total stays the same.
      </>
    );
  } else {
    const want = result.locked
      .map((on, w) => (on ? `IC${w + 1} = ${result.target[w]}` : null))
      .filter(Boolean)
      .join(' and ');
    info = (
      <>
        <b>{count}</b> {n}-note set {count === 1 ? 'class has' : 'classes have'} {want}. Closest to
        the loaded vector first.
      </>
    );
  }

  return (
    <Stack gap="md">
      <Surface aria-label="Edit the interval vector">
        <Stack gap="sm">
          <Group gap="md" align="center">
            <Text size="sm">
              Loaded vector{' '}
              <Data span fw={700}>
                {icvText(base)}
              </Data>{' '}
              · {n} notes
            </Text>
            <Button
              size="xs"
              variant="default"
              disabled={!result.any}
              onClick={() => setEdit(emptyEdit())}
            >
              Reset Edits
            </Button>
            <Checkbox
              size="xs"
              label="Prime Forms Only (merge mirror images)"
              checked={merge}
              onChange={(e) => props.onMerge(e.currentTarget.checked)}
            />
            <Checkbox
              size="xs"
              label="Strict Swap (one +1 and one −1 only)"
              checked={strict}
              onChange={(e) => changeStrict(e.currentTarget.checked)}
            />
          </Group>
          <SimpleGrid cols={{ base: 2, xs: 3, md: 6 }} spacing="sm">
            {base.map((value, i) => {
              const edited = strict ? edit.move?.i === i : edit.deltas[i] !== 0;
              const shown = strict ? value : value + edit.deltas[i];
              return (
                <Surface key={i} tone="inset" p="xs" ta="center">
                  <Stack gap={4} align="center">
                    <Text size="xs" c="dimmed">
                      <Text span fw={700} c="var(--text)">{`IC${i + 1}`}</Text> {IC_NAMES[i]}
                    </Text>
                    <Data
                      fz="1.9rem"
                      lh={1.1}
                      c={edited ? 'var(--mantine-primary-color-filled)' : undefined}
                    >
                      {shown}
                    </Data>
                    <Text size="xs" c="dimmed" mih="1em">
                      {!strict && edit.deltas[i] !== 0 ? `was ${value}` : ''}
                    </Text>
                    <Stack gap={6} w="100%">
                      {([1, -1] as const).map((dir) => {
                        const b = stepButton(rows, base, edit, strict, i, dir);
                        return (
                          <Group key={dir} gap={6} justify="center" wrap="nowrap">
                            <Button
                              size="compact-sm"
                              variant={b.on ? 'filled' : 'default'}
                              disabled={b.disabled}
                              aria-pressed={strict ? b.on : undefined}
                              aria-label={b.label}
                              onClick={() => press(i, dir)}
                            >
                              {dir > 0 ? '+' : '−'}
                            </Button>
                            <Text size="xs" c="dimmed" aria-hidden="true">
                              {b.ghost}
                            </Text>
                          </Group>
                        );
                      })}
                    </Stack>
                  </Stack>
                </Surface>
              );
            })}
          </SimpleGrid>
          <Text size="xs" c="dimmed">
            {info}
          </Text>
        </Stack>
      </Surface>

      <Surface aria-label="Spectrum change">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={3} size="h5">
              Spectrum Change
            </Title>
            <SpectrumModeToggle value={props.spectrumMode} onChange={props.onSpectrumMode} />
          </Group>
          <Group gap="md">
            {sets.map((o) => (
              <Group key={o.name} gap={6}>
                <Swatch slot={o.slot} />
                <Text size="xs">{o.name}</Text>
              </Group>
            ))}
          </Group>
          <SpectrumChart
            sets={sets}
            mode={props.spectrumMode}
            label="Fourier power of the loaded set and the compared sets"
          />
          <Stack gap={2}>
            {sets.length > 1 ? (
              sets.slice(1).map((o) => {
                const change = spectrumChange(loadedSpectrum, spectrumOf(o.abs));
                return (
                  <Group key={o.name} gap={6}>
                    <Swatch slot={o.slot} />
                    <Text size="sm">
                      <b>{o.name}</b> vs loaded: {change.length ? change.join(', ') : 'no change'}
                    </Text>
                  </Group>
                );
              })
            ) : (
              <Text size="sm">No comparison sets yet.</Text>
            )}
          </Stack>
          <Text size="xs" c="dimmed">
            {SPECTRUM_CHANGE_HINT}
          </Text>
        </Stack>
      </Surface>

      {count > 0 && (
        <Surface p={0} aria-label="Sets that match the edited vector">
          <Table.ScrollContainer minWidth={0}>
            <Table verticalSpacing={4} stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th />
                  <Table.Th>Set</Table.Th>
                  <Table.Th>Forte</Table.Th>
                  <Table.Th>Vector</Table.Th>
                  <Table.Th>Other Changes</Table.Th>
                  <Table.Th>Distance</Table.Th>
                  <Table.Th>Mirror</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.matches.map((r) => (
                  <ResultRow
                    key={r.key}
                    r={r}
                    base={base}
                    locked={result.locked}
                    merge={merge}
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
            {VECTOR_RESULTS_HINT}
          </Text>
        </Surface>
      )}
    </Stack>
  );
}

interface ResultRowProps {
  r: MatchRow;
  base: number[];
  locked: boolean[];
  merge: boolean;
  entry: CompareEntry | undefined;
  playing: boolean;
  onToggle: () => void;
  onPlay: () => void;
  onLoad: () => void;
}

function ResultRow({
  r,
  base,
  locked,
  merge,
  entry,
  playing,
  onToggle,
  onPlay,
  onLoad,
}: ResultRowProps) {
  const sep = Math.max(...r.icv) > 9 ? ' ' : '';
  const other = r.icv
    .map((v, q) => ({ q, d: v - base[q] }))
    .filter(({ q, d }) => d !== 0 && !locked[q])
    .map(({ q, d }) => `IC${q + 1} ${signed(d)}`);
  return (
    <Table.Tr className={classes.compareRow} onClick={onToggle}>
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
      <Table.Td>
        <Data size="sm">
          {'<'}
          {r.icv.map((v, q) => (
            <span key={q}>
              {q > 0 && sep}
              {v - base[q] !== 0 ? (
                <Tooltip label={`IC${q + 1} was ${base[q]}`} withArrow>
                  <Text span fw={700} c="var(--mantine-primary-color-filled)" inherit>
                    {v}
                  </Text>
                </Tooltip>
              ) : (
                v
              )}
            </span>
          ))}
          {'>'}
        </Data>
      </Table.Td>
      <Table.Td>{other.length ? other.join(', ') : 'none'}</Table.Td>
      <Table.Td>{r.dist}</Table.Td>
      <Table.Td>
        <Data size="sm">{r.self ? 'self' : `${merge ? 'also ' : ''}[${r.mirrorKey}]`}</Data>
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
