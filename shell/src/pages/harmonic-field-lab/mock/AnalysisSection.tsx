/** Analysis section: stats, scale, interval spectrum, chords, keys, modes. */
import { Button, NumberInput, Table, Text, VisuallyHidden } from '@mantine/core';
import { fmtRatio } from '../../../lib/harmonic-field';
import { Article } from './Article';
import {
  analysis,
  chordRows,
  chordTolerance,
  chords,
  completeKeys,
  cs,
  field,
  keys,
  misses,
  modes,
  prop,
  rel,
  scaleRows,
  spectrum,
  templateCount,
} from './mockData';
import { Cluster, Num, Row, SectionHead, Tip, severity } from './ui';
import classes from './mock.module.css';

const ordinal = (n: number) =>
  n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

const maxStep = Math.max(...analysis.groups.map((g) => g.size));
const widestIdx = analysis.steps.indexOf(Math.max(...analysis.steps));
const structureText =
  analysis.structure.kind === 'equal'
    ? 'Equal'
    : analysis.structure.kind === 'mos'
      ? `MOS ${analysis.structure.L}L ${analysis.structure.s}s`
      : `${analysis.structure.sizes} step sizes, not MOS`;

/* ------------------------------------------------------------------------------------------------- stats */
function Tile({
  tip,
  name,
  children,
}: {
  tip: Parameters<typeof Tip>[0]['k'];
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className={classes.tile}>
      <span className={classes.tileName}>
        <Tip k={tip}>{name}</Tip>
      </span>
      <span className={classes.tileValue}>{children}</span>
    </div>
  );
}

