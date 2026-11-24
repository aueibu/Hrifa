import { registerDataBlockType } from '../registry';
import { emptyPacket, packetBlock } from './blank';

export const VALUES_TYPE_ID = 'values';

/** Values: integers or rationals (a `list`, or a single `value`). Has no sound of its own. */
export function registerValuesType() {
  return registerDataBlockType({
    id: VALUES_TYPE_ID,
    label: 'Values',
    family: 'generic',
    channels: [],
    payload: 'packet',
    accepts: (packet) =>
      (packet.kind === 'list' || packet.kind === 'value') &&
      (packet.domain === 'integer' || packet.domain === 'rational'),
    createBlank: (request) => packetBlock(VALUES_TYPE_ID, request, emptyPacket('list', 'integer')),
    preview: 'values-text',
    noAuditionReason: 'Values have no sound of their own.',
  });
}
