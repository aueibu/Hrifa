/**
 * Layout mock for the Harmonic Field Lab (ARC M4, round 2): a one-screen workspace in the Ableton/Bitwig manner.
 * Static: numbers come once from the ported core (mockData.ts). Route /harmonic-field-lab/mock.
 * Grid: top bar; rail | generation-and-selection unit | analysis panel; thin keyboard dock.
 */
import { useMemo, useState } from 'react';
import { AppShell } from '@mantine/core';
import { ChordsPanel } from './ChordsPanel';
import { FieldPanel } from './FieldPanel';
import { GlossaryDrawer } from './GlossaryDrawer';
import { KeyboardDock } from './KeyboardDock';
import { KeysModesPanel } from './KeysModesPanel';
import { LatticePanel } from './LatticePanel';
import { LIT_FIELD, chordTolerance, chordsAt } from './mockData';
import { Rail, type PanelId } from './Rail';
import { RetunerPanel } from './RetunerPanel';
import { SpectrumPanel } from './SpectrumPanel';
import { TopBar } from './TopBar';
import { LabContext, type Lab } from './ui';
import { Workspace } from './Workspace';
import classes from './mock.module.css';

export function HarmonicFieldLabMockPage() {
  const [panel, setPanel] = useState<PanelId>('chords');
  const [dockOpen, setDockOpen] = useState(true);
  const [glossary, setGlossary] = useState(false);
  const [tol, setTol] = useState(chordTolerance);
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const [chord, setChord] = useState<ReadonlySet<number>>(LIT_FIELD);
  const [mode, setMode] = useState(0);
  const lab = useMemo<Lab>(
    () => ({ hover, pin, setHover, setPin, chord, setChord, mode, setMode }),
    [hover, pin, chord, mode]
  );

  return (
    <LabContext.Provider value={lab}>
      <AppShell header={{ height: 40 }} padding={0}>
        <AppShell.Header>
          <TopBar onGlossary={() => setGlossary(true)} />
        </AppShell.Header>
        <AppShell.Main className={classes.root} data-dock={dockOpen ? 'open' : 'closed'}>
          <div className={classes.grid}>
            <Rail panel={panel} onPick={setPanel} chordCount={chordsAt(tol).length} />
            <Workspace />
            <section
              className={classes.analysis}
              id="analysis-panel"
              role="tabpanel"
              aria-labelledby={`tab-${panel}`}
            >
              {panel === 'chords' && <ChordsPanel tol={tol} setTol={setTol} />}
              {panel === 'spectrum' && <SpectrumPanel />}
              {panel === 'keys' && <KeysModesPanel />}
              {panel === 'lattice' && <LatticePanel />}
              {panel === 'field' && <FieldPanel />}
              {panel === 'retuner' && <RetunerPanel />}
            </section>
            <KeyboardDock open={dockOpen} onToggle={() => setDockOpen((o) => !o)} />
          </div>
        </AppShell.Main>
        <GlossaryDrawer opened={glossary} onClose={() => setGlossary(false)} />
      </AppShell>
    </LabContext.Provider>
  );
}
