import type { MusicalPerformanceEvent, MusicalPerformancePlan } from '../audio/types';
import { auditionBlock, type AuditionResult } from '../dataBlocks/audition';
import { defaultAuditionContext } from '../dataBlocks/auditionPlans';
import {
  DATA_BLOCK_SCHEMA_VERSION,
  chooseTypeId,
  defaultAuditionSettings,
  isBlockEmpty,
  type AuditionContext,
  type AuditionSettings,
  type StoredDataBlock,
} from '../dataBlocks/registry';
import {
  addRational,
  compareRational,
  defaultMusicalTimeline,
  multiplyRational,
  rational,
  subtractRational,
  type MusicalTimeline,
  type Rational,
} from '../musicalTime';
import { runModifierStack, type StackProblem } from './modifiers';
import {
  chainPlacement,
  collectionDataOf,
  objectChain,
  objectDataOf,
  sceneDataOf,
  trackDataOf,
  type ModifierInstance,
  type ObjectData,
} from './sceneTypes';

/**
 * Scene evaluation (workbench O1; W-67): a scene, compiled into the existing musical plan. Pure (no
 * React, no Tone, no storage); all time is exact rationals in quarter notes.
 *
 * Per object, in order: world start (parent chain of relative starts) -> the object data's ONE cycle
 * (`auditionBlock`) -> mapping (Loop tiles it, Stretch scales it to the span, One-shot plays it once)
 * -> the end bound -> the register step (`registerMapping` show, filter or fold, over `registerSpan`;
 * realization only, never the data block; counts and the data's pitch range are reported per object in
 * `SceneEvaluation.objects`) -> merge.
 *
 * Modifiers (O3, W-72): the primary data's PACKET goes through the unmuted modifiers top to bottom on
 * one cycle (`runModifierStack`), and the resulting packet is made audible by the same audition build
 * as any block (wrapped in an in-memory block of the type `chooseTypeId` picks), so the mapping and
 * the end bound below do not change. A stack with a problem makes the object silent and adds a
 * warning naming the object, the modifier and the problem.
 *
 * End bound (W-79): an object ends at its OWN end; a parent's end never cuts a child. An event
 * starting at or after the bound is dropped; one that crosses it is shortened to end exactly there.
 * Tracks (W-82): a collection may list Tracks; an object is reached through a Track when its `trackRef`
 * is that Track (old shape: listed directly by a collection, still reached). A Track listed twice is
 * walked once (first wins). An object whose Track no collection reaches, or whose `trackRef` names a
 * missing block, is not reached (like an object in no collection); a missing Track silences nothing.
 * Objects are silent when muted, when under a muted collection (any ancestor collection in the scene's
 * tree), when their Track is muted (`includeMuted` still builds their events), or when their parent
 * chain is circular (with a warning). A muted object does not silence the
 * objects placed under it. An object listed by two collections plays once (the first listing wins) and
 * warns. The plan's duration is the latest END of every object reachable from the root collection,
 * muted and empty ones included (the form's length, row 5), so a silent tail is kept.
 */

/** The problems of an object's modifier stack, for Properties; empty when it is sound or has none. */
export function modifierProblems(
  blocks: readonly StoredDataBlock[],
  objectId: string,
  context: AuditionContext = defaultAuditionContext
): StackProblem[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const object = objectDataOf(byId.get(objectId));
  const primary = object?.primaryDataRef ? byId.get(object.primaryDataRef.id) : undefined;
  if (!object || !primary || isBlockEmpty(primary) || object.modifiers.every((m) => m.mute)) {
    return [];
  }
  const result = runModifierStack(primary, object.modifiers, byId, context);
  return result.ok ? [] : result.problems;
}

/**
 * One object's base cycle: what stage 1 remembers. `built` plays; the others are why not (a refusal
 * of the audition core, or the stack's problems).
 */
type CycleOutcome =
  | { kind: 'built'; built: Extract<AuditionResult, { ok: true }> }
  | { kind: 'refused'; reason: string }
  | { kind: 'problems'; texts: string[] };

export interface SceneEvaluation {
  plan: MusicalPerformancePlan;
  warnings: string[];
  /** What each object that played (or would, when muted events are included) did with its register. */
  objects: Record<string, ObjectRealization>;
}

/** What the register step did to one object's notes (U7b-1). */
export interface RegisterCounts {
  /** Notes folded to another octave (filter never moves). */
  moved: number;
  /** Notes removed: outside the span (filter), or with no octave inside it (fold). */
  dropped: number;
  /** Fold only: notes removed because a folded note already sounded the same pitch at the same start. */
  merged: number;
}

