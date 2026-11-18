import { describe, expect, it } from 'vitest';
import type { PublishedCompositionOutput } from '../../compositionRouting';
import { createDefaultModuleRouteState } from '../../compositionWorkspace';
import {
  householderCandidatesPacket,
  householderSelectedPacket,
  reflectAxisPreset,
  reflectRhythm,
} from '../../householder';
import {
  generateInterference,
  generatorPeriod,
  groupingOptions,
  interferenceDurationPacket,
  interferenceGeneratorDurationPacket,
  parseGeneratorValues,
} from '../../interference';
import {
  buildMistField,
  defaultMistSettings,
  mistChordsPacket,
  mistVoicesPacket,
  sampleMist,
} from '../../mist';
import { packet } from '../../model';
import { editRhythm } from '../../rhythmEdit';
import { signalTypeRegistry } from '../../signalTypes';
import { createMemo } from '../memo';
import { moduleEvaluators } from '../moduleEvaluators';
import { modulePorts } from '../modulePorts';
import {
  computeHouseholder,
  defaultHouseholderSettings,
  evaluateHouseholder,
  householderOutputs,
  pickHouseholderInputs,
} from './householder';
import {
  computeInterference,
  evaluateInterference,
  interferenceOutputs,
  type GeneratorDraft,
} from './interference';
import {
  computeRhythmEdit,
  evaluateRhythmEdit,
  pickRhythmEditInputs,
  rhythmEditOutputs,
  type EditSettings,
  type RhythmEditState,
} from './rhythmEdit';
import { evaluateRhythmList } from './rhythmList';
import { computeSwirlingMists, evaluateSwirlingMists, swirlingMistsOutputs } from './swirlingMists';

// "Today's output" is rebuilt from the same pure helpers the components called at HEAD
// (parseGeneratorValues + generateInterference + groupingOptions + the interference packet helpers;
// buildMistField + sampleMist + mistChordsPacket / mistVoicesPacket; signalTypeRegistry.apply +
// reflectRhythm / householderSelectedPacket / householderCandidatesPacket; editRhythm), written out
// as the components did it.

const drafts: GeneratorDraft[] = [
  { id: 'generator-a', label: 'Generator 1', valueText: '2' },
  { id: 'generator-b', label: 'Generator 2', valueText: '3' },
  { id: 'generator-c', label: 'Generator 3', valueText: '5' },
];

