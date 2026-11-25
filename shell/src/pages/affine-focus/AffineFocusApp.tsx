import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ColorSchemeToggle } from '../../components/ColorSchemeToggle/ColorSchemeToggle';
import {
  appendTrajectoryStep,
  applyFocusTransform,
  closureLimitsForNodes,
  computeClosure,
  computeImmediateFamily,
  createInitialTrajectory,
  getPresetGamut,
  parseCustomGamut,
  parseSeedInput,
  traceTrajectoryVoices,
  truncateTrajectoryAt,
  type ClosureEdge,
  type ClosureNode,
  type GamutPitch,
  type TrajectoryStep,
  type TransformConfig,
  type TransformResult,
} from '../../lib/affine-focus';
import { SegmentedControl, Button } from '../../ui';
import { affineAudio, type AudioSettings } from './audio';
import { ClosureOrbitView } from './components/ClosureOrbitView';
import { ControlRail } from './components/ControlRail';
import { DualFocusMatrixView } from './components/DualFocusMatrixView';
import { FamilyTrajectoryView } from './components/FamilyTrajectoryView';
import { FocusStage } from './components/FocusStage';
import { InspectorRail } from './components/InspectorRail';
import { UniverseGraphView } from './components/UniverseGraphView';
import { buildExportCsv, buildExportJson, buildExportMermaid, triggerFileDownload } from './export';
import { buildFullEdgeMapSvg, computeUniverseGraphLayout } from './graphMap';
import {
  clearPersistedState,
  DEFAULT_PERSISTED_STATE,
  loadPersistedState,
  savePersistedState,
  type AffineFocusPersistedState,
  type ScenarioExample,
  type WorkspaceTab,
} from './state';
import classes from './AffineFocus.module.css';

