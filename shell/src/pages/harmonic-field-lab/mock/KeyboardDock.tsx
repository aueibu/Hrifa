/** Thin keyboard dock: one row of keys for the subset, collapsible to a bar. What sounds is lit here and everywhere. */
import { fmtRatio } from '../../../lib/harmonic-field';
import { ChevronDownIcon } from './icons';
import { LIT, rel, repText } from './mockData';
import { Num, Tip, useLab } from './ui';
import classes from './mock.module.css';

const COMPUTER_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ','];

export function KeyboardDock({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const lab = useLab();
  const keys = [
    ...rel.map((n) => ({ ratio: fmtRatio(n), c: n.c, src: n.src })),
    { ratio: repText, c: 1200, src: -1 },
  ];
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
          {keys.map((k, i) => (
            <button
              key={i}
              type="button"
              className={classes.key}
              data-lit={LIT.has(i)}
              data-chord={LIT.has(i)}
              aria-pressed={LIT.has(i)}
              aria-label={`${k.ratio}, ${k.c.toFixed(1)} cents`}
              onMouseEnter={() => k.src >= 0 && lab.setHover(k.src)}
              onMouseLeave={() => lab.setHover(null)}
              onFocus={() => k.src >= 0 && lab.setHover(k.src)}
              onBlur={() => lab.setHover(null)}
            >
              <span className={classes.keyHint}>{COMPUTER_KEYS[i]}</span>
              <Num>{k.ratio}</Num>
            </button>
          ))}
        </div>
      ) : (
        <span className={classes.dockStatus}>
          sounding <Num>1/1 · 5/4 · 3/2</Num>
        </span>
      )}
    </section>
  );
}
