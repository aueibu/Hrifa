/**
 * Picker stand-in (throwaway; the chord picker analogue): ONE component, three renderings of the same buttons: a
 * vertical list when narrow, a two-column grid when regular, a horizontal strip when wide or short. The counter is local
 * state kept above the per-size branch to show it survives a move; `pickerProbe.mounts` counts mount effects for tests.
 */
import { useEffect, useState } from 'react';
import { Button } from '@mantine/core';
import { slotSizeAttr, type SlotSize } from '../../../lib/stage';
import classes from './standins.module.css';

export const pickerProbe = { mounts: 0 };

const CHORDS = ['I', 'ii', 'iii', 'IV', 'V', 'vi'];

export function PickerStandin({ size }: { size: SlotSize }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    pickerProbe.mounts += 1;
  }, []);

  const layout =
    size.width === 'wide' || size.height === 'short'
      ? 'strip'
      : size.width === 'narrow'
        ? 'list'
        : 'grid';
  return (
    <div data-standin="picker">
      <p className={classes.sizeText}>size {slotSizeAttr(size)}</p>
      <div className={classes[layout]} data-picker-layout={layout}>
        {CHORDS.map((c) => (
          <Button key={c} size="compact-xs" variant="default">
            {c}
          </Button>
        ))}
      </div>
      <div className={classes.counter}>
        <Button size="compact-xs" variant="default" onClick={() => setCount((n) => n + 1)}>
          Picks
        </Button>
        <span data-testid="picker-count">{count}</span>
      </div>
    </div>
  );
}
