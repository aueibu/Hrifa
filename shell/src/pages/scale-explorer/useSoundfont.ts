import { useCallback, useState } from 'react';
import {
  loadSoundfontFile,
  type SoundfontInfo,
} from '../composition-workbench/audio/soundfontLibrary';

export interface SoundfontState {
  /** The opened file, once parsed. */
  info: SoundfontInfo | null;
  /** A file is being read and parsed (large files take a few seconds). */
  loading: boolean;
  error: string | null;
}

/** Opens a .sf2 file the user picks. The parsed file stays in the shared soundfont library for the session. */
export function useSoundfont() {
  const [state, setState] = useState<SoundfontState>({ info: null, loading: false, error: null });

  const open = useCallback(async (file: File) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const info = await loadSoundfontFile(file);
      setState({ info, loading: false, error: null });
      return info;
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : 'Could not read that SoundFont file.',
      }));
      return null;
    }
  }, []);

  return { ...state, open };
}