function Stats() {
  return (
    <div className={classes.stack}>
      <div className={classes.tiles}>
        <Tile tip="notes" name="Notes">
          <Num>
            {analysis.N} of {field.length}
          </Num>
        </Tile>
        <Tile tip="period" name="Period">
          <Num>2/1</Num>
        </Tile>
        <Tile tip="primeLimit" name="Prime limit">
          <Num>{analysis.primeLimit}</Num>
        </Tile>
        <Tile tip="meanTenney" name="Mean Tenney height">
          <Num>{analysis.meanTenney?.toFixed(2)}</Num>
        </Tile>
        <Tile tip="stepPattern" name="Step pattern">
          <Num>{analysis.pattern}</Num>
        </Tile>
        <Tile tip="structure" name="Structure">
          <span>{structureText}</span>
        </Tile>
      </div>
      <Cluster title={<Tip k="stepSizes">Step sizes</Tip>}>
        <div>
          <table className={classes.stepTable}>
            <thead>
              <tr>
                <th className={classes.l}>Letter</th>
                <th>Size (c)</th>
                <th>Count</th>
                <th className={classes.barCol}>Relative</th>
              </tr>
            </thead>
            <tbody>
              {analysis.groups.map((g) => (
                <tr key={g.letter}>
                  <td className={classes.l}>
                    <Num>{g.letter}</Num>
                  </td>
                  <td>
                    <Num>{g.size.toFixed(2)}</Num>
                  </td>
                  <td>
                    <Num>&times;{g.count}</Num>
                  </td>
                  <td className={classes.barCol}>
                    <VisuallyHidden>{g.size.toFixed(2)} cents</VisuallyHidden>
                    <span
                      className={classes.sizeBar}
                      aria-hidden="true"
                      style={{ width: `${(g.size / maxStep) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cluster>
      <Cluster title="Shape">
        <Row name={<Tip k="variety">Variety</Tip>}>
          every interval comes in <Num>{spectrum[0].variety}</Num> sizes
        </Row>
        <Row name={<Tip k="propriety">Propriety</Tip>}>
          {prop.verdict} (<Num>{prop.pairs.length}</Num> overlaps)
        </Row>
        <Row name={<Tip k="constantStructure">Constant structure</Tip>}>
          {cs.cs
            ? 'yes'
            : `no: ${cs.example?.size.toFixed(2)} c is both a ${ordinal((cs.example?.ks[0] ?? 0) + 1)} and a ${ordinal((cs.example?.ks[1] ?? 0) + 1)}`}
        </Row>
      </Cluster>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------- scale */
function ScaleTable() {
  return (
    <Table className={classes.dt} verticalSpacing={4} horizontalSpacing="xs" withRowBorders={false}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Deg</Table.Th>
          <Table.Th className={classes.l}>Ratio</Table.Th>
          <Table.Th>Cents (c)</Table.Th>
          <Table.Th>Step (c)</Table.Th>
          <Table.Th className={classes.l}>Size</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {scaleRows.map((r) => (
          <Table.Tr key={r.deg}>
            <Table.Td>
              <Num muted>{r.deg}</Num>
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
            <Table.Td className={classes.l}>
              <Num>{r.letter}</Num>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/* ---------------------------------------------------------------------------------------------- spectrum */
function Spectrum() {
  return (
    <div className={classes.stack}>
      <table className={classes.specTable}>
        <thead>
          <tr>
            <th className={classes.l}>Generic interval</th>
            <th>Sizes</th>
            <th className={classes.l}>Sizes (c) and how often</th>
          </tr>
        </thead>
        <tbody>
          {spectrum.map((r) => (
            <tr key={r.k}>
              <td className={classes.l}>
                {ordinal(r.k + 1)}{' '}
                <Num muted>
                  ({r.k} step{r.k > 1 ? 's' : ''})
                </Num>
              </td>
              <td>
                <Num>{r.variety}</Num>
              </td>
              <td className={classes.l}>
                <span className={classes.chips}>
                  {r.sizes.map((s) => (
                    <span key={s.size} className={classes.sizeChip}>
                      <Num>{s.size.toFixed(1)}</Num>
                      {s.count > 1 && <Num muted> &times;{s.count}</Num>}
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Text size="sm" c="dimmed">
        Read across a row: all the sizes that interval takes. The widest rows show where the scale
        is least regular.
      </Text>
    </div>
  );
}

function SpectrumReader() {
  const byK = new Map<number, { a: number; b: number }[]>();
  for (const p of prop.pairs) {
    byK.set(p.k, [...(byK.get(p.k) ?? []), p]);
  }
  return (
    <div className={classes.stack}>
      <Spectrum />
      <Cluster title="All propriety clashes">
        <Text size="sm" c="dimmed">
          A clash is a k-step interval wider than a (k+1)-step one.
        </Text>
        {[...byK].map(([k, ps]) => (
          <div key={k} className={classes.clash}>
            <span className={classes.clashName}>
              {ordinal(k + 1)} vs {ordinal(k + 2)}
            </span>
            <span className={classes.chips}>
              {ps.map((p, i) => (
                <span key={i} className={classes.sizeChip}>
                  <Num>
                    {p.a.toFixed(2)} &gt; {p.b.toFixed(2)}
                  </Num>
                </span>
              ))}
            </span>
          </div>
        ))}
      </Cluster>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ chords */
const SEV_LABEL = ['exact', 'under 5 c', '5 to 15 c', '15 to 30 c', '30 c or more'];

function ErrCell({ c }: { c: number }) {
  const sev = severity(c);
  return (
    <span className={classes.err} data-sev={sev} title={`Error ${SEV_LABEL[sev]}`}>
      <Num>{sev === 0 ? 'exact' : c.toFixed(1)}</Num>
    </span>
  );
}

function Chords({ all }: { all?: boolean }) {
  const rows = all ? chordRows : chordRows.slice(0, 10);
  return (
    <div className={classes.stack}>
      <div className={classes.inlineControls}>
        <span className={classes.inlineField}>
          <Tip k="chordTolerance">
            <Text size="sm">Tolerance (c)</Text>
          </Tip>
          <Tip k="chordTolerance" as="control">
            <NumberInput
              size="xs"
              aria-label="Tolerance in cents"
              defaultValue={chordTolerance}
              w={72}
              hideControls
            />
          </Tip>
        </span>
        <Text size="sm">
          <Tip k="templates">Templates</Tip> <Num>{templateCount}</Num>
        </Text>
        <Tip k="templates" as="control">
          <Button size="compact-xs" variant="default">
            Edit list
          </Button>
        </Tip>
        <Tip k="templates" as="control">
          <Button size="compact-xs" variant="default">
            Reset list
          </Button>
        </Tip>
      </div>
      <Table
        className={classes.dt}
        verticalSpacing={4}
        horizontalSpacing="xs"
        withRowBorders={false}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th className={classes.l}>Chord</Table.Th>
            <Table.Th className={classes.l}>Template</Table.Th>
            <Table.Th className={classes.l}>Root</Table.Th>
            <Table.Th className={classes.l}>Notes</Table.Th>
            <Table.Th>
              <Tip k="chordError">Error (c)</Tip>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={i}>
              <Table.Td className={classes.l}>{r.name}</Table.Td>
              <Table.Td className={classes.l}>
                <Num>{r.template}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                <Num>{r.root}</Num>
              </Table.Td>
              <Table.Td className={classes.l}>
                <Num>{r.members.join('  ')}</Num>
              </Table.Td>
              <Table.Td>
                <ErrCell c={r.maxErr} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {misses.length > 0 && (
        <Cluster title={`Not found at ${chordTolerance} c (closest placement)`}>
          {misses.slice(0, all ? misses.length : 3).map((m) => (
            <div key={m.text} className={classes.miss}>
              <span>{m.name}</span>
              <Num muted>{m.text}</Num>
              <Num muted>{m.members.join('  ')}</Num>
              <span className={classes.missErr}>
                needs <ErrCell c={m.needs} /> c
              </span>
            </div>
          ))}
        </Cluster>
      )}
      <Text size="sm" c="dimmed">
        Every chord found here is exactly in tune: the field is built from whole-number ratios. A
        12-EDO field would show errors in colour, always printed beside the number.
      </Text>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------- keys */
function Keys({ all }: { all?: boolean }) {
  return (
    <div className={classes.stack}>
      <Text size="sm">
        <Tip k="keysSummary">Complete keys</Tip>: <Num>{completeKeys.length}</Num> of{' '}
        <Num>{field.length}</Num>
      </Text>
      <div className={classes.keyStrip}>
        {keys.map((k) => (
          <span
            key={k.root}
            className={classes.keyChip}
            data-complete={k.complete}
            title={
              k.complete ? 'Whole scale fits from here' : `${k.missing} notes would be missing`
            }
          >
            <Num>{fmtRatio(field[k.root])}</Num>
            <Num muted>{k.complete ? 'complete' : `-${k.missing}`}</Num>
          </span>
        ))}
      </div>
      <Text size="xs" c="dimmed">
        {all
          ? 'Every field note as a key, with how many scale notes it would be missing.'
          : 'Every field note as a possible root; the outlined one hosts the whole scale.'}
      </Text>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------- modes */
function Modes() {
  return (
    <Table className={classes.dt} verticalSpacing={3} horizontalSpacing={6} withRowBorders={false}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th className={classes.l}>Mode</Table.Th>
          {modes.map((_, j) => (
            <Table.Th key={j}>{j}</Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {modes.map((row, i) => (
          <Table.Tr key={i}>
            <Table.Td className={classes.l}>
              <Num muted>
                {i} ({fmtRatio(rel[i])})
              </Num>
            </Table.Td>
            {row.map((c, j) => (
              <Table.Td key={j}>
                <Num muted={j === 0}>{c.toFixed(0)}</Num>
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function AnalysisSection() {
  return (
    <section id="sec-analysis" className={classes.section} aria-labelledby="sec-analysis-h">
      <SectionHead
        id="sec-analysis-h"
        title="Analysis"
        lede="What the chosen subset is: its steps, intervals, chords, keys and modes."
      />
      <div className={classes.grid}>
        <Article
          id="blk-stats"
          title="Stats"
          tip="notes"
          lede={
            <>
              <Num>{analysis.N}</Num> notes with <Num>{analysis.groups.length}</Num> different step
              sizes: not a MOS scale.
            </>
          }
        >
          <Stats />
        </Article>
        <Article
          id="blk-scale"
          title="Scale"
          tip="scaleTable"
          lede={
            <>
              From <Num>1/1</Num> to <Num>{fmtRatio(rel[rel.length - 1])}</Num>; the widest step is{' '}
              <Num>{analysis.steps[widestIdx].toFixed(2)} c</Num> ({fmtRatio(rel[widestIdx])} up to{' '}
              {fmtRatio(rel[widestIdx + 1])}).
            </>
          }
        >
          <ScaleTable />
        </Article>
        <Article
          id="blk-spectrum"
          title="Interval spectrum"
          tip="spectrum"
          span={2}
          lede={
            <>
              <Num>{prop.verdict}</Num>, not constant structure: every generic interval takes{' '}
              <Num>{spectrum[0].variety}</Num> sizes.
            </>
          }
          reader={<SpectrumReader />}
        >
          <Spectrum />
        </Article>
        <Article
          id="blk-chords"
          title="Chords"
          tip="templates"
          span={2}
          lede={
            <>
              <Num>{chords.length}</Num> chords found within <Num>{chordTolerance} c</Num> across{' '}
              <Num>{templateCount}</Num> templates.
            </>
          }
          reader={<Chords all />}
        >
          <Chords />
        </Article>
        <Article
          id="blk-keys"
          title="Keys"
          tip="keysSummary"
          lede={
            <>
              Only <Num>{completeKeys.length}</Num> of <Num>{field.length}</Num> field notes can
              host the whole scale.
            </>
          }
          reader={<Keys all />}
        >
          <Keys />
        </Article>
        <Article
          id="blk-modes"
          title="Modes"
          tip="modes"
          lede={
            <>
              <Num>{modes.length}</Num> modes: the same notes restarted from each degree, in cents.
            </>
          }
        >
          <Modes />
        </Article>
      </div>
    </section>
  );
}
