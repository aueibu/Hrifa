import { describe, expect, it } from 'vitest';
import { arithmeticOperatorDefaults, computeArithmetic } from '../../arithmetic';
import { createDefaultNodeRouteState } from '../../compositionWorkspace';
import { packet } from '../../model';
import { defaultModuloTreatment } from '../../moduloTreatment';
import { interpretPitchList } from '../../pitch';
import { parseRhythmText } from '../../rhythmNotation';
import { rhythmAttacks } from '../../rhythmRealization';
import { nodeEvaluators } from '../nodeEvaluators';
import { nodePorts } from '../nodePorts';
import {
  arithmeticOutputs,
  computeArithmeticNode,
  evaluateArithmetic,
  pickArithmeticInputs,
  type ArithmeticState,
} from './arithmetic';
import { computePitchList, evaluatePitchList, pitchListOutputs } from './pitchList';
import { computeRhythmList, evaluateRhythmList, rhythmListOutputs } from './rhythmList';

// "Today's output" is rebuilt here from the same pure helpers the components called before R2
// (interpretPitchList, parseRhythmText + rhythmAttacks, computeArithmetic), written out as the
// components did it, so a drift in the evaluators shows up as a difference.

describe('evaluatePitchList', () => {
  const ctx = { instanceId: 'pitch-list-1', instanceLabel: 'Pitch List 1', edo: 12 };

  it('matches the old component output for the default state', () => {
    const state = {
      format: 'midi-note' as const,
      inlineValues: '60, 62, 64, 67, 66.5',
      catalogOrigins: {},
    };
    const { outputs, interpreted } = evaluatePitchList(state, {}, ctx);
    const expected = interpretPitchList({
      instanceId: ctx.instanceId,
      format: 'midi-note',
      inlineText: state.inlineValues,
      inlineProvenance: {},
      upstream: undefined,
      edo: 12,
    });
    expect(interpreted).toEqual(expected);
    expect(outputs).toEqual([
      {
        ref: { instanceId: 'pitch-list-1', port: 'pitches' },
        label: 'Pitch List 1 · Pitches',
        packet: expected.packet,
      },
    ]);
    expect(outputs[0].packet).toBe(interpreted.packet);
  });

  it('matches for an edited state with a Forte origin', () => {
    const origin = {
      forteNumber: '3-11',
      primeForm: [0, 3, 7],
      intervalClassVector: [0, 0, 1, 1, 1, 0] as [number, number, number, number, number, number],
      transposition: 2,
      inverted: false,
      pitchClasses: [2, 5, 9],
    };
    const state = {
      format: 'pitch-class' as const,
      inlineValues: '[2 5 9] 7',
      catalogOrigins: { '0': origin },
    };
    const { outputs } = evaluatePitchList(state, {}, { ...ctx, instanceLabel: 'Melody' });
    const expected = interpretPitchList({
      instanceId: ctx.instanceId,
      format: 'pitch-class',
      inlineText: state.inlineValues,
      inlineProvenance: {
        '0': [
          {
            sourceNodeInstance: ctx.instanceId,
            sourceItemIds: [],
            transformation: 'select-forte-set',
            parameters: { ...origin },
          },
        ],
      },
      upstream: undefined,
      edo: 12,
    });
    expect(outputs[0].label).toBe('Melody · Pitches');
    expect(outputs[0].packet).toEqual(expected.packet);
    expect(outputs[0].packet.domain).toBe('pitchClass');
  });
});

