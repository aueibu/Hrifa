import { describe, expect, it } from 'vitest';
import {
  dockerByName,
  dockerHolding,
  serializeScreensetStore,
  treeDockers,
  type Screenset,
  type SplitChild,
} from '../../../lib/stage';
import { compositionStateKeys } from '../usePersistentState';
import {
  acceptsScreensetStore,
  bringPanelForward,
  CANVAS_PANEL,
  chordsPlaceFor,
  CLIP_EDITOR_PANEL,
  DESK_PANEL,
  isPanelShown,
  MODULE_DETAIL_PANEL,
  NO_LEGACY_INPUTS,
  parseStoredScreensets,
  readLegacyLayoutInputs,
  screensetForCanvas,
  seedWorkbenchScreensets,
  upgradeChordsPlaces,
} from './workbenchScreensets';

/** The weights of the root column's two children: the top docker and the bottom row. */
function rootWeights(s: Screenset): number[] {
  if (s.tree.kind !== 'split') {
    throw new Error('root is not a split');
  }
  return s.tree.children.map((c: SplitChild) => c.weight ?? 1);
}

describe('the default screensets', () => {
  const store = seedWorkbenchScreensets();

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
      ['Detail', [MODULE_DETAIL_PANEL, CLIP_EDITOR_PANEL]],
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

  it('weigh the top 0.6, 0.6 and 0.3, open on the module panel, and remember the picker at Tools', () => {
    expect(rootWeights(store.screensets.canvas)).toEqual([0.6, 0.4]);
    expect(rootWeights(store.screensets.desk)).toEqual([0.6, 0.4]);
    expect(rootWeights(store.screensets.edit)).toEqual([0.3, 0.7]);
    for (const id of store.order) {
      const s = store.screensets[id];
      expect(dockerByName(s.tree, 'Detail')?.active).toBe(MODULE_DETAIL_PANEL);
      expect(s.collapsed ?? []).toEqual([]);
      expect(s.lastDocker.chords).toMatchObject({ name: 'Tools', index: 0 });
    }
  });
});

describe('seeding from the old keys', () => {
  it('reproduces an old project: the split, the collapse, the desk view and an open clip', () => {
    const store = seedWorkbenchScreensets({
      ...NO_LEGACY_INPUTS,
      canvasSplit: 0.7,
      detailCollapsed: true,
      workspaceView: 'desk',
      clipOpen: true,
    });
    expect(store.active).toBe('desk');
    for (const id of store.order) {
      const s = store.screensets[id];
      expect(rootWeights(s)).toEqual([0.7, 1 - 0.7]);
      const detail = dockerByName(s.tree, 'Detail');
      expect(s.collapsed).toEqual([detail?.id]);
      expect(detail?.active).toBe(CLIP_EDITOR_PANEL);
    }
  });

  it('opens a canvas project in Canvas, and clamps a split outside the old range', () => {
    const store = seedWorkbenchScreensets({
      ...NO_LEGACY_INPUTS,
      canvasSplit: 0.95,
      workspaceView: 'canvas',
    });
    expect(store.active).toBe('canvas');
    expect(rootWeights(store.screensets.canvas)[0]).toBe(0.8);
  });

  it('carries chordDockWidth into the width of Tools', () => {
    const store = seedWorkbenchScreensets({ ...NO_LEGACY_INPUTS, chordDockWidthPx: 640 });
    const row = (store.screensets.canvas.tree as { children: SplitChild[] }).children[1].node as {
      children: SplitChild[];
    };
    expect(row.children[1].rem).toBe(40);
    expect(store.screensets.canvas.lastDocker.chords.name).toBe('Tools');
  });

  it('seeds the chords place at the top docker for the takeover host (decision 2a, S4), without adding a docker', () => {
    const plain = seedWorkbenchScreensets();
    const store = seedWorkbenchScreensets({ ...NO_LEGACY_INPUTS, chordHost: 'takeover' });
    // Canvas and Edit: a last tab of the Canvas docker, by id and by name
    for (const id of ['canvas', 'edit']) {
      const s = store.screensets[id];
      const top = treeDockers(s.tree)[0];
      expect(s.lastDocker.chords).toEqual({
        docker: top.id,
        name: top.name,
        index: top.tabs.length,
      });
      expect(s.lastDocker.chords.name).toBe('Canvas');
    }
    // S4: the takeover never covered the desk, so the Desk screenset seeds the Tools docker, as for every other project
    expect(store.screensets.desk.lastDocker.chords.name).toBe('Tools');
    expect(store.screensets.desk.lastDocker.chords).toEqual(
      plain.screensets.desk.lastDocker.chords
    );
    // the layout is exactly the default one: the canvas is not halved by an extra docker
    for (const id of ['canvas', 'desk', 'edit']) {
      expect(store.screensets[id].tree).toEqual(plain.screensets[id].tree);
    }
  });

  it('the dock host seeds the chords place at Tools', () => {
    const store = seedWorkbenchScreensets({ ...NO_LEGACY_INPUTS, chordHost: 'dock' });
    for (const id of ['canvas', 'desk', 'edit']) {
      expect(store.screensets[id].lastDocker.chords.name).toBe('Tools');
    }
  });

  it('keeps the picker column of the editor arrangement on its side of Detail', () => {
    const store = seedWorkbenchScreensets({
      ...NO_LEGACY_INPUTS,
      editorLayout: {
        version: 1,
        columns: [
          { slots: ['chords'], width: 20 },
          { slots: ['roll'], width: 40 },
        ],
      },
    });
    const s = store.screensets.canvas;
    const names = treeDockers(s.tree).map((d) => d.name);
    expect(names.indexOf('Tools')).toBeLessThan(names.indexOf('Detail'));
    expect(dockerHolding(s.tree, CLIP_EDITOR_PANEL)?.name).toBe('Detail');
    expect(s.lastDocker.chords.name).toBe('Tools');
  });
});