describe('evaluateInterference', () => {
  const ctx = { instanceId: 'interference-1', instanceLabel: 'Interference 1' };

  function expectedOutputs(list: GeneratorDraft[], groupingId: string, label = ctx.instanceLabel) {
    const patterns = list.map((draft) => parseGeneratorValues(draft.valueText).values);
    const result = generateInterference(patterns);
    const groupings = groupingOptions(patterns.map(generatorPeriod), result.recurrence);
    const grouping = groupings.find((option) => option.id === groupingId) ?? groupings[0];
    return [
      {
        ref: { instanceId: ctx.instanceId, port: 'resultant' },
        label: `${label} · Resultant`,
        packet: interferenceDurationPacket(result, list, grouping),
      },
      ...list.flatMap((draft, index) =>
        patterns[index].length
          ? [
              {
                ref: { instanceId: ctx.instanceId, port: `generator:${draft.id}` },
                label: `${label} · ${draft.label}`,
                packet: interferenceGeneratorDurationPacket(patterns[index], draft, index),
              },
            ]
          : []
      ),
    ];
  }

  it('matches the old component output for the default state', () => {
    const evaluation = evaluateInterference({ drafts, groupingId: 'recurrence' }, {}, ctx);
    expect(evaluation.outputs).toEqual(expectedOutputs(drafts, 'recurrence'));
    expect(evaluation.outputs).toHaveLength(4);
    expect(evaluation.patterns).toEqual([[2], [3], [5]]);
  });

  it('matches an edited state: an edited generator and another grouping', () => {
    const edited = [
      { ...drafts[0], valueText: '3 1' },
      { ...drafts[1], valueText: '2' },
      { ...drafts[2], valueText: '5' },
    ];
    const base = evaluateInterference({ drafts: edited, groupingId: 'recurrence' }, {}, ctx);
    const other = base.groupings.find((option) => option.id !== 'recurrence');
    const groupingId = other ? other.id : 'recurrence';
    const evaluation = evaluateInterference({ drafts: edited, groupingId }, {}, ctx);
    expect(evaluation.outputs).toEqual(expectedOutputs(edited, groupingId));
  });

  it('with an empty generator the resultant fails but the other generators still publish', () => {
    const edited = [drafts[0], drafts[1], { ...drafts[2], valueText: '' }];
    const evaluation = evaluateInterference({ drafts: edited, groupingId: 'recurrence' }, {}, ctx);
    expect(typeof evaluation.generated.error).toBe('string');
    expect(evaluation.outputs).toEqual(
      [0, 1].map((index) => ({
        ref: { instanceId: ctx.instanceId, port: `generator:${edited[index].id}` },
        label: `${ctx.instanceLabel} · ${edited[index].label}`,
        packet: interferenceGeneratorDurationPacket(
          parseGeneratorValues(edited[index].valueText).values,
          edited[index],
          index
        ),
      }))
    );
  });

  it('reports an error and publishes no resultant when generating fails', () => {
    const invalid = evaluateInterference(
      { drafts: [{ ...drafts[0], valueText: 'x' }], groupingId: 'recurrence' },
      {},
      ctx
    );
    expect(typeof invalid.generated.error).toBe('string');
    expect(invalid.outputPacket).toBeUndefined();
    expect(invalid.groupings).toEqual([]);
  });

  it('a rename keeps every packet', () => {
    const core = computeInterference({ drafts, groupingId: 'recurrence' }, {}, ctx);
    const before = interferenceOutputs(core, ctx);
    const after = interferenceOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after).toHaveLength(before.length);
    after.forEach((output, index) => {
      expect(output.packet).toBe(before[index].packet);
      expect(output.label.startsWith('Renamed · ')).toBe(true);
    });
  });

  it('a shared memo: a grouping change keeps the generators and the generated result', () => {
    const memo = createMemo();
    const first = computeInterference({ drafts, groupingId: 'recurrence' }, {}, ctx, memo);
    const other = first.groupings.find((option) => option.id !== 'recurrence');
    expect(other).toBeDefined();
    const second = computeInterference({ drafts, groupingId: other!.id }, {}, ctx, memo);
    expect(second.authored).toBe(first.authored);
    expect(second.generated).toBe(first.generated);
    expect(second.groupings).toBe(first.groupings);
    expect(second.generatorPackets).toBe(first.generatorPackets);
    expect(second.outputPacket).not.toBe(first.outputPacket);
    // Editing a generator changes everything it feeds.
    const edited = drafts.map((draft, index) =>
      index === 0 ? { ...draft, valueText: '4' } : draft
    );
    const third = computeInterference({ drafts: edited, groupingId: 'recurrence' }, {}, ctx, memo);
    expect(third.generatorPackets).not.toBe(first.generatorPackets);
    expect(third.generated).not.toBe(first.generated);
  });
});

