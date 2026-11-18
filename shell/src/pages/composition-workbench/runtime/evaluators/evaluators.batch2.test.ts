import { describe, expect, it } from 'vitest';
import { createDefaultModuleRouteState } from '../../compositionWorkspace';
import { fractioningDurationPacket, generateFractioning } from '../../fractioning';
import { packet } from '../../model';
import {
  generatePairComposition,
  pairCompositionDurationPacket,
  pairCompositionSegmentPackets,
} from '../../pairComposition';
import {
  generateMelodicFamilies,
  melodicFormsPacket,
  realizeScale,
  scalePitchClassPacket,
  scaleSequence,
  scaleSequencePacket,
} from '../../scaleConstruction';
import {
  evolveScale,
  finalPitchClassesPacket,
  finalStagePacket,
  scaleEvolutionStagesPacket,
  stagePitchClassesPacket,
} from '../../scaleEvolution';
import { createMemo } from '../memo';
import { moduleEvaluators } from '../moduleEvaluators';
import { modulePorts } from '../modulePorts';
import { computeFractioning, evaluateFractioning, fractioningOutputs } from './fractioning';
import {
  computePairComposition,
  evaluatePairComposition,
  pairCompositionOutputs,
} from './pairComposition';
import {
  computeScaleConstruction,
  evaluateScaleConstruction,
  scaleConstructionOutputs,
} from './scaleConstruction';
import {
  computeScaleEvolution,
  evaluateScaleEvolution,
  pickScaleEvolutionInputs,
  scaleEvolutionOutputs,
} from './scaleEvolution';

// "Today's output" is rebuilt from the same pure helpers the components called before this batch
// (generateFractioning + fractioningDurationPacket, generatePairComposition + its packet helpers,
// scaleSequence / melodicFormsPacket / scalePitchClassPacket, evolveScale + its packet helpers),
// written out as the components did it.

describe('evaluateFractioning', () => {
  const ctx = { instanceId: 'fractioning-1', instanceLabel: 'Fractioning 1' };

  it('matches the old component output for the default state', () => {
    const result = generateFractioning(3, 2);
    const evaluation = evaluateFractioning({ a: 3, b: 2 }, {}, ctx);
    expect(evaluation.generated).toEqual({ result });
    expect(evaluation.outputs).toEqual([
      {
        ref: { instanceId: 'fractioning-1', port: 'resultant' },
        label: 'Fractioning 1 · Resultant',
        packet: fractioningDurationPacket(result, 3, 2, ctx.instanceId),
      },
    ]);
  });

  it('matches an edited state (string generators) and the invalid case', () => {
    const result = generateFractioning(5, 3);
    const edited = evaluateFractioning({ a: '5', b: '3' }, {}, { ...ctx, instanceLabel: 'Rhythm' });
    expect(edited.outputs).toEqual([
      {
        ref: { instanceId: 'fractioning-1', port: 'resultant' },
        label: 'Rhythm · Resultant',
        packet: fractioningDurationPacket(result, 5, 3, ctx.instanceId),
      },
    ]);
    let message = '';
    try {
      generateFractioning(2, 3);
    } catch (error) {
      message = (error as Error).message;
    }
    const invalid = evaluateFractioning({ a: 2, b: 3 }, {}, ctx);
    expect(invalid.outputs).toEqual([]);
    expect(invalid.generated).toEqual({ error: message });
  });

  it('a rename keeps the packet', () => {
    const core = computeFractioning({ a: 3, b: 2 }, {}, ctx);
    const before = fractioningOutputs(core, ctx);
    const after = fractioningOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after[0].packet).toBe(before[0].packet);
    expect(after[0].label).toBe('Renamed · Resultant');
  });
});

