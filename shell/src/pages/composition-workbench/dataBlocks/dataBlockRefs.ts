import { compositionInstanceLabel, type CompositionNodeInstance } from '../compositionWorkspace';
import {
  blockRefs,
  dataBlockTypeOf,
  duplicateBlock,
  isBlockEmpty,
  isPacketBlock,
  repointBlockRef,
  type Ref,
  type StoredDataBlock,
} from './registry';

export type { Ref };

/**
 * References and users (W-57). A data-block's users are never stored and never counted from a
 * hand-written list: every place that points at a data-block registers a *referencer* (a function
 * from the project to the references it holds), and `dataBlockUsers` walks the registry. A new kind
 * of referencer (a collection, a timeline strip, a modifier input) is one more `registerReferencer`
 * call and cannot forget to be counted.
 *
 * Everything here is pure: each operation takes the project state and returns the next one. The
 * caller applies the result through the recorders that already exist (the desk's `applyChange` for
 * `dataBlocks`, the instances' persistent state inside one `recordGroup` for `instances`), so one
 * operation is one undo step and nothing here touches storage or history.
 *
 * Not users: `origin` (information), `lineage.derivedFrom` (history), the editor target, the
 * inspector target and pins. Deleting a data-block breaks none of them.
 */

/**
 * The state that references live in. `dataBlocks` is the desk, `instances` the canvas nodes (the Make
 * source nodes hold `dataBlockId`). `extra` is where a later referencer keeps its own state (a
 * collection record, the timeline's strips); the registry hands the whole project to every referencer.
 */
export interface RefsProject {
  dataBlocks: StoredDataBlock[];
  instances: CompositionNodeInstance[];
  extra?: Record<string, unknown>;
}

/** One place that uses a data-block. */
export interface UserEntry {
  /** The registered referencer's name, such as `node`; also the kind shown after the label. */
  ownerKind: string;
  ownerId: string;
  /** As shown to the person: "Data-block 2 (node)", "bar 9 (strip)". */
  label: string;
  ref: Ref;
  /** The owner's stable key for this reference, when it holds several (a collection entry's slot). */
  slot?: string;
}

export interface Referencer {
  /** Registry key. Every entry `refs` returns must have `ownerKind === name`. */
  name: string;
  /** Every reference this kind of owner holds, over the whole project. */
  refs(project: RefsProject): UserEntry[];
  /**
   * Points the one reference `entry` (told apart by owner and slot) at `toId`, or clears
   * it (`null`: unlink). It drops any pinned `version`: a version id means nothing on a copy or on
   * another data-block. Returns the next project; an unknown owner returns it unchanged.
   */
  repoint(project: RefsProject, entry: UserEntry, toId: string | null): RefsProject;
  /** Why this owner cannot take `target` (Remap refuses), or null. Absent: it takes anything. */
  accepts?(target: StoredDataBlock, entry: UserEntry): string | null;
}

const referencers = new Map<string, Referencer>();

/** Registers a referencer. A duplicate name throws. Returns a function that removes it again. */
export function registerReferencer(referencer: Referencer): () => void {
  if (referencers.has(referencer.name)) {
    throw new Error(`Referencer "${referencer.name}" is already registered.`);
  }
  referencers.set(referencer.name, referencer);
  return () => {
    if (referencers.get(referencer.name) === referencer) {
      referencers.delete(referencer.name);
    }
  };
}

/** Make source nodes: one reference each, in `dataBlockId`. An absent or empty id is the blank state: no reference. */
export const nodeReferencer: Referencer = {
  name: 'node',
  refs: ({ instances }) =>
    instances.flatMap((instance) =>
      instance.nodeId === 'data-block-source' &&
      instance.dataBlockId !== undefined &&
      instance.dataBlockId !== ''
        ? [
            {
              ownerKind: 'node',
              ownerId: instance.id,
              label: `${compositionInstanceLabel(instance, instances)} (node)`,
              ref: { id: instance.dataBlockId },
            },
          ]
        : []
    ),
  repoint: (project, entry, toId) => ({
    ...project,
    instances: project.instances.map((instance) => {
      if (instance.id !== entry.ownerId || instance.nodeId !== 'data-block-source') {
        return instance;
      }
      const { dataBlockId: _previous, ...rest } = instance;
      return toId === null ? rest : { ...rest, dataBlockId: toId };
    }),
  }),
  accepts: (target) => makeSourceRefusal(target),
};

registerReferencer(nodeReferencer);

/** Why a data-block cannot be a Make source, or null: an empty one would publish nothing yet. */
export function makeSourceRefusal(block: StoredDataBlock): string | null {
  return isBlockEmpty(block)
    ? 'This data-block is empty, so a source made from it would publish nothing yet.'
    : null;
}

/**
 * Data-blocks that hold references: a record type's `refs(data)` feeds users with no hand-written
 * referencer, and `mapRefs` (through `repointBlockRef`) serves unlink, remap and make single user.
 */
