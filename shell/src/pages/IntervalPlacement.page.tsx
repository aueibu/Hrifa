import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Anchor,
  AppShell,
  Box,
  Group,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Surface } from '../components/Surface/Surface';
import { resolveIntervalPlacementStyle } from '../theme/diagram';
import { FretboardView } from './interval-placement/components/FretboardView';
import { HoverInfoPanel } from './interval-placement/components/HoverInfoPanel';
import { IntervalClassGrid } from './interval-placement/components/IntervalClassGrid';
import { IntervalCountsPanel } from './interval-placement/components/IntervalCountsPanel';
import { KeyboardView } from './interval-placement/components/KeyboardView';
import { PlacementForm } from './interval-placement/components/PlacementForm';
import { PlaybackControls } from './interval-placement/components/PlaybackControls';
import { ResultsList } from './interval-placement/components/ResultsList';
import { ScoringInfoModal } from './interval-placement/components/ScoringInfoModal';
import { computeIntervalPlacements, getBaseMidi } from './interval-placement/engine';
import { computeHoverCounts, formatHoverCounts } from './interval-placement/hoverCounts';
import { IntervalPlotRenderer } from './interval-placement/IntervalPlotRenderer';
import { loadSettings, saveSettings, toParams, type Settings } from './interval-placement/settings';

