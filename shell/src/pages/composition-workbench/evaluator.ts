import type { Connection, DataPacket, PatchDocument, PatchEvaluation } from "./model";
import { acceptsPacket, getDefinition } from "./registry";

export function topologicalOrder(patch: PatchDocument): { order: string[]; cycle: boolean } {
  const ids = new Set(patch.instances.map((instance) => instance.id));
  const indegree = new Map([...ids].map((id) => [id, 0]));
  const outgoing = new Map([...ids].map((id) => [id, [] as string[]]));
  patch.connections.forEach((connection) => {
    if (!ids.has(connection.fromInstanceId) || !ids.has(connection.toInstanceId)) return;
    indegree.set(connection.toInstanceId, (indegree.get(connection.toInstanceId) ?? 0) + 1);
    outgoing.get(connection.fromInstanceId)?.push(connection.toInstanceId);
  });
  const byOrder = new Map(patch.instances.map((instance) => [instance.id, instance.order]));
  const queue = [...ids]
    .filter((id) => indegree.get(id) === 0)
    .sort((a, b) => (byOrder.get(a) ?? 0) - (byOrder.get(b) ?? 0));
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const target of outgoing.get(id) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  return { order, cycle: order.length !== ids.size };
}

export function evaluatePatch(patch: PatchDocument): PatchEvaluation {
  const topology = topologicalOrder(patch);
  const modules: PatchEvaluation["modules"] = new Map();
  const errors: string[] = [];
  if (topology.cycle) errors.push("Cycle detected. The patch was not evaluated.");
  if (topology.cycle) return { modules, order: topology.order, errors };

  const instances = new Map(patch.instances.map((instance) => [instance.id, instance]));
  topology.order.forEach((instanceId) => {
    const instance = instances.get(instanceId)!;
    const definition = getDefinition(instance.definitionId, instance.definitionVersion);
    if (!definition) {
      errors.push(`Missing definition ${instance.definitionId}@${instance.definitionVersion}.`);
      return;
    }
    const inputs: Record<string, DataPacket> = {};
    patch.connections
      .filter((connection) => connection.toInstanceId === instanceId)
      .forEach((connection) => {
        const packet = sourcePacket(connection, modules);
        const contract = definition.inputs[connection.toPort];
        if (!packet || !contract) return;
        if (!acceptsPacket(contract, packet)) {
          errors.push(`Rejected incompatible connection ${connection.id}.`);
          return;
        }
        inputs[connection.toPort] = packet;
      });
    const evaluation = definition.evaluate({ instance, inputs });
    modules.set(instanceId, { instance, definition, inputs, evaluation });
  });
  return { modules, order: topology.order, errors };
}

function sourcePacket(connection: Connection, modules: PatchEvaluation["modules"]) {
  return modules.get(connection.fromInstanceId)?.evaluation.outputs[connection.fromPort];
}
