/**
 * Encyclopaedia layout mock for the Harmonic Field Lab (ARC M4). Static: numbers come once from the ported core
 * (mockData.ts); nothing here computes or sounds. Route /harmonic-field-lab/mock.
 */
import { useState } from 'react';
import { AppShell } from '@mantine/core';
import { AnalysisSection } from './AnalysisSection';
import { FieldSection } from './FieldSection';
import { GeneratorSection } from './GeneratorSection';
import { GlossaryDrawer } from './GlossaryDrawer';
import { KeyboardDock } from './KeyboardDock';
import { Rail } from './Rail';
import { RetunerSection } from './RetunerSection';
import { TopBar } from './TopBar';
import classes from './mock.module.css';

export function HarmonicFieldLabMockPage() {
  const [dockOpen, setDockOpen] = useState(true);
  const [glossary, setGlossary] = useState(false);

  return (
    <AppShell header={{ height: 92 }} padding={0}>
      <AppShell.Header>
        <TopBar
          onGlossary={() => setGlossary(true)}
          dockOpen={dockOpen}
          onDock={() => setDockOpen((o) => !o)}
        />
      </AppShell.Header>
      <AppShell.Main className={classes.root} data-dock={dockOpen ? 'open' : 'closed'}>
        <div className={classes.layout}>
          <Rail />
          <main className={classes.main}>
            <GeneratorSection />
            <FieldSection />
            <AnalysisSection />
            <RetunerSection />
          </main>
        </div>
        <KeyboardDock open={dockOpen} onToggle={() => setDockOpen((o) => !o)} />
      </AppShell.Main>
      <GlossaryDrawer opened={glossary} onClose={() => setGlossary(false)} />
    </AppShell>
  );
}