describe('evaluateSwirlingMists', () => {
  const ctx = { instanceId: 'swirling-mists-1', instanceLabel: 'Swirling Mists 1' };

  function expectedOutputs(settings = defaultMistSettings(), label = ctx.instanceLabel) {
    const field = buildMistField(settings);
    const sampling = sampleMist(settings, field);
    return sampling.strataIndices.length && sampling.positions.length
      ? [
          {
            ref: { instanceId: ctx.instanceId, port: 'chords' },
            label: `${label} · Chords`,
            packet: mistChordsPacket(ctx.instanceId, settings, sampling),
          },
          {
            ref: { instanceId: ctx.instanceId, port: 'voices' },
            label: `${label} · Voices`,
            packet: mistVoicesPacket(ctx.instanceId, settings, sampling),
          },
        ]
      : [];
  }

  it('matches the old component output for the default state', () => {
    const settings = defaultMistSettings();
    const evaluation = evaluateSwirlingMists({ settings }, {}, ctx);
    expect(evaluation.outputs).toEqual(expectedOutputs(settings));
    expect(evaluation.outputs).toHaveLength(2);
  });

  it('matches an edited state, and publishes nothing with every stratum off', () => {
    const base = defaultMistSettings();
    const settings = { ...base, steps: base.steps + 3 };
    expect(evaluateSwirlingMists({ settings }, {}, ctx).outputs).toEqual(expectedOutputs(settings));
    const off = {
      ...base,
      strata: base.strata.map((stratum) => ({ ...stratum, enabled: false })),
    };
    expect(evaluateSwirlingMists({ settings: off }, {}, ctx).outputs).toEqual([]);
    expect(expectedOutputs(off)).toEqual([]);
  });

  it('a rename keeps every packet', () => {
    const core = computeSwirlingMists({ settings: defaultMistSettings() }, {}, ctx);
    const before = swirlingMistsOutputs(core, ctx);
    const after = swirlingMistsOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after.map((output) => output.label)).toEqual(['Renamed · Chords', 'Renamed · Voices']);
    after.forEach((output, index) => expect(output.packet).toBe(before[index].packet));
  });

  it('a shared memo: the same settings object keeps field, sampling and both packets', () => {
    const memo = createMemo();
    const settings = defaultMistSettings();
    const first = computeSwirlingMists({ settings }, {}, ctx, memo);
    const second = computeSwirlingMists({ settings }, {}, ctx, memo);
    expect(second).toEqual(first);
    expect(second.field).toBe(first.field);
    expect(second.sampling).toBe(first.sampling);
    expect(second.chords).toBe(first.chords);
    expect(second.voices).toBe(first.voices);
    const third = computeSwirlingMists({ settings: { ...settings } }, {}, ctx, memo);
    expect(third.chords).not.toBe(first.chords);
  });
});

// The rhythm source for Householder and Rhythm Edit: a real Rhythm List output (an inter-onset
// duration list), published under its own ref and bound through a real route state.
const sourceCtx = { instanceId: 'rhythm-list-1', instanceLabel: 'Rhythm List 1' };
const sourceOutputs = evaluateRhythmList({ text: '2 1 1 2 1 1 2', loop: true }, {}, sourceCtx)
  .outputs satisfies PublishedCompositionOutput[];
const unrelatedOutput: PublishedCompositionOutput = {
  ref: { instanceId: 'other', port: 'x' },
  label: 'Other',
  packet: packet('list', 'integer', []),
};

function boundState(
  moduleId: 'rhythm-householder' | 'rhythm-edit',
  bindings: Record<string, { instanceId: string; port: string }>
) {
  const state = createDefaultModuleRouteState(modulePorts[moduleId] ?? []);
  for (const [port, source] of Object.entries(bindings)) {
    state[port] = { ...state[port], source };
  }
  return state;
}

const sourceRef = { instanceId: sourceCtx.instanceId, port: 'rhythm' };

