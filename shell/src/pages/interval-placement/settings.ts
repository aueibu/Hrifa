import {
  defaultIntervalPlacementParams,
  type IntervalPlacementParams,
  type OddBiasDirection,
  type PlacementMode,
} from './engine';

export interface Settings {
  intervals: number[];
  edoSteps: number;
  baseNote: number;
  baseOctave: number;
  windowOctaves: number;
  placementMode: PlacementMode;
  anchorAlpha: number;
  anchorBeta: number;
  anchorRho: number;
  repulseGamma: number;
  repulseKappa: number;
  repulseLambda: number;
  repulseEta: number;
  repulseIterations: number;
  repulseAlpha: number;
  useDamping: boolean;
  oddBias: OddBiasDirection[];
  guitarTuning: string;
}

const settingsKey = 'hrifa.interval-placement.settings.v1';

export function defaultSettings(): Settings {
  return {
    intervals: [11, 7, 16],
    edoSteps: defaultIntervalPlacementParams.edoSteps,
    baseNote: 0,
    baseOctave: 4,
    windowOctaves: 3,
    placementMode: defaultIntervalPlacementParams.placementMode,
    anchorAlpha: defaultIntervalPlacementParams.anchorAlpha,
    anchorBeta: defaultIntervalPlacementParams.anchorBeta,
    anchorRho: defaultIntervalPlacementParams.anchorRho,
    repulseGamma: defaultIntervalPlacementParams.repulseGamma,
    repulseKappa: defaultIntervalPlacementParams.repulseKappa,
    repulseLambda: defaultIntervalPlacementParams.repulseLambda,
    repulseEta: defaultIntervalPlacementParams.repulseEta,
    repulseIterations: defaultIntervalPlacementParams.repulseIterations,
    repulseAlpha: defaultIntervalPlacementParams.repulseAlpha,
    useDamping: true,
    oddBias: [],
    guitarTuning: 'EADGBE',
  };
}

export function loadSettings(): Settings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(settingsKey) ?? 'null');
    if (typeof saved !== 'object' || saved === null) {
      return defaultSettings();
    }
    return { ...defaultSettings(), ...(saved as Partial<Settings>) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(s));
  } catch {
    // The current session keeps its in-memory settings.
  }
}

export function toParams(s: Settings): IntervalPlacementParams {
  return {
    ...defaultIntervalPlacementParams,
    edoSteps: s.edoSteps,
    placementMode: s.placementMode,
    anchorAlpha: s.anchorAlpha,
    anchorBeta: s.anchorBeta,
    anchorRho: s.anchorRho,
    repulseGamma: s.repulseGamma,
    repulseKappa: s.repulseKappa,
    repulseLambda: s.repulseLambda,
    repulseEta: s.repulseEta,
    repulseIterations: s.repulseIterations,
    repulseAlpha: s.repulseAlpha,
    useDamping: s.useDamping,
  };
}

export function parseIntervalsText(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((tok) => Number(tok))
    .filter((v) => Number.isFinite(v) && Number.isInteger(v) && v > 0);
}
