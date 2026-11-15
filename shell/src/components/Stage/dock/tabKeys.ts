/**
 * Roving focus for a tablist with manual activation (WAI-ARIA tabs): the arrows, Home and End move FOCUS between the
 * `[role=tab]` buttons of the list and never activate one (Enter or Space on a button click it). Shared by the docker
 * strips and the screenset strip. DOM only; wraps around at the ends.
 */
export type RoveKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export const isRoveKey = (key: string): key is RoveKey =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';

/** Focus the tab `key` leads to from `from`; false when `from` is not one of the list's tabs. */
export function roveFocus(list: HTMLElement, from: HTMLElement, key: RoveKey): boolean {
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const at = tabs.indexOf(from);
  if (at < 0 || tabs.length === 0) {
    return false;
  }
  const to =
    key === 'Home'
      ? 0
      : key === 'End'
        ? tabs.length - 1
        : (at + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[to].focus({ preventScroll: true });
  return true;
}
