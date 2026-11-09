import { useMemo, useState } from 'react';
import { Badge, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { chakraOf, CHAKRA_NAMES } from '../melas';
import { pcsOf } from '../theory';
import type { MelaRef, RagaVariant } from '../types';

export interface RagaListProps {
  ragas: RagaVariant[]; // one representative variant per raga id
  melas: MelaRef[];
  filterPcs: number[];
  excludePcs: number[];
  selectedVid: string | null;
  onSelect: (raga: RagaVariant) => void;
}

const RENDER_CAP = 250;

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function RagaList({
  ragas,
  melas,
  filterPcs,
  excludePcs,
  selectedVid,
  onSelect,
}: RagaListProps) {
  const [search, setSearch] = useState('');
  const [melaFilter, setMelaFilter] = useState<string | null>(null);
  const [chakraFilter, setChakraFilter] = useState<string | null>(null);
  const [vakraFilter, setVakraFilter] = useState<string | null>(null);
  const [bhashangaFilter, setBhashangaFilter] = useState<string | null>(null);

  const melaOptions = useMemo(
    () => melas.map((m) => ({ value: String(m.number), label: `${m.number}. ${m.name}` })),
    [melas]
  );
  const chakraOptions = useMemo(
    () => CHAKRA_NAMES.map((name, i) => ({ value: String(i + 1), label: `${i + 1}. ${name}` })),
    []
  );

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    const melaN = melaFilter ? Number(melaFilter) : null;
    const chakraN = chakraFilter ? Number(chakraFilter) : null;
    const needed = new Set(filterPcs);
    const forbidden = new Set(excludePcs);
    const matches = ragas.filter((r) => {
      if (melaN != null && r.mela !== melaN) {
        return false;
      }
      if (chakraN != null && (r.mela == null || chakraOf(r.mela) !== chakraN)) {
        return false;
      }
      if (vakraFilter && r.vakra !== vakraFilter) {
        return false;
      }
      if (bhashangaFilter && r.bhashanga !== bhashangaFilter) {
        return false;
      }
      if (needed.size > 0 || forbidden.size > 0) {
        const have = new Set([...pcsOf(r.aroha), ...pcsOf(r.avaroha)]);
        for (const pc of needed) {
          if (!have.has(pc)) {
            return false;
          }
        }
        for (const pc of forbidden) {
          if (have.has(pc)) {
            return false;
          }
        }
      }
      if (term) {
        const haystack = normalize(`${r.name} ${r.allSpellings} ${r.aliasNames} ${r.melaName}`);
        if (!haystack.includes(term)) {
          return false;
        }
      }
      return true;
    });
    // melakarta (parent-scale) matches surface first -- they're the "root" of whatever family the search/filter
    // landed on, so seeing them before their janyas orients the rest of the list. A stable sort keeps everything
    // else in its existing relative order.
    return matches
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const am = a.r.type === 'Melakarta' ? 0 : 1;
        const bm = b.r.type === 'Melakarta' ? 0 : 1;
        return am !== bm ? am - bm : a.i - b.i;
      })
      .map(({ r }) => r);
  }, [
    ragas,
    search,
    melaFilter,
    chakraFilter,
    vakraFilter,
    bhashangaFilter,
    filterPcs,
    excludePcs,
  ]);

  return (
    <Stack gap="xs" style={{ height: '100%', minHeight: 0 }}>
      <TextInput
        placeholder="Search raga name (any spelling)..."
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <Group gap="xs" grow wrap="wrap">
        <Select
          placeholder="Chakra"
          data={chakraOptions}
          value={chakraFilter}
          onChange={setChakraFilter}
          clearable
          size="xs"
        />
        <Select
          placeholder="Melakarta"
          data={melaOptions}
          value={melaFilter}
          onChange={setMelaFilter}
          clearable
          searchable
          size="xs"
        />
      </Group>
      <Group gap="xs" grow wrap="wrap">
        <Select
          placeholder="Vakra"
          data={['Yes', 'No', 'Mixed']}
          value={vakraFilter}
          onChange={setVakraFilter}
          clearable
          size="xs"
        />
        <Select
          placeholder="Bhashanga"
          data={['Yes', 'No', 'Unknown', 'Needs Review']}
          value={bhashangaFilter}
          onChange={setBhashangaFilter}
          clearable
          size="xs"
        />
      </Group>

      <Group gap={6} wrap="wrap">
        <Text size="xs" c="dimmed">
          {filtered.length} raga{filtered.length === 1 ? '' : 's'}
          {filterPcs.length > 0
            ? ` including ${filterPcs.length} chosen pitch${filterPcs.length === 1 ? '' : 'es'}`
            : ''}
          {excludePcs.length > 0
            ? ` excluding ${excludePcs.length} pitch${excludePcs.length === 1 ? '' : 'es'}`
            : ''}
        </Text>
        <Group gap={4} wrap="nowrap" style={{ marginLeft: 'auto' }}>
          <Badge size="xs" variant="filled" color="orange">
            M
          </Badge>
          <Text size="xs" c="dimmed">
            melakarta ·
          </Text>
          <Badge size="xs" variant="outline" color="grape">
            V
          </Badge>
          <Text size="xs" c="dimmed">
            vakra ·
          </Text>
          <Badge size="xs" variant="outline" color="teal">
            B
          </Badge>
          <Text size="xs" c="dimmed">
            bhashanga
          </Text>
        </Group>
      </Group>

      <Stack gap={2} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {filtered.slice(0, RENDER_CAP).map((r) => (
          <Group
            key={r.id}
            gap="xs"
            wrap="nowrap"
            onClick={() => onSelect(r)}
            style={{
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 4,
              background: r.vid === selectedVid ? 'var(--mantine-color-blue-light)' : undefined,
            }}
          >
            <Text
              size="sm"
              fw={r.vid === selectedVid ? 700 : 400}
              style={{ flex: 1, minWidth: 0 }}
              truncate
            >
              {r.name}
            </Text>
            <Badge size="xs" variant="light" color={chakraColor(r.mela)}>
              {r.mela ?? '?'}
            </Badge>
            {r.type === 'Melakarta' && (
              <Badge
                size="xs"
                variant="filled"
                color="orange"
                title="This is a melakarta's own parent scale"
              >
                M
              </Badge>
            )}
            {r.vakra === 'Yes' && (
              <Badge size="xs" variant="outline" color="grape">
                V
              </Badge>
            )}
            {r.bhashanga === 'Yes' && (
              <Badge size="xs" variant="outline" color="teal">
                B
              </Badge>
            )}
          </Group>
        ))}
        {filtered.length > RENDER_CAP && (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            +{filtered.length - RENDER_CAP} more — narrow your search or filters to see them
          </Text>
        )}
        {filtered.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No ragas match.
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

function chakraColor(mela: number | null): string {
  if (mela == null) {
    return 'gray';
  }
  const colors = [
    'red',
    'orange',
    'yellow',
    'lime',
    'green',
    'teal',
    'cyan',
    'blue',
    'indigo',
    'violet',
    'grape',
    'pink',
  ];
  return colors[chakraOf(mela) - 1] ?? 'gray';
}
