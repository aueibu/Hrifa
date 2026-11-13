/** Retuner section (placeholder): card list, controls, "why this card won" table, drift readout. Numbers from M2/M3. */
import {
  ActionIcon,
  Button,
  NativeSelect,
  NumberInput,
  SegmentedControl,
  Switch,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { Article } from './Article';
import { ArrowDownIcon, ArrowUpIcon, HomeIcon, PlusIcon, TrashIcon } from './icons';
import {
  SCORERS,
  driftSteps,
  finalDrift,
  fixedFinal,
  fmtBase,
  retunerCards,
  scorerTable,
  why,
  whyStepIndex,
} from './mockData';
import { Cluster, Num, Row, SectionHead, Tip, signed } from './ui';
import classes from './mock.module.css';

const homeOf = (i: number) => (i === 0 ? 'home' : '');
const winner = why.entries.find((e) => e.chosen);
const runnerUp = why.entries.filter((e) => e.rank === 2)[0];

function IconBtn({
  label,
  tip,
  children,
}: {
  label: string;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={tip} multiline w={240} openDelay={200}>
      <ActionIcon variant="subtle" color="gray" size="sm" aria-label={label}>
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

function Cards() {
  return (
    <div className={classes.stack}>
      <ol className={classes.cardList}>
        {retunerCards.map((c, i) => (
          <li key={c.name} className={classes.cardRow} data-active={winner?.card === i}>
            <Num muted>{i}</Num>
            <span className={classes.cardName}>
              {c.name}
              {i === 0 && (
                <span className={classes.homeTag}>
                  <Tip k="homeCard">home</Tip>
                </span>
              )}
              {winner?.card === i && (
                <span className={classes.homeTag}>
                  <Tip k="cardActive">active</Tip>
                </span>
              )}
            </span>
            <span className={classes.cardBase}>
              <Tip k="rootNow">
                <Num>{fmtBase(c.base)}</Num>
              </Tip>
            </span>
            <span className={classes.cardActions}>
              <IconBtn
                label={`Move ${c.name} up`}
                tip="Move the card up the list (earlier cards win ties)."
              >
                <ArrowUpIcon />
              </IconBtn>
              <IconBtn label={`Move ${c.name} down`} tip="Move the card down the list.">
                <ArrowDownIcon />
              </IconBtn>
              {i > 0 && (
                <IconBtn label={`Make ${c.name} home`} tip="Make this card the home card (card 0).">
                  <HomeIcon />
                </IconBtn>
              )}
              <IconBtn label={`Delete ${c.name}`} tip="Remove this card from the list.">
                <TrashIcon />
              </IconBtn>
            </span>
          </li>
        ))}
      </ol>
      <Tip k="cardAdd" as="control">
        <Button size="xs" variant="default" leftSection={<PlusIcon />}>
          Add current tab as card
        </Button>
      </Tip>
      <Text size="xs" c="dimmed">
        Column <Tip k="rootNow">Root now</Tip> is each card root against its starting pitch, after
        the five-chord progression below.
      </Text>
    </div>
  );
}

function Controls() {
  return (
    <div className={classes.clusters}>
      <Cluster title="Engine">
        <Tip k="retunerOn" as="control" block>
          <Switch defaultChecked label="Retuner on" size="sm" />
        </Tip>
        <Group2>
          <Tip k="trigger">
            <Text size="sm">Trigger</Text>
          </Tip>
          <Tip k="trigger" as="control">
            <SegmentedControl
              size="xs"
              aria-label="Trigger"
              data={['Auto', 'Manual']}
              defaultValue="Auto"
            />
          </Tip>
        </Group2>
        <Tip k="retuneNow" as="control">
          <Button size="xs" variant="default">
            Retune now
          </Button>
        </Tip>
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
              data={['Manual', 'Lowest', 'Highest', 'Recent', 'Longest']}
              defaultValue="Manual"
              w={110}
            />
          </Tip>
        </Group2>
        <Group2>
          <Tip k="anchor">
            <Text size="sm">Anchor</Text>
          </Tip>
          <Tip k="anchor" as="control">
            <SegmentedControl
              size="xs"
              aria-label="Anchor"
              data={['Freestyle', 'Fixed']}
              defaultValue="Freestyle"
            />
          </Tip>
        </Group2>
      </Cluster>
      <Cluster title="Scorer">
        <Tip k="scorer" as="control" block>
          <NativeSelect
            size="xs"
            aria-label="Scorer"
            data={SCORERS.map((s) => s.name)}
            defaultValue={SCORERS[0].name}
          />
        </Tip>
        <Group2>
          <Tip k="scorerOptions">
            <Text size="sm">Overtones</Text>
          </Tip>
          <Tip k="scorerOptions" as="control">
            <NumberInput size="xs" aria-label="Overtones" defaultValue={7} w={64} hideControls />
          </Tip>
          <Tip k="scorerOptions">
            <Text size="sm">Rolloff</Text>
          </Tip>
          <Tip k="scorerOptions" as="control">
            <NumberInput size="xs" aria-label="Rolloff" defaultValue={0.88} w={64} hideControls />
          </Tip>
        </Group2>
      </Cluster>
      <Cluster title="Sound">
        <Group2>
          <Tip k="glide">
            <Text size="sm">Glide (ms)</Text>
          </Tip>
          <Tip k="glide" as="control">
            <NumberInput
              size="xs"
              aria-label="Glide in milliseconds"
              defaultValue={120}
              w={72}
              hideControls
            />
          </Tip>
        </Group2>
      </Cluster>
    </div>
  );
}

function Group2({ children }: { children: React.ReactNode }) {
  return <div className={classes.inlineField}>{children}</div>;
}

function Why() {
  const entries = why.entries;
  return (
    <div className={classes.stack}>
      <div className={classes.inlineControls}>
        <Row name="Held">
          <Num>{driftSteps[whyStepIndex].chord}</Num>
        </Row>
        <Row name={<Tip k="pivot">Pivot</Tip>}>
          key <Num>{why.pivot?.key}</Num>, degree <Num>{why.pivot?.deg}</Num> ({why.pivot?.mode})
        </Row>
        <Row name={<Tip k="anchor">Anchor</Tip>}>{why.anchor}</Row>
        <Row name="Tie-break">{why.tieBreak}</Row>
      </div>
      <Table
        className={classes.dt}
        verticalSpacing={4}
        horizontalSpacing="xs"
        withRowBorders={false}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th className={classes.l}>Card</Table.Th>
            <Table.Th>
              <Tip k="rootNow">Root now</Tip>
            </Table.Th>
            <Table.Th className={classes.l}>
              <Tip k="predicted">Predicted chord (Hz)</Tip>
            </Table.Th>
            <Table.Th>
              <Tip k="score">Roughness score</Tip>
            </Table.Th>
            <Table.Th>
              <Tip k="rank">Rank</Tip>
            </Table.Th>
            <Table.Th className={classes.l}>Result</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((e) => (
            <Table.Tr key={e.card} data-chosen={e.chosen}>
              <Table.Td>
                <Num muted>{e.card}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                {e.name} <Num muted>{homeOf(e.card)}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{fmtBase(e.base)}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                <Num>{e.predicted.map((f) => f.toFixed(2)).join('  ')}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{e.score.toFixed(3)}</Num>
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
              {scorerTable.scorers.map((s) => (
                <Table.Th key={s}>{s}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {scorerTable.rows.map((r) => (
              <Table.Tr key={r.name}>
                <Table.Td className={classes.l}>{r.name}</Table.Td>
                {r.scores.map((s, k) => (
                  <Table.Td key={k}>
                    <Num>
                      {s.toFixed(s >= 100 ? 0 : 2)} ({r.ranks[k]})
                    </Num>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed">
          Each scorer has its own scale. Compare the ranks in brackets, not the numbers; tied scores
          share a rank here (in the table above, ties go to the earlier card).
        </Text>
      </Cluster>
    </div>
  );
}

function Drift() {
  return (
    <div className={classes.stack}>
      <div className={classes.readouts}>
        <div className={classes.readout}>
          <span className={classes.tileName}>
            <Tip k="drift">Freestyle drift (cents)</Tip>
          </span>
          <span className={classes.readoutValue}>
            <Num>{signed(finalDrift.driftCents, 2)} c</Num>
          </span>
        </div>
        <div className={classes.readout}>
          <span className={classes.tileName}>
            <Tip k="comma">As a ratio</Tip>
          </span>
          <span className={classes.readoutValue}>
            <Num>{finalDrift.driftRatio}</Num>
          </span>
        </div>
        <div className={classes.readout}>
          <span className={classes.tileName}>
            <Tip k="anchor">Fixed drift (cents)</Tip>
          </span>
          <span className={classes.readoutValue}>
            <Num>{signed(fixedFinal.driftCents, 2)} c</Num>
          </span>
        </div>
      </div>
      <Table
        className={classes.dt}
        verticalSpacing={4}
        horizontalSpacing="xs"
        withRowBorders={false}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Step</Table.Th>
            <Table.Th className={classes.l}>Chord held</Table.Th>
            <Table.Th className={classes.l}>Card chosen (Freestyle)</Table.Th>
            <Table.Th>Drift (c)</Table.Th>
            <Table.Th>Drift (ratio)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {driftSteps.map((s, i) => (
            <Table.Tr key={i}>
              <Table.Td>
                <Num muted>{i + 1}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                <Num>{s.chord}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>{s.chosen}</Table.Td>
              <Table.Td>
                <Num>{signed(s.driftCents, 2)}</Num>
              </Table.Td>
              <Table.Td>
                <Num>{s.driftRatio}</Num>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}

export function RetunerSection() {
  return (
    <section id="sec-retuner" className={classes.section} aria-labelledby="sec-retuner-h">
      <SectionHead
        id="sec-retuner-h"
        title="Retuner"
        lede="Placeholder: re-roots a list of candidate scales around a held pivot and picks the card whose chord scores best."
      />
      <div className={classes.grid}>
        <Article
          id="blk-cards"
          title="Cards"
          tip="cards"
          lede={
            <>
              <Num>{retunerCards.length}</Num> candidate scales; card 0 is home.
            </>
          }
        >
          <Cards />
        </Article>
        <Article
          id="blk-retcontrols"
          title="Retuner controls"
          tip="retunerOn"
          lede="Roughness scorer, Freestyle anchor, Auto trigger, 120 ms glide."
        >
          <Controls />
        </Article>
        <Article
          id="blk-why"
          title="Why this card won"
          tip="why"
          span={2}
          lede={
            <>
              {winner?.name} wins the ii chord: roughness <Num>{winner?.score.toFixed(2)}</Num>{' '}
              against <Num>{runnerUp?.score.toFixed(2)}</Num>.
            </>
          }
        >
          <Why />
        </Article>
        <Article
          id="blk-drift"
          title="Drift"
          tip="drift"
          span={2}
          lede={
            <>
              After I, vi, ii, V, I the tuning has drifted{' '}
              <Num>{signed(finalDrift.driftCents, 2)} c</Num> (<Num>{finalDrift.driftRatio}</Num>)
              in Freestyle, and <Num>{signed(fixedFinal.driftCents, 2)} c</Num> in Fixed.
            </>
          }
        >
          <Drift />
        </Article>
      </div>
    </section>
  );
}
