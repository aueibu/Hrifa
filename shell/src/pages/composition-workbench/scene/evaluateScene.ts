import type { MusicalPerformanceEvent, MusicalPerformancePlan } from '../audio/types';
import { auditionBlock, type AuditionResult } from '../dataBlocks/audition';
import { defaultAuditionContext } from '../dataBlocks/auditionPlans';
import {
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
import {
  chainPlacement,
  collectionDataOf,
  objectChain,
  objectDataOf,
  sceneDataOf,
  type ObjectData,
} from './sceneTypes';

/**
 * Scene evaluation (workbench O1; W-67): a scene, compiled into the existing musical plan. Pure (no
 * React, no Tone, no storage); all time is exact rationals in quarter notes.
 *
 * Per object, in order: world start (parent chain of relative starts) -> the primary data's ONE cycle
 * (`auditionBlock`) -> mapping (Loop tiles it, Stretch scales it to the span, One-shot plays it once)
 * -> the end bound -> merge. `modifiers` and `registerSpan` are stored but IGNORED here (O3, undecided).
 *
 * End bound (row 7, decided): an object ends at `min(its own end, every ancestor's end)`. An event
 * starting at or after the bound is dropped; one that crosses it is shortened to end exactly there.
 * Objects are silent when muted, when under a muted collection (any ancestor collection in the scene's
 * tree), or when their parent chain is circular (with a warning). A muted object does not silence the
 * objects placed under it. An object listed by two collections plays once (the first listing wins) and
 * warns. The plan's duration is the latest END of every object reachable from the root collection,
 * muted and empty ones included (the form's length, row 5), so a silent tail is kept.
 */

export interface SceneEvaluation {
  plan: MusicalPerformancePlan;
  warnings: string[];
}

export interface EvaluateSceneOptions {
  settings?: AuditionSettings;
  context?: AuditionContext;
  timeline?: MusicalTimeline;
  /** The base-cycle builder; a seam for tests, default `auditionBlock`. */
  buildCycle?: typeof auditionBlock;
}

export interface SceneEvaluator {
  evaluate(blocks: readonly StoredDataBlock[], sceneId: string): SceneEvaluation;
}

/** How many placements one cycle result remembers (a drag over start values stays bounded). */
const PLACEMENT_MEMORY = 32;

type Mapping = ObjectData['mapping'];

function ceilDivide(numerator: Rational, divisor: Rational): number {
  const n = numerator.numerator * divisor.denominator;
  const d = numerator.denominator * divisor.numerator;
  return Math.ceil(n / d);
}

/** Mapping and bound applied to one cycle, as events at world positions. */
function placeCycle(
  built: Extract<AuditionResult, { ok: true }>,
  objectId: string,
  start: Rational,
  duration: Rational,
  mapping: Mapping,
  bound: Rational
): MusicalPerformanceEvent[] {
  const cycleLength = built.cycleLength.quarterNotes;
  const out: MusicalPerformanceEvent[] = [];
  const emit = (event: MusicalPerformanceEvent, at: Rational, length: Rational, tag: string) => {
    // The musical timeline starts at quarter 0 (the engine refuses an earlier event), so an event
    // an object places before it (a negative start) is dropped; the object's span still counts.
    if (compareRational(at, bound) >= 0 || at.numerator < 0) {
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
  const tiles =
    mapping === 'one-shot' ? 1 : ceilDivide(subtractRational(bound, start), cycleLength);
  for (let tile = 0; tile < tiles; tile += 1) {
    const base = addRational(start, multiplyRational(cycleLength, rational(tile)));
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

  const placedEvents = (
    built: Extract<AuditionResult, { ok: true }>,
    objectId: string,
    start: Rational,
    duration: Rational,
    mapping: Mapping,
    bound: Rational
  ): MusicalPerformanceEvent[] => {
    let memory = placements.get(built);
    if (!memory) {
      memory = new Map();
      placements.set(built, memory);
    }
    const key = [objectId, start, duration, mapping, bound]
      .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
      .join('|');
    let events = memory.get(key);
    if (!events) {
      if (memory.size >= PLACEMENT_MEMORY) {
        memory.clear();
      }
      events = placeCycle(built, objectId, start, duration, mapping, bound);
      memory.set(key, events);
    }
    return events;
  };

  const evaluate = (blocks: readonly StoredDataBlock[], sceneId: string): SceneEvaluation => {
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const warnings: string[] = [];
    const empty = (duration: Rational): SceneEvaluation => ({
      warnings,
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
    const walk = (id: string, muted: boolean) => {
      const block = byId.get(id);
      const collection = collectionDataOf(block);
      const object = objectDataOf(block);
      if (block === undefined) {
        return;
      }
      if (collection) {
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
        reached.push({ block, data: object, muted });
      } else {
        warnings.push(`"${block.name}" is not an object or a collection, so the scene skips it.`);
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
      const { start, bound } = chainPlacement(chain);
      const ownEnd = addRational(start, data.timeSpan.duration);
      if (compareRational(ownEnd, formEnd) > 0) {
        formEnd = ownEnd;
      }
      if (muted || data.mute || data.primaryDataRef === null) {
        continue;
      }
      const primary = byId.get(data.primaryDataRef.id);
      if (!primary) {
        continue;
      }
      const built = cycleOf(primary);
      if (!built.ok) {
        if (!isBlockEmpty(primary)) {
          warnings.push(`Object "${block.name}" is silent: ${built.reason}`);
        }
        continue;
      }
      built.plan.warnings.forEach((warning) => warnings.push(`Object "${block.name}": ${warning}`));
      events.push(
        ...placedEvents(built, block.id, start, data.timeSpan.duration, data.mapping, bound)
      );
    }
    events.sort((left, right) => compareRational(left.at.quarterNotes, right.at.quarterNotes));
    return {
      warnings,
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