describe('evaluateHouseholder', () => {
  const ctx = { instanceId: 'householder-1', instanceLabel: 'Rhythm Householder 1', edo: 12 };
  const unbound = createDefaultModuleRouteState(modulePorts['rhythm-householder'] ?? []);
  const bound = boundState('rhythm-householder', { rhythm: sourceRef });
  const state = { settings: defaultHouseholderSettings, selectedIndex: 0 };

  function treated(routeState = bound) {
    const binding = routeState.rhythm;
    return signalTypeRegistry[binding.signalType].apply(
      sourceOutputs[0].packet,
      binding.treatment,
      `route:${ctx.instanceId}:rhythm`,
      ctx.edo
    ) as ReturnType<typeof packet<number>>;
  }

  it('publishes nothing and reports the empty-input error when no rhythm is connected', () => {
    const evaluation = evaluateHouseholder(
      state,
      pickHouseholderInputs([], unbound, ctx.instanceId),
      ctx
    );
    expect(evaluation.outputs).toEqual([]);
    expect(evaluation.computed.error).toBe('Connect a rhythm to alter.');
    expect(evaluation.rhythm).toBeUndefined();
  });

  it('matches the old component output for the default (reflect) state', () => {
    const input = treated();
    const inputs = pickHouseholderInputs(sourceOutputs, bound, ctx.instanceId);
    expect(inputs.rhythmOutput).toBe(sourceOutputs[0]);
    const evaluation = evaluateHouseholder(state, inputs, ctx);
    const durations = input.items.map((item) => Number(item.value));
    const settings = defaultHouseholderSettings;
    const axis = reflectAxisPreset(settings.reflectPreset as 'swing', durations.length);
    const result = reflectRhythm({
      durations,
      axis,
      coefficient: settings.reflectCoefficient,
      grid: settings.grid,
      minUnits: settings.minUnits,
      steps: settings.reflectSteps,
    });
    const parameters = {
      axis: settings.reflectPreset,
      axisValues: axis,
      coefficient: settings.reflectCoefficient,
      grid: settings.grid,
      minUnits: settings.minUnits,
    };
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(evaluation.outputs).toEqual([
      {
        ref: { instanceId: ctx.instanceId, port: 'selected' },
        label: 'Rhythm Householder 1 · Selected',
        packet: householderSelectedPacket(
          result.candidates[0],
          input,
          result.warnings,
          ctx.instanceId,
          'householder-reflect',
          { ...parameters, candidate: 0 }
        ),
      },
      {
        ref: { instanceId: ctx.instanceId, port: 'candidates' },
        label: 'Rhythm Householder 1 · Candidates',
        packet: householderCandidatesPacket(
          result.candidates,
          input,
          result.warnings,
          ctx.instanceId,
          'householder-reflect',
          parameters
        ),
      },
    ]);
  });

  it('matches an edited state: a later candidate selected (clamped) with a custom axis', () => {
    const input = treated();
    const settings = { ...defaultHouseholderSettings, reflectPreset: 'custom' as const };
    const inputs = pickHouseholderInputs(sourceOutputs, bound, ctx.instanceId);
    const evaluation = evaluateHouseholder({ settings, selectedIndex: 99 }, inputs, ctx);
    const durations = input.items.map((item) => Number(item.value));
    const axis = [1, 0, -1];
    const result = reflectRhythm({
      durations,
      axis,
      coefficient: settings.reflectCoefficient,
      grid: settings.grid,
      minUnits: settings.minUnits,
      steps: settings.reflectSteps,
    });
    const last = result.candidates.length - 1;
    expect(evaluation.clampedIndex).toBe(last);
    const parameters = {
      axis: 'custom',
      axisValues: axis,
      coefficient: settings.reflectCoefficient,
      grid: settings.grid,
      minUnits: settings.minUnits,
    };
    expect(evaluation.outputs[0].packet).toEqual(
      householderSelectedPacket(
        result.candidates[last],
        input,
        result.warnings,
        ctx.instanceId,
        'householder-reflect',
        { ...parameters, candidate: last }
      )
    );
    expect(evaluation.outputs[1].packet).toEqual(
      householderCandidatesPacket(
        result.candidates,
        input,
        result.warnings,
        ctx.instanceId,
        'householder-reflect',
        parameters
      )
    );
  });

  it('keeps its inputs, picked by identity, when an unrelated output changes', () => {
    const first = pickHouseholderInputs(sourceOutputs, bound, ctx.instanceId);
    const second = pickHouseholderInputs(
      [...sourceOutputs, unrelatedOutput],
      bound,
      ctx.instanceId
    );
    expect(first.rhythmOutput).toBe(sourceOutputs[0]);
    expect(second.rhythmOutput).toBe(first.rhythmOutput);
    expect(second.bindingRhythm).toBe(first.bindingRhythm);
    expect(second.axisOutput).toBeUndefined();
  });

  it('reads a binding to itself as disconnected, per port', () => {
    const own: PublishedCompositionOutput[] = [
      {
        ref: { instanceId: ctx.instanceId, port: 'selected' },
        label: 'own',
        packet: sourceOutputs[0].packet,
      },
    ];
    const routeState = boundState('rhythm-householder', {
      rhythm: { instanceId: ctx.instanceId, port: 'selected' },
      axis: sourceRef,
    });
    const inputs = pickHouseholderInputs([...own, ...sourceOutputs], routeState, ctx.instanceId);
    expect(inputs.rhythmOutput).toBeUndefined();
    expect(inputs.axisOutput).toBe(sourceOutputs[0]);
    const evaluation = evaluateHouseholder(state, inputs, ctx);
    expect(evaluation.rhythm).toBeUndefined();
    expect(evaluation.outputs).toEqual([]);
  });

  it('a rename keeps every packet', () => {
    const inputs = pickHouseholderInputs(sourceOutputs, bound, ctx.instanceId);
    const core = computeHouseholder(state, inputs, ctx);
    const before = householderOutputs(core, ctx);
    const after = householderOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after).toHaveLength(2);
    after.forEach((output, index) => {
      expect(output.packet).toBe(before[index].packet);
      expect(output.label.startsWith('Renamed · ')).toBe(true);
    });
  });

  it('a shared memo: another selected candidate keeps the candidates packet; a setting change rebuilds both', () => {
    const memo = createMemo();
    const inputs = pickHouseholderInputs(sourceOutputs, bound, ctx.instanceId);
    const fine = { ...defaultHouseholderSettings, grid: 4 };
    const first = computeHouseholder({ settings: fine, selectedIndex: 0 }, inputs, ctx, memo);
    expect(first.computed.candidates.length).toBeGreaterThan(1);
    const second = computeHouseholder({ settings: fine, selectedIndex: 1 }, inputs, ctx, memo);
    expect(second.computed).toBe(first.computed);
    expect(second.candidatesPacket).toBe(first.candidatesPacket);
    expect(second.selectedPacket).not.toBe(first.selectedPacket);
    // An edo change only re-treats the routed packets, never the settings.
    const third = computeHouseholder(
      { settings: fine, selectedIndex: 1 },
      inputs,
      { ...ctx, edo: 19 },
      memo
    );
    expect(third.computed).not.toBe(second.computed);
    expect(third.candidatesPacket).toBeDefined();
    const fourth = computeHouseholder(
      { settings: { ...fine }, selectedIndex: 1 },
      inputs,
      { ...ctx, edo: 19 },
      memo
    );
    expect(fourth.computed).not.toBe(third.computed);
    expect(fourth.candidatesPacket).not.toBe(third.candidatesPacket);
  });
});

