import { registerDataBlockType } from '../registry';
import { emptyPacket, packetBlock } from './blank';

export const PITCH_CLASSES_TYPE_ID = 'pitch-classes';

/**
 * Pitch classes: the `pitchClass` domain, as a `list` or as `events` (what the desk's To pitch
 * classes makes from Notes: the timing is kept and each pitch is reduced). No audition until R2/R3.
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
  });
}
