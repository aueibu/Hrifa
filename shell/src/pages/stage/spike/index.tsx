import { createStageRegistry, type StageModule } from '../../../components/Stage/registry';
/** The spike's realistic modules, their registry and the two preset layouts ("sketch" and "audition"). */
import type { SlotSize } from '../../../lib/stage';
import type { PresetDef } from '../presets';
import { KIT_MODULE } from '../standins';
import { CanvasStandin } from './CanvasStandin';
import { ChordPicker } from './ChordPicker';
import { RollModule } from './RollModule';

const WIDTHS = ['narrow', 'regular', 'wide'] as const;
const HEIGHTS = ['short', 'regular', 'tall'] as const;
const grid = (widths: readonly SlotSize['width'][]): SlotSize[] =>
  widths.flatMap((width) => HEIGHTS.map((height) => ({ width, height })));

export const SPIKE_MODULES: readonly StageModule[] = [
  {
    id: 'pianoroll',
    title: 'Piano roll',
    sizes: grid(['regular', 'wide']),
    minSize: { width: 'regular', height: 'short' },
    render: (size) => <RollModule size={size} />,
  },
  {
    id: 'canvas',
    title: 'Canvas',
    sizes: grid(WIDTHS),
    minSize: { width: 'narrow', height: 'short' },
    render: (size) => <CanvasStandin size={size} />,
  },
  {
    id: 'chords',
    title: 'Chord picker',
    sizes: grid(WIDTHS),
    minSize: { width: 'narrow', height: 'short' },
    render: (size) => <ChordPicker size={size} />,
  },
];

export const SPIKE_REGISTRY = createStageRegistry([...SPIKE_MODULES, KIT_MODULE]);

/** Sketch: the picker as a 2x1 beside a big roll. Audition: the picker as a 3x1 above the roll, canvas on the right. */
export const SPIKE_PRESETS: readonly PresetDef[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    layout: {
      version: 1,
      columns: [
        { slots: ['chords'], width: 14 },
        { slots: ['pianoroll'], width: 44 },
      ],
    },
  },
  {
    id: 'audition',
    label: 'Audition',
    layout: {
      version: 1,
      columns: [
        { slots: ['chords', 'pianoroll'], width: 36, shares: [0.22, 0.78] },
        { slots: ['canvas'], width: 28 },
      ],
    },
  },
];