describe('reading the old keys', () => {
  const keys = compositionStateKeys;
  const storage = (values: Record<string, unknown>) => ({
    getItem: (key: string) => (key in values ? (values[key] as string) : null),
  });

  it('reads valid values and ignores invalid or missing ones', () => {
    const read = readLegacyLayoutInputs(
      storage({
        [keys.canvasSplit]: '0.45',
        [keys.detailCollapsed]: 'true',
        [keys.workspaceView]: '"desk"',
        [keys.editorClipTarget]: '"clip-1"',
        'hrifa.note-editor.v1': JSON.stringify({ chordHost: 'takeover', chordDockWidth: 520 }),
        'hrifa.stage.layout.workbench-editor.v1': JSON.stringify({
          version: 1,
          columns: [
            { slots: ['roll'], width: 40 },
            { slots: ['chords'], width: 30 },
          ],
        }),
      }),
      keys
    );
    expect(read).toMatchObject({
      canvasSplit: 0.45,
      detailCollapsed: true,
      workspaceView: 'desk',
      clipOpen: true,
      chordHost: 'takeover',
      chordDockWidthPx: 520,
    });
    expect(read.editorLayout?.columns).toHaveLength(2);
    expect(
      readLegacyLayoutInputs(
        storage({
          [keys.canvasSplit]: '"x"',
          [keys.workspaceView]: '"grid"',
          [keys.detailCollapsed]: 'nope',
        }),
        keys
      )
    ).toEqual(NO_LEGACY_INPUTS);
  });
});

describe('the one-time chords place upgrade (M6a)', () => {
  const withoutChords = (store: ReturnType<typeof seedWorkbenchScreensets>) => {
    const screensets = Object.fromEntries(
      Object.entries(store.screensets).map(([id, s]) => {
        const { chords: _chords, ...rest } = s.lastDocker;
        return [id, { ...s, lastDocker: rest }];
      })
    );
    return { ...store, screensets };
  };

  it('gives a stored screenset with no chords place the Tools docker for a dock viewer', () => {
    const old = withoutChords(seedWorkbenchScreensets());
    expect(old.screensets.canvas.lastDocker.chords).toBeUndefined();
    const upgraded = upgradeChordsPlaces(old, 'dock');
    for (const id of upgraded.order) {
      const tools = dockerByName(upgraded.screensets[id].tree, 'Tools');
      expect(upgraded.screensets[id].lastDocker.chords).toEqual({
        docker: tools?.id,
        name: 'Tools',
        index: 0,
      });
    }
  });

  it('a takeover viewer, made between M5 and M6, gets the top docker (the choice is not lost)', () => {
    const old = withoutChords(seedWorkbenchScreensets());
    const upgraded = upgradeChordsPlaces(old, 'takeover');
    const canvas = upgraded.screensets.canvas;
    const top = treeDockers(canvas.tree)[0];
    expect(canvas.lastDocker.chords).toEqual({ docker: top.id, name: 'Canvas', index: 1 });
    // opening it joins the Canvas docker, in front of the canvas tab
    expect(dockerHolding(canvas.tree, CANVAS_PANEL)?.id).toBe(top.id);
  });

  it("replaces M5's placeholder place (no docker, the name Chords) and keeps any real place", () => {
    const seeded = seedWorkbenchScreensets();
    const placeholder = {
      ...seeded,
      screensets: {
        ...seeded.screensets,
        canvas: {
          ...seeded.screensets.canvas,
          lastDocker: {
            ...seeded.screensets.canvas.lastDocker,
            chords: { docker: '', name: 'Chords', index: 0 },
          },
        },
      },
    };
    const upgraded = upgradeChordsPlaces(placeholder, 'takeover');
    expect(upgraded.screensets.canvas.lastDocker.chords.name).toBe('Canvas');
    // S4: the Desk screenset of a takeover viewer upgrades to Tools
    expect(chordsPlaceFor(seeded.screensets.desk, 'takeover')?.name).toBe('Tools');
    // the person's own place (Tools, from the seed) is left alone, and an unchanged store is the same object
    expect(upgraded.screensets.desk).toBe(seeded.screensets.desk);
    expect(upgradeChordsPlaces(seeded, 'takeover')).toBe(seeded);
  });

  it('takeover: finds the docker holding the Canvas panel, not just the first docker', () => {
    const canvas = seedWorkbenchScreensets().screensets.canvas;
    const tree = canvas.tree;
    if (tree.kind !== 'split') {
      throw new Error('the seeded Canvas screenset is a split');
    }
    const reversed: Screenset = {
      ...canvas,
      tree: { ...tree, children: [...tree.children].reverse() },
    };
    const holder = dockerHolding(reversed.tree, CANVAS_PANEL);
    expect(treeDockers(reversed.tree)[0].id).not.toBe(holder?.id);
    expect(chordsPlaceFor(reversed, 'takeover')?.docker).toBe(holder?.id);
  });

  it('leaves a screenset with no Tools docker alone for a dock viewer (the panel home then falls back)', () => {
    const old = withoutChords(seedWorkbenchScreensets());
    const noTools: Screenset = {
      ...old.screensets.canvas,
      tree: treeDockers(old.screensets.canvas.tree)[0],
    };
    const upgraded = upgradeChordsPlaces(
      { ...old, screensets: { ...old.screensets, canvas: noTools } },
      'dock'
    );
    expect(upgraded.screensets.canvas.lastDocker.chords).toBeUndefined();
    expect(upgraded.screensets.desk.lastDocker.chords.name).toBe('Tools');
  });
});

