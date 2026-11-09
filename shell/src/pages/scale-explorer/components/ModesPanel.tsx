import { Fragment, useEffect, useRef } from 'react';
import { Button, Group, Select, Stack, Table, Text, Tooltip } from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { Surface } from '../../../components/Surface/Surface';
import { chordsOf, noteNames, spellPcs, type NameMode } from '../chords';
import { expansionLabel, joinSigned, sgn } from '../format';
import { neighboursOf, type Mode } from '../pitchSets';
import {
  chordContext,
  displayPcs,
  expansionList,
  type ScaleView,
  type ViewOptions,
} from '../scaleView';
import type { SortMode } from '../settings';
import { chordFootnote, MODES_HINT } from '../texts';
import type { NowPlaying, PlayingContext } from '../usePlayback';
import { useScaleStyle } from '../useScaleStyle';
import { Swatch } from './Legend';
import { MiniRing } from './MiniRing';
import classes from '../ScaleExplorer.module.css';

export const modeKey = (m: Mode) => m.ks.join(',');
export const modePlayKey = (idx: number) => `m:${idx}`;
export const chordPlayKey = (idx: number, k: number, e: number, d: number) =>
  `c:${idx}:${k}:${e}:${d}`;
export const chordSeqKey = (idx: number, k: number, e: number) => `s:${idx}:${k}:${e}`;

interface ModesPanelProps {
  v: ScaleView;
  o: ViewOptions;
  pathMax: number;
  showFifths: boolean;
  open: ReadonlySet<string>;
  onToggleOpen: (key: string) => void;
  onOpenAll: () => void;
  onCloseAll: () => void;
  playingKey: string | null;
  now: NowPlaying | null;
  context: PlayingContext | null;
  onSort: (mode: SortMode) => void;
  onExpansion: (e: number | 'all') => void;
  onNameMode: (mode: NameMode) => void;
  onPlayMode: (idx: number) => void;
  onPlayChord: (idx: number, k: number, e: number, d: number | null) => void;
  /** Row to scroll into view (set by clicking the neighbours chart). */
  scrollTo: { index: number } | null;
}

