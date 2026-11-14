/** The spike's registry of stand-in modules, built once at module scope, and the default layout over them. */
import type { Layout, SlotSize } from '../../../lib/stage';
import { KitDemo } from '../kit';
import { createStageRegistry, type StageModule } from '../registry';
import { NotesStandin } from './NotesStandin';
import { PickerStandin } from './PickerStandin';
import { RollStandin } from './RollStandin';

const WIDTHS = ['narrow', 'regular', 'wide'] as const;
const HEIGHTS = ['short', 'regular', 'tall'] as const;

const grid = (widths: readonly SlotSize['width'][]): SlotSize[] =>
  widths.flatMap((width) => HEIGHTS.map((height) => ({ width, height })));

export const STANDIN_MODULES: readonly StageModule[] = [
  {
    id: 'roll',
    title: 'Roll stand-in',
    sizes: grid(WIDTHS),
    minSize: { width: 'narrow', height: 'short' },
    render: (size) => <RollStandin size={size} />,
  },
  {
    id: 'picker',
    title: 'Picker stand-in',
    sizes: grid(WIDTHS),
    minSize: { width: 'narrow', height: 'short' },
    render: (size) => <PickerStandin size={size} />,
  },
  {
    // a larger minimum on purpose: it asks for at least 30 rem of width, to exercise the refusal rule
    id: 'notes',
    title: 'Notes stand-in',
    sizes: grid(['regular', 'wide']),
    minSize: { width: 'regular', height: 'short' },
    render: (size) => <NotesStandin size={size} />,
  },
];

export const KIT_MODULE: StageModule = {
  id: 'kit',
  title: 'Kit demo',
  sizes: grid(['regular', 'wide']),
  minSize: { width: 'regular', height: 'short' },
  render: () => <KitDemo />,
};

export const STANDIN_REGISTRY = createStageRegistry([...STANDIN_MODULES, KIT_MODULE]);

/** Picker beside a roll-over-notes stack (three modules, so one stack of two and one single). */
export const DEFAULT_STAGE_LAYOUT: Layout = {
  version: 1,
  columns: [
    { slots: ['picker'], width: 24 },
    { slots: ['roll', 'notes'], width: 42 },
  ],
};
