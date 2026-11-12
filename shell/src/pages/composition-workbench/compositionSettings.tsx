import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
}

export const defaultCompositionSettings: CompositionSettings = {
  edo: 12,
  transport: defaultTransportSettings,
  sounds: defaultSoundSettings,
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
 * History key for the authored part of the settings (EDO, tempo, meter, pulse). Virtual: it is
 * never written to storage, which keeps holding the whole settings object.
 */
const AUTHORED_HISTORY_KEY = `${STORAGE_KEY}#authored`;

function authoredRaw(settings: CompositionSettings) {
  return JSON.stringify({
    edo: settings.edo,
    tempo: settings.transport.tempo,
    meter: settings.transport.meter,
    pulse: settings.transport.pulse,
  });
}

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
    // Only the authored settings are undoable; playback ones (metronome, count-in, voices) are not.
    recordChange({
      key: AUTHORED_HISTORY_KEY,
      previous: authoredRaw(previous),
      next: authoredRaw(next),
      virtual: true,
    });
  }, []);

  // Undo and redo write their target back through here.
  useEffect(
    () =>
      registerHistoryApplier(AUTHORED_HISTORY_KEY, (raw) => {
        try {
          const authored = JSON.parse(raw) as {
            edo: number;
            tempo: number;
            meter: string;
            pulse: string;
          };
          const current = settingsRef.current;
          // Playback settings stay as they are now; only the authored ones go back.
          const restored = sanitizeCompositionSettings({
            ...current,
            edo: authored.edo,
            transport: {
              ...current.transport,
              tempo: authored.tempo,
              meter: authored.meter,
              pulse: authored.pulse,
            },
          });
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
