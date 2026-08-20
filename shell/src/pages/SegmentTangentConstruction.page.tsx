import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Anchor,
  AppShell,
  Box,
  Button,
  Checkbox,
  Group,
  Radio,
  SimpleGrid,
  Slider,
  Stack,
  Tabs,
  Text,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Data } from '../components/Data/Data';
import { Surface } from '../components/Surface/Surface';
import { resolveSegmentTangentStyle } from '../theme/diagram';
import { PeriodicityBlockPanel } from './segment-tangent-construction/PeriodicityBlockPanel';
import {
  RatioAnalysisPanel,
  type SegmentRatios,
} from './segment-tangent-construction/RatioAnalysisPanel';
import {
  type BoundaryChoice,
  type LayerToggles,
  SegmentTangentRenderer,
  type SegmentTangentReadout,
} from './segment-tangent-construction/SegmentTangentRenderer';

const settingsKey = 'hrifa.segment-tangent-construction.settings.v1';

type RadiusMode = 'uniform' | 'random' | 'manual';
type WidthMode = 'uniform' | 'random' | 'manual';

interface Settings {
  n: number;
  radiusMode: RadiusMode;
  rUniform: number;
  radii: number[];
  widthMode: WidthMode;
  widthWeights: number[];
  boundaryChoice: BoundaryChoice[];
  layers: LayerToggles;
  fillOpacity: number;
  edo: number;
}

const defaultLayers: LayerToggles = {
  rays: true,
  arcs: true,
  perp: true,
  perpOpp: true,
  mid: false,
  radials: false,
  ratios: false,
  reproj: false,
  inversion: false,
  apexTri: false,
  quad: false,
  triCenters: false,
  excircles: false,
  incircle: false,
  boundaryPoly: true,
};

function defaultSettings(): Settings {
  const n = 3;
  return {
    n,
    radiusMode: 'random',
    rUniform: 0.5,
    radii: seedRadii(n, 'random', 0.5, []),
    widthMode: 'uniform',
    widthWeights: seedWidths(n, 'uniform', []),
    boundaryChoice: seedBoundaryChoice(n, []),
    layers: defaultLayers,
    fillOpacity: 15,
    edo: 12,
  };
}

function seedRadii(n: number, mode: RadiusMode, rUniform: number, prev: number[]): number[] {
  if (mode === 'uniform') {
    return new Array(n).fill(rUniform);
  }
  if (mode === 'random') {
    return new Array(n).fill(0).map(() => 0.15 + Math.random() * 0.75);
  }
  return new Array(n).fill(0).map((_, i) => prev[i] ?? 0.5);
}

function seedWidths(n: number, mode: WidthMode, prev: number[]): number[] {
  if (mode === 'uniform') {
    return new Array(n).fill(1);
  }
  if (mode === 'random') {
    return new Array(n).fill(0).map(() => 0.3 + Math.random() * 1.7);
  }
  return new Array(n).fill(0).map((_, i) => prev[i] ?? 1);
}

function seedBoundaryChoice(n: number, prev: BoundaryChoice[]): BoundaryChoice[] {
  return new Array(n).fill(0).map((_, i) => prev[i] ?? 'own');
}

function loadSettings(): Settings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(settingsKey) ?? 'null');
    if (typeof saved !== 'object' || saved === null) {
      return defaultSettings();
    }
    const merged = { ...defaultSettings(), ...(saved as Partial<Settings>) };
    if (merged.radii.length !== merged.n) {
      merged.radii = seedRadii(merged.n, merged.radiusMode, merged.rUniform, merged.radii);
    }
    if (merged.widthWeights.length !== merged.n) {
      merged.widthWeights = seedWidths(merged.n, merged.widthMode, merged.widthWeights);
    }
    if (merged.boundaryChoice.length !== merged.n) {
      merged.boundaryChoice = seedBoundaryChoice(merged.n, merged.boundaryChoice);
    }
    return merged;
  } catch {
    return defaultSettings();
  }
}

function LayerCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox checked={checked} label={label} onChange={(e) => onChange(e.currentTarget.checked)} />
  );
}

