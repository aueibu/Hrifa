import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  makePitchSet,
  PITCH_SET_PRESETS,
  presetPitchSet,
  type PitchSet,
  type PitchSetPreset,
} from './chordInput/pitchSet';
import { recordChange, registerHistoryApplier } from './history';
import { isReloading } from './reloading';
import { defaultSoundSettings, sanitizeSoundSettings, type SoundSettings } from './sounds';
import {
  defaultTransportSettings,
  isValidMeter,
  MAX_TEMPO,
  MIN_TEMPO,
  transportPulseOptions,
  type TransportSettings,
} from './transport';

// Global, workbench-wide settings — as opposed to per-module state (which lives in each
// module's own usePersistentState calls) or per-route treatments (routeTreatments.ts). A
// setting belongs here when several unrelated modules need to agree on it without wiring it
// through every connection between them (EDO is the first case: Scale Construction, Scale
// Evolution, Pitch List, Arithmetic, and route treatments all need the same answer to "how many
// steps per octave").
//
// Adding a new setting touches exactly three things: a field on this interface, a default in
// defaultCompositionSettings, and one line in sanitizeCompositionSettings — plus a control in
// CompositionSettingsPanel.tsx. Nothing about the context, provider, or storage changes.
export interface CompositionSettings {
  // Steps per octave for pitch-CLASS material (Scale Construction, Scale Evolution, Pitch
  // List's "pitch classes" format, Arithmetic's pitchClass branch, and pitch route treatments'
  // pitch-class transpose/invert/voice-as-pitch step). Concrete MIDI/note-name pitch input and
  // display stay fixed at 12-EDO regardless of this setting — that's real MIDI, not abstract
  // pitch-class material, and has no other meaning to redefine.
  edo: number;
  // Tempo, meter, pulse length, metronome and count-in — the DAW-style transport in the header.
  // Every rhythm preview follows it, so rhythms sound at the same speed in every module and line
  // up with one shared beat. See transport.ts.
  transport: TransportSettings;
  // Primary/secondary/tertiary preview voices for rhythm and for the metronome. See sounds.ts.
  sounds: SoundSettings;
  // The note editor colours each note by its scale degree (from C, repeating every octave) instead
  // of one colour for all. Off by default. See scaleDegreeColor.ts.
  colorByScaleDegree: boolean;
  // The project's pitch set ("key") that chord input offers chords from. Always for `edo`.
  pitchSet: ProjectPitchSet;
}

/**
 * The stored pitch set: the PitchSet (edo + absolute pcs) plus the preset and tonic that last
 * filled it, so the settings control can show them. `pcs` is authoritative: toggling a pitch
 * edits it and leaves preset and tonic as the last shortcut used.
 */
export interface ProjectPitchSet extends PitchSet {
  preset: PitchSetPreset;
  tonic: number;
}

/** Major (tonic C) at 12-EDO, chromatic at every other EDO (human decision 2026-11-13). */
export function defaultProjectPitchSet(edo: number): ProjectPitchSet {
  const preset: PitchSetPreset = edo === 12 ? 'major' : 'chromatic';
  return { ...presetPitchSet(preset, 0, edo), preset, tonic: 0 };
}

/**
 * Fill the set from a preset and tonic (the settings control's shortcut). Outside 12-EDO only
 * chromatic is defined, so the stored preset and tonic say chromatic and 0 rather than the
 * requested preset the pitches no longer follow.
 */
export function projectPitchSetFromPreset(
  preset: PitchSetPreset,
  tonic: number,
  edo: number
): ProjectPitchSet {
  if (edo !== 12 && preset !== 'chromatic') {
    return projectPitchSetFromPreset('chromatic', 0, edo);
  }
  return { ...presetPitchSet(preset, tonic, edo), preset, tonic };
}

function sanitizePitchSet(raw: unknown, edo: number): ProjectPitchSet {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
  const inRange = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < edo;
  if (
    !c ||
    c.edo !== edo ||
    !Array.isArray(c.pcs) ||
    !c.pcs.every(inRange) ||
    !PITCH_SET_PRESETS.includes(c.preset as PitchSetPreset) ||
    !inRange(c.tonic)
  ) {
    return defaultProjectPitchSet(edo);
  }
  return {
    ...makePitchSet(edo, c.pcs as number[]),
    preset: c.preset as PitchSetPreset,
    tonic: c.tonic,
  };
}

export const defaultCompositionSettings: CompositionSettings = {
  edo: 12,
  transport: defaultTransportSettings,
  sounds: defaultSoundSettings,
  colorByScaleDegree: false,
  pitchSet: defaultProjectPitchSet(12),
};

