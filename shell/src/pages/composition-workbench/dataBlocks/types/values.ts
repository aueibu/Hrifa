import { packet, type DataItem } from '../../model';
import { registerConversion } from '../acceptance';
import { registerDataBlockType, type StoredDataBlock } from '../registry';
import { emptyPacket, packetBlock } from './blank';

export const VALUES_TYPE_ID = 'values';
export const VALUES_AS_MIDI_NOTES_ID = 'values-as-midi-notes';

/** A value item as a number: a plain number, or a `{ numerator, denominator }` rational. */
function valueAsNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  const fraction = value as { numerator?: unknown; denominator?: unknown } | null;
  if (typeof fraction?.numerator === 'number' && typeof fraction.denominator === 'number') {
    return fraction.numerator / fraction.denominator;
  }
  return Number.NaN;
}

/**
 * The explicit "Hear as MIDI note numbers" choice (A6): each number n is MIDI note n (60 = C4),
 * stored as n * 100 midicents with no rounding. A pure conversion to a Pitch set; the Values
 * data-block is not changed and nothing converts unless the listener picks it.
 */
function valuesAsMidiNotes(block: StoredDataBlock): StoredDataBlock {
  if (block.payload.kind !== 'packet') {
    throw new Error('Values hold a packet.');
  }
  const items: DataItem[] = block.payload.packet.items.map((item) => {
    const midicents = valueAsNumber(item.value) * 100;
    if (!Number.isFinite(midicents)) {
      throw new Error('Some values are not numbers, so they cannot be heard as MIDI notes.');
    }
    return { id: item.id, value: midicents, provenance: item.provenance };
  });
  return {
    schemaVersion: block.schemaVersion,
    id: block.id,
    typeId: 'pitch-set',
    name: block.name,
    createdAt: block.createdAt,
    payload: {
      kind: 'packet',
      packet: packet('list', 'pitch', items, [], undefined, { encoding: 'midicent' }),
    },
  };
}

/** Values: integers or rationals (a `list`, or a single `value`). Has no sound of its own. */
export function registerValuesType() {
  const removeConversion = registerConversion({
    id: VALUES_AS_MIDI_NOTES_ID,
    from: VALUES_TYPE_ID,
    to: 'pitch-set',
    label: 'Hear as MIDI note numbers',
    describe: 'Each number is a MIDI note number (60 = C4); the data is not changed.',
    convert: valuesAsMidiNotes,
  });
  const removeType = registerDataBlockType({
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
    auditionControls: ['mode', 'loop'],
    noAuditionReason: 'Values have no sound of their own.',
  });
  return () => {
    removeType();
    removeConversion();
  };
}