export function SegmentTangentConstructionPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SegmentTangentRenderer | null>(null);

  const [s, setS] = useState<Settings>(loadSettings);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));
  const setLayer = <K extends keyof LayerToggles>(key: K, value: LayerToggles[K]) =>
    setS((prev) => ({ ...prev, layers: { ...prev.layers, [key]: value } }));

  const [readout, setReadout] = useState<SegmentTangentReadout | null>(null);

  const scheme = useComputedColorScheme('light');
  const stackedLayout = useMediaQuery('(max-width: 1280px)');

  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(s));
    } catch {
      // The current session keeps its in-memory settings.
    }
  }, [s]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    const renderer = new SegmentTangentRenderer(
      canvasRef.current,
      () => resolveSegmentTangentStyle(),
      {
        onReadout: setReadout,
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
    rendererRef.current?.setScene({
      n: s.n,
      radii: s.radii,
      widthWeights: s.widthWeights,
      boundaryChoice: s.boundaryChoice,
      layers: s.layers,
      fillOpacity: s.fillOpacity / 100,
    });
  }, [s.n, s.radii, s.widthWeights, s.boundaryChoice, s.layers, s.fillOpacity]);

  useEffect(() => {
    rendererRef.current?.restyle();
  }, [scheme]);

  const letters = useMemo(
    () => Array.from({ length: s.n }, (_, i) => String.fromCharCode(65 + i)),
    [s.n]
  );

  const segments = useMemo<SegmentRatios[]>(() => {
    if (!readout) {
      return letters.map((letter) => ({ letter, arcVals: [], chordVals: [] }));
    }
    return readout.segGroups.map((group, i) => {
      const sorted = [...group].sort((a, b) => a.ratioArc - b.ratioArc);
      const sortedChord = group
        .filter((g) => g.tangentChord !== null)
        .sort((a, b) => (a.tangentChord as number) - (b.tangentChord as number));
      return {
        letter: readout.letters[i],
        arcVals: sorted.map((g) => g.ratioArc),
        chordVals: sortedChord.map((g) => g.tangentChord as number),
      };
    });
  }, [readout, letters]);

  const changeN = (n: number) => {
    setS((prev) => ({
      ...prev,
      n,
      radii: seedRadii(n, prev.radiusMode, prev.rUniform, prev.radii),
      widthWeights: seedWidths(n, prev.widthMode, prev.widthWeights),
      boundaryChoice: seedBoundaryChoice(n, prev.boundaryChoice),
    }));
  };

  const changeRadiusMode = (mode: RadiusMode) => {
    setS((prev) => ({
      ...prev,
      radiusMode: mode,
      radii: seedRadii(prev.n, mode, prev.rUniform, prev.radii),
    }));
  };

  const changeWidthMode = (mode: WidthMode) => {
    setS((prev) => ({
      ...prev,
      widthMode: mode,
      widthWeights: seedWidths(prev.n, mode, prev.widthWeights),
    }));
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
              Segment Tangent Construction
            </Title>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Outer circle divided into n equal-or-unequal segments by rays from center. Each segment
            carries an arc at its own radius; at each end, the line continues straight &mdash;
            tangent to the arc, perpendicular to the boundary ray &mdash; out to the outer circle.
            Hover a segment to preview it; click to lock focus.
          </Text>

          <Tabs defaultValue="circle" keepMounted>
            <Tabs.List>
              <Tabs.Tab value="circle">Circle Design</Tabs.Tab>
              <Tabs.Tab value="periodicity">Periodicity &amp; Sound</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="circle" pt="md">
              <Box
                style={{
                  alignItems: 'start',
                  display: 'grid',
                  gap: 'var(--mantine-spacing-md)',
                  gridTemplateColumns: stackedLayout
                    ? 'minmax(0, 1fr)'
                    : 'minmax(19rem, 21rem) minmax(24rem, 1fr) minmax(19rem, 21rem)',
                }}
              >
                <Stack gap="md">
                  <Surface>
                    <Stack gap="md">
                      <Title order={2} size="h4">
                        Segments
                      </Title>
                      <Stack gap={4}>
                        <Group gap="xs" justify="space-between">
                          <Text size="sm">n</Text>
                          <Data size="sm">{s.n}</Data>
                        </Group>
                        <Slider value={s.n} onChange={changeN} min={2} max={16} step={1} />
                      </Stack>
                    </Stack>
                  </Surface>

                  <Surface>
                    <Stack gap="md">
                      <Title order={2} size="h4">
                        Arc radius
                      </Title>
                      <Radio.Group
                        value={s.radiusMode}
                        onChange={(v) => changeRadiusMode(v as RadiusMode)}
                      >
                        <Group gap="md">
                          <Radio value="uniform" label="Uniform" />
                          <Radio value="random" label="Random" />
                          <Radio value="manual" label="Manual" />
                        </Group>
                      </Radio.Group>
                      {s.radiusMode === 'uniform' && (
                        <Stack gap={4}>
                          <Group gap="xs" justify="space-between">
                            <Text size="sm">r</Text>
                            <Data size="sm">{s.rUniform.toFixed(2)}</Data>
                          </Group>
                          <Slider
                            value={s.rUniform}
                            onChange={(v) => {
                              set('rUniform', v);
                              set('radii', new Array(s.n).fill(v));
                            }}
                            min={0.05}
                            max={0.95}
                            step={0.01}
                          />
                        </Stack>
                      )}
                      {s.radiusMode === 'random' && (
                        <Button
                          variant="default"
                          onClick={() =>
                            set('radii', seedRadii(s.n, 'random', s.rUniform, s.radii))
                          }
                        >
                          Reseed
                        </Button>
                      )}
                      {s.radiusMode === 'manual' && (
                        <Stack gap="xs">
                          {letters.map((letter, i) => (
                            <Stack key={letter} gap={2}>
                              <Group gap="xs" justify="space-between">
                                <Text size="sm">segment {letter}</Text>
                                <Data size="xs">
                                  {s.radii[i]?.toFixed(2)} (area{' '}
                                  {Math.round((s.radii[i] ?? 0) ** 2 * 100)}%)
                                </Data>
                              </Group>
                              <Slider
                                value={s.radii[i] ?? 0.5}
                                onChange={(v) => {
                                  const next = [...s.radii];
                                  next[i] = v;
                                  set('radii', next);
                                }}
                                min={0.05}
                                max={0.95}
                                step={0.01}
                              />
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </Surface>

                  <Surface>
                    <Stack gap="md">
                      <Title order={2} size="h4">
                        Segment angles
                      </Title>
                      <Text c="dimmed" size="xs">
                        Unequal angular widths break the symmetry that collapses distinct ratio
                        values into repeats.
                      </Text>
                      <Radio.Group
                        value={s.widthMode}
                        onChange={(v) => changeWidthMode(v as WidthMode)}
                      >
                        <Group gap="md">
                          <Radio value="uniform" label="Uniform" />
                          <Radio value="random" label="Random" />
                          <Radio value="manual" label="Manual" />
                        </Group>
                      </Radio.Group>
                      {s.widthMode === 'random' && (
                        <Button
                          variant="default"
                          onClick={() =>
                            set('widthWeights', seedWidths(s.n, 'random', s.widthWeights))
                          }
                        >
                          Reseed angles
                        </Button>
                      )}
                      {s.widthMode === 'manual' && (
                        <Stack gap="xs">
                          {letters.map((letter, i) => {
                            const total = s.widthWeights.reduce((a, b) => a + b, 0) || 1;
                            const pct = ((s.widthWeights[i] ?? 1) / total) * 100;
                            return (
                              <Stack key={letter} gap={2}>
                                <Group gap="xs" justify="space-between">
                                  <Text size="sm">segment {letter}</Text>
                                  <Data size="xs">
                                    {pct.toFixed(1)}% ({(pct * 3.6).toFixed(0)}&deg;)
                                  </Data>
                                </Group>
                                <Slider
                                  value={s.widthWeights[i] ?? 1}
                                  onChange={(v) => {
                                    const next = [...s.widthWeights];
                                    next[i] = v;
                                    set('widthWeights', next);
                                  }}
                                  min={0.2}
                                  max={3}
                                  step={0.05}
                                />
                              </Stack>
                            );
                          })}
                        </Stack>
                      )}
                    </Stack>
                  </Surface>

                  <Surface>
                    <Stack gap="md">
                      <Title order={2} size="h4">
                        Layers
                      </Title>
                      <Stack gap="xs">
                        <LayerCheckbox
                          checked={s.layers.rays}
                          label="Segment boundaries"
                          onChange={(v) => setLayer('rays', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.arcs}
                          label="Arcs"
                          onChange={(v) => setLayer('arcs', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.perp}
                          label="Tangent lines to outer circle"
                          onChange={(v) => setLayer('perp', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.perpOpp}
                          label="Opposite direction"
                          onChange={(v) => setLayer('perpOpp', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.mid}
                          label="Midpoint polygon"
                          onChange={(v) => setLayer('mid', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.radials}
                          label="Boundary-parallel returns"
                          onChange={(v) => setLayer('radials', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.ratios}
                          label="Ratio labels &amp; markers"
                          onChange={(v) => setLayer('ratios', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.reproj}
                          label="Chord-point reprojection"
                          onChange={(v) => setLayer('reproj', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.inversion}
                          label="Inversive duals"
                          onChange={(v) => setLayer('inversion', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.apexTri}
                          label="Purple-apex / blue-chord triangles"
                          onChange={(v) => setLayer('apexTri', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.quad}
                          label="Blue-chord / purple-chord quadrilateral"
                          onChange={(v) => setLayer('quad', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.triCenters}
                          label="Triangle centers"
                          onChange={(v) => setLayer('triCenters', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.excircles}
                          label="Excircles"
                          onChange={(v) => setLayer('excircles', v)}
                        />
                        <LayerCheckbox
                          checked={s.layers.incircle}
                          label="Incircle"
                          onChange={(v) => setLayer('incircle', v)}
                        />
                      </Stack>
                      <Stack gap={4}>
                        <Group gap="xs" justify="space-between">
                          <Text size="sm">Shape fill opacity</Text>
                          <Data size="sm">{s.fillOpacity}%</Data>
                        </Group>
                        <Slider
                          value={s.fillOpacity}
                          onChange={(v) => set('fillOpacity', v)}
                          min={0}
                          max={100}
                          step={1}
                        />
                      </Stack>
                    </Stack>
                  </Surface>
                </Stack>

                <Surface style={{ minWidth: 0 }}>
                  <canvas
                    ref={canvasRef}
                    style={{ aspectRatio: '1 / 1', display: 'block', width: '100%' }}
                  />
                </Surface>

                <Stack gap="md">
                  <Surface>
                    <Stack gap="md">
                      <Title order={2} size="h4">
                        Boundary-selection polygon
                      </Title>
                      <Text c="dimmed" size="xs">
                        At each of the n boundaries, two arc-crossing points exist &mdash; one from
                        each adjacent segment&apos;s own arc. Pick one per boundary; connecting the
                        chosen points traces a new polygon.
                      </Text>
                      <LayerCheckbox
                        checked={s.layers.boundaryPoly}
                        label="Show polygon"
                        onChange={(v) => setLayer('boundaryPoly', v)}
                      />
                      <SimpleGrid cols={2}>
                        {letters.map((letter, i) => (
                          <Button
                            key={letter}
                            size="xs"
                            variant="default"
                            onClick={() => {
                              const next = [...s.boundaryChoice];
                              next[i] = next[i] === 'own' ? 'neighbor' : 'own';
                              set('boundaryChoice', next);
                            }}
                          >
                            boundary {i}: {s.boundaryChoice[i]}
                          </Button>
                        ))}
                      </SimpleGrid>
                      <Text c="dimmed" size="xs">
                        {readout?.triCross
                          ? `Segment ${readout.triCross.segLetter}'s triangle crosses polygon [${readout.triCross.code}] edges ${readout.triCross.count} time${readout.triCross.count === 1 ? '' : 's'}.`
                          : 'Hover or click a segment to check its triangle against this polygon.'}
                      </Text>
                    </Stack>
                  </Surface>

                  <Surface>
                    <Stack gap="sm">
                      <Title order={2} size="h4">
                        Counts
                      </Title>
                      {readout &&
                        letters.map((letter, i) => (
                          <Group key={letter} gap="xs" justify="space-between">
                            <Text c="dimmed" size="xs">
                              segment {letter}
                            </Text>
                            <Data size="xs">{readout.counts[i]} points</Data>
                          </Group>
                        ))}
                    </Stack>
                  </Surface>
                </Stack>
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="periodicity" pt="md">
              <Stack gap="md">
                <RatioAnalysisPanel
                  segments={segments}
                  edo={s.edo}
                  onEdoChange={(edo) => set('edo', edo)}
                />
                <PeriodicityBlockPanel segments={segments} edo={s.edo} />
                <Surface>
                  <Text c="dimmed" size="sm">
                    The shift map, lattice diagram, and sonification controls land here next.
                  </Text>
                </Surface>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