describe('evaluatePairComposition', () => {
  const ctx = { instanceId: 'pair-composition-1', instanceLabel: 'Pair Composition 1' };

  function expectedOutputs(a: number, b: number, mode: 'balancing' | 'expanding' | 'contracting') {
    const result = generatePairComposition(a, b, mode);
    return [
      {
        ref: { instanceId: ctx.instanceId, port: 'combined' },
        label: `${ctx.instanceLabel} · Combined`,
        packet: pairCompositionDurationPacket(result, ctx.instanceId),
      },
      ...pairCompositionSegmentPackets(result, ctx.instanceId).map((segment) => ({
        ref: { instanceId: ctx.instanceId, port: segment.port },
        label: `${ctx.instanceLabel} · ${segment.label}`,
        packet: segment.packet,
      })),
    ];
  }

  it('matches the old component output for the default state', () => {
    const evaluation = evaluatePairComposition({ a: 3, b: 2, mode: 'balancing' }, {}, ctx);
    expect(evaluation.outputs).toEqual(expectedOutputs(3, 2, 'balancing'));
    expect(evaluation.outputs.length).toBeGreaterThan(1);
  });

  it('matches an edited state and the invalid case', () => {
    const edited = evaluatePairComposition({ a: '5', b: '2', mode: 'expanding' }, {}, ctx);
    expect(edited.outputs).toEqual(expectedOutputs(5, 2, 'expanding'));
    const invalid = evaluatePairComposition({ a: 1, b: 3, mode: 'contracting' }, {}, ctx);
    expect(invalid.outputs).toEqual([]);
    expect(typeof invalid.generated.error).toBe('string');
  });

  it('a rename keeps every packet', () => {
    const core = computePairComposition({ a: 3, b: 2, mode: 'balancing' }, {}, ctx);
    const before = pairCompositionOutputs(core, ctx);
    const after = pairCompositionOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after.length).toBe(before.length);
    after.forEach((output, index) => {
      expect(output.packet).toBe(before[index].packet);
      expect(output.label.startsWith('Renamed · ')).toBe(true);
    });
  });
});

describe('evaluateScaleConstruction', () => {
  const ctx = {
    instanceId: 'scale-construction-1',
    instanceLabel: 'Scale Construction 1',
    edo: 12,
  };

  function expectedOutputs(
    intervals: number[],
    root: number,
    mode: 'general' | 'circular',
    label = ctx.instanceLabel
  ) {
    const sequence = scaleSequence(intervals);
    return [
      {
        ref: { instanceId: ctx.instanceId, port: 'sequence' },
        label: `${label} · Sequence`,
        packet: scaleSequencePacket(sequence, ctx.instanceId),
      },
      {
        ref: { instanceId: ctx.instanceId, port: 'melodicForms' },
        label: `${label} · Melodic Forms`,
        packet: melodicFormsPacket(intervals, mode, ctx.instanceId),
      },
      {
        ref: { instanceId: ctx.instanceId, port: 'pitchClasses' },
        label: `${label} · Pitch Classes`,
        packet: scalePitchClassPacket(intervals, root, ctx.instanceId, ctx.edo),
      },
    ];
  }

  it('matches the old component output for the default state', () => {
    const state = { intervals: [2, 2, 1], root: 0, permutationMode: 'general' as const };
    const evaluation = evaluateScaleConstruction(state, {}, ctx);
    expect(evaluation.outputs).toEqual(expectedOutputs([2, 2, 1], 0, 'general'));
    expect(evaluation.families).toEqual(generateMelodicFamilies([2, 2, 1], 'general'));
    expect(evaluation.offsets).toEqual(realizeScale([2, 2, 1], 0));
  });

  it('matches an edited state, and publishes nothing for an invalid one', () => {
    const state = { intervals: [3, 1, 2, 2], root: 7, permutationMode: 'circular' as const };
    const evaluation = evaluateScaleConstruction(state, {}, ctx);
    expect(evaluation.outputs).toEqual(expectedOutputs([3, 1, 2, 2], 7, 'circular'));
    expect(evaluation.families).toEqual(generateMelodicFamilies([3, 1, 2, 2], 'circular'));
    expect(evaluation.offsets).toEqual(realizeScale([3, 1, 2, 2], 7));
    const invalid = evaluateScaleConstruction({ ...state, intervals: [0, -1] }, {}, ctx);
    expect(invalid.outputs).toEqual([]);
    expect(invalid.families).toEqual([]);
    expect(typeof invalid.generated.error).toBe('string');
  });

  it('a rename keeps every packet', () => {
    const state = { intervals: [2, 2, 1], root: 0, permutationMode: 'general' as const };
    const core = computeScaleConstruction(state, {}, ctx);
    const before = scaleConstructionOutputs(core, ctx);
    const after = scaleConstructionOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after.map((output) => output.label)).toEqual([
      'Renamed · Sequence',
      'Renamed · Melodic Forms',
      'Renamed · Pitch Classes',
    ]);
    after.forEach((output, index) => expect(output.packet).toBe(before[index].packet));
  });
});

