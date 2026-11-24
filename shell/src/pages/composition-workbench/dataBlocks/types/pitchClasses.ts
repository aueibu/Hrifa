import type { DataPacket } from '../../model';
import { pitchClassGroupToArray, type PitchClassItemValue } from '../../pitch';
import { pitchClassMidicents, pitchesPlan } from '../auditionPlans';
import { registerDataBlockType } from '../registry';
import { emptyPacket, packetBlock, refuseWhenEmpty } from './blank';

export const PITCH_CLASSES_TYPE_ID = 'pitch-classes';

/**
 * Pitch classes: the `pitchClass` domain, as a `list` or as `events` (what the desk's To pitch
 * classes makes from Notes: the timing is kept and each pitch is reduced).
 * Heard in a register (A4): pitch = (pc + offset) steps of the EDO above the base octave's C, no wrap
 * and no mod (offset 3 on {0, 4, 7} at 12-EDO sounds 3, 7, 10). The EDO is the packet encoding
 * `chromatic-N` (12 when absent). The offset is a hearing setting, never written to the data.
 */
export function registerPitchClassesType() {
  return registerDataBlockType({
    id: PITCH_CLASSES_TYPE_ID,
    label: 'Pitch classes',
    family: 'pitch',
    channels: ['pitch'],
    payload: 'packet',
    accepts: (packet) =>
      (packet.kind === 'list' || packet.kind === 'events') && packet.domain === 'pitchClass',
    createBlank: (request) =>
      packetBlock(
        PITCH_CLASSES_TYPE_ID,
        request,
        emptyPacket('list', 'pitchClass', { encoding: 'chromatic-12' })
      ),
    preview: 'values-text',
    auditionControls: ['mode', 'octave', 'offset', 'loop'],
    audition: {
      refuse: refuseWhenEmpty,
      build: (block, settings) => {
        if (block.payload.kind !== 'packet') {
          throw new Error('Pitch classes hold a packet.');
        }
        const source = block.payload.packet;
        const pitchClasses = source.items.flatMap((item) =>
          source.kind === 'events'
            ? ((item.value as { pitchClasses: number[] }).pitchClasses ?? [])
            : pitchClassGroupToArray(item.value as PitchClassItemValue)
        );
        // A set has no repeats: a pitch class that occurs twice sounds once. The events form plays as
        // a set too, its timing ignored.
        const midicents = pitchClassMidicents([...new Set(pitchClasses)], settings, edoOf(source));
        return pitchesPlan(block, midicents, settings.mode);
      },
    },
  });
}

/** The steps per octave of a pitch-class packet: `chromatic-N` gives N, anything else 12. */
export function edoOf(packet: DataPacket): number {
  const match = /^chromatic-(\d+)$/.exec(packet.encoding ?? '');
  const edo = match ? Number(match[1]) : 12;
  return edo > 0 ? edo : 12;
}
