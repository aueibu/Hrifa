import { packet, type DataItem, type DataPacket } from './model';
import { hasRestsOrTies } from './rhythmNotation';

export interface CompositionOutputRef {
  instanceId: string;
  port: string;
  /**
   * Selects one entry when the resolved output is `kind: 'bank'` — picking a bank entry
   * happens directly in the same source dropdown a plain list output uses (see
   * compositionOutputOptions), not through a separate module. A stale index (the bank
   * regenerated shorter, or differently, since the pick was made) clamps to the nearest still-
   * valid entry at resolution time rather than failing outright; the producing module's own
   * in-UI preview/browse state (if it has one) is intentionally unrelated to this — same
   * "realization control, not output" separation Pitch List's preview controls already use.
   */
  index?: number;
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
  return ref.index === undefined
    ? `${ref.instanceId}|${ref.port}`
    : `${ref.instanceId}|${ref.port}|${ref.index}`;
}

// The published-output key, ignoring any bank-entry index — a module publishes exactly one
// output per port regardless of how many entries a bank holds, so looking up the underlying
// PublishedCompositionOutput must strip the index before matching. outputRefKey (above) is for
// the dropdown's own option value, which needs the index to keep per-entry rows unique.
export function outputPortKey(ref: CompositionOutputRef) {
  return `${ref.instanceId}|${ref.port}`;
}

export function parseOutputRef(value: string): CompositionOutputRef {
  const [instanceId, port, indexText] = value.split('|');
  if (!instanceId || !port) {
    throw new Error('Invalid composition output reference.');
  }
  return indexText === undefined
    ? { instanceId, port }
    : { instanceId, port, index: Number(indexText) };
}

function findOutput(outputs: PublishedCompositionOutput[], ref: CompositionOutputRef) {
  return outputs.find(
    (output) => output.ref.instanceId === ref.instanceId && output.ref.port === ref.port
  );
}

function clampedBankIndex(bank: DataPacket, index: number) {
  return Math.min(Math.max(index, 0), bank.items.length - 1);
}

/**
 * Resolves an already-looked-up output (see boundOutput) to the packet it should actually feed
 * downstream. A bank output is only ever selectable by picking one entry; this unpacks that
 * entry into an ordinary `list` packet (every current bank producer's entries are already a
 * bare `number | number[]`, so this is a spread, not a per-domain unwrap). A non-bank output,
 * or no index, passes through unchanged.
 *
 * Split from resolveBoundPacket (below) specifically so a component can memoize on `output`
 * itself — a stable reference across renders as long as the producing module's own packet
 * hasn't changed — rather than on the whole `outputs` array, which the workbench page rebuilds
 * fresh every render. Keying a memo on `outputs` directly defeats memoization entirely (it
 * "changes" every render regardless of content) and, since this function always allocates a
 * fresh packet for a bank selection, that recomputation feeds a new object into
 * onOutputsChange on every render — an infinite update loop, not just wasted work.
 */
export function resolvePacketFromOutput(
  output: PublishedCompositionOutput | undefined,
  index: number | undefined,
  sourceId: string
): DataPacket | undefined {
  if (!output) {
    return undefined;
  }
  if (index === undefined || output.packet.kind !== 'bank') {
    return output.packet;
  }
  const bank = output.packet;
  if (!bank.items.length) {
    return packet('list', bank.domain, [], ['Selected bank has no entries.']);
  }
  const clamped = clampedBankIndex(bank, index);
  const entry = bank.items[clamped];
  const values = Array.isArray(entry.value) ? (entry.value as unknown[]) : [entry.value];
  const items: DataItem<unknown>[] = values.map((value, position) => ({
    id: `${sourceId}:${entry.id}:${position}`,
    value,
    provenance: [
      ...entry.provenance,
      {
        sourceModuleInstance: sourceId,
        sourceItemIds: [entry.id],
        transformation: 'select-bank-entry',
        parameters: { index: clamped, position },
      },
    ],
  }));
  // A bank whose entries start in different places (Rhythm Householder's candidates) lists each
  // entry's start in metadata.entryOrigins; the selected entry carries its own.
  const entryOrigins = bank.metadata?.entryOrigins;
  const entryOrigin = Array.isArray(entryOrigins) ? entryOrigins[clamped] : undefined;
  const frame =
    bank.frame && typeof entryOrigin === 'number'
      ? { ...bank.frame, origin: entryOrigin }
      : bank.frame;
  return packet('list', bank.domain, items, bank.warnings, bank.metadata, {
    role: bank.role,
    encoding: bank.encoding,
    frame,
  });
}

/**
 * The published output an inlet's binding currently points at, ignoring any bank-entry index —
 * used to detect a genuinely missing/disconnected source, distinct from a bank whose entry
 * count merely shrank (that case clamps in resolvePacketFromOutput instead of reporting missing).
 */
export function boundOutput(
  outputs: PublishedCompositionOutput[],
  ref: CompositionOutputRef | undefined
) {
  return ref ? findOutput(outputs, ref) : undefined;
}

