import type { MusicalPerformanceEvent, MusicalPerformancePlan } from '../audio/types';
import {
  defaultMusicalTimeline,
  musicalDuration,
  musicalPosition,
  type MusicalDuration,
} from '../musicalTime';
import { pitchClassPreviewMidicents } from '../pitch';
import { defaultSoundSettings, layerSound } from '../sounds';
import { defaultTransportSettings, transportPulse } from '../transport';
import type { AuditionContext, AuditionPlan, AuditionSettings, StoredDataBlock } from './registry';

/** Pitched auditions use the preview voice the desk already plays notes with. */
const AUDITION_INSTRUMENT = 'preview.triangle';
const AUDITION_BUS = 'preview';
const AUDITION_VELOCITY = 0.8;

/** What the transport and the sound settings give today: a sixteenth pulse, the rhythm's primary voice. */
export const defaultAuditionContext: AuditionContext = {
  pulseUnit: transportPulse(defaultTransportSettings).duration,
  rhythmSound: layerSound(defaultSoundSettings.rhythm, 0),
};

/** One quarter note: how long each pitch of a pitch set or pitch-class set sounds. */
const PITCH_LENGTH = musicalDuration(1);

export function musicalPlanOf(
  block: StoredDataBlock,
  events: MusicalPerformanceEvent[],
  cycleLength: MusicalDuration,
  warnings: string[] = []
): MusicalPerformancePlan {
  return {
    id: `${block.id}:audition`,
    sourceId: block.id,
    // The default timeline; the caller (the transport) swaps in the project's tempo.
    timebase: { kind: 'musical', timeline: defaultMusicalTimeline },
    duration: cycleLength,
    events,
    warnings,
  };
}

/** The label the status line shows while a block plays. */
export function auditionLabel(block: StoredDataBlock): string {
  return `Auditioning ${block.name}.`;
}

/**
 * A set of midicent pitches as a plan. `sequence`: ascending by pitch, one quarter each, back to
 * back. `together`: all pitches in one group, one quarter long. Nothing is added or removed.
 */
export function pitchesPlan(
  block: StoredDataBlock,
  pitches: readonly number[],
  mode: AuditionSettings['mode']
): AuditionPlan {
  const sorted = [...pitches].sort((a, b) => a - b);
  const events = sorted.map(
    (pitchMidicents, index): MusicalPerformanceEvent => ({
      id: `${block.id}:audition:${index}`,
      at: musicalPosition(mode === 'sequence' ? index : 0),
      duration: PITCH_LENGTH,
      pitchMidicents,
      velocity: AUDITION_VELOCITY,
      instrumentId: AUDITION_INSTRUMENT,
      busId: AUDITION_BUS,
      provenance: [],
    })
  );
  const cycleLength = musicalDuration(mode === 'sequence' ? sorted.length : 1);
  return {
    plan: musicalPlanOf(block, events, cycleLength),
    cycleLength,
    label: auditionLabel(block),
  };
}

/** Pitch classes as midicents at `baseOctave`: (pc + offset) steps of the EDO, no wrap, no mod. */
export function pitchClassMidicents(
  pitchClasses: readonly number[],
  { baseOctave, offset }: Pick<AuditionSettings, 'baseOctave' | 'offset'>,
  edo: number
): number[] {
  return pitchClasses.map((pc) => pitchClassPreviewMidicents(pc + offset, baseOctave, edo)[0]);
}
