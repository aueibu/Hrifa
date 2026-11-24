import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { CompositionNodeInstance } from './compositionWorkspace';
import {
  deleteBlockFromProject,
  makeSingleUser,
  nodeReferencer,
  purge,
  remapPreview,
  remapUsers,
  unlinkUser,
  type RefsProject,
  type RefsResult,
  type RemapPreview,
  type UserEntry,
} from './dataBlocks/dataBlockRefs';
import { newDataBlockId, useDesk } from './desk';
import { recordGroup } from './history';

/**
 * The ONE place a `RefsProject` result reaches the app (B2, W-65). The pure operations in
 * dataBlockRefs.ts take a project and return the next one; this applies it: the DESK first, and only
 * if the desk took it (loaded and unlocked) the canvas instances, both inside one `recordGroup` so
 * one operation is one undo step. The project is rebuilt from the LATEST desk list and the latest
 * instances at the moment of the call, never from what was last rendered.
 */
export type OpResult = { ok: true } | { ok: false; error: string };

export interface DataBlockOps {
  /** The project as last rendered (desk list and canvas instances), for counts and previews. */
  project: RefsProject;
  deleteBlock(id: string): OpResult;
  makeSingleUser(id: string, user: UserEntry): OpResult;
  unlink(user: UserEntry): OpResult;
  /** Points every user of `fromId` (present or deleted) at `toId`. */
  remap(fromId: string, toId: string): OpResult;
  remapPreview(fromId: string, toId: string): RemapPreview;
  /** Deletes exactly the planned ids that are still unused. */
  purge(plannedIds: readonly string[]): OpResult;
  /** Swaps (or with `null` clears) the data-block one Make source node reads, in place. */
  setSourceBlock(instanceId: string, dataBlockId: string | null): OpResult;
}

const DataBlockOpsContext = createContext<DataBlockOps | undefined>(undefined);

function sameList<T>(a: readonly T[], b: readonly T[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function DataBlockOpsProvider({
  instances,
  setInstances,
  children,
}: {
  /** The canvas instances as rendered. */
  instances: CompositionNodeInstance[];
  setInstances: Dispatch<SetStateAction<CompositionNodeInstance[]>>;
  children: ReactNode;
}) {
  // Every block the desk holds, records included: a record counts as a user of what it references.
  const { allDataBlocks: dataBlocks, latestDataBlockList, applyDataBlockList } = useDesk();
  // The latest instances (a render can lag a write made earlier in the same event).
  const instancesRef = useRef(instances);
  instancesRef.current = instances;
  const project = useMemo<RefsProject>(() => ({ dataBlocks, instances }), [dataBlocks, instances]);

  const latestProject = useCallback(
    (): RefsProject => ({ dataBlocks: latestDataBlockList(), instances: instancesRef.current }),
    [latestDataBlockList]
  );

  const apply = useCallback(
    (before: RefsProject, result: RefsResult): OpResult => {
      if (!result.ok) {
        return result;
      }
      const next = result.project;
      const desk = next.dataBlocks;
      let failure: OpResult = { ok: true };
      recordGroup(() => {
        if (!sameList(desk, before.dataBlocks) && !applyDataBlockList(desk)) {
          failure = { ok: false, error: 'The desk is not accepting changes right now.' };
          return;
        }
        if (!sameList(next.instances, before.instances)) {
          instancesRef.current = next.instances;
          setInstances(next.instances);
        }
      });
      return failure;
    },
    [applyDataBlockList, setInstances]
  );

  const ops = useMemo<DataBlockOps>(
    () => ({
      project,
      deleteBlock(id) {
        const before = latestProject();
        return apply(before, {
          ok: true,
          project: deleteBlockFromProject(before, id),
        });
      },
      makeSingleUser(id, user) {
        const before = latestProject();
        return apply(
          before,
          makeSingleUser(before, id, user, {
            id: newDataBlockId(),
            createdAt: new Date().toISOString(),
          })
        );
      },
      unlink(user) {
        const before = latestProject();
        return apply(before, unlinkUser(before, user));
      },
      remap(fromId, toId) {
        const before = latestProject();
        return apply(before, remapUsers(before, fromId, toId));
      },
      remapPreview(fromId, toId) {
        return remapPreview(latestProject(), fromId, toId);
      },
      purge(plannedIds) {
        const before = latestProject();
        return apply(before, { ok: true, project: purge(before, plannedIds) });
      },
      setSourceBlock(instanceId, dataBlockId) {
        const before = latestProject();
        const known = before.instances.some(
          (instance) => instance.id === instanceId && instance.nodeId === 'data-block-source'
        );
        if (!known) {
          return { ok: false, error: 'That node is no longer on the canvas.' };
        }
        // A Make source with no data-block has no reference to find, so repoint it by owner id.
        const entry: UserEntry = {
          ownerKind: 'node',
          ownerId: instanceId,
          label: '',
          ref: { id: '' },
        };
        return apply(before, {
          ok: true,
          project: nodeReferencer.repoint(before, entry, dataBlockId),
        });
      },
    }),
    [apply, latestProject, project]
  );
  return <DataBlockOpsContext.Provider value={ops}>{children}</DataBlockOpsContext.Provider>;
}

/** The ops, or null outside a provider (a desk shown on its own). */
export function useOptionalDataBlockOps() {
  return useContext(DataBlockOpsContext);
}

export function useDataBlockOps(): DataBlockOps {
  const value = useContext(DataBlockOpsContext);
  if (!value) {
    throw new Error('useDataBlockOps must be used within a DataBlockOpsProvider.');
  }
  return value;
}

const noInstances: CompositionNodeInstance[] = [];
const ignoreInstances: Dispatch<SetStateAction<CompositionNodeInstance[]>> = () => undefined;

/** Gives a view that renders outside the page (tests, a lone desk) a desk-only provider. */
export function EnsureDataBlockOps({ children }: { children: ReactNode }) {
  const existing = useContext(DataBlockOpsContext);
  return existing ? (
    <>{children}</>
  ) : (
    <DataBlockOpsProvider instances={noInstances} setInstances={ignoreInstances}>
      {children}
    </DataBlockOpsProvider>
  );
}
