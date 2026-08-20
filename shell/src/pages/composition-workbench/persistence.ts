import type { PatchDocument } from "./model";
import { getDefinition } from "./registry";

export const compositionWorkbenchStorageKey = "hrifa.composition-workbench.patch.v1";

export function exportPatch(patch: PatchDocument) {
  return JSON.stringify(patch, null, 2);
}

export function importPatch(json: string): PatchDocument {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object") {
    throw new Error("Patch JSON must contain an object.");
  }
  const candidate = value as Partial<PatchDocument>;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`Unsupported patch schema version: ${String(candidate.schemaVersion)}.`);
  }
  if (
    typeof candidate.title !== "string" ||
    !Array.isArray(candidate.instances) ||
    !Array.isArray(candidate.connections)
  ) {
    throw new Error("Patch JSON is missing its title, instances, or connections.");
  }
  const ids = new Set<string>();
  candidate.instances.forEach((instance) => {
    if (!instance || typeof instance.id !== "string" || ids.has(instance.id)) {
      throw new Error("Every module instance needs a unique string ID.");
    }
    ids.add(instance.id);
    if (!getDefinition(instance.definitionId, instance.definitionVersion)) {
      throw new Error(
        `Unknown module definition ${instance.definitionId}@${instance.definitionVersion}.`,
      );
    }
  });
  candidate.connections.forEach((connection) => {
    if (!connection || !ids.has(connection.fromInstanceId) || !ids.has(connection.toInstanceId)) {
      throw new Error("A connection refers to a missing module instance.");
    }
  });
  return candidate as PatchDocument;
}

export function loadSavedPatch(fallback: () => PatchDocument) {
  try {
    const saved = localStorage.getItem(compositionWorkbenchStorageKey);
    return saved ? importPatch(saved) : fallback();
  } catch {
    return fallback();
  }
}

export function savePatch(patch: PatchDocument) {
  try {
    localStorage.setItem(compositionWorkbenchStorageKey, exportPatch(patch));
    return true;
  } catch {
    return false;
  }
}
