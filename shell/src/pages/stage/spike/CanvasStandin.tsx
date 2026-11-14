/** Canvas stand-in (throwaway): the clips as blocks sized by their length; clicking one selects it and asks the roll to show its notes; a clip holding the selected note is marked related (demo state). */
import { slotSizeAttr, type SlotSize } from '../../../lib/stage';
import { useSpike } from './state';
import classes from './spike.module.css';

export function CanvasStandin({ size }: { size: SlotSize }) {
  const { clips, notes, selection, select, focusClip } = useSpike();
  const selected = selection?.kind === 'clip' ? selection.id : null;
  // the clip that holds the selected note is marked as related (not selected)
  const related =
    selection?.kind === 'note'
      ? (notes.find((n) => n.id === selection.ids[0])?.clipId ?? null)
      : null;
  return (
    <div className={classes.canvas} data-standin="canvas">
      <p className={classes.sizeText}>size {slotSizeAttr(size)}</p>
      <div className={size.width === 'narrow' ? classes.clipsColumn : classes.clipsRow}>
        {clips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={classes.clip}
            style={{ flexGrow: c.bars }}
            aria-pressed={c.id === selected}
            data-related={c.id === related}
            onClick={() => {
              select({ kind: 'clip', id: c.id });
              focusClip(c.id);
            }}
          >
            <span>{c.name}</span>
            <span className={classes.clipBars}>{c.bars} bars</span>
          </button>
        ))}
      </div>
    </div>
  );
}
