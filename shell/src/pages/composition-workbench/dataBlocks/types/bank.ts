import { registerDataBlockType } from '../registry';
import { emptyPacket, packetBlock } from './blank';

export const BANK_TYPE_ID = 'bank';

/**
 * Bank: a generic `bank` of ANY domain (W-61). Meaning stays a tag on the data (`domain`), not a type;
 * this is where a bank no specific type holds lands (capture tries it last). No editor, so the New
 * control does not offer it.
 */
export function registerBankType() {
  return registerDataBlockType({
    id: BANK_TYPE_ID,
    label: 'Bank',
    family: 'generic',
    channels: [],
    payload: 'packet',
    accepts: (packet) => packet.kind === 'bank',
    createBlank: (request) => packetBlock(BANK_TYPE_ID, request, emptyPacket('bank', 'symbol')),
    preview: 'values-text',
    noAuditionReason: 'A Bank has no sound of its own; use Hear as ... or a node.',
  });
}
