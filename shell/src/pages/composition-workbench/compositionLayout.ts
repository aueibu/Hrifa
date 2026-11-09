import type { CompositionModuleInstance } from './compositionWorkspace';

/** Canvas geometry shared by the canvas, Tidy and free-spot placement. */
export const NODE_WIDTH = 148;
/** A typical card's height (title, subtitle, footer and port rails); real cards size to content. */
export const NODE_HEIGHT = 104;
const GAP_X = 52;
const GAP_Y = 76;

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface Position {
  x: number;
  y: number;
}

/**
 * Longest-path layering over the connection graph. A module sits one layer below the deepest module
 * feeding it, so signal always reads top-to-bottom. A back edge (a cycle) is ignored for layering
 * rather than looping forever.
 */
function assignLayers(ids: string[], edges: LayoutEdge[]) {
  const known = new Set(ids);
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  edges.forEach(({ from, to }) => {
    if (from !== to && known.has(from) && known.has(to)) {
      incoming.get(to)!.push(from);
    }
  });

  const layers = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf = (id: string): number => {
    const cached = layers.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(id)) {
      return 0;
    }
    visiting.add(id);
    const layer = incoming
      .get(id)!
      .reduce((deepest, from) => Math.max(deepest, layerOf(from) + 1), 0);
    visiting.delete(id);
    layers.set(id, layer);
    return layer;
  };
  ids.forEach(layerOf);
  return { layers, incoming };
}

/**
 * Arranges modules in layers by dependency depth, top to bottom, ordering each layer by the average
 * horizontal position of its sources to keep cables from crossing, and centring every layer on the
 * same axis. Pure: returns new positions without touching the connections themselves.
 */
export function tidyLayout(
  instances: CompositionModuleInstance[],
  edges: LayoutEdge[]
): Record<string, Position> {
  const ids = instances.map((instance) => instance.id);
  const { layers, incoming } = assignLayers(ids, edges);
  const layerCount = ids.length ? Math.max(...layers.values()) + 1 : 0;
  const rows: string[][] = Array.from({ length: layerCount }, () => []);
  ids.forEach((id) => rows[layers.get(id)!].push(id));

  // Barycentre sweep: place each module under the average column of what feeds it. Two passes
  // settle small patches; ties keep the authored order so the result is stable.
  const column = new Map<string, number>();
  rows.forEach((row) => row.forEach((id, index) => column.set(id, index)));
  for (let pass = 0; pass < 2; pass += 1) {
    rows.forEach((row, rowIndex) => {
      if (rowIndex === 0) {
        return;
      }
      const score = (id: string) => {
        const sources = incoming.get(id)!;
        return sources.length
          ? sources.reduce((sum, from) => sum + column.get(from)!, 0) / sources.length
          : column.get(id)!;
      };
      row.sort((a, b) => score(a) - score(b) || column.get(a)! - column.get(b)!);
      row.forEach((id, index) => column.set(id, index));
    });
  }

  const pitchX = NODE_WIDTH + GAP_X;
  const pitchY = NODE_HEIGHT + GAP_Y;
  const widest = Math.max(0, ...rows.map((row) => row.length));
  const positions: Record<string, Position> = {};
  rows.forEach((row, rowIndex) => {
    const offset = ((widest - row.length) * pitchX) / 2;
    row.forEach((id, index) => {
      positions[id] = { x: offset + index * pitchX, y: rowIndex * pitchY };
    });
  });
  return positions;
}

function overlaps(a: Position, b: Position) {
  return (
    Math.abs(a.x - b.x) < NODE_WIDTH + GAP_X / 2 && Math.abs(a.y - b.y) < NODE_HEIGHT + GAP_Y / 2
  );
}

/**
 * The first open slot on a loose grid, scanning left to right then downward, so a newly added
 * module never lands on top of an existing one.
 */
export function nextFreePosition(instances: CompositionModuleInstance[], columns = 4): Position {
  for (let row = 0; ; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const candidate = { x: column * (NODE_WIDTH + GAP_X), y: row * (NODE_HEIGHT + GAP_Y) };
      if (!instances.some((instance) => overlaps(candidate, instance))) {
        return candidate;
      }
    }
  }
}
