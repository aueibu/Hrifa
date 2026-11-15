/**
 * The viewer setting "Show close button on tabs": per VIEWER (not per docker or project), persisted under a
 * `hrifa.stage.` key, default off. DockStage owns it unless the host passes `showTabClose` and `onShowTabClose`.
 */
import { stageStorageKey } from '../../../lib/stage';
import type { StageStorage } from '../persistence';

export const SHOW_TAB_CLOSE_KEY = 'hrifa.stage.showTabClose.v1';

export function readShowTabClose(storage: StageStorage | undefined): boolean {
  try {
    return storage?.getItem(stageStorageKey(SHOW_TAB_CLOSE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export function writeShowTabClose(storage: StageStorage | undefined, on: boolean): void {
  try {
    storage?.setItem(stageStorageKey(SHOW_TAB_CLOSE_KEY), String(on));
  } catch {
    // storage can be missing or full; the setting still applies for this session
  }
}
