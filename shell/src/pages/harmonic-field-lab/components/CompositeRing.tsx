/**
 * Small rings of a composite (M8c step 2). One component draws both: the composite's merged notes alone (the rail row), or
 * the same notes with the effect of adding an item on them (the send popup), in the shapes of the Keys big view:
 * filled = a note the item merges into (common), hollow with a plus = a new note (added), hollow struck through = a pitch of
 * the item that vanishes in reduction (dropped); the composite's other notes are small plain dots. Neutral and theme tokens only
 * (the classes are the Keys panel's).
 */
import type { Note } from '../../../lib/harmonic-field';
import { ChangeTicks, type TickSpec } from './ChangeTicks';
import { RingChevron } from './ModeRoot';
import classes from './panels.module.css';

/** The big drawing's width on screen, px (5rem, `.compRingBig`). */
const BIG_PX = 80;
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
  /** The root of the hovered item (cents above 1/1, reduced into the repeat here): a mode-root chevron just outside the ring. */
  rootC?: number | null;
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
  rootC = null,
  label,
  big = false,
}: CompositeRingProps) {
  const turn = repC > 0 ? repC : 1200;
  const at = (c: number, r = R) => {
    const a = (c / turn) * 2 * Math.PI - Math.PI / 2;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  };
  const preview = added.length + common.length + dropped.length > 0;
  // the large drawing (the send popup): added and dropped marks are change ticks (M8m)
  const pinned = big;
  const tickList: TickSpec[] = pinned
    ? [
        ...added.map((c): TickSpec => ({ angle: (c / turn) * 2 * Math.PI, kind: 'added' })),
        ...dropped.map((c): TickSpec => ({ angle: (c / turn) * 2 * Math.PI, kind: 'dropped' })),
      ]
    : [];
  // `.compRingBig` is 5rem (80 px) across the 64-unit box; the svg is overflow: visible, so a tick past the box is not clipped
  const pk = S / BIG_PX;
  const centre = { x: C, y: C };
  return (
    <svg
      className={big ? classes.compRingBig : classes.compRing}
      viewBox={`0 0 ${S} ${S}`}
      role="img"
      aria-label={label}
      data-testid="composite-ring"
      overflow={rootC === null && !pinned ? undefined : 'visible'}
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
      {pinned && <ChangeTicks ticks={tickList} R={R} k={pk} center={centre} />}
      {!pinned &&
        added.map((c, i) => {
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
      {!pinned &&
        dropped.map((c, i) => {
          const p = at(c);
          return (
            <g key={`d${i}`} data-kind="dropped">
              <circle className={classes.bigKeyDropped} cx={p.x} cy={p.y} r={4.5} />
              <path className={classes.bigKeyStrike} d={`M${p.x - 6} ${p.y}h12`} />
            </g>
          );
        })}
      {rootC !== null && (
        <RingChevron
          cx={C}
          cy={C}
          x={at(((rootC % turn) + turn) % turn).x}
          y={at(((rootC % turn) + turn) % turn).y}
          gap={5}
          scale={0.7}
        />
      )}
    </svg>
  );
}

/** The cents of notes, for the drawing. */
export const centsOfNotes = (ns: readonly Note[]): number[] => ns.map((n) => n.c);
