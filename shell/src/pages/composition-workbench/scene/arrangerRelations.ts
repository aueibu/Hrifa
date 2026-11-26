import type { ArrangerLane } from './arrangerLanes';

/**
 * The Arranger's parent display (workbench L1b, W-77), pure geometry. A child object is placed relative to
 * its parent, so nothing is drawn along the child's lane. Instead the PARENT's block carries a small tick at
 * the world start of each child, and a selected parent or child shows a dashed connector from the parent's
 * start (in its lane) to the child's start (in its lane). Lengths are in the units the caller passes
 * (pixels for x, rem for y); nothing here is stored.
 */

/** One parent and child that both stand on a lane, with where each is. */
export interface RelationLink {
  parentId: string;
  childId: string;
  childName: string;
  parentLane: string;
  parentSubLane: number;
  childLane: string;
  childSubLane: number;
}

/** Every parent to child link between objects that are on lanes (a missing side is skipped). */
export function relationLinks(
  lanes: readonly ArrangerLane[],
  parentOf: ReadonlyMap<string, string>
): RelationLink[] {
  const where = new Map<string, { lane: string; subLane: number; name: string }>();
  for (const lane of lanes) {
    for (const object of lane.objects) {
      where.set(object.id, { lane: lane.id, subLane: object.subLane, name: object.name });
    }
  }
  const links: RelationLink[] = [];
  for (const [childId, parentId] of parentOf) {
    const child = where.get(childId);
    const parent = where.get(parentId);
    if (child && parent) {
      links.push({
        parentId,
        childId,
        childName: child.name,
        parentLane: parent.lane,
        parentSubLane: parent.subLane,
        childLane: child.lane,
        childSubLane: child.subLane,
      });
    }
  }
  return links;
}

/** The links that touch the selected object, as its parent or as its child. */
export function selectedLinks(
  links: readonly RelationLink[],
  selectedId: string | null
): RelationLink[] {
  return selectedId === null
    ? []
    : links.filter((link) => link.parentId === selectedId || link.childId === selectedId);
}

/** Every object id on either side of the given links (the blocks that get the tint). */
export function linkedIds(links: readonly RelationLink[]): Set<string> {
  return new Set(links.flatMap((link) => [link.parentId, link.childId]));
}

/**
 * A tick on a parent's block: where one child starts, relative to the parent block's left edge. A child
 * that starts outside the parent block (before it or beyond its width) has no tick there.
 */
export interface ChildTick {
  childId: string;
  childName: string;
  /** Pixels from the parent block's left edge. */
  x: number;
}

export function childTicks(
  links: readonly RelationLink[],
  parentId: string,
  startPx: (id: string) => number | undefined,
  parentWidthPx: number
): ChildTick[] {
  const parentLeft = startPx(parentId);
  if (parentLeft === undefined) {
    return [];
  }
  const ticks: ChildTick[] = [];
  for (const link of links) {
    const childLeft = link.parentId === parentId ? startPx(link.childId) : undefined;
    if (childLeft === undefined) {
      continue;
    }
    const x = childLeft - parentLeft;
    if (x >= 0 && x <= parentWidthPx) {
      ticks.push({ childId: link.childId, childName: link.childName, x });
    }
  }
  return ticks.sort((a, b) => a.x - b.x);
}

/** Where each lane starts and how tall one of its sub-lanes is, in rem (the lanes stack from the top). */
export interface LaneBox {
  top: number;
  subHeight: number;
}

/** A row that takes height above the lanes below it: a lane (sub-lanes) or a band (`fixedRem`, no box). */
export interface StackRow {
  id: string;
  subLanes: number;
  fixedRem?: number;
}

export function laneBoxes(
  lanes: readonly StackRow[],
  subHeightRem: (laneId: string) => number
): Map<string, LaneBox> {
  const out = new Map<string, LaneBox>();
  let top = 0;
  for (const lane of lanes) {
    if (lane.fixedRem !== undefined) {
      top += lane.fixedRem;
      continue;
    }
    const subHeight = subHeightRem(lane.id);
    out.set(lane.id, { top, subHeight });
    top += subHeight * lane.subLanes;
  }
  return out;
}

/** The vertical middle (rem from the lanes' top) of the block on a lane's sub-lane. */
export function subLaneCenter(box: LaneBox, subLane: number): number {
  return box.top + (subLane + 0.5) * box.subHeight;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** The bottom edge (rem from the lanes' top) of a sub-lane: where a parent's child tick sits. */
export function subLaneBottom(box: LaneBox, subLane: number): number {
  return box.top + (subLane + 1) * box.subHeight;
}

/** The top edge (rem from the lanes' top) of a sub-lane. */
export function subLaneTop(box: LaneBox, subLane: number): number {
  return box.top + subLane * box.subHeight;
}

/**
 * The dashed line of one link: from the child's tick on the parent block straight to the child's start.
 * `from` is the tick point, `to` the child block's start corner (the same x unless the child starts off
 * the parent), both in the same units.
 */
export function connectorPath(
  from: { x: number; y: number },
  to: { x: number; y: number }
): string {
  return `M${round(from.x)} ${round(from.y)}L${round(to.x)} ${round(to.y)}`;
}
