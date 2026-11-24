import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompositionNodeInstance } from './compositionWorkspace';
import type { DataBlock } from './dataBlock';
import {
  dataBlockDescendants,
  dataBlockUserCount,
  dataBlockUsers,
  deleteImpact,
  makeSingleUser,
  purge,
  purgePlan,
  registerReferencer,
  remapPreview,
  remapUsers,
  unlinkUser,
  unusedDataBlocks,
  type Referencer,
  type RefsProject,
  type UserEntry,
} from './dataBlockRefs';
import { packet, type DataItem } from './model';

/** The B0 cast: R "Clave" (rhythm), R2 a second rhythm, P "Ring A" (pitch set), M "Melody" (notes). */
function rhythmBlock(id: string, name: string, values: number[]): DataBlock {
  const items: DataItem<number>[] = values.map((value, index) => ({
    id: `${id}:${index}`,
    value,
    provenance: [],
  }));
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: '2026-11-23T00:00:00Z',
    packet: packet('list', 'duration', items, [], undefined, { role: 'interOnset' }),
  };
}

function pitchBlock(id: string, name: string): DataBlock {
  const items: DataItem<number>[] = [6000, 6200, 6400].map((value, index) => ({
    id: `${id}:${index}`,
    value,
    provenance: [],
  }));
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: '2026-11-23T00:00:00Z',
    packet: packet('list', 'pitch', items),
  };
}

const R = rhythmBlock('R', 'Clave', [3, 3, 4, 2, 4]);
const R2 = rhythmBlock('R2', 'Tresillo', [3, 3, 2]);
const P = pitchBlock('P', 'Ring A');
const M = pitchBlock('M', 'Melody');

const N1: CompositionNodeInstance = {
  id: 'data-block-source-1',
  nodeId: 'data-block-source',
  x: 0,
  y: 0,
  dataBlockId: 'R',
};

/** Collection C1 ("rhythm" role) and strip S1 live in `extra`, as a later referencer would keep them. */
interface TestExtra {
  collection: { id: string; roles: { role: string; id: string | null }[] };
  strip: { id: string; dataBlockId: string | null };
}

function extraOf(project: RefsProject) {
  return project.extra as unknown as TestExtra;
}

const collectionReferencer: Referencer = {
  name: 'collection',
  refs: (project) =>
    extraOf(project).collection.roles.flatMap((entry) =>
      entry.id === null
        ? []
        : [
            {
              ownerKind: 'collection',
              ownerId: extraOf(project).collection.id,
              label: `Collection ${extraOf(project).collection.id} (${entry.role})`,
              ref: { id: entry.id },
              role: entry.role,
            },
          ]
    ),
  repoint: (project, entry, toId) => {
    const extra = extraOf(project);
    return {
      ...project,
      extra: {
        ...project.extra,
        collection: {
          ...extra.collection,
          roles: extra.collection.roles.map((role) =>
            role.role === entry.role ? { ...role, id: toId } : role
          ),
        },
      },
    };
  },
};

const stripReferencer: Referencer = {
  name: 'strip',
  refs: (project) => {
    const strip = extraOf(project).strip;
    return strip.dataBlockId === null
      ? []
      : [
          {
            ownerKind: 'strip',
            ownerId: strip.id,
            label: 'bar 9 (strip)',
            ref: { id: strip.dataBlockId },
          },
        ];
  },
  repoint: (project, _entry, toId) => ({
    ...project,
    extra: { ...project.extra, strip: { ...extraOf(project).strip, dataBlockId: toId } },
  }),
};

function project(overrides: Partial<RefsProject> = {}): RefsProject {
  const extra: TestExtra = {
    collection: { id: 'C1', roles: [{ role: 'rhythm', id: 'R' }] },
    strip: { id: 'S1', dataBlockId: 'R' },
  };
  return {
    dataBlocks: [R, R2, P, M],
    instances: [N1],
    extra: extra as unknown as Record<string, unknown>,
    ...overrides,
  };
}

const unregister: (() => void)[] = [];
beforeEach(() => {
  unregister.push(registerReferencer(collectionReferencer), registerReferencer(stripReferencer));
});
afterEach(() => {
  unregister.splice(0).forEach((remove) => remove());
});

function userOf(state: RefsProject, id: string, kind: string): UserEntry {
  const entry = dataBlockUsers(state, id).find((candidate) => candidate.ownerKind === kind);
  if (!entry) {
    throw new Error(`no ${kind} user`);
  }
  return entry;
}

