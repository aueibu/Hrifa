/**
 * What the components read: the lab state, the analysis derived from the active tab, and the actions. One context
 * (`LabContext`), with `useLab()` for everything and `useViz()` for the visualizer settings. No JSX.
 */
import { createContext, useContext, type Dispatch } from 'react';
import type { PreviewKind, PreviewTarget } from '../audio/plan';
import type { Base, ChordModel, KeysData, SpectrumData, StripDev, edoOf, dissOf } from './derive';
import type { Action, LabState, SoundingPitch, Tab } from './labState';
import type { VizId, VizView } from './layout';
import type { VizSettings } from './vizState';

export interface LabAudio {
  /** False when frozen: nothing sounds. */
  enabled: boolean;
  /** A computer key or dock key goes down (slot = position on the dock) or up. */
  press: (slot: number) => void;
  release: (slot: number) => void;
  /** One short note at a field note's own pitch (the field table's play button). */
  playNote: (fieldIndex: number) => void;
  playScale: () => void;
  /** These field notes one after another as a scale (a key's notes, root first), each at its own pitch, in the preview direction. */
  playFieldScale: (fieldIndices: readonly number[]) => void;
  /** The highlighted chord, or the whole subset when none is highlighted. */
  playChord: () => void;
  /** These field notes together, as a chord at their own pitch above 1/1 (a clicked chord chip); Parallel puts `rootIdx`'s note on 1/1. */
  playFieldChord: (fieldIndices: Iterable<number>, rootIdx?: number) => void;
  /** Exact pitches (cents above 1/1) together, as heard even when the field lacks them; lights the field notes they coincide with. */
  playCents: (
    cents: readonly number[],
    light?: readonly number[],
    chords?: readonly string[]
  ) => void;
  /**
   * Mode grid preview (Ctrl/Cmd+click listed, Shift+click pure, both): mode `mode` of the subset, or just its degree
   * `degree` when given. Listed = the nearest field notes, pure = the mode's exact intervals from 1/1.
   */
  playModePreview: (mode: number, kind: PreviewKind, degree?: number) => void;
  /** Tuner strip preview: a note's listed pitch, its target (note minus `dev` cents), or both held 1.5x. */
  playStripPreview: (fieldIndex: number, dev: number, kind: PreviewKind) => void;
  /**
   * The mode, mode degree or strip note the pointer (or focus) is on, or null: holding 1 / 2 / 3 there plays its listed /
   * pure / both tones for as long as the key is down.
   */
  setPreviewTarget: (target: PreviewTarget | null) => void;
  /** The pointer left `target`: forgotten only when it is still the current target. */
  clearPreviewTarget: (target: PreviewTarget) => void;
  /** A digit key went down (`id` = its physical key): start its preview on the current target. False when there is none. */
  holdPreview: (id: string, digit: string) => boolean;
  /** That key went up: stop its preview. */
  releasePreview: (id: string) => void;
  /** Panic: silence everything now. */
  stopAll: () => void;
  /** Hz a pitch of `cents` above 1/1 sounds at, with the current 1/1 Hz setting. */
  hzAt: (cents: number) => number;
}

export interface VizApi {
  view: (id: VizId) => VizView;
  setView: (id: VizId, v: VizView) => void;
  settings: (id: VizId) => VizSettings;
  patch: (id: VizId, p: Partial<VizSettings>) => void;
}

/** Analyses of the active tab, computed once per change of field, subset or mode (null where a size cap applies). */
export interface Analyses {
  spectrum: SpectrumData | null;
  chords: ChordModel | null;
  keys: KeysData | null;
  edo: ReturnType<typeof edoOf>;
  diss: ReturnType<typeof dissOf>;
}

export interface Lab {
  state: LabState;
  dispatch: Dispatch<Action>;
  tab: Tab;
  base: Base;
  /** Deviation of every field note from the strip's reference, and the caption that says what it is. */
  strip: { devs: StripDev[]; caption: string };
  an: Analyses;
  /** Field index pointed at and pinned (the inspector shows hover, else pin). */
  hover: number | null;
  pin: number | null;
  setHover: (i: number | null) => void;
  setPin: (i: number | null) => void;
  /** Notes of the highlighted chord (a hovered chip, else a clicked one), and the setters of each. */
  chord: ReadonlySet<number>;
  /** `pitches`: the card's real pitches (cents above 1/1, stacked octaves kept) for the Live roughness view; none = the field notes. */
  setChord: (s: ReadonlySet<number> | null, pitches?: readonly number[]) => void;
  /** The hovered chord's real pitches when its card gave them. */
  chordHoverPitches: readonly number[] | null;
  pickChord: (s: ReadonlySet<number> | null) => void;
  chordPicked: ReadonlySet<number> | null;
  mode: number;
  setMode: (m: number) => void;
  /** A saved subset pointed at; null when none. */
  preview: readonly number[] | null;
  setPreview: (s: readonly number[] | null) => void;
  /** What the ring, strip and views show as selected: the preview, else the real selection. */
  selected: ReadonlySet<number>;
  /** Field indices that sound now. */
  sounding: ReadonlySet<number>;
  /** Strip marks lit alone (a pure target tone that is no field note); only the tuner strip shows them. */
  soundingMarks: ReadonlySet<number>;
  /** Sounding pitches (cents above 1/1) that match no field note: drawn as ghost marks. */
  soundingGhosts: readonly number[];
  /** Every sounding pitch as played (cents above 1/1, stacked octaves kept) with the field note it lights (-1 none). */
  soundingPitches: readonly SoundingPitch[];
  /** Shelf chord ids that sound now: their cards light. */
  soundingChords: ReadonlySet<string>;
  /** Plain click on a note anywhere: toggle it in the subset (it does not pin). */
  clickNote: (i: number) => void;
  /** Alt+click (Alt+Enter) on a note anywhere: pin it in the inspector, or unpin it if it is pinned (it does not toggle). */
  pinNote: (i: number) => void;
  audio: LabAudio;
  viz: VizApi;
  /** Frozen (tests, an embedding): nothing is stored and nothing sounds. */
  frozen: boolean;
  /** The last write to storage failed (full or blocked): what is on screen may not survive a reload. */
  storeFailed: boolean;
  /** The generator the active tab belongs to (an `OwnerKey`), null for an unsaved generator with no subsets. */
  owner: string | null;
  /** The tab's inputs differ from its generator's (the "modified" dot). */
  modified: boolean;
  /** Why Update preset would do nothing right now (shown as the disabled reason), or null when it can run. */
  updateBlocker: string | null;
  canUpdate: boolean;
}

export const LabContext = createContext<Lab | null>(null);

export function useLab(): Lab {
  const v = useContext(LabContext);
  if (!v) {
    throw new Error('LabContext missing');
  }
  return v;
}

export const useViz = (): VizApi => useLab().viz;
