import type {
  DualFocusConstraint,
  FocusPolicy,
  FoldingMode,
  IdentityMode,
  OffsetMode,
  QuantizeMode,
  RuleFamily,
  TraceConnectionMode,
  TraceRegisterMode,
  TransformDomain,
} from '../../lib/affine-focus';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from './audio';

export const STORAGE_KEY = 'hrifa.affine-focus.v1';

export type WorkspaceTab = 'family' | 'orbits' | 'graph' | 'dual';
export type OrbitGroupBy = 'scc' | 'generation';
export type GraphViewMode = 'svg-map' | 'mermaid';
export type GraphMapLayout = 'radial' | 'columns';

export interface AffineFocusPersistedState {
  version: 1;
  presetId: string;
  customIntervalsText: string;
  customRepeatText: string;
  seedText: string;
  domain: TransformDomain;
  rule: RuleFamily;
  multiplier: number;
  multiplierPlus: number;
  multiplierMinus: number;
  multipliersText: string;
  dualConstraint: DualFocusConstraint;
  dualFocusA: number;
  dualFocusB: number;
  offsetMode: OffsetMode;
  folding: FoldingMode;
  quantize: QuantizeMode;
  identity: IdentityMode;
  focusPolicy: FocusPolicy;
  customFociText: string;
  activeTab: WorkspaceTab;
  orbitGroupBy: OrbitGroupBy;
  graphViewMode: GraphViewMode;
  graphLayout: GraphMapLayout;
  maxClosureNodes: number;
  traceConnectMode: TraceConnectionMode;
  traceRegisterMode: TraceRegisterMode;
  audio: AudioSettings;
}

export const DEFAULT_PERSISTED_STATE: AffineFocusPersistedState = {
  version: 1,
  presetId: '7-ji-ptolemy',
  customIntervalsText: '1/1 9/8 5/4 4/3 3/2 5/3 15/8',
  customRepeatText: '2/1',
  seedText: '1/1, 5/4, 3/2',
  domain: 'gamut-steps',
  rule: 'single-focus',
  multiplier: 2,
  multiplierPlus: 1,
  multiplierMinus: -1,
  multipliersText: '1, 5, 7',
  dualConstraint: 'swap',
  dualFocusA: 0,
  dualFocusB: 4,
  offsetMode: 'positive',
  folding: 'folded',
  quantize: 'exact',
  identity: 'unordered-set',
  focusPolicy: 'current-members',
  customFociText: '0, 2, 4',
  activeTab: 'family',
  orbitGroupBy: 'scc',
  graphViewMode: 'svg-map',
  graphLayout: 'radial',
  maxClosureNodes: 256,
  traceConnectMode: 'map',
  traceRegisterMode: 'accumulate',
  audio: DEFAULT_AUDIO_SETTINGS,
};

export interface ScenarioExample {
  id: string;
  label: string;
  subtitle: string;
  patch: Partial<AffineFocusPersistedState>;
  /** Optional sequence of gamut focus-index groups to pre-walk as a multi-step trajectory. */
  chainFoci?: number[][];
}