describe('users (S1)', () => {
  it('lists exactly the three users of R: the node, the collection role and the strip', () => {
    const users = dataBlockUsers(project(), 'R');
    expect(users.map((entry) => entry.ownerKind).sort()).toEqual(['collection', 'node', 'strip']);
    expect(users.find((entry) => entry.ownerKind === 'node')?.label).toBe('Data-block (node)');
    expect(users.find((entry) => entry.ownerKind === 'collection')?.role).toBe('rhythm');
    expect(dataBlockUserCount(project(), 'R')).toBe(3);
  });

  it('counts only references to that id', () => {
    expect(dataBlockUsers(project(), 'P')).toEqual([]);
    expect(dataBlockUsers(project(), 'R2')).toEqual([]);
  });

  it('labels several Make source nodes by their position among nodes of the same kind', () => {
    const second = { ...N1, id: 'data-block-source-2', dataBlockId: 'P' };
    const users = dataBlockUsers(project({ instances: [N1, second] }), 'P');
    expect(users.map((entry) => entry.label)).toEqual(['Data-block 2 (node)']);
  });

  it('does not count a node of another kind or a blank Make source', () => {
    const blank = { id: 'data-block-source-2', nodeId: 'data-block-source' as const, x: 0, y: 0 };
    const other = { id: 'mixer', nodeId: 'mixer' as const, x: 0, y: 0, dataBlockId: 'R' };
    expect(dataBlockUserCount(project({ instances: [blank, other] }), 'R')).toBe(2);
  });

  it('lists the three users and no descendants as users on delete (S1, S7)', () => {
    const derived = { ...R2, id: 'D', lineage: derivedFrom('R') };
    const state = project({ dataBlocks: [R, derived, P, M] });
    const impact = deleteImpact(state, 'R');
    expect(impact.users).toHaveLength(3);
    expect(impact.descendants.map((block) => block.id)).toEqual(['D']);
    // D is not a user of R, and deleting R changes nothing about D.
    expect(dataBlockUsers(state, 'R').some((entry) => entry.ownerId === 'D')).toBe(false);
  });
});

function derivedFrom(id: string, versionId: string | null = null): DataBlock['lineage'] {
  return {
    head: 'v0',
    versions: [{ id: 'v0', parentId: null, at: '2026-11-23T00:00:00Z', operation: 'duplicate' }],
    derivedFrom: { dataBlockId: id, versionId, operation: 'duplicate' },
  };
}

describe('descendants (S7)', () => {
  it('finds derived data-blocks through other derived data-blocks, not by origin', () => {
    const d1 = { ...R2, id: 'D1', lineage: derivedFrom('R') };
    const d2 = { ...R2, id: 'D2', lineage: derivedFrom('D1') };
    const captured = {
      ...R2,
      id: 'C',
      origin: { nodeInstance: 'data-block-source-1' },
    };
    const state = project({ dataBlocks: [R, d1, d2, captured, P] });
    expect(dataBlockDescendants(state, 'R').map((block) => block.id)).toEqual(['D1', 'D2']);
    expect(dataBlockDescendants(state, 'D1').map((block) => block.id)).toEqual(['D2']);
    expect(dataBlockDescendants(state, 'P')).toEqual([]);
  });

  it('survives a derivation cycle', () => {
    const a = { ...R2, id: 'A', lineage: derivedFrom('B') };
    const b = { ...R2, id: 'B', lineage: derivedFrom('A') };
    expect(dataBlockDescendants(project({ dataBlocks: [a, b] }), 'A').map((x) => x.id)).toEqual([
      'B',
    ]);
  });
});

