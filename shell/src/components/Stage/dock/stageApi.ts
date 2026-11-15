/**
 * `useStageApi()`: the plain functions a panel (or its host) uses to arrange the Stage. Provided by `DockStage` through
 * a React context. None of them reaches beyond the screenset `update` function the DockStage was given.
 *
 * - `open(id)`: put a closed panel back where it last was (remembered place, then its home docker). Never guarded.
 * - `show(id)`: open it if closed, make it its docker's active tab and expand its docker if collapsed (and bring a
 *   narrow-hidden docker back). Never guarded. `focus: true` also moves focus to its tab.
 * - `close(id)`: close it and remember the place.
 * - `sendTo(id, target)`: move it to a docker (as a tab) or into a new docker beside another. Guarded: refused when it
 *   would leave an open docker below its panel's minimum (a narrow collapse alone is allowed).
 * - `isOpen(id)`: it is a tab of some docker. `isShown(id)`: open, the active tab of its docker, docker visible.
 */
import { createContext, useContext } from 'react';
import type { PanelId, Target } from '../../../lib/stage';

export interface StageApi {
  open(id: PanelId, opts?: { home?: string }): void;
  show(id: PanelId, opts?: { focus?: boolean }): void;
  close(id: PanelId): void;
  sendTo(id: PanelId, target: Target): void;
  isOpen(id: PanelId): boolean;
  isShown(id: PanelId): boolean;
}

const NOT_MOUNTED = (): never => {
  throw new Error('useStageApi() must be used inside a DockStage');
};

export const StageApiContext = createContext<StageApi>({
  open: NOT_MOUNTED,
  show: NOT_MOUNTED,
  close: NOT_MOUNTED,
  sendTo: NOT_MOUNTED,
  isOpen: NOT_MOUNTED,
  isShown: NOT_MOUNTED,
});

export const useStageApi = (): StageApi => useContext(StageApiContext);
