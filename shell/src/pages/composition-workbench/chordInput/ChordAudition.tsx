import { useEffect } from 'react';
import { createNotePacketPerformancePlan } from '../audio/performancePlans';
import { useCompositionSettings } from '../compositionSettings';
import type { NoteEventValue } from '../melodicization';
import type { DataPacket } from '../model';
import { musicalDuration, musicalPosition } from '../musicalTime';
import { transportTimeline } from '../transport';
import { useModulePreview } from '../useModulePreview';
import type { ChordSession } from './chordSession';
import type { PlacedNote } from './placement';

/**
 * The Chords tool's audition: sounds one chord through the same preview path the desk uses (an ad
 * hoc one-item note packet, `createNotePacketPerformancePlan`, `useModulePreview`). A component of
 * its own, mounted by the session's provider only while the active claim wants the picker, so the
 * audio engine is needed only then; it registers its function as the session's audition sink. Sound
 * only ever starts from a click, never a hover. (Moved from the Notes editor, M4a.)
 */
export function ChordAudition({ sourceId, session }: { sourceId: string; session: ChordSession }) {
  const { settings } = useCompositionSettings();
  const preview = useModulePreview({
    instanceId: sourceId,
    volume: 30,
    transportPlay: () => undefined,
  });
  const sink = (notes: PlacedNote[], velocity = 0.8) => {
    if (notes.length === 0) {
      return;
    }
    // At least a quarter note, so a short grid step is still heard.
    const length = Math.max(1, notes[0].duration);
    const chordPacket: DataPacket<NoteEventValue> = {
      kind: 'events',
      domain: 'note',
      encoding: 'midicent',
      items: [
        {
          id: 'chord',
          value: {
            onset: musicalPosition(0),
            interOnset: musicalDuration(length),
            duration: musicalDuration(length),
            pitches: notes.map((note) => Math.round(note.pitchMidicents)),
            velocity,
          },
          label: 'chord',
          provenance: [],
        },
      ],
      warnings: [],
    };
    try {
      const plan = createNotePacketPerformancePlan({
        sourceId,
        packet: chordPacket,
        timeline: transportTimeline(settings.transport),
      });
      void preview.play(plan, 'Auditioning chord.');
    } catch {
      // Nothing to hear is not an error worth showing.
    }
  };
  // Registered during render (a click in the same commit can sound) and again in an effect, so a
  // StrictMode cleanup that ran with the setup still pending never leaves the sink empty.
  session.auditionSink = sink;
  useEffect(() => {
    session.auditionSink = sink;
    return () => {
      if (session.auditionSink === sink) {
        session.auditionSink = null;
      }
    };
  });
  return null;
}
