import { getDataBlockType, type StoredDataBlock } from '../../dataBlocks/registry';
import { NOTES_TYPE_ID } from '../../dataBlocks/types/notes';
import { RHYTHM_TYPE_ID } from '../../dataBlocks/types/rhythm';
import type { DataPacket } from '../../model';
import type { MusicalDuration } from '../../musicalTime';
import type { ModifierInstance } from '../sceneTypes';
import { getModifierDef, type ModifierDef, type ModifierInputKind } from './registry';

/**
 * Runs an object's modifier stack on the packet of its primary data, top to bottom, on ONE cycle
 * (W-72). Pure. A muted modifier is skipped. Every unmuted modifier is checked for what it can be
 * checked for alone (known type, valid params, each reference present and of an accepted type);
 * the data flow (does each modifier get the kind of data it needs) stops at the first break, since
 * what comes after is unknown. A stack with any problem has no packet: the object is silent.
 */

export interface StackProblem {
  modifierId: string;
  /** Plain words without the object's name, such as "Harmonize needs Notes; the data so far is a Rhythm". */
  text: string;
}

export type StackResult =
  | { ok: true; packet: DataPacket }
  | { ok: false; problems: StackProblem[] };

const KIND_LABEL: Record<ModifierInputKind, string> = { rhythm: 'Rhythm', notes: 'Notes' };

/** The kind of data a block is, as a modifier sees it, with the words to name it. */
function classify(block: StoredDataBlock): { kind: ModifierInputKind | null; label: string } {
  if (block.typeId === RHYTHM_TYPE_ID) {
    return { kind: 'rhythm', label: KIND_LABEL.rhythm };
  }
  if (block.typeId === NOTES_TYPE_ID) {
    return { kind: 'notes', label: KIND_LABEL.notes };
  }
  return { kind: null, label: getDataBlockType(block.typeId)?.label ?? block.typeId };
}

/** "a Rhythm", "a Pitch set", but plural labels stand alone ("Notes", "Pitch classes"). */
const withArticle = (label: string) => (/s$/.test(label) ? label : `a ${label}`);

const labelOfTypes = (ids: readonly string[]) =>
  ids.map((id) => getDataBlockType(id)?.label ?? id).join(' or ');

/**
 * The blocks a modifier references, resolved by slot, or the problem text of the first slot that
 * is blank, gone or the wrong type.
 */
export function resolveModifierRefs(
  def: ModifierDef,
  modifier: ModifierInstance,
  byId: ReadonlyMap<string, StoredDataBlock>
): { refs: Record<string, StoredDataBlock> } | { problem: string } {
  const refs: Record<string, StoredDataBlock> = {};
  for (const slot of def.refSlots) {
    const ref = modifier.refs[slot.slot] ?? null;
    const block = ref === null ? undefined : byId.get(ref.id);
    if (!block) {
      return { problem: `${def.label}: ${slot.label} is missing` };
    }
    if (!slot.accepts.includes(block.typeId)) {
      return {
        problem: `${def.label}: ${slot.label} must be a ${labelOfTypes(slot.accepts)} data-block; "${block.name}" is ${withArticle(classify(block).label)}`,
      };
    }
    refs[slot.slot] = block;
  }
  return { refs };
}

export function runModifierStack(
  primary: StoredDataBlock,
  modifiers: readonly ModifierInstance[],
  byId: ReadonlyMap<string, StoredDataBlock>,
  context: { pulseUnit: MusicalDuration }
): StackResult {
  const active = modifiers.filter((modifier) => !modifier.mute);
  const problems: StackProblem[] = [];
  const resolved = new Map<
    string,
    { def: ModifierDef; refs: Record<string, StoredDataBlock> } | null
  >();
  for (const modifier of active) {
    const def = getModifierDef(modifier.type);
    if (!def) {
      problems.push({
        modifierId: modifier.id,
        text: `Modifier "${modifier.type}" is not available`,
      });
      resolved.set(modifier.id, null);
      continue;
    }
    const paramsProblem = def.validateParams(modifier.params);
    if (paramsProblem !== null) {
      problems.push({ modifierId: modifier.id, text: `${def.label}: ${paramsProblem}` });
      resolved.set(modifier.id, null);
      continue;
    }
    const refs = resolveModifierRefs(def, modifier, byId);
    if ('problem' in refs) {
      problems.push({ modifierId: modifier.id, text: refs.problem });
      resolved.set(modifier.id, null);
      continue;
    }
    resolved.set(modifier.id, { def, refs: refs.refs });
  }

  // The data flow, until the first break (a modifier with a problem of its own has no known output).
  if (primary.payload.kind !== 'packet') {
    return {
      ok: false,
      problems: [{ modifierId: active[0]?.id ?? '', text: 'This data cannot be modified.' }],
    };
  }
  let current: DataPacket = primary.payload.packet;
  let currentKind = classify(primary);
  for (const modifier of active) {
    const entry = resolved.get(modifier.id);
    if (!entry) {
      break;
    }
    const { def, refs } = entry;
    if (currentKind.kind !== def.input) {
      problems.push({
        modifierId: modifier.id,
        text: `${def.label} needs ${KIND_LABEL[def.input]}; the data so far is ${withArticle(currentKind.label)}`,
      });
      break;
    }
    let outcome;
    try {
      outcome = def.run(current, modifier.params, refs, {
        pulseUnit: context.pulseUnit,
        instanceId: modifier.id,
      });
    } catch (error) {
      outcome = {
        ok: false as const,
        problem: error instanceof Error ? error.message : 'It could not run',
      };
    }
    if (!outcome.ok) {
      problems.push({ modifierId: modifier.id, text: `${def.label}: ${outcome.problem}` });
      break;
    }
    current = outcome.packet;
    currentKind = { kind: def.output, label: KIND_LABEL[def.output] };
  }
  // Top to bottom, so the first problem (what Apply All and the warning name) is the topmost modifier's.
  const order = new Map(active.map((modifier, index) => [modifier.id, index]));
  problems.sort(
    (left, right) => (order.get(left.modifierId) ?? -1) - (order.get(right.modifierId) ?? -1)
  );
  return problems.length > 0 ? { ok: false, problems } : { ok: true, packet: current };
}
