import { dataBlockUsers, type RefsProject, type UserEntry } from '../dataBlocks/dataBlockRefs';
import { compareRational, rational, type Rational } from '../musicalTime';
import { arrangerLanes } from './arrangerLanes';
import { chainPlacement, objectChain, sceneDataOf } from './sceneTypes';

/**
 * The rows of the Properties "Used by" table (L5): one row per user of a data-block. An object counts
 * only through its primary data (the `data` slot, like `sharedData.ts`); a parent or modifier
 * reference is not a row. A non-object user (a desk node) is a Desk row. Pure, nothing stored.
 */
export interface SharedUserRow {
  id: string;
  name: string;
  kind: 'object' | 'desk';
  /** The collection that lists the object; "Desk" for a desk user. */
  collection: string;
  /** World start in quarter notes (zero for a desk user). */
  start: Rational;
  /** The object's own duration (zero for a desk user). */
  duration: Rational;
  /** The registry entry behind the row, set by `allUsersTable` (the Desk acts on it). */
  entry?: UserEntry;
}

/**
 * The Desk card's rows (L5b): EVERY user entry of a data-block is a row, so Make single user can act on
 * each one. An entry owned by an object found in any scene shows that object's collection, world start
 * and length; any other entry shows its own label as a Desk row. Objects first by start, then the rest
 * by name. Pure, nothing stored.
 */
export function allUsersTable(project: RefsProject, dataId: string): SharedUserRow[] {
  const blocks = project.dataBlocks;
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const collectionOf = new Map<string, string>();
  for (const scene of blocks.filter((block) => sceneDataOf(block))) {
    for (const lane of arrangerLanes(blocks, scene.id)) {
      for (const object of lane.objects) {
        collectionOf.set(object.id, lane.collectionName);
      }
    }
  }
  const objects: SharedUserRow[] = [];
  const others: SharedUserRow[] = [];
  for (const entry of dataBlockUsers(project, dataId)) {
    const collection = collectionOf.get(entry.ownerId);
    const chain = collection === undefined ? null : objectChain(byId, entry.ownerId);
    const block = byId.get(entry.ownerId);
    if (collection !== undefined && chain !== null && block !== undefined) {
      objects.push({
        id: entry.ownerId,
        name: block.name,
        kind: 'object',
        collection,
        start: chainPlacement(chain).start,
        duration: chain[0].data.timeSpan.duration,
        entry,
      });
    } else {
      others.push({
        id: entry.ownerId,
        name: entry.label,
        kind: 'desk',
        collection: 'Desk',
        start: rational(0),
        duration: rational(0),
        entry,
      });
    }
  }
  objects.sort((a, b) => compareRational(a.start, b.start) || a.name.localeCompare(b.name));
  others.sort((a, b) => a.name.localeCompare(b.name));
  return [...objects, ...others];
}

export function sharedUsersTable(
  project: RefsProject,
  dataId: string,
  sceneId: string
): SharedUserRow[] {
  const blocks = project.dataBlocks;
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const collectionOf = new Map<string, string>();
  for (const lane of arrangerLanes(blocks, sceneId)) {
    for (const object of lane.objects) {
      collectionOf.set(object.id, lane.collectionName);
    }
  }
  const objects: SharedUserRow[] = [];
  const others: SharedUserRow[] = [];
  const seen = new Set<string>();
  for (const user of dataBlockUsers(project, dataId)) {
    if (seen.has(`${user.ownerKind}:${user.ownerId}`)) {
      continue;
    }
    if (user.ownerKind === 'node') {
      seen.add(`${user.ownerKind}:${user.ownerId}`);
      others.push({
        id: user.ownerId,
        name: user.label,
        kind: 'desk',
        collection: 'Desk',
        start: rational(0),
        duration: rational(0),
      });
    } else if (user.ownerKind === 'data-block' && user.slot === 'data') {
      const collection = collectionOf.get(user.ownerId);
      const chain = objectChain(byId, user.ownerId);
      const block = byId.get(user.ownerId);
      if (collection === undefined || chain === null || block === undefined) {
        continue;
      }
      seen.add(`${user.ownerKind}:${user.ownerId}`);
      objects.push({
        id: user.ownerId,
        name: block.name,
        kind: 'object',
        collection,
        start: chainPlacement(chain).start,
        duration: chain[0].data.timeSpan.duration,
      });
    }
  }
  objects.sort((a, b) => compareRational(a.start, b.start) || a.name.localeCompare(b.name));
  others.sort((a, b) => a.name.localeCompare(b.name));
  return [...objects, ...others];
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function beatsText(numerator: number, denominator: number): string {
  const whole = Math.floor(numerator / denominator);
  const rest = numerator - whole * denominator;
  if (rest === 0) {
    return `${whole} ${whole === 1 ? 'beat' : 'beats'}`;
  }
  const divisor = gcd(rest, denominator);
  const fraction = `${rest / divisor}/${denominator / divisor}`;
  return whole === 0 ? `${fraction} beat` : `${whole} ${fraction} beats`;
}

/**
 * A length for the table: "2 bars", "1 bar 2 beats", "1/2 beat" (a part of a beat as a reduced
 * fraction). The beat is the meter's denominator note, so 4/4 has 4 beats a bar.
 */
export function lengthText(quarters: Rational, meter: string): string {
  const [top, bottom] = meter.split('/').map(Number);
  const perBar = Number.isFinite(top) && top > 0 ? top : 4;
  const unit = Number.isFinite(bottom) && bottom > 0 ? bottom : 4;
  // Beats as a fraction: quarters * unit / 4.
  const beatsNumerator = quarters.numerator * unit;
  const beatsDenominator = quarters.denominator * 4;
  const divisor = gcd(beatsNumerator, beatsDenominator) || 1;
  const n = beatsNumerator / divisor;
  const d = beatsDenominator / divisor;
  const bars = Math.floor(n / (d * perBar));
  const restN = n - bars * d * perBar;
  const parts: string[] = [];
  if (bars > 0 || restN === 0) {
    parts.push(`${bars} ${bars === 1 ? 'bar' : 'bars'}`);
  }
  if (restN > 0) {
    parts.push(beatsText(restN, d));
  }
  return parts.join(' ');
}
