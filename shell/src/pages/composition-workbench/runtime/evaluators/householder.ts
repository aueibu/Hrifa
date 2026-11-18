import {
  boundOutput,
  resolvePacketFromOutput,
  type PublishedCompositionOutput,
} from '../../compositionRouting';
import type { ModuleRouteBinding, ModuleRouteState } from '../../compositionWorkspace';
import {
  householderCandidatesPacket,
  householderSelectedPacket,
  reflectAxisPreset,
  reflectRhythm,
  searchMetric,
  type HouseholderCandidate,
  type HouseholderMode,
  type HouseholderResult,
  type ReflectAxisPreset,
} from '../../householder';
import type { DataPacket } from '../../model';
import { rhythmOrigin } from '../../rhythmFrame';
import { isValidRhythmSource } from '../../routeTreatments';
import { signalTypeRegistry } from '../../signalTypes';
import { createMemo, type Memo } from '../memo';

export interface MetricAxisSettings {
  enabled: boolean;
  coefficient: number;
  weight: number;
}

export interface HouseholderSettings {
  mode: HouseholderMode;
  grid: number;
  minUnits: number;
  reflectPreset: ReflectAxisPreset;
  customAxis: string;
  reflectCoefficient: number;
  reflectSteps: number;
  accentPattern: string;
  accent: MetricAxisSettings;
  position: MetricAxisSettings;
  closeness: number;
  /** Added after the first release; older saved settings without it get the default. */
  identity?: number;
  /** Keep the first attack where the input's is. Free by default so rhythms can start off the beat. */
  pinStart?: boolean;
}

export const defaultHouseholderSettings: HouseholderSettings = {
  mode: 'reflect',
  grid: 1,
  minUnits: 1,
  reflectPreset: 'swing',
  customAxis: '1 0 -1',
  reflectCoefficient: -1,
  reflectSteps: 4,
  accentPattern: '1 0 0 0',
  accent: { enabled: true, coefficient: -1, weight: 1 },
  position: { enabled: false, coefficient: -1, weight: 1 },
  closeness: 0.1,
  identity: 1,
  pinStart: false,
};

/** The persisted values the outputs depend on (volume and sounds do not). */
export interface HouseholderState {
  settings: HouseholderSettings;
  selectedIndex: number;
}

/**
 * What Householder reads from upstream: the bound output and the route binding of its `rhythm` and
 * `axis` ports, picked by `pickHouseholderInputs` so they keep their identity when an unrelated
 * output changes (otherwise the module's own publish would re-run it forever).
 */
export interface HouseholderInputs {
  rhythmOutput: PublishedCompositionOutput | undefined;
  axisOutput: PublishedCompositionOutput | undefined;
  bindingRhythm: ModuleRouteBinding | undefined;
  bindingAxis: ModuleRouteBinding | undefined;
}

export interface HouseholderContext {
  instanceId: string;
  instanceLabel: string;
  edo: number;
}

export type HouseholderComputed = HouseholderResult & {
  transformation: string;
  parameters: Record<string, unknown>;
};

/** What the label does not touch: a rename keeps this object, and its packets, as it is. */
export interface HouseholderCore {
  treatedRhythm: DataPacket | undefined;
  treatedAxis: DataPacket | undefined;
  /** The treated rhythm when it is a usable inter-onset list. */
  rhythm: DataPacket<number> | undefined;
  cyclic: boolean;
  computed: HouseholderComputed;
  clampedIndex: number;
  selected: HouseholderCandidate | undefined;
  selectedPacket: DataPacket | undefined;
  candidatesPacket: DataPacket | undefined;
}

export type HouseholderEvaluation = HouseholderCore & { outputs: PublishedCompositionOutput[] };

function parseNumberList(text: string): number[] | undefined {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const values = parts.map(Number);
  return parts.length && values.every(Number.isFinite) ? values : undefined;
}

/**
 * Resolves ports `rhythm` and `axis`. A binding pointing at this same instance (stale data) would
 * feed the module's own output back into itself, so it reads as disconnected.
 */
