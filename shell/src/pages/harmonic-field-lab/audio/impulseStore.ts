/**
 * The loaded reverb impulse as shared runtime state (A1, H-31): the audio hook (which gives it to the engine) and the Sound
 * popover (which shows its name and length) read the same one. Never stored here: `impulseStorage.ts` keeps it in
 * IndexedDB, this module reads that once per page load.
 */
import { useSyncExternalStore } from 'react';
import { loadImpulse } from './impulseStorage';
import type { ImpulseData } from './reverb';

export interface ImpulseState {
  /** The stored impulse has been looked for (found or not). */
  loaded: boolean;
  /** The impulse in use, or null. */
  data: ImpulseData | null;
  /** A one-line note for the popover (the stored impulse was lost, or cannot be kept), or null. */
  note: string | null;
  /** A file is being read and decoded. */
  busy: boolean;
}

const initial = (): ImpulseState => ({ loaded: false, data: null, note: null, busy: false });
let state: ImpulseState = initial();
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const getImpulseState = (): ImpulseState => state;

export function patchImpulse(patch: Partial<ImpulseState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const useImpulseState = (): ImpulseState =>
  useSyncExternalStore(subscribe, getImpulseState, getImpulseState);

/** Read the stored impulse once per page load (later calls wait for the same read). */
export function ensureImpulseLoaded(): Promise<void> {
  loading ??= loadImpulse().then((data) => {
    // a file loaded while the read was running wins over the stored one
    patchImpulse({ loaded: true, data: state.data ?? data });
  });
  return loading;
}

/** Forget everything (tests). */
export function resetImpulseStore(): void {
  state = initial();
  loading = null;
  listeners.forEach((l) => l());
}