/**
 * Convenience wrapper combining boundOutput + resolvePacketFromOutput for non-hook call sites.
 * Components should prefer the two calls split apart (see resolvePacketFromOutput) so their
 * useMemo can key on the stable `output` reference rather than the whole `outputs` array.
 */
export function resolveBoundPacket(
  outputs: PublishedCompositionOutput[],
  ref: CompositionOutputRef | undefined,
  sourceId: string
): DataPacket | undefined {
  return ref ? resolvePacketFromOutput(findOutput(outputs, ref), ref.index, sourceId) : undefined;
}

/**
 * The folders a bank entry sits in, from metadata.entryGroups (parallel to the bank's items, like
 * entryOrigins). Each element is one folder name, or a path of nested folder names outermost
 * first; an entry with none sits directly under its output.
 */
function entryGroupPath(bank: DataPacket, index: number): string[] {
  const entryGroups = bank.metadata?.entryGroups;
  const group = Array.isArray(entryGroups) ? entryGroups[index] : undefined;
  if (Array.isArray(group)) {
    return group.filter((part): part is string => typeof part === 'string');
  }
  return typeof group === 'string' ? [group] : [];
}

// Only the innermost folder joins the label: outer ones are navigation, and would make a
// connected source's name needlessly long.
function entryLabel(outputLabel: string, groups: string[], entry: string) {
  const innermost = groups[groups.length - 1];
  return innermost ? `${outputLabel} · ${innermost} · ${entry}` : `${outputLabel} · ${entry}`;
}

/** A human-readable description of a bound source, including which bank entry when relevant. */
export function describeOutputRef(
  outputs: PublishedCompositionOutput[],
  ref: CompositionOutputRef | undefined
): string | undefined {
  if (!ref) {
    return undefined;
  }
  const output = findOutput(outputs, ref);
  if (!output) {
    return undefined;
  }
  if (ref.index === undefined || output.packet.kind !== 'bank') {
    return output.label;
  }
  const index = clampedBankIndex(output.packet, ref.index);
  const entry = output.packet.items[index];
  return entryLabel(
    output.label,
    entryGroupPath(output.packet, index),
    entry?.label ?? `Entry ${index + 1}`
  );
}

/** Whether an inter-onset list, or any entry of an inter-onset bank, has a rest or starts a tie. */
function packetHasRestsOrTies(packet: DataPacket): boolean {
  if (packet.role !== 'interOnset') {
    return false;
  }
  if (packet.kind === 'bank') {
    return packet.items.some(
      (item) =>
        Array.isArray(item.value) &&
        item.value.some((entry) => typeof entry === 'number' && entry < 0)
    );
  }
  return hasRestsOrTies(packet.items);
}

/**
 * Builds the selectable option rows for an inlet's source dropdown: an ordinary list/value
 * output appears as one row; a compatible bank output is flattened into one row per entry, so
 * picking which bank entry to use happens directly in the same dropdown rather than requiring
 * a separate module. `isCompatible` is checked against the packet SHAPE a candidate would have
 * once resolved — a bank entry is checked as the `list` it would become, not as `kind: 'bank'`.
 */
export function compositionOutputOptions(
  outputs: PublishedCompositionOutput[],
  currentInstanceId: string,
  isCompatible: (candidate: DataPacket) => boolean,
  { allowRestsAndTies = false }: { allowRestsAndTies?: boolean } = {}
): { value: string; label: string; path: string[] }[] {
  const options: { value: string; label: string; path: string[] }[] = [];
  for (const output of outputs) {
    if (output.ref.instanceId === currentInstanceId) {
      continue;
    }
    // A rhythm with rests or ties is not interchangeable with a plain duration list. Only a
    // consumer that understands them (Melodicization, Mixer) is offered it; the rest would drop
    // the ties or read a rest as a number, so they never see it (ARCHITECTURE.md, "Rests and ties").
    if (!allowRestsAndTies && packetHasRestsOrTies(output.packet)) {
      continue;
    }
    // Published labels read "<module> · <output>"; the path lets a menu show modules first.
    const split = output.label.indexOf(' · ');
    const outputPath =
      split < 0 ? [output.label] : [output.label.slice(0, split), output.label.slice(split + 3)];
    if (output.packet.kind === 'bank') {
      if (isCompatible({ ...output.packet, kind: 'list' })) {
        output.packet.items.forEach((item, index) => {
          const entry = item.label ?? `Entry ${index + 1}`;
          const groups = entryGroupPath(output.packet, index);
          options.push({
            value: outputRefKey({ ...output.ref, index }),
            label: entryLabel(output.label, groups, entry),
            path: [...outputPath, ...groups, entry],
          });
        });
      }
      continue;
    }
    if (isCompatible(output.packet)) {
      options.push({ value: outputRefKey(output.ref), label: output.label, path: outputPath });
    }
  }
  return options;
}
