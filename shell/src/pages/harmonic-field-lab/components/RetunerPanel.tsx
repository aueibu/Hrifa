/**
 * Retuner panel (live, M7): the card list (tab snapshots), the controls, "why this card won" for the last retune and the
 * drift readout. State: `lab.state.retuner` (state/retuner.ts); the keys and the glide are in `audio/useLabAudio.ts`.
 * The main views stay on the tab; this panel shows the active card.
 */
import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  NativeSelect,
  SegmentedControl,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { compareScorers, type RetuneWhyEntry } from '../../../lib/harmonic-field';
import { KEYS } from '../audio/keymap';
import type { Action } from '../state/labState';
import {
  MAX_CARDS,
  MAX_GLIDE_MS,
  PIVOT_MODES,
  SCORER_IDS,
  SCORER_NAMES,
  driftOf,
  fmtBase,
  makeScorer,
  shiftOf,
  type RetHeld,
  type RetState,
  type ScorerId,
} from '../state/retuner';
import { cardFromTab } from '../state/retunerCards';
import type { TipKey } from '../texts';
import { ArrowDownIcon, ArrowUpIcon, HomeIcon, PlusIcon, TrashIcon } from './icons';
import { CommitNumber, DebouncedText, Num, Row, Strip, Tip, signed, useLab } from './ui';
import classes from './panels.module.css';

/** A titled sub-block of the panel (a tier fill, no extra box line). */
function Cluster({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={classes.sub}>
      <h3 className={classes.familyHead}>{title}</h3>
      {children}
    </section>
  );
}

function Group2({ children }: { children: React.ReactNode }) {
  return <div className={classes.inlineField}>{children}</div>;
}

function IconBtn({
  label,
  k,
  onClick,
  disabled,
  children,
}: {
  label: string;
  k: TipKey;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tip k={k} as="control">
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </ActionIcon>
    </Tip>
  );
}

/** Held keys as degrees of the card they were played in, numbered from 1 (1 = the root), a prime per octave up. */
const heldText = (held: readonly RetHeld[]) =>
  held.map((h) => `${h.deg + 1}${"'".repeat(h.oct)}`).join(' ');

