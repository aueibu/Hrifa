import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Anchor, AppShell, Group, Tabs, Text, Title } from '@mantine/core';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Surface } from '../components/Surface/Surface';
import { AudioEngineProvider } from './composition-workbench/audio/AudioEngineProvider';
import { noteNames, chordsOf } from './scale-explorer/chords';
import { CompareTab, type CompareEntry } from './scale-explorer/components/CompareTab';
import { InfoDrawer } from './scale-explorer/components/InfoDrawer';
import { InputPanel } from './scale-explorer/components/InputPanel';
import {
  ModesPanel,
  chordPlayKey,
  chordSeqKey,
  modeKey,
  modePlayKey,
} from './scale-explorer/components/ModesPanel';
import { NeighboursPanel } from './scale-explorer/components/NeighboursPanel';
import { RingMarkerDefs, type RingCompare } from './scale-explorer/components/PitchRing';
import { PlaybackPanel } from './scale-explorer/components/PlaybackPanel';
import {
  playKeyFor,
  SummaryPanel,
  type SummaryColumn,
} from './scale-explorer/components/SummaryPanel';
import {
  chordScript,
  scaleScript,
  type ChordItem,
  type ChordStyle,
} from './scale-explorer/playback';
import {
  chordContext,
  buildView,
  copyText,
  summaryRows,
  type ViewOptions,
} from './scale-explorer/scaleView';
import { loadSettings, MAJOR_SCALE, saveSettings, type Settings } from './scale-explorer/settings';
import { useDrone, useScalePlayback } from './scale-explorer/usePlayback';
import classes from './scale-explorer/ScaleExplorer.module.css';

type TabId = 'scale' | 'compare';
const MAX_COMPARES = 4;

export function ScaleExplorerPage() {
  return (
    <AudioEngineProvider>
      <ScaleExplorer />
    </AudioEngineProvider>
  );
}

