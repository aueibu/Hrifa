import { describe, expect, it } from 'vitest';
import type { PublishedCompositionOutput } from '../../compositionRouting';
import { createDefaultNodeRouteState } from '../../compositionWorkspace';
import { captureDataBlock, type PacketBlock } from '../../dataBlock';
import '../../dataBlocks/types';
import { melodicize } from '../../melodicization';
import { packet } from '../../model';
import { signalTypeRegistry } from '../../signalTypes';
import { transportPulse } from '../../transport';
import { createMemo } from '../memo';
import { nodeEvaluators } from '../nodeEvaluators';
import { nodePorts } from '../nodePorts';
import {
  computeDataBlockSource,
  evaluateDataBlockSource,
  dataBlockSourceOutputs,
} from './dataBlockSource';
import {
  computeMelodicization,
  evaluateMelodicization,
  melodicizationOutputs,
  pickMelodicizationInputs,
  type MelodicizationState,
} from './melodicization';
import { evaluatePitchList } from './pitchList';
import { evaluateRhythmList } from './rhythmList';

// "Today's output" is rebuilt from the same pure helpers the components called at HEAD
// (resolve + signalTypeRegistry.apply + melodicize for Melodicization; the data-block's name and
// packet for Data-block), written out as the components did it.

const rhythmCtx = { instanceId: 'rhythm-list-1', instanceLabel: 'Rhythm List 1' };
const pitchCtx = { instanceId: 'pitch-list-1', instanceLabel: 'Pitch List 1', edo: 12 };
const rhythmOutputs = evaluateRhythmList({ text: '2 1 1 2 1 1 2', loop: true }, {}, rhythmCtx)
  .outputs satisfies PublishedCompositionOutput[];
const pitchOutputs = evaluatePitchList(
  { format: 'midi-note', inlineValues: '60, 62, 64, 67', catalogOrigins: {} },
  {},
  pitchCtx
).outputs satisfies PublishedCompositionOutput[];
const sourceOutputs = [...rhythmOutputs, ...pitchOutputs];
const unrelatedOutput: PublishedCompositionOutput = {
  ref: { instanceId: 'other', port: 'x' },
  label: 'Other',
  packet: packet('list', 'integer', []),
};

function bound(rhythm: { instanceId: string; port: string }, pitches: typeof rhythm) {
  const routeState = createDefaultNodeRouteState(nodePorts.melodicization ?? []);
  routeState.rhythm = { ...routeState.rhythm, source: rhythm };
  routeState.pitches = { ...routeState.pitches, source: pitches };
  return routeState;
}

const routeState = bound(rhythmOutputs[0].ref, pitchOutputs[0].ref);
const unbound = createDefaultNodeRouteState(nodePorts.melodicization ?? []);
const pulseUnit = transportPulse({ pulse: '1/2' }).duration;

