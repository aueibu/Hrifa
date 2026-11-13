/** Panel renderer and the pinned column wrapper (its move and unpin buttons live in the panel's own header strip). */
import { ActionIcon } from '@mantine/core';
import { ChordsPanel } from './ChordsPanel';
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from './icons';
import { KeysModesPanel } from './KeysModesPanel';
import { LatticePanel } from './LatticePanel';
import { canMove, type Layout, type PanelId } from './layout';
import { panelLabel } from './Rail';
import { RetunerPanel } from './RetunerPanel';
import { SpectrumPanel } from './SpectrumPanel';
import { PinActionsContext, Tip } from './ui';
import classes from './mock.module.css';

export function renderPanel(id: PanelId, tol: number, setTol: (t: number) => void) {
  switch (id) {
    case 'chords':
      return <ChordsPanel tol={tol} setTol={setTol} />;
    case 'spectrum':
      return <SpectrumPanel />;
    case 'keys':
      return <KeysModesPanel />;
    case 'lattice':
      return <LatticePanel />;
    case 'retuner':
      return <RetunerPanel />;
  }
}

interface ColumnProps {
  id: PanelId;
  side: 'left' | 'right';
  layout: Layout;
  onMove: (id: PanelId, dir: 'left' | 'right') => void;
  onUnpin: (id: PanelId) => void;
  children: React.ReactNode;
}

/** One pinned column. On the left side the inner edge is on its right; on the right side, on its left. */
export function PinnedColumn({ id, side, layout, onMove, onUnpin, children }: ColumnProps) {
  const label = panelLabel(id);
  const inward = side === 'left' ? 'right' : 'left';
  const actions = (
    <>
      <Tip k="movePin" as="control">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={`Move ${label} left`}
          disabled={!canMove(layout, id, 'left')}
          onClick={() => onMove(id, 'left')}
        >
          <ArrowLeftIcon />
        </ActionIcon>
      </Tip>
      <Tip k="movePin" as="control">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={`Move ${label} right`}
          disabled={!canMove(layout, id, 'right')}
          onClick={() => onMove(id, 'right')}
        >
          <ArrowRightIcon />
        </ActionIcon>
      </Tip>
      <Tip k="unpinColumn" as="control">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={`Unpin ${label}`}
          onClick={() => onUnpin(id)}
        >
          <CloseIcon />
        </ActionIcon>
      </Tip>
    </>
  );
  return (
    <section
      className={classes.pinned}
      data-side={side}
      data-inward={inward}
      aria-label={`${label}, pinned column`}
    >
      <PinActionsContext.Provider value={actions}>{children}</PinActionsContext.Provider>
    </section>
  );
}
