import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { ToneAudioEngine } from './ToneAudioEngine';
import type { AudioEngine } from './types';

const AudioEngineContext = createContext<AudioEngine | null>(null);

export function AudioEngineProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<AudioEngine | null>(null);
  engineRef.current ??= new ToneAudioEngine();

  useEffect(() => {
    const engine = engineRef.current;
    return () => engine?.dispose();
  }, []);

  return (
    <AudioEngineContext.Provider value={engineRef.current}>{children}</AudioEngineContext.Provider>
  );
}

export function useAudioEngine() {
  const engine = useContext(AudioEngineContext);
  if (!engine) {
    throw new Error('useAudioEngine must be used inside AudioEngineProvider.');
  }
  return engine;
}