describe('evaluateMelodicization', () => {
  const ctx = {
    instanceId: 'melodicization-1',
    instanceLabel: 'Melodicization 1',
    edo: 12,
    pulseUnit,
  };
  const state: MelodicizationState = { allocation: 'cycle', articulationPercent: 100 };

  function expectedResult(s: MelodicizationState) {
    const rhythmBinding = routeState.rhythm;
    const pitchBinding = routeState.pitches;
    const rhythm = signalTypeRegistry[rhythmBinding.signalType].apply(
      rhythmOutputs[0].packet,
      rhythmBinding.treatment,
      `route:${ctx.instanceId}:rhythm`,
      ctx.edo
    );
    const pitches = signalTypeRegistry[pitchBinding.signalType].apply(
      pitchOutputs[0].packet,
      pitchBinding.treatment,
      `route:${ctx.instanceId}:pitches`,
      ctx.edo
    );
    return melodicize({
      instanceId: ctx.instanceId,
      rhythm,
      pitches,
      allocation: s.allocation,
      pulseUnit,
      articulationPercent: s.articulationPercent,
    });
  }

  it('publishes an empty notes packet and an error when nothing is connected', () => {
    const evaluation = evaluateMelodicization(
      state,
      pickMelodicizationInputs([], unbound, ctx.instanceId),
      ctx
    );
    expect(evaluation.result.errors.length).toBeGreaterThan(0);
    expect(evaluation.outputs).toHaveLength(1);
    expect(evaluation.outputs[0].packet.items).toEqual([]);
  });

  it('matches the old component output for the default state', () => {
    const inputs = pickMelodicizationInputs(sourceOutputs, routeState, ctx.instanceId);
    expect(inputs.rhythmOutput).toBe(rhythmOutputs[0]);
    expect(inputs.pitchOutput).toBe(pitchOutputs[0]);
    const evaluation = evaluateMelodicization(state, inputs, ctx);
    const expected = expectedResult(state);
    expect(expected.packet.items.length).toBeGreaterThan(0);
    expect(evaluation.result).toEqual(expected);
    expect(evaluation.outputs).toEqual([
      {
        ref: { instanceId: ctx.instanceId, port: 'notes' },
        label: 'Melodicization 1 · Notes',
        packet: expected.packet,
      },
    ]);
  });

  it('matches an edited state: another allocation and articulation', () => {
    const edited: MelodicizationState = { allocation: 'cartesian', articulationPercent: 50 };
    const inputs = pickMelodicizationInputs(sourceOutputs, routeState, ctx.instanceId);
    const evaluation = evaluateMelodicization(edited, inputs, ctx);
    expect(evaluation.result).toEqual(expectedResult(edited));
    expect(evaluation.result.packet).not.toEqual(expectedResult(state).packet);
  });

  it('a rename keeps the packet', () => {
    const inputs = pickMelodicizationInputs(sourceOutputs, routeState, ctx.instanceId);
    const core = computeMelodicization(state, inputs, ctx);
    const before = melodicizationOutputs(core, ctx);
    const after = melodicizationOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after[0].label).toBe('Renamed · Notes');
    expect(after[0].packet).toBe(before[0].packet);
  });

  it('a shared memo: changing the allocation keeps the treated inputs', () => {
    const memo = createMemo();
    const inputs = pickMelodicizationInputs(sourceOutputs, routeState, ctx.instanceId);
    const first = computeMelodicization(state, inputs, ctx, memo);
    const second = computeMelodicization({ ...state, allocation: 'zip' }, inputs, ctx, memo);
    expect(second.treatedRhythm).toBe(first.treatedRhythm);
    expect(second.treatedPitches).toBe(first.treatedPitches);
    expect(second.result).not.toBe(first.result);
  });

  it('a shared memo: the same state and inputs keep the packet', () => {
    const memo = createMemo();
    const inputs = pickMelodicizationInputs(sourceOutputs, routeState, ctx.instanceId);
    const first = computeMelodicization(state, inputs, ctx, memo);
    const second = computeMelodicization({ ...state }, inputs, ctx, memo);
    expect(second.result).toBe(first.result);
    expect(second.result.packet).toBe(first.result.packet);
  });

  it('keeps its inputs when an unrelated output changes', () => {
    const first = pickMelodicizationInputs(sourceOutputs, routeState, ctx.instanceId);
    const second = pickMelodicizationInputs(
      [...sourceOutputs, unrelatedOutput],
      routeState,
      ctx.instanceId
    );
    expect(second.rhythmOutput).toBe(first.rhythmOutput);
    expect(second.pitchOutput).toBe(first.pitchOutput);
    expect(second.bindingRhythm).toBe(first.bindingRhythm);
    expect(second.bindingPitches).toBe(first.bindingPitches);
  });

  // Not reachable from the UI: `compositionOutputOptions` (compositionRouting.ts) leaves out the
  // node's own outputs, and no publishing node accepts `notes`. Only a hand-edited or old
  // project file could hold this route; this pins today's reading of it.
  it('keeps today self-binding behavior: no rule, the bound output is read as it is', () => {
    const own: PublishedCompositionOutput[] = [
      {
        ref: { instanceId: ctx.instanceId, port: 'notes' },
        label: 'own',
        packet: packet('list', 'integer', []),
      },
    ];
    const selfBound = bound({ instanceId: ctx.instanceId, port: 'notes' }, pitchOutputs[0].ref);
    const inputs = pickMelodicizationInputs([...own, ...pitchOutputs], selfBound, ctx.instanceId);
    expect(inputs.rhythmOutput).toBe(own[0]);
  });
});

describe('evaluateDataBlockSource', () => {
  const ctx = { instanceId: 'data-block-1', instanceLabel: 'Data-block 1' };
  const notes = evaluateMelodicization(
    { allocation: 'cycle', articulationPercent: 100 },
    pickMelodicizationInputs(sourceOutputs, routeState, 'm'),
    { instanceId: 'm', instanceLabel: 'M', edo: 12, pulseUnit }
  ).outputs[0].packet;
  const captured = captureDataBlock({
    id: 'block-1',
    createdAt: '2026-11-18T00:00:00.000Z',
    name: 'Data-block 1',
    packet: notes,
    nodeInstance: 'm',
    portId: 'notes',
    itemIds: notes.items.slice(0, 2).map((item) => item.id),
  });
  const dataBlock: PacketBlock = captured.ok ? captured.dataBlock : (undefined as never);

  it('publishes the data-block packet unchanged under its name', () => {
    expect(captured.ok).toBe(true);
    const evaluation = evaluateDataBlockSource({}, { dataBlock }, ctx);
    expect(evaluation.outputs).toEqual([
      {
        ref: { instanceId: ctx.instanceId, port: 'data-block' },
        label: `Data-block 1 · ${dataBlock.name}`,
        packet: dataBlock.payload.packet,
      },
    ]);
    expect(evaluation.outputs[0].packet).toBe(dataBlock.payload.packet);
  });

  it('an edited data-block (new name and packet) publishes the new one', () => {
    const edited: PacketBlock = {
      ...dataBlock,
      name: 'Edited',
      payload: { kind: 'packet', packet: { ...dataBlock.payload.packet } },
    };
    const evaluation = evaluateDataBlockSource({}, { dataBlock: edited }, ctx);
    expect(evaluation.outputs[0].label).toBe('Data-block 1 · Edited');
    expect(evaluation.outputs[0].packet).toBe(edited.payload.packet);
  });

  it('publishes nothing when the data-block is gone', () => {
    expect(evaluateDataBlockSource({}, { dataBlock: undefined }, ctx).outputs).toEqual([]);
  });

  it('a rename keeps the packet', () => {
    const core = computeDataBlockSource({}, { dataBlock }, ctx);
    const before = dataBlockSourceOutputs(core, ctx);
    const after = dataBlockSourceOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after[0].label).toBe(`Renamed · ${dataBlock.name}`);
    expect(after[0].packet).toBe(before[0].packet);
  });

  it('is registered under the data-block-source id', () => {
    expect(nodeEvaluators['data-block-source'].evaluate).toBe(evaluateDataBlockSource);
    expect(nodeEvaluators.melodicization.evaluate).toBe(evaluateMelodicization);
  });
});