describe('the stored store', () => {
  it('upgrades a stored store with no chords place when it loads', () => {
    const seeded = seedWorkbenchScreensets();
    const raw = JSON.parse(serializeScreensetStore(seeded)) as {
      screensets: Record<string, { lastDocker: Record<string, unknown> }>;
    };
    for (const s of Object.values(raw.screensets)) {
      delete s.lastDocker.chords;
    }
    const parsed = parseStoredScreensets(raw);
    expect(parsed.screensets.canvas.lastDocker.chords.name).toBe('Tools');
  });

  it('round-trips through the parse, the chords place included', () => {
    const seeded = seedWorkbenchScreensets({ ...NO_LEGACY_INPUTS, chordHost: 'takeover' });
    const parsed = parseStoredScreensets(JSON.parse(serializeScreensetStore(seeded)));
    expect(parsed).toEqual(seeded);
  });

  it('turns anything unusable into the seeded defaults', () => {
    for (const bad of [null, 'x', 3, { version: 9 }, { version: 1, screensets: {} }]) {
      const parsed = parseStoredScreensets(bad);
      expect(parsed.order).toEqual(['canvas', 'desk', 'edit']);
    }
  });
});

describe('page helpers', () => {
  const store = seedWorkbenchScreensets();

  it('says which panels are showing: in front and not collapsed', () => {
    const canvas = store.screensets.canvas;
    expect(isPanelShown(canvas, CANVAS_PANEL)).toBe(true);
    expect(isPanelShown(canvas, MODULE_DETAIL_PANEL)).toBe(true);
    expect(isPanelShown(canvas, CLIP_EDITOR_PANEL)).toBe(false);
    expect(isPanelShown(canvas, DESK_PANEL)).toBe(false);
    const detail = dockerByName(canvas.tree, 'Detail')!;
    expect(isPanelShown({ ...canvas, collapsed: [detail.id] }, MODULE_DETAIL_PANEL)).toBe(false);
  });

  it('brings a panel forward in every screenset, and returns the same store when nothing changes', () => {
    const next = bringPanelForward(store, CLIP_EDITOR_PANEL);
    for (const id of next.order) {
      expect(dockerByName(next.screensets[id].tree, 'Detail')?.active).toBe(CLIP_EDITOR_PANEL);
    }
    expect(bringPanelForward(next, CLIP_EDITOR_PANEL)).toBe(next);
    expect(bringPanelForward(store, 'nothing-here')).toBe(store);
  });

  it('finds the screenset that shows the canvas', () => {
    expect(screensetForCanvas(store)).toBe('canvas');
    expect(screensetForCanvas({ ...store, active: 'edit' })).toBe('edit');
    expect(screensetForCanvas({ ...store, active: 'desk' })).toBe('canvas');
  });
});
