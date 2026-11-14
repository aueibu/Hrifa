import type { TipKey } from '../texts';
/**
 * What the visualizer panels share as data: each instance's small settings (2D or 3D, the three prime axes, the
 * keyboard's generators, the picked n-EDO) and the tooltip entry of each view. The settings live in the lab state
 * (UiSettings.viz), so the rail summary, the panel and its pop-out all read the same values. No JSX, no data.
 */
import { VIZ_IDS, VIZ_VIEW_LABEL, type VizId, type VizView } from './layout';

/** How the lattice places notes: by prime exponents, by generator steps, or by CPS factor membership. */
export type LatMode = 'prime' | 'gen' | 'cps';
export const LAT_MODES: readonly LatMode[] = ['prime', 'gen', 'cps'];

export interface VizSettings {
  dim: '2d' | '3d';
  /** The three prime axes of the 3D lattice; null is the default (3, 5, 7). */
  axes3: number[] | null;
  /** Show the ratio labels on the lattice (2D and 3D). */
  labels: boolean;
  /** Lattice axis mode (a mode the field cannot use falls back to primes when drawn). */
  latMode: LatMode;
  /** Generators of the isomorphic keyboard, as ratio text, and the match tolerance in cents. */
  isoG1: string;
  isoG2: string;
  isoTol: number;
  /** The n-EDO clicked in the EDO fit chart. */
  edoPick: number | null;
}

export const DEFAULT_SETTINGS: VizSettings = {
  dim: '2d',
  axes3: null,
  labels: true,
  latMode: 'prime',
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

/** The tooltip entry of each view (its title). */
export const VIEW_TIP: Record<VizView, TipKey> = {
  lattice: 'lattice',
  edo: 'edoFit',
  dissonance: 'dissCurve',
  iso: 'isoKeyboard',
};

/** The title of a visualizer panel: its current view's name. */
export const vizTitle = (view: VizView) => VIZ_VIEW_LABEL[view];
