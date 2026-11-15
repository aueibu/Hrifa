/**
 * Where keyboard focus goes after an action that re-renders the Stage (a shortcut, a menu choice, a closed tab). A
 * request is made with `requestFocus` in DockStage and resolved in a layout effect once the element exists (the element
 * often only exists after the edit: a collapsed docker's strip menu, a tab that moved).
 */
import type { DockerId, PanelId } from '../../../lib/stage';

export type FocusReq =
  /** A tab by panel id. */
  | { kind: 'tab'; panel: PanelId }
  /** A docker: its active tab; an empty or collapsed one, its name button. */
  | { kind: 'docker'; docker: DockerId }
  /** A docker's menu button (it may have moved to the collapsed strip). */
  | { kind: 'dockerMenu'; docker: DockerId }
  /** A docker's name button. */
  | { kind: 'dockerName'; docker: DockerId }
  /** A docker's active panel (the tabpanel host). */
  | { kind: 'body'; docker: DockerId };

const all = (root: ParentNode, selector: string) => [
  ...root.querySelectorAll<HTMLElement>(selector),
];

const section = (root: ParentNode, docker: DockerId): HTMLElement | null =>
  all(root, 'section[data-docker-id]').find((s) => s.dataset.dockerId === docker) ?? null;

/** The element a request points at, or null when it is not in the DOM (yet). */
export function resolveFocus(root: ParentNode, req: FocusReq): HTMLElement | null {
  if (req.kind === 'tab') {
    return (
      all(root, '[role="tab"][data-tab-id]').find((t) => t.dataset.tabId === req.panel) ?? null
    );
  }
  const sec = section(root, req.docker);
  if (!sec) {
    return null;
  }
  switch (req.kind) {
    case 'docker':
      return (
        sec.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
        sec.querySelector<HTMLElement>('[data-docker-name]')
      );
    case 'dockerMenu':
      return sec.querySelector<HTMLElement>('[data-docker-menu]');
    case 'dockerName':
      return sec.querySelector<HTMLElement>('[data-docker-name]');
    case 'body':
      return (
        all(sec, '[data-panel-host][role="tabpanel"]').find((h) => !h.hasAttribute('inert')) ?? null
      );
  }
}
