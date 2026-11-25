/**
 * The workbench's panel kinds for the dock Stage (one-Stage M5, M6a): `canvas`, `desk`, `node-detail`, `data-block-editor`
 * and `chords` (the chord picker; it reads the page chord session, so it needs nothing from the page's panel nodes).
 * The kinds are static (module-level), so the registry is built once. The page owns what each panel shows and hands the
 * four elements down through `WorkbenchPanelsContext`: the Stage renders a panel through a portal at its own place in
 * the tree, so context from above the Stage reaches the panels, and a page render updates them as it did before the Stage.
 *
 * `canvas`, `desk` and `node-detail` are `keepMounted`: the canvas measures its box, the desk keeps its scroll and
 * edit sessions, and the node editors publish their outputs from effects (until R2 and R3 move that out), so none
 * of them may unmount when its workspace does not show it or the person closes its tab.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { PanelKind } from '../../../components/Stage/dock';
import { HEIGHT_CLASSES, WIDTH_CLASSES, type SlotSize } from '../../../lib/stage';
import { ChordsPanel } from '../chordInput/ChordsPanel';
import { ArrangerPanel } from '../components/ArrangerPanel';
import { OutlinerPanel, PropertiesPanel } from '../components/ScenePanels';
import {
  CANVAS_PANEL,
  CHORDS_PANEL,
  DATA_BLOCK_EDITOR_PANEL,
  DESK_PANEL,
  NODE_DETAIL_PANEL,
  ARRANGER_PANEL,
  OUTLINER_PANEL,
  PROPERTIES_PANEL,
} from './workbenchWorkspaces';
import classes from '../CompositionWorkbench.module.css';

export interface WorkbenchPanelNodes {
  canvas: ReactNode;
  desk: ReactNode;
  nodeDetail: ReactNode;
  dataBlockEditor: ReactNode;
}

export const WorkbenchPanelsContext = createContext<WorkbenchPanelNodes | null>(null);

/** One panel's body: fills its docker and clips (the node and editor panels scroll their own contents). */
function PanelSlot({ which, scroll }: { which: keyof WorkbenchPanelNodes; scroll?: boolean }) {
  const nodes = useContext(WorkbenchPanelsContext);
  return (
    <div
      className={scroll ? classes.dockPanelScroll : classes.dockPanel}
      data-workbench-panel={which}
    >
      {nodes?.[which] ?? null}
    </div>
  );
}

const SIZES: readonly SlotSize[] = WIDTH_CLASSES.flatMap((width) =>
  HEIGHT_CLASSES.map((height) => ({ width, height }))
);
const MIN_SIZE: SlotSize = { width: 'narrow', height: 'short' };

export const WORKBENCH_KINDS: readonly PanelKind[] = [
  {
    id: CANVAS_PANEL,
    title: 'Canvas',
    sizes: SIZES,
    minSize: MIN_SIZE,
    keepMounted: true,
    home: 'Canvas',
    render: () => <PanelSlot which="canvas" />,
  },
  {
    id: DESK_PANEL,
    title: 'Desk',
    sizes: SIZES,
    minSize: MIN_SIZE,
    keepMounted: true,
    home: 'Desk',
    render: () => <PanelSlot which="desk" />,
  },
  {
    id: NODE_DETAIL_PANEL,
    title: 'Nodes',
    sizes: SIZES,
    minSize: MIN_SIZE,
    keepMounted: true,
    home: 'Detail',
    render: () => <PanelSlot which="nodeDetail" scroll />,
  },
  {
    id: DATA_BLOCK_EDITOR_PANEL,
    title: 'Data-block editor',
    sizes: SIZES,
    minSize: MIN_SIZE,
    home: 'Detail',
    render: () => <PanelSlot which="dataBlockEditor" scroll />,
  },
  {
    id: CHORDS_PANEL,
    title: 'Chords',
    sizes: SIZES,
    minSize: MIN_SIZE,
    home: 'Tools',
    render: () => <ChordsPanel />,
  },
  {
    id: OUTLINER_PANEL,
    title: 'Outliner',
    sizes: SIZES,
    minSize: MIN_SIZE,
    home: 'Tools',
    render: () => <OutlinerPanel />,
  },
  {
    id: PROPERTIES_PANEL,
    title: 'Properties',
    sizes: SIZES,
    minSize: MIN_SIZE,
    home: 'Detail',
    render: () => <PropertiesPanel />,
  },
  {
    id: ARRANGER_PANEL,
    title: 'Arranger',
    sizes: SIZES,
    minSize: MIN_SIZE,
    home: 'Canvas',
    render: () => <ArrangerPanel />,
  },
];