export function ModesPanel(props: ModesPanelProps) {
  const { v, o, open, playingKey, now, context, showFifths } = props;
  const { view } = v;
  const names = noteNames(o.flats);
  const n = view[0].z.length;
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  useEffect(() => {
    if (props.scrollTo) {
      rowRefs.current
        .get(props.scrollTo.index)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [props.scrollTo]);

  const expansionData = [
    ...Array.from({ length: n }, (_, e) => ({
      value: String(e),
      label: `E${e} · ${expansionLabel(e)}`,
    })),
    { value: 'all', label: `All expansions, E0 to E${n - 1}` },
  ];
  const expansionValue = o.expansion === 'all' ? 'all' : String(Math.min(o.expansion, n - 1));

  return (
    <Surface p={0} aria-label="Modes">
      <Stack gap="sm" p="md">
        <Text size="xs" c="dimmed">
          {MODES_HINT}
        </Text>
        <Group gap="xs" align="end">
          <Select
            size="xs"
            label="Order"
            w={230}
            allowDeselect={false}
            value={o.sortMode}
            data={[
              { value: 'start', label: 'By starting note' },
              { value: 'fifths', label: 'Fifths brightness, dark to bright' },
            ]}
            onChange={(val) => val && props.onSort(val as SortMode)}
          />
          <Select
            size="xs"
            label="Expansion"
            w={230}
            allowDeselect={false}
            value={expansionValue}
            data={expansionData}
            onChange={(val) => val && props.onExpansion(val === 'all' ? 'all' : Number(val))}
          />
          <Select
            size="xs"
            label="Names"
            w={160}
            allowDeselect={false}
            value={o.nameMode}
            data={[
              { value: 'anchor', label: 'From anchor note' },
              { value: 'tertian', label: 'Best tertian root' },
            ]}
            onChange={(val) => val && props.onNameMode(val as NameMode)}
          />
          <Button size="xs" variant="default" onClick={props.onOpenAll}>
            Open all
          </Button>
          <Button size="xs" variant="default" onClick={props.onCloseAll}>
            Close all
          </Button>
        </Group>
      </Stack>
      <Table.ScrollContainer minWidth={0}>
        <Table verticalSpacing="xs" highlightOnHover={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Mode</Table.Th>
              <Table.Th />
              <Table.Th>Notes</Table.Th>
              <Table.Th>Set to Zero</Table.Th>
              <Table.Th>Steps</Table.Th>
              <Table.Th>Fifths</Table.Th>
              <Table.Th>P5 on Root</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {view.map((m, idx) => {
              const key = modeKey(m);
              const isOpen = open.has(key);
              const pcs = displayPcs(m, o);
              const spelled = spellPcs(pcs, o.flats);
              const sub: string[] = [];
              if (m.ks.length > 1) {
                sub.push(`on ${m.starts.map((p) => names[p]).join(' / ')}`);
              }
              if (m.srcs.length) {
                sub.push(`inverse of ${m.srcs.join(', ')}`);
              }
              const title = `${m.ks.length > 1 ? 'Modes' : 'Mode'} ${m.ks.join(', ')}${
                o.invMode === 'root' ? ' inverted' : ''
              }`;
              const isNow = context?.modeIndex === idx;
              const playing = playingKey === modePlayKey(idx);
              return (
                <Fragment key={key}>
                  <Table.Tr
                    ref={(el) => {
                      if (el) {
                        rowRefs.current.set(idx, el);
                      } else {
                        rowRefs.current.delete(idx);
                      }
                    }}
                    className={classes.modeRow}
                    data-open={isOpen}
                    data-now={isNow}
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => props.onToggleOpen(key)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        props.onToggleOpen(key);
                      }
                    }}
                  >
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <span className={classes.chev} aria-hidden="true">
                          ›
                        </span>
                        <Stack gap={0}>
                          <Text fw={600}>{m.ks.join(', ')}</Text>
                          {sub.length > 0 && (
                            <Text size="xs" c="dimmed">
                              {sub.join(' · ')}
                            </Text>
                          )}
                        </Stack>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <MiniRing
                        pcs={pcs}
                        names={names}
                        showFifths={showFifths}
                        soundingPcs={now?.modeIndex === idx ? now.pcs : new Set()}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Data size="sm">{spelled.join(' ')}</Data>
                    </Table.Td>
                    <Table.Td>
                      <Data size="sm">{m.z.join(' ')}</Data>
                    </Table.Td>
                    <Table.Td>
                      <Data size="sm">{m.d.join(' ')}</Data>
                    </Table.Td>
                    <Table.Td>
                      <Data size="sm">{sgn(m.fs)}</Data>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{m.p5root ? 'yes' : 'no'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="compact-sm"
                        variant="default"
                        aria-label={`${playing ? 'Stop' : 'Play'} ${title.toLowerCase()}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onPlayMode(idx);
                        }}
                      >
                        {playing ? '■ Stop' : '▶ Play'}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                  {isOpen && (
                    <Table.Tr>
                      <Table.Td colSpan={8}>
                        <ModeDetail
                          m={m}
                          idx={idx}
                          view={view}
                          o={o}
                          pathMax={props.pathMax}
                          playingKey={playingKey}
                          chordKey={context?.modeIndex === idx ? context.chordKey : undefined}
                          onPlayChord={props.onPlayChord}
                        />
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Surface>
  );
}

interface ModeDetailProps {
  m: Mode;
  idx: number;
  view: Mode[];
  o: ViewOptions;
  pathMax: number;
  playingKey: string | null;
  chordKey: string | undefined;
  onPlayChord: (idx: number, k: number, e: number, d: number | null) => void;
}

function ModeDetail({
  m,
  idx,
  view,
  o,
  pathMax,
  playingKey,
  chordKey,
  onPlayChord,
}: ModeDetailProps) {
  const style = useScaleStyle();
  const n = m.z.length;
  const ctx = chordContext(m, o);
  const groups = neighboursOf(m, view, pathMax).filter((g) => g.items.length);
  const row = (label: string, value: React.ReactNode) => (
    <Group gap="md" align="baseline" wrap="nowrap" key={label}>
      <Text size="xs" c="dimmed" w={150} flex="none">
        {label}
      </Text>
      <Text ff="monospace" size="sm" component="div">
        {value}
      </Text>
    </Group>
  );
  return (
    <Group align="start" gap="xl" wrap="wrap">
      <Stack gap={6} flex="1 1 18rem">
        {row('Rotation (PC Set)', `[${m.abs.join(' ')}]`)}
        {row('Note Distance to Next', m.dl.join(' '))}
        {row(
          'Modal Neighbors',
          groups.length ? (
            <Stack gap={0}>
              {groups.map((g) => (
                <span key={g.d}>
                  {g.d} {g.d === 1 ? 'note' : 'notes'} away:{' '}
                  {g.items.map((q) => `mode ${q.o.ks[0]} (${q.rel})`).join(', ')}
                </span>
              ))}
            </Stack>
          ) : (
            'none'
          )
        )}
        {row('P5 Above Root', m.p5root ? 'yes (0 → 7)' : 'no (no 7)')}
        {row(
          'P5 Above Each Note',
          m.z.map((x, i) => `${x}→${m.fm[i] === null ? '–' : m.fm[i]}`).join(' ')
        )}
      </Stack>
      <Stack gap="sm" flex="2 1 24rem">
        <Text size="sm">
          Fifths Brightness: <Data span>{`${joinSigned(m.f)} = ${m.fs}`}</Data>
          {m.ttTie ? ' (tritone tied, counted as 0)' : ''}
        </Text>
        <Text fw={600} size="sm">
          Derived Chords
        </Text>
        {expansionList(n, o.expansion).map((e) => {
          const mirror = n - 2 - e;
          return (
            <Stack key={e} gap="xs">
              <Group gap="xs">
                <Text fw={700} size="sm">{`E${e}`}</Text>
                <Text size="xs" c="dimmed">
                  {expansionLabel(e)}
                </Text>
              </Group>
              {mirror >= 0 && mirror < e && (
                <Text size="xs" c="dimmed">
                  Uses the same sets of notes as E{mirror}, but anchored on a different note of each
                  set, so these are different chords.
                </Text>
              )}
              {(
                [
                  [3, 'Triads'],
                  [4, 'Seventh Chords'],
                ] as const
              ).map(([k, label]) => {
                const chords = chordsOf(m, k, e + 1, ctx);
                if (!chords.length) {
                  return (
                    <Text key={k} size="xs" c="dimmed">
                      {label}: not available at {n} notes: stacking{' '}
                      {e === 0 ? 'adjacent notes' : expansionLabel(e)} wraps back onto a note
                      already in the chord.
                    </Text>
                  );
                }
                const seq = chordSeqKey(idx, k, e);
                return (
                  <Stack key={k} gap={4}>
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">
                        {label}
                      </Text>
                      <Button
                        size="compact-xs"
                        variant="default"
                        onClick={() => onPlayChord(idx, k, e, null)}
                      >
                        {playingKey === seq ? '■ Stop' : '▶ Play all'}
                      </Button>
                    </Group>
                    <Group gap={6}>
                      {chords.map((c) => {
                        const ck = chordPlayKey(idx, k, e, c.i);
                        return (
                          <Tooltip
                            key={c.i}
                            multiline
                            w={300}
                            withArrow
                            label={`Notes: ${c.notes} · stacked intervals: ${c.rel.join(' ')}${
                              c.reading ? ` · tertian reading: ${c.reading}` : ''
                            }${c.alt ? ` · also: ${c.alt}` : ''}`}
                          >
                            <span
                              className={classes.chipWrap}
                              data-now={chordKey === ck || playingKey === ck}
                            >
                              <Button
                                size="compact-sm"
                                variant="default"
                                leftSection={<Swatch color={style.familyColor(c.fam)} />}
                                onClick={() => onPlayChord(idx, k, e, c.i)}
                              >
                                <Text span fw={700} size="sm">
                                  {c.rootName}
                                </Text>
                                &nbsp;{c.q}
                                {c.bassName ? `/${c.bassName}` : ''}
                                {c.reading && (
                                  <Text span size="xs" c="dimmed">
                                    &nbsp;= {c.reading}
                                  </Text>
                                )}
                                {c.alt && !c.altHidden && (
                                  <Text span size="xs" c="dimmed">
                                    &nbsp;{c.alt}
                                  </Text>
                                )}
                              </Button>
                            </span>
                          </Tooltip>
                        );
                      })}
                    </Group>
                  </Stack>
                );
              })}
            </Stack>
          );
        })}
        <Text size="xs" c="dimmed">
          {chordFootnote(n, o.nameMode === 'anchor')}
        </Text>
      </Stack>
    </Group>
  );
}
