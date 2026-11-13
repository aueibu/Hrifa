/** Collapsible keyboard dock: the subset as playable keys, docked at the bottom next to everything it lights. */
import { Text } from '@mantine/core';
import { fmtRatio } from '../../../lib/harmonic-field';
import { ChevronDownIcon } from './icons';
import { rel, repText } from './mockData';
import { Tip, Num } from './ui';
import classes from './mock.module.css';

const COMPUTER_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ','];
/** Sounding in the mock: 1/1, 5/4 and 3/2, which is also the highlighted chord (4:5:6). */
export const LIT = new Set([0, 2, 3]);

interface Props {
  open: boolean;
  onToggle: () => void;
}

export function KeyboardDock({ open, onToggle }: Props) {
  const keys = [...rel.map((n) => ({ ratio: fmtRatio(n), c: n.c })), { ratio: repText, c: 1200 }];
  return (
    <section className={classes.dock} data-open={open} aria-label="Keyboard">
      <div className={classes.dockBar}>
        <button
          type="button"
          className={classes.dockToggle}
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className={classes.chevron} data-open={open}>
            <ChevronDownIcon />
          </span>
          <Tip k="keyboardDock" as="control">
            <span>Keyboard</span>
          </Tip>
        </button>
        <Text size="xs" c="dimmed" className={classes.dockHint}>
          {open ? 'Computer keys z x c v … walk up the subset; the mouse works too.' : 'Closed'}
        </Text>
        <Text size="xs" c="dimmed" className={classes.dockStatus}>
          Sounding <Num>1/1 · 5/4 · 3/2</Num>
        </Text>
      </div>
      {open && (
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
            >
              <span className={classes.keyHint}>{COMPUTER_KEYS[i]}</span>
              <Num>{k.ratio}</Num>
              <Num muted>{k.c.toFixed(1)} c</Num>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