function Cards({ r }: { r: RetState }) {
  const { tab, dispatch } = useLab();
  const candidate = useMemo(() => cardFromTab(tab), [tab]);
  return (
    <div className={classes.stack}>
      {r.cards.length === 0 && (
        <Text size="xs" c="dimmed">
          No cards yet. Build a scale in a tab and add it here; the retuner needs at least one card
          (the keys play the tab until then).
        </Text>
      )}
      <ol className={classes.cardList}>
        {r.cards.map((c, i) => (
          <li key={c.id} className={classes.cardRow} data-active={r.active === i}>
            <Num muted>{i}</Num>
            <span className={classes.cardName}>
              <DebouncedText
                variant="unstyled"
                size="xs"
                aria-label={`Name of card ${i}`}
                value={c.name}
                onCommit={(name) => dispatch({ type: 'ret/rename', index: i, name })}
              />
              {i === 0 && (
                <span className={classes.homeTag}>
                  <Tip k="homeCard">home</Tip>
                </span>
              )}
              {r.active === i && (
                <span className={classes.homeTag}>
                  <Tip k="cardActive">active</Tip>
                </span>
              )}
            </span>
            <span className={classes.cardBase}>
              <Tip k="rootNow">
                <Num>{fmtBase(shiftOf(r, i, r.bases[i]))}</Num>
              </Tip>
            </span>
            <span className={classes.cardActions}>
              <IconBtn
                label={`Move ${c.name} up`}
                k="cardOrder"
                disabled={i === 0}
                onClick={() => dispatch({ type: 'ret/move', index: i, by: -1 })}
              >
                <ArrowUpIcon />
              </IconBtn>
              <IconBtn
                label={`Move ${c.name} down`}
                k="cardOrder"
                disabled={i === r.cards.length - 1}
                onClick={() => dispatch({ type: 'ret/move', index: i, by: 1 })}
              >
                <ArrowDownIcon />
              </IconBtn>
              {i > 0 && (
                <IconBtn
                  label={`Make ${c.name} home`}
                  k="cardSetHome"
                  onClick={() => dispatch({ type: 'ret/home', index: i })}
                >
                  <HomeIcon />
                </IconBtn>
              )}
              <IconBtn
                label={`Delete ${c.name}`}
                k="cardDelete"
                onClick={() => dispatch({ type: 'ret/delete', index: i })}
              >
                <TrashIcon />
              </IconBtn>
            </span>
          </li>
        ))}
      </ol>
      <Tip k="cardAdd" as="control">
        <Button
          size="xs"
          variant="default"
          leftSection={<PlusIcon />}
          disabled={!candidate || r.cards.length + r.dormant.length >= MAX_CARDS}
          onClick={() => candidate && dispatch({ type: 'ret/add', card: candidate })}
        >
          Add current tab as card
        </Button>
      </Tip>
      <Text size="xs" c="dimmed">
        Column <Tip k="rootNow">Root now</Tip> is how far each card root has moved from where it
        started (1/1 Hz in Parallel, the card's own mode root in Relative). Adding, moving or
        deleting a card, or switching Parallel | Relative, puts every root back to its start.
      </Text>
    </div>
  );
}

function Controls({ r }: { r: RetState }) {
  const { dispatch } = useLab();
  const s = r.settings;
  const set = (a: Extract<Action, { type: 'ret/settings' }>) => dispatch(a);
  return (
    <div className={classes.clusters}>
      <Cluster title="Engine">
        <Tip k="retunerOn" as="control" block>
          <Switch
            label="Retuner on"
            size="sm"
            checked={r.on}
            onChange={(e) => dispatch({ type: 'ret/on', on: e.currentTarget.checked })}
          />
        </Tip>
        <Group2>
          <Tip k="trigger">
            <Text size="sm">Trigger</Text>
          </Tip>
          <Tip k="trigger" as="control">
            <SegmentedControl
              size="xs"
              aria-label="Trigger"
              data={[
                { value: 'auto', label: 'Auto' },
                { value: 'manual', label: 'Manual' },
              ]}
              value={s.trigger}
              onChange={(v) =>
                set({
                  type: 'ret/settings',
                  patch: { trigger: v === 'manual' ? 'manual' : 'auto' },
                })
              }
            />
          </Tip>
        </Group2>
        <Group2>
          <Tip k="retuneNow" as="control">
            <Button
              size="xs"
              variant="default"
              disabled={!r.on || r.cards.length === 0}
              onClick={() => dispatch({ type: 'ret/retune' })}
            >
              Retune now
            </Button>
          </Tip>
          <Tip k="retuneReset" as="control">
            <Button
              size="xs"
              variant="default"
              disabled={r.cards.length === 0}
              onClick={() => dispatch({ type: 'ret/reset' })}
            >
              Reset roots
            </Button>
          </Tip>
        </Group2>
        {r.on && r.cards.length === 0 && (
          <Text size="xs" c="dimmed">
            Add a card to start: until then the keys play the tab.
          </Text>
        )}
      </Cluster>
      <Cluster title="Pivot and anchor">
        <Group2>
          <Tip k="pivot">
            <Text size="sm">Pivot</Text>
          </Tip>
          <Tip k="pivot" as="control">
            <NativeSelect
              size="xs"
              aria-label="Pivot"
              data={PIVOT_MODES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))}
              value={s.pivot}
              onChange={(e) =>
                set({
                  type: 'ret/settings',
                  patch: { pivot: e.currentTarget.value as (typeof PIVOT_MODES)[number] },
                })
              }
              w={110}
            />
          </Tip>
        </Group2>
        {s.pivot === 'manual' && (
          <Group2>
            <Tip k="pivotDeg">
              <Text size="sm">Degree</Text>
            </Tip>
            <Tip k="pivotDeg" as="control">
              <CommitNumber
                size="xs"
                aria-label="Pivot degree"
                value={s.manualDeg + 1}
                min={1}
                max={256}
                w={64}
                hideControls
                onCommit={(n) => set({ type: 'ret/settings', patch: { manualDeg: n - 1 } })}
              />
            </Tip>
          </Group2>
        )}
        <Group2>
          <Tip k="anchor">
            <Text size="sm">Anchor</Text>
          </Tip>
          <Tip k="anchor" as="control">
            <SegmentedControl
              size="xs"
              aria-label="Anchor"
              data={[
                { value: 'freestyle', label: 'Freestyle' },
                { value: 'fixed', label: 'Fixed' },
              ]}
              value={s.anchor}
              onChange={(v) =>
                set({
                  type: 'ret/settings',
                  patch: { anchor: v === 'fixed' ? 'fixed' : 'freestyle' },
                })
              }
            />
          </Tip>
        </Group2>
      </Cluster>
      <Cluster title="Scorer">
        <Tip k="scorer" as="control" block>
          <NativeSelect
            size="xs"
            aria-label="Scorer"
            data={SCORER_IDS.map((id) => ({ value: id, label: SCORER_NAMES[id] }))}
            value={s.scorer}
            onChange={(e) =>
              set({ type: 'ret/settings', patch: { scorer: e.currentTarget.value as ScorerId } })
            }
          />
        </Tip>
        {s.scorer === 'roughness' && (
          <Group2>
            <Tip k="scorerOptions">
              <Text size="sm">Partials</Text>
            </Tip>
            <Tip k="scorerOptions" as="control">
              <CommitNumber
                size="xs"
                aria-label="Partials"
                value={s.scorerOpts.harmonics}
                min={1}
                max={16}
                w={64}
                hideControls
                onCommit={(n) =>
                  set({ type: 'ret/settings', patch: { scorerOpts: { harmonics: n } } })
                }
              />
            </Tip>
            <Tip k="scorerOptions">
              <Text size="sm">Rolloff</Text>
            </Tip>
            <Tip k="scorerOptions" as="control">
              <CommitNumber
                size="xs"
                aria-label="Rolloff"
                value={s.scorerOpts.rolloff}
                min={0.01}
                max={1}
                allowDecimal
                decimalScale={2}
                w={64}
                hideControls
                onCommit={(n) =>
                  set({ type: 'ret/settings', patch: { scorerOpts: { rolloff: n } } })
                }
              />
            </Tip>
          </Group2>
        )}
        {s.scorer === 'lattice' && (
          <Group2>
            <Tip k="retunerOdd">
              <Text size="sm">Odd limit</Text>
            </Tip>
            <Tip k="retunerOdd" as="control">
              <CommitNumber
                size="xs"
                aria-label="Odd limit"
                value={s.scorerOpts.oddLimit}
                min={1}
                max={255}
                w={64}
                hideControls
                onCommit={(n) =>
                  set({ type: 'ret/settings', patch: { scorerOpts: { oddLimit: n } } })
                }
              />
            </Tip>
          </Group2>
        )}
        {(s.scorer === 'fair' || s.scorer === 'infinitone') && (
          <Text size="xs" c="dimmed">
            This scorer has no options.
          </Text>
        )}
      </Cluster>
      <Cluster title="Sound">
        <Group2>
          <Tip k="glide">
            <Text size="sm">Glide (ms)</Text>
          </Tip>
          <Tip k="glide" as="control">
            <CommitNumber
              size="xs"
              aria-label="Glide in milliseconds"
              value={s.glideMs}
              min={0}
              max={MAX_GLIDE_MS}
              w={72}
              hideControls
              onCommit={(n) => set({ type: 'ret/settings', patch: { glideMs: n } })}
            />
          </Tip>
        </Group2>
      </Cluster>
    </div>
  );
}

