/** Roll stand-in (throwaway): narrow is a summary line, regular a short grid of cells, wide the same grid wider. */
import { slotSizeAttr, type SlotSize } from '../../../lib/stage';
import classes from './standins.module.css';

const ROWS = 3;

export function RollStandin({ size }: { size: SlotSize }) {
  const cols = size.width === 'wide' ? 8 : 4;
  return (
    <div data-standin="roll">
      <p className={classes.sizeText}>size {slotSizeAttr(size)}</p>
      {size.width === 'narrow' ? (
        <p className={classes.summary}>12 notes, bars 1 to 4</p>
      ) : (
        <div className={classes.cells} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: ROWS * cols }, (_, i) => (
            <span key={i} className={classes.cell}>
              {`n${i + 1}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
