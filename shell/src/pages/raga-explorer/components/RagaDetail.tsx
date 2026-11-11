import { useMemo } from 'react';
import { Badge, Divider, Group, Stack, Text, Title } from '@mantine/core';
import {
  melakartaRaga,
  multiParentSiblings,
  murchanaSearches,
  sameNameOtherMelas,
  scaleTwins,
  siblingVariants,
  similarNamesNotMerged,
  type RagaIndex,
} from '../data';
import { chakraName, chakraOf } from '../melas';
import { analyzeRaga, chainSteps, toks } from '../theory';
import type { RagaVariant } from '../types';
import type { PlayingNote } from '../useRagaAudio';
import { IntervalBarChart } from './IntervalBarChart';
import { LadderDiagram } from './LadderDiagram';
import { LinkedRagasGroup } from './LinkedRagas';
import { MurchanaMatches } from './MurchanaMatches';
import { RingDiagram } from './RingDiagram';
import { ScaleTransformRings } from './ScaleTransformRings';
import { TheoryPanel } from './TheoryPanel';

export interface RagaDetailProps {
  raga: RagaVariant;
  index: RagaIndex;
  playingNote: PlayingNote | null;
  onSelect: (raga: RagaVariant) => void;
}

const BHASHANGA_COLOR: Record<string, string> = {
  Yes: 'teal',
  No: 'gray',
  Unknown: 'yellow',
  'Needs Review': 'orange',
  Conflict: 'red',
};

