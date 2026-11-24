import { registerDataBlockType } from '../registry';
import { emptyPacket, packetBlock } from './blank';

export const LIST_TYPE_ID = 'list';

/**
 * List: a generic `list` of ANY domain (W-61). Meaning stays a tag on the data (`domain`), not a type;
 * this is where a list no specific type holds lands (capture tries it last). No editor, so the New
 * control does not offer it.
 */
export function registerListType() {
  return registerDataBlockType({
    id: LIST_TYPE_ID,
    label: 'List',
    family: 'generic',
    channels: [],
    payload: 'packet',
    accepts: (packet) => packet.kind === 'list',
    createBlank: (request) => packetBlock(LIST_TYPE_ID, request, emptyPacket('list', 'symbol')),
    preview: 'values-text',
    noAuditionReason: 'A List has no sound of its own; use Hear as ... or a node.',
  });
}