describe('make single user (S2)', () => {
  it('copies R as "Clave (variation)" derived from R and repoints only the strip', () => {
    const state = project();
    const result = makeSingleUser(state, 'R', userOf(state, 'R', 'strip'), {
      id: 'R-copy',
      createdAt: '2026-11-23T01:00:00Z',
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.copy.name).toBe('Clave (variation)');
    expect(result.copy.lineage?.derivedFrom?.dataBlockId).toBe('R');
    // Directly after the original on the desk.
    expect(result.project.dataBlocks.map((block) => block.id)).toEqual([
      'R',
      'R-copy',
      'R2',
      'P',
      'M',
    ]);
    expect(dataBlockUserCount(result.project, 'R')).toBe(2);
    expect(dataBlockUsers(result.project, 'R').map((entry) => entry.ownerKind)).toEqual([
      'node',
      'collection',
    ]);
    expect(dataBlockUsers(result.project, 'R-copy').map((entry) => entry.ownerKind)).toEqual([
      'strip',
    ]);
    // The input was not changed.
    expect(dataBlockUserCount(state, 'R')).toBe(3);
  });

  it('repoints a Make source node and leaves its position alone', () => {
    const state = project();
    const result = makeSingleUser(state, 'R', userOf(state, 'R', 'node'), {
      id: 'R-copy',
      createdAt: '2026-11-23T01:00:00Z',
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.project.instances).toEqual([{ ...N1, dataBlockId: 'R-copy' }]);
  });

  it('refuses a user that does not use the data-block', () => {
    const state = project();
    const result = makeSingleUser(state, 'P', userOf(state, 'R', 'strip'), {
      id: 'P-copy',
      createdAt: '2026-11-23T01:00:00Z',
    });
    expect(result.ok).toBe(false);
  });
});

describe('unlink (S4)', () => {
  it('removes the collection entry only: R keeps two users and stays on the desk', () => {
    const state = project();
    const result = unlinkUser(state, userOf(state, 'R', 'collection'));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(dataBlockUserCount(result.project, 'R')).toBe(2);
    expect(result.project.dataBlocks).toBe(state.dataBlocks);
    expect(extraOf(result.project).collection.roles).toEqual([{ role: 'rhythm', id: null }]);
  });

  it('blanks a Make source node without deleting it or the data-block', () => {
    const state = project();
    const result = unlinkUser(state, userOf(state, 'R', 'node'));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.project.instances).toEqual([
      { id: 'data-block-source-1', nodeId: 'data-block-source', x: 0, y: 0 },
    ]);
    expect('dataBlockId' in result.project.instances[0]).toBe(false);
  });

  it('refuses a user that has already gone', () => {
    const state = project();
    const entry = userOf(state, 'R', 'node');
    const once = unlinkUser(state, entry);
    if (!once.ok) {
      throw new Error(once.error);
    }
    expect(unlinkUser(once.project, entry).ok).toBe(false);
  });
});

describe('remap (S5)', () => {
  it('previews "Replace Clave in 3 places?" before changing anything', () => {
    const preview = remapPreview(project(), 'R', 'R2');
    expect(preview.count).toBe(3);
    expect(preview.refusal).toBeNull();
  });

  it('points all three users at R2; R keeps zero users and stays on the desk', () => {
    const state = project();
    const result = remapUsers(state, 'R', 'R2');
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(dataBlockUserCount(result.project, 'R')).toBe(0);
    expect(dataBlockUserCount(result.project, 'R2')).toBe(3);
    expect(result.project.dataBlocks.some((block) => block.id === 'R')).toBe(true);
    expect(dataBlockUserCount(state, 'R')).toBe(3);
  });

  it('refuses the same data-block, an unknown one, and an empty one a Make source cannot show', () => {
    expect(remapUsers(project(), 'R', 'R').ok).toBe(false);
    expect(remapUsers(project(), 'R', 'gone').ok).toBe(false);
    const empty = rhythmBlock('E', 'Empty', []);
    const state = project({ dataBlocks: [R, R2, empty] });
    const preview = remapPreview(state, 'R', 'E');
    expect(preview.refusal).toContain('Data-block (node)');
    expect(remapUsers(state, 'R', 'E').ok).toBe(false);
    // With no Make source among the users, the empty target is fine.
    expect(remapUsers({ ...state, instances: [] }, 'R', 'E').ok).toBe(true);
  });
});

describe('unused and purge (S6)', () => {
  it('lists R only while it has no users; nothing is dropped by itself', () => {
    const used = project();
    expect(unusedDataBlocks(used).map((block) => block.id)).toEqual(['R2', 'P', 'M']);
    const remapped = remapUsers(used, 'R', 'R2');
    if (!remapped.ok) {
      throw new Error(remapped.error);
    }
    expect(unusedDataBlocks(remapped.project).map((block) => block.id)).toEqual(['R', 'P', 'M']);
    expect(remapped.project.dataBlocks).toHaveLength(4);
  });

  it('purge deletes exactly the plan and leaves used data-blocks', () => {
    const state = project({ dataBlocks: [R, P, M] });
    expect(purgePlan(state)).toEqual(['P', 'M']);
    expect(purge(state, purgePlan(state)).dataBlocks.map((block) => block.id)).toEqual(['R']);
  });

  it('keeps a used descendant when its unused ancestor is purged (no lineage cascade)', () => {
    // D derives from P and a node uses D; P is unused.
    const derived = { ...R2, id: 'D', lineage: derivedFrom('P') };
    const node = { ...N1, dataBlockId: 'D' };
    const state = project({
      dataBlocks: [P, derived],
      instances: [node],
      extra: {
        collection: { id: 'C1', roles: [] },
        strip: { id: 'S1', dataBlockId: null },
      },
    });
    expect(purgePlan(state)).toEqual(['P']);
    expect(purge(state, purgePlan(state)).dataBlocks.map((block) => block.id)).toEqual(['D']);
  });

  it('skips a planned data-block that gained a user after the plan, and unplanned ones', () => {
    const state = project({ dataBlocks: [R, R2, P, M] });
    const plan = purgePlan(state);
    expect(plan).toEqual(['R2', 'P', 'M']);
    const remapped = remapUsers(state, 'R', 'R2');
    if (!remapped.ok) {
      throw new Error(remapped.error);
    }
    // R2 now has users: skipped. R is unused now but was not in the confirmed list: kept.
    expect(purge(remapped.project, plan).dataBlocks.map((block) => block.id)).toEqual(['R', 'R2']);
  });

  it('purges nothing when everything is used', () => {
    const state = project({ dataBlocks: [R] });
    expect(purgePlan(state)).toEqual([]);
    expect(purge(state, purgePlan(state)).dataBlocks).toEqual([R]);
  });
});

describe('roles and pinned versions', () => {
  it('tells two roles of one owner apart: makeSingleUser on "accent" leaves "rhythm" on R', () => {
    const state = project();
    const two = {
      ...state,
      extra: {
        ...state.extra,
        collection: {
          id: 'C1',
          roles: [
            { role: 'rhythm', id: 'R' },
            { role: 'accent', id: 'R' },
          ],
        },
      },
    };
    const users = dataBlockUsers(two, 'R');
    expect(users).toHaveLength(4);
    expect(users.map((entry) => entry.ownerKind).sort()).toEqual([
      'collection',
      'collection',
      'node',
      'strip',
    ]);
    const accent = users.find((entry) => entry.role === 'accent');
    if (!accent) {
      throw new Error('no accent user');
    }
    const result = makeSingleUser(two, 'R', accent, { id: 'R-copy', createdAt: 'now' });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(extraOf(result.project).collection.roles).toEqual([
      { role: 'rhythm', id: 'R' },
      { role: 'accent', id: 'R-copy' },
    ]);
    expect(dataBlockUserCount(result.project, 'R')).toBe(3);
  });

  describe('a pinned reference', () => {
    const pinnedReferencer: Referencer = {
      name: 'pinned',
      refs: (state) => {
        const pin = (state.extra as { pin: { id: string; version?: string } }).pin;
        return [{ ownerKind: 'pinned', ownerId: 'X', label: 'X (pin)', ref: pin }];
      },
      // Drops `version`, as the Referencer contract says.
      repoint: (state, _entry, toId) => ({
        ...state,
        extra: { ...state.extra, pin: toId === null ? { id: '' } : { id: toId } },
      }),
    };
    let remove = () => {};
    beforeEach(() => {
      remove = registerReferencer(pinnedReferencer);
    });
    afterEach(() => remove());

    function pinnedProject(): RefsProject {
      const state = project({ instances: [] });
      return {
        ...state,
        extra: {
          collection: { id: 'C1', roles: [] },
          strip: { id: 'S1', dataBlockId: null },
          pin: { id: 'R', version: 'v7' },
        },
      };
    }

    it('makeSingleUser points the pin at the copy with no version', () => {
      const state = pinnedProject();
      const result = makeSingleUser(state, 'R', userOf(state, 'R', 'pinned'), {
        id: 'R-copy',
        createdAt: 'now',
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect((result.project.extra as { pin: unknown }).pin).toEqual({ id: 'R-copy' });
    });

    it('remapUsers points the pin at R2 with no version', () => {
      const result = remapUsers(pinnedProject(), 'R', 'R2');
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect((result.project.extra as { pin: unknown }).pin).toEqual({ id: 'R2' });
    });
  });
});

describe('blank Make source', () => {
  it('does not count an empty dataBlockId as a user, even of ""', () => {
    const blank = { ...N1, id: 'data-block-source-2', dataBlockId: '' };
    const state = project({ instances: [blank] });
    expect(dataBlockUserCount(state, '')).toBe(0);
    expect(dataBlockUserCount(state, 'R')).toBe(2);
  });
});
