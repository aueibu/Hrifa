import type { CSSProperties } from 'react';
import { RingCompare } from './PitchRing';
import classes from '../ScaleExplorer.module.css';

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = [
  { pc: 1, after: 0 },
  { pc: 3, after: 1 },
  { pc: 6, after: 3 },
  { pc: 8, after: 4 },
  { pc: 10, after: 5 },
];

const SLOT_COLORS = ['var(--se-cmp0)', 'var(--se-cmp1)', 'var(--se-cmp2)', 'var(--se-cmp3)'];

interface PianoKeysProps {
  selection: number[];
  compares: RingCompare[];
  names: string[];
  soundingPcs: ReadonlySet<number>;
  onToggle: (pc: number) => void;
}

/** One octave of keys. Comparison sets underline the keys they use with a stack of their slot colors. */
export function PianoKeys({ selection, compares, names, soundingPcs, onToggle }: PianoKeysProps) {
  const sel = new Set(selection);
  const key = (pc: number, black: boolean, left?: string) => {
    const bars = compares
      .filter((c) => c.abs.includes(pc))
      .map((c, i) => `inset 0 -${5 * (i + 1)}px 0 ${SLOT_COLORS[c.slot]}`);
    const style: CSSProperties = { left, boxShadow: bars.length ? bars.join(',') : undefined };
    return (
      <button
        key={pc}
        type="button"
        className={classes.key}
        data-black={black}
        data-on={sel.has(pc)}
        data-sound={soundingPcs.has(pc)}
        aria-pressed={sel.has(pc)}
        style={style}
        onClick={() => onToggle(pc)}
      >
        <span className={classes.keyName}>{names[pc]}</span>
        <span className={classes.keyNum}>{pc}</span>
      </button>
    );
  };

  return (
    <div className={classes.keys} role="group" aria-label="One octave keyboard">
      {WHITE.map((pc) => key(pc, false))}
      {BLACK.map((k) => key(k.pc, true, `${((k.after + 1) / 7) * 100 - 4.5}%`))}
    </div>
  );
}