export const blockReferencer: Referencer = {
  name: 'data-block',
  refs: ({ dataBlocks }) =>
    dataBlocks.flatMap((block) =>
      blockRefs(block).map(({ slot, ref }) => ({
        ownerKind: 'data-block',
        ownerId: block.id,
        label: `${block.name} (${dataBlockTypeOf(block)?.label ?? 'data-block'})`,
        ref: ref.version === undefined ? { id: ref.id } : { id: ref.id, version: ref.version },
        slot,
      }))
    ),
  repoint: (project, entry, toId) => ({
    ...project,
    dataBlocks: project.dataBlocks.map((block) =>
      block.id === entry.ownerId && entry.slot !== undefined
        ? repointBlockRef(block, { slot: entry.slot, ref: entry.ref }, toId)
        : block
    ),
  }),
};

registerReferencer(blockReferencer);

/** Everything that uses `id`, from every registered referencer, in registration then project order. */
export function dataBlockUsers(project: RefsProject, id: string): UserEntry[] {
  return [...referencers.values()].flatMap((referencer) =>
    referencer.refs(project).filter((entry) => entry.ref.id === id)
  );
}

export function dataBlockUserCount(project: RefsProject, id: string): number {
  return dataBlockUsers(project, id).length;
}

/**
 * The data-blocks derived from `id`, directly or through other derived data-blocks, by
 * `lineage.derivedFrom`. They are history, not users: a delete leaves them untouched, and the
 * confirm names them because their "derived from" will point at nothing.
 */
export function dataBlockDescendants(project: RefsProject, id: string): StoredDataBlock[] {
  const found = new Set<string>();
  const frontier = [id];
  while (frontier.length > 0) {
    const parent = frontier.pop();
    project.dataBlocks.forEach((dataBlock) => {
      if (
        dataBlock.lineage?.derivedFrom?.dataBlockId === parent &&
        dataBlock.id !== id &&
        !found.has(dataBlock.id)
      ) {
        found.add(dataBlock.id);
        frontier.push(dataBlock.id);
      }
    });
  }
  return project.dataBlocks.filter((dataBlock) => found.has(dataBlock.id));
}

export interface DeleteImpact {
  users: UserEntry[];
  descendants: StoredDataBlock[];
}

/**
 * What the delete confirm lists (S1, answer A): the delete removes the data-block and nothing else;
 * its users show "missing" and its descendants keep their pitches. No cascade.
 */
export function deleteImpact(project: RefsProject, id: string): DeleteImpact {
  return { users: dataBlockUsers(project, id), descendants: dataBlockDescendants(project, id) };
}

/** The owner's `onRefDeleted` hook applied to the slot `entry` names (before the slot is blanked). */
function applyRefDeleted(
  project: RefsProject,
  entry: UserEntry,
  deleted: StoredDataBlock,
  blocks: readonly StoredDataBlock[]
): RefsProject {
  return {
    ...project,
    dataBlocks: project.dataBlocks.map((block) => {
      const def = dataBlockTypeOf(block);
      if (
        block.id !== entry.ownerId ||
        entry.slot === undefined ||
        isPacketBlock(block) ||
        def?.payload !== 'record' ||
        !def.onRefDeleted
      ) {
        return block;
      }
      const data = def.onRefDeleted(block.payload.data, entry.slot, deleted, blocks);
      return { ...block, payload: { kind: 'record', data } };
    }),
  };
}

/**
 * Deletes a data-block (O0, W-66): the block goes, and every record slot that held it is blanked
 * through the type's `mapRefs` (the record stays, the slot is null: references blank on delete, never
 * fall back). Make source nodes are left alone and show "missing" as before (S1).
 */
export function deleteBlockFromProject(project: RefsProject, id: string): RefsProject {
  const deleted = project.dataBlocks.find((block) => block.id === id);
  const blanked = dataBlockUsers(project, id)
    .filter((entry) => entry.ownerKind === blockReferencer.name)
    .reduce((next, entry) => {
      const hooked = deleted ? applyRefDeleted(next, entry, deleted, project.dataBlocks) : next;
      return blockReferencer.repoint(hooked, entry, null);
    }, project);
  return { ...blanked, dataBlocks: blanked.dataBlocks.filter((block) => block.id !== id) };
}

export type RefsResult = { ok: true; project: RefsProject } | { ok: false; error: string };

export type MakeSingleUserResult =
  | { ok: true; project: RefsProject; copy: StoredDataBlock }
  | { ok: false; error: string };

function findUser(project: RefsProject, id: string, user: UserEntry): UserEntry | undefined {
  return dataBlockUsers(project, id).find(
    (entry) =>
      entry.ownerKind === user.ownerKind &&
      entry.ownerId === user.ownerId &&
      entry.slot === user.slot
  );
}

/**
 * S2: copies the data-block as "<name> (variation)" (`derivedFrom` the original, directly after it on
 * the desk) and points only `user` at the copy. Every other user keeps the original.
 */