export function RagaDetail({ raga, index, playingNote, onSelect }: RagaDetailProps) {
  const theory = useMemo(
    () => analyzeRaga(raga.aroha, raga.avaroha, raga.arohaChain, raga.avarohaChain),
    [raga]
  );
  const arohaTokens = useMemo(() => toks(raga.aroha), [raga.aroha]);
  const avarohaTokens = useMemo(() => toks(raga.avaroha), [raga.avaroha]);

  const siblings = siblingVariants(index, raga);
  const twins = scaleTwins(index, raga);
  const sameName = sameNameOtherMelas(index, raga);
  const similar = similarNamesNotMerged(index, raga);
  const multiParent = multiParentSiblings(index, raga);
  const parentMela =
    raga.mela != null && raga.type !== 'Melakarta' ? melakartaRaga(index, raga.mela) : undefined;
  const murchana = theory ? murchanaSearches(index, raga, theory) : null;

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Group gap="xs" wrap="wrap">
          <Title order={3}>{raga.name}</Title>
          {raga.type === 'Melakarta' && (
            <Badge color="orange" variant="filled">
              Melakarta
            </Badge>
          )}
          {raga.vakra && raga.vakra !== 'No' && <Badge color="grape">Vakra: {raga.vakra}</Badge>}
          {raga.bhashanga && (
            <Badge color={BHASHANGA_COLOR[raga.bhashanga] ?? 'gray'}>
              Bhashanga: {raga.bhashanga}
            </Badge>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          {raga.mela != null ? (
            <>
              Melakarta {raga.mela} · {raga.melaName} · Chakra {chakraOf(raga.mela)} (
              {chakraName(chakraOf(raga.mela))})
            </>
          ) : (
            'No melakarta on record'
          )}
          {' · '}
          {raga.status} ({raga.sourceCount} source{raga.sourceCount === 1 ? '' : 's'}:{' '}
          {raga.sources.join(', ')})
        </Text>
        {parentMela && (
          <Text size="sm">
            Parent scale:{' '}
            <Text
              component="button"
              onClick={() => onSelect(parentMela)}
              style={{ cursor: 'pointer' }}
              span
              c="blue"
            >
              {parentMela.name}
            </Text>
          </Text>
        )}
      </Stack>

      <Group gap="xs" wrap="wrap">
        <Text size="sm" ff="monospace">
          Aroha: {raga.aroha}
        </Text>
      </Group>
      <Group gap="xs" wrap="wrap">
        <Text size="sm" ff="monospace">
          Avaroha: {raga.avaroha}
        </Text>
      </Group>

      <Group gap="xl" wrap="wrap" align="flex-start">
        {theory && (
          <Stack gap={4} align="center">
            <RingDiagram
              usedPcs={theory.pcset}
              tokenMap={theory.tm}
              highlightPc={pcOfPlayingNote(playingNote, raga)}
              showFifths
              title={`${raga.name} pitch-class ring`}
            />
            <Text size="xs" c="dimmed" ta="center" maw={220}>
              Each note carries two dots on its own spoke, colinear with it: <b>teal</b> just
              inside the ring for its 5th above, <b>purple</b> just outside for its 5th below --
              filled if that note is also used, hollow if not. Hollow teal only is an{' '}
              <b>imperfection</b>; both hollow is <b>detached</b> (dashed red ring). Hover a note
              to see the lines.
            </Text>
          </Stack>
        )}
        {theory && (
          <LadderDiagram
            arohaTokens={arohaTokens}
            avarohaTokens={avarohaTokens}
            arohaChain={raga.arohaChain}
            avarohaChain={raga.avarohaChain}
            tokenMap={theory.tm}
            playingNote={playingNote}
          />
        )}
      </Group>

      {theory && (
        <>
          <Divider label="Structure" labelPosition="left" />
          <TheoryPanel theory={theory} />

          <Divider label="Intervals" labelPosition="left" />
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Signed semitone step between each consecutive pair of notes (a run of small steps, a
              leap, or a zig-zag/vakra all have a distinct shape here).
            </Text>
            <Group gap="lg" wrap="wrap">
              <Stack gap={2}>
                <Text size="xs" fw={600} c="blue">
                  Aroha
                </Text>
                <IntervalBarChart
                  steps={chainSteps(raga.arohaChain)}
                  fromTokens={arohaTokens}
                  toTokens={arohaTokens}
                  color="var(--mark-blue)"
                />
              </Stack>
              <Stack gap={2}>
                <Text size="xs" fw={600} c="grape">
                  Avaroha
                </Text>
                <IntervalBarChart
                  steps={chainSteps(raga.avarohaChain)}
                  fromTokens={avarohaTokens}
                  toTokens={avarohaTokens}
                  color="var(--mark-grape)"
                />
              </Stack>
            </Group>
          </Stack>

          <Divider label="Scale, mirror & negative" labelPosition="left" />
          <ScaleTransformRings theory={theory} />

          {murchana &&
            (murchana.inversions.length > 0 ||
              murchana.mirror.length > 0 ||
              murchana.negative.length > 0) && (
              <>
                <Divider label="Murchana matches" labelPosition="left" />
                <Text size="xs" c="dimmed">
                  A murchana re-bases a scale on one of its own notes, keeping the same pitches
                  (same idea as a Western mode rotation). These are the rotations of this raga's
                  scale, its mirror, and its negative that happen to land on another real raga's
                  exact pitch-class set.
                </Text>
                <Stack gap="sm">
                  <MurchanaMatches
                    title="Inversions of this raga"
                    hint="rotating this raga's own scale onto another of its notes"
                    hits={murchana.inversions}
                    onSelect={onSelect}
                  />
                  <MurchanaMatches
                    title="From the mirror"
                    hint="rotating the melodic mirror (see above)"
                    hits={murchana.mirror}
                    onSelect={onSelect}
                  />
                  <MurchanaMatches
                    title="From the negative"
                    hint="rotating the negative/complement scale (see above)"
                    hits={murchana.negative}
                    onSelect={onSelect}
                  />
                </Stack>
              </>
            )}
        </>
      )}

      <Divider label="Linked ragas" labelPosition="left" />
      <Stack gap="sm">
        <LinkedRagasGroup
          title="Other variants of this raga"
          hint="same name, different scale reading"
          ragas={siblings}
          onSelect={onSelect}
        />
        <LinkedRagasGroup
          title="Scale twins"
          hint="different name, identical scale"
          ragas={twins}
          onSelect={onSelect}
        />
        <LinkedRagasGroup title="Same name, other melakarta" ragas={sameName} onSelect={onSelect} />
        <LinkedRagasGroup
          title="Similar name, judged a different raga"
          ragas={similar}
          onSelect={onSelect}
        />
        <LinkedRagasGroup
          title="Also listed under other melakartas (same raga)"
          ragas={multiParent}
          onSelect={onSelect}
        />
        {siblings.length === 0 &&
          twins.length === 0 &&
          sameName.length === 0 &&
          similar.length === 0 &&
          multiParent.length === 0 && (
            <Text size="sm" c="dimmed">
              No recorded links for this raga.
            </Text>
          )}
      </Stack>
    </Stack>
  );
}

function pcOfPlayingNote(note: PlayingNote | null, raga: RagaVariant): number | null {
  if (!note) {
    return null;
  }
  const chain = note.part === 'aroha' ? raga.arohaChain : raga.avarohaChain;
  const v = chain[note.index];
  if (v == null) {
    return null;
  }
  return ((v % 12) + 12) % 12;
}
