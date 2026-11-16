/**
 * Ghost marks (sounding pitches that match no field note): a dashed, unfilled circle in the sounding color at the pitch's
 * true place on the pitch ring (Chromatic view) and on the tuner strip. They exist only while the sound does (the audio hook
 * counts them by pitch). The Fifths view has no place for an arbitrary pitch, so there only the "+N outside" count shows.
 */
import { useMemo } from 'react';
import { ghostsOf, type Ghost } from '../state/ghosts';
import { stripLeft } from './TunerStrip';
import { Hint, useLab } from './ui';
import classes from './lab.module.css';

/** The ghosts of what sounds now, against the active tab's field. */
export function useGhosts(): Ghost[] {
  const { base, soundingGhosts } = useLab();
  return useMemo(
    () => ghostsOf(base.field, base.repC, soundingGhosts),
    [base.field, base.repC, soundingGhosts]
  );
}

/** "+N outside" for the ring caption; nothing when no ghost sounds. */
export function OutsideCount({
  testId = 'outside-count',
  live = true,
  corner = 'bottom',
}: {
  /** Which corner of its position: relative host the overlay sits in. */
  corner?: 'top' | 'bottom';
  testId?: string;
  /** role="status" on the caption; off for a second copy on screen (no repeated live regions). */
  live?: boolean;
} = {}) {
  const n = useGhosts().length;
  return n ? (
    <span
      className={classes.outsideCount}
      role={live ? 'status' : undefined}
      data-corner={corner}
      data-testid={testId}
    >
      +{n} outside
    </span>
  ) : null;
}

/** Ghost circles on the tuner strip, at the pitch's true column, level with the note marks. */
export function StripGhosts() {
  const { base } = useLab();
  const ghosts = useGhosts();
  return (
    <>
      {ghosts.map((g) => (
        <Hint key={g.c} dynamic={g.text}>
          <span
            className={classes.stripGhost}
            style={{ left: stripLeft(g.c, base.repC) }}
            role="img"
            aria-label={`Ghost: ${g.text}`}
            data-testid="strip-ghost"
          />
        </Hint>
      ))}
    </>
  );
}
