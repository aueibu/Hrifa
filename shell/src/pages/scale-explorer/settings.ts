import type { NameMode } from './chords';
import type { InversionMode, PrimeConvention } from './pitchSets';
/** Persisted explorer preferences, same load/save pattern as the other ports. */
import type { ChordStyle, DroneWave } from './playback';

export type SortMode = 'start' | 'fifths';
export type PlayAs = 'rotation' | 'zero';
export type RankDirection = 'high' | 'low';

export interface CompareSort {
  k: string;
  dir: 1 | -1;
}

export interface Settings {
  /** The loaded pitch classes, ascending. Opens on the major scale. */
  selection: number[];
  flats: boolean;
  showFifths: boolean;
  invMode: InversionMode;
  sortMode: SortMode;
  /** Chord expansion: a single expansion E0..E(n-1), or 'all'. */
  expansion: number | 'all';
  nameMode: NameMode;
  /** Link modes that differ by up to this many notes in the neighbours chart. */
  pathMax: number;
  playAs: PlayAs;
  /** Drone pitch: follow the playing mode's root, or a fixed pitch class. */
  dronePc: 'follow' | number;
  droneWave: DroneWave;
  droneVolume: number;
  chordStyle: ChordStyle;
  cmpMerge: boolean;
  cmpConv: PrimeConvention;
  cmpRank: RankDirection;
  cmpSort: CompareSort;
}

const KEY = 'hrifa.scale-explorer.settings.v1';

export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

export function defaultSettings(): Settings {
  return {
    selection: [...MAJOR_SCALE],
    flats: false,
    showFifths: false,
    invMode: 'off',
    sortMode: 'start',
    expansion: 1,
    nameMode: 'anchor',
    pathMax: 3,
    playAs: 'rotation',
    dronePc: 'follow',
    droneWave: 'sawtooth',
    droneVolume: 0.5,
    chordStyle: 'block',
    cmpMerge: false,
    cmpConv: 'rahn',
    cmpRank: 'high',
    cmpSort: { k: 'hem', dir: 1 },
  };
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

const int = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;

/** Coerce whatever is in storage into valid settings, falling back per field. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (typeof raw !== 'object' || raw === null) {
    return d;
  }
  const s = raw as Record<string, unknown>;
  const selection = Array.isArray(s.selection)
    ? [
        ...new Set(s.selection.filter((v): v is number => Number.isInteger(v) && v >= 0 && v < 12)),
      ].sort((a, b) => a - b)
    : d.selection;
  const inv = typeof s.invMode === 'string' ? s.invMode : 'off';
  const sort = (s.cmpSort ?? {}) as Record<string, unknown>;
  return {
    selection,
    flats: bool(s.flats, d.flats),
    showFifths: bool(s.showFifths, d.showFifths),
    invMode: (inv === 'off' || inv === 'root' || /^I(?:[0-9]|1[01])$/.test(inv)
      ? inv
      : 'off') as InversionMode,
    sortMode: oneOf(s.sortMode, ['start', 'fifths'], d.sortMode),
    expansion: s.expansion === 'all' ? 'all' : int(s.expansion, 0, 11, d.expansion as number),
    nameMode: oneOf(s.nameMode, ['anchor', 'tertian'], d.nameMode),
    pathMax: int(s.pathMax, 1, 6, d.pathMax),
    playAs: oneOf(s.playAs, ['rotation', 'zero'], d.playAs),
    dronePc:
      s.dronePc === 'follow'
        ? 'follow'
        : int(s.dronePc, 0, 11, -1) < 0
          ? 'follow'
          : (s.dronePc as number),
    droneWave: oneOf(s.droneWave, ['sawtooth', 'square', 'triangle', 'sine'], d.droneWave),
    droneVolume:
      typeof s.droneVolume === 'number' && s.droneVolume >= 0 && s.droneVolume <= 1
        ? s.droneVolume
        : d.droneVolume,
    chordStyle: oneOf(s.chordStyle, ['block', 'arp', 'both'], d.chordStyle),
    cmpMerge: bool(s.cmpMerge, d.cmpMerge),
    cmpConv: oneOf(s.cmpConv, ['rahn', 'forte'], d.cmpConv),
    cmpRank: oneOf(s.cmpRank, ['high', 'low'], d.cmpRank),
    cmpSort: {
      k: typeof sort.k === 'string' ? sort.k : d.cmpSort.k,
      dir: sort.dir === -1 ? -1 : 1,
    },
  };
}

export function loadSettings(): Settings {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // best-effort: a full or blocked localStorage just means preferences do not persist
  }
}
