import type { StoredDataBlock } from '../../dataBlocks/registry';
import type { DataPacket } from '../../model';
import type { MusicalDuration } from '../../musicalTime';

/**
 * The modifier registry (workbench O3; W-72): one definition per kind of modifier, registered with
 * one call, like the data-block registry. A modifier is a pure function from the packet so far (a
 * Rhythm or Notes packet, ONE cycle) and its parameters and referenced blocks to a Notes packet.
 * No React here. Pitches are midicents (fractional allowed); nothing assumes 12 steps: a modifier
 * that needs an octave takes a `period` in cents (default 1200).
 */

/** What the packet so far must be: the object's data is classified as one of these. */
export type ModifierInputKind = 'rhythm' | 'notes';

/** One reference a modifier holds, under a stable slot key. */
export interface ModifierRefSlot {
  slot: string;
  label: string;
  /** Data-block type ids the slot accepts. */
  accepts: readonly string[];
}

export interface ModifierRunContext {
  /** The transport's pulse duration (what a rhythm's durations are counted in). */
  pulseUnit: MusicalDuration;
  /** Stable id for the ids a modifier mints (its instance id). */
  instanceId: string;
}

export type ModifierRunResult = { ok: true; packet: DataPacket } | { ok: false; problem: string };

export interface ModifierDef {
  id: string;
  /** The wording in the Add Modifier menu and in problem messages. */
  label: string;
  input: ModifierInputKind;
  output: 'notes';
  refSlots: readonly ModifierRefSlot[];
  defaults(): Record<string, unknown>;
  /** Null when the parameters are usable, otherwise why not. */
  validateParams(params: Record<string, unknown>): string | null;
  /** `refs` holds one resolved, type-checked block per slot. */
  run(
    input: DataPacket,
    params: Record<string, unknown>,
    refs: Record<string, StoredDataBlock>,
    context: ModifierRunContext
  ): ModifierRunResult;
}

const defs = new Map<string, ModifierDef>();

/** Registers a modifier. A duplicate id throws. Returns a function that removes it again. */
export function registerModifier(def: ModifierDef): () => void {
  if (defs.has(def.id)) {
    throw new Error(`Modifier "${def.id}" is already registered.`);
  }
  defs.set(def.id, def);
  return () => {
    if (defs.get(def.id) === def) {
      defs.delete(def.id);
    }
  };
}

/** Every registered modifier, in registration order. */
export function modifierDefs(): readonly ModifierDef[] {
  return [...defs.values()];
}

export function getModifierDef(id: string): ModifierDef | undefined {
  return defs.get(id);
}
