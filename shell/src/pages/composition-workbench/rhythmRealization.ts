/**
 * Rhythm realization: the one place an inter-onset rhythm becomes timed musical events.
 *
 * See ARCHITECTURE.md, "Rhythm realization". A rhythm packet stays in its own unit (pulses). This
 * file gives it musical time through the transport's pulse value, a voice, and a gate. It never
 * touches tempo, the metronome, or looping: the engine's timeline resolves tempo, and a compiler
 * such as the mixer decides repeats.
 *
 * Steps follow OpenMusic's rhythm encoding where JavaScript allows: a negative duration is a
 * rest, and a tie is an explicit flag (OpenMusic's float marker cannot survive `1.0 === 1`).
 */

import type { InstrumentId, MusicalPerformanceEvent, MusicalPerformancePlan } from './audio/types';
import type { ChannelEvent, ChannelMaterial } from './mixer';
import type { DataPacket, Provenance } from './model';
import {
  addDuration,
  compareRational,
  multiplyRational,
  musicalPosition,
  musicalPositionToSeconds,
  rational,
  subtractRational,
  type MusicalDuration,
  type MusicalPosition,
  type MusicalTimeline,
  type Rational,
} from './musicalTime';
import { rhythmOrigin } from './rhythmFrame';
import type { ResolvedSound } from './sounds';
import { transportPulse, transportTimeline, type TransportSettings } from './transport';

/** Connected but not blurred: a pianist's release just before the next attack. */
export const DEFAULT_GATE_PERCENT = 95;
export const MIN_GATE_PERCENT = 1;
export const MAX_GATE_PERCENT = 200;

export interface RhythmStep {
  /** Pulses. Negative is a rest of that length. */
  duration: number;
  /** Continue the preceding sounding event instead of attacking. */
  tie?: boolean;
  /** Source item id, carried into provenance. */
  itemId?: string;
}

export interface RhythmAttack {
  index: number;
  atPulses: number;
  /** Pulses until the next attack, including any tied continuation. */
  slotPulses: number;
  itemId?: string;
}

export interface RhythmAttacks {
  attacks: RhythmAttack[];
  /** Σ|duration|: how long the rhythm itself lasts, not counting the origin. */
  spanPulses: number;
  /** origin + span: where the rhythm ends. */
  endPulses: number;
  warnings: string[];
}

/** Resolves steps into attack positions and slot lengths. Pure; works in pulses. */
export function rhythmAttacks(steps: RhythmStep[], origin = 0): RhythmAttacks {
  const attacks: RhythmAttack[] = [];
  const warnings: string[] = [];
  let cursor = origin;
  let previous: RhythmAttack | undefined;
  steps.forEach((step, index) => {
    const length = Math.abs(step.duration);
    if (!Number.isFinite(step.duration) || length === 0) {
      warnings.push(`Step ${index + 1} has no usable duration and was skipped.`);
      return;
    }
    if (step.duration < 0) {
      previous = undefined;
    } else if (step.tie) {
      if (previous) {
        previous.slotPulses += length;
      } else {
        warnings.push(`Step ${index + 1} is a tie with nothing to continue; it sounds as a rest.`);
      }
    } else {
      previous = { index, atPulses: cursor, slotPulses: length, itemId: step.itemId };
      attacks.push(previous);
    }
    cursor += length;
  });
  return { attacks, spanPulses: cursor - origin, endPulses: cursor, warnings };
}

export function clampGatePercent(gatePercent: number) {
  if (!Number.isFinite(gatePercent)) {
    return DEFAULT_GATE_PERCENT;
  }
  return Math.min(MAX_GATE_PERCENT, Math.max(MIN_GATE_PERCENT, gatePercent));
}

function pulsesToQuarterNotes(pulses: number, pulseUnit: MusicalDuration): Rational {
  return multiplyRational(pulseUnit.quarterNotes, rational(pulses));
}

export interface RealizedRhythm {
  events: ChannelEvent[];
  /** Σ|duration| as musical time. */
  span: MusicalDuration;
  /** origin + span as musical time. */
  end: MusicalDuration;
  warnings: string[];
}

export interface RealizeRhythmOptions {
  sourceId: string;
  /** Distinguishes layers in event ids and provenance. */
  layerId: string;
  steps: RhythmStep[];
  origin?: number;
  /** Musical length of one pulse (the transport's pulse value). */
  pulseUnit: MusicalDuration;
  sound: ResolvedSound;
  gatePercent?: number;
}