function ScaleExplorer() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabId = searchParams.get('tab') === 'compare' ? 'compare' : 'scale';
  const [compares, setCompares] = useState<CompareEntry[]>([]);
  const [compareNote, setCompareNote] = useState('');
  const [compareSize, setCompareSize] = useState(() => settings.selection.length || 7);
  const [openState, setOpenState] = useState<{ sig: string; keys: Set<string> }>({
    sig: '',
    keys: new Set(),
  });
  const [scrollTo, setScrollTo] = useState<{ index: number } | null>(null);
  const [droneOn, setDroneOn] = useState(false);
  const [lastRoot, setLastRoot] = useState(0);
  const { playingKey, now, start, stop } = useScalePlayback();

  useEffect(() => saveSettings(settings), [settings]);

  const set = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) =>
      setSettings((prev) => ({ ...prev, [key]: value })),
    []
  );

  const selection = settings.selection;
  const names = noteNames(settings.flats);
  const zeroRoot = settings.dronePc === 'follow' ? 0 : settings.dronePc;
  const options: ViewOptions = useMemo(
    () => ({
      invMode: settings.invMode,
      sortMode: settings.sortMode,
      expansion: settings.expansion,
      nameMode: settings.nameMode,
      flats: settings.flats,
      playAs: settings.playAs,
      zeroRoot,
      conv: settings.cmpConv,
    }),
    [settings, zeroRoot]
  );

  const view = useMemo(() => buildView(selection, options), [selection, options]);

  // Anything that changes what the modes are, or how they are numbered, ends playback (as in the artifact).
  const resetKey = JSON.stringify([
    selection,
    settings.invMode,
    settings.flats,
    settings.playAs,
    settings.dronePc,
    settings.sortMode,
    settings.expansion,
    settings.nameMode,
    settings.pathMax,
    settings.showFifths,
  ]);
  useEffect(() => {
    stop();
    setLastRoot(selection[0] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  useEffect(() => {
    if (now) {
      setLastRoot(now.root);
    }
  }, [now]);
  useEffect(() => {
    stop();
  }, [tab, stop]);

  useDrone({
    on: droneOn,
    pitchClass: settings.dronePc === 'follow' ? lastRoot : settings.dronePc,
    wave: settings.droneWave,
    volume: settings.droneVolume,
  });

  const selectionSig = selection.join(',');
  const openKeys = openState.sig === selectionSig ? openState.keys : new Set<string>();
  const setOpen = (next: Set<string>) => setOpenState({ sig: selectionSig, keys: next });

  // ----- selection -----
  const toggle = (pc: number) =>
    set(
      'selection',
      selection.includes(pc)
        ? selection.filter((p) => p !== pc)
        : [...selection, pc].sort((a, b) => a - b)
    );

  const loadSet = (z: number[]) => {
    set(
      'selection',
      [...z].sort((a, b) => a - b)
    );
    setCompares((prev) => prev.filter((c) => c.z.join(',') !== z.join(',')));
    setCompareNote('');
  };

  const toggleCompare = (z: number[]) => {
    const key = z.join(',');
    const found = compares.find((c) => c.z.join(',') === key);
    if (found) {
      setCompares(compares.filter((c) => c !== found));
      setCompareNote('');
      return;
    }
    if (compares.length >= MAX_COMPARES) {
      setCompareNote('Four comparisons is the maximum. Remove one to add another.');
      return;
    }
    const used = new Set(compares.map((c) => c.slot));
    let slot = 0;
    while (used.has(slot)) {
      slot++;
    }
    setCompares([...compares, { z, slot }]);
    setCompareNote('');
  };

  const setTab = (next: string | null) => {
    const value: TabId = next === 'compare' ? 'compare' : 'scale';
    if (value === 'compare' && selection.length >= 1) {
      setCompareSize(selection.length);
    }
    setSearchParams(value === 'scale' ? {} : { tab: value }, { replace: true });
  };

  // ----- derived comparison data (shown only on the Compare tab) -----
  const s0 = selection[0] ?? 0;
  const activeCompares: (CompareEntry & { abs: number[] })[] =
    tab === 'compare' && selection.length
      ? compares.map((c) => ({
          ...c,
          abs: c.z.map((x) => (x + s0) % 12).sort((a, b) => a - b),
        }))
      : [];
  const ringCompares: RingCompare[] = activeCompares.map((c) => ({ slot: c.slot, abs: c.abs }));
  const summaryColumns: SummaryColumn[] = activeCompares.flatMap((c) => {
    const cv = buildView(c.abs, { ...options, invMode: 'off' });
    return cv
      ? [{ slot: c.slot, z: c.z, rows: summaryRows(cv, { ...options, invMode: 'off' }) }]
      : [];
  });

  // ----- playback -----
  const rootOf = (abs0: number) => (settings.playAs === 'zero' ? zeroRoot : abs0);

  const playScale = (z: number[], loaded: boolean) => {
    const key = playKeyFor(z);
    if (playingKey === key) {
      stop();
      return;
    }
    let dot: number | null = null;
    if (tab === 'compare') {
      if (loaded) {
        dot = 0;
      } else {
        const at = compares.findIndex((c) => c.z.join(',') === z.join(','));
        dot = at >= 0 ? at + 1 : null;
      }
    }
    void start(key, scaleScript([{ modeIndex: -1, root: rootOf(s0), z }]), dot);
  };

  const playMode = (idx: number) => {
    if (!view) {
      return;
    }
    if (playingKey === modePlayKey(idx)) {
      stop();
      return;
    }
    const m = view.view[idx];
    void start(modePlayKey(idx), scaleScript([{ modeIndex: idx, root: rootOf(m.abs[0]), z: m.z }]));
  };

  const playAll = () => {
    if (!view) {
      return;
    }
    if (playingKey === 'all') {
      stop();
      return;
    }
    void start(
      'all',
      scaleScript(view.view.map((m, i) => ({ modeIndex: i, root: rootOf(m.abs[0]), z: m.z })))
    );
  };

  const playChord = (idx: number, k: number, e: number, d: number | null) => {
    if (!view) {
      return;
    }
    const key = d === null ? chordSeqKey(idx, k, e) : chordPlayKey(idx, k, e, d);
    if (playingKey === key) {
      stop();
      return;
    }
    const m = view.view[idx];
    const root = rootOf(m.abs[0]);
    const base = 60 + root - 12;
    const chords = chordsOf(m, k, e + 1, chordContext(m, options)).filter(
      (c) => d === null || c.i === d
    );
    const items: ChordItem[] = chords.map((c) => ({
      modeIndex: idx,
      chordKey: chordPlayKey(idx, k, e, c.i),
      root,
      midis: c.P.map((p) => base + p),
      pcs: c.P.map((p) => (root + p) % 12),
    }));
    if (d === null && items.length > 1) {
      // close the run on the first chord, an octave up
      items.push({ ...items[0], midis: items[0].midis.map((x) => x + 12) });
    }
    void start(key, chordScript(items, settings.chordStyle as ChordStyle));
  };

  const copy = async () => {
    if (!view) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(copyText(view, options, settings.pathMax));
      return true;
    } catch {
      return false;
    }
  };

  const rows = view ? summaryRows(view, options) : [];

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Anchor component={Link} to="/" size="sm">
              &larr; Workbench
            </Anchor>
            <Text c="dimmed">/</Text>
            <Title order={1} size="h4">
              Scale Explorer
            </Title>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Main className={classes.scope}>
        <RingMarkerDefs />
        <Tabs value={tab} onChange={setTab} mb="md">
          <Tabs.List aria-label="Views">
            <Tabs.Tab value="scale">Scale</Tabs.Tab>
            <Tabs.Tab value="compare">Compare</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        <div className={classes.layout}>
          <div className={classes.side}>
            <InputPanel
              selection={selection}
              compares={ringCompares}
              names={names}
              showFifths={settings.showFifths}
              flats={settings.flats}
              invMode={settings.invMode}
              inverted={view?.res.fixed != null ? view.res.inv : new Set<number>()}
              semis={view?.stats.semis ?? { hem: 0, coh: 0, iso: 0, chain: 0, edges: [], runs: [] }}
              now={now}
              onToggle={toggle}
              onShowFifths={(on) => set('showFifths', on)}
              onFlats={(on) => set('flats', on)}
              onInvMode={(mode) => set('invMode', mode)}
              onClear={() => set('selection', [])}
              onLoadMajor={() => set('selection', [...MAJOR_SCALE])}
              onCopy={copy}
            />
            {view ? (
              <SummaryPanel
                pcs={selection}
                rows={rows}
                columns={summaryColumns}
                note={compareNote}
                playingKey={playingKey}
                onPlay={playScale}
                onRemove={toggleCompare}
                onClearAll={() => {
                  setCompares([]);
                  setCompareNote('');
                }}
              />
            ) : (
              <Surface>
                <Text c="dimmed">Select at least one note to see its modes.</Text>
              </Surface>
            )}
            {view && (
              <NeighboursPanel
                view={view.view}
                pathMax={settings.pathMax}
                onPathMax={(n) => set('pathMax', n)}
                onPick={(index) => {
                  setOpen(new Set([...openKeys, modeKey(view.view[index])]));
                  setScrollTo({ index });
                }}
              />
            )}
            <PlaybackPanel
              settings={settings}
              names={names}
              droneOn={droneOn}
              playingAll={playingKey === 'all'}
              onDroneOn={setDroneOn}
              onPlayAll={playAll}
              set={set}
            />
          </div>

          <div className={classes.main}>
            {tab === 'scale' && view && (
              <>
                <ModesPanel
                  v={view}
                  o={options}
                  pathMax={settings.pathMax}
                  showFifths={settings.showFifths}
                  open={openKeys}
                  onToggleOpen={(key) => {
                    const next = new Set(openKeys);
                    if (!next.delete(key)) {
                      next.add(key);
                    }
                    setOpen(next);
                  }}
                  onOpenAll={() => setOpen(new Set(view.view.map(modeKey)))}
                  onCloseAll={() => setOpen(new Set())}
                  playingKey={playingKey}
                  now={now}
                  onSort={(mode) => set('sortMode', mode)}
                  onExpansion={(e) => set('expansion', e)}
                  onNameMode={(mode) => set('nameMode', mode)}
                  onPlayMode={playMode}
                  onPlayChord={playChord}
                  scrollTo={scrollTo}
                />
                <InfoDrawer />
              </>
            )}
            {tab === 'compare' && (
              <CompareTab
                selection={selection}
                size={compareSize}
                onSize={setCompareSize}
                merge={settings.cmpMerge}
                onMerge={(on) => set('cmpMerge', on)}
                conv={settings.cmpConv}
                onConv={(c) => set('cmpConv', c)}
                rank={settings.cmpRank}
                onRank={(r) => set('cmpRank', r)}
                sort={settings.cmpSort}
                onSort={(s) => set('cmpSort', s)}
                compares={compares}
                playingKey={playingKey}
                onToggleCompare={toggleCompare}
                onLoad={loadSet}
                onPlay={(z) => playScale(z, false)}
              />
            )}
          </div>
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