export function pickHouseholderInputs(
  outputs: PublishedCompositionOutput[],
  routeState: ModuleRouteState,
  instanceId: string
): HouseholderInputs {
  const bindingRhythm = routeState.rhythm;
  const bindingAxis = routeState.axis;
  return {
    rhythmOutput:
      bindingRhythm?.source?.instanceId === instanceId
        ? undefined
        : boundOutput(outputs, bindingRhythm?.source),
    axisOutput:
      bindingAxis?.source?.instanceId === instanceId
        ? undefined
        : boundOutput(outputs, bindingAxis?.source),
    bindingRhythm,
    bindingAxis,
  };
}

/** Rhythm Householder: reflects or metrically re-places the connected rhythm. Takes no label. */
export function computeHouseholder(
  state: HouseholderState,
  inputs: HouseholderInputs,
  ctx: Omit<HouseholderContext, 'instanceLabel'>,
  memo: Memo = createMemo()
): HouseholderCore {
  const { settings, selectedIndex } = state;
  const { instanceId, edo } = ctx;
  const { bindingRhythm, bindingAxis } = inputs;
  const identityWeight = settings.identity ?? defaultHouseholderSettings.identity!;
  const selfBoundRhythm = bindingRhythm?.source?.instanceId === instanceId;
  const selfBoundAxis = bindingAxis?.source?.instanceId === instanceId;
  const rhythmIndex = bindingRhythm?.source?.index;
  const axisIndex = bindingAxis?.source?.index;
  // Each part depends only on what it did before the evaluator existed.
  const resolvedRhythm = memo(
    'resolvedRhythm',
    [selfBoundRhythm, inputs.rhythmOutput, rhythmIndex, instanceId],
    () =>
      selfBoundRhythm
        ? undefined
        : resolvePacketFromOutput(inputs.rhythmOutput, rhythmIndex, `route:${instanceId}:rhythm`)
  );
  const resolvedAxis = memo(
    'resolvedAxis',
    [selfBoundAxis, inputs.axisOutput, axisIndex, instanceId],
    () =>
      selfBoundAxis
        ? undefined
        : resolvePacketFromOutput(inputs.axisOutput, axisIndex, `route:${instanceId}:axis`)
  );
  const treatedRhythm = memo(
    'treatedRhythm',
    [bindingRhythm, resolvedRhythm, instanceId, edo],
    () =>
      bindingRhythm
        ? signalTypeRegistry[bindingRhythm.signalType].apply(
            resolvedRhythm,
            bindingRhythm.treatment,
            `route:${instanceId}:rhythm`,
            edo
          )
        : undefined
  );
  const treatedAxis = memo('treatedAxis', [bindingAxis, resolvedAxis, instanceId, edo], () =>
    bindingAxis
      ? signalTypeRegistry[bindingAxis.signalType].apply(
          resolvedAxis,
          bindingAxis.treatment,
          `route:${instanceId}:axis`,
          edo
        )
      : undefined
  );

  const cyclic = treatedRhythm?.frame?.topology !== 'linear';
  const rhythm = isValidRhythmSource(treatedRhythm)
    ? (treatedRhythm as DataPacket<number>)
    : undefined;
  const axisRouted = Boolean(bindingAxis?.source);

  const computed = memo(
    'computed',
    [rhythm, treatedRhythm, treatedAxis, axisRouted, settings, identityWeight, cyclic],
    (): HouseholderComputed => {
      const base = {
        transformation: `householder-${settings.mode}`,
        parameters: {} as Record<string, unknown>,
      };
      if (!rhythm) {
        return {
          ...base,
          candidates: [],
          inputUnits: [],
          warnings: [],
          error: treatedRhythm
            ? 'The connected source is not an inter-onset duration list yet. Turn on “Interpret as rhythm” on its route.'
            : 'Connect a rhythm to alter.',
        };
      }
      const durations = rhythm.items.map((item) => Number(item.value));
      if (settings.mode === 'reflect') {
        let axis: number[] | undefined;
        let axisSource: string;
        if (axisRouted) {
          axisSource = 'routed';
          const values = treatedAxis?.items.map((item) => item.value);
          axis = values?.every((value) => typeof value === 'number' && Number.isFinite(value))
            ? (values as number[])
            : undefined;
          if (!axis?.length) {
            return {
              ...base,
              candidates: [],
              inputUnits: [],
              warnings: [],
              error: 'The routed axis must be a list of plain numbers (no groups).',
            };
          }
        } else if (settings.reflectPreset === 'custom') {
          axisSource = 'custom';
          axis = parseNumberList(settings.customAxis);
          if (!axis) {
            return {
              ...base,
              candidates: [],
              inputUnits: [],
              warnings: [],
              error: 'Enter the custom axis as numbers.',
            };
          }
        } else {
          axisSource = settings.reflectPreset;
          axis = reflectAxisPreset(settings.reflectPreset, durations.length);
        }
        const result = reflectRhythm({
          durations,
          axis,
          coefficient: settings.reflectCoefficient,
          grid: settings.grid,
          minUnits: settings.minUnits,
          steps: settings.reflectSteps,
        });
        return {
          ...result,
          transformation: 'householder-reflect',
          parameters: {
            axis: axisSource,
            axisValues: axis,
            coefficient: settings.reflectCoefficient,
            grid: settings.grid,
            minUnits: settings.minUnits,
          },
        };
      }
      const pattern = parseNumberList(settings.accentPattern);
      const result = searchMetric({
        durations,
        grid: settings.grid,
        minUnits: settings.minUnits,
        axes: [
          { key: 'accent', ...settings.accent, pattern: pattern ?? [] },
          { key: 'position', ...settings.position },
        ],
        closeness: settings.closeness,
        identity: identityWeight,
        cyclic,
        origin: rhythmOrigin(rhythm),
        pinStart: settings.pinStart ?? false,
        maxCandidates: 8,
      });
      return {
        ...result,
        transformation: 'householder-metric',
        parameters: {
          accentPattern: pattern,
          accent: settings.accent,
          position: settings.position,
          closeness: settings.closeness,
          identity: identityWeight,
          pinStart: settings.pinStart ?? false,
          grid: settings.grid,
          minUnits: settings.minUnits,
        },
      };
    }
  );

  const clampedIndex = computed.candidates.length
    ? Math.min(Math.max(0, Math.floor(selectedIndex)), computed.candidates.length - 1)
    : 0;
  const selected = computed.candidates[clampedIndex];

  const selectedPacket = memo(
    'selected',
    [rhythm, selected, computed, instanceId, clampedIndex],
    () =>
      rhythm && selected
        ? householderSelectedPacket(
            selected,
            rhythm,
            computed.warnings,
            instanceId,
            computed.transformation,
            { ...computed.parameters, candidate: clampedIndex }
          )
        : undefined
  );
  const candidatesPacket = memo('candidates', [rhythm, computed, instanceId], () =>
    rhythm && computed.candidates.length
      ? householderCandidatesPacket(
          computed.candidates,
          rhythm,
          computed.warnings,
          instanceId,
          computed.transformation,
          computed.parameters
        )
      : undefined
  );

  return {
    treatedRhythm,
    treatedAxis,
    rhythm,
    cyclic,
    computed,
    clampedIndex,
    selected,
    selectedPacket,
    candidatesPacket,
  };
}

/** The published `selected` and `candidates` outputs, when there are candidates. */
export function householderOutputs(
  core: HouseholderCore,
  ctx: Pick<HouseholderContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  const { instanceId, instanceLabel } = ctx;
  return core.selectedPacket && core.candidatesPacket
    ? [
        {
          ref: { instanceId, port: 'selected' },
          label: `${instanceLabel} · Selected`,
          packet: core.selectedPacket,
        },
        {
          ref: { instanceId, port: 'candidates' },
          label: `${instanceLabel} · Candidates`,
          packet: core.candidatesPacket,
        },
      ]
    : [];
}

export function evaluateHouseholder(
  state: HouseholderState,
  inputs: HouseholderInputs,
  ctx: HouseholderContext
): HouseholderEvaluation {
  const core = computeHouseholder(state, inputs, ctx);
  return { ...core, outputs: householderOutputs(core, ctx) };
}
