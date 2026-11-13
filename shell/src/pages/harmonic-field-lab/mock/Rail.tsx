/**
 * Wiki rail: picks the one analysis panel the switcher column shows, and pins panels into their own columns on wide
 * screens. Each entry carries a live count or verdict.
 */
import { PinIcon } from './icons';
import { DEFAULT_VIEWS, isViz, vizName, type PanelId, type VizId, type VizView } from './layout';
import { completeKeys, field, prop, retunerCards } from './mockData';
import { PinMenu } from './PinMenu';
import type { TipKey } from './texts';
import { Tip } from './ui';
import { VIEW_TIP, vizSummary, useViz, type VizApi } from './vizState';
import classes from './mock.module.css';

export type { PanelId } from './layout';

export const PANELS: { id: PanelId; label: string; tip: TipKey }[] = [
  { id: 'chords', label: 'Chords', tip: 'chords' },
  { id: 'spectrum', label: 'Spectrum', tip: 'spectrum' },
  { id: 'keys', label: 'Keys & Modes', tip: 'keysModes' },
  { id: 'viz1', label: vizName('viz1', DEFAULT_VIEWS.viz1), tip: 'lattice' },
  { id: 'viz2', label: vizName('viz2', DEFAULT_VIEWS.viz2), tip: 'edoFit' },
  { id: 'viz3', label: vizName('viz3', DEFAULT_VIEWS.viz3), tip: 'dissCurve' },
  { id: 'retuner', label: 'Retuner', tip: 'retunerPanel' },
];
/** A panel's name; a visualizer is named after the view it shows now (`view` says which). */
export const panelLabel = (id: PanelId, view?: (id: VizId) => VizView) =>
  isViz(id) && view ? vizName(id, view(id)) : (PANELS.find((p) => p.id === id)?.label ?? id);
const panelTip = (id: PanelId, tip: TipKey, view: (id: VizId) => VizView): TipKey =>
  isViz(id) ? VIEW_TIP[view(id)] : tip;

export function summaryOf(id: PanelId, chordCount: number, viz: VizApi): string {
  switch (id) {
    case 'chords':
      return String(chordCount);
    case 'spectrum':
      return prop.verdict;
    case 'keys':
      return `${completeKeys.length} of ${field.length}`;
    case 'viz1':
    case 'viz2':
    case 'viz3':
      return vizSummary(viz.view(id), viz.settings(id));
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
  /** Unpin a pinned panel. */
  onTogglePin: (p: PanelId) => void;
  /** Pin an unpinned panel on the inner end of a side. */
  onPin: (p: PanelId, side: 'left' | 'right') => void;
}

export function Rail({ panel, onPick, chordCount, pinned, shown, onTogglePin, onPin }: Props) {
  const viz = useViz();
  return (
    <nav className={classes.rail} aria-label="Analysis panels">
      <Tip k="analysisRail">
        <span className={classes.railHead}>Analysis</span>
      </Tip>
      <div role="tablist" aria-orientation="vertical" className={classes.railList}>
        {PANELS.map((p) => {
          const isPinned = pinned.has(p.id);
          const isShown = shown.has(p.id);
          const label = panelLabel(p.id, viz.view);
          return (
            <div key={p.id} className={classes.railRow}>
              <Tip
                k={panelTip(p.id, p.tip, viz.view)}
                as="control"
                block
                extra={isViz(p.id) ? label : undefined}
              >
                <button
                  type="button"
                  role="tab"
                  id={`tab-${p.id}`}
                  aria-selected={panel === p.id}
                  aria-controls="analysis-panel"
                  className={classes.railItem}
                  data-wide={isViz(p.id) ? 'true' : undefined}
                  onClick={() => onPick(p.id)}
                >
                  <span className={classes.railLabel}>{label}</span>
                  <span className={classes.railCount}>{summaryOf(p.id, chordCount, viz)}</span>
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
                {isPinned ? (
                  <button
                    type="button"
                    className={classes.pinBtn}
                    aria-pressed
                    aria-label={`Unpin ${label}${isShown ? '' : ' (no room at this width)'}`}
                    data-state={isShown ? 'shown' : 'hidden'}
                    onClick={() => onTogglePin(p.id)}
                  >
                    <PinIcon />
                  </button>
                ) : (
                  <PinMenu onPin={(side) => onPin(p.id, side)}>
                    <button
                      type="button"
                      className={classes.pinBtn}
                      aria-pressed={false}
                      aria-label={`Pin ${label} as a column`}
                      data-state="off"
                    >
                      <PinIcon />
                    </button>
                  </PinMenu>
                )}
              </Tip>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
