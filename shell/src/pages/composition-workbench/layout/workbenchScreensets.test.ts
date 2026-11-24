import { describe, expect, it } from 'vitest';
import {
  dockerByName,
  serializeScreensetStore,
  treeDockers,
  type Screenset,
  type SplitChild,
} from '../../../lib/stage';
import {
  acceptsScreensetStore,
  bringPanelForward,
  CANVAS_PANEL,
  DATA_BLOCK_EDITOR_PANEL,
  defaultWorkbenchScreensets,
  DESK_PANEL,
  isPanelShown,
  NODE_DETAIL_PANEL,
  parseStoredScreensets,
  screensetForCanvas,
} from './workbenchScreensets';

/** The weights of the root column's two children: the top docker and the bottom row. */
function rootWeights(s: Screenset): number[] {
  if (s.tree.kind !== 'split') {
    throw new Error('root is not a split');
  }
  return s.tree.children.map((c: SplitChild) => c.weight ?? 1);
}

describe('the default screensets', () => {
  const store = defaultWorkbenchScreensets();

  it('are Canvas, Desk and Edit, Canvas in front', () => {
    expect(store.order).toEqual(['canvas', 'desk', 'edit']);
    expect(store.order.map((id) => store.screensets[id].name)).toEqual(['Canvas', 'Desk', 'Edit']);
    expect(store.active).toBe('canvas');
    expect(acceptsScreensetStore(store)).toBe(true);
  });

  it('put the canvas or desk over Detail beside an empty Tools of 30rem', () => {
    const canvas = store.screensets.canvas;
    expect(treeDockers(canvas.tree).map((d) => [d.name, d.tabs])).toEqual([
      ['Canvas', [CANVAS_PANEL]],
      ['Detail', [NODE_DETAIL_PANEL, DATA_BLOCK_EDITOR_PANEL]],
      ['Tools', []],
    ]);
    const desk = store.screensets.desk;
    expect(treeDockers(desk.tree).map((d) => [d.name, d.tabs])[0]).toEqual(['Desk', [DESK_PANEL]]);
    const row = (canvas.tree as { children: SplitChild[] }).children[1].node;
    expect(row).toMatchObject({
      kind: 'split',
      dir: 'row',
      children: [{ weight: 1 }, { rem: 30 }],
    });
  });

  it('weigh the top 0.6, 0.6 and 0.3, open on the node panel, and remember the picker at Tools', () => {
    expect(rootWeights(store.screensets.canvas)).toEqual([0.6, 0.4]);
    expect(rootWeights(store.screensets.desk)).toEqual([0.6, 0.4]);
    expect(rootWeights(store.screensets.edit)).toEqual([0.3, 0.7]);
    for (const id of store.order) {
      const s = store.screensets[id];
      expect(dockerByName(s.tree, 'Detail')?.active).toBe(NODE_DETAIL_PANEL);
      expect(s.collapsed ?? []).toEqual([]);
      expect(s.lastDocker.chords).toMatchObject({ name: 'Tools', index: 0 });
    }
  });
});

describe('the stored store', () => {
  it('round-trips a stored store unchanged, the chords place included', () => {
    const stored = defaultWorkbenchScreensets();
    const parsed = parseStoredScreensets(JSON.parse(serializeScreensetStore(stored)));
    expect(parsed).toEqual(stored);
  });

  it('turns anything unusable into the default store', () => {
    for (const bad of [null, 'x', 3, { version: 9 }, { version: 1, screensets: {} }]) {
      const parsed = parseStoredScreensets(bad);
      expect(parsed.order).toEqual(['canvas', 'desk', 'edit']);
    }
  });
});

describe('page helpers', () => {
  const store = defaultWorkbenchScreensets();

  it('says which panels are showing: in front and not collapsed', () => {
    const canvas = store.screensets.canvas;
    expect(isPanelShown(canvas, CANVAS_PANEL)).toBe(true);
    expect(isPanelShown(canvas, NODE_DETAIL_PANEL)).toBe(true);
    expect(isPanelShown(canvas, DATA_BLOCK_EDITOR_PANEL)).toBe(false);
    expect(isPanelShown(canvas, DESK_PANEL)).toBe(false);
    const detail = dockerByName(canvas.tree, 'Detail')!;
    expect(isPanelShown({ ...canvas, collapsed: [detail.id] }, NODE_DETAIL_PANEL)).toBe(false);
  });

  it('brings a panel forward in every screenset, and returns the same store when nothing changes', () => {
    const next = bringPanelForward(store, DATA_BLOCK_EDITOR_PANEL);
    for (const id of next.order) {
      expect(dockerByName(next.screensets[id].tree, 'Detail')?.active).toBe(
        DATA_BLOCK_EDITOR_PANEL
      );
    }
    expect(bringPanelForward(next, DATA_BLOCK_EDITOR_PANEL)).toBe(next);
    expect(bringPanelForward(store, 'nothing-here')).toBe(store);
  });

  it('finds the screenset that shows the canvas', () => {
    expect(screensetForCanvas(store)).toBe('canvas');
    expect(screensetForCanvas({ ...store, active: 'edit' })).toBe('edit');
    expect(screensetForCanvas({ ...store, active: 'desk' })).toBe('canvas');
  });
});
