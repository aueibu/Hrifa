/**
 * Wiki rail: picks the one analysis panel the switcher column shows, and pins panels into their own columns on wide
 * screens. Each entry carries a live count or verdict.
 */
import { PinIcon } from './icons';
import type { PanelId } from './layout';
import { completeKeys, field, lattice, prop, retunerCards } from './mockData';
import type { TipKey } from './texts';
import { Tip } from './ui';
import classes from './mock.module.css';

export type { PanelId } from './layout';

export const PANELS: { id: PanelId; label: string; tip: TipKey }[] = [
  { id: 'chords', label: 'Chords', tip: 'chords' },
  { id: 'spectrum', label: 'Spectrum', tip: 'spectrum' },
  { id: 'keys', label: 'Keys & Modes', tip: 'keysModes' },
  { id: 'lattice', label: 'Lattice', tip: 'lattice' },
  { id: 'retuner', label: 'Retuner', tip: 'retunerPanel' },
];
export const panelLabel = (id: PanelId) => PANELS.find((p) => p.id === id)?.label ?? id;

export function summaryOf(id: PanelId, chordCount: number): string {
  switch (id) {
    case 'chords':
      return String(chordCount);
    case 'spectrum':
      return prop.verdict;
    case 'keys':
      return `${completeKeys.length} of ${field.length}`;
    case 'lattice':
      return `${lattice.axes.length} primes`;
    case 'retuner':
      return `${retunerCards.length} cards`;
  }
}

interface Props {
  /** The panel the switcher shows. */
  panel: PanelId;
  onPick: (p: PanelId) => void;
  chordCount: number;
  /** Pinned panels, and those of them that currently have a column. */
  pinned: ReadonlySet<PanelId>;
  shown: ReadonlySet<PanelId>;
  onTogglePin: (p: PanelId) => void;
}

export function Rail({ panel, onPick, chordCount, pinned, shown, onTogglePin }: Props) {
  return (
    <nav className={classes.rail} aria-label="Analysis panels">
      <Tip k="analysisRail">
        <span className={classes.railHead}>Analysis</span>
      </Tip>
      <div role="tablist" aria-orientation="vertical" className={classes.railList}>
        {PANELS.map((p) => {
          const isPinned = pinned.has(p.id);
          const isShown = shown.has(p.id);
          return (
            <div key={p.id} className={classes.railRow}>
              <Tip k={p.tip} as="control" block>
                <button
                  type="button"
                  role="tab"
                  id={`tab-${p.id}`}
                  aria-selected={panel === p.id}
                  aria-controls="analysis-panel"
                  className={classes.railItem}
                  onClick={() => onPick(p.id)}
                >
                  <span className={classes.railLabel}>{p.label}</span>
                  <span className={classes.railCount}>{summaryOf(p.id, chordCount)}</span>
                </button>
              </Tip>
              <Tip
                k="pinPanel"
                as="control"
                extra={
                  isPinned && !isShown
                    ? 'Pinned, but there is no room for its column at this width.'
                    : undefined
                }
              >
                <button
                  type="button"
                  className={classes.pinBtn}
                  aria-pressed={isPinned}
                  aria-label={
                    isPinned
                      ? `Unpin ${p.label}${isShown ? '' : ' (no room at this width)'}`
                      : `Pin ${p.label} as a column`
                  }
                  data-state={!isPinned ? 'off' : isShown ? 'shown' : 'hidden'}
                  onClick={() => onTogglePin(p.id)}
                >
                  <PinIcon />
                </button>
              </Tip>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
