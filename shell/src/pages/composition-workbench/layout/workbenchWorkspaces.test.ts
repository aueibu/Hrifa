import { describe, expect, it } from 'vitest';
import {
  dockerByName,
  serializeWorkspaceStore,
  treeDockers,
  type Workspace,
  type SplitChild,
} from '../../../lib/stage';
import {
  acceptsWorkspaceStore,
  bringPanelForward,
  CANVAS_PANEL,
  DATA_BLOCK_EDITOR_PANEL,
  defaultWorkbenchWorkspaces,
  DESK_PANEL,
  INSPECTOR_PANEL,
  isPanelShown,
  NODE_DETAIL_PANEL,
  parseStoredWorkspaces,
  workspaceForCanvas,
} from './workbenchWorkspaces';

/** The weights of the root column's two children: the top docker and the bottom row. */
function rootWeights(s: Workspace): number[] {
  if (s.tree.kind !== 'split') {
    throw new Error('root is not a split');
  }
  return s.tree.children.map((c: SplitChild) => c.weight ?? 1);
}

describe('the default workspaces', () => {
  const store = defaultWorkbenchWorkspaces();

  it('are Canvas, Desk and Edit, Canvas in front', () => {
    expect(store.order).toEqual(['canvas', 'desk', 'edit']);
    expect(store.order.map((id) => store.workspaces[id].name)).toEqual(['Canvas', 'Desk', 'Edit']);
    expect(store.active).toBe('canvas');
    expect(acceptsWorkspaceStore(store)).toBe(true);
  });

  it('put the canvas or desk over Detail beside Tools (the Inspector) of 30rem', () => {
    const canvas = store.workspaces.canvas;
    expect(treeDockers(canvas.tree).map((d) => [d.name, d.tabs])).toEqual([
      ['Canvas', [CANVAS_PANEL]],
      ['Detail', [NODE_DETAIL_PANEL, DATA_BLOCK_EDITOR_PANEL]],
      ['Tools', [INSPECTOR_PANEL]],
    ]);
    const desk = store.workspaces.desk;
    expect(treeDockers(desk.tree).map((d) => [d.name, d.tabs])[0]).toEqual(['Desk', [DESK_PANEL]]);
    const row = (canvas.tree as { children: SplitChild[] }).children[1].node;
    expect(row).toMatchObject({
      kind: 'split',
      dir: 'row',
      children: [{ weight: 1 }, { rem: 30 }],
    });
  });

  it('weigh the top 0.6, 0.6 and 0.3, open on the node panel, and remember the picker at Tools', () => {
    expect(rootWeights(store.workspaces.canvas)).toEqual([0.6, 0.4]);
    expect(rootWeights(store.workspaces.desk)).toEqual([0.6, 0.4]);
    expect(rootWeights(store.workspaces.edit)).toEqual([0.3, 0.7]);
    for (const id of store.order) {
      const s = store.workspaces[id];
      expect(dockerByName(s.tree, 'Detail')?.active).toBe(NODE_DETAIL_PANEL);
      expect(s.collapsed ?? []).toEqual([]);
      expect(s.lastDocker.chords).toMatchObject({ name: 'Tools', index: 1 });
      expect(dockerByName(s.tree, 'Tools')?.active).toBe(INSPECTOR_PANEL);
    }
  });
});

describe('the stored store', () => {
  it('round-trips a stored store unchanged, the chords place included', () => {
    const stored = defaultWorkbenchWorkspaces();
    const parsed = parseStoredWorkspaces(JSON.parse(serializeWorkspaceStore(stored)));
    expect(parsed).toEqual(stored);
  });

  it('turns anything unusable into the default store', () => {
    for (const bad of [null, 'x', 3, { version: 9 }, { version: 1, workspaces: {} }]) {
      const parsed = parseStoredWorkspaces(bad);
      expect(parsed.order).toEqual(['canvas', 'desk', 'edit']);
    }
  });
});

describe('page helpers', () => {
  const store = defaultWorkbenchWorkspaces();

  it('says which panels are showing: in front and not collapsed', () => {
    const canvas = store.workspaces.canvas;
    expect(isPanelShown(canvas, CANVAS_PANEL)).toBe(true);
    expect(isPanelShown(canvas, NODE_DETAIL_PANEL)).toBe(true);
    expect(isPanelShown(canvas, DATA_BLOCK_EDITOR_PANEL)).toBe(false);
    expect(isPanelShown(canvas, DESK_PANEL)).toBe(false);
    const detail = dockerByName(canvas.tree, 'Detail')!;
    expect(isPanelShown({ ...canvas, collapsed: [detail.id] }, NODE_DETAIL_PANEL)).toBe(false);
  });

  it('brings a panel forward in every workspace, and returns the same store when nothing changes', () => {
    const next = bringPanelForward(store, DATA_BLOCK_EDITOR_PANEL);
    for (const id of next.order) {
      expect(dockerByName(next.workspaces[id].tree, 'Detail')?.active).toBe(
        DATA_BLOCK_EDITOR_PANEL
      );
    }
    expect(bringPanelForward(next, DATA_BLOCK_EDITOR_PANEL)).toBe(next);
    expect(bringPanelForward(store, 'nothing-here')).toBe(store);
  });

  it('finds the workspace that shows the canvas', () => {
    expect(workspaceForCanvas(store)).toBe('canvas');
    expect(workspaceForCanvas({ ...store, active: 'edit' })).toBe('edit');
    expect(workspaceForCanvas({ ...store, active: 'desk' })).toBe('canvas');
  });
});
