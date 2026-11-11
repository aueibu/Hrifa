import type { CompositionModuleId } from './compositionWorkspace';
import type { DataPacket } from './model';

/**
 * What a port or module is about, for color on the patch canvas. This is not the routing signal type
 * (`signalTypes.ts` decides treatments): it adds events and audio, which routing has no treatment for.
 * Colors follow Bitwig's Grid: gates yellow, pitch orange, audio red; events are green and untyped
 * numbers stay neutral. The accent never encodes data (see THEMING.md).
 */
export type SignalCategory = 'rhythm' | 'pitch' | 'events' | 'audio' | 'numeric';

/** The `--mark-<hue>` that draws a category; `null` is the neutral muted text color. */
export const signalCategoryHue: Record<
  SignalCategory,
  'yellow' | 'orange' | 'green' | 'red' | null
> = {
  rhythm: 'yellow',
  pitch: 'orange',
  events: 'green',
  audio: 'red',
  numeric: null,
};

export const signalCategoryLabel: Record<SignalCategory, string> = {
  rhythm: 'Rhythm',
  pitch: 'Pitch',
  events: 'Events',
  audio: 'Audio',
  numeric: 'Numeric',
};

/** A CSS color for a category, for use as a custom property value. */
export function signalCategoryColor(category: SignalCategory): string {
  const hue = signalCategoryHue[category];
  return hue ? `var(--mark-${hue})` : 'var(--text-muted)';
}

export function categoryOfPacket(source?: DataPacket): SignalCategory {
  if (!source) {
    return 'numeric';
  }
  if (source.kind === 'events') {
    return 'events';
  }
  if (source.domain === 'pitch' || source.domain === 'pitchClass') {
    return 'pitch';
  }
  if (source.domain === 'duration') {
    return 'rhythm';
  }
  return 'numeric';
}

/** A module's title color: fixed by what it is for, so it does not change with what is wired in. */
export function categoryOfModule(moduleId: CompositionModuleId): SignalCategory {
  switch (moduleId) {
    case 'interference':
    case 'fractioning':
    case 'rhythm-list':
    case 'rhythm-edit':
    case 'rhythm-householder':
      return 'rhythm';
    case 'pitch-list':
    case 'scale-construction':
    case 'scale-evolution':
      return 'pitch';
    case 'melodicization':
      return 'events';
    case 'mixer':
      return 'audio';
    default:
      return 'numeric';
  }
}

/** What an inlet expects, shown even while nothing is connected to it. */
export function categoryOfInlet(moduleId: CompositionModuleId, port: string): SignalCategory {
  if (moduleId === 'mixer') {
    return 'audio';
  }
  if (port === 'rhythm') {
    return 'rhythm';
  }
  if (port === 'pitches') {
    return 'pitch';
  }
  return 'numeric';
}
