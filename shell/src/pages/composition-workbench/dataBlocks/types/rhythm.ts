import type { MusicalPerformanceEvent } from '../../audio/types';
import type { DataPacket } from '../../model';
import {
  compareRational,
  multiplyRational,
  musicalDuration,
  rational,
  rationalFromNumber,
  subtractRational,
  type MusicalDuration,
} from '../../musicalTime';
import { rhythmOrigin } from '../../rhythmFrame';
import { realizeRhythm, type RhythmStep } from '../../rhythmRealization';
import { auditionLabel, musicalPlanOf } from '../auditionPlans';
import {
  registerDataBlockType,
  type AuditionContext,
  type AuditionPlan,
  type AuditionSettings,
  type StoredDataBlock,
} from '../registry';
import { emptyPacket, packetBlock, refuseWhenEmpty } from './blank';

export const RHYTHM_TYPE_ID = 'rhythm';

/**
 * How long one pulse of the rhythm is: the frame's own size when it has one (unit quarterNote, or
 * `musicalExtent / extent`), else the transport's pulse from the context.
 */
function pulseLength(source: DataPacket, fallback: MusicalDuration): MusicalDuration {
  const frame = source.frame;
  if (frame?.unit === 'quarterNote') {
    return musicalDuration(1);
  }
  if (frame?.musicalExtent && frame.extent && frame.extent > 0) {
    const whole = frame.musicalExtent.quarterNotes;
    const pulses = rationalFromNumber(frame.extent);
    if (whole.numerator > 0) {
      return {
        quarterNotes: rational(
          whole.numerator * pulses.denominator,
          whole.denominator * pulses.numerator
        ),
      };
    }
  }
  return fallback;
}

/** The steps of a rhythm packet: inter-onset durations, or the bits of a rhythm pattern. */
function stepsOf(source: DataPacket): RhythmStep[] {
  if (source.domain === 'rhythmPattern') {
    const bits = (source.items[0]?.value as { bits?: number[] } | undefined)?.bits ?? [];
    // Each pulse is an onset (1) or a rest (0); a rest is a negative step.
    return bits.map((bit) => ({ duration: bit ? 1 : -1 }));
  }
  return source.items.map((item) => ({
    duration: Number(item.value),
    tie: item.tie,
    itemId: item.id,
  }));
}

function buildRhythm(
  block: StoredDataBlock,
  _settings: AuditionSettings,
  context: AuditionContext
): AuditionPlan {
  if (block.payload.kind !== 'packet') {
    throw new Error('A Rhythm holds a packet.');
  }
  const source = block.payload.packet;
  const pulse = pulseLength(source, context.pulseUnit);
  const cyclic = source.frame?.topology === 'cyclic';
  // The existing realization (rests, ties, gate, exact fractions), never a second copy.
  const realized = realizeRhythm({
    sourceId: block.id,
    layerId: 'audition',
    steps: stepsOf(source),
    origin: rhythmOrigin(source),
    cyclic,
    pulseUnit: pulse,
    sound: context.rhythmSound,
  });
  const extent = source.frame?.extent;
  const cycleQuarters =
    source.frame?.musicalExtent?.quarterNotes ??
    (extent && extent > 0
      ? multiplyRational(pulse.quarterNotes, rationalFromNumber(extent))
      : cyclic
        ? realized.span.quarterNotes
        : realized.end.quarterNotes);
  if (compareRational(cycleQuarters, rational(0)) <= 0) {
    throw new Error('This rhythm has no length to play.');
  }
  const events = realized.events
    .map((event): MusicalPerformanceEvent => {
      let at = event.at.quarterNotes;
      // A cyclic rhythm that starts late wraps its tail to the start of the cycle.
      while (cyclic && compareRational(at, cycleQuarters) >= 0) {
        at = subtractRational(at, cycleQuarters);
      }
      return { ...event, at: { quarterNotes: at }, busId: 'preview' };
    })
    .sort((x, y) => compareRational(x.at.quarterNotes, y.at.quarterNotes));
  const cycleLength = { quarterNotes: cycleQuarters };
  return {
    plan: musicalPlanOf(block, events, cycleLength, realized.warnings),
    cycleLength,
    label: auditionLabel(block),
  };
}

/**
 * Rhythm: inter-onset durations (`list | duration`, rests negative, ties on items) or the
 * `rhythmPattern` domain. A frame (cyclic or linear, extent, grouping) is allowed, a meter is not
 * required. Heard through the existing rhythm realization (A5) in the context's pulse and rhythm voice, ONE cycle: the loop is the control's job,
 * from `cycleLength` and `settings.loop`.
 */
export function registerRhythmType() {
  return registerDataBlockType({
    id: RHYTHM_TYPE_ID,
    label: 'Rhythm',
    family: 'time',
    channels: ['onset'],
    payload: 'packet',
    accepts: (packet) =>
      (packet.kind === 'list' && packet.domain === 'duration') || packet.domain === 'rhythmPattern',
    createBlank: (request) =>
      packetBlock(RHYTHM_TYPE_ID, request, emptyPacket('list', 'duration', { role: 'interOnset' })),
    preview: 'rhythm-bars',
    auditionControls: ['loop'],
    audition: { refuse: refuseWhenEmpty, build: buildRhythm },
  });
}
