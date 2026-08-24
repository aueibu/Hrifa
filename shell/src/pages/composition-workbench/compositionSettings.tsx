import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

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
}

export const defaultCompositionSettings: CompositionSettings = {
  edo: 12,
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
  return { edo };
}

const STORAGE_KEY = 'hrifa.composition-workbench.settings.v1';

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
}

const CompositionSettingsContext = createContext<CompositionSettingsContextValue | undefined>(
  undefined
);

export function CompositionSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompositionSettings>(() => readStoredSettings());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings remain usable in memory for this session when persistence is unavailable.
    }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<CompositionSettings>) => {
    setSettings((current) => sanitizeCompositionSettings({ ...current, ...patch }));
  }, []);

  return (
    <CompositionSettingsContext.Provider value={{ settings, updateSettings }}>
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
