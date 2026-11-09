import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ActionIcon,
  Anchor,
  AppShell,
  Box,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Surface } from '../components/Surface/Surface';
import { PlaybackControls } from './raga-explorer/components/PlaybackControls';
import { RagaDetail } from './raga-explorer/components/RagaDetail';
import { RagaList } from './raga-explorer/components/RagaList';
import { RingDiagram } from './raga-explorer/components/RingDiagram';
import {
  buildIndex,
  loadRagaData,
  representativeVariants,
  type RagaIndex,
} from './raga-explorer/data';
import { loadSettings, saveSettings, type Settings } from './raga-explorer/settings';
import type { RagaVariant } from './raga-explorer/types';
import { useRagaAudio } from './raga-explorer/useRagaAudio';

export function RagaExplorerPage() {
  const [index, setIndex] = useState<RagaIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedVid, setSelectedVid] = useState<string | null>(null);
  const [filterPcs, setFilterPcs] = useState<number[]>([]);
  const [excludePcs, setExcludePcs] = useState<number[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const stackedLayout = useMediaQuery('(max-width: 1100px)');

  useEffect(() => {
    loadRagaData()
      .then((data) => setIndex(buildIndex(data)))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => saveSettings(settings), [settings]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  // deep link: ?raga=<vid> in the URL, restored on load and kept in sync with the selection
  useEffect(() => {
    if (!index) {
      return;
    }
    const fromUrl = searchParams.get('raga');
    const initial =
      (fromUrl && index.byVid.get(fromUrl)) ||
      (settings.lastVid && index.byVid.get(settings.lastVid)) ||
      index.ragas[0];
    if (initial) {
      setSelectedVid(initial.vid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const selectedRaga: RagaVariant | null =
    index && selectedVid ? (index.byVid.get(selectedVid) ?? null) : null;

  const { playing, playingNote, play, stop } = useRagaAudio(selectedRaga, settings);

  const selectRaga = (raga: RagaVariant) => {
    setSelectedVid(raga.vid);
    set('lastVid', raga.vid);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('raga', raga.vid);
      return next;
    });
  };

  const ragaList = useMemo(() => (index ? representativeVariants(index) : []), [index]);

  // left click = must include; right click = must NOT include. Picking a pitch on one side clears it from the
  // other -- a pitch can't be both required and excluded at once.
  const toggleFilterPc = (pc: number) => {
    setExcludePcs((prev) => prev.filter((p) => p !== pc));
    setFilterPcs((prev) =>
      prev.includes(pc) ? prev.filter((p) => p !== pc) : [...prev, pc].sort((a, b) => a - b)
    );
  };
  const toggleExcludePc = (pc: number) => {
    setFilterPcs((prev) => prev.filter((p) => p !== pc));
    setExcludePcs((prev) =>
      prev.includes(pc) ? prev.filter((p) => p !== pc) : [...prev, pc].sort((a, b) => a - b)
    );
  };

  const randomRaga = () => {
    if (ragaList.length === 0) {
      return;
    }
    selectRaga(ragaList[Math.floor(Math.random() * ragaList.length)]);
  };

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Anchor component={Link} to="/" size="sm">
              &larr; Workbench
            </Anchor>
            <Text c="dimmed">/</Text>
            <Title order={1} size="h4">
              Raga Explorer
            </Title>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {loadError && (
          <Text c="red" size="sm">
            Could not load raga data: {loadError}
          </Text>
        )}
        {!index && !loadError && (
          <Group gap="sm">
            <Loader size="sm" />
            <Text c="dimmed">Loading 6,229 ragas…</Text>
          </Group>
        )}

        {index && (
          <Box
            style={{
              alignItems: 'start',
              display: 'grid',
              gap: 'var(--mantine-spacing-md)',
              gridTemplateColumns: stackedLayout
                ? 'minmax(0, 1fr)'
                : 'minmax(20rem, 24rem) minmax(0, 1fr)',
            }}
          >
            <Stack gap="md" style={{ minWidth: 0 }}>
              <Surface>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={2} size="h4">
                      Find a raga
                    </Title>
                    <ActionIcon
                      variant="subtle"
                      onClick={randomRaga}
                      title="Pick a random raga"
                      aria-label="Random raga"
                    >
                      🎲
                    </ActionIcon>
                  </Group>
                  <Text size="xs" c="dimmed">
                    Left click a pitch to require it, right click to exclude it, or search/filter
                    the list below.
                  </Text>
                  <Group justify="center">
                    <RingDiagram
                      usedPcs={[]}
                      filterPcs={filterPcs}
                      excludePcs={excludePcs}
                      onTogglePc={toggleFilterPc}
                      onExcludePc={toggleExcludePc}
                      size={180}
                      title="Pitch-class filter"
                    />
                  </Group>
                </Stack>
              </Surface>

              <Surface style={{ display: 'flex', height: '32rem', overflow: 'hidden' }}>
                <RagaList
                  ragas={ragaList}
                  melas={index.melas}
                  filterPcs={filterPcs}
                  excludePcs={excludePcs}
                  selectedVid={selectedRaga?.vid ?? null}
                  onSelect={selectRaga}
                />
              </Surface>
            </Stack>

            <Stack gap="md">
              <Surface>
                {selectedRaga ? (
                  <PlaybackControls
                    settings={settings}
                    set={set}
                    playing={playing}
                    onPlay={play}
                    onStop={stop}
                  />
                ) : (
                  <Text c="dimmed">Select a raga to preview it.</Text>
                )}
              </Surface>

              <Surface>
                {selectedRaga ? (
                  <RagaDetail
                    raga={selectedRaga}
                    index={index}
                    playingNote={playingNote}
                    onSelect={selectRaga}
                  />
                ) : (
                  <Text c="dimmed">No raga selected.</Text>
                )}
              </Surface>
            </Stack>
          </Box>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
