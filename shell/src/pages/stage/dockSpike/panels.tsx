/**
 * The dock spike's panels, registry and the three target arrangements as screensets (throwaway, like the other spike
 * modules). `canvas` is `keepMounted` so switching screenset keeps it alive. `note` is a `multiple` kind: its instances
 * (`note:<key>`) come from the page's persisted instance list (the dynamic registry, design 1.4). The Panels menu reaches
 * the Stage API through `DockStage`'s `onApi` prop.
 */
import { useEffect, useState } from 'react';
import { Button } from '@mantine/core';
import { buildStageRegistry, type PanelKind } from '../../../components/Stage/dock';
import type { StageRegistry } from '../../../components/Stage/registry';
import {
  makeDocker,
  makeScreenset,
  makeStore,
  slotSizeAttr,
  type Screenset,
  type ScreensetStore,
  type SlotSize,
} from '../../../lib/stage';
import { NotesStandin } from '../standins/NotesStandin';
import { PickerStandin } from '../standins/PickerStandin';
import { RollStandin } from '../standins/RollStandin';
import classes from './dockSpike.module.css';

const WIDTHS = ['narrow', 'regular', 'wide'] as const;
const HEIGHTS = ['short', 'regular', 'tall'] as const;
const ALL: SlotSize[] = WIDTHS.flatMap((width) => HEIGHTS.map((height) => ({ width, height })));

/** Mount counts per panel id, so a person (and the tests) can see a panel is never remounted. */
export const dockProbe: Record<string, number> = {};

function Standin({ id, size, label }: { id: string; size: SlotSize; label?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    dockProbe[id] = (dockProbe[id] ?? 0) + 1;
  }, [id]);
  return (
    <div data-standin={id} className={classes.standin}>
      <p className={classes.sizeText}>
        {label ? `${label}, ` : ''}size {slotSizeAttr(size)}
      </p>
      <div className={classes.counter}>
        <Button size="compact-xs" variant="default" onClick={() => setN((x) => x + 1)}>
          {`Count ${id}`}
        </Button>
        <span data-testid={`count-${id}`}>{n}</span>
      </div>
    </div>
  );
}

const standin = (id: string, title: string, over: Partial<PanelKind> = {}): PanelKind => ({
  id,
  title,
  sizes: ALL,
  minSize: { width: 'narrow', height: 'short' },
  render: (size) => <Standin id={id} size={size} />,
  ...over,
});

export const DOCK_KINDS: readonly PanelKind[] = [
  standin('canvas', 'Canvas', { keepMounted: true, home: 'Canvas' }),
  standin('desk', 'Desk', { home: 'Canvas' }),
  standin('clip-editor', 'Clip editor', {
    home: 'Detail',
    render: (size) => <RollStandin size={size} />,
  }),
  standin('chords', 'Chords', { home: 'Tools', render: (size) => <PickerStandin size={size} /> }),
  standin('sets', 'Sets', {
    home: 'Tools',
    sizes: ALL,
    render: (size) => <NotesStandin size={size} />,
  }),
  standin('voicings', 'Voicings', { home: 'Tools' }),
  standin('visualizer', 'Visualizer'),
  // several instances: `note:<key>`, the keys persisted by the page
  standin('note', 'Note', {
    multiple: true,
    home: 'Tools',
    render: (size, key) => <Standin id={`note:${key}`} size={size} label={`note ${key}`} />,
  }),
];

/** The `multiple` kinds the Panels menu offers "New instance" for. */
export const NEW_INSTANCE_KINDS = DOCK_KINDS.filter((k) => k.multiple).map(({ id, title }) => ({
  id,
  title,
}));

/** The registry with no instances (what the stored screensets are checked against in tests). */
export const DOCK_REGISTRY: StageRegistry = buildStageRegistry(DOCK_KINDS, []);

const dock = makeDocker;

/** (a) A top docker over a bottom area whose right-hand docker holds three tabs. */
const arrangementA = (): Screenset =>
  makeScreenset({
    id: 'a',
    name: '(a) Top over bottom, three tabs',
    tree: {
      kind: 'split',
      dir: 'column',
      children: [
        { weight: 0.5, node: dock('a1', 'Canvas', ['canvas']) },
        {
          weight: 0.5,
          node: {
            kind: 'split',
            dir: 'row',
            children: [
              { weight: 1, node: dock('a2', 'Detail', ['clip-editor']) },
              { rem: 30, node: dock('a3', 'Tools', ['chords', 'sets', 'voicings'], 'chords') },
            ],
          },
        },
      ],
    },
  });

/** (b) Left, centre and right dockers with one tab each. */
const arrangementB = (): Screenset =>
  makeScreenset({
    id: 'b',
    name: '(b) Left, centre, right',
    tree: {
      kind: 'split',
      dir: 'row',
      children: [
        { rem: 22, node: dock('b1', 'Library', ['sets']) },
        { weight: 1, node: dock('b2', 'Canvas', ['canvas']) },
        { rem: 26, node: dock('b3', 'Visualizer', ['visualizer']) },
      ],
    },
  });

/** (c) A top docker over a bottom split into left and right; the right one is empty. */
const arrangementC = (): Screenset =>
  makeScreenset({
    id: 'c',
    name: '(c) Top over left and right',
    tree: {
      kind: 'split',
      dir: 'column',
      children: [
        { weight: 0.5, node: dock('c1', 'Canvas', ['canvas', 'desk'], 'canvas') },
        {
          weight: 0.5,
          node: {
            kind: 'split',
            dir: 'row',
            children: [
              { weight: 0.5, node: dock('c2', 'Detail', ['clip-editor']) },
              { weight: 0.5, node: dock('c3', 'Tools') },
            ],
          },
        },
      ],
    },
  });

export const DEFAULT_ARRANGEMENTS: readonly Screenset[] = [
  arrangementA(),
  arrangementB(),
  arrangementC(),
];

export const defaultDockStore = (): ScreensetStore => makeStore(DEFAULT_ARRANGEMENTS, 'a');