export function AffineFocusApp() {
  const [state, setState] = useState<AffineFocusPersistedState>(() => loadPersistedState());
  const [hoveredOp, setHoveredOp] = useState<TransformResult | null>(null);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [inspectedEdgeResult, setInspectedEdgeResult] = useState<TransformResult | null>(null);
  const [selectedClosureNodeId, setSelectedClosureNodeId] = useState<string>('');
  const [soundingLabels, setSoundingLabels] = useState<Set<string>>(() => new Set());
  const [playingStepIndex, setPlayingStepIndex] = useState<number | null>(null);

  useEffect(() => {
    savePersistedState(state);
  }, [state]);

  useEffect(() => {
    affineAudio.setSoundingListener((labels) => setSoundingLabels(labels));
    affineAudio.setPlayingStepListener((idx) => setPlayingStepIndex(idx));
    return () => {
      affineAudio.setSoundingListener(null);
      affineAudio.setPlayingStepListener(null);
      affineAudio.stopAll();
    };
  }, []);

  const customParsed = useMemo(() => {
    if (state.presetId !== 'custom') {
      return null;
    }
    return parseCustomGamut(state.customIntervalsText, state.customRepeatText, 'Custom Gamut');
  }, [state.presetId, state.customIntervalsText, state.customRepeatText]);

  const gamut = useMemo(() => {
    if (state.presetId === 'custom' && customParsed) {
      return customParsed.gamut;
    }
    return getPresetGamut(state.presetId);
  }, [state.presetId, customParsed]);

  const parsedSeed = useMemo(() => {
    const res = parseSeedInput(state.seedText, gamut, state.identity === 'unordered-set');
    if (res.pitches.length === 0) {
      return {
        pitches: gamut.pitches.slice(0, Math.min(3, gamut.pitches.length)),
        notices: res.notices,
        error: res.error,
      };
    }
    return res;
  }, [state.seedText, gamut, state.identity]);

  const multipliers = useMemo(() => {
    const nums = state.multipliersText
      .split(/[,\s]+/)
      .map(Number)
      .filter(Number.isFinite);
    return nums.length > 0 ? nums : [state.multiplier];
  }, [state.multipliersText, state.multiplier]);

  const customFoci = useMemo(() => {
    return state.customFociText
      .split(/[,\s]+/)
      .map(Number)
      .filter(Number.isInteger);
  }, [state.customFociText]);

  const config: TransformConfig = useMemo(
    () => ({
      gamut,
      domain: state.domain,
      rule: state.rule,
      multiplier: state.multiplier,
      multiplierPlus: state.multiplierPlus,
      multiplierMinus: state.multiplierMinus,
      multipliers,
      dualConstraint: state.dualConstraint,
      offsetMode: state.offsetMode,
      folding: state.folding,
      quantize: state.quantize,
      identity: state.identity,
      focusPolicy: state.focusPolicy,
      customFoci,
    }),
    [
      gamut,
      state.domain,
      state.rule,
      state.multiplier,
      state.multiplierPlus,
      state.multiplierMinus,
      multipliers,
      state.dualConstraint,
      state.offsetMode,
      state.folding,
      state.quantize,
      state.identity,
      state.focusPolicy,
      customFoci,
    ]
  );

  const [trajectory, setTrajectory] = useState<TrajectoryStep[]>(() =>
    createInitialTrajectory(parsedSeed.pitches, config)
  );
  const [activeTrajIdx, setActiveTrajIdx] = useState(0);
  const [presetApplyTick, setPresetApplyTick] = useState(0);
  const pendingChainRef = useRef<number[][] | null>(null);

  // Reset trajectory when seed, gamut, domain, or rule changes (or apply preset chainFoci)
  useEffect(() => {
    let next = createInitialTrajectory(parsedSeed.pitches, config);
    const pendingChain = pendingChainRef.current;
    pendingChainRef.current = null;
    if (pendingChain && pendingChain.length > 0) {
      for (const focusIdxList of pendingChain) {
        const focusPitches = focusIdxList.map((idx) => config.gamut.pitches[idx]).filter(Boolean);
        if (focusPitches.length > 0) {
          const currentPitches = next[next.length - 1].pitches;
          const res = applyFocusTransform(currentPitches, focusPitches, config);
          next = appendTrajectoryStep(next, res);
        }
      }
    }
    setTrajectory(next);
    setActiveTrajIdx(next.length - 1);
    setInspectedEdgeResult(null);
  }, [parsedSeed.pitches, config, presetApplyTick]);

  const currentSourcePitches = trajectory[activeTrajIdx]?.pitches ?? parsedSeed.pitches;

  const trajectoryTrace = useMemo(
    () =>
      traceTrajectoryVoices(
        trajectory,
        gamut.repeatCents,
        state.traceConnectMode,
        state.traceRegisterMode,
        state.identity,
        state.folding
      ),
    [
      trajectory,
      gamut.repeatCents,
      state.traceConnectMode,
      state.traceRegisterMode,
      state.identity,
      state.folding,
    ]
  );

  const family = useMemo(
    () => computeImmediateFamily(currentSourcePitches, parsedSeed.pitches, config),
    [currentSourcePitches, parsedSeed.pitches, config]
  );

  const closure = useMemo(
    () => computeClosure(parsedSeed.pitches, config, closureLimitsForNodes(state.maxClosureNodes)),
    [parsedSeed.pitches, config, state.maxClosureNodes]
  );

  useEffect(() => {
    setSelectedClosureNodeId(closure.seedId);
  }, [closure.seedId]);

  const selectedOp = family.find((f) => f.operationId === selectedOpId) ?? family[0] ?? null;

  const activeStageResult: TransformResult | null = hoveredOp ?? inspectedEdgeResult ?? selectedOp;

  const handlePatch = (patch: Partial<AffineFocusPersistedState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const handleApplyExample = (example: ScenarioExample) => {
    pendingChainRef.current = example.chainFoci ?? null;
    setPresetApplyTick((t) => t + 1);
    setState((prev) => ({ ...prev, ...example.patch }));
  };

  const handlePatchAudio = (patch: Partial<AudioSettings>) => {
    setState((prev) => ({
      ...prev,
      audio: { ...prev.audio, ...patch },
    }));
  };

  const handleToggleGamutIndex = (idx: number) => {
    const existing = parsedSeed.pitches.map((p) => p.index);
    let nextIndices: number[];
    if (existing.includes(idx)) {
      if (existing.length <= 1) {
        return;
      }
      nextIndices = existing.filter((i) => i !== idx);
    } else {
      nextIndices = [...existing, idx];
      if (state.identity === 'unordered-set') {
        nextIndices.sort((a, b) => a - b);
      }
    }
    const nextText = nextIndices
      .filter((i) => i >= 0 && i < gamut.pitches.length)
      .map((i) => gamut.pitches[i].label)
      .join(', ');
    handlePatch({ seedText: nextText });
  };

  const handleStepTrajectory = (op: TransformResult) => {
    const truncated = truncateTrajectoryAt(trajectory, activeTrajIdx);
    const next = appendTrajectoryStep(truncated, op);
    const nextTrace = traceTrajectoryVoices(
      next,
      gamut.repeatCents,
      state.traceConnectMode,
      state.traceRegisterMode,
      state.identity,
      state.folding
    );
    const lastIdx = next.length - 1;
    setTrajectory(next);
    setActiveTrajIdx(lastIdx);
    setSelectedOpId(null);
    setInspectedEdgeResult(null);
    affineAudio.playCentsList(
      nextTrace.stepCents[lastIdx] ?? op.outputPitches.map((p) => p.foldedCents),
      op.outputPitches.map((p) => p.label),
      state.audio
    );
  };

  const handleJumpTrajectory = (idx: number) => {
    const truncated = truncateTrajectoryAt(trajectory, idx);
    setTrajectory(truncated);
    setActiveTrajIdx(truncated.length - 1);
    setInspectedEdgeResult(null);
  };

  const handleLoadPathToTrajectory = (edges: ClosureEdge[]) => {
    let next = createInitialTrajectory(parsedSeed.pitches, config);
    for (const e of edges) {
      next = appendTrajectoryStep(next, e.result);
    }
    const nextTrace = traceTrajectoryVoices(
      next,
      gamut.repeatCents,
      state.traceConnectMode,
      state.traceRegisterMode,
      state.identity,
      state.folding
    );
    setTrajectory(next);
    setActiveTrajIdx(next.length - 1);
    handlePatch({ activeTab: 'family' });
    affineAudio.playTrajectory(
      next,
      state.audio,
      state.folding === 'unfolded',
      nextTrace.stepCents
    );
  };

  const handlePlayPitches = (pitches: readonly GamutPitch[]) => {
    affineAudio.playPitches(pitches, state.audio, state.folding === 'unfolded');
  };

  const handlePlayAlternation = (src: readonly GamutPitch[], tgt: readonly GamutPitch[]) => {
    affineAudio.playAlternation(src, tgt, state.audio, state.folding === 'unfolded');
  };

  const handlePlayTrajectory = () => {
    affineAudio.playTrajectory(
      trajectory,
      state.audio,
      state.folding === 'unfolded',
      trajectoryTrace.stepCents
    );
  };

  const handlePlayTrajectoryStep = (idx: number) => {
    const step = trajectory[idx];
    if (!step) {
      return;
    }
    const centsList =
      trajectoryTrace.stepCents[idx] ??
      step.pitches.map((p) => (state.folding === 'unfolded' ? p.unfoldedCents : p.foldedCents));
    affineAudio.playCentsList(
      centsList,
      step.pitches.map((p) => p.label),
      state.audio
    );
  };

  const handleExport = (kind: 'json' | 'csv' | 'mermaid' | 'svg') => {
    if (kind === 'json') {
      triggerFileDownload(
        'affine-focus-state.json',
        buildExportJson(config, state.seedText, family, closure, trajectory),
        'application/json'
      );
    } else if (kind === 'csv') {
      triggerFileDownload('affine-focus-nodes.csv', buildExportCsv(closure), 'text/csv');
    } else if (kind === 'svg') {
      const layout = computeUniverseGraphLayout(closure, trajectory, state.graphLayout);
      const svg = buildFullEdgeMapSvg(layout, {
        selectedNodeId: selectedClosureNodeId,
        title: `${config.gamut.name} · ${closure.nodes.length} sets · ${closure.edges.length} edges`,
      });
      triggerFileDownload('affine-focus-edge-map.svg', svg, 'image/svg+xml');
    } else {
      triggerFileDownload('affine-focus-graph.mmd', buildExportMermaid(closure), 'text/plain');
    }
  };

  const handleReset = () => {
    clearPersistedState();
    setState(DEFAULT_PERSISTED_STATE);
  };

  return (
    <div className={classes.root} data-testid="affine-focus-page">
      {/* Top Bar (Harmonic Field Lab one-row topbar pattern) */}
      <header className={classes.topbar}>
        <Link to="/" className={classes.homeLink} aria-label="Home">
          <span>← Home</span>
        </Link>
        <h1 className={classes.pageTitle}>Affine Focus Transform Explorer</h1>
        <span className={classes.formulaBadge} data-testid="topbar-formula">
          {activeStageResult ? activeStageResult.formulaDisplay : 'T_{f,a}(x) = f + a(x − f)'}
        </span>

        <span className={classes.grow} />

        <div className={classes.topActions}>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => handlePlayPitches(currentSourcePitches)}
          >
            ▶ Seed / Current
          </Button>
          {activeStageResult && (
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => handlePlayPitches(activeStageResult.outputPitches)}
            >
              ▶ Target
            </Button>
          )}
          <Button size="compact-xs" variant="subtle" onClick={handleReset}>
            Reset
          </Button>
          <ColorSchemeToggle />
        </div>
      </header>

      {/* Main 3-Column Instrument Grid */}
      <div className={classes.grid}>
        {/* Left Column: Tuning, Seed, Transform Domain & Canonical Rule Controls */}
        <ControlRail
          state={state}
          gamut={gamut}
          seedPitches={parsedSeed.pitches}
          seedError={parsedSeed.error}
          customError={customParsed?.error}
          onPatch={handlePatch}
          onToggleGamutIndex={handleToggleGamutIndex}
          onApplyExample={handleApplyExample}
        />

        {/* Center Column: Top Focus Geometry Stage + Bottom Exploration Tabs */}
        <main className={classes.centerColumn} aria-label="Focus Geometry and Exploration">
          <FocusStage
            config={config}
            sourcePitches={currentSourcePitches}
            activeResult={activeStageResult}
            soundingLabels={soundingLabels}
            onToggleGamutIndex={handleToggleGamutIndex}
          />

          <div className={classes.centerTabsBar}>
            <SegmentedControl
              size="xs"
              aria-label="Exploration workspace view"
              value={state.activeTab}
              onChange={(v) => handlePatch({ activeTab: v as WorkspaceTab })}
              data={[
                {
                  label: `Immediate Family & Trajectory (${family.length})`,
                  value: 'family',
                },
                {
                  label: `Orbits & Closure (${closure.nodes.length} sets · ${closure.sccs.length} orbits)`,
                  value: 'orbits',
                },
                {
                  label: `Universe Graph (${closure.edges.length} edges)`,
                  value: 'graph',
                },
                {
                  label: 'Dual-Focus Solver (ax + b)',
                  value: 'dual',
                },
              ]}
            />
            <span className={classes.mutedLabel}>
              {closure.saturated
                ? `Closure saturated at gen ${closure.saturationGeneration ?? 0}`
                : `Truncated (${closure.terminationReason})`}
            </span>
          </div>

          <div className={classes.centerScroll}>
            {state.activeTab === 'family' && (
              <FamilyTrajectoryView
                config={config}
                family={family}
                selectedOpId={selectedOp?.operationId ?? null}
                trajectory={trajectory}
                trace={trajectoryTrace}
                traceConnectMode={state.traceConnectMode}
                traceRegisterMode={state.traceRegisterMode}
                activeTrajectoryIndex={activeTrajIdx}
                playingStepIndex={playingStepIndex}
                onChangeTraceConnectMode={(mode) => handlePatch({ traceConnectMode: mode })}
                onChangeTraceRegisterMode={(mode) => handlePatch({ traceRegisterMode: mode })}
                onHoverOp={setHoveredOp}
                onSelectOp={(op) => {
                  setSelectedOpId(op.operationId);
                  setInspectedEdgeResult(null);
                }}
                onStepTrajectory={handleStepTrajectory}
                onJumpTrajectory={handleJumpTrajectory}
                onPlayPitches={handlePlayPitches}
                onPlayAlternation={handlePlayAlternation}
                onPlayTrajectory={handlePlayTrajectory}
                onPlayTrajectoryStep={handlePlayTrajectoryStep}
              />
            )}

            {state.activeTab === 'orbits' && (
              <ClosureOrbitView
                config={config}
                closure={closure}
                groupBy={state.orbitGroupBy}
                maxClosureNodes={state.maxClosureNodes}
                selectedNodeId={selectedClosureNodeId}
                onChangeGroupBy={(g) => handlePatch({ orbitGroupBy: g })}
                onChangeMaxClosureNodes={(n) => handlePatch({ maxClosureNodes: n })}
                onSelectNode={(node: ClosureNode) => {
                  setSelectedClosureNodeId(node.id);
                  handlePlayPitches(node.pitches);
                }}
                onInspectEdge={(edge: ClosureEdge) => {
                  setInspectedEdgeResult(edge.result);
                  setSelectedClosureNodeId(edge.source);
                  handlePlayPitches(edge.result.outputPitches);
                }}
                onLoadPathToTrajectory={handleLoadPathToTrajectory}
                onPlayPitches={handlePlayPitches}
              />
            )}

            {state.activeTab === 'graph' && (
              <UniverseGraphView
                config={config}
                closure={closure}
                trajectory={trajectory}
                viewMode={state.graphViewMode}
                layoutMode={state.graphLayout}
                selectedNodeId={selectedClosureNodeId}
                onChangeViewMode={(m) => handlePatch({ graphViewMode: m })}
                onChangeLayoutMode={(l) => handlePatch({ graphLayout: l })}
                onSelectNode={(node: ClosureNode) => {
                  setSelectedClosureNodeId(node.id);
                  handlePlayPitches(node.pitches);
                }}
                onLoadPathToTrajectory={handleLoadPathToTrajectory}
                onPlayPitches={handlePlayPitches}
              />
            )}

            {state.activeTab === 'dual' && (
              <DualFocusMatrixView
                config={config}
                seedPitches={parsedSeed.pitches}
                closure={closure}
                focusA={state.dualFocusA}
                focusB={state.dualFocusB}
                onChangeFoci={(a, b) => handlePatch({ dualFocusA: a, dualFocusB: b })}
                onChangeConstraint={(c) => handlePatch({ dualConstraint: c })}
                onPlayPitches={handlePlayPitches}
              />
            )}
          </div>
        </main>

        {/* Right Column: Arithmetic Step Inspector, Audio Synth, Statistics & Export */}
        <InspectorRail
          config={config}
          activeResult={activeStageResult}
          closure={closure}
          audioSettings={state.audio}
          onPatchAudio={handlePatchAudio}
          onPlayPitches={handlePlayPitches}
          onPlayAlternation={handlePlayAlternation}
          onStopAudio={() => affineAudio.stopAll()}
          onExport={handleExport}
        />
      </div>
    </div>
  );
}
