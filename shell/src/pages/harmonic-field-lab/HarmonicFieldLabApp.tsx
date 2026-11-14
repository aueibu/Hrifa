/**
 * The lab's one-screen workspace in the Ableton/Bitwig manner, driven by the lab state (state/LabProvider).
 * Grid: top bar; rail | pinned columns (left) | generation-and-selection unit | pinned columns (right) | switcher
 * column; thin keyboard dock. Pinned columns appear only when the window is wide enough (state/layout.ts).
 * `HarmonicFieldLabApp` wraps it in the provider; a frozen embedding (tests, a later Workbench host) passes `initial` and `frozen`.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ActionIcon, AppShell } from '@mantine/core';
import { GlossaryDrawer } from './components/GlossaryDrawer';
import { PinIcon } from './components/icons';
import { KeyboardDock } from './components/KeyboardDock';
import { PinnedColumn, renderPanel } from './components/Panels';
import { PinMenu } from './components/PinMenu';
import { PANELS, Rail, panelLabel } from './components/Rail';
import { TopBar } from './components/TopBar';
import { PinActionsContext, Tip, useLab } from './components/ui';
import { Workspace } from './components/Workspace';
import { LabProvider } from './state/LabProvider';
import type { LabState } from './state/labState';
import {
  fitColumns,
  isViz,
  move,
  moveInStack,
  pin,
  pinnedIds,
  setSplit,
  stackWith,
  unpin,
  unstack,
  visiblePins,
  type Column,
  type Layout,
  type PanelId,
} from './state/layout';
import classes from './components/lab.module.css';

/** Window width in rem (the pure rule `fitColumns` turns it into a column count). */
function useWidthRem(): number {
  const read = () => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return window.innerWidth / rem;
  };
  const [w, setW] = useState(read);
  useEffect(() => {
    const on = () => setW(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

function Workbench() {
  const { state, dispatch, viz } = useLab();
  const { layout, ui } = state;
  const panel = ui.panel;
  const [glossary, setGlossary] = useState(false);
  const widthRem = useWidthRem();
  const edit = (fn: (l: Layout) => Layout) => dispatch({ type: 'layout', fn });

  const count = fitColumns(widthRem);
  const shown = useMemo(() => visiblePins(layout, count), [layout, count]);
  const pinnedSet = useMemo(() => new Set(pinnedIds(layout)), [layout]);
  // a stack shows all its panels or none
  const visibleCols = (cols: Column[]) => cols.filter((c) => c.every((id) => shown.has(id)));
  const left = visibleCols(layout.left);
  const right = visibleCols(layout.right);
  // the switcher never repeats a panel that already has a column
  const effective: PanelId = !shown.has(panel)
    ? panel
    : (PANELS.find((p) => !shown.has(p.id))?.id ?? panel);
  const columns = [
    '9.5rem',
    ...left.map(() => '24rem'),
    'minmax(0, 1fr)',
    ...right.map(() => '24rem'),
    '24rem',
  ].join(' ');
  const gridStyle: CSSProperties | undefined =
    left.length + right.length > 0 ? { gridTemplateColumns: columns } : undefined;
  // an unpinned visualizer shown in the switcher can be pinned from its own header
  const switcherPin =
    isViz(effective) && !pinnedSet.has(effective) ? (
      <Tip k="pinHere" as="control">
        <PinMenu onPin={(side) => edit((l) => pin(l, effective, side))}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Pin ${panelLabel(effective, viz.view)} left or right`}
          >
            <PinIcon />
          </ActionIcon>
        </PinMenu>
      </Tip>
    ) : null;
  const togglePin = (id: PanelId) => edit((l) => (pinnedSet.has(id) ? unpin(l, id) : pin(l, id)));
  const column = (ids: Column) => (
    <PinnedColumn
      key={ids.join('+')}
      ids={ids}
      layout={layout}
      render={renderPanel}
      onMove={(i, dir) => edit((l) => move(l, i, dir))}
      onUnpin={(i) => edit((l) => unpin(l, i))}
      onStackWith={(i, t) => edit((l) => stackWith(l, i, t))}
      onUnstack={(i) => edit((l) => unstack(l, i))}
      onMoveInStack={(i, d) => edit((l) => moveInStack(l, i, d))}
      onSplit={(i, v) => edit((l) => setSplit(l, i, v))}
    />
  );

  return (
    <AppShell header={{ height: 40 }} padding={0}>
      <AppShell.Header>
        <TopBar onGlossary={() => setGlossary(true)} />
      </AppShell.Header>
      <AppShell.Main className={classes.root} data-dock={ui.dockOpen ? 'open' : 'closed'}>
        <div className={classes.grid} style={gridStyle}>
          <Rail
            panel={effective}
            onPick={(p) => dispatch({ type: 'ui', patch: { panel: p } })}
            pinned={pinnedSet}
            shown={shown}
            onTogglePin={togglePin}
            onPin={(id, side) => edit((l) => pin(l, id, side))}
          />
          {left.map(column)}
          <Workspace />
          {right.map(column)}
          <section
            className={classes.analysis}
            id="analysis-panel"
            role="tabpanel"
            aria-labelledby={`tab-${effective}`}
          >
            <PinActionsContext.Provider value={switcherPin}>
              {renderPanel(effective)}
            </PinActionsContext.Provider>
          </section>
          <KeyboardDock
            open={ui.dockOpen}
            onToggle={() => dispatch({ type: 'ui', patch: { dockOpen: !ui.dockOpen } })}
          />
        </div>
      </AppShell.Main>
      <GlossaryDrawer opened={glossary} onClose={() => setGlossary(false)} />
    </AppShell>
  );
}

interface Props {
  /** A fixed starting state (tests, an embedding); without it the state is restored from storage. */
  initial?: LabState;
  /** Frozen: nothing is stored and nothing sounds. */
  frozen?: boolean;
}

export function HarmonicFieldLabApp({ initial, frozen }: Props) {
  return (
    <LabProvider initial={initial} frozen={frozen}>
      <Workbench />
    </LabProvider>
  );
}
