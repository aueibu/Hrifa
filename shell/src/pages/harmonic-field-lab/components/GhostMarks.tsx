/**
 * Ghost marks (sounding pitches that match no field note): a dashed, unfilled circle in the sounding colour at the pitch's
 * true place on the pitch ring (Chromatic view) and on the tuner strip. They exist only while the sound does (the audio hook
 * counts them by pitch). The Fifths view has no place for an arbitrary pitch, so there only the "+N outside" count shows.
 */
import { useMemo } from 'react';
import { ghostsOf, type Ghost } from '../state/ghosts';
import { stripLeft } from './TunerStrip';
import { useLab } from './ui';
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
export function OutsideCount() {
  const n = useGhosts().length;
  return n ? (
    <span className={classes.outsideCount} role="status" data-testid="outside-count">
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
        <span
          key={g.c}
          className={classes.stripGhost}
          style={{ left: stripLeft(g.c, base.repC) }}
          role="img"
          aria-label={`Ghost: ${g.text}`}
          title={g.text}
          data-testid="strip-ghost"
        />
      ))}
    </>
  );
}
