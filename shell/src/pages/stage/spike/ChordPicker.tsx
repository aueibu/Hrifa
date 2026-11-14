/**
 * Chord picker stand-in (throwaway; the chord-input analogue): ONE component with two renderings of the same state.
 * `narrow` (the slot is 2 units wide, beside the roll) is a 2x1 block: a role selector over a two-column grid. Anything
 * wider (3 units or more, above the roll) is a 3x1 strip: the role selector and one row of chords, scrolling sideways.
 * The role and the selected chord are state above the size branch, so moving the module between the two positions
 * changes only `size` and loses nothing. `chordProbe.mounts` counts mount effects for the tests.
 */
import { useEffect, useState } from 'react';
import { Button, SegmentedControl } from '@mantine/core';
import type { SlotSize } from '../../../lib/stage';
import classes from './spike.module.css';

export const chordProbe = { mounts: 0 };

const ROLES = ['Triads', 'Sevenths'] as const;
type Role = (typeof ROLES)[number];

const CHORDS: Record<Role, string[]> = {
  Triads: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'],
  Sevenths: ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'],
};

export type ChordLayout = '2x1' | '3x1';
export const chordLayoutFor = (size: SlotSize): ChordLayout =>
  size.width === 'narrow' ? '2x1' : '3x1';

export function ChordPicker({ size }: { size: SlotSize }) {
  const [role, setRole] = useState<Role>('Triads');
  const [chord, setChord] = useState<string | null>(null);
  useEffect(() => {
    chordProbe.mounts += 1;
  }, []);

  const layout = chordLayoutFor(size);
  return (
    <div className={classes.chords} data-standin="chords" data-chord-layout={layout}>
      <div className={classes.chordHead}>
        <SegmentedControl
          size="xs"
          aria-label="Chord role"
          value={role}
          data={[...ROLES]}
          onChange={(v) => setRole(v as Role)}
        />
        <span className={classes.chordNow} data-testid="chord-now">
          {chord ?? 'none'}
        </span>
      </div>
      <div className={layout === '2x1' ? classes.chordGrid : classes.chordRow}>
        {CHORDS[role].map((c) => (
          <Button
            key={c}
            size="compact-xs"
            variant={c === chord ? 'filled' : 'default'}
            aria-pressed={c === chord}
            onClick={() => setChord(c)}
          >
            {c}
          </Button>
        ))}
      </div>
    </div>
  );
}
