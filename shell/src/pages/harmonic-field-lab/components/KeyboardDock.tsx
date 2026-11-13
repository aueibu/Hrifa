/** Thin keyboard dock: one row of keys for the subset, collapsible to a bar. What sounds is lit here and everywhere. */
import { dockKeyCount, KEYS } from '../audio/keymap';
import { ChevronDownIcon } from './icons';
import { Num, Tip, useLab } from './ui';
import classes from './lab.module.css';

export function KeyboardDock({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { base, sounding, chord, setHover, audio } = useLab();
  const { rel, repText, repC, ratios } = base;
  const n = rel.length;
  const count = dockKeyCount(n);
  const keys = Array.from({ length: count }, (_, i) =>
    i < n
      ? { ratio: ratios[rel[i].src], c: rel[i].c, src: rel[i].src }
      : { ratio: repText, c: repC, src: rel[0]?.src ?? -1 }
  );
  const hold = (slot: number) => {
    audio.press(slot);
    const up = () => {
      audio.release(slot);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const soundingText = [...sounding]
    .sort((a, b) => base.field[a].c - base.field[b].c)
    .map((i) => ratios[i])
    .join(' · ');
  return (
    <section className={classes.dock} data-open={open} aria-label="Keyboard">
      <Tip k="dockToggle" as="control">
        <button
          type="button"
          className={classes.dockToggle}
          aria-expanded={open}
          aria-label="Keyboard"
          onClick={onToggle}
        >
          <span className={classes.chevron} data-open={open}>
            <ChevronDownIcon />
          </span>
          <span>Keys</span>
        </button>
      </Tip>
      {open ? (
        <div className={classes.keys} role="group" aria-label="Subset keys">
          {n === 0 && <span className={classes.dockStatus}>Select notes to play them here</span>}
          {keys.map((k, i) => {
            const lit = k.src >= 0 && sounding.has(k.src);
            const inChord = k.src >= 0 && chord.has(k.src);
            return (
              <button
                key={i}
                type="button"
                className={classes.key}
                data-lit={lit}
                data-chord={inChord}
                aria-pressed={lit}
                aria-label={`${k.ratio}, ${k.c.toFixed(1)} cents`}
                onPointerDown={(e) => {
                  if (e.button === 0) {
                    hold(i);
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                    audio.press(i);
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    audio.release(i);
                  }
                }}
                onMouseEnter={() => k.src >= 0 && setHover(k.src)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => k.src >= 0 && setHover(k.src)}
                onBlur={() => {
                  setHover(null);
                  audio.release(i);
                }}
              >
                <span className={classes.keyHint}>{KEYS[i]}</span>
                <Num>{k.ratio}</Num>
              </button>
            );
          })}
        </div>
      ) : (
        <span className={classes.dockStatus}>
          sounding <Num>{soundingText || 'nothing'}</Num>
        </span>
      )}
    </section>
  );
}
