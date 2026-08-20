import { useMemo, useState } from 'react';
import { Alert, Button, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { Data } from '../../components/Data/Data';
import { Surface } from '../../components/Surface/Surface';
import { type EnvelopeType, usePeriodicityAudio } from './audio';
import { LatticeDiagram } from './components/LatticeDiagram';
import { ShiftMapDiagram } from './components/ShiftMapDiagram';
import { VectorDiagram } from './components/VectorDiagram';
import {
  buildPeriodicityBlock,
  findTwoUnisonVectors,
  invariantFactors,
  isDegeneratePair,
  traversalCycles,
  type BlockPoint,
  type InvariantFactors,
  type TwoUnisonVectors,
} from './periodicityBlock';
import type { SegmentRatios } from './RatioAnalysisPanel';

const MAX_COMPLEXITY = 25;

interface PairResult {
  key: string;
  label: string;
  g1: number;
  g2: number;
  degenerate: boolean;
  uvs: TwoUnisonVectors | null;
  invariant: InvariantFactors | null;
  block: BlockPoint[] | null;
}

interface SegmentResult {
  letter: string;
  lists: { label: string; pairs: PairResult[] }[];
}

interface SonificationSettings {
  rootHz: number;
  bpm: number;
  chordSize: number;
  scaleWindow: number;
  envType: EnvelopeType;
}

function computePairs(label: string, letter: string, vals: number[], edo: number): PairResult[] {
  const tolerance = 1 / (2 * edo);
  const out: PairResult[] = [];
  for (let a = 0; a < vals.length; a++) {
    for (let b = a + 1; b < vals.length; b++) {
      const g1 = vals[a];
      const g2 = vals[b];
      const key = `${letter}_${label}_${a}_${b}`;
      if (isDegeneratePair(g1, g2)) {
        out.push({ block: null, degenerate: true, g1, g2, invariant: null, key, label, uvs: null });
        continue;
      }
      const uvs = findTwoUnisonVectors(g1, g2, tolerance, MAX_COMPLEXITY);
      if (!uvs) {
        out.push({
          block: null,
          degenerate: false,
          g1,
          g2,
          invariant: null,
          key,
          label,
          uvs: null,
        });
        continue;
      }
      const block = buildPeriodicityBlock(g1, g2, uvs.uv1, uvs.uv2);
      out.push({
        block,
        degenerate: false,
        g1,
        g2,
        invariant: invariantFactors(uvs.uv1, uvs.uv2),
        key,
        label,
        uvs,
      });
    }
  }
  return out;
}

function PairCard({
  pair,
  step,
  sonification,
  audio,
}: {
  pair: PairResult;
  step: { i: number; j: number };
  sonification: SonificationSettings;
  audio: ReturnType<typeof usePeriodicityAudio>;
}) {
  const [ci, setCi] = useState(0);
  const [cj, setCj] = useState(0);
  const [showMap, setShowMap] = useState(false);

  const block = useMemo(() => {
    if (!pair.uvs) {
      return null;
    }
    return buildPeriodicityBlock(pair.g1, pair.g2, pair.uvs.uv1, pair.uvs.uv2, ci, cj);
  }, [pair.uvs, pair.g1, pair.g2, ci, cj]);

  const traversal = useMemo(() => {
    if (!pair.uvs || !block) {
      return null;
    }
    return traversalCycles(block, pair.uvs.uv1, pair.uvs.uv2, step.i, step.j);
  }, [pair.uvs, block, step.i, step.j]);

  if (pair.degenerate) {
    return (
      <Surface tone="inset" p="sm">
        <Group gap={4} wrap="wrap">
          <Data size="sm">
            {pair.g1.toFixed(3)}, {pair.g2.toFixed(3)}
          </Data>
          <Text c="red" size="sm">
            &mdash; degenerate (sum&asymp;1): rank-1, reduces to a single generator{' '}
            {pair.g1.toFixed(3)}
          </Text>
        </Group>
      </Surface>
    );
  }
  if (!pair.uvs || !pair.invariant || !block || !traversal) {
    return (
      <Surface tone="inset" p="sm">
        <Group gap={4} wrap="wrap">
          <Data size="sm">
            {pair.g1.toFixed(3)}, {pair.g2.toFixed(3)}
          </Data>
          <Text c="dimmed" size="sm">
            &mdash; couldn&apos;t find two independent unison vectors within complexity{' '}
            {MAX_COMPLEXITY}
          </Text>
        </Group>
      </Surface>
    );
  }

  const { uv1, uv2, det } = pair.uvs;
  const { d1, d2 } = pair.invariant;
  const c1 = (uv1.dist * 1200).toFixed(1);
  const c2 = (uv2.dist * 1200).toFixed(1);
  const beat = 60 / sonification.bpm;

  const playCycle = (cyc: number[]) => {
    const ratios = cyc.map((i) => block[i].pitch).concat([block[cyc[0]].pitch]);
    audio.playRatioSequence(
      ratios,
      sonification.rootHz,
      beat * 0.9,
      beat * 0.1,
      sonification.envType
    );
  };
  const playCycleChords = (cyc: number[]) => {
    const ratios = cyc.map((i) => block[i].pitch);
    const size = Math.max(2, Math.min(4, sonification.chordSize));
    audio.playChordWindows(
      ratios,
      size,
      sonification.rootHz,
      beat * 0.9,
      beat * 0.1,
      sonification.envType
    );
  };
  const playCycleScale = (cyc: number[]) => {
    const windowSize = Math.max(2, Math.min(cyc.length, sonification.scaleWindow));
    const ratios = cyc
      .slice(0, windowSize)
      .map((i) => block[i].pitch)
      .sort((a, b) => a - b);
    ratios.push(ratios[0] + 1);
    audio.playRatioSequence(
      ratios,
      sonification.rootHz,
      beat * 0.9,
      beat * 0.1,
      sonification.envType
    );
  };

  return (
    <Surface tone="inset" p="sm">
      <Group align="flex-start" gap="md" wrap="wrap">
        <Stack gap={6}>
          <VectorDiagram uv1={uv1} uv2={uv2} det={det} />
          <LatticeDiagram
            uv1={uv1}
            uv2={uv2}
            points={block}
            ci={ci}
            cj={cj}
            cycles={traversal.cycles}
          />
        </Stack>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Data size="sm">
            {pair.g1.toFixed(3)}, {pair.g2.toFixed(3)}
          </Data>
          <Text c="green" size="xs">
            unison vector 1: m={uv1.m}, n={uv1.n} (complexity {uv1.complexity}, off by {c1}&cent;,
            badness {uv1.badness.toFixed(1)})
          </Text>
          <Text c="orange" size="xs">
            unison vector 2: m={uv2.m}, n={uv2.n} (complexity {uv2.complexity}, off by {c2}&cent;,
            badness {uv2.badness.toFixed(1)})
          </Text>
          <Text size="xs">determinant (block size): {det}</Text>
          <Text c={d1 > 1 ? 'orange' : 'dimmed'} size="xs">
            group structure:{' '}
            {d1 > 1
              ? `Z/${d1} × Z/${d2} — NOT simple cyclic; no step can ever exceed a ${d2}-cycle, forced into ≥${d1} sub-loops`
              : `Z/${d2} — simple cyclic; a single ${d2}-cycle is reachable with the right step`}
          </Text>
          <Text size="xs" style={{ wordBreak: 'break-all' }}>
            block ({block.length} notes): {block.map((p) => p.pitch.toFixed(3)).join(', ')}
          </Text>
          <Group gap="xs">
            <NumberInput
              label="shift i"
              value={ci}
              onChange={(v) => setCi(Number(v) || 0)}
              step={0.1}
              w={90}
            />
            <NumberInput
              label="shift j"
              value={cj}
              onChange={(v) => setCj(Number(v) || 0)}
              step={0.1}
              w={90}
            />
            <Button mt={22} size="xs" variant="default" onClick={() => setShowMap((v) => !v)}>
              {showMap ? 'hide map' : 'view map'}
            </Button>
          </Group>
          {showMap && (
            <ShiftMapDiagram
              uv1={uv1}
              uv2={uv2}
              ci={ci}
              cj={cj}
              onShift={(nextCi, nextCj) => {
                setCi(nextCi);
                setCj(nextCj);
              }}
            />
          )}
          <Text size="xs">
            step ({step.i},{step.j}) &rarr; {traversal.g} cycle{traversal.g === 1 ? '' : 's'}{' '}
            &mdash; {traversal.g === 1 ? 'one full cycle' : `${traversal.g} sub-cycles`}
          </Text>
          {traversal.cycles.map((cyc, ci2) => (
            <Group key={ci2} gap="xs" wrap="wrap">
              <Text size="xs">
                {traversal.cycles.length > 1 ? `cycle ${ci2 + 1}: ` : ''}
                {cyc.map((i) => block[i].pitch.toFixed(3)).join(' → ')} &rarr; (
                {block[cyc[0]].pitch.toFixed(3)})
              </Text>
              <Button size="xs" variant="subtle" onClick={() => playCycle(cyc)}>
                &#9658; play
              </Button>
              <Button size="xs" variant="subtle" onClick={() => playCycleChords(cyc)}>
                &#9658; chords
              </Button>
              <Button size="xs" variant="subtle" onClick={() => playCycleScale(cyc)}>
                &#9658; scale
              </Button>
            </Group>
          ))}
        </Stack>
      </Group>
    </Surface>
  );
}

interface PeriodicityBlockPanelProps {
  segments: SegmentRatios[];
  edo: number;
}

/** Periodicity block generator: every pair of points in a segment's ratio list, used as two generators. */
export function PeriodicityBlockPanel({ segments, edo }: PeriodicityBlockPanelProps) {
  const [results, setResults] = useState<SegmentResult[] | null>(null);
  const [stepI, setStepI] = useState(1);
  const [stepJ, setStepJ] = useState(0);
  const [rootHz, setRootHz] = useState(220);
  const [bpm, setBpm] = useState(120);
  const [chordSize, setChordSize] = useState(2);
  const [scaleWindow, setScaleWindow] = useState(7);
  const [envType, setEnvType] = useState<EnvelopeType>('sustain');
  const audio = usePeriodicityAudio();

  const generate = () => {
    setResults(
      segments.map((seg) => ({
        letter: seg.letter,
        lists: [
          {
            label: 'arc positions',
            pairs: computePairs('arc positions', seg.letter, seg.arcVals, edo),
          },
          {
            label: 'chord crossings',
            pairs: computePairs('chord crossings', seg.letter, seg.chordVals, edo),
          },
        ],
      }))
    );
  };

  return (
    <Surface>
      <Stack gap="md">
        <Title order={2} size="h4">
          Periodicity blocks from generator pairs
        </Title>
        <Text c="dimmed" size="xs">
          Every pair of points in a segment&apos;s ratio list, used as two generators. Finds the two
          lowest-badness independent unison vectors (within half an EDO step, ranked by Cangwu
          badness) and takes the determinant of those two as the exact block size, same as a
          classical Fokker construction. Mirror pairs (sum to 1) are flagged as degenerate.
        </Text>
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Button onClick={generate}>Generate periodicity blocks</Button>
          <NumberInput
            label="step gen1"
            value={stepI}
            onChange={(v) => setStepI(Number(v) || 0)}
            w={90}
          />
          <NumberInput
            label="step gen2"
            value={stepJ}
            onChange={(v) => setStepJ(Number(v) || 0)}
            w={90}
          />
          <NumberInput
            label="root Hz @ ratio 0.00"
            value={rootHz}
            onChange={(v) => setRootHz(Number(v) || 220)}
            min={20}
            max={2000}
            w={130}
          />
          <NumberInput
            label="chord size"
            value={chordSize}
            onChange={(v) => setChordSize(Number(v) || 2)}
            min={2}
            max={4}
            w={100}
          />
          <NumberInput
            label="scale window"
            value={scaleWindow}
            onChange={(v) => setScaleWindow(Number(v) || 7)}
            min={2}
            max={24}
            w={110}
          />
          <NumberInput
            label="BPM"
            value={bpm}
            onChange={(v) => setBpm(Number(v) || 120)}
            min={20}
            max={400}
            w={90}
          />
          <Select
            label="envelope"
            value={envType}
            onChange={(v) => v && setEnvType(v as EnvelopeType)}
            data={[
              { value: 'sustain', label: 'sustain' },
              { value: 'pluck', label: 'pluck' },
            ]}
            w={120}
          />
        </Group>
        {results && (
          <Text c="dimmed" size="xs">
            at EDO {edo} — regenerate after changing EDO or the underlying geometry
          </Text>
        )}
        {results === null ? (
          <Alert color="gray" variant="light">
            No blocks generated yet.
          </Alert>
        ) : (
          <Stack gap="lg">
            {results.map((seg) => (
              <Stack key={seg.letter} gap="sm">
                <Text fw={700} size="sm">
                  {seg.letter}
                </Text>
                {seg.lists.map((list) => (
                  <Stack key={list.label} gap="xs">
                    <Text c="dimmed" size="xs">
                      {list.label} ({list.pairs.length} pair{list.pairs.length === 1 ? '' : 's'})
                    </Text>
                    {list.pairs.length === 0 ? (
                      <Text c="dimmed" size="xs">
                        fewer than 2 points — no pairs
                      </Text>
                    ) : (
                      list.pairs.map((pair) => (
                        <PairCard
                          key={pair.key}
                          pair={pair}
                          step={{ i: stepI, j: stepJ }}
                          sonification={{ rootHz, bpm, chordSize, scaleWindow, envType }}
                          audio={audio}
                        />
                      ))
                    )}
                  </Stack>
                ))}
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Surface>
  );
}