type SortKey = 'card' | 'name' | 'base' | 'predicted' | 'score' | 'rank';
const SORT_COLS: {
  key: SortKey;
  label: string;
  left?: boolean;
  tip?: 'rootNow' | 'predicted' | 'score' | 'rank';
}[] = [
  { key: 'card', label: '#' },
  { key: 'name', label: 'Card', left: true },
  { key: 'base', label: 'Root now', tip: 'rootNow' },
  { key: 'predicted', label: 'Predicted chord (Hz)', left: true, tip: 'predicted' },
  { key: 'score', label: 'Score', tip: 'score' },
  { key: 'rank', label: 'Rank', tip: 'rank' },
];

function sortValue(e: RetuneWhyEntry, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return e.name.toLowerCase();
    case 'base':
      return e.base.c;
    case 'predicted':
      return e.predicted[0] ?? Infinity;
    case 'score':
      return e.eligible ? e.score : Infinity;
    case 'rank':
      return e.rank ?? Infinity;
    default:
      return e.card;
  }
}

function Why({ r }: { r: RetState }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'card', dir: 1 });
  const last = r.last;
  const entries = useMemo(() => {
    const list = last ? [...last.result.why.entries] : [];
    return list.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const d = x < y ? -1 : x > y ? 1 : 0;
      return d * sort.dir || a.card - b.card;
    });
  }, [last, sort]);
  // the chosen step's chords under all four scorers, with the current scorer options
  const table = useMemo(() => {
    if (!last) {
      return null;
    }
    const chords = last.result.why.entries
      .filter((e) => e.predicted.length)
      .map((e) => ({ name: e.name, freqs: e.predicted }));
    if (chords.length === 0) {
      return null;
    }
    return compareScorers(
      chords,
      SCORER_IDS.map((id) => {
        const fn = makeScorer({ ...r.settings, scorer: id });
        return {
          name: SCORER_NAMES[id],
          score: (f: number[]) => {
            const v = fn(f, 0);
            return typeof v === 'number' ? { score: v } : v;
          },
        };
      })
    );
  }, [last, r.settings]);
  if (!last) {
    return (
      <Text size="xs" c="dimmed">
        Turn the retuner on, then hold two or more keys: each retune lists here every card's
        prediction for the chord and why one won.
      </Text>
    );
  }
  const why = last.result.why;
  return (
    <div className={classes.stack}>
      <div className={classes.inlineControls}>
        <Row name={<Tip k="retHeld">Held</Tip>}>
          <Num>{heldText(last.held)}</Num>
        </Row>
        <Row name={<Tip k="pivot">Pivot</Tip>}>
          {why.pivot ? (
            <>
              degree <Num>{why.pivot.deg + 1}</Num>
              {why.pivot.key !== undefined && (
                <>
                  , key <Num>{(KEYS[why.pivot.key] ?? '?').toUpperCase()}</Num>
                </>
              )}{' '}
              ({why.pivot.mode})
            </>
          ) : (
            'none'
          )}
        </Row>
        <Row name={<Tip k="anchor">Anchor</Tip>}>{why.anchor}</Row>
        <Row name={<Tip k="retTieBreak">Tie-break</Tip>}>{why.tieBreak}</Row>
        {why.reason && <Row name="Nothing changed">{why.reason}</Row>}
      </div>
      <Table
        className={classes.dt}
        verticalSpacing={4}
        horizontalSpacing="xs"
        withRowBorders={false}
      >
        <Table.Thead>
          <Table.Tr>
            {SORT_COLS.map((c) => (
              <Table.Th
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
              </Table.Th>
            ))}
            <Table.Th className={classes.l}>
              <Tip k="retResult">Result</Tip>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((e) => (
            <Table.Tr key={e.card} data-chosen={e.chosen}>
              <Table.Td>
                <Num muted>{e.card}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                {e.name} <Num muted>{e.card === 0 ? 'home' : ''}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{fmtBase(shiftOf(r, e.card, e.base))}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                <Num>{e.predicted.map((f) => f.toFixed(2)).join('  ')}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{e.eligible ? e.score.toFixed(3) : '-'}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{e.rank ?? '-'}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                {e.chosen ? (
                  <span className={classes.chosen}>chosen</span>
                ) : e.eligible ? (
                  ''
                ) : (
                  'not a candidate'
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {table && (
        <Cluster title="The same chord under all four scorers (score, rank)">
          <Table
            className={classes.dt}
            verticalSpacing={3}
            horizontalSpacing="xs"
            withRowBorders={false}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th className={classes.l}>Card</Table.Th>
                {table.scorers.map((s) => (
                  <Table.Th key={s}>{s}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {table.rows.map((row) => (
                <Table.Tr key={row.name}>
                  <Table.Td className={classes.l}>{row.name}</Table.Td>
                  {row.scores.map((s, k) => (
                    <Table.Td key={k}>
                      <Num>
                        {s.toFixed(s >= 100 ? 0 : 2)} ({row.ranks[k]})
                      </Num>
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed">
            Each scorer has its own scale. Compare the ranks in brackets, not the numbers; tied
            scores share a rank here (in the table above, ties go to the earlier card).
          </Text>
        </Cluster>
      )}
    </div>
  );
}

function Drift({ r }: { r: RetState }) {
  const d = driftOf(r);
  const exact = d.m !== null;
  return (
    <div className={classes.stack}>
      <div className={classes.readouts}>
        <div className={classes.readout}>
          <span className={classes.tileName}>
            <Tip k="drift">Drift (cents)</Tip>
          </span>
          <span className={classes.readoutValue} data-testid="drift-cents">
            <Num>{signed(d.c, 2)} c</Num>
          </span>
        </div>
        <div className={classes.readout}>
          <span className={classes.tileName}>
            <Tip k="comma">As a ratio</Tip>
          </span>
          <span className={classes.readoutValue} data-testid="drift-ratio">
            <Num>{exact ? fmtBase(d) : 'not exact'}</Num>
          </span>
        </div>
        <div className={classes.readout}>
          <span className={classes.tileName}>
            <Tip k="anchor">Anchor</Tip>
          </span>
          <span className={classes.readoutValue}>
            <Num>{r.settings.anchor}</Num>
          </span>
        </div>
      </div>
      {r.log.length > 0 && (
        <Table
          className={classes.dt}
          verticalSpacing={4}
          horizontalSpacing="xs"
          withRowBorders={false}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Step</Table.Th>
              <Table.Th className={classes.l}>Keys held</Table.Th>
              <Table.Th className={classes.l}>Card chosen</Table.Th>
              <Table.Th>Drift (c)</Table.Th>
              <Table.Th>Drift (ratio)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {r.log.map((s) => (
              <Table.Tr key={s.step}>
                <Table.Td>
                  <Num muted>{s.step}</Num>
                </Table.Td>
                <Table.Td className={classes.l}>
                  <Num>{heldText(s.held)}</Num>
                </Table.Td>
                <Table.Td className={classes.l}>{s.chosenName}</Table.Td>
                <Table.Td>
                  <Num>{signed(s.drift.c, 2)}</Num>
                </Table.Td>
                <Table.Td>
                  <Num>{s.drift.m ? fmtBase(s.drift) : '-'}</Num>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </div>
  );
}

export function RetunerPanel() {
  const { state } = useLab();
  const r = state.retuner;
  return (
    <>
      <Strip title={<Tip k="retunerPanel">Retuner</Tip>}>
        <span className={classes.hint}>
          {r.on ? `on · active: ${r.cards[r.active]?.name ?? 'none'}` : 'off'}
        </span>
      </Strip>
      <div className={classes.panelBody}>
        <Cluster title={<Tip k="cards">Cards</Tip>}>
          <Cards r={r} />
        </Cluster>
        <Cluster title={<Tip k="retunerOn">Controls</Tip>}>
          <Controls r={r} />
        </Cluster>
        <Cluster title={<Tip k="why">Why this card won</Tip>}>
          <Why r={r} />
        </Cluster>
        <Cluster title={<Tip k="drift">Drift</Tip>}>
          <Drift r={r} />
        </Cluster>
      </div>
    </>
  );
}
