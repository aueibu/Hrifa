/** Stage developer options kept per viewer under the `hrifa.stage.` prefix. Storage can be missing or throw: never fatal. */
import { createContext, useContext } from 'react';
import type { StageStorage } from '../persistence';

export const TIP_DELAY_KEY = 'hrifa.stage.tipDelay.v1';
/** Tooltip open delay in ms (decided 2026-11-13, Q6). */
export const DEFAULT_TIP_DELAY = 330;
export const MAX_TIP_DELAY = 2000;

/** A stored or typed value to a whole number of ms in 0..2000; anything else gives the default. */
export function parseTipDelay(raw: unknown): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return DEFAULT_TIP_DELAY;
  }
  return Math.min(MAX_TIP_DELAY, Math.max(0, Math.round(n)));
}

export function loadTipDelay(storage: StageStorage | undefined): number {
  try {
    return parseTipDelay(storage?.getItem(TIP_DELAY_KEY) ?? null);
  } catch {
    return DEFAULT_TIP_DELAY;
  }
}

export function saveTipDelay(storage: StageStorage | undefined, ms: number): boolean {
  try {
    if (!storage) {
      return false;
    }
    storage.setItem(TIP_DELAY_KEY, String(parseTipDelay(ms)));
    return true;
  } catch {
    return false;
  }
}

export const TipDelayContext = createContext<number>(DEFAULT_TIP_DELAY);
export const useTipDelay = () => useContext(TipDelayContext);
