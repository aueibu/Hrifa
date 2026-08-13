import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Anchor,
  AppShell,
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Data } from '../components/Data/Data';
import { Surface } from '../components/Surface/Surface';
import { SOLIDS, type SolidClass, solidClasses, solidsForClass } from '../data/polyhedra';
import { resolveGrowthTreeStyle, resolveSolidViewStyle } from '../theme/diagram';
import {
  type ChildFormula,
  type GrowthParams,
  type QFormula,
  sampleOrigins,
  type SampleStats,
  type SearchMode,
} from './radial-growth-tree/growthEngine';
import {
  GrowthTreeRenderer,
  type HoverInfo,
  type ReadoutInfo,
} from './radial-growth-tree/GrowthTreeRenderer';
import {
  buildPointField,
  type GrowLayer,
  type PointField,
} from './radial-growth-tree/pointPlacement';
import { SolidView } from './radial-growth-tree/SolidView';

const settingsKey = 'hrifa.radial-growth-tree.settings.v1';

interface Settings {
  solidClass: SolidClass;
  solidKey: string;
  srcVertices: boolean;
  srcEdges: boolean;
  srcFaces: boolean;
  n: number;
  t: number;
  matA: number;
  matB: number;
  matC: number;
  matD: number;
  growFrom: GrowLayer;
  autoRotate: boolean;
  showDropLines: boolean;
  wrap: boolean;
  helpers: boolean;
  grid: boolean;
  qFormula: QFormula;
  childFormula: ChildFormula;
  maxDepth: number;
  searchMode: SearchMode;
  stepDeg: number;
  maxDeg: number;
  excludeDeg: number;
  spanDeg: number;
  annealed: boolean;
  excludeVisited: boolean;
  maxBranches: number;
  branchDensity: number;
  shareVisited: boolean;
}

const defaultSettings: Settings = {
  solidClass: 'Platonic',
  solidKey: 'tetrahedron',
  srcVertices: true,
  srcEdges: false,
  srcFaces: false,
  n: 32,
  t: 10,
  matA: 1,
  matB: 1,
  matC: 1,
  matD: 2,
  growFrom: 'accumulated',
  autoRotate: true,
  showDropLines: true,
  wrap: true,
  helpers: true,
  grid: false,
  qFormula: 'OP',
  childFormula: 'P',
  maxDepth: 12,
  searchMode: 'widen',
  stepDeg: 10,
  maxDeg: 50,
  excludeDeg: 20,
  spanDeg: 90,
  annealed: false,
  excludeVisited: false,
  maxBranches: 1,
  branchDensity: 0.125,
  shareVisited: false,
};

function loadSettings(): Settings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(settingsKey) ?? 'null');
    if (typeof saved !== 'object' || saved === null) {
      return defaultSettings;
    }
    const merged = { ...defaultSettings, ...(saved as Partial<Settings>) };
    // Guard against a stored solid key that no longer exists in the dataset.
    if (!SOLIDS[merged.solidKey]) {
      merged.solidKey = solidsForClass(merged.solidClass)[0]?.[0] ?? 'tetrahedron';
    }
    return merged;
  } catch {
    return defaultSettings;
  }
}

const qFormulaOptions: { value: QFormula; label: string }[] = [
  { value: 'OP', label: 'r(O)·r(P)' },
  { value: 'OPSUM', label: 'r(O)+r(P)' },
  { value: 'DIASUM', label: '2·(r(O)+r(P))' },
  { value: 'OP2', label: '(r(O)·r(P))²' },
  { value: 'P2', label: 'r(P)²' },
  { value: 'O3', label: 'r(O)³' },
];
const childFormulaOptions: { value: ChildFormula; label: string }[] = [
  { value: 'P', label: 'r(P)' },
  { value: '2P', label: '2·r(P)' },
  { value: 'P2', label: 'r(P)²' },
  { value: 'OP', label: 'r(O)·r(P)' },
];
const qFormulaLabel = (v: QFormula) => qFormulaOptions.find((o) => o.value === v)!.label;
const childFormulaLabel = (v: ChildFormula) =>
  childFormulaOptions.find((o) => o.value === v)!.label;