export interface ObjectRealization extends RegisterCounts {
  /** Lowest and highest sounding pitch after modifiers, before the register step; null when silent. */
  range: { lowMc: number; highMc: number } | null;
}

/** Percussion and click sounds carry a placeholder pitch; the register step leaves them alone. */
const UNPITCHED = new Set<string>([
  'preview.click',
  'preview.click-accent',
  'sound.click',
  'sound.woodblock',
  'sound.drum',
]);
const isPitched = (event: MusicalPerformanceEvent) => !UNPITCHED.has(event.instrumentId);

const OCTAVE_MC = 1200;
const EPSILON = 1e-9;

/** The lowest and highest pitch (midicents) of the pitched events, or null when there are none. */
export function pitchRange(
  events: readonly MusicalPerformanceEvent[]
): { lowMc: number; highMc: number } | null {
  let lowMc = Infinity;
  let highMc = -Infinity;
  for (const event of events) {
    if (isPitched(event)) {
      lowMc = Math.min(lowMc, event.pitchMidicents);
      highMc = Math.max(highMc, event.pitchMidicents);
    }
  }
  return lowMc === Infinity ? null : { lowMc, highMc };
}

/**
 * The register step on one object's realized events (never on the data block). `span` is inclusive.
 * Show: unchanged. Filter: drops pitched notes outside the span. Fold: moves each pitched note by whole
 * octaves to the octave inside the span nearest its own pitch (a note with none is dropped), then merges
 * notes with the same start and pitch (the longer duration wins). Unpitched events are untouched.
 */
export function applyRegister(
  events: readonly MusicalPerformanceEvent[],
  span: { lowMc: number; highMc: number },
  mapping: ObjectData['registerMapping']
): { events: MusicalPerformanceEvent[]; counts: RegisterCounts } {
  const counts: RegisterCounts = { moved: 0, dropped: 0, merged: 0 };
  if (mapping === 'show') {
    return { events: [...events], counts };
  }
  const { lowMc, highMc } = span;
  const out: MusicalPerformanceEvent[] = [];
  const seen = new Map<string, number>();
  for (const event of events) {
    if (!isPitched(event)) {
      out.push(event);
      continue;
    }
    const pitch = event.pitchMidicents;
    if (mapping === 'filter') {
      if (pitch < lowMc || pitch > highMc) {
        counts.dropped += 1;
      } else {
        out.push(event);
      }
      continue;
    }
    const lowest = Math.ceil((lowMc - pitch) / OCTAVE_MC - EPSILON);
    const highest = Math.floor((highMc - pitch) / OCTAVE_MC + EPSILON);
    if (lowest > highest) {
      counts.dropped += 1;
      continue;
    }
    const shift = Math.min(Math.max(0, lowest), highest);
    const placed = shift === 0 ? event : { ...event, pitchMidicents: pitch + shift * OCTAVE_MC };
    const key = `${placed.at.quarterNotes.numerator}/${placed.at.quarterNotes.denominator}|${placed.pitchMidicents}`;
    const twin = seen.get(key);
    if (twin !== undefined) {
      counts.merged += 1;
      if (compareRational(placed.duration.quarterNotes, out[twin].duration.quarterNotes) > 0) {
        out[twin] = { ...out[twin], duration: placed.duration };
      }
      continue;
    }
    if (shift !== 0) {
      counts.moved += 1;
    }
    seen.set(key, out.length);
    out.push(placed);
  }
  return { events: out, counts };
}

export interface EvaluateSceneOptions {
  settings?: AuditionSettings;
  context?: AuditionContext;
  timeline?: MusicalTimeline;
  /** The base-cycle builder; a seam for tests, default `auditionBlock`. */
  buildCycle?: typeof auditionBlock;
}

export interface SceneEvaluator {
  /**
   * `includeMuted` also builds the events of muted objects (own, collection or ancestor mute): the Arranger
   * draws them ghosted. Scene length is the same either way; never use it for playback.
   */
  evaluate(
    blocks: readonly StoredDataBlock[],
    sceneId: string,
    evaluateOptions?: { includeMuted?: boolean }
  ): SceneEvaluation;
}

/** How many placements one cycle result remembers (a drag over start values stays bounded). */
const PLACEMENT_MEMORY = 32;

type Mapping = ObjectData['mapping'];

