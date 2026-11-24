/** Test helper: store a workspace store under the project key, the way a saved project holds it. */
import { dockerByName, serializeWorkspaceStore, setCollapsed } from '../../../lib/stage';
import { compositionStateKeys } from '../stateKeys';
import { DETAIL_NAME, defaultWorkbenchWorkspaces } from './workbenchWorkspaces';

export function storeDefaultWorkspaces(
  options: { active?: 'canvas' | 'desk' | 'edit'; detailCollapsed?: boolean } = {}
): void {
  const base = defaultWorkbenchWorkspaces();
  const workspaces = Object.fromEntries(
    base.order.map((id) => {
      const s = base.workspaces[id];
      const detail = dockerByName(s.tree, DETAIL_NAME);
      return [id, options.detailCollapsed && detail ? setCollapsed(s, detail.id, true) : s];
    })
  );
  localStorage.setItem(
    compositionStateKeys.workspaces,
    serializeWorkspaceStore({ ...base, workspaces: workspaces, active: options.active ?? 'canvas' })
  );
}
