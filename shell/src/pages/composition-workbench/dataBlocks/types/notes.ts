import { createNotePacketPerformancePlan } from '../../audio/performancePlans';
import type { NoteEventValue } from '../../melodicization';
import type { DataPacket } from '../../model';
import { defaultMusicalTimeline, rational } from '../../musicalTime';
import { DEFAULT_TIME_SIGNATURE, withNotesProperties } from '../../notesProperties';
import { notesOperators } from '../../noteTransforms';
import { auditionLabel } from '../auditionPlans';
import { registerDataBlockType } from '../registry';
import { blankFrame, emptyPacket, packetBlock, refuseWhenEmpty } from './blank';

export const NOTES_TYPE_ID = 'notes';

/** Notes: `events | note`, edited in the piano roll and heard through the note performance plan. */
export function registerNotesType() {
  return registerDataBlockType({
    id: NOTES_TYPE_ID,
    label: 'Notes',
    family: 'placed',
    channels: ['onset', 'duration', 'pitch', 'amplitude'],
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
    // As written, through the existing note plan (A1). One cycle: the packet's extent or the end of
    // the last note (the plan's own duration).
    audition: {
      refuse: refuseWhenEmpty,
      build: (block) => {
        if (block.payload.kind !== 'packet') {
          throw new Error('Notes hold a packet.');
        }
        const plan = createNotePacketPerformancePlan({
          sourceId: block.id,
          packet: block.payload.packet as DataPacket<NoteEventValue>,
          timeline: defaultMusicalTimeline,
        });
        return { plan, cycleLength: plan.duration, label: auditionLabel(block) };
      },
    },
  });
}
