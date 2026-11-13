/** Wiki rail: picks the one analysis panel shown on the right; each entry carries a live count or verdict. */
import { completeKeys, field, lattice, prop, retunerCards } from './mockData';
import type { TipKey } from './texts';
import { Tip } from './ui';
import classes from './mock.module.css';

export type PanelId = 'chords' | 'spectrum' | 'keys' | 'lattice' | 'field' | 'retuner';

export const PANELS: { id: PanelId; label: string; tip: TipKey }[] = [
  { id: 'chords', label: 'Chords', tip: 'chords' },
  { id: 'spectrum', label: 'Spectrum', tip: 'spectrum' },
  { id: 'keys', label: 'Keys & Modes', tip: 'keysModes' },
  { id: 'lattice', label: 'Lattice', tip: 'lattice' },
  { id: 'field', label: 'Field table', tip: 'fieldTable' },
  { id: 'retuner', label: 'Retuner', tip: 'retunerPanel' },
];

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
    case 'field':
      return String(field.length);
    case 'retuner':
      return `${retunerCards.length} cards`;
  }
}

interface Props {
  panel: PanelId;
  onPick: (p: PanelId) => void;
  chordCount: number;
}

export function Rail({ panel, onPick, chordCount }: Props) {
  return (
    <nav className={classes.rail} aria-label="Analysis panels">
      <Tip k="analysisRail">
        <span className={classes.railHead}>Analysis</span>
      </Tip>
      <div role="tablist" aria-orientation="vertical" className={classes.railList}>
        {PANELS.map((p) => (
          <Tip key={p.id} k={p.tip} as="control" block>
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
        ))}
      </div>
    </nav>
  );
}
