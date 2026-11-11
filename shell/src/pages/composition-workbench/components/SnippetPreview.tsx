import { useMemo } from 'react';
import type { NoteEventValue } from '../melodicization';
import type { DataPacket } from '../model';
import { rationalToNumber } from '../musicalTime';
import { categoryOfPacket, signalCategoryColor } from '../signalCategories';
import classes from './DeskView.module.css';

const WIDTH = 200;
const HEIGHT = 56;
const MIN_SEMITONES = 12;

/** A short text for any item value: numbers as typed, chords and groups in brackets. */
export function valueText(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(valueText).join(' ')}]`;
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  return '…';
}

function eventExtent(packet: DataPacket<NoteEventValue>) {
  const frame = packet.frame?.extent;
  if (frame && frame > 0) {
    return frame;
  }
  return Math.max(
    1,
    ...packet.items.map(
      (item) =>
        rationalToNumber(item.value.onset.quarterNotes) +
        rationalToNumber(item.value.duration.quarterNotes)
    )
  );
}

const BAR_GAP = 1;

/**
 * A rhythm (`list | duration` of plain numbers) as proportional blocks: one per item, as wide as its
 * length, with a rest drawn as an outline. Null when the packet is not that shape, so anything else
 * falls through to the text view.
 */
export function rhythmBars(packet: DataPacket) {
  if (packet.kind !== 'list' || packet.domain !== 'duration' || packet.items.length === 0) {
    return null;
  }
  const lengths = packet.items.map((item) => item.value);
  if (
    !lengths.every((value) => typeof value === 'number' && Number.isFinite(value) && value !== 0)
  ) {
    return null;
  }
  const spans = (lengths as number[]).map(Math.abs);
  const total = spans.reduce((sum, span) => sum + span, 0);
  let at = 0;
  return packet.items.map((item, index) => {
    const x = (at / total) * WIDTH;
    at += spans[index];
    return {
      key: item.id,
      x,
      width: Math.max(1, (spans[index] / total) * WIDTH - BAR_GAP),
      rest: (lengths as number[])[index] < 0,
    };
  });
}

/**
 * A snippet's thumbnail: its notes drawn small for events, and its values as text for everything
 * else. The renderer follows the packet's signal category, so a new kind only needs a branch here.
 */
export function SnippetPreview({ packet }: { packet: DataPacket }) {
  const category = categoryOfPacket(packet);
  const color = signalCategoryColor(category);

  const notes = useMemo(() => {
    if (packet.kind !== 'events' || packet.domain !== 'note') {
      return null;
    }
    const events = packet as DataPacket<NoteEventValue>;
    const extent = eventExtent(events);
    const pitches = events.items.flatMap((item) => item.value.pitches);
    const centre = pitches.length ? (Math.min(...pitches) + Math.max(...pitches)) / 200 : 60;
    const span = Math.max(
      MIN_SEMITONES,
      pitches.length ? (Math.max(...pitches) - Math.min(...pitches)) / 100 + 2 : 0
    );
    const rowHeight = Math.max(2, Math.min(6, HEIGHT / span));
    return events.items.flatMap((item) =>
      item.value.pitches.map((midicents, index) => ({
        key: `${item.id}:${index}`,
        x: (rationalToNumber(item.value.onset.quarterNotes) / extent) * WIDTH,
        width: Math.max(2, (rationalToNumber(item.value.duration.quarterNotes) / extent) * WIDTH),
        y: HEIGHT / 2 - ((midicents / 100 - centre) / span) * HEIGHT - rowHeight / 2,
        height: rowHeight,
      }))
    );
  }, [packet]);

  const bars = useMemo(() => rhythmBars(packet), [packet]);

  if (notes) {
    return (
      <svg
        className={classes.thumb}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${notes.length} notes`}
        style={{ color }}
      >
        {notes.map((note) => (
          <rect
            key={note.key}
            x={note.x}
            y={note.y}
            width={note.width}
            height={note.height}
            fill="currentColor"
          />
        ))}
      </svg>
    );
  }

  if (bars) {
    return (
      <svg
        className={classes.thumb}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${bars.length} durations`}
        style={{ color }}
      >
        {bars.map((bar) => (
          <rect
            key={bar.key}
            x={bar.x}
            y={HEIGHT / 2 - 8}
            width={bar.width}
            height={16}
            fill={bar.rest ? 'none' : 'currentColor'}
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    );
  }

  const shown = packet.items.slice(0, 16).map((item) => valueText(item.value));
  return (
    <div className={classes.values} style={{ color }}>
      {shown.join('  ')}
      {packet.items.length > shown.length ? '  …' : ''}
    </div>
  );
}
