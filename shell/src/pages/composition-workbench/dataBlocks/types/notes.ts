import { rational } from '../../musicalTime';
import { DEFAULT_TIME_SIGNATURE, withNotesProperties } from '../../notesProperties';
import { notesOperators } from '../../noteTransforms';
import { registerDataBlockType } from '../registry';
import { blankFrame, emptyPacket, packetBlock, refuseWhenEmpty } from './blank';

export const NOTES_TYPE_ID = 'notes';

/** Notes: `events | note`, edited in the piano roll and heard through the note performance plan. */
export function registerNotesType() {
  return registerDataBlockType({
    id: NOTES_TYPE_ID,
    label: 'Notes',
    payload: 'packet',
    accepts: (packet) => packet.kind === 'events' && packet.domain === 'note',
    createBlank: (request) =>
      packetBlock(
        NOTES_TYPE_ID,
        request,
        // Every block carries all its properties: play from the start, loop the whole length.
        withNotesProperties(
          { ...emptyPacket('events', 'note'), frame: blankFrame(request.length) },
          {
            length: request.length,
            start: rational(0),
            loopOn: true,
            loopStart: rational(0),
            loopEnd: request.length,
            timeSignature: request.timeSignature ?? DEFAULT_TIME_SIGNATURE,
          }
        )
      ),
    // Bound to the piano-roll editor by `registerDataBlockEditor` (components/NotesEditor.tsx).
    editorId: 'note-roll',
    preview: 'note-strip',
    operators: notesOperators,
    // Notes keeps playing through the existing desk path (createNotePacketPerformancePlan).
    audition: { refuse: refuseWhenEmpty },
  });
}
