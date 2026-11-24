import { pitchGroupToArray, type PitchItemValue } from '../../pitch';
import { pitchesPlan } from '../auditionPlans';
import { registerDataBlockType } from '../registry';
import { emptyPacket, packetBlock, refuseWhenEmpty } from './blank';

export const PITCH_SET_TYPE_ID = 'pitch-set';

/** Pitch set: `list | pitch`, midicent pitches.
 * Heard as exactly its pitches (A2, A3): every encoding (midi-note, note-name, midicent) is stored as
 * midicents, fractional allowed, so a 19-EDO set plays in 19-EDO as stored. Base octave and offset do
 * not apply (nothing is added, nothing is finished into a scale).
 */
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
    auditionControls: ['mode', 'loop'],
    audition: {
      refuse: refuseWhenEmpty,
      build: (block, settings) => {
        if (block.payload.kind !== 'packet') {
          throw new Error('A Pitch set holds a packet.');
        }
        const pitches = block.payload.packet.items.flatMap((item) =>
          pitchGroupToArray(item.value as PitchItemValue)
        );
        return pitchesPlan(block, pitches, settings.mode);
      },
    },
  });
}
