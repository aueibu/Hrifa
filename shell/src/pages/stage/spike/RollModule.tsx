/**
 * The shared PianoRoll as a module (consume only, opt-in props only, demo notes). The view (zoom and scroll) is state
 * here, above the size branch, so it survives a move. What the roll shows depends on the size class it is given
 * (ARCHITECTURE.md 4b): the toolbar only when the slot is wide and not short. Selecting notes writes the demo
 * selection the inspector reads.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultPianoRollView,
  PianoRoll,
  type PianoRollGridLine,
  type PianoRollNote,
  type PianoRollViewState,
} from '../../../components/PianoRoll';
import type { SlotSize } from '../../../lib/stage';
import { pitchName, useSpike } from './state';
import classes from './spike.module.css';

/** Quarters: the demo timeline (state.tsx) runs to the end of the Bridge clip. */
const DURATION = 56;
const FOCUS_MARGIN_PX = 16;
const GRID: PianoRollGridLine[] = Array.from({ length: DURATION + 1 }, (_, at) => ({
  at,
  kind: at % 4 === 0 ? 'bar' : 'beat',
  label: at % 4 === 0 ? String(at / 4 + 1) : undefined,
}));

export function RollModule({ size }: { size: SlotSize }) {
  const { notes, selection, select, rollFocus } = useSpike();
  const [view, setView] = useState<PianoRollViewState>(defaultPianoRollView);

  const rollNotes = useMemo<PianoRollNote[]>(
    () =>
      notes.map((n) => ({
        id: n.id,
        start: n.start,
        duration: n.duration,
        pitchMidicents: n.pitch * 100,
        label: pitchName(n.pitch),
        velocity: n.velocity,
      })),
    [notes]
  );
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // a clip clicked on the canvas (rollFocus, from the shared demo state) pans the roll to that clip's first note
  useEffect(() => {
    if (!rollFocus) {
      return;
    }
    const starts = notesRef.current
      .filter((n) => n.clipId === rollFocus.clipId)
      .map((n) => n.start);
    if (starts.length === 0) {
      return;
    }
    setView((v) => ({
      ...v,
      scrollLeft: Math.max(0, Math.min(...starts) * v.pixelsPerQuarter - FOCUS_MARGIN_PX),
    }));
  }, [rollFocus]);

  const selectedIds = selection?.kind === 'note' ? selection.ids : [];

  return (
    <div className={classes.roll} data-standin="pianoroll" data-scroll-left={view.scrollLeft}>
      <PianoRoll
        fill
        detachedScroll
        wheelZoom
        ariaLabel="Spike piano roll"
        notes={rollNotes}
        duration={DURATION}
        gridLines={GRID}
        view={view}
        onViewChange={setView}
        showToolbar={size.width === 'wide' && size.height !== 'short'}
        selectedIds={selectedIds}
        onSelectionChange={(ids) => select(ids.length > 0 ? { kind: 'note', ids } : null)}
      />
    </div>
  );
}
