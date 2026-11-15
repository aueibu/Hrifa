/**
 * Dynamic registry helpers (design 1.4). A KIND is a panel definition; a kind with `multiple` has instances whose panel
 * ids are `<kind>:<instanceKey>`, where the key is persisted by the HOST in its own data. The host rebuilds the
 * `StageRegistry` when its instance list changes (`useStageRegistry`), and builds the set of ids that exist BEFORE it
 * parses the stored screensets (`knownPanelIds`), so a stored `module:<id>` tab is not dropped as unknown.
 *
 * What the Stage does with a rebuilt registry (DockStage): hosts are keyed by panel id, so a panel whose id survives keeps
 * its mount and its state; a panel that left the registry is not rendered, its host is removed and its measurements
 * forgotten. The stored screensets still name a removed instance until the host calls `reconcile(screenset, known)` on
 * every screenset of the project (ops.ts), which closes its tabs and drops its places.
 */
import { useMemo, type ReactNode } from 'react';
import type { SlotSize } from '../../../lib/stage';
import { createStageRegistry, type StageModule, type StageRegistry } from '../registry';

export interface PanelKind extends Omit<StageModule, 'render'> {
  /** `instanceKey` is given for an instance of a `multiple` kind. */
  render(size: SlotSize, instanceKey?: string): ReactNode;
}

export interface PanelInstance {
  kind: string;
  key: string;
  /** Tab title; default `<kind title> <key>`. */
  title?: string;
}

export const instanceId = (kind: string, key: string): string => `${kind}:${key}`;

/** `{ kind, key }` of an instance id, or null for a plain panel id. */
export function parseInstanceId(id: string): { kind: string; key: string } | null {
  const at = id.indexOf(':');
  return at <= 0 || at === id.length - 1 ? null : { kind: id.slice(0, at), key: id.slice(at + 1) };
}

/** Ids reserved for the host's internal panels (never listed in the Panels menu). */
export const isReservedPanelId = (id: string): boolean => id.startsWith('__');

const instancesOf = (kinds: readonly PanelKind[], instances: readonly PanelInstance[]) => {
  const byKind = new Map(kinds.map((k) => [k.id, k]));
  const seen = new Set<string>();
  return instances.flatMap((i) => {
    const kind = byKind.get(i.kind);
    const id = instanceId(i.kind, i.key);
    if (!kind?.multiple || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [{ kind, instance: i }];
  });
};

/** Every panel id that exists: each single kind, and `<kind>:<key>` for each instance of a `multiple` kind. */
export function knownPanelIds(
  kinds: readonly PanelKind[],
  instances: readonly PanelInstance[]
): Set<string> {
  return new Set([
    ...kinds.filter((k) => !k.multiple).map((k) => k.id),
    ...instancesOf(kinds, instances).map(({ kind, instance }) => instanceId(kind.id, instance.key)),
  ]);
}

/** The registry for a kind list and an instance list (a new value each call: build it in a memo). */
export function buildStageRegistry(
  kinds: readonly PanelKind[],
  instances: readonly PanelInstance[]
): StageRegistry {
  const modules: StageModule[] = kinds
    .filter((k) => !k.multiple)
    .map(({ render, ...k }) => ({ ...k, render: (size: SlotSize) => render(size) }));
  for (const { kind, instance } of instancesOf(kinds, instances)) {
    const { render, ...rest } = kind;
    modules.push({
      ...rest,
      id: instanceId(kind.id, instance.key),
      title: instance.title ?? `${kind.title} ${instance.key}`,
      render: (size: SlotSize) => render(size, instance.key),
    });
  }
  return createStageRegistry(modules);
}

/** `buildStageRegistry` memoised on its inputs: pass module-level `kinds` and a state `instances` array. */
export const useStageRegistry = (
  kinds: readonly PanelKind[],
  instances: readonly PanelInstance[]
): StageRegistry => useMemo(() => buildStageRegistry(kinds, instances), [kinds, instances]);