export const SCENARIO_EXAMPLES: ScenarioExample[] = [
  {
    id: 'voice-trace-drift',
    label: 'Voice-Trace Drift Demo (4-Step P→L→P→L)',
    subtitle: '12-EDO · C→Cm→A♭→Fm→D♭ · shows (±kR) octave drift vs. Smoothest',
    patch: {
      presetId: '12-edo',
      seedText: '0, 4, 7',
      domain: 'gamut-steps',
      rule: 'dual-focus',
      dualConstraint: 'swap',
      folding: 'folded',
      quantize: 'exact',
      identity: 'unordered-set',
      focusPolicy: 'current-members',
      activeTab: 'family',
      traceConnectMode: 'map',
      traceRegisterMode: 'accumulate',
    },
    chainFoci: [
      [0, 7],
      [0, 3],
      [0, 8],
      [5, 8],
    ],
  },
  {
    id: 'ji-gamut-dilation',
    label: 'JI Scale-Step Dilation (a = 2)',
    subtitle: '7-note Ptolemy JI · (1/1, 5/4, 3/2) · Gamut Steps',
    patch: {
      presetId: '7-ji-ptolemy',
      seedText: '1/1, 5/4, 3/2',
      domain: 'gamut-steps',
      rule: 'single-focus',
      multiplier: 2,
      folding: 'folded',
      quantize: 'exact',
    },
  },
  {
    id: 'ji-log-pitch',
    label: 'JI Log-Pitch Interval Doubling (Ratio²)',
    subtitle: '7-note Ptolemy JI · (1/1, 5/4, 3/2) → {1/1, 9/8, 25/16}',
    patch: {
      presetId: '7-ji-ptolemy',
      seedText: '1/1, 5/4, 3/2',
      domain: 'log-pitch',
      rule: 'single-focus',
      multiplier: 2,
      folding: 'folded',
      quantize: 'exact',
    },
  },
  {
    id: 'ji-linear-hz-7th',
    label: 'Linear-Hz Harmonic 7th Reflection',
    subtitle: 'Otonal difference r_f − (r_x − r_f) at f = 3/2 → {1/1, 3/2, 7/4}',
    patch: {
      presetId: '7-ji-ptolemy',
      seedText: '1/1, 5/4, 3/2',
      domain: 'linear-freq',
      rule: 'single-focus',
      multiplier: -1,
      folding: 'folded',
      quantize: 'exact',
    },
  },
  {
    id: 'ji-subharmonic',
    label: 'Subharmonic Period Doubling (1/Hz)',
    subtitle: 'Utonal string-length scaling at f = 1/1, a = 2 → {1/1, 3/2, 5/3}',
    patch: {
      presetId: '7-ji-ptolemy',
      seedText: '1/1, 5/4, 3/2',
      domain: 'subharmonic',
      rule: 'single-focus',
      multiplier: 2,
      folding: 'folded',
      quantize: 'exact',
    },
  },
  {
    id: 'plr-tonnetz',
    label: 'Dual-Focus Edge Reflection (P/L/R Tonnetz)',
    subtitle: '12-EDO · C major (0, 4, 7) · 2-focus swap → 24-triad groupoid',
    patch: {
      presetId: '12-edo',
      seedText: '0, 4, 7',
      domain: 'gamut-steps',
      rule: 'dual-focus',
      dualConstraint: 'swap',
      folding: 'folded',
      focusPolicy: 'current-members',
    },
  },
  {
    id: 'pivot-inversion',
    label: 'Single-Focus Pivot Reflection (a = −1)',
    subtitle: '12-EDO · (0, 4, 7) flips across each vertex → Fm, C♯m, Gm',
    patch: {
      presetId: '12-edo',
      seedText: '0, 4, 7',
      domain: 'gamut-steps',
      rule: 'single-focus',
      multiplier: -1,
      folding: 'folded',
      focusPolicy: 'current-members',
    },
  },
  {
    id: 'm5-boulez',
    label: 'Focus-Anchored M5 Dilation (a = 5)',
    subtitle: '12-EDO · {0, 1, 4, 6} at f = 1, a = 5 → {1, 2, 4, 8}',
    patch: {
      presetId: '12-edo',
      seedText: '0, 1, 4, 6',
      domain: 'gamut-steps',
      rule: 'single-focus',
      multiplier: 5,
      folding: 'folded',
      focusPolicy: 'current-members',
    },
  },
  {
    id: 'hexany-cps',
    label: '1·3·5·7 Hexany Focus Reflection',
    subtitle: '6-note Erv Wilson CPS · Otonal ↔ Utonal triad reflection',
    patch: {
      presetId: '6-cps-hexany',
      seedText: '1/1, 5/4, 3/2',
      domain: 'log-pitch',
      rule: 'single-focus',
      multiplier: -1,
      folding: 'folded',
      quantize: 'snap-to-gamut',
    },
  },
];

export function loadPersistedState(): AffineFocusPersistedState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_PERSISTED_STATE;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PERSISTED_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<AffineFocusPersistedState>;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_PERSISTED_STATE;
    }
    return {
      ...DEFAULT_PERSISTED_STATE,
      ...parsed,
      audio: {
        ...DEFAULT_AUDIO_SETTINGS,
        ...(parsed.audio ?? {}),
      },
    };
  } catch {
    return DEFAULT_PERSISTED_STATE;
  }
}

export function savePersistedState(state: AffineFocusPersistedState) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export function clearPersistedState() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Signed cents error color following Harmonic Field Lab's cyan (flat) / neutral (exact) / orange (sharp) convention.
 */
export function signedErrorColorVar(errCents: number): string {
  if (Math.abs(errCents) < 0.05) {
    return 'var(--text-muted)';
  }
  return errCents > 0 ? 'var(--mark-orange)' : 'var(--mark-cyan)';
}

export function formatSignedCents(errCents: number, decimals = 1): string {
  if (Math.abs(errCents) < 0.05) {
    return '0.0 c';
  }
  const sign = errCents > 0 ? '+' : '−';
  return `${sign}${Math.abs(errCents).toFixed(decimals)} c`;
}