export function realizeRhythm({
  sourceId,
  layerId,
  steps,
  origin = 0,
  pulseUnit,
  sound,
  gatePercent = DEFAULT_GATE_PERCENT,
}: RealizeRhythmOptions): RealizedRhythm {
  const gate = clampGatePercent(gatePercent);
  const resolved = rhythmAttacks(steps, origin);
  const gateRatio = rational(Math.round(gate * 100), 10_000);
  const events = resolved.attacks.map((attack): ChannelEvent => {
    const at = pulsesToQuarterNotes(attack.atPulses, pulseUnit);
    const slot = pulsesToQuarterNotes(attack.slotPulses, pulseUnit);
    const provenance: Provenance = {
      sourceModuleInstance: sourceId,
      sourceItemIds: attack.itemId ? [attack.itemId] : [],
      transformation: 'realize-rhythm',
      parameters: { layer: layerId, index: attack.index, gatePercent: gate },
    };
    return {
      id: `${sourceId}:${layerId}:attack:${attack.atPulses}`,
      at: { quarterNotes: at },
      duration: { quarterNotes: multiplyRational(slot, gateRatio) },
      pitchMidicents: sound.pitchMidicents,
      velocity: 1,
      instrumentId: sound.instrumentId as InstrumentId,
      provenance: [provenance],
    };
  });
  return {
    events,
    span: { quarterNotes: pulsesToQuarterNotes(resolved.spanPulses, pulseUnit) },
    end: { quarterNotes: pulsesToQuarterNotes(resolved.endPulses, pulseUnit) },
    warnings: resolved.warnings,
  };
}

export interface RhythmPreviewLayer {
  layerId: string;
  steps: RhythmStep[];
  origin?: number;
  sound: ResolvedSound;
  /** Overrides the plan-wide gate for this layer. */
  gatePercent?: number;
  busId?: string;
}

/**
 * A musical-time preview of one or more rhythm layers played together (Rhythm Householder's A/B,
 * Interference's generators). The plan runs to the end of the longest layer, or to the end of the
 * last sounding tail when a gate over 100% rings past it.
 */
export function createRhythmPreviewPlan({
  sourceId,
  layers,
  pulseUnit,
  timeline,
  gatePercent = DEFAULT_GATE_PERCENT,
}: {
  sourceId: string;
  layers: RhythmPreviewLayer[];
  pulseUnit: MusicalDuration;
  timeline: MusicalTimeline;
  gatePercent?: number;
}): MusicalPerformancePlan {
  const warnings: string[] = [];
  const events: MusicalPerformanceEvent[] = [];
  let end: MusicalPosition = musicalPosition(0);
  for (const layer of layers) {
    const realized = realizeRhythm({
      sourceId,
      layerId: layer.layerId,
      steps: layer.steps,
      origin: layer.origin,
      pulseUnit,
      sound: layer.sound,
      gatePercent: layer.gatePercent ?? gatePercent,
    });
    warnings.push(...realized.warnings);
    if (compareRational(realized.end.quarterNotes, end.quarterNotes) > 0) {
      end = { quarterNotes: realized.end.quarterNotes };
    }
    for (const event of realized.events) {
      const tail = addDuration(event.at, event.duration);
      if (compareRational(tail.quarterNotes, end.quarterNotes) > 0) {
        end = tail;
      }
      events.push({ ...event, busId: layer.busId ?? 'preview' });
    }
  }
  return {
    id: `${sourceId}:rhythm-preview`,
    sourceId,
    timebase: { kind: 'musical', timeline },
    duration: { quarterNotes: end.quarterNotes },
    events,
    warnings,
  };
}

/** What every rhythm preview needs from the global transport: its pulse value and timeline. */
export function transportRhythmContext(transport: TransportSettings) {
  return { pulseUnit: transportPulse(transport).duration, timeline: transportTimeline(transport) };
}

/** Length of a musical-time plan in seconds, for status messages. */
export function musicalPlanSeconds(plan: MusicalPerformancePlan) {
  return musicalPositionToSeconds(
    { quarterNotes: plan.duration.quarterNotes },
    plan.timebase.timeline.tempoMap
  );
}

/**
 * A `list | duration | inter-onset` packet as mixer channel material. The cycle is the frame's
 * extent in pulses for a cyclic frame, otherwise the end of the rhythm (origin + span). A cyclic
 * rhythm whose origin pushes attacks past the extent wraps them to the start of the cycle.
 */
export function materialFromRhythmPacket(
  packet: DataPacket<number>,
  options: Omit<RealizeRhythmOptions, 'steps' | 'origin'>
): ChannelMaterial {
  if (packet.kind !== 'list' || packet.domain !== 'duration' || packet.role !== 'interOnset') {
    throw new Error('Mixer rhythm material requires a list | duration | inter-onset packet.');
  }
  const steps = packet.items.map((item): RhythmStep => {
    if (typeof item.value !== 'number') {
      throw new Error('Mixer rhythm material requires plain numeric durations.');
    }
    return { duration: item.value, itemId: item.id };
  });
  const origin = rhythmOrigin(packet);
  const realized = realizeRhythm({ ...options, steps, origin });
  const cyclicExtent =
    packet.frame?.topology === 'cyclic' &&
    typeof packet.frame.extent === 'number' &&
    packet.frame.extent > 0
      ? packet.frame.extent
      : undefined;
  if (cyclicExtent === undefined) {
    return {
      events: realized.events,
      period: realized.end,
      warnings: [...packet.warnings, ...realized.warnings],
    };
  }
  const period = pulsesToQuarterNotes(cyclicExtent, options.pulseUnit);
  const events = realized.events.map((event) => {
    let at = event.at.quarterNotes;
    while (compareRational(at, period) >= 0) {
      at = subtractRational(at, period);
    }
    return { ...event, at: { quarterNotes: at } };
  });
  return {
    events,
    period: { quarterNotes: period },
    warnings: [...packet.warnings, ...realized.warnings],
  };
}
