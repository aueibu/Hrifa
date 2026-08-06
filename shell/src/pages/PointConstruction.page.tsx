import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Anchor,
  AppShell,
  Box,
  Button,
  Group,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Link } from 'react-router-dom';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Data } from '../components/Data/Data';
import { Surface } from '../components/Surface/Surface';
import { resolveDiagramStyle } from '../theme/diagram';
import { PointConstructionEngine, type PointConstructionInspector, type PointConstructionSettings } from './point-construction/PointConstructionEngine';

const weightControls = [
  ['wLine', 'Line'],
  ['wArc', 'Arc'],
  ['wCircle', 'Circle'],
  ['wPoint', 'Point'],
] as const;

const pointConstructionSettingsKey = 'hrifa.point-construction.settings.v1';

type SavedPointConstructionSettings = Pick<PointConstructionSettings, 'apex' | 'apexMode' | 'arcCircle' | 'conicWeight' | 'count' | 'curveStyle' | 'grid' | 'guides' | 'labels' | 'motion' | 'nthClosest' | 'tetherLength' | 'weights'>;

const defaultPointConstructionSettings: SavedPointConstructionSettings = {
  apex: 50,
  apexMode: 'ratio',
  arcCircle: false,
  conicWeight: 1,
  count: 11,
  curveStyle: 'circular',
  grid: true,
  guides: true,
  labels: false,
  motion: false,
  nthClosest: 1,
  tetherLength: 48,
  weights: { line: 30, arc: 30, circle: 25, point: 15 },
};

function loadPointConstructionSettings(): SavedPointConstructionSettings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(pointConstructionSettingsKey) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return defaultPointConstructionSettings;
    const candidate = saved as Partial<SavedPointConstructionSettings>;
    if (!candidate.weights || typeof candidate.weights !== 'object') return defaultPointConstructionSettings;
    return { ...defaultPointConstructionSettings, ...candidate, weights: { ...defaultPointConstructionSettings.weights, ...candidate.weights } };
  } catch {
    return defaultPointConstructionSettings;
  }
}

function SliderField({ children, label, value }: { children: ReactNode; label: string; value: ReactNode }) {
  return (
    <Stack gap={4}>
      <Group gap="xs" justify="space-between">
        <Text size="sm">{label}</Text>
        <Data size="sm">{value}</Data>
      </Group>
      {children}
    </Stack>
  );
}

