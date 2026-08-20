import type { DataItem, DataPacket, ParameterFrame } from "./model";

export type AlignmentMode = "zip" | "cycle" | "cartesian";
export const maximumCartesianFrames = 256;

export interface AlignmentResult {
  frames: ParameterFrame[];
  warnings: string[];
  error?: string;
}

type NamedInput = { name: "length" | "impulses" | "offset"; packet: DataPacket<number> };

function isScalar(input: NamedInput) {
  return input.packet.kind === "value" && input.packet.items.length === 1;
}

function frameFrom(items: DataItem<number>[]): ParameterFrame {
  return {
    length: items[0].value,
    impulses: items[1].value,
    offset: items[2].value,
    sourceItemIds: items.map((item) => item.id),
  };
}

export function alignParameterPackets(
  length: DataPacket<number>,
  impulses: DataPacket<number>,
  offset: DataPacket<number>,
  mode: AlignmentMode,
  limit = maximumCartesianFrames,
): AlignmentResult {
  const inputs: NamedInput[] = [
    { name: "length", packet: length },
    { name: "impulses", packet: impulses },
    { name: "offset", packet: offset },
  ];
  if (inputs.some((input) => input.packet.items.length === 0)) {
    return { frames: [], warnings: [], error: "Every parameter input needs at least one item." };
  }

  const streams = inputs.filter((input) => !isScalar(input));
  if (mode === "cartesian") {
    const count = inputs.reduce(
      (product, input) => product * (isScalar(input) ? 1 : input.packet.items.length),
      1,
    );
    if (count > limit) {
      return {
        frames: [],
        warnings: [],
        error: `Cartesian expansion refused: ${count} frames exceeds the ${limit}-frame limit.`,
      };
    }
    const choices = inputs.map((input) => input.packet.items);
    const frames: ParameterFrame[] = [];
    for (const lengthItem of choices[0]) {
      for (const impulseItem of choices[1]) {
        for (const offsetItem of choices[2]) {
          frames.push(frameFrom([lengthItem, impulseItem, offsetItem]));
        }
      }
    }
    return { frames, warnings: [] };
  }

  const counts = streams.map((input) => input.packet.items.length);
  const frameCount = counts.length
    ? mode === "zip"
      ? Math.min(...counts)
      : Math.max(...counts)
    : 1;
  const warnings: string[] = [];
  if (mode === "zip") {
    for (const input of streams) {
      const unused = input.packet.items.length - frameCount;
      if (unused > 0)
        warnings.push(
          `${input.name}: ${unused} trailing item${unused === 1 ? "" : "s"} unused by Zip.`,
        );
    }
  }
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const items = inputs.map((input) => {
      if (isScalar(input)) return input.packet.items[0];
      const itemIndex = mode === "cycle" ? index % input.packet.items.length : index;
      return input.packet.items[itemIndex];
    });
    return frameFrom(items);
  });
  return { frames, warnings };
}

export function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}