describe('evaluateRhythmList', () => {
  const ctx = { instanceId: 'rhythm-list-1', instanceLabel: 'Rhythm List 1' };

  function expectedPacket(text: string, loop: boolean) {
    const parsed = parseRhythmText(text);
    const resolved = rhythmAttacks(parsed.steps, 0, { cyclic: loop });
    return packet<number>(
      'list',
      'duration',
      parsed.steps.map((step, index) => ({
        id: `${ctx.instanceId}:rhythm:${index}`,
        value: step.duration,
        ...(step.tie ? { tie: true } : {}),
        label: step.duration < 0 ? `r${-step.duration}` : `${step.duration}${step.tie ? '~' : ''}`,
        provenance: [
          {
            sourceNodeInstance: ctx.instanceId,
            sourceItemIds: [],
            transformation: 'rhythm-list-read',
            parameters: { text: step.duration < 0 ? `r${-step.duration}` : String(step.duration) },
          },
        ],
      })),
      resolved.warnings,
      { source: 'inline' },
      {
        role: 'interOnset',
        frame: {
          topology: loop ? 'cyclic' : 'linear',
          unit: 'pulse',
          extent: resolved.spanPulses,
          origin: 0,
        },
      }
    );
  }

  it('matches the old output for the default state', () => {
    const { outputs } = evaluateRhythmList({ text: '3 r1 2~ 2 1', loop: true }, {}, ctx);
    expect(outputs).toEqual([
      {
        ref: { instanceId: 'rhythm-list-1', port: 'rhythm' },
        label: 'Rhythm List 1 · Rhythm',
        packet: expectedPacket('3 r1 2~ 2 1', true),
      },
    ]);
  });

  it('matches for an edited state (one-shot, tie off the end)', () => {
    const { outputs } = evaluateRhythmList({ text: '2 1 r2 3~', loop: false }, {}, ctx);
    expect(outputs[0].packet).toEqual(expectedPacket('2 1 r2 3~', false));
    expect(outputs[0].packet.frame?.topology).toBe('linear');
  });

  it('publishes nothing for unreadable or empty text', () => {
    expect(evaluateRhythmList({ text: '3 x 2', loop: true }, {}, ctx).outputs).toEqual([]);
    expect(evaluateRhythmList({ text: '', loop: true }, {}, ctx).outputs).toEqual([]);
  });
});

describe('evaluateArithmetic', () => {
  const ctx = { instanceId: 'arithmetic-1', instanceLabel: 'Arithmetic 1', edo: 12 };
  const unbound = createDefaultNodeRouteState(nodePorts.arithmetic ?? []);
  const defaultState: ArithmeticState = {
    operator: 'add',
    fallbackA: arithmeticOperatorDefaults.add.a,
    fallbackB: arithmeticOperatorDefaults.add.b,
    combineStrategy: 'zip',
    modulo: defaultModuloTreatment,
  };

  it('matches the old output for the default state (both ports unbound)', () => {
    const inputs = pickArithmeticInputs([], unbound, ctx.instanceId);
    const { outputs } = evaluateArithmetic(defaultState, inputs, ctx);
    const expected = computeArithmetic({
      instanceId: ctx.instanceId,
      operator: 'add',
      a: undefined,
      b: undefined,
      fallbackA: Number(defaultState.fallbackA) || 0,
      fallbackB: Number(defaultState.fallbackB) || 0,
      combineStrategy: 'zip',
      modulo: defaultModuloTreatment,
      edo: 12,
    });
    expect(outputs).toEqual([
      {
        ref: { instanceId: 'arithmetic-1', port: 'result' },
        label: 'Arithmetic 1 · Result',
        packet: expected.packet,
      },
    ]);
  });

  it('matches an edited state with a routed rhythm on A', () => {
    const source = evaluateRhythmList(
      { text: '1 2 3', loop: true },
      {},
      { instanceId: 'rhythm-list-1', instanceLabel: 'Rhythm List 1' }
    ).outputs;
    const routeState = {
      ...unbound,
      a: { ...unbound.a, source: { instanceId: 'rhythm-list-1', port: 'rhythm' } },
    };
    const state: ArithmeticState = { ...defaultState, operator: 'multiply', fallbackB: '3' };
    const inputs = pickArithmeticInputs(source, routeState, ctx.instanceId);
    const evaluation = evaluateArithmetic(state, inputs, ctx);
    // Numeric treatment passes the routed packet through untouched.
    const expected = computeArithmetic({
      instanceId: ctx.instanceId,
      operator: 'multiply',
      a: source[0].packet,
      b: undefined,
      fallbackA: Number(state.fallbackA) || 0,
      fallbackB: 3,
      combineStrategy: 'zip',
      modulo: defaultModuloTreatment,
      edo: 12,
    });
    expect(evaluation.treatedA).toBe(source[0].packet);
    expect(evaluation.treatedB).toBeUndefined();
    expect(evaluation.outputs[0].packet).toEqual(expected.packet);
    expect(evaluation.outputs[0].packet.items.map((item) => item.value)).toEqual([3, 6, 9]);
  });

  it('reads a binding to itself as disconnected', () => {
    const own = evaluateArithmetic(
      defaultState,
      pickArithmeticInputs([], unbound, ctx.instanceId),
      ctx
    ).outputs;
    const routeState = {
      ...unbound,
      a: { ...unbound.a, source: { instanceId: ctx.instanceId, port: 'result' } },
    };
    const inputs = pickArithmeticInputs(own, routeState, ctx.instanceId);
    expect(inputs.outputA).toBeUndefined();
  });

  it('keeps its inputs when an unrelated output changes', () => {
    const boundOutput = {
      ref: { instanceId: 'rhythm-list-1', port: 'rhythm' },
      label: 'Rhythm List 1 · Rhythm',
      packet: packet('list', 'duration', []),
    };
    const routeState = {
      ...unbound,
      a: { ...unbound.a, source: { instanceId: 'rhythm-list-1', port: 'rhythm' } },
    };
    const a = pickArithmeticInputs([boundOutput], routeState, ctx.instanceId);
    expect(a.outputA).toBe(boundOutput);
    const unrelated = {
      ref: { instanceId: 'other', port: 'x' },
      label: 'Other',
      packet: packet('list', 'integer', []),
    };
    const b = pickArithmeticInputs([boundOutput, unrelated], routeState, ctx.instanceId);
    expect(b.outputA).toBe(a.outputA);
    expect(b.bindingA).toBe(a.bindingA);
    expect(b.outputB).toBeUndefined();
  });
});

