import { registerDataBlockType } from '../registry';
import { emptyPacket, packetBlock } from './blank';

export const PITCH_SET_TYPE_ID = 'pitch-set';

/** Pitch set: `list | pitch`, midicent pitches. No audition until R2/R3. */
export function registerPitchSetType() {
  return registerDataBlockType({
    id: PITCH_SET_TYPE_ID,
    label: 'Pitch set',
    family: 'pitch',
    channels: ['pitch'],
    payload: 'packet',
    accepts: (packet) => packet.kind === 'list' && packet.domain === 'pitch',
    createBlank: (request) =>
      packetBlock(
        PITCH_SET_TYPE_ID,
        request,
        emptyPacket('list', 'pitch', { encoding: 'midicent' })
      ),
    preview: 'values-text',
  });
}
