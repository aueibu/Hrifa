import { useMemo, useState } from 'react';
import { Group, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import type { PlacementRecord } from '../engine';

interface ResultsListProps {
  records: PlacementRecord[];
  selectedPerm: number[] | null;
  onSelect: (perm: number[]) => void;
}

type SortKey = 'interval' | 'v1' | 'v2' | 'roughness' | 'ambiguity' | 'harmonicity';
type SortDir = 'asc' | 'desc';

function comparePerm(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? -Infinity;
    const bv = b[i] ?? -Infinity;
    if (av !== bv) {
      return av - bv;
    }
  }
  return 0;
}

const SORT_VALUE: Record<SortKey, (rec: PlacementRecord) => number> = {
  interval: () => 0, // handled separately via comparePerm
  v1: (rec) => rec.perPair,
  v2: (rec) => rec.scoreV2.combined,
  roughness: (rec) => rec.scoreV2.roughness,
  ambiguity: (rec) => rec.scoreV2.ambiguity,
  harmonicity: (rec) => rec.scoreV2.harmonicity,
};

const SORT_LABELS: Array<{ key: SortKey; label: string; title: string }> = [
  { key: 'interval', label: 'Interval', title: 'Sort by the interval sequence itself' },
  { key: 'v1', label: 'v1', title: 'Sort by v1: perPair' },
  { key: 'v2', label: 'v2', title: 'Sort by v2 (draft) composite' },
  { key: 'roughness', label: 'R', title: 'Sort by roughness (Sethares/ERB)' },
  { key: 'ambiguity', label: 'A', title: 'Sort by ambiguity (harmonic entropy)' },
  { key: 'harmonicity', label: 'H', title: 'Sort by harmonicity (virtual pitch / root support)' },
];

type ScoreKey = Exclude<SortKey, 'interval'>;
const SCORE_KEYS: ScoreKey[] = ['v1', 'v2', 'roughness', 'ambiguity', 'harmonicity'];
// Every score is "lower = more consonant" except harmonicity, which flips
// (higher virtual-pitch support = more consonant — see the v2 composite's
// subtraction of it, and the tooltips below).
const HIGHER_IS_BETTER: Record<ScoreKey, boolean> = {
  v1: false,
  v2: false,
  roughness: false,
  ambiguity: false,
  harmonicity: true,
};

/**
 * Rank of each record within each score, 1 = most consonant by that
 * score. Computed over the full `records` set regardless of current sort,
 * so the badge means the same thing no matter which column the list is
 * currently sorted by.
 */
function computeRanks(records: PlacementRecord[]): Map<string, Record<ScoreKey, number>> {
  const ranks = new Map<string, Record<ScoreKey, number>>();
  records.forEach((r) => ranks.set(r.perm.join(','), {} as Record<ScoreKey, number>));
  SCORE_KEYS.forEach((key) => {
    const dirMul = HIGHER_IS_BETTER[key] ? -1 : 1;
    const value = SORT_VALUE[key];
    const ordered = [...records].sort((a, b) => dirMul * (value(a) - value(b)));
    ordered.forEach((r, idx) => {
      ranks.get(r.perm.join(','))![key] = idx + 1;
    });
  });
  return ranks;
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <Text component="span" size="9px" c="dimmed" ff="monospace">
      #{rank}
    </Text>
  );
}