describe('a rename keeps the packet', () => {
  it('Pitch List: only the label of the output changes', () => {
    const state = { format: 'midi-note' as const, inlineValues: '60 62', catalogOrigins: {} };
    const ctx = { instanceId: 'pitch-list-1', instanceLabel: 'Pitch List 1', edo: 12 };
    const core = computePitchList(state, {}, ctx);
    const before = pitchListOutputs(core, ctx);
    const after = pitchListOutputs(core, { ...ctx, instanceLabel: 'Melody' });
    expect(after[0].packet).toBe(before[0].packet);
    expect(after[0].label).toBe('Melody · Pitches');
  });

  it('Rhythm List and Arithmetic: same split', () => {
    const rctx = { instanceId: 'rhythm-list-1', instanceLabel: 'Rhythm List 1' };
    const rcore = computeRhythmList({ text: '1 2', loop: true }, {}, rctx);
    expect(rhythmListOutputs(rcore, { ...rctx, instanceLabel: 'R' })[0].packet).toBe(
      rhythmListOutputs(rcore, rctx)[0].packet
    );
    const actx = { instanceId: 'arithmetic-1', instanceLabel: 'Arithmetic 1', edo: 12 };
    const unbound = createDefaultNodeRouteState(nodePorts.arithmetic ?? []);
    const acore = computeArithmeticNode(
      {
        operator: 'add',
        fallbackA: 0,
        fallbackB: 0,
        combineStrategy: 'zip',
        modulo: defaultModuloTreatment,
      },
      pickArithmeticInputs([], unbound, actx.instanceId),
      actx
    );
    expect(arithmeticOutputs(acore, { ...actx, instanceLabel: 'A' })[0].packet).toBe(
      arithmeticOutputs(acore, actx)[0].packet
    );
  });
});

describe('nodeEvaluators table', () => {
  // The nodes ported to evaluators so far (R2 adds to this list batch by batch).
  it('registers every ported node', () => {
    expect(Object.keys(nodeEvaluators).sort()).toEqual([
      'arithmetic',
      'data-block-source',
      'fractioning',
      'interference',
      'melodicization',
      'pair-composition',
      'pitch-list',
      'rhythm-edit',
      'rhythm-householder',
      'rhythm-list',
      'scale-construction',
      'scale-evolution',
      'swirling-mists',
    ]);
  });
});
