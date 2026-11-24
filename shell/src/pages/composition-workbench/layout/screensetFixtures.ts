/** Test helper: store a screenset store under the project key, the way a saved project holds it. */
import { dockerByName, serializeScreensetStore, setCollapsed } from '../../../lib/stage';
import { compositionStateKeys } from '../stateKeys';
import { DETAIL_NAME, defaultWorkbenchScreensets } from './workbenchScreensets';

export function storeDefaultScreensets(
  options: { active?: 'canvas' | 'desk' | 'edit'; detailCollapsed?: boolean } = {}
): void {
  const base = defaultWorkbenchScreensets();
  const screensets = Object.fromEntries(
    base.order.map((id) => {
      const s = base.screensets[id];
      const detail = dockerByName(s.tree, DETAIL_NAME);
      return [id, options.detailCollapsed && detail ? setCollapsed(s, detail.id, true) : s];
    })
  );
  localStorage.setItem(
    compositionStateKeys.screensets,
    serializeScreensetStore({ ...base, screensets, active: options.active ?? 'canvas' })
  );
}