function SortButton({
  active,
  dir,
  label,
  title,
  onClick,
}: {
  active: boolean;
  dir: SortDir;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton onClick={onClick} title={title}>
      <Text size="xs" c={active ? undefined : 'dimmed'} fw={active ? 700 : undefined}>
        {label}
        {active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </Text>
    </UnstyledButton>
  );
}

/**
 * Ranked permutation list, replacing the source tool's results table.
 * Defaults to v1's own order (lowest `perPair` first) but every column —
 * the interval sequence itself, v1, v2's composite, and each of v2's three
 * sub-scores — is independently sortable via the header row.
 */
export function ResultsList({ records, selectedPerm, onSelect }: ResultsListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('v1');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const dirMul = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'interval') {
      return [...records].sort((a, b) => dirMul * comparePerm(a.perm, b.perm));
    }
    const value = SORT_VALUE[sortKey];
    return [...records].sort((a, b) => dirMul * (value(a) - value(b)));
  }, [records, sortKey, sortDir]);

  const ranks = useMemo(() => computeRanks(records), [records]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (!records.length) {
    return (
      <Text size="sm" c="dimmed">
        No valid placements for this input.
      </Text>
    );
  }

  const selectedKey = selectedPerm ? selectedPerm.join(',') : null;

  return (
    <Stack gap={4} style={{ minHeight: 0, height: '100%' }}>
      <Group gap="xs" justify="space-between" px={4}>
        {SORT_LABELS.map(({ key, label, title }) => (
          <SortButton
            key={key}
            active={sortKey === key}
            dir={sortDir}
            label={label}
            title={title}
            onClick={() => toggleSort(key)}
          />
        ))}
      </Group>
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Stack gap={2}>
          {sorted.map((rec) => {
            const rank = ranks.get(rec.perm.join(','))!;
            return (
              <Stack
                key={rec.perm.join('-')}
                gap={2}
                onClick={() => onSelect(rec.perm)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background:
                    rec.perm.join(',') === selectedKey ? 'var(--mantine-color-blue-light)' : undefined,
                }}
              >
                <Text size="xs" ff="monospace">
                  {rec.perm.join(' ')}
                </Text>
                {/*
                  v1, v2, and the three sub-scores v2's composite is built
                  from (see `psychoacousticsV2.ts`) all on one line — since
                  this app only ever compares its own results against each
                  other (not against any external benchmark), the
                  composite's arbitrary combination weights are less of a
                  concern for ranking purposes here than they'd be if the
                  number needed to mean something on its own — but the
                  sub-scores still show when they disagree with each other,
                  which the composite alone hides.
                */}
                <Group gap={6} justify="flex-end" wrap="nowrap">
                  <span title="v1: perPair (lower = more consonant)">
                    <Data size="xs">{rec.perPair.toFixed(2)}</Data>
                  </span>
                  <Text size="xs" c="dimmed">
                    /
                  </Text>
                  <span title="v2 (draft) composite: roughness/4 + ambiguity/5 − harmonicity (lower = more consonant)">
                    <Data size="xs" c="grape">
                      {rec.scoreV2.combined.toFixed(2)}
                    </Data>
                  </span>
                  <span title="Roughness (Sethares/ERB, lower = more consonant)">
                    <Text size="xs" c="dimmed" ff="monospace">
                      R {rec.scoreV2.roughness.toFixed(2)}
                    </Text>
                  </span>
                  <span title="Ambiguity (harmonic entropy, salience-weighted, lower = more consonant)">
                    <Text size="xs" c="dimmed" ff="monospace">
                      A {rec.scoreV2.ambiguity.toFixed(2)}
                    </Text>
                  </span>
                  <span title="Harmonicity (virtual pitch / root support, higher = more consonant)">
                    <Text size="xs" c="dimmed" ff="monospace">
                      H {rec.scoreV2.harmonicity.toFixed(2)}
                    </Text>
                  </span>
                </Group>
                {/* Ranks (1 = most consonant) for each score above, same order. */}
                <Group gap={6} justify="flex-end" wrap="nowrap">
                  <RankBadge rank={rank.v1} />
                  <Text size="9px" c="dimmed">
                    &nbsp;
                  </Text>
                  <RankBadge rank={rank.v2} />
                  <RankBadge rank={rank.roughness} />
                  <RankBadge rank={rank.ambiguity} />
                  <RankBadge rank={rank.harmonicity} />
                </Group>
              </Stack>
            );
          })}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
