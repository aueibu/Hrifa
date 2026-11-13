/**
 * Layout mock for the Harmonic Field Lab (ARC M4): a one-screen workspace in the Ableton/Bitwig manner.
 * Static: numbers come once from the ported core (mockData.ts). Route /harmonic-field-lab/mock.
 * Grid: top bar; rail | pinned columns (left) | generation-and-selection unit | pinned columns (right) | switcher
 * column; thin keyboard dock. Pinned columns appear only when the window is wide enough (layout.ts).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AppShell } from '@mantine/core';
import { GlossaryDrawer } from './GlossaryDrawer';
import { KeyboardDock } from './KeyboardDock';
import {
  fitColumns,
  loadLayout,
  move,
  pin,
  pinnedIds,
  saveLayout,
  setSplit,
  stack,
  swapInStack,
  unpin,
  unstack,
  visiblePins,
  type Column,
  type PanelId,
} from './layout';
import { LIT_FIELD, chordTolerance, chordsAt } from './mockData';
import { PinnedColumn, renderPanel } from './Panels';
import { PANELS, Rail } from './Rail';
import { TopBar } from './TopBar';
import { LabContext, type Lab } from './ui';
import { Workspace } from './Workspace';
import classes from './mock.module.css';

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

export function HarmonicFieldLabMockPage() {
  const [panel, setPanel] = useState<PanelId>('chords');
  const [dockOpen, setDockOpen] = useState(true);
  const [glossary, setGlossary] = useState(false);
  const [tol, setTol] = useState(chordTolerance);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [chord, setChord] = useState<ReadonlySet<number>>(LIT_FIELD);
  const [mode, setMode] = useState(0);
  const [preview, setPreview] = useState<readonly number[] | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [layout, setLayout] = useState(loadLayout);
  useEffect(() => saveLayout(layout), [layout]);
  const widthRem = useWidthRem();

  const lab = useMemo<Lab>(
    () => ({
      hover,
      pin: pinned,
      setHover,
      setPin: setPinned,
      chord,
      setChord,
      mode,
      setMode,
      preview,
      setPreview,
      loaded,
      setLoaded,
    }),
    [hover, pinned, chord, mode, preview, loaded]
  );

  const count = fitColumns(widthRem);
  const shown = useMemo(() => visiblePins(layout, count), [layout, count]);
  const pinnedSet = useMemo(() => new Set(pinnedIds(layout)), [layout]);
  // a stack shows both panels or neither
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
  const togglePin = (id: PanelId) =>
    setLayout((l) => (pinnedSet.has(id) ? unpin(l, id) : pin(l, id)));
  const column = (ids: Column) => (
    <PinnedColumn
      key={ids.join('+')}
      ids={ids}
      layout={layout}
      render={(id) => renderPanel(id, tol, setTol)}
      onMove={(i, dir) => setLayout((l) => move(l, i, dir))}
      onUnpin={(i) => setLayout((l) => unpin(l, i))}
      onStack={(i) => setLayout((l) => stack(l, i))}
      onUnstack={(i) => setLayout((l) => unstack(l, i))}
      onSwap={(i) => setLayout((l) => swapInStack(l, i))}
      onSplit={(i, v) => setLayout((l) => setSplit(l, i, v))}
    />
  );

  return (
    <LabContext.Provider value={lab}>
      <AppShell header={{ height: 40 }} padding={0}>
        <AppShell.Header>
          <TopBar onGlossary={() => setGlossary(true)} />
        </AppShell.Header>
        <AppShell.Main className={classes.root} data-dock={dockOpen ? 'open' : 'closed'}>
          <div className={classes.grid} style={gridStyle}>
            <Rail
              panel={effective}
              onPick={setPanel}
              chordCount={chordsAt(tol).length}
              pinned={pinnedSet}
              shown={shown}
              onTogglePin={togglePin}
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
              {renderPanel(effective, tol, setTol)}
            </section>
            <KeyboardDock open={dockOpen} onToggle={() => setDockOpen((o) => !o)} />
          </div>
        </AppShell.Main>
        <GlossaryDrawer opened={glossary} onClose={() => setGlossary(false)} />
      </AppShell>
    </LabContext.Provider>
  );
}