// Each field is read and validated independently, then merged over the defaults. A stored blob
// from before a field existed just gets that field's default rather than failing validation and
// discarding the whole object; one field failing validation doesn't take the rest down with it.
function sanitizeCompositionSettings(raw: unknown): CompositionSettings {
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const edo =
    typeof candidate.edo === 'number' && Number.isInteger(candidate.edo) && candidate.edo >= 1
      ? candidate.edo
      : defaultCompositionSettings.edo;
  return {
    edo,
    transport: sanitizeTransport(candidate.transport),
    sounds: sanitizeSoundSettings(candidate.sounds),
    colorByScaleDegree: candidate.colorByScaleDegree === true,
    // An EDO change leaves the old set's edo mismatched, so it resets to the new EDO's default.
    pitchSet: sanitizePitchSet(candidate.pitchSet, edo),
  };
}

function sanitizeTransport(raw: unknown): TransportSettings {
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fallback = defaultTransportSettings;
  const tempo =
    typeof candidate.tempo === 'number' && Number.isFinite(candidate.tempo)
      ? Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, candidate.tempo))
      : fallback.tempo;
  const volume =
    typeof candidate.metronomeVolume === 'number' && Number.isFinite(candidate.metronomeVolume)
      ? Math.min(100, Math.max(0, candidate.metronomeVolume))
      : fallback.metronomeVolume;
  return {
    tempo,
    meter: isValidMeter(candidate.meter) ? candidate.meter : fallback.meter,
    pulse: transportPulseOptions.some((option) => option.value === candidate.pulse)
      ? (candidate.pulse as string)
      : fallback.pulse,
    metronome: typeof candidate.metronome === 'boolean' ? candidate.metronome : fallback.metronome,
    metronomeVolume: volume,
    countIn: typeof candidate.countIn === 'boolean' ? candidate.countIn : fallback.countIn,
  };
}

export const STORAGE_KEY = 'hrifa.composition-workbench.settings.v1';

/**
 * History key for the settings. Virtual: it is never written to storage, which keeps holding the
 * whole settings object. Every persisted setting (EDO, tempo, meter, pulse, metronome, count-in,
 * metronome volume, voices, pitch set) is a user choice, so the step holds the whole object.
 */
const SETTINGS_HISTORY_KEY = `${STORAGE_KEY}#settings`;

function readStoredSettings(): CompositionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeCompositionSettings(JSON.parse(raw)) : defaultCompositionSettings;
  } catch {
    return defaultCompositionSettings;
  }
}

interface CompositionSettingsContextValue {
  settings: CompositionSettings;
  updateSettings(patch: Partial<CompositionSettings>): void;
  updateTransport(patch: Partial<TransportSettings>): void;
}

const CompositionSettingsContext = createContext<CompositionSettingsContextValue | undefined>(
  undefined
);

export function CompositionSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompositionSettings>(() => readStoredSettings());

  useEffect(() => {
    if (isReloading()) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings remain usable in memory for this session when persistence is unavailable.
    }
  }, [settings]);

  // Settings live outside usePersistentState, so they record through the shared history here.
  // The ref lets several updates in one event build on each other.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const commit = useCallback((compute: (current: CompositionSettings) => CompositionSettings) => {
    const previous = settingsRef.current;
    const next = compute(previous);
    settingsRef.current = next;
    setSettings(next);
    recordChange({
      key: SETTINGS_HISTORY_KEY,
      previous: JSON.stringify(previous),
      next: JSON.stringify(next),
      virtual: true,
    });
  }, []);

  // Undo and redo write their target back through here.
  useEffect(
    () =>
      registerHistoryApplier(SETTINGS_HISTORY_KEY, (raw) => {
        try {
          const restored = sanitizeCompositionSettings(JSON.parse(raw));
          settingsRef.current = restored;
          setSettings(restored);
          return true;
        } catch {
          return false;
        }
      }),
    []
  );

  const updateSettings = useCallback(
    (patch: Partial<CompositionSettings>) =>
      commit((current) => sanitizeCompositionSettings({ ...current, ...patch })),
    [commit]
  );

  const updateTransport = useCallback(
    (patch: Partial<TransportSettings>) =>
      commit((current) =>
        sanitizeCompositionSettings({ ...current, transport: { ...current.transport, ...patch } })
      ),
    [commit]
  );

  return (
    <CompositionSettingsContext.Provider value={{ settings, updateSettings, updateTransport }}>
      {children}
    </CompositionSettingsContext.Provider>
  );
}

export function useCompositionSettings() {
  const context = useContext(CompositionSettingsContext);
  if (!context) {
    throw new Error('useCompositionSettings must be used within a CompositionSettingsProvider.');
  }
  return context;
}
