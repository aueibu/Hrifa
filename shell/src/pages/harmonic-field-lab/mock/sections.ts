/** The contents rail model: every section and block with a one-line live-looking summary, from the static data. */
import {
  analysis,
  chords,
  completeKeys,
  field,
  finalDrift,
  prop,
  retunerCards,
  rel,
  widestMiss,
  why,
  modes,
  lattice,
  presetInfo,
  fmtSigned,
} from './mockData';

export interface RailBlock {
  id: string;
  title: string;
  summary: string;
}
export interface RailSection {
  id: string;
  title: string;
  blocks: RailBlock[];
}

const winner = why.entries.find((e) => e.chosen);

export const SECTIONS: RailSection[] = [
  {
    id: 'sec-generator',
    title: 'Generator',
    blocks: [
      { id: 'blk-source', title: 'Preset & method', summary: presetInfo.name },
      { id: 'blk-primes', title: 'Prime filter', summary: 'all on' },
      { id: 'blk-method', title: 'Method options', summary: 'harmonic' },
    ],
  },
  {
    id: 'sec-field',
    title: 'Field & subset',
    blocks: [
      { id: 'blk-circle', title: 'Pitch circle', summary: `${rel.length} of ${field.length}` },
      { id: 'blk-subset', title: 'Subset controls', summary: 'mode 0' },
      {
        id: 'blk-tuner',
        title: 'Tuner strip',
        summary: `${widestMiss.ratio} ${fmtSigned(widestMiss.dev12)} c`,
      },
      { id: 'blk-lattice', title: 'Lattice', summary: `${lattice.axes.length} prime axes` },
      { id: 'blk-fieldtable', title: 'Field table', summary: `${field.length} notes` },
    ],
  },
  {
    id: 'sec-analysis',
    title: 'Analysis',
    blocks: [
      { id: 'blk-stats', title: 'Stats', summary: `${analysis.groups.length} step sizes` },
      { id: 'blk-scale', title: 'Scale', summary: `${rel.length} degrees` },
      { id: 'blk-spectrum', title: 'Interval spectrum', summary: prop.verdict },
      { id: 'blk-chords', title: 'Chords', summary: `${chords.length} found` },
      { id: 'blk-keys', title: 'Keys', summary: `${completeKeys.length} of ${field.length}` },
      { id: 'blk-modes', title: 'Modes', summary: `${modes.length} modes` },
    ],
  },
  {
    id: 'sec-retuner',
    title: 'Retuner',
    blocks: [
      { id: 'blk-cards', title: 'Cards', summary: `${retunerCards.length} cards` },
      { id: 'blk-retcontrols', title: 'Retuner controls', summary: 'Auto' },
      { id: 'blk-why', title: 'Why this card won', summary: `card ${winner ? winner.card : '-'}` },
      { id: 'blk-drift', title: 'Drift', summary: `${fmtSigned(finalDrift.driftCents, 1)} c` },
    ],
  },
];

export const BLOCK_IDS = SECTIONS.flatMap((s) => s.blocks.map((b) => b.id));