describe('evaluateRhythmEdit', () => {
  const ctx = { instanceId: 'rhythm-edit-1', instanceLabel: 'Rhythm Edit 1', edo: 12 };
  const unbound = createDefaultModuleRouteState(modulePorts['rhythm-edit'] ?? []);
  const bound = boundState('rhythm-edit', { rhythm: sourceRef });
  const editSettings: EditSettings = {
    programPhase: 0,
    programRate: 1,
    lengthPhase: 0,
    lengthRate: 1,
    nStart: 1,
    nChange: 1,
    nEvery: 1,
  };
  const state = {
    mode: 'program' as const,
    program: '[x,2][r,1]',
    rules: 'every 3: r',
    lengths: '',
    grouping: 'drop' as const,
    editSettings,
  };

  function expectedEdit(s: RhythmEditState) {
    const binding = bound.rhythm;
    const input = signalTypeRegistry[binding.signalType].apply(
      sourceOutputs[0].packet,
      binding.treatment,
      `route:${ctx.instanceId}:rhythm`,
      ctx.edo
    );
    return editRhythm({
      instanceId: ctx.instanceId,
      source: input,
      mode: s.mode,
      program: s.program,
      programTiming: { phase: s.editSettings.programPhase, rate: s.editSettings.programRate },
      rules: s.rules,
      lengths: s.lengths,
      lengthTiming: { phase: s.editSettings.lengthPhase, rate: s.editSettings.lengthRate },
      variable: {
        start: s.editSettings.nStart,
        change: s.editSettings.nChange,
        every: s.editSettings.nEvery,
      },
      grouping: s.grouping,
    });
  }

  it('publishes nothing when no rhythm is connected', () => {
    const evaluation = evaluateRhythmEdit(
      state,
      pickRhythmEditInputs([], unbound, ctx.instanceId),
      ctx
    );
    expect(evaluation.outputs).toEqual([]);
    expect(evaluation.input).toBeUndefined();
    expect(evaluation.treated).toBeUndefined();
  });

  it('matches the old component output for the default state', () => {
    const inputs = pickRhythmEditInputs(sourceOutputs, bound, ctx.instanceId);
    expect(inputs.rhythmOutput).toBe(sourceOutputs[0]);
    const evaluation = evaluateRhythmEdit(state, inputs, ctx);
    const expected = expectedEdit(state);
    expect(expected.packet).toBeDefined();
    expect(evaluation.edited).toEqual(expected);
    expect(evaluation.outputs).toEqual([
      {
        ref: { instanceId: ctx.instanceId, port: 'rhythm' },
        label: 'Rhythm Edit 1 · Rhythm',
        packet: expected.packet,
      },
    ]);
  });

  it('matches an edited state (rules mode, a length program, keep grouping)', () => {
    const edited = {
      ...state,
      mode: 'rules' as const,
      rules: 'every 2: r',
      lengths: '[*2,1][o,1]',
      grouping: 'keep' as const,
      editSettings: { ...editSettings, lengthRate: 2, nStart: 2 },
    };
    const inputs = pickRhythmEditInputs(sourceOutputs, bound, ctx.instanceId);
    const evaluation = evaluateRhythmEdit(edited, inputs, ctx);
    const expected = expectedEdit(edited);
    expect(evaluation.edited).toEqual(expected);
    expect(evaluation.outputs.map((output) => output.packet)).toEqual(
      expected.packet ? [expected.packet] : []
    );
  });

  it('keeps its inputs when an unrelated output changes', () => {
    const first = pickRhythmEditInputs(sourceOutputs, bound, ctx.instanceId);
    const second = pickRhythmEditInputs([...sourceOutputs, unrelatedOutput], bound, ctx.instanceId);
    expect(second.rhythmOutput).toBe(first.rhythmOutput);
    expect(second.binding).toBe(first.binding);
  });

  it('reads a binding to itself as disconnected', () => {
    const own: PublishedCompositionOutput[] = [
      {
        ref: { instanceId: ctx.instanceId, port: 'rhythm' },
        label: 'own',
        packet: sourceOutputs[0].packet,
      },
    ];
    const routeState = boundState('rhythm-edit', {
      rhythm: { instanceId: ctx.instanceId, port: 'rhythm' },
    });
    const inputs = pickRhythmEditInputs(own, routeState, ctx.instanceId);
    expect(inputs.rhythmOutput).toBeUndefined();
    const evaluation = evaluateRhythmEdit(state, inputs, ctx);
    expect(evaluation.input).toBeUndefined();
    expect(evaluation.outputs).toEqual([]);
  });

  it('a rename keeps the packet', () => {
    const inputs = pickRhythmEditInputs(sourceOutputs, bound, ctx.instanceId);
    const core = computeRhythmEdit(state, inputs, ctx);
    const before = rhythmEditOutputs(core, ctx);
    const after = rhythmEditOutputs(core, { ...ctx, instanceLabel: 'Renamed' });
    expect(after[0].packet).toBe(before[0].packet);
    expect(after[0].label).toBe('Renamed · Rhythm');
  });

  it('a shared memo: same state keeps the edit; a program change keeps the treated input and rebuilds the edit', () => {
    const memo = createMemo();
    const inputs = pickRhythmEditInputs(sourceOutputs, bound, ctx.instanceId);
    const first = computeRhythmEdit(state, inputs, ctx, memo);
    const same = computeRhythmEdit({ ...state }, inputs, ctx, memo);
    expect(same.edited).toBe(first.edited);
    const changed = computeRhythmEdit({ ...state, program: '[x,1][r,2]' }, inputs, ctx, memo);
    expect(changed.treated).toBe(first.treated);
    expect(changed.input).toBe(first.input);
    expect(changed.edited).not.toBe(first.edited);
  });
});

describe('moduleEvaluators table (batch 3)', () => {
  it('registers the four batch 3 modules', () => {
    for (const id of [
      'interference',
      'swirling-mists',
      'rhythm-householder',
      'rhythm-edit',
    ] as const) {
      expect(moduleEvaluators[id]).toBeDefined();
    }
  });
});
