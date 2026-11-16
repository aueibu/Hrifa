import { useCallback, useSyncExternalStore } from 'react';
import {
  MERGE_TOL_DEFAULT,
  clampMergeTol,
  type MergeKeep,
  type TintIntensity,
  type WheelReading,
} from '../../../lib/harmonic-field';
import { LINKED_ROOTS, type LinkedRoot } from '../audio/keymap';

/**
 * The lab's own per-viewer developer options (W-10: page-local; never reads another page's keys). Sanitised on load, so
 * damaged data reads as the defaults; nothing is written until an option is changed.
 */
export const LAB_DEVELOPER_KEY = 'hrifa.harmonic-field-lab.developer.v1';

export interface LabDeveloperOptions {
  /** Mode tiles always show a + or - sign (default); off shows it only on hover, with the number. */
  modeSignAlways: boolean;
  /** Adding or removing a note keeps the same note as the mode root (default); off keeps the mode number instead. */
  keepModeRoot: boolean;
  /** Hover tooltips appear (default); off shows none anywhere in the lab (preset descriptions are content, not tooltips). */
  tooltips: boolean;
  /** Milliseconds the pointer must rest before a tooltip appears (0 to 5000, default 250). */
  tooltipDelay: number;
  /** Linked melody root used while settings.v1 has no stored choice (default Re-root). */
  linkedRootDefault: LinkedRoot;
  /** Composites (M8c): pitches this many cents apart or less merge into one note (0 to 50, default 5). */
  mergeTolerance: number;
  /** Composites: which pitch a merged note shows, the first added (default) or the most recent. */
  mergeKeeps: MergeKeep;
  /** Pairs panel, Color: Interval: hue from the interval's size around the repeat (default), or from its rank among the sizes. */
  intervalColor: WheelReading;
  /** Pairs panel, Color: Interval: simpler ratios tint more strongly (default) or more faintly. */
  intervalIntensity: TintIntensity;
}

export const TOOLTIP_DELAY_DEFAULT = 250;
export const TOOLTIP_DELAY_MAX = 5000;

/** A delay as a whole number of ms in 0..5000; anything that is not a finite number gives the default. */
export function sanitiseTooltipDelay(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return TOOLTIP_DELAY_DEFAULT;
  }
  return Math.min(TOOLTIP_DELAY_MAX, Math.max(0, Math.round(v)));
}

const defaults: LabDeveloperOptions = {
  modeSignAlways: true,
  keepModeRoot: true,
  tooltips: true,
  tooltipDelay: TOOLTIP_DELAY_DEFAULT,
  linkedRootDefault: 'reroot',
  mergeTolerance: MERGE_TOL_DEFAULT,
  mergeKeeps: 'first',
  intervalColor: 'size',
  intervalIntensity: 'strong',
};

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: LabDeveloperOptions } | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(LAB_DEVELOPER_KEY);
  } catch {
    return null;
  }
}

/** Sanitise a stored string: anything unreadable or of the wrong type falls back to the default for that option. */
export function parseDeveloperOptions(raw: string | null): LabDeveloperOptions {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const o = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    return {
      modeSignAlways:
        typeof o.modeSignAlways === 'boolean' ? o.modeSignAlways : defaults.modeSignAlways,
      keepModeRoot: typeof o.keepModeRoot === 'boolean' ? o.keepModeRoot : defaults.keepModeRoot,
      tooltips: typeof o.tooltips === 'boolean' ? o.tooltips : defaults.tooltips,
      tooltipDelay: sanitiseTooltipDelay(o.tooltipDelay),
      linkedRootDefault: LINKED_ROOTS.includes(o.linkedRootDefault as LinkedRoot)
        ? (o.linkedRootDefault as LinkedRoot)
        : defaults.linkedRootDefault,
      mergeTolerance: clampMergeTol(o.mergeTolerance),
      mergeKeeps: o.mergeKeeps === 'recent' ? 'recent' : 'first',
      intervalColor: o.intervalColor === 'rank' ? 'rank' : 'size',
      intervalIntensity: o.intervalIntensity === 'faint' ? 'faint' : 'strong',
    };
  } catch {
    return defaults;
  }
}

export function readDeveloperOptions(): LabDeveloperOptions {
  const raw = readRaw();
  if (cache && cache.raw === raw) {
    return cache.value;
  }
  const value = parseDeveloperOptions(raw);
  cache = { raw, value };
  return value;
}

export function writeDeveloperOptions(patch: Partial<LabDeveloperOptions>) {
  const next = { ...readDeveloperOptions(), ...patch };
  next.tooltipDelay = sanitiseTooltipDelay(next.tooltipDelay);
  next.mergeTolerance = clampMergeTol(next.mergeTolerance);
  try {
    localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify(next));
  } catch {
    // kept in memory for this session when storage is unavailable
  }
  cache = { raw: readRaw(), value: next };
  listeners.forEach((l) => l());
}

/** Forget the cached read (tests change storage behind the module's back). */
export function resetDeveloperOptionsCache() {
  cache = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLabDeveloperOptions() {
  const options = useSyncExternalStore(subscribe, readDeveloperOptions, () => defaults);
  const update = useCallback(
    (patch: Partial<LabDeveloperOptions>) => writeDeveloperOptions(patch),
    []
  );
  return [options, update] as const;
}
