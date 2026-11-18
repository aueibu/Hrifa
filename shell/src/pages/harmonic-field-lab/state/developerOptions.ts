import { useCallback, useSyncExternalStore } from 'react';
import {
  BEAT_PARTIAL_LIMIT_MAX,
  HE_LIMITS,
  HE_LIMIT_DEFAULT,
  type HeLimit,
  MERGE_TOL_DEFAULT,
  RELATIVE_RING_STEP,
  cleanRingStep,
  clampMergeTol,
  type MergeKeep,
  type TintIntensity,
  type TintScale,
  type WheelReading,
} from '../../../lib/harmonic-field';
import { LINKED_ROOTS, type LinkedRoot } from '../audio/keymap';
import { TILE_LOOKS, type TileLook, type TintBand } from './tileColors';

/**
 * The lab's own per-viewer developer options (W-10: page-local; never reads another page's keys). Sanitized on load, so
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
  /**
   * Interval intensity, ONE lab-wide setting (H-37): simpler ratios tint more strongly and wider (default, `strong` = "Simple strong"),
   * or more complex ones (`faint` = "Complex strong"). Drives the Pairs Interval tint and the Relative picker's Color shading.
   */
  intervalIntensity: TintIntensity;
  /** Pairs panel, Color: Interval (H-22): strength on the fixed simplicity scale (default) or spread over this subset's range. */
  tintScale: TintScale;
  /** Pairs panel, Color: Interval (H-23): the tint band is centered in the cell (default) or starts at its left edge. */
  tintBand: TintBand;
  /**
   * Pairs panel, Beats view (H-21): a whole number 1 to 64, or null for Off (the default; stored as null, an absent key
   * reads as Off). With N set, a beat that needs a partial above N is dimmed and named so.
   */
  beatPartialLimit: number | null;
  /** How Modes and Pairs tiles look, in both schemes: `tinted` (default), `outlined` or `solid` (Radix Colors steps). */
  tileLook: TileLook;
  /** Stack an outline on Tinted and Solid tiles (always on in Outlined). */
  tileOutline: boolean;
  /** Chord cards (M4, H-24): add a third line, Error, with each note's signed error (default off). The hover tooltip always shows it. */
  cardNoteErrors: boolean;
  /** A1 (H-31): the harmonic sound uses the Roughness Partials and Rolloff (default); off keeps the sound at 7 partials and 0.88. */
  soundFollowsRoughness: boolean;
  /** Relative pitches (M8, H-33): the odd-limit step between the radial menu's four rings (whole number 2 to 10, default 5). */
  relativeRingStep: number;
  /** Harmonic entropy (M9, H-39): the candidate limit, every reduced n/d with n x d below it (10000, 30000 default, 100000, 250000 or 500000). */
  heLimit: HeLimit;
}

export const TOOLTIP_DELAY_DEFAULT = 250;
export const TOOLTIP_DELAY_MAX = 5000;

/** A delay as a whole number of ms in 0..5000; anything that is not a finite number gives the default. */
export function sanitizeTooltipDelay(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return TOOLTIP_DELAY_DEFAULT;
  }
  return Math.min(TOOLTIP_DELAY_MAX, Math.max(0, Math.round(v)));
}

/** A partial limit as a whole number in 1..64; absent, not a number or below 1 is Off (null). */
export function sanitizeBeatPartialLimit(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.round(v) < 1) {
    return null;
  }
  return Math.min(BEAT_PARTIAL_LIMIT_MAX, Math.round(v));
}

/** A stored look; the old `jewel` reads as `tinted`, the old `bright` as `solid`, anything unknown as `tinted`. */
export function sanitizeTileLook(v: unknown): TileLook {
  if (v === 'bright') {
    return 'solid';
  }
  return TILE_LOOKS.includes(v as TileLook) ? (v as TileLook) : 'tinted';
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
  tintScale: 'fixed',
  tintBand: 'center',
  beatPartialLimit: null,
  tileLook: 'tinted',
  tileOutline: true,
  cardNoteErrors: false,
  soundFollowsRoughness: true,
  relativeRingStep: RELATIVE_RING_STEP,
  heLimit: HE_LIMIT_DEFAULT,
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

/** Sanitize a stored string: anything unreadable or of the wrong type falls back to the default for that option. */
export function parseDeveloperOptions(raw: string | null): LabDeveloperOptions {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const o = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    return {
      modeSignAlways:
        typeof o.modeSignAlways === 'boolean' ? o.modeSignAlways : defaults.modeSignAlways,
      keepModeRoot: typeof o.keepModeRoot === 'boolean' ? o.keepModeRoot : defaults.keepModeRoot,
      tooltips: typeof o.tooltips === 'boolean' ? o.tooltips : defaults.tooltips,
      tooltipDelay: sanitizeTooltipDelay(o.tooltipDelay),
      linkedRootDefault: LINKED_ROOTS.includes(o.linkedRootDefault as LinkedRoot)
        ? (o.linkedRootDefault as LinkedRoot)
        : defaults.linkedRootDefault,
      mergeTolerance: clampMergeTol(o.mergeTolerance),
      mergeKeeps: o.mergeKeeps === 'recent' ? 'recent' : 'first',
      intervalColor: o.intervalColor === 'rank' ? 'rank' : 'size',
      intervalIntensity: o.intervalIntensity === 'faint' ? 'faint' : 'strong',
      tintScale: o.tintScale === 'relative' ? 'relative' : 'fixed',
      tintBand: o.tintBand === 'left' ? 'left' : 'center',
      beatPartialLimit: sanitizeBeatPartialLimit(o.beatPartialLimit),
      tileLook: sanitizeTileLook(o.tileLook),
      tileOutline: typeof o.tileOutline === 'boolean' ? o.tileOutline : defaults.tileOutline,
      cardNoteErrors:
        typeof o.cardNoteErrors === 'boolean' ? o.cardNoteErrors : defaults.cardNoteErrors,
      soundFollowsRoughness:
        typeof o.soundFollowsRoughness === 'boolean'
          ? o.soundFollowsRoughness
          : defaults.soundFollowsRoughness,
      relativeRingStep: cleanRingStep(o.relativeRingStep),
      heLimit: HE_LIMITS.includes(o.heLimit as HeLimit) ? (o.heLimit as HeLimit) : HE_LIMIT_DEFAULT,
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
  next.tooltipDelay = sanitizeTooltipDelay(next.tooltipDelay);
  next.mergeTolerance = clampMergeTol(next.mergeTolerance);
  next.beatPartialLimit = sanitizeBeatPartialLimit(next.beatPartialLimit);
  next.relativeRingStep = cleanRingStep(next.relativeRingStep);
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