describe('evaluateScaleEvolution', () => {
  const ctx = { instanceId: 'scale-evolution-1', instanceLabel: 'Scale Evolution 1', edo: 12 };
  const unbound = createDefaultModuleRouteState(modulePorts['scale-evolution'] ?? []);
  const noInputs = pickScaleEvolutionInputs([], unbound, ctx.instanceId);

  function expectedOutputs(intervals: number[], root: number, label = ctx.instanceLabel) {
    const result = evolveScale(intervals);
    const ref = (port: string) => ({ instanceId: ctx.instanceId, port });
    return [
      {
        ref: ref('stages'),
        label: `${label} · Stages`,
        packet: scaleEvolutionStagesPacket(result, ctx.instanceId),
      },
      {
        ref: ref('final'),
        label: `${label} · Final`,
        packet: finalStagePacket(result, ctx.instanceId),
      },
      {
        ref: ref('stagePitches'),
        label: `${label} · Stage Pitches`,
        packet: stagePitchClassesPacket(result, root, ctx.instanceId, ctx.edo),
      },
      {
        ref: ref('finalPitches'),
        label: `${label} · Final Pitches`,
        packet: finalPitchClassesPacket(result, root, ctx.instanceId, ctx.edo),
      },
    ];
  }

  it('matches the old component output for the default (typed) state', () => {
    const evaluation = evaluateScaleEvolution({ intervalText: '3, 2', root: 0 }, noInputs, ctx);
    expect(evaluation.sourceIntervals).toEqual([3, 2]);
    expect(evaluation.resolvedSequence).toBeUndefined();
    expect(evaluation.outputs).toEqual(expectedOutputs([3, 2], 0));
  });

  it('matches an edited state with a connected sequence from a real bound port', () => {
    const source = evaluateScaleConstruction(
      { intervals: [2, 1, 2], root: 0, permutationMode: 'general' },
      {},
      { instanceId: 'scale-construction-1', instanceLabel: 'Scale Construction 1', edo: 12 }
    ).outputs;
    const sequence = source.find((output) => output.ref.port === 'sequence')!;
    const routeState = {
      ...unbound,
      sequence: {
        ...unbound.sequence,
        source: { instanceId: 'scale-construction-1', port: 'sequence' },
      },
    };
    const inputs = pickScaleEvolutionInputs(source, routeState, ctx.instanceId);
    expect(inputs.sequenceOutput).toBe(sequence);
    const evaluation = evaluateScaleEvolution({ intervalText: '9', root: 4 }, inputs, ctx);
    const expectedSource = sequence.packet.items.map((item) => Number(item.value));
    expect(evaluation.resolvedSequence).toBeDefined();
    expect(evaluation.sourceIntervals).toEqual(expectedSource);
    expect(evaluation.outputs).toEqual(expectedOutputs(expectedSource, 4));
  });

  it('reports an error and publishes nothing when there are no intervals', () => {
    const evaluation = evaluateScaleEvolution({ intervalText: 'x', root: 0 }, noInputs, ctx);
    expect(evaluation.outputs).toEqual([]);
    expect(evaluation.generated.error).toBe(
      'Enter or connect one or more positive whole-number intervals.'
    );
  });

  it('reads a binding to itself as disconnected', () => {
    const own = evaluateScaleEvolution({ intervalText: '3, 2', root: 0 }, noInputs, ctx).outputs;
    const routeState = {
      ...unbound,
      sequence: { ...unbound.sequence, source: { instanceId: ctx.instanceId, port: 'final' } },
    };
    const inputs = pickScaleEvolutionInputs(own, routeState, ctx.instanceId);
    expect(inputs.sequenceOutput).toBeUndefined();
    const evaluation = evaluateScaleEvolution({ intervalText: '3, 2', root: 0 }, inputs, ctx);
    expect(evaluation.resolvedSequence).toBeUndefined();
    expect(evaluation.outputs).toEqual(expectedOutputs([3, 2], 0));
  });

  it('keeps its inputs when an unrelated output changes', () => {
    const bound = {
      ref: { instanceId: 'scale-construction-1', port: 'sequence' },
      label: 'Scale Construction 1 · Sequence',
      packet: packet('list', 'interval', []),
    };
    const routeState = {
      ...unbound,
      sequence: {
        ...unbound.sequence,
        source: { instanceId: 'scale-construction-1', port: 'sequence' },
      },
    };
    const first = pickScaleEvolutionInputs([bound], routeState, ctx.instanceId);
    expect(first.sequenceOutput).toBe(bound);
    const unrelated = {
      ref: { instanceId: 'other', port: 'x' },
      label: 'Other',
      packet: packet('list', 'integer', []),
    };
    const second = pickScaleEvolutionInputs([bound, unrelated], routeState, ctx.instanceId);
    expect(second.sequenceOutput).toBe(first.sequenceOutput);
    expect(second.binding).toBe(first.binding);
  });

  it('a rename keeps every packet', () => {
    const core = computeScaleEvolution({ intervalText: '3, 2', root: 0 }, noInputs, ctx);
    const before = scaleEvolutionOutputs(core, ctx);
    const after = scaleEvolutionOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after.length).toBe(4);
    after.forEach((output, index) => {
      expect(output.packet).toBe(before[index].packet);
      expect(output.label.startsWith('Renamed · ')).toBe(true);
    });
  });
});

