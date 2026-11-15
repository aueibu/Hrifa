/**
 * Small rings of a composite (M8c step 2). One component draws both: the composite's merged notes alone (the rail row), or
 * the same notes with the effect of adding an item on them (the send popup), in the shapes of the Keys big view:
 * filled = a note the item merges into (common), hollow with a plus = a new note (added), hollow struck through = a pitch of
 * the item that vanishes in reduction (dropped); the composite's other notes are small plain dots. Neutral and theme tokens only
 * (the classes are the Keys panel's).
 */
import type { Note } from '../../../lib/harmonic-field';
import classes from './panels.module.css';

const S = 64;
const C = S / 2;
const R = 24;

export interface CompositeRingProps {
  /** One turn of the ring, in cents. */
  repC: number;
  /** The composite's merged notes (cents). */
  notes: readonly number[];
  /** Preview only: new notes, notes the item merges into, and pitches dropped by reduction (cents). */
  added?: readonly number[];
  common?: readonly number[];
  dropped?: readonly number[];
  /** M8e: notes lit by the item the pointer is on in the panel (cents); drawn as the blue chord ring (same as the Keys and pitch ring highlight) over the plain dots. */
  lit?: readonly number[];
  label: string;
  /** The larger drawing of the - popup. */
  big?: boolean;
}

export function CompositeRing({
  repC,
  notes,
  added = [],
  common = [],
  dropped = [],
  lit = [],
  label,
  big = false,
}: CompositeRingProps) {
  const turn = repC > 0 ? repC : 1200;
  const at = (c: number, r = R) => {
    const a = (c / turn) * 2 * Math.PI - Math.PI / 2;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  };
  const preview = added.length + common.length + dropped.length > 0;
  return (
    <svg
      className={big ? classes.compRingBig : classes.compRing}
      viewBox={`0 0 ${S} ${S}`}
      role="img"
      aria-label={label}
      data-testid="composite-ring"
    >
      <circle className={classes.keyCircle} cx={C} cy={C} r={R} />
      {notes.map((c, i) => {
        const p = at(c);
        return (
          <circle
            key={`n${i}`}
            className={preview ? classes.keyField : classes.keyFound}
            cx={p.x}
            cy={p.y}
            r={preview ? 2 : 2.6}
            data-kind="note"
          />
        );
      })}
      {lit.map((c, i) => {
        const p = at(c);
        return (
          <circle
            key={`l${i}`}
            className={classes.bigKeyChord}
            cx={p.x}
            cy={p.y}
            r={5}
            data-kind="lit"
          />
        );
      })}
      {common.map((c, i) => {
        const p = at(c);
        return (
          <circle
            key={`c${i}`}
            className={classes.bigKeyCommon}
            cx={p.x}
            cy={p.y}
            r={4}
            data-kind="common"
          />
        );
      })}
      {added.map((c, i) => {
        const p = at(c);
        return (
          <g key={`a${i}`} data-kind="added">
            <circle className={classes.bigKeyAdded} cx={p.x} cy={p.y} r={4.5} />
            <path
              className={classes.bigKeyGlyph}
              d={`M${p.x - 2.2} ${p.y}h4.4M${p.x} ${p.y - 2.2}v4.4`}
            />
          </g>
        );
      })}
      {dropped.map((c, i) => {
        const p = at(c);
        return (
          <g key={`d${i}`} data-kind="dropped">
            <circle className={classes.bigKeyDropped} cx={p.x} cy={p.y} r={4.5} />
            <path className={classes.bigKeyStrike} d={`M${p.x - 6} ${p.y}h12`} />
          </g>
        );
      })}
    </svg>
  );
}

/** The cents of notes, for the drawing. */
export const centsOfNotes = (ns: readonly Note[]): number[] => ns.map((n) => n.c);