export function IntervalPlacementPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IntervalPlotRenderer | null>(null);

  const [s, setS] = useState<Settings>(loadSettings);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  // Identity, not position: `records` re-sorts whenever a placement
  // parameter changes, so tracking the selection by index would silently
  // swap it to whatever now sits at that position. A permutation is stable
  // identity for a record as long as the interval set itself hasn't
  // changed, so track that instead and re-resolve its current index below.
  const [selectedPerm, setSelectedPerm] = useState<number[] | null>(null);
  const [hoverPitch, setHoverPitch] = useState<number | null>(null);
  const [scoringInfoOpened, { open: openScoringInfo, close: closeScoringInfo }] =
    useDisclosure(false);

  const scheme = useComputedColorScheme('light');
  // Re-read each render (cheap, DOM-backed) so it stays current when scheme
  // changes — matches the plain-call pattern other ported pages use for
  // their `resolve*Style()` calls (see e.g. LatticeDiagram.tsx).
  const plotStyle = resolveIntervalPlacementStyle();
  const stackedLayout = useMediaQuery('(max-width: 1280px)');

  useEffect(() => {
    saveSettings(s);
  }, [s]);

  const params = useMemo(() => toParams(s), [s]);
  const result = useMemo(
    () => computeIntervalPlacements(s.intervals, params, s.oddBias, s.windowOctaves),
    [s.intervals, params, s.oddBias, s.windowOctaves]
  );
  const selectedPermKey = selectedPerm ? selectedPerm.join(',') : null;
  const foundIndex =
    selectedPermKey === null
      ? -1
      : result.records.findIndex((r) => r.perm.join(',') === selectedPermKey);
  const clampedIndex = foundIndex >= 0 ? foundIndex : 0;
  const selectedRecord = result.records[clampedIndex] ?? null;
  const baseMidi = getBaseMidi(s.baseNote, s.baseOctave);
  const hoverCounts = useMemo(
    () => computeHoverCounts(selectedRecord?.pitches ?? [], hoverPitch),
    [selectedRecord, hoverPitch]
  );

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    const renderer = new IntervalPlotRenderer(
      canvasRef.current,
      () => resolveIntervalPlacementStyle(),
      {
        onHoverPitch: setHoverPitch,
      }
    );
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setScene(
      selectedRecord
        ? {
            record: selectedRecord,
            L: result.L,
            edoSteps: s.edoSteps,
            params,
            oddBias: result.oddBias,
          }
        : null
    );
  }, [selectedRecord, result.L, result.oddBias, s.edoSteps, params]);

  useEffect(() => {
    rendererRef.current?.setHoverPitch(hoverPitch);
  }, [hoverPitch]);

  useEffect(() => {
    rendererRef.current?.restyle();
  }, [scheme]);

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
              Interval Placement
            </Title>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Enter a set of intervals; every unique permutation is placed in a pitch window under the
            chosen placement strategy and ranked by a roughness/ratio dissonance model. Select a
            voicing to inspect it, and hover a pitch to cross-highlight it across the plot,
            keyboard, fretboard, and interval counts.
          </Text>

          <Box
            style={{
              alignItems: 'start',
              display: 'grid',
              gap: 'var(--mantine-spacing-md)',
              gridTemplateColumns: stackedLayout
                ? 'minmax(0, 1fr)'
                : 'minmax(18rem, 22rem) minmax(20rem, 1fr) minmax(28rem, 2fr)',
            }}
          >
            {/*
              Column 1: controls, then results underneath — results stays
              this column's width, it doesn't span wide like the panels in
              column 3 do. `minWidth: 0` keeps the track pinned to its
              `minmax(18rem, 22rem)` track size regardless of what's inside
              — without it, a grid item's default `min-width: auto` lets its
              own content (e.g. a wide row inside the Controls panel once
              expanded) force the column wider than that max, which is what
              was shifting columns 2/3 when Controls toggled open.
            */}
            <Stack gap="md" style={{ minWidth: 0 }}>
              <PlacementForm settings={s} set={set} />

              <Surface style={{ display: 'flex', height: '24rem', overflow: 'hidden' }}>
                <Stack gap="sm" style={{ height: '100%', width: '100%', minHeight: 0 }}>
                  <Group gap="xs">
                    <Title order={2} size="h4">
                      Results ({result.records.length})
                    </Title>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      radius="xl"
                      aria-label="Scoring reference"
                      title="How these scores are computed"
                      onClick={openScoringInfo}
                    >
                      i
                    </ActionIcon>
                  </Group>
                  <ResultsList
                    records={result.records}
                    selectedPerm={selectedRecord?.perm ?? null}
                    onSelect={setSelectedPerm}
                  />
                </Stack>
              </Surface>
            </Stack>

            {/* Column 2: plot only. */}
            <Stack gap="md">
              <Surface>
                <Stack gap="sm">
                  <Title order={2} size="h4">
                    Plot
                  </Title>
                  {selectedRecord && (
                    <Text size="sm" ff="monospace">
                      {selectedRecord.perm.join(' ')}
                    </Text>
                  )}
                  <PlaybackControls
                    pitches={selectedRecord?.pitches ?? []}
                    endpoints={selectedRecord?.endpoints ?? []}
                    baseMidi={baseMidi}
                    edoSteps={s.edoSteps}
                  />
                  <canvas
                    ref={canvasRef}
                    style={{
                      width: '100%',
                      height: '45rem',
                      display: 'block',
                      borderRadius: 4,
                      border: '1px solid var(--mantine-color-default-border)',
                    }}
                  />
                </Stack>
              </Surface>
            </Stack>

            {/* Column 3: hover info + keyboard sharing a row (25:75), then keyboard's usual partner fretboard, then interval counts. */}
            <Stack gap="md">
              <Box
                style={{
                  display: 'grid',
                  gap: 'var(--mantine-spacing-md)',
                  gridTemplateColumns: stackedLayout ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 3fr)',
                }}
              >
                <Surface>
                  <Stack gap="sm">
                    <Title order={2} size="h4">
                      Hover info
                    </Title>
                    <Box style={{ height: '10rem', overflowY: 'auto' }}>
                      <HoverInfoPanel
                        record={selectedRecord}
                        hoverPitch={hoverPitch}
                        L={result.L}
                        params={params}
                        isDark={scheme === 'dark'}
                      />
                    </Box>
                  </Stack>
                </Surface>

                <Surface>
                  <Stack gap="sm">
                    <Title order={2} size="h4">
                      Keyboard
                    </Title>
                    <KeyboardView
                      pitches={selectedRecord?.pitches ?? []}
                      hoverPitch={hoverPitch}
                      baseMidi={baseMidi}
                      windowSteps={result.L}
                      edoSteps={s.edoSteps}
                      style={plotStyle}
                      onHoverPitch={setHoverPitch}
                    />
                  </Stack>
                </Surface>
              </Box>

              <Surface>
                <Stack gap="sm">
                  <Title order={2} size="h4">
                    Fretboard
                  </Title>
                  <FretboardView
                    pitches={selectedRecord?.pitches ?? []}
                    hoverPitch={hoverPitch}
                    baseMidi={baseMidi}
                    edoSteps={s.edoSteps}
                    tuning={s.guitarTuning}
                    style={plotStyle}
                    onHoverPitch={setHoverPitch}
                  />
                </Stack>
              </Surface>

              <Surface>
                <Stack gap="sm">
                  <Title order={2} size="h4">
                    Interval counts
                  </Title>
                  {/*
                    Fixed height, not auto: this panel's content (the
                    interval-class grid, the induced-interval chips) grows
                    and shrinks with the selected voicing and the hovered
                    pitch. Left auto, it would resize on every hover,
                    visibly shifting the fretboard/keyboard above and
                    whatever follows below. A stock height sized to fit the
                    grid, with overflow as a backstop, keeps it still.
                  */}
                  <Box style={{ height: '20rem', overflowY: 'auto' }}>
                    {selectedRecord ? (
                      <Stack gap="sm">
                        <IntervalClassGrid
                          record={selectedRecord}
                          L={result.L}
                          edoSteps={s.edoSteps}
                          hoverCounts={hoverCounts}
                          isDark={scheme === 'dark'}
                        />
                        <IntervalCountsPanel
                          record={selectedRecord}
                          edoSteps={s.edoSteps}
                          hoverCounts={hoverCounts}
                          isDark={scheme === 'dark'}
                        />
                        <Text size="xs" c="dimmed" ff="monospace">
                          {formatHoverCounts(hoverCounts)}
                        </Text>
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed">
                        No selection.
                      </Text>
                    )}
                  </Box>
                </Stack>
              </Surface>
            </Stack>
          </Box>
        </Stack>
      </AppShell.Main>
      <ScoringInfoModal opened={scoringInfoOpened} onClose={closeScoringInfo} />
    </AppShell>
  );
}