export function makeSingleUser(
  project: RefsProject,
  id: string,
  user: UserEntry,
  request: { id: string; createdAt: string }
): MakeSingleUserResult {
  const index = project.dataBlocks.findIndex((dataBlock) => dataBlock.id === id);
  const entry = findUser(project, id, user);
  const referencer = referencers.get(user.ownerKind);
  if (index < 0 || !entry || !referencer) {
    return { ok: false, error: 'That is not a user of this data-block.' };
  }
  const copy = duplicateBlock(project.dataBlocks[index], request);
  const dataBlocks = [...project.dataBlocks];
  dataBlocks.splice(index + 1, 0, copy);
  return {
    ok: true,
    copy,
    project: referencer.repoint({ ...project, dataBlocks }, entry, copy.id),
  };
}

/**
 * S4: removes one user's reference; the data-block stays on the desk. A Make source node keeps its
 * place on the canvas with no `dataBlockId`, which it renders as blank ("No data-block chosen").
 */
export function unlinkUser(project: RefsProject, user: UserEntry): RefsResult {
  const referencer = referencers.get(user.ownerKind);
  const entry = referencer
    ? referencer
        .refs(project)
        .find(
          (candidate) =>
            candidate.ownerKind === user.ownerKind &&
            candidate.ownerId === user.ownerId &&
            candidate.slot === user.slot &&
            candidate.ref.id === user.ref.id
        )
    : undefined;
  if (!referencer || !entry) {
    return { ok: false, error: 'That user no longer references this data-block.' };
  }
  return { ok: true, project: referencer.repoint(project, entry, null) };
}

export interface RemapPreview {
  /** "Replace Clave in 3 places?": how many references change. */
  count: number;
  users: UserEntry[];
  /** Why the remap cannot run, or null. */
  refusal: string | null;
}

function remapRefusal(project: RefsProject, fromId: string, toId: string): string | null {
  const to = project.dataBlocks.find((dataBlock) => dataBlock.id === toId);
  if (fromId === toId) {
    return 'Choose a different data-block to replace it with.';
  }
  // `fromId` may be missing from the desk: its users are then repointed (S1 repair, B2).
  if (!to) {
    return 'The replacement is no longer on the desk.';
  }
  for (const entry of dataBlockUsers(project, fromId)) {
    const why = referencers.get(entry.ownerKind)?.accepts?.(to, entry);
    if (why) {
      return `${entry.label} cannot use "${to.name}": ${why}`;
    }
  }
  return null;
}

/** S5, first half: the count and any refusal, before anything changes. */
export function remapPreview(project: RefsProject, fromId: string, toId: string): RemapPreview {
  const users = dataBlockUsers(project, fromId);
  return { count: users.length, users, refusal: remapRefusal(project, fromId, toId) };
}

/**
 * S5: points every user of `fromId` at `toId` (`fromId` may be a deleted data-block: that repairs its
 * users). A present `fromId` is left on the desk with no users. Refused
 * when a user does not accept the replacement (today only a Make source refusing an empty data-block).
 */
export function remapUsers(project: RefsProject, fromId: string, toId: string): RefsResult {
  const refusal = remapRefusal(project, fromId, toId);
  if (refusal) {
    return { ok: false, error: refusal };
  }
  let next = project;
  for (const entry of dataBlockUsers(project, fromId)) {
    const referencer = referencers.get(entry.ownerKind);
    if (referencer) {
      next = referencer.repoint(next, entry, toId);
    }
  }
  return { ok: true, project: next };
}

/** S6: the data-blocks nothing uses. Nothing is ever dropped automatically. */
export function unusedDataBlocks(project: RefsProject): StoredDataBlock[] {
  const used = new Set(
    [...referencers.values()].flatMap((referencer) =>
      referencer.refs(project).map((entry) => entry.ref.id)
    )
  );
  return project.dataBlocks.filter((dataBlock) => !used.has(dataBlock.id));
}

/**
 * What the desk offers to purge and filters as Unused (O0): the unused blocks the desk DISPLAYS, which
 * are the packet blocks. A record block has no card until the Outliner (O2a), so an unused record is
 * never listed and a purge can never delete a block the user cannot see. Users are still counted
 * across every block, so a packet a record references is not unused.
 */
export function unusedDeskBlocks(project: RefsProject): StoredDataBlock[] {
  return unusedDataBlocks(project).filter(isPacketBlock);
}

/** The ids a manual Purge would delete (the list it shows first). */
export function purgePlan(project: RefsProject): string[] {
  return unusedDataBlocks(project).map((dataBlock) => dataBlock.id);
}

/**
 * Deletes the planned ids (the list the confirm showed) that are still unused now: one that gained a
 * user since the plan is skipped. Descendants are untouched (history, not use).
 */
export function purge(project: RefsProject, plannedIds: readonly string[]): RefsProject {
  const unused = new Set(purgePlan(project));
  const doomed = new Set(plannedIds.filter((id) => unused.has(id)));
  return { ...project, dataBlocks: project.dataBlocks.filter((block) => !doomed.has(block.id)) };
}

/**
 * References that point at a data-block no longer on the desk. They are users of nothing, show as
 * "missing", and never block saving or any operation here.
 */
export function missingRefs(project: RefsProject): UserEntry[] {
  const present = new Set(project.dataBlocks.map((block) => block.id));
  return [...referencers.values()].flatMap((referencer) =>
    referencer.refs(project).filter((entry) => !present.has(entry.ref.id))
  );
}