function SliderField({
  children,
  label,
  value,
}: {
  children: ReactNode;
  label: string;
  value: ReactNode;
}) {
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

function ReadoutRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Group gap="xs" justify="space-between" wrap="nowrap">
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      <Data size="xs">{value}</Data>
    </Group>
  );
}

/** Mantine owns presentation; local engines own the growth mathematics, canvas rendering, and 3D view. */
export function RadialGrowthTreePage() {
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const canvas3dRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GrowthTreeRenderer | null>(null);
  const solidRef = useRef<SolidView | null>(null);

  const [s, setS] = useState<Settings>(loadSettings);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const [fieldResult, setFieldResult] = useState<PointField>({
    points: [],
    seedCount: 0,
    trueGroupCount: 0,
    rawPointCount: 0,
  });
  const [readout, setReadout] = useState<ReadoutInfo | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [sample, setSample] = useState<SampleStats | null>(null);

  const scheme = useComputedColorScheme('light');
  const stackedLayout = useMediaQuery('(max-width: 1280px)');

  const solid = SOLIDS[s.solidKey];
  const hasFaces = !!solid?.faces;
  const effectiveFaces = s.srcFaces && hasFaces;
  const solidOptions = useMemo(
    () => solidsForClass(s.solidClass).map(([key, solid]) => ({ value: key, label: solid.label })),
    [s.solidClass]
  );

  const growthParams = useMemo<GrowthParams>(
    () => ({
      wrap: s.wrap,
      qFormula: s.qFormula,
      childFormula: s.childFormula,
      maxDepth: s.maxDepth,
      searchMode: s.searchMode,
      stepDeg: s.stepDeg,
      maxDeg: s.maxDeg,
      excludeDeg: s.excludeDeg,
      spanDeg: s.spanDeg,
      annealed: s.annealed,
      excludeVisited: s.excludeVisited,
      maxBranches: s.maxBranches,
      branchDensity: s.branchDensity,
      shareVisited: s.shareVisited,
    }),
    [
      s.wrap,
      s.qFormula,
      s.childFormula,
      s.maxDepth,
      s.searchMode,
      s.stepDeg,
      s.maxDeg,
      s.excludeDeg,
      s.spanDeg,
      s.annealed,
      s.excludeVisited,
      s.maxBranches,
      s.branchDensity,
      s.shareVisited,
    ]
  );

  // Persist all settings.
  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(s));
    } catch {
      // The current session keeps its in-memory settings.
    }
  }, [s]);

  // Create the engines once. Declared first so later effects see the refs.
  useEffect(() => {
    if (!canvas2dRef.current || !canvas3dRef.current) {
      return;
    }
    const renderer = new GrowthTreeRenderer(canvas2dRef.current, () => resolveGrowthTreeStyle(), {
      onReadout: setReadout,
      onHover: setHover,
    });
    const solid = new SolidView(canvas3dRef.current, () => resolveSolidViewStyle());
    solid.onAutoRotateOff = () => set('autoRotate', false);
    rendererRef.current = renderer;
    solidRef.current = solid;
    return () => {
      renderer.destroy();
      solid.destroy();
      rendererRef.current = null;
      solidRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Point-source tier: rebuild the field (full pipeline) and push it to the 2D renderer.
  useEffect(() => {
    const field = buildPointField(
      s.solidKey,
      s.n,
      { vertices: s.srcVertices, edges: s.srcEdges, faces: effectiveFaces },
      s.t,
      { a: s.matA, b: s.matB, c: s.matC, d: s.matD },
      s.growFrom
    );
    setFieldResult(field);
    rendererRef.current?.setField(field.points, s.n);
  }, [
    s.solidKey,
    s.n,
    s.t,
    s.matA,
    s.matB,
    s.matC,
    s.matD,
    s.srcVertices,
    s.srcEdges,
    effectiveFaces,
    s.growFrom,
  ]);

  // Point-source tier: rebuild the 3D scene (only its real deps — not t/matrix/growFrom).
  useEffect(() => {
    solidRef.current?.update({
      solidKey: s.solidKey,
      n: s.n,
      opts: { vertices: s.srcVertices, edges: s.srcEdges, faces: effectiveFaces },
      showDropLines: s.showDropLines,
    });
  }, [s.solidKey, s.n, s.srcVertices, s.srcEdges, effectiveFaces, s.showDropLines]);

  // Growth-only tier: re-run the walk + redraw the 2D canvas; 3D scene untouched.
  useEffect(() => {
    rendererRef.current?.setParams(growthParams, s.helpers, s.grid);
  }, [growthParams, s.helpers, s.grid]);

  useEffect(() => {
    solidRef.current?.setAutoRotate(s.autoRotate);
  }, [s.autoRotate]);

  // Re-resolve theme colors on color-scheme change.
  useEffect(() => {
    rendererRef.current?.restyle();
    solidRef.current?.restyle();
  }, [scheme]);

  const changeClass = (klass: SolidClass) => {
    const first = solidsForClass(klass)[0]?.[0];
    setS((prev) => ({ ...prev, solidClass: klass, solidKey: first ?? prev.solidKey }));
  };

  const result = readout?.result ?? null;
  const emptyField = fieldResult.points.length === 0;

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
              Radial Growth Tree
            </Title>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Project a polyhedron onto a toroidal lattice, optionally mix it with a cat-map, then
            grow a directed-ray tree from a chosen origin. Ctrl+click a point to reseat the origin;
            drag to pan; scroll to zoom.
          </Text>

          <Box
            style={{
              alignItems: 'start',
              display: 'grid',
              gap: 'var(--mantine-spacing-md)',
              gridTemplateColumns: stackedLayout
                ? 'minmax(0, 1fr)'
                : 'minmax(19rem, 21rem) minmax(30rem, 1fr) minmax(18rem, 20rem)',
            }}
          >
            {/* ---- Left: controls ---- */}
            <Stack gap="md">
              <Surface>
                <Stack gap="md">
                  <Title order={2} size="h4">
                    Point source
                  </Title>
                  <Select
                    label="Solid class"
                    value={s.solidClass}
                    onChange={(v) => v && changeClass(v as SolidClass)}
                    data={solidClasses.map((c) => ({ value: c, label: c }))}
                  />
                  <Select
                    label="Solid"
                    value={s.solidKey}
                    onChange={(v) => v && set('solidKey', v)}
                    data={solidOptions}
                    searchable
                  />
                  <SimpleGrid cols={3}>
                    <Switch
                      label="Vertices"
                      checked={s.srcVertices}
                      onChange={(e) => set('srcVertices', e.currentTarget.checked)}
                    />
                    <Switch
                      label="Edges"
                      checked={s.srcEdges}
                      onChange={(e) => set('srcEdges', e.currentTarget.checked)}
                    />
                    <Switch
                      label="Faces"
                      checked={effectiveFaces}
                      disabled={!hasFaces}
                      onChange={(e) => set('srcFaces', e.currentTarget.checked)}
                    />
                  </SimpleGrid>
                  {!hasFaces && (
                    <Text c="dimmed" size="xs">
                      This solid has no face data (Catalan solids carry vertices and edges only).
                    </Text>
                  )}
                  <SliderField label="Grid size (N)" value={s.n}>
                    <Slider value={s.n} onChange={(v) => set('n', v)} min={8} max={96} step={1} />
                  </SliderField>
                  <SliderField label="Iterations (t)" value={s.t}>
                    <Slider value={s.t} onChange={(v) => set('t', v)} min={0} max={80} step={1} />
                  </SliderField>
                  <Text size="sm">Mixing matrix</Text>
                  <SimpleGrid cols={2}>
                    <NumberInput
                      label="a"
                      value={s.matA}
                      onChange={(v) => set('matA', Math.round(Number(v) || 0))}
                      allowDecimal={false}
                    />
                    <NumberInput
                      label="b"
                      value={s.matB}
                      onChange={(v) => set('matB', Math.round(Number(v) || 0))}
                      allowDecimal={false}
                    />
                    <NumberInput
                      label="c"
                      value={s.matC}
                      onChange={(v) => set('matC', Math.round(Number(v) || 0))}
                      allowDecimal={false}
                    />
                    <NumberInput
                      label="d"
                      value={s.matD}
                      onChange={(v) => set('matD', Math.round(Number(v) || 0))}
                      allowDecimal={false}
                    />
                  </SimpleGrid>
                  <Button
                    variant="default"
                    onClick={() =>
                      setS((prev) => ({ ...prev, matA: 1, matB: 1, matC: 1, matD: 2 }))
                    }
                  >
                    Reset matrix
                  </Button>
                  <Select
                    label="Grow tree from"
                    value={s.growFrom}
                    onChange={(v) => v && set('growFrom', v as GrowLayer)}
                    data={[
                      { value: 'seed', label: 'Seed (t = 0)' },
                      { value: 'final', label: 'Final frame (t)' },
                      { value: 'accumulated', label: 'Accumulated (0…t)' },
                    ]}
                  />
                  <SimpleGrid cols={2}>
                    <Switch
                      label="Auto-rotate"
                      checked={s.autoRotate}
                      onChange={(e) => set('autoRotate', e.currentTarget.checked)}
                    />
                    <Switch
                      label="Drop lines"
                      checked={s.showDropLines}
                      onChange={(e) => set('showDropLines', e.currentTarget.checked)}
                    />
                  </SimpleGrid>
                </Stack>
              </Surface>

              <Surface>
                <Stack gap="md">
                  <Title order={2} size="h4">
                    Growth
                  </Title>
                  <SimpleGrid cols={2}>
                    <Switch
                      label="Toroidal wrap"
                      checked={s.wrap}
                      onChange={(e) => set('wrap', e.currentTarget.checked)}
                    />
                    <Switch
                      label="Helpers"
                      checked={s.helpers}
                      onChange={(e) => set('helpers', e.currentTarget.checked)}
                    />
                    <Switch
                      label="Grid"
                      checked={s.grid}
                      onChange={(e) => set('grid', e.currentTarget.checked)}
                    />
                  </SimpleGrid>
                  <Select
                    label="Circle Q formula"
                    value={s.qFormula}
                    onChange={(v) => v && set('qFormula', v as QFormula)}
                    data={qFormulaOptions}
                  />
                  <Select
                    label="Child search formula"
                    value={s.childFormula}
                    onChange={(v) => v && set('childFormula', v as ChildFormula)}
                    data={childFormulaOptions}
                  />
                  <SliderField label="Max chain depth" value={s.maxDepth}>
                    <Slider
                      value={s.maxDepth}
                      onChange={(v) => set('maxDepth', v)}
                      min={1}
                      max={40}
                      step={1}
                    />
                  </SliderField>
                  <Select
                    label="Search angle mode"
                    value={s.searchMode}
                    onChange={(v) => v && set('searchMode', v as SearchMode)}
                    data={[
                      { value: 'widen', label: 'Widening cone' },
                      { value: 'exclude', label: 'Exclude-ray band' },
                    ]}
                  />
                  {s.searchMode === 'widen' ? (
                    <SimpleGrid cols={2}>
                      <NumberInput
                        label="Step °"
                        value={s.stepDeg}
                        onChange={(v) => set('stepDeg', Number(v) || 1)}
                        min={1}
                        max={45}
                      />
                      <NumberInput
                        label="Max °"
                        value={s.maxDeg}
                        onChange={(v) => set('maxDeg', Number(v) || 1)}
                        min={1}
                        max={180}
                      />
                    </SimpleGrid>
                  ) : (
                    <SimpleGrid cols={2}>
                      <NumberInput
                        label="Exclude ± °"
                        value={s.excludeDeg}
                        onChange={(v) => set('excludeDeg', Number(v) || 0)}
                        min={0}
                        max={90}
                      />
                      <NumberInput
                        label="Span °"
                        value={s.spanDeg}
                        onChange={(v) => set('spanDeg', Number(v) || 1)}
                        min={1}
                        max={180}
                      />
                    </SimpleGrid>
                  )}
                  <Switch
                    label="Anneal O/P/Q"
                    checked={s.annealed}
                    onChange={(e) => set('annealed', e.currentTarget.checked)}
                  />
                  {s.annealed && (
                    <Switch
                      label="Only consider unused points"
                      checked={s.excludeVisited}
                      onChange={(e) => set('excludeVisited', e.currentTarget.checked)}
                    />
                  )}
                  <SliderField label="Max branches per node" value={s.maxBranches}>
                    <Slider
                      value={s.maxBranches}
                      onChange={(v) => set('maxBranches', v)}
                      min={1}
                      max={8}
                      step={1}
                    />
                  </SliderField>
                  <SliderField label="Branch density threshold" value={s.branchDensity.toFixed(3)}>
                    <Slider
                      value={s.branchDensity}
                      onChange={(v) => set('branchDensity', v)}
                      min={0}
                      max={1}
                      step={0.001}
                    />
                  </SliderField>
                  <Button
                    variant="default"
                    onClick={() =>
                      set(
                        'branchDensity',
                        Number((fieldResult.points.length / (s.n * s.n)).toFixed(4))
                      )
                    }
                  >
                    Match field mean density
                  </Button>
                  <Switch
                    label="Branches share visited-set"
                    checked={s.shareVisited}
                    onChange={(e) => set('shareVisited', e.currentTarget.checked)}
                  />
                </Stack>
              </Surface>
            </Stack>

            {/* ---- Center: views ---- */}
            <Stack gap="md" style={{ minWidth: 0 }}>
              <Surface style={{ minWidth: 0 }}>
                <Box
                  style={{
                    alignItems: 'stretch',
                    display: 'grid',
                    gap: 'var(--mantine-spacing-md)',
                    gridTemplateColumns: stackedLayout ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 13rem',
                  }}
                >
                  <canvas
                    ref={canvas3dRef}
                    style={{ display: 'block', height: '24rem', minWidth: 0, width: '100%' }}
                  />
                  {solid && (
                    <Stack gap={4} justify="center">
                      <Text fw={600} size="sm" truncate>
                        {solid.label}
                      </Text>
                      <ReadoutRow
                        label="structure"
                        value={`${solid.v.length}v · ${solid.edges.length}e · ${solid.faces ? `${solid.faces.length}f` : 'no f'}`}
                      />
                      <ReadoutRow label="raw source points" value={fieldResult.rawPointCount} />
                      <ReadoutRow label="true shadow groups" value={fieldResult.trueGroupCount} />
                      <ReadoutRow label={`seed cells (N=${s.n})`} value={fieldResult.seedCount} />
                    </Stack>
                  )}
                </Box>
              </Surface>
              <Surface style={{ minWidth: 0, position: 'relative' }}>
                {emptyField && (
                  <Text c="red" size="sm" ta="center">
                    No source points selected — enable at least one of vertices / edges / faces.
                  </Text>
                )}
                <canvas
                  ref={canvas2dRef}
                  style={{
                    cursor: 'grab',
                    display: emptyField ? 'none' : 'block',
                    height: 'min(70vh, 40rem)',
                    touchAction: 'none',
                    width: '100%',
                  }}
                />
              </Surface>
            </Stack>

            {/* ---- Right: readout + diagnostics ---- */}
            <Stack gap="md">
              <Surface>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={2} size="h4">
                      Readout
                    </Title>
                    <Data size="sm">{fieldResult.points.length} pts</Data>
                  </Group>
                  {result ? (
                    <Stack gap={4}>
                      <ReadoutRow
                        label="growth model"
                        value={result.annealed ? 'annealed' : 'quenched'}
                      />
                      <ReadoutRow label="r(O) at A" value={result.radiusO.toFixed(3)} />
                      <ReadoutRow label="r(P) at A" value={result.radiusP.toFixed(3)} />
                      <ReadoutRow
                        label={`r(Q) [${qFormulaLabel(s.qFormula)}]`}
                        value={result.radiusQ.toFixed(3)}
                      />
                      <ReadoutRow
                        label={`child r [${childFormulaLabel(s.childFormula)}]`}
                        value={result.searchRadius.toFixed(3)}
                      />
                      {result.annealed &&
                        (() => {
                          const srs = [
                            ...result.segments.map((x) => x.searchRadius),
                            ...result.endpoints.map((x) => x.searchRadius),
                          ].filter((v) => v != null);
                          return srs.length ? (
                            <ReadoutRow
                              label="local search r range"
                              value={`${Math.min(...srs).toFixed(3)}–${Math.max(...srs).toFixed(3)}`}
                            />
                          ) : null;
                        })()}
                      <ReadoutRow
                        label="search window"
                        value={
                          s.searchMode === 'exclude'
                            ? `exclude ±${s.excludeDeg}°, span ${s.spanDeg}°`
                            : `widen ${s.stepDeg}°→${s.maxDeg}°`
                        }
                      />
                      <ReadoutRow
                        label="field mean density"
                        value={result.fieldMeanDensity.toFixed(4)}
                      />
                      <Divider my={4} />
                      <ReadoutRow label="chains (children in Q)" value={result.children.length} />
                      <ReadoutRow label="total hops (segments)" value={result.segments.length} />
                      <ReadoutRow label="branch points" value={result.branchPoints.length} />
                      <ReadoutRow label="dead-ended leaves" value={result.endpoints.length} />
                      <ReadoutRow label="depth-capped leaves" value={result.truncated} />
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm">
                      {emptyField ? 'Enable a source type to grow a tree.' : 'Adjusting…'}
                    </Text>
                  )}
                </Stack>
              </Surface>

              <Surface>
                <Stack gap="sm">
                  <Title order={2} size="h4">
                    Origin
                  </Title>
                  <ReadoutRow
                    label="origin cell (A)"
                    value={result ? `(${result.A.x}, ${result.A.y})` : '—'}
                  />
                  <Group>
                    <Button
                      variant="default"
                      onClick={() => rendererRef.current?.rerollOrigin()}
                      disabled={emptyField}
                    >
                      Reroll origin
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => rendererRef.current?.resetView()}
                      disabled={emptyField}
                    >
                      Reset view
                    </Button>
                  </Group>
                  <Text c="dimmed" size="xs">
                    Ctrl+click a point in the torus view to reseat the origin without moving the
                    camera.
                  </Text>
                </Stack>
              </Surface>

              <Surface>
                <Stack gap="sm">
                  <Title order={2} size="h4">
                    Empirical check
                  </Title>
                  <Button
                    variant="default"
                    onClick={() => setSample(sampleOrigins(fieldResult.points, s.n, growthParams))}
                    disabled={emptyField}
                  >
                    Sample 200 random origins
                  </Button>
                  {sample && (
                    <Stack gap={4}>
                      <ReadoutRow label="n sampled" value={sample.count} />
                      <ReadoutRow label="mean children" value={sample.mean.toFixed(2)} />
                      <ReadoutRow label="std dev" value={sample.sd.toFixed(2)} />
                      <ReadoutRow label="range" value={`${sample.min}–${sample.max}`} />
                    </Stack>
                  )}
                </Stack>
              </Surface>
            </Stack>
          </Box>
        </Stack>
      </AppShell.Main>

      {hover && (
        <Paper
          withBorder
          shadow="md"
          p="xs"
          style={{
            left: hover.clientX + 14,
            pointerEvents: 'none',
            position: 'fixed',
            top: hover.clientY + 14,
            zIndex: 400,
          }}
        >
          {hover.isOrigin ? (
            <Data size="xs">
              A (origin) · ({hover.gridX}, {hover.gridY}) · gen 0
            </Data>
          ) : (
            <Stack gap={2}>
              <Data size="xs">
                grid ({hover.gridX}, {hover.gridY}) · Δ ({hover.dx}, {hover.dy}) · d{' '}
                {hover.dist.toFixed(3)}
              </Data>
              {hover.role && (
                <Data size="xs">
                  gen {hover.generation} · {hover.role}
                </Data>
              )}
              {hover.searchRadius != null && hover.radiusO != null && hover.radiusP != null && (
                <Data size="xs">
                  search r {hover.searchRadius.toFixed(3)} · O {hover.radiusO.toFixed(3)} · P{' '}
                  {hover.radiusP.toFixed(3)}
                </Data>
              )}
            </Stack>
          )}
        </Paper>
      )}
    </AppShell>
  );
}