describe('moduleEvaluators table (batch 2)', () => {
  it('registers the four batch 2 modules', () => {
    for (const id of [
      'fractioning',
      'pair-composition',
      'scale-construction',
      'scale-evolution',
    ] as const) {
      expect(moduleEvaluators[id]).toBeDefined();
    }
  });
});

describe('a shared memo keeps the parts a root or EDO change does not touch', () => {
  it('Scale Construction: root change keeps sequence, forms and families; pitch classes change', () => {
    const memo = createMemo();
    const ctx = { instanceId: 'scale-construction-1', edo: 12 };
    const state = { intervals: [2, 2, 1], root: 0, permutationMode: 'general' as const };
    const first = computeScaleConstruction(state, {}, ctx, memo);
    const second = computeScaleConstruction({ ...state, root: 5 }, {}, ctx, memo);
    expect(second.sequencePacket).toBe(first.sequencePacket);
    expect(second.melodicFormsOutput).toBe(first.melodicFormsOutput);
    expect(second.families).toBe(first.families);
    expect(second.pitchClassOutput).not.toBe(first.pitchClassOutput);
    expect(second.offsets).not.toBe(first.offsets);
    // An EDO change rebuilds only the pitch classes (offsets depend on intervals and root).
    const third = computeScaleConstruction({ ...state, root: 5 }, {}, { ...ctx, edo: 19 }, memo);
    expect(third.sequencePacket).toBe(first.sequencePacket);
    expect(third.melodicFormsOutput).toBe(first.melodicFormsOutput);
    expect(third.offsets).toBe(second.offsets);
    expect(third.pitchClassOutput).not.toBe(second.pitchClassOutput);
    // Without a shared memo the result is the same, only the identities differ.
    expect(computeScaleConstruction({ ...state, root: 5 }, {}, ctx)).toEqual(second);
  });

  it('Scale Evolution: root and EDO changes keep stages and final; pitch packets change', () => {
    const memo = createMemo();
    const ctx = { instanceId: 'scale-evolution-1', edo: 12 };
    const state = { intervalText: '3, 2', root: 0 };
    const none = pickScaleEvolutionInputs(
      [],
      createDefaultModuleRouteState(modulePorts['scale-evolution'] ?? []),
      ctx.instanceId
    );
    const first = computeScaleEvolution(state, none, ctx, memo);
    const second = computeScaleEvolution({ ...state, root: 3 }, none, ctx, memo);
    expect(second.stagesPacket).toBe(first.stagesPacket);
    expect(second.finalPacket).toBe(first.finalPacket);
    expect(second.stagePitchesPacket).not.toBe(first.stagePitchesPacket);
    expect(second.finalPitchesPacket).not.toBe(first.finalPitchesPacket);
    const third = computeScaleEvolution({ ...state, root: 3 }, none, { ...ctx, edo: 19 }, memo);
    expect(third.stagesPacket).toBe(first.stagesPacket);
    expect(third.finalPacket).toBe(first.finalPacket);
    expect(third.stagePitchesPacket).not.toBe(second.stagePitchesPacket);
    // Retyping the same interval text keeps everything.
    const fourth = computeScaleEvolution(
      { ...state, root: 3, intervalText: '3, 2' },
      none,
      { ...ctx, edo: 19 },
      memo
    );
    expect(fourth).toEqual(third);
    expect(fourth.stagesPacket).toBe(third.stagesPacket);
  });
});