function ceilDivide(numerator: Rational, divisor: Rational): number {
  const n = numerator.numerator * divisor.denominator;
  const d = numerator.denominator * divisor.numerator;
  return Math.ceil(n / d);
}

/** `value` reduced into [0, modulus) (exact). */
function modRational(value: Rational, modulus: Rational): Rational {
  const whole = Math.floor(
    (value.numerator * modulus.denominator) / (value.denominator * modulus.numerator)
  );
  return subtractRational(value, multiplyRational(modulus, rational(whole)));
}

/** Mapping and bound applied to one cycle, as events at world positions. */
function placeCycle(
  built: Extract<AuditionResult, { ok: true }>,
  objectId: string,
  start: Rational,
  duration: Rational,
  mapping: Mapping,
  bound: Rational,
  offset: Rational
): MusicalPerformanceEvent[] {
  const cycleLength = built.cycleLength.quarterNotes;
  const out: MusicalPerformanceEvent[] = [];
  const emit = (event: MusicalPerformanceEvent, at: Rational, length: Rational, tag: string) => {
    // The musical timeline starts at quarter 0 (the engine refuses an earlier event), so an event
    // an object places before it (a negative start) is dropped; the object's span still counts.
    // An event before the object's own start is data the object does not show (a left-edge trim).
    if (compareRational(at, bound) >= 0 || at.numerator < 0 || compareRational(at, start) < 0) {
      return;
    }
    const end = addRational(at, length);
    const clipped = compareRational(end, bound) > 0 ? subtractRational(bound, at) : length;
    out.push({
      ...event,
      id: `${objectId}:${tag}${event.id}`,
      at: { quarterNotes: at },
      duration: { quarterNotes: clipped },
      provenance: [
        ...event.provenance,
        {
          sourceNodeInstance: objectId,
          sourceItemIds: [event.id],
          transformation: 'scene-object',
          parameters: { mapping },
        },
      ],
    });
  };
  if (compareRational(bound, start) <= 0 || cycleLength.numerator <= 0) {
    return out;
  }
  if (mapping === 'stretch') {
    const factor = multiplyRational(
      duration,
      rational(cycleLength.denominator, cycleLength.numerator)
    );
    for (const event of built.plan.events) {
      emit(
        event,
        addRational(start, multiplyRational(event.at.quarterNotes, factor)),
        multiplyRational(event.duration.quarterNotes, factor),
        ''
      );
    }
    return out;
  }
  // The data position under the object's start is `offset`. One-shot: the data begins at
  // `start - offset` (a positive offset trims, a negative one is leading silence). Loop: the cycle grid
  // is anchored at `start - (offset mod cycle length)`, so cycles keep their places when an edge moves.
  const anchor =
    mapping === 'one-shot'
      ? subtractRational(start, offset)
      : subtractRational(start, modRational(offset, cycleLength));
  const tiles =
    mapping === 'one-shot' ? 1 : ceilDivide(subtractRational(bound, anchor), cycleLength);
  for (let tile = 0; tile < tiles; tile += 1) {
    const base = addRational(anchor, multiplyRational(cycleLength, rational(tile)));
    for (const event of built.plan.events) {
      emit(
        event,
        addRational(base, event.at.quarterNotes),
        event.duration.quarterNotes,
        `${tile}:`
      );
    }
  }
  return out;
}

