import { dataBlockTypes, type DataBlockTypeDef, type StoredDataBlock } from './registry';

/**
 * Conversions are pair-level: registered once for a (from, to) pair of types, then an input lists
 * the ones it allows. Reinterpretation is never silent: nothing converts unless a conversion is
 * explicitly chosen and `applyConversion` is called.
 */
export interface Conversion {
  id: string;
  /** The type id of the data-block being offered. */
  from: string;
  /** The type id it becomes. */
  to: string;
  /** Wording of the choice, such as "Pitch set". */
  label: string;
  /** What the conversion does to the data, such as "drops the timing". */
  describe: string;
  /** Pure: returns a new block of type `to`; never touches its argument. */
  convert(block: StoredDataBlock): StoredDataBlock;
}

const conversions = new Map<string, Conversion>();

/** Registers a conversion. A duplicate id throws. Returns a function that removes it again. */
export function registerConversion(conversion: Conversion): () => void {
  if (conversions.has(conversion.id)) {
    throw new Error(`Conversion "${conversion.id}" is already registered.`);
  }
  conversions.set(conversion.id, conversion);
  return () => {
    if (conversions.get(conversion.id) === conversion) {
      conversions.delete(conversion.id);
    }
  };
}

export function getConversion(id: string): Conversion | undefined {
  return conversions.get(id);
}

export function registeredConversions(): readonly Conversion[] {
  return [...conversions.values()];
}

/** What a node input (or any picker) takes: exact types, and the conversions it allows by id. */
export interface InputSpec {
  accepts: readonly string[];
  conversions?: readonly string[];
}

/** The registered types an input takes exactly, in registration order. */
export function typesAccepting(spec: InputSpec): DataBlockTypeDef[] {
  return dataBlockTypes().filter((def) => spec.accepts.includes(def.id));
}

/** The allowed conversions that turn `block` into an accepted type. Empty when it already matches. */
export function reinterpretOptions(spec: InputSpec, block: StoredDataBlock): Conversion[] {
  if (spec.accepts.includes(block.typeId)) {
    return [];
  }
  return (spec.conversions ?? []).flatMap((id) => {
    const conversion = conversions.get(id);
    return conversion && conversion.from === block.typeId && spec.accepts.includes(conversion.to)
      ? [conversion]
      : [];
  });
}

/** Runs one explicitly chosen conversion. Throws when it does not apply or breaks its own contract. */
export function applyConversion(conversion: Conversion, block: StoredDataBlock): StoredDataBlock {
  if (block.typeId !== conversion.from) {
    throw new Error(`"${conversion.id}" converts ${conversion.from}, not ${block.typeId}.`);
  }
  const result = conversion.convert(block);
  if (result.typeId !== conversion.to) {
    throw new Error(`"${conversion.id}" must produce ${conversion.to}, not ${result.typeId}.`);
  }
  return result;
}

export interface ExactEntry<B extends StoredDataBlock> {
  block: B;
}

export interface ReinterpretEntry<B extends StoredDataBlock> {
  block: B;
  conversion: Conversion;
}

/** The picker's two lists: exact matches by stored type, then (separately) each allowed conversion. */
export function pickerFor<B extends StoredDataBlock>(
  spec: InputSpec,
  blocks: readonly B[]
): { exact: ExactEntry<B>[]; reinterpret: ReinterpretEntry<B>[] } {
  const exact: ExactEntry<B>[] = [];
  const reinterpret: ReinterpretEntry<B>[] = [];
  for (const block of blocks) {
    if (spec.accepts.includes(block.typeId)) {
      exact.push({ block });
    } else {
      reinterpretOptions(spec, block).forEach((conversion) =>
        reinterpret.push({ block, conversion })
      );
    }
  }
  return { exact, reinterpret };
}
