/** Persisted playback + browsing preferences, same load/save pattern as interval-placement/settings.ts. */
export type SargamDegree =
  | 'S'
  | 'R1'
  | 'R2'
  | 'R3'
  | 'G1'
  | 'G2'
  | 'G3'
  | 'M1'
  | 'M2'
  | 'P'
  | 'D1'
  | 'D2'
  | 'D3'
  | 'N1'
  | 'N2'
  | 'N3';

export type MelodyInstrument = 'sitar' | 'bansuri' | 'santoor' | 'violin' | 'sine';

export const MELODY_INSTRUMENTS: { value: MelodyInstrument; label: string }[] = [
  { value: 'sitar', label: 'Sitar (plucked string)' },
  { value: 'bansuri', label: 'Bansuri (flute)' },
  { value: 'santoor', label: 'Santoor (dulcimer)' },
  { value: 'violin', label: 'Violin (bowed)' },
  { value: 'sine', label: 'Plain tone' },
];

/** One string of the tanpura sequence: a sargam degree plus its octave relative to the tonic (0 = the tonic's own
 * octave, -1 = one below, +1 = one above). */
export interface TanpuraNote {
  degree: SargamDegree;
  octave: -1 | 0 | 1;
}

/** Sa (own octave), Pa, Pa, Sa (low octave) -- the traditional four-string cycle. */
export function defaultTanpuraSequence(): TanpuraNote[] {
  return [
    { degree: 'S', octave: 0 },
    { degree: 'P', octave: 0 },
    { degree: 'P', octave: 0 },
    { degree: 'S', octave: -1 },
  ];
}

export interface Settings {
  /** The tonic's frequency in Hz -- "root Sa". Defaults to C4. */
  tonicHz: number;
  /** Which sargam degree of the CURRENT raga's own scale is treated as the playback root, i.e. where "Sa" starts
   * sounding from. Almost always 'S' -- exposed because the user asked for the root/Sa sargam to be selectable. */
  rootSargam: SargamDegree;
  melodyInstrument: MelodyInstrument;
  noteDurationMs: number;
  gapMs: number;
  loop: boolean;
  tanpuraOn: boolean;
  /** The tanpura's own string sequence and order -- independent of the melody, see TanpuraNote. */
  tanpuraSequence: TanpuraNote[];
  /** Milliseconds between successive plucks (the tanpura's own tempo, independent of the melody's). */
  tanpuraIntervalMs: number;
  tanpuraVolume: number; // 0..1
  melodyVolume: number; // 0..1
  lastVid: string | null;
}

const KEY = 'hrifa.raga-explorer.settings.v4'; // v4: reworked the plucked-string timbres and the tanpura's pacing

export function defaultSettings(): Settings {
  return {
    tonicHz: 261.63, // C4
    rootSargam: 'S',
    melodyInstrument: 'sitar',
    noteDurationMs: 380,
    gapMs: 40,
    loop: true,
    tanpuraOn: false,
    tanpuraSequence: defaultTanpuraSequence(),
    tanpuraIntervalMs: 800,
    tanpuraVolume: 0.25,
    melodyVolume: 0.45,
    lastVid: null,
  };
}

export function loadSettings(): Settings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) {
      return defaultSettings();
    }
    const merged = { ...defaultSettings(), ...(saved as Partial<Settings>) };
    if (!Array.isArray(merged.tanpuraSequence) || merged.tanpuraSequence.length === 0) {
      merged.tanpuraSequence = defaultTanpuraSequence();
    }
    return merged;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // best-effort: a full/blocked localStorage just means preferences don't persist
  }
}

export const COMMON_TONICS: { label: string; hz: number }[] = [
  { label: 'A3', hz: 220.0 },
  { label: 'A#3/Bb3', hz: 233.08 },
  { label: 'B3', hz: 246.94 },
  { label: 'C4', hz: 261.63 },
  { label: 'C#4/Db4', hz: 277.18 },
  { label: 'D4', hz: 293.66 },
  { label: 'D#4/Eb4', hz: 311.13 },
  { label: 'E4', hz: 329.63 },
  { label: 'F4', hz: 349.23 },
  { label: 'F#4/Gb4', hz: 369.99 },
  { label: 'G4', hz: 392.0 },
  { label: 'G#4/Ab4', hz: 415.3 },
];

export const SARGAM_DEGREES: SargamDegree[] = [
  'S',
  'R1',
  'R2',
  'R3',
  'G1',
  'G2',
  'G3',
  'M1',
  'M2',
  'P',
  'D1',
  'D2',
  'D3',
  'N1',
  'N2',
  'N3',
];
