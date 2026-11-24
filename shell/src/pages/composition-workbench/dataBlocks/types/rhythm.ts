import { registerDataBlockType } from '../registry';
import { emptyPacket, packetBlock } from './blank';

export const RHYTHM_TYPE_ID = 'rhythm';

/**
 * Rhythm: inter-onset durations (`list | duration`, rests negative, ties on items) or the
 * `rhythmPattern` domain. A frame (cyclic or linear, extent, grouping) is allowed, a meter is not
 * required. No audition until R2/R3.
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
  });
}
