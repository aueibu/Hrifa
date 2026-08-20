import type { DataPacket } from "./model";

export interface CompositionOutputRef {
  instanceId: string;
  port: string;
}

export interface PublishedCompositionOutput {
  ref: CompositionOutputRef;
  label: string;
  packet: DataPacket;
}

export interface CompositionModuleRoutingProps {
  onOutputsChange?(instanceId: string, outputs: PublishedCompositionOutput[]): void;
}

export function outputRefKey(ref: CompositionOutputRef) {
  return `${ref.instanceId}|${ref.port}`;
}

export function parseOutputRef(value: string): CompositionOutputRef {
  const [instanceId, port] = value.split("|");
  if (!instanceId || !port) {
    throw new Error("Invalid composition output reference.");
  }
  return { instanceId, port };
}