export function createSceneEvaluator(options: EvaluateSceneOptions = {}): SceneEvaluator {
  const settings = options.settings ?? defaultAuditionSettings;
  const context = options.context ?? defaultAuditionContext;
  const timeline = options.timeline ?? defaultMusicalTimeline;
  const buildCycle = options.buildCycle ?? auditionBlock;
  // Stage 1: a block's base cycle. Edits make new block objects, so the object itself is the key.
  const cycles = new WeakMap<StoredDataBlock, AuditionResult>();
  // Stage 1 with modifiers: per primary block, per modifier list (order, mute, params, reference ids),
  // remembered with the referenced block objects it was built from (an edit to a pitch set makes a new
  // block object, so it recomputes). Start, duration and mapping are not part of the key.
  const stacks = new WeakMap<
    StoredDataBlock,
    Map<string, { deps: StoredDataBlock[]; outcome: CycleOutcome }>
  >();
  // Stage 2: mapping and placement, per cycle result.
  const placements = new WeakMap<AuditionResult, Map<string, MusicalPerformanceEvent[]>>();

  const cycleOf = (block: StoredDataBlock): AuditionResult => {
    let result = cycles.get(block);
    if (!result) {
      result = buildCycle(block, settings, undefined, context);
      cycles.set(block, result);
    }
    return result;
  };

  const stackCycleOf = (
    primary: StoredDataBlock,
    modifiers: readonly ModifierInstance[],
    byId: ReadonlyMap<string, StoredDataBlock>
  ): CycleOutcome => {
    const key = JSON.stringify(modifiers);
    const deps = modifiers
      .filter((modifier) => !modifier.mute)
      .flatMap((modifier) => Object.values(modifier.refs))
      .flatMap((ref) => {
        const block = ref === null ? undefined : byId.get(ref.id);
        return block ? [block] : [];
      });
    let memory = stacks.get(primary);
    if (!memory) {
      memory = new Map();
      stacks.set(primary, memory);
    }
    const hit = memory.get(key);
    if (hit && hit.deps.length === deps.length && hit.deps.every((dep, i) => dep === deps[i])) {
      return hit.outcome;
    }
    const outcome = computeStackCycle(primary, modifiers, byId);
    if (memory.size >= PLACEMENT_MEMORY) {
      memory.clear();
    }
    memory.set(key, { deps, outcome });
    return outcome;
  };

  const computeStackCycle = (
    primary: StoredDataBlock,
    modifiers: readonly ModifierInstance[],
    byId: ReadonlyMap<string, StoredDataBlock>
  ): CycleOutcome => {
    const stack = runModifierStack(primary, modifiers, byId, context);
    if (!stack.ok) {
      return { kind: 'problems', texts: stack.problems.map((problem) => problem.text) };
    }
    const typeId = chooseTypeId(stack.packet);
    if (typeId === undefined) {
      return { kind: 'refused', reason: 'No data-block type holds the result of the modifiers.' };
    }
    // The existing audition build makes the result audible: no second realization path.
    const wrapped: StoredDataBlock = {
      schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
      id: `${primary.id}:modifiers`,
      typeId,
      name: primary.name,
      createdAt: primary.createdAt,
      payload: { kind: 'packet', packet: stack.packet },
    };
    const built = buildCycle(wrapped, settings, undefined, context);
    return built.ok ? { kind: 'built', built } : { kind: 'refused', reason: built.reason };
  };

  const placedEvents = (
    built: Extract<AuditionResult, { ok: true }>,
    objectId: string,
    start: Rational,
    duration: Rational,
    mapping: Mapping,
    bound: Rational,
    offset: Rational
  ): MusicalPerformanceEvent[] => {
    let memory = placements.get(built);
    if (!memory) {
      memory = new Map();
      placements.set(built, memory);
    }
    const key = [objectId, start, duration, mapping, bound, offset]
      .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
      .join('|');
    let events = memory.get(key);
    if (!events) {
      if (memory.size >= PLACEMENT_MEMORY) {
        memory.clear();
      }
      events = placeCycle(built, objectId, start, duration, mapping, bound, offset);
      memory.set(key, events);
    }
    return events;
  };

  const evaluate = (
    blocks: readonly StoredDataBlock[],
    sceneId: string,
    evaluateOptions?: { includeMuted?: boolean }
  ): SceneEvaluation => {
    const includeMuted = evaluateOptions?.includeMuted ?? false;
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const warnings: string[] = [];
    const objects: Record<string, ObjectRealization> = {};
    const empty = (duration: Rational): SceneEvaluation => ({
      warnings,
      objects,
      plan: {
        id: `${sceneId}:scene`,
        sourceId: sceneId,
        timebase: { kind: 'musical', timeline },
        duration: { quarterNotes: duration },
        events: [],
        warnings,
      },
    });
    const scene = sceneDataOf(byId.get(sceneId));
    if (!scene) {
      warnings.push('That is not a scene.');
      return empty(rational(0));
    }
    // The objects the scene reaches, through its root collection only, each with its muted-ness.
    const reached: { block: StoredDataBlock; data: ObjectData; muted: boolean }[] = [];
    const seenObjects = new Set<string>();
    const seenCollections = new Set<string>();
    const seenTracks = new Set<string>();
    // A Track's objects are computed from `ObjectData.trackRef`, in block order (never stored on the Track).
    const objectsOfTrack = new Map<string, string[]>();
    for (const block of blocks) {
      const trackId = objectDataOf(block)?.trackRef?.id;
      if (trackId !== undefined) {
        objectsOfTrack.set(trackId, [...(objectsOfTrack.get(trackId) ?? []), block.id]);
      }
    }
    const walk = (id: string, muted: boolean) => {
      const block = byId.get(id);
      const collection = collectionDataOf(block);
      const object = objectDataOf(block);
      const track = trackDataOf(block);
      if (block === undefined) {
        return;
      }
      if (track) {
        if (seenTracks.has(id)) {
          warnings.push(`Track "${block.name}" is reached twice and was skipped the second time.`);
          return;
        }
        seenTracks.add(id);
        (objectsOfTrack.get(id) ?? []).forEach((objectId) => walk(objectId, muted));
      } else if (collection) {
        if (seenCollections.has(id)) {
          warnings.push(
            `Collection "${block.name}" is reached twice and was skipped the second time.`
          );
          return;
        }
        seenCollections.add(id);
        const inner = muted || collection.mute;
        collection.memberRefs.forEach((ref) => walk(ref.id, inner));
      } else if (object) {
        if (seenObjects.has(id)) {
          warnings.push(`Object "${block.name}" is listed twice and plays once.`);
          return;
        }
        seenObjects.add(id);
        // Order: collection (carried in `muted`), then the object's Track, then the object itself.
        const trackMuted =
          object.trackRef != null && (trackDataOf(byId.get(object.trackRef.id))?.mute ?? false);
        reached.push({ block, data: object, muted: muted || trackMuted });
      } else {
        warnings.push(
          `"${block.name}" is not an object, a track or a collection, so the scene skips it.`
        );
      }
    };
    if (scene.rootCollectionRef !== null) {
      walk(scene.rootCollectionRef.id, false);
    }

    let formEnd = rational(0);
    const events: MusicalPerformanceEvent[] = [];
    for (const { block, data, muted } of reached) {
      const chain = objectChain(byId, block.id);
      if (chain === null) {
        warnings.push(`Object "${block.name}" has a circular parent chain and is silent.`);
        continue;
      }
      const { start } = chainPlacement(chain);
      const ownEnd = addRational(start, data.timeSpan.duration);
      const bound = ownEnd;
      if (compareRational(ownEnd, formEnd) > 0) {
        formEnd = ownEnd;
      }
      if ((!includeMuted && (muted || data.mute)) || data.primaryDataRef === null) {
        continue;
      }
      const primary = byId.get(data.primaryDataRef.id);
      if (!primary) {
        continue;
      }
      const outcome: CycleOutcome = data.modifiers.some((modifier) => !modifier.mute)
        ? isBlockEmpty(primary)
          ? { kind: 'refused', reason: '' }
          : stackCycleOf(primary, data.modifiers, byId)
        : (() => {
            const base = cycleOf(primary);
            return base.ok
              ? ({ kind: 'built', built: base } as const)
              : ({ kind: 'refused', reason: base.reason } as const);
          })();
      if (outcome.kind === 'problems') {
        outcome.texts.forEach((text) => warnings.push(`Object "${block.name}": ${text}`));
        continue;
      }
      if (outcome.kind === 'refused') {
        if (!isBlockEmpty(primary)) {
          warnings.push(`Object "${block.name}" is silent: ${outcome.reason}`);
        }
        continue;
      }
      const built = outcome.built;
      built.plan.warnings.forEach((warning) => warnings.push(`Object "${block.name}": ${warning}`));
      const registered = applyRegister(
        placedEvents(
          built,
          block.id,
          start,
          data.timeSpan.duration,
          data.mapping,
          bound,
          data.contentOffset
        ),
        data.registerSpan,
        data.registerMapping
      );
      objects[block.id] = { ...registered.counts, range: pitchRange(built.plan.events) };
      events.push(...registered.events);
    }
    events.sort((left, right) => compareRational(left.at.quarterNotes, right.at.quarterNotes));
    return {
      warnings,
      objects,
      plan: { ...empty(formEnd).plan, events },
    };
  };

  return { evaluate };
}

let shared: SceneEvaluator | undefined;

/** `createSceneEvaluator(options).evaluate(...)`; with no options a shared evaluator keeps its memo. */
export function evaluateScene(
  blocks: readonly StoredDataBlock[],
  sceneId: string,
  options?: EvaluateSceneOptions
): SceneEvaluation {
  if (options === undefined) {
    shared ??= createSceneEvaluator();
    return shared.evaluate(blocks, sceneId);
  }
  return createSceneEvaluator(options).evaluate(blocks, sceneId);
}
