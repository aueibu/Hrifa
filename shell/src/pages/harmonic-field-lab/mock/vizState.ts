/**
 * What the visualizer panels share: each instance's view (stored in the layout) and its small settings (2D or 3D,
 * the three prime axes, the keyboard's generators, the picked n-EDO). Settings live in page state, so the rail
 * summary, the panel and its pop-out all read the same values. No JSX.
 */
import { createContext, useContext } from 'react';
import { VIZ_IDS, VIZ_VIEW_LABEL, type VizId, type VizView } from './layout';
import { dissDips, edoBest, field, isoFor, lattice3dFor } from './mockData';
import type { TipKey } from './texts';

export interface VizSettings {
  dim: '2d' | '3d';
  /** The three prime axes of the 3D lattice; null is the default (3, 5, 7). */
  axes3: number[] | null;
  /** Show the ratio labels on the lattice (2D and 3D). */
  labels: boolean;
  /** Generators of the isomorphic keyboard, as ratio text, and the match tolerance in cents. */
  isoG1: string;
  isoG2: string;
  isoTol: number;
  /** The n-EDO clicked in the EDO fit chart (a static highlight in the mock). */
  edoPick: number | null;
}

export const DEFAULT_SETTINGS: VizSettings = {
  dim: '2d',
  axes3: null,
  labels: true,
  isoG1: '3/2',
  isoG2: '2/1',
  isoTol: 20,
  edoPick: null,
};
export const defaultSettings = (): Record<VizId, VizSettings> =>
  Object.fromEntries(VIZ_IDS.map((id) => [id, { ...DEFAULT_SETTINGS }])) as Record<
    VizId,
    VizSettings
  >;

export const ISO_G1 = ['3/2', '4/3', '9/8'] as const;
export const ISO_G2 = ['2/1', '5/4', '7/4'] as const;
export const ISO_TOLS = [10, 20, 35] as const;

export interface VizApi {
  view: (id: VizId) => VizView;
  setView: (id: VizId, v: VizView) => void;
  settings: (id: VizId) => VizSettings;
  patch: (id: VizId, p: Partial<VizSettings>) => void;
}
export const VizContext = createContext<VizApi | null>(null);
export function useViz(): VizApi {
  const v = useContext(VizContext);
  if (!v) {
    throw new Error('VizContext missing');
  }
  return v;
}

/** The tooltip entry of each view (its title). */
export const VIEW_TIP: Record<VizView, TipKey> = {
  lattice: 'lattice',
  edo: 'edoFit',
  dissonance: 'dissCurve',
  iso: 'isoKeyboard',
};

/** The title of a visualizer panel: its current view's name. */
export const vizTitle = (view: VizView) => VIZ_VIEW_LABEL[view];

/** Rail summary of a visualizer: a live figure for its view. */
export function vizSummary(view: VizView, s: VizSettings): string {
  switch (view) {
    case 'lattice':
      return `${s.dim === '3d' ? '3D' : '2D'} ${lattice3dFor(s.axes3).axes.join('·')}`;
    case 'edo':
      return `best ${edoBest[0] ?? '-'}`;
    case 'dissonance':
      return `${dissDips.length} dips`;
    case 'iso':
      return `${
        new Set(
          isoFor(s.isoG1, s.isoG2, s.isoTol)
            .filter((c) => c.note !== null)
            .map((c) => c.note)
        ).size
      } of ${field.length}`;
  }
}