/** Mantine owns presentation; the local engine owns construction mathematics and canvas interaction. */
export function PointConstructionPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PointConstructionEngine | null>(null);
  const [savedSettings] = useState(loadPointConstructionSettings);
  const [pointCount, setPointCount] = useState(savedSettings.count);
  const [nthClosest, setNthClosest] = useState(savedSettings.nthClosest);
  const [apexMode, setApexMode] = useState(savedSettings.apexMode);
  const [curveStyle, setCurveStyle] = useState(savedSettings.curveStyle);
  const [conicWeight, setConicWeight] = useState(savedSettings.conicWeight);
  const [tetherLength, setTetherLength] = useState(savedSettings.tetherLength);
  const [apex, setApex] = useState(savedSettings.apex);
  const [weights, setWeights] = useState({ wLine: savedSettings.weights.line, wArc: savedSettings.weights.arc, wCircle: savedSettings.weights.circle, wPoint: savedSettings.weights.point });
  const [guides, setGuides] = useState(savedSettings.guides);
  const [grid, setGrid] = useState(savedSettings.grid);
  const [labels, setLabels] = useState(savedSettings.labels);
  const [arcCircle, setArcCircle] = useState(savedSettings.arcCircle);
  const [motion, setMotion] = useState(savedSettings.motion);
  const [weightRevision, setWeightRevision] = useState(0);
  const [inspector, setInspector] = useState<PointConstructionInspector | null>(null);
  const stackedLayout = useMediaQuery('(max-width: 1240px)');
  const settings = useMemo<PointConstructionSettings>(() => ({
    count: pointCount,
    nthClosest,
    apexMode,
    curveStyle: curveStyle as PointConstructionSettings['curveStyle'],
    conicWeight,
    weights: { line: weights.wLine, arc: weights.wArc, circle: weights.wCircle, point: weights.wPoint },
    guides,
    grid,
    labels,
    arcCircle,
    tetherLength,
    apex,
    side: 'left',
    motion,
    spiralTurns: 2,
    spiralPhase: 0,
    spiralDirection: 1,
  }), [apex, apexMode, arcCircle, conicWeight, curveStyle, grid, guides, labels, motion, nthClosest, pointCount, tetherLength, weights]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    try {
      localStorage.setItem(pointConstructionSettingsKey, JSON.stringify(settings));
    } catch {
      // The current session still uses its in-memory settings.
    }
  }, [settings]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    const engine = new PointConstructionEngine(canvasRef.current, setInspector, () => resolveDiagramStyle(), settingsRef.current);
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
  }, []);

  useEffect(() => { engineRef.current?.update(settings); }, [settings]);
  useEffect(() => { engineRef.current?.reexecute(); }, [apexMode, nthClosest]);
  useEffect(() => { if (weightRevision) engineRef.current?.reprocess(); }, [weightRevision]);

  const engine = () => engineRef.current;

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
              Point Construction
            </Title>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Generate points, assign geometric roles, and inspect the resulting construction.
          </Text>

          <Box
            style={{
              alignItems: 'start',
              display: 'grid',
              gap: 'var(--mantine-spacing-md)',
              gridTemplateColumns: stackedLayout
                ? 'minmax(0, 1fr)'
                : 'minmax(18rem, 20rem) minmax(34rem, 1fr) minmax(18rem, 20rem)',
            }}
          >
            <Stack gap="md">
              <Surface>
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={2} size="h4">Generation</Title>
                  <Text size="sm" c="dimmed">{pointCount} points</Text>
                </Group>
                <SliderField label="Points" value={pointCount}>
                  <Slider value={pointCount} onChange={setPointCount} min={7} max={15} step={1} />
                </SliderField>
                <Group>
                  <Button onClick={() => { engine()?.update(settingsRef.current); engine()?.regenerate(); }}>New points</Button>
                  <Button variant="default" onClick={() => engine()?.reprocess()}>Re-run</Button>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Switch label="Guides" checked={guides} onChange={(event) => setGuides(event.currentTarget.checked)} />
                  <Switch label="Grid" checked={grid} onChange={(event) => setGrid(event.currentTarget.checked)} />
                  <Switch label="Indices" checked={labels} onChange={(event) => setLabels(event.currentTarget.checked)} />
                  <Switch label="Arc's circle" checked={arcCircle} onChange={(event) => setArcCircle(event.currentTarget.checked)} />
                </SimpleGrid>
              </Stack>
              </Surface>

              <Surface>
              <Stack gap="md">
                <Title order={2} size="h4">Construction rules</Title>
                <SliderField label="Closest partner" value={`${nthClosest}${nthClosest === 1 ? 'st' : nthClosest === 2 ? 'nd' : nthClosest === 3 ? 'rd' : 'th'}`}>
                  <Slider value={nthClosest} onChange={setNthClosest} min={1} max={6} step={1} />
                </SliderField>
                <Select label="Arc apex placement" value={apexMode} onChange={(value) => { if(value) setApexMode(value as 'ratio'|'coincide'); }} data={[{ value: 'ratio', label: 'Pull from l toward m; ratio JM:KM' }, { value: 'coincide', label: 'Coincide with found point (m)' }]} />
                <Select label="Arc curve style" value={curveStyle} onChange={(value) => { if (value) setCurveStyle(value); }} data={[{ value: 'circular', label: 'True circular arc' }, { value: 'bezier', label: 'Quadratic curve' }, { value: 'conic', label: 'Rational conic' }, { value: 'catenary', label: 'Catenary arch' }]} />
                {curveStyle === 'conic' && <SliderField label="Conic weight" value={conicWeight.toFixed(2)}><Slider value={conicWeight} onChange={setConicWeight} min={0.05} max={4} step={0.05} /></SliderField>}
              </Stack>
              </Surface>

              <Surface>
                <Stack gap="md">
                  <Title order={2} size="h4">Type weights</Title>
                  {weightControls.map(([id, label]) => <SliderField key={id} label={`${label} weight`} value={`${weights[id]}%`}><Slider value={weights[id]} onChange={(value) => setWeights((current) => ({ ...current, [id]: value }))} onChangeEnd={(value) => { setWeights((current) => ({ ...current, [id]: value })); setWeightRevision((revision) => revision + 1); }} min={0} max={100} step={1} /></SliderField>)}
                </Stack>
              </Surface>
            </Stack>

            <Surface style={{ alignItems: 'center', display: 'flex', justifyContent: 'center', minWidth: 0 }}>
              <canvas ref={canvasRef} style={{ aspectRatio: '1 / 1', cursor: 'crosshair', display: 'block', width: 'min(100%, calc(100vh - 9rem))' }} />
            </Surface>

            <Stack gap="md">
              <Surface style={{ height: '20rem', overflow: 'hidden' }}>
                <Stack gap="sm">
                  <Title order={2} size="h4">Inspector</Title>
                  <Box>
                    {inspector ? (
                      <>
                        <Text fw={600} size="sm" truncate>{inspector.title}</Text>
                        <Table horizontalSpacing={0} mt="xs" style={{ width: 'fit-content' }} verticalSpacing={4} withColumnBorders withRowBorders>
                          <Table.Tbody>
                            {inspector.rows.map((row) => (
                              <Table.Tr key={row.label}>
                                <Table.Td pr="xs" style={{ whiteSpace: 'nowrap' }}><Text c="dimmed" size="xs" ta="right">{row.label}</Text></Table.Td>
                                <Table.Td pl="xs"><Data size="xs">{row.value}</Data></Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </>
                    ) : (
                      <Text c="dimmed" size="sm">Hover a line, arc, circle, or point to inspect its construction.</Text>
                    )}
                  </Box>
                </Stack>
              </Surface>

              <Surface>
                <Stack gap="md">
                <Title order={2} size="h4">Derivations</Title>
                <Group wrap="wrap">
                    <Button variant="default" onClick={() => engine()?.choose('inversion')}>Pick constant circle or arc</Button>
                    <Button variant="default" onClick={() => engine()?.clear('inversion')}>Clear inversion</Button>
                </Group>
                <Text size="sm" c="dimmed">Rod trace follows the selected lead path through its full displayed extent.</Text>
                <SliderField label="Tether length" value={tetherLength}><Slider value={tetherLength} onChange={setTetherLength} min={12} max={140} step={1} /></SliderField>
                <SliderField label="Apex along lead" value={`${apex}%`}><Slider value={apex} onChange={setApex} min={10} max={90} step={1} /></SliderField>
                <Switch label="Moving pull guide" checked={motion} onChange={(event) => setMotion(event.currentTarget.checked)} />
                <Group wrap="wrap">
                    <Button variant="default" onClick={() => engine()?.choose('rod')}>Pick lead curve</Button>
                    <Button variant="default" onClick={() => engine()?.clear('rod')}>Clear rod trace</Button>
                    <Button variant="default" onClick={() => engine()?.choose('spiral')}>Pick spiral source</Button>
                    <Button variant="default" onClick={() => engine()?.clear('spiral')}>Clear spiral tractrix</Button>
                </Group>
              </Stack>
              </Surface>
            </Stack>
          </Box>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
